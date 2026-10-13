import { World, type SavedWorld } from "../../../packages/simulation/world";
import type {
  CombatEvent,
  Guild,
  Notice,
  Snapshot,
} from "../../../packages/contracts/game";
import type { GameConnection, Intent } from "./network";

// Solo play: the authoritative World runs in the page with the same cadence and
// limits as apps/server/main.ts (20 Hz steps, 10 Hz snapshots, 50 commands/s).

export type SoloStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type LocalConnectionOptions = {
  /** Defaults to localStorage, or an in-page memory store when that is unavailable. */
  storage?: SoloStorage;
  /** Millisecond clock driving the fixed step. Defaults to performance.now. */
  now?: () => number;
};

export const SOLO_TOKEN_KEY = "threefold-solo-token";
export const SOLO_WORLD_KEY = "threefold-solo-world-v1";
const STEP_MS = 50;
const PUMP_MS = 20;
const MAX_CATCH_UP = 5;
const SAVE_EVERY_MS = 5000;
const SAVE_GAP_MS = 250;
const MAX_SAVE_CHARS = 2 * 1024 * 1024;
const RATE_LIMIT = 50;
const EVENT_LIFETIME = 2;

/** The wire sends new events once; retain their short presentation lifetime locally. */
export function retainEvents(
  recent: CombatEvent[],
  snapshot: Pick<Snapshot, "now" | "events">,
): CombatEvent[] {
  const last = recent.at(-1)?.id ?? 0;
  const kept = recent.filter((e) => snapshot.now - e.at < EVENT_LIFETIME);
  for (const e of snapshot.events) if (e.id > last) kept.push(e);
  return kept;
}

/** Mirrors the server's onAuth sanitisation. */
export function sanitiseName(name: unknown): string {
  const clean =
    typeof name === "string"
      ? name
          .trim()
          .replace(/[^\p{L}\p{N} '-]/gu, "")
          .slice(0, 20)
      : "";
  return clean || "Traveller";
}

// Values cross the "wire" by copy so neither side can mutate the other's state.
const detach: <T>(value: T) => T =
  typeof structuredClone === "function"
    ? (value) => structuredClone(value)
    : (value) => JSON.parse(JSON.stringify(value));

function memoryStorage(): SoloStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, String(value)),
    removeItem: (key) => void values.delete(key),
  };
}
// Shared by every solo connection in this page when localStorage is unusable.
const pageMemory = memoryStorage();
const fallbacks = new WeakMap<SoloStorage, Map<string, string>>();
function pageStorage(): SoloStorage {
  try {
    const storage = globalThis.localStorage;
    if (storage) {
      storage.setItem("threefold-probe", "1");
      storage.removeItem("threefold-probe");
      return storage;
    }
  } catch {
    // Private windows and sandboxed frames can refuse storage entirely.
  }
  return pageMemory;
}

