import type {
  IncomingMessage,
  OutgoingHttpHeaders,
  Server as HttpServer,
  ServerResponse,
} from "node:http";
import type { Duplex } from "node:stream";
import { matchMaker } from "@colyseus/core";
import type { ServerConfig } from "./config";
import { ipTag, type Log } from "./log";

/** Matchmaking bodies are a few hundred bytes of join options. */
export const MAX_MATCHMAKE_BODY = 4096;

/** Token bucket per key: `perMinute` at once, refilled evenly over a minute. 0 disables it. */
export class RateBuckets {
  private buckets = new Map<string, { tokens: number; at: number }>();
  private perMinute: number;
  constructor(perMinute: number) {
    this.perMinute = perMinute;
  }
  /** 0 if the request may proceed, otherwise whole seconds until it may. */
  take(key: string, now = Date.now()): number {
    if (!this.perMinute) return 0;
    const bucket = this.refill(key, now);
    this.buckets.set(key, bucket);
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return 0;
    }
    return Math.max(1, Math.ceil(((1 - bucket.tokens) * 60) / this.perMinute));
  }
  /** Forgets keys whose bucket has refilled completely. */
  prune(now = Date.now()) {
    for (const key of this.buckets.keys())
      if (this.refill(key, now).tokens >= this.perMinute)
        this.buckets.delete(key);
  }
  get size() {
    return this.buckets.size;
  }
  private refill(key: string, now: number) {
    const bucket = this.buckets.get(key) ?? {
      tokens: this.perMinute,
      at: now,
    };
    bucket.tokens = Math.min(
      this.perMinute,
      bucket.tokens + ((now - bucket.at) * this.perMinute) / 60_000,
    );
    bucket.at = now;
    return bucket;
  }
}

const header = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;
// Bounds what an untrusted header can put into the per-IP maps.
const plausibleIp = (value: string | undefined) =>
  value && /^[0-9A-Fa-f:.]{2,45}$/.test(value) ? value : undefined;

/**
 * The address limits apply to. Behind the host's edge (`trustProxy`), the
 * first `X-Real-IP` value; otherwise the socket peer. Client-supplied
 * forwarding headers are never trusted on their own.
 */
export function clientIp(req: IncomingMessage, trustProxy: boolean): string {
  const forwarded = trustProxy
    ? plausibleIp(header(req.headers["x-real-ip"])?.split(",")[0].trim())
    : undefined;
  const ip = forwarded ?? req.socket.remoteAddress ?? "unknown";
  return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
}

/**
 * Colyseus answers CORS itself on every HTTP response and by default echoes
 * any Origin with credentials allowed. Echo only allowed origins, never allow
 * credentials, and expose only the two matchmaking methods the client uses.
 */
export function installCors(origins: ReadonlySet<string>) {
  const controller = matchMaker.controller;
  controller.DEFAULT_CORS_HEADERS = {
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "600",
  } as typeof controller.DEFAULT_CORS_HEADERS;
  controller.getCorsHeaders = (headers: Headers): Record<string, string> => {
    const origin = headers.get("origin");
    return origin && origins.has(origin)
      ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" }
      : { Vary: "Origin" };
  };
  controller.exposedMethods = ["joinOrCreate", "reconnect"];
}

type RequestListener = (req: IncomingMessage, res: ServerResponse) => void;
type UpgradeListener = (
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
) => void;

/**
 * The HTTP and WebSocket edge, installed after `server.listen()` so that the
 * listeners Colyseus binds there exist. Each listener list is replaced by one
 * wrapper that runs the originals only if the request passes: a refused
 * request never reaches Colyseus or Express. Per-IP state stays in memory.
 */
