import { createHash, timingSafeEqual } from "node:crypto";
import { ErrorCode, ServerError, type AuthContext } from "@colyseus/core";
import { PROTOCOL, type Guild } from "../../packages/contracts/game";
import { sha256, type ServerConfig } from "./config";
import { ipTag, type Log } from "./log";
import { cleanName, NAME_MESSAGES, nameKey, type Names } from "./names";

/** What a successful join carries into `onJoin` as `client.auth`. */
export type Admitted = {
  id: string;
  name: string;
  guild: Guild;
  tester: string | null;
  ipTag: string;
  /** No stored character had this identity: the join creates one. */
  created: boolean;
};
type Pending = {
  ip: string;
  expires: number;
  /** The matchmaking request; Colyseus retries a seat with the same context. */
  join: AuthContext;
  /** Name skeleton claimed by a character still being created. */
  name?: string;
};

/** Longer than the room's 15 s seat reservation, so a seat never outlives its entry. */
export const PENDING_MS = 16_000;
const DAY_MS = 86_400_000;

/**
 * The checks behind the room's static `onAuth`, which Colyseus runs before it
 * finds a room or reserves a seat. Nothing is recorded until every check has
 * passed. Permanent refusals use 525 (the client stops and shows the message);
 * retryable ones use 503.
 */
export class Admission {
  stopping = false;
  private pending = new Map<string, Pending>();
  private creations = new Map<string, number[]>();
  private config: ServerConfig;
  private names: Names;
  private log: Log;
  private characters: () => {
    has(id: string): boolean;
    count(): number;
  };
  private now: () => number;
  constructor(options: {
    config: ServerConfig;
    names: Names;
    log: Log;
    characters: Admission["characters"];
    now?: () => number;
  }) {
    this.config = options.config;
    this.names = options.names;
    this.log = options.log;
    this.characters = options.characters;
    this.now = options.now ?? Date.now;
  }
  admit(options: unknown, context: AuthContext): Admitted {
    const o = (typeof options === "object" && options) as Record<
      string,
      unknown
    >;
    const ip = context.ip ?? "unknown",
      tag = ipTag(ip),
      now = this.now();
    let tester: string | null = null;
    const refuse = (code: number, reason: string, message: string) => {
      this.log("refused", {
        reason,
        ipTag: tag,
        ...(tester ? { tester } : {}),
      });
      return new ServerError(code, message);
    };
    if (this.stopping)
      throw refuse(
        503,
        "stopping",
        "Highcross is restarting. Try again in a moment.",
      );
    if (!o || o.protocol !== PROTOCOL)
      throw refuse(
        ErrorCode.AUTH_FAILED,
        "protocol",
        "THREEFOLD has been updated. Reload the page to continue.",
      );
    if (this.config.public) {
      const digest = sha256(String(o.invite ?? ""));
      // Compare with every key, without stopping early.
      for (const key of this.config.keys)
        if (timingSafeEqual(digest, key.digest)) tester = key.label;
      if (!tester)
        throw refuse(
          ErrorCode.AUTH_FAILED,
          "invite",
          "That invite key isn't valid. Ask your host for your personal key.",
        );
    }
    if (typeof o.token !== "string" || !/^[a-f0-9]{64}$/.test(o.token))
      throw refuse(
        ErrorCode.AUTH_FAILED,
        "token",
        "Your traveller identity is invalid. Reload the page.",
      );
    const id = createHash("sha256").update(o.token).digest("hex").slice(0, 24);
    this.prune(now);
    const existing = this.pending.get(id);
    // A retried seat reservation for the same request is not a second join.
    if (existing?.join !== context) {
      let fromIp = 0;
      for (const p of this.pending.values()) if (p.ip === ip) fromIp++;
      if (
        this.config.pendingSeatsPerIp &&
        fromIp >= this.config.pendingSeatsPerIp
      )
        throw refuse(
          503,
          "pending-seats",
          "Too many joins from your network at once. Wait a moment.",
        );
      if (existing)
        throw refuse(
          503,
          "already-joining",
          "This traveller is already joining. Wait a moment and try again.",
        );
    }
    const created = !this.characters().has(id);
    let name = "";
    if (created) {
      name = cleanName(o.name);
      if (!name && !this.config.public) name = "Traveller";
      const problem = this.names.problem(name);
      if (problem)
        throw refuse(ErrorCode.AUTH_FAILED, problem, NAME_MESSAGES[problem]);
      // Development tabs share one default name, so uniqueness is enforced
      // only where characters persist for other people.
      if (this.config.public && this.nameInUse(name, id))
        throw refuse(ErrorCode.AUTH_FAILED, "taken", NAME_MESSAGES.taken);
      let creating = 0;
      for (const [other, p] of this.pending)
        if (other !== id && p.name !== undefined) creating++;
      if (
        this.config.maxCharacters &&
        this.characters().count() + creating >= this.config.maxCharacters
      )
        throw refuse(
          ErrorCode.AUTH_FAILED,
          "character-cap",
          "The playtest world has no room for new travellers. Ask your host.",
        );
      const recent = this.recentCreations(ip, now);
      if (
        this.config.newCharactersPerIp &&
        recent >= this.config.newCharactersPerIp
      )
        throw refuse(
          ErrorCode.AUTH_FAILED,
          "ip-creations",
          "Too many new travellers from your network today. Ask your host.",
        );
    }
    this.pending.set(id, {
      ip,
      expires: now + PENDING_MS,
      join: context,
      ...(created ? { name: nameKey(name) } : {}),
    });
    return {
      id,
      name,
      guild: o.guild === "cyborg" ? "cyborg" : "knight",
      tester,
      ipTag: tag,
      created,
    };
  }
  /** The seat was taken: forget the reservation and count a new character. */
  joined(auth: Admitted) {
    const entry = this.pending.get(auth.id);
    this.pending.delete(auth.id);
    if (auth.created && entry) {
      const now = this.now();
      this.creations.set(entry.ip, [
        ...(this.creations.get(entry.ip) ?? []).filter((t) => now - t < DAY_MS),
        now,
      ]);
    }
  }
  /** The matchmaking request failed after admission: release what it held. */
  release(context: AuthContext) {
    for (const [id, p] of this.pending)
      if (p.join === context) this.pending.delete(id);
  }
  prune(now = this.now()) {
    for (const [id, p] of this.pending)
      if (p.expires <= now) this.pending.delete(id);
    for (const [ip, times] of this.creations) {
      const kept = times.filter((t) => now - t < DAY_MS);
      if (kept.length) this.creations.set(ip, kept);
      else this.creations.delete(ip);
    }
  }
  private recentCreations(ip: string, now: number) {
    return (this.creations.get(ip) ?? []).filter((t) => now - t < DAY_MS)
      .length;
  }
  private nameInUse(name: string, id: string) {
    if (this.names.taken(name, id)) return true;
    const key = nameKey(name);
    for (const [other, p] of this.pending)
      if (other !== id && p.name === key) return true;
    return false;
  }
}