/** Storage access that never throws; failed writes fall back to page memory. */
class SafeStorage {
  private primary: SoloStorage;
  private memory: Map<string, string>;
  constructor(primary: SoloStorage) {
    let memory = fallbacks.get(primary);
    if (!memory) fallbacks.set(primary, (memory = new Map()));
    this.primary = primary;
    this.memory = memory;
  }
  get(key: string): string | null {
    try {
      const value = this.primary.getItem(key);
      if (value !== null) return value;
    } catch {
      // Fall through to the memory copy.
    }
    return this.memory.get(key) ?? null;
  }
  set(key: string, value: string): boolean {
    try {
      this.primary.setItem(key, value);
      this.memory.delete(key);
      return true;
    } catch {
      this.memory.set(key, value);
      return false;
    }
  }
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  if (typeof globalThis.crypto?.getRandomValues === "function")
    crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.random() * 256;
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const isItem = (v: unknown) =>
  isObject(v) && typeof v.id === "string" && typeof v.name === "string";
const LIVES = new Set(["alive", "downed", "dead"]);
const QUESTS = new Set(["unheard", "accepted", "inspected", "complete"]);
const PLAYER_NUMBERS = [
  "x",
  "z",
  "heading",
  "hp",
  "maxHp",
  "level",
  "red",
  "resource",
  "xp",
  "marks",
];

/** Structural check of a version 1 save; anything else starts a fresh world. */
export function isSavedWorld(value: unknown): value is SavedWorld {
  if (
    !isObject(value) ||
    value.version !== 1 ||
    !isNumber(value.now) ||
    !isNumber(value.counter) ||
    !Array.isArray(value.players) ||
    !Array.isArray(value.corpses) ||
    !Array.isArray(value.receipts)
  )
    return false;
  const playersValid = value.players.every(
    (p) =>
      isObject(p) &&
      typeof p.id === "string" &&
      typeof p.name === "string" &&
      p.kind === "player" &&
      (p.guild === "knight" || p.guild === "cyborg") &&
      LIVES.has(p.life as string) &&
      QUESTS.has(p.quest as string) &&
      PLAYER_NUMBERS.every((key) => isNumber(p[key])) &&
      Array.isArray(p.inventory) &&
      p.inventory.every(isItem) &&
      Array.isArray(p.recovery) &&
      p.recovery.every(isItem) &&
      isObject(p.cooldowns) &&
      isObject(p.damage) &&
      isObject(p.retaliation) &&
      isObject(p.home) &&
      isNumber(p.home.x) &&
      isNumber(p.home.z),
  );
  const corpsesValid = value.corpses.every(
    (c) =>
      isObject(c) &&
      typeof c.id === "string" &&
      typeof c.victim === "string" &&
      isNumber(c.x) &&
      isNumber(c.z) &&
      isNumber(c.quota) &&
      isNumber(c.expires) &&
      (c.owner === null || typeof c.owner === "string") &&
      Array.isArray(c.items) &&
      c.items.every(isItem),
  );
  return (
    playersValid &&
    corpsesValid &&
    value.receipts.every((r) => typeof r === "string")
  );
}

function report(error: unknown) {
  if (typeof reportError === "function") reportError(error);
  else console.error(error);
}

export class LocalConnection implements GameConnection {
  readonly mode = "solo";
  onSnapshot: (snapshot: Snapshot) => void = () => {};
  onNotice: (notice: Notice) => void = () => {};
  onStatus: (status: string) => void = () => {};
  /** The in-page authoritative world. Exposed for diagnostics and tests only. */
  readonly world: World;
  readonly id: string;
  private storage: SafeStorage;
  private clock: () => number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private joined = false;
  private failed = false;
  private seq = 0;
  private rate = { second: -1, count: 0 };
  private lastBroadcastEvent = 0;
  private recentEvents: CombatEvent[] = [];
  private accumulator = 0;
  private lastPump = 0;
  private lastSave = 0;
  private dirty = false;
  private noticeFlushQueued = false;
  private warnedSize = false;

  constructor(options: LocalConnectionOptions = {}) {
    this.storage = new SafeStorage(options.storage ?? pageStorage());
    this.clock = options.now ?? (() => performance.now());
    let token = this.storage.get(SOLO_TOKEN_KEY);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) {
      token = randomToken();
      this.storage.set(SOLO_TOKEN_KEY, token);
    }
    this.id = `solo-${token.slice(0, 24)}`;
    this.world = this.load();
  }

  async join(name: string, guild: Guild): Promise<void> {
    if (this.joined) this.leave();
    if (this.failed) {
      this.onStatus(
        "The solo world stopped after an error. Reload to continue.",
      );
      return;
    }
    this.world.join(
      this.id,
      sanitiseName(name),
      guild === "cyborg" ? "cyborg" : "knight",
    );
    this.joined = true;
    this.seq = 0;
    this.rate = { second: -1, count: 0 };
    this.recentEvents = [];
    this.accumulator = 0;
    this.lastPump = this.clock();
    this.persist();
    this.timer = setInterval(this.pump, PUMP_MS);
    if (typeof window !== "undefined")
      window.addEventListener("pagehide", this.flush);
    if (typeof document !== "undefined")
      document.addEventListener("visibilitychange", this.hidden);
    // Same order as the Colyseus path: status first, then the welcome snapshot.
    this.onStatus("Connected");
    if (this.joined) this.emitSnapshot(0);
  }