export function installGate(http: HttpServer, config: ServerConfig, log: Log) {
  const matchmakes = new RateBuckets(config.matchmakePerMinute),
    upgrades = new RateBuckets(config.matchmakePerMinute),
    sockets = new Map<string, number>();
  let warnedProxy = false;

  /**
   * Rewrites the forwarding headers so Colyseus's `context.ip` matches ours.
   * `joining` marks player traffic, which must arrive through the edge; the
   * host's own health checks may not carry the header.
   */
  function normalise(req: IncomingMessage, joining: boolean): string {
    if (
      joining &&
      config.trustProxy &&
      !req.headers["x-real-ip"] &&
      !warnedProxy
    ) {
      warnedProxy = true;
      log("proxy-header-missing");
    }
    const ip = clientIp(req, config.trustProxy);
    req.headers["x-real-ip"] = ip;
    delete req.headers["x-forwarded-for"];
    delete req.headers["x-client-ip"];
    return ip;
  }
  const allowedOrigin = (req: IncomingMessage) => {
    const origin = req.headers.origin;
    return origin === undefined || config.origins.has(origin);
  };
  function refuse(
    req: IncomingMessage,
    res: ServerResponse,
    status: number,
    error: string,
    extra: OutgoingHttpHeaders = {},
  ) {
    const origin = req.headers.origin;
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Vary: "Origin",
      // An allowed page can read why it was refused.
      ...(origin && config.origins.has(origin)
        ? { "Access-Control-Allow-Origin": origin }
        : {}),
      ...extra,
    });
    res.end(JSON.stringify({ error }));
  }
  function admitHttp(req: IncomingMessage, res: ServerResponse): boolean {
    const path = decodeURIComponent((req.url ?? "/").split("?")[0])
      .replace(/\/{2,}/g, "/")
      .toLowerCase();
    const matchmaking = path.startsWith("/matchmake");
    const ip = normalise(req, matchmaking);
    if (!allowedOrigin(req)) {
      refuse(req, res, 403, "Origin refused");
      return false;
    }
    if (!matchmaking) return true;
    if (req.method === "OPTIONS") return true;
    if (req.method !== "POST") {
      refuse(req, res, 405, "Method not allowed", { Allow: "POST, OPTIONS" });
      return false;
    }
    const length = req.headers["content-length"];
    if (req.headers["transfer-encoding"] || length === undefined) {
      refuse(req, res, 411, "Length required");
      return false;
    }
    if (!/^\d+$/.test(length) || Number(length) > MAX_MATCHMAKE_BODY) {
      refuse(req, res, 413, "Request too large");
      return false;
    }
    const wait = matchmakes.take(ip);
    if (wait) {
      log("rate-limited", { kind: "matchmake", ipTag: ipTag(ip) });
      refuse(req, res, 429, "Too many requests. Wait a moment.", {
        "Retry-After": String(wait),
      });
      return false;
    }
    return true;
  }
  function refuseUpgrade(socket: Duplex, status: string) {
    socket.on("error", () => {});
    socket.end(
      `HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
    );
  }
  function admitUpgrade(req: IncomingMessage, socket: Duplex): boolean {
    const ip = normalise(req, true);
    if (!allowedOrigin(req)) {
      refuseUpgrade(socket, "403 Forbidden");
      return false;
    }
    if (upgrades.take(ip)) {
      log("rate-limited", { kind: "upgrade", ipTag: ipTag(ip) });
      refuseUpgrade(socket, "429 Too Many Requests");
      return false;
    }
    if (!config.maxSocketsPerIp) return true;
    const open = (sockets.get(ip) ?? 0) + 1;
    if (open > config.maxSocketsPerIp) {
      log("rate-limited", { kind: "sockets", ipTag: ipTag(ip) });
      refuseUpgrade(socket, "429 Too Many Requests");
      return false;
    }
    sockets.set(ip, open);
    socket.once("close", () => {
      const left = (sockets.get(ip) ?? 1) - 1;
      if (left > 0) sockets.set(ip, left);
      else sockets.delete(ip);
    });
    return true;
  }

  const requests = http.listeners("request") as RequestListener[];
  http.removeAllListeners("request");
  http.on("request", (req: IncomingMessage, res: ServerResponse) => {
    try {
      if (!admitHttp(req, res)) return;
    } catch {
      // Malformed URL encoding and similar.
      if (!res.headersSent) refuse(req, res, 400, "Bad request");
      return;
    }
    for (const listener of requests) listener.call(http, req, res);
  });
  const upgradeListeners = http.listeners("upgrade") as UpgradeListener[];
  http.removeAllListeners("upgrade");
  http.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (admitUpgrade(req, socket))
      for (const listener of upgradeListeners)
        listener.call(http, req, socket, head);
  });
  const pruner = setInterval(() => {
    matchmakes.prune();
    upgrades.prune();
  }, 60_000);
  pruner.unref();
  return {
    /** Open WebSocket connections counted against per-IP limits. */
    sockets: () => [...sockets.values()].reduce((a, b) => a + b, 0),
  };
}
