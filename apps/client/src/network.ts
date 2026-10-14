import { Client, type Room } from "@colyseus/sdk";
import {
  PROTOCOL,
  type Command,
  type Guild,
  type Notice,
  type Snapshot,
  type CombatEvent,
} from "../../../packages/contracts/game";
import {
  SESSION_SUPERSEDED,
  type JoinOptions,
  type Welcome,
} from "../../../packages/contracts/session";
import { LocalConnection } from "./local-world";
import { retainEvents } from "./events";
import { HOSTED, buildEnv, type BuildEnv } from "./build-flags";

export type ConnectionMode = "solo" | "server";
export type Intent = Command extends infer C
  ? C extends Command
    ? Omit<C, "seq">
    : never
  : never;
/** What the status banner offers: a spinner, a page reload, or (default) Reconnect. */
export type StatusAction = "reconnect" | "reload" | "wait";
/** What the client needs from a world host, in the page or over Colyseus. */
export interface GameConnection {
  readonly mode: ConnectionMode;
  /** Last measured round trip to the server in milliseconds (multiplayer only). */
  readonly latencyMs?: number | null;
  onSnapshot: (snapshot: Snapshot) => void;
  onNotice: (notice: Notice) => void;
  onStatus: (status: string, action?: StatusAction) => void;
  join(name: string, guild: Guild): Promise<void>;
  send(command: Intent): void;
  leave(): void;
}

export const DEFAULT_SERVER = "http://127.0.0.1:2567";
export const SUPERSEDED_STATUS =
  "This traveller is now playing in another tab or window.";
const UPDATED_STATUS =
  "THREEFOLD has been updated. Reload to get the new version.";
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);
const TOKEN_KEY = "threefold-token";
const INVITE_KEY = "threefold-invite";
const REJOIN_SECONDS = [1, 2, 4, 8, 15];
const GIVE_UP_MS = 5 * 60_000;
const PING_EVERY_MS = 10_000;
/** Close code of a leave the client or server asked for. */
const CONSENTED = 4000;

/**
 * `?server` or `?mode=server` selects multiplayer; everything else plays solo.
 * The hosted playtest build always plays multiplayer.
 */
export function preferredMode(
  search?: string,
  hosted = HOSTED,
): ConnectionMode {
  if (hosted) return "server";
  const query =
    search ?? (typeof location !== "undefined" ? location.search : "");
  const params = new URLSearchParams(query);
  return params.has("server") || params.get("mode") === "server"
    ? "server"
    : "solo";
}

export function createConnection(mode: ConnectionMode): GameConnection {
  return mode === "server" ? new Connection() : new LocalConnection();
}

const httpOrigin = (value: string | null | undefined): string | null => {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.origin
      : null;
  } catch {
    return null;
  }
};

/**
 * Where multiplayer connects, in order: the page's own origin in the hosted
 * build, where page and server ship together; the build's VITE_SERVER_URL; a
 * `?server=` address, only from a loopback page or for an origin in
 * VITE_SERVER_ALLOWLIST, so a link can't send testers to another server; the
 * local development server.
 */
export function serverEndpoint(
  page: Pick<Location, "origin" | "hostname" | "search">,
  env: BuildEnv = buildEnv(),
  hosted = HOSTED,
): string {
  if (hosted) return page.origin;
  const configured = httpOrigin(env.serverUrl);
  if (configured) return configured;
  const linked = httpOrigin(new URLSearchParams(page.search).get("server"));
  if (
    linked &&
    (LOOPBACK.has(page.hostname) ||
      env.allowlist.some((origin) => httpOrigin(origin) === linked))
  )
    return linked;
  return DEFAULT_SERVER;
}

type KeyStore = Pick<Storage, "getItem" | "setItem">;
// Used when the browser refuses storage, so this page keeps one identity.
const pageMemory = new Map<string, string>();
function webStorage(kind: "localStorage" | "sessionStorage"): KeyStore | null {
  try {
    return (globalThis as Partial<Record<typeof kind, Storage>>)[kind] ?? null;
  } catch {
    return null;
  }
}
/**
 * The hosted build keeps the identity in localStorage, so a character
 * survives closing the tab. Development keeps it per tab (sessionStorage), so
 * several local tabs are separate travellers.
 */
function identityStores(hosted = HOSTED): KeyStore[] {
  const stores = hosted
    ? [webStorage("localStorage"), webStorage("sessionStorage")]
    : [webStorage("sessionStorage")];
  return stores.filter((s): s is KeyStore => s !== null);
}

/** This browser's anonymous traveller token: 64 hex characters, created once. */
export function identityToken(stores = identityStores()): string {
  for (const store of stores)
    try {
      const token = store.getItem(TOKEN_KEY);
      if (token && /^[a-f0-9]{64}$/.test(token)) return token;
    } catch {
      // Try the next store.
    }
  // A token this page already made (storage was refused) is kept, and saved
  // as soon as a store accepts it.
  let token = pageMemory.get(TOKEN_KEY);
  if (!token) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    token = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  for (const store of stores)
    try {
      store.setItem(TOKEN_KEY, token);
      return token;
    } catch {
      // Full or refused: fall back to the next store, then page memory.
    }
  pageMemory.set(TOKEN_KEY, token);
  return token;
}