  send(command: Intent): void {
    if (!this.joined) return;
    const payload = detach({ ...command, seq: ++this.seq });
    const second = Math.floor(this.world.now);
    if (this.rate.second !== second) this.rate = { second, count: 0 };
    if (++this.rate.count > RATE_LIMIT) return;
    if (this.world.command(this.id, payload) && payload.type !== "move")
      this.dirty = true;
    if (this.world.notices.length && !this.noticeFlushQueued) {
      this.noticeFlushQueued = true;
      queueMicrotask(() => {
        this.noticeFlushQueued = false;
        if (this.joined) this.deliverNotices();
      });
    }
  }

  leave(): void {
    if (!this.joined) return;
    this.joined = false;
    this.stopTimers();
    this.world.disconnect(this.id);
    this.world.notices.length = 0;
    if (!this.failed) this.persist();
  }

  private pump = () => {
    if (!this.joined) return;
    const t = this.clock();
    this.accumulator += Math.max(0, t - this.lastPump);
    this.lastPump = t;
    let steps = 0,
      snapshotDue = false;
    try {
      while (this.accumulator >= STEP_MS && steps < MAX_CATCH_UP) {
        const receipts = this.world.receipts.size,
          corpses = this.world.corpses.size;
        this.world.step(STEP_MS / 1000);
        if (
          this.world.receipts.size !== receipts ||
          this.world.corpses.size !== corpses
        )
          this.dirty = true;
        if (this.world.tick % 2 === 0) snapshotDue = true;
        this.accumulator -= STEP_MS;
        steps++;
      }
    } catch (error) {
      // A broken step must not be saved over the last good checkpoint.
      this.failed = true;
      this.joined = false;
      this.stopTimers();
      report(error);
      this.onStatus(
        "The solo world stopped after an error. Reload to continue.",
      );
      return;
    }
    // Background tabs fire rarely; drop the backlog instead of fast-forwarding.
    if (this.accumulator >= STEP_MS) this.accumulator %= STEP_MS;
    if (
      (this.dirty && t - this.lastSave >= SAVE_GAP_MS) ||
      t - this.lastSave >= SAVE_EVERY_MS
    )
      this.persist();
    if (snapshotDue) {
      this.emitSnapshot(this.lastBroadcastEvent);
      this.lastBroadcastEvent =
        this.world.events.at(-1)?.id ?? this.lastBroadcastEvent;
    }
    if (this.joined) this.deliverNotices();
  };

  private emitSnapshot(afterEvent: number) {
    const s = detach(this.world.snapshot(this.id, afterEvent));
    this.recentEvents = retainEvents(this.recentEvents, s);
    try {
      this.onSnapshot({ ...s, events: this.recentEvents });
    } catch (error) {
      report(error);
    }
  }

  private deliverNotices() {
    if (!this.world.notices.length) return;
    for (const n of this.world.notices.splice(0))
      if (n.id === this.id && this.joined)
        try {
          this.onNotice(detach(n.notice));
        } catch (error) {
          report(error);
        }
  }

  private flush = () => {
    if (this.joined && !this.failed) this.persist();
  };

  private hidden = () => {
    if (document.visibilityState === "hidden") this.flush();
  };

  private stopTimers() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    if (typeof window !== "undefined")
      window.removeEventListener("pagehide", this.flush);
    if (typeof document !== "undefined")
      document.removeEventListener("visibilitychange", this.hidden);
  }

  private persist() {
    this.lastSave = this.clock();
    this.dirty = false;
    const json = JSON.stringify(this.world.save());
    if (json.length > MAX_SAVE_CHARS) {
      if (!this.warnedSize)
        console.warn(
          `Solo save skipped: ${json.length} characters exceeds the limit.`,
        );
      this.warnedSize = true;
      return;
    }
    this.storage.set(SOLO_WORLD_KEY, json);
  }

  private load(): World {
    const raw = this.storage.get(SOLO_WORLD_KEY);
    if (!raw) return new World();
    try {
      const saved: unknown = JSON.parse(raw);
      if (!isSavedWorld(saved)) throw new Error("Invalid solo save");
      return new World(saved);
    } catch (error) {
      // Keep the unreadable save for recovery, then start a fresh world.
      console.warn("Starting a fresh solo world:", error);
      this.storage.set(`${SOLO_WORLD_KEY}-corrupt`, raw);
      return new World();
    }
  }
}