/** This tab's reconnect token in development builds (sessionStorage). */
export const sessionToken = (): string => identityToken();

/** The personal playtest key this browser sends with each join. */
export function readInvite(
  store: KeyStore | null = webStorage("localStorage"),
): string {
  const remembered = pageMemory.get(INVITE_KEY);
  if (remembered !== undefined) return remembered;
  try {
    return store?.getItem(INVITE_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function writeInvite(
  value: string,
  store: KeyStore | null = webStorage("localStorage"),
) {
  const key = value.trim();
  pageMemory.set(INVITE_KEY, key);
  try {
    store?.setItem(INVITE_KEY, key);
  } catch {
    // Private windows may refuse storage; the key still works on this page.
  }
}

/**
 * A `#invite=KEY` link fills in the key once and is then removed from the
 * address bar. Browsers never send fragments to servers.
 */
export function inviteFromFragment(
  page: Pick<Location, "hash" | "pathname" | "search"> = location,
  pageHistory: Pick<History, "replaceState"> = history,
): string | null {
  const match = /^#invite=([A-Za-z0-9_-]{1,128})$/.exec(page.hash);
  if (!match) return null;
  writeInvite(match[1]);
  try {
    pageHistory.replaceState(null, "", page.pathname + page.search);
  } catch {
    // The key is stored; leaving the fragment in place is harmless.
  }
  return match[1];
}

/** Milliseconds before rejoin attempt n (from 1): 1, 2, 4, 8, then 15 s, each ±20%. */
export function rejoinDelay(attempt: number, random = Math.random): number {
  const step = Math.min(
    Math.max(1, Math.floor(attempt)),
    REJOIN_SECONDS.length,
  );
  return REJOIN_SECONDS[step - 1] * (0.8 + random() * 0.4) * 1000;
}

export type JoinFailure = {
  /** Why, in the server's words; null when the server wasn't reached. */
  message: string | null;
  /** Retrying can't help: stop and show the message. */
  permanent: boolean;
};
/**
 * The server refuses for good with 525 (bad invite, name, identity or
 * version) and asks for a retry with 503 or 429. A 403 means the page's
 * address isn't on the server's origin list. Anything else is the network.
 */
export function joinFailure(error: unknown): JoinFailure {
  const code = (error as { code?: unknown } | null)?.code;
  const message =
    error instanceof Error && error.message ? error.message : null;
  if (code === 525)
    return {
      message: message ?? "Highcross refused this traveller.",
      permanent: true,
    };
  if (code === 403)
    return {
      message:
        "Highcross doesn’t accept connections from this page’s address. Ask your host.",
      permanent: true,
    };
  if (code === 503 || code === 429) return { message, permanent: false };
  return { message: null, permanent: false };
}

/** Most basic attacks a held F sends in any second, leaving room for abilities. */
export const BASIC_REPEATS_PER_SECOND = 7;

/**
 * Held F repeats the basic attack. Around the moment its cooldown ends it
 * goes out on every 70 ms input tick, so the attack lands as soon as it can.
 * Otherwise (no target, out of range) it repeats at most every 140 ms. Either
 * way, no more than BASIC_REPEATS_PER_SECOND go out in any second
 * (`sentLastSecond`), so a held key stays inside the server's 10 actions a
 * second and abilities pressed meanwhile still get through.
 */
export function basicRepeatDue(
  serverNow: number,
  readyAt: number | undefined,
  sinceLastMs: number,
  rttMs?: number | null,
  sentLastSecond = 0,
): boolean {
  if (sentLastSecond >= BASIC_REPEATS_PER_SECOND) return false;
  const ready = readyAt ?? 0;
  // Snapshots trail the server by up to 0.1 s plus half a round trip, and
  // the command needs the other half: start that much early.
  const lead = 0.12 + Math.min(0.3, (rttMs ?? 100) / 1000);
  if (serverNow + lead < ready) return false;
  return serverNow - ready < 0.25 || sinceLastMs >= 140;
}

export class Connection implements GameConnection {
  readonly mode = "server";
  room: Room | null = null;
  latencyMs: number | null = null;
  private seq = 0;
  private recentEvents: CombatEvent[] = [];
  private client: Client;
  private profile: { name: string; guild: Guild } | null = null;
  /** The server release this page first joined; a new one offers a reload. */
  private release: string | null = null;
  private updated = false;
  /** Bumped by join and leave; callbacks from an older attempt do nothing. */
  private attempt = 0;
  private rejoins = 0;
  private rejoinSince = 0;
  private rejoinTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  onSnapshot: (snapshot: Snapshot) => void = () => {};
  onNotice: (notice: Notice) => void = () => {};
  onStatus: (status: string, action?: StatusAction) => void = () => {};

  constructor(
    endpoint = typeof location === "undefined"
      ? DEFAULT_SERVER
      : serverEndpoint(location),
  ) {
    this.client = new Client(endpoint);
    this.client.http.options.credentials = "omit"; // the server never allows credentials
  }

  async join(name: string, guild: Guild) {
    this.leave();
    const attempt = this.attempt;
    this.profile = { name, guild };
    this.onStatus("Connecting to Highcross…", "wait");
    await this.connect(attempt);
  }

  send(command: Intent) {
    // Commands typed while the connection is down are dropped, not replayed late.
    if (!this.room?.connection?.isOpen) return;
    this.room.send("command", { ...command, seq: ++this.seq });
  }

  leave() {
    this.attempt++;
    if (this.rejoinTimer !== null) clearTimeout(this.rejoinTimer);
    this.rejoinTimer = null;
    this.rejoins = this.rejoinSince = 0;
    this.stopPing();
    const room = this.room;
    this.room = null;
    if (!room) return;
    // Stop automatic reconnection after any attempt already in flight.
    room.reconnection.maxRetries = 0;
    room.leave().catch(() => {});
  }

  private async connect(attempt: number) {
    const { name, guild } = this.profile!;
    const invite = readInvite();
    const options: JoinOptions = {
      name,
      guild,
      token: identityToken(),
      protocol: PROTOCOL,
      ...(invite ? { invite } : {}),
    };
    const room = await this.client.joinOrCreate("briar-gate", options);
    if (attempt !== this.attempt) {
      room.leave().catch(() => {}); // left while the join was in flight
      return;
    }
    this.attach(room, attempt);
  }

  private attach(room: Room, attempt: number) {
    this.room = room;
    this.seq = 0;
    this.recentEvents = [];
    this.rejoins = this.rejoinSince = 0;
    // About 20 s of automatic retries, the server's reconnection window.
    room.reconnection.maxRetries = 8;
    const current = () => this.room === room;
    room.onMessage("welcome", (welcome: Welcome) => {
      if (current()) this.welcome(welcome);
    });
    room.onMessage("snapshot", (s: Snapshot) => {
      if (!current()) return;
      if (s.protocol !== PROTOCOL) {
        this.onStatus("Version mismatch. Reload the client.", "reload");
        return;
      }
      this.recentEvents = retainEvents(this.recentEvents, s);
      this.onSnapshot({ ...s, events: this.recentEvents });
    });
    room.onMessage("notice", (n: Notice) => {
      if (current()) this.onNotice(n);
    });
    room.onError((_code, message) => {
      if (current()) this.onStatus(message ?? "Connection error");
    });
    room.onDrop(() => {
      if (current()) this.onStatus("Connection lost. Reconnecting…", "wait");
    });
    room.onReconnect(() => {
      if (current()) this.connected();
      else room.leave().catch(() => {}); // abandoned while it was retrying
    });
    room.onLeave((code) => {
      if (!current()) return;
      this.room = null;
      this.stopPing();
      if (code === SESSION_SUPERSEDED)
        this.onStatus(SUPERSEDED_STATUS, "reload");
      else if (code === CONSENTED)
        this.onStatus(
          "Disconnected. Your body remains in the world for at least 60 seconds. Reconnect to return.",
        );
      else this.scheduleRejoin(attempt);
    });
    this.startPing(room);
    this.connected();
  }

  private connected() {
    if (this.updated) this.onStatus(UPDATED_STATUS, "reload");
    else this.onStatus("Connected");
  }

  private welcome(welcome: Welcome) {
    if (this.release === null) this.release = welcome.release;
    else if (welcome.release !== this.release && !this.updated) {
      // Play continues; the banner offers the new version.
      this.updated = true;
      this.connected();
    }
  }

  /** After a deploy or a long drop: join again as the same traveller, with backoff. */
  private scheduleRejoin(attempt: number) {
    if (attempt !== this.attempt) return;
    const now = Date.now();
    if (!this.rejoinSince) this.rejoinSince = now;
    if (now - this.rejoinSince >= GIVE_UP_MS) {
      this.rejoins = this.rejoinSince = 0;
      this.onStatus("Can’t reach Highcross right now.", "reconnect");
      return;
    }
    const n = ++this.rejoins;
    this.onStatus(`Reconnecting to Highcross… (attempt ${n})`, "wait");
    this.rejoinTimer = setTimeout(() => {
      this.rejoinTimer = null;
      this.connect(attempt).catch((error: unknown) => {
        if (attempt !== this.attempt) return;
        const failure = joinFailure(error);
        if (failure.permanent && failure.message)
          this.onStatus(failure.message, "reload");
        else this.scheduleRejoin(attempt);
      });
    }, rejoinDelay(n));
  }

  private startPing(room: Room) {
    this.stopPing();
    const sample = () =>
      room.ping((ms) => {
        if (this.room === room) this.latencyMs = ms;
      });
    sample();
    this.pingTimer = setInterval(sample, PING_EVERY_MS);
  }

  private stopPing() {
    if (this.pingTimer !== null) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }
}
