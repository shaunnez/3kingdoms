import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";
import express from "express";
import {
  Room,
  Server,
  matchMaker,
  type AuthContext,
  type Client,
  type Deferred,
} from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { World, type SavedWorld } from "../../packages/simulation/world";
import { BUILD, PROTOCOL } from "../../packages/contracts/game";
import {
  SESSION_SUPERSEDED,
  type Welcome,
} from "../../packages/contracts/session";
import { readConfig, type ServerConfig } from "./config";
import { createLog } from "./log";
import { installCors, installGate } from "./gate";
import { Admission, type Admitted } from "./admission";
import { Names } from "./names";
import { SaveQueue } from "./saves";
import { SECURITY_HEADERS, contentSecurityPolicy, serveClient } from "./static";

// Loopback-only by default. THREEFOLD_PUBLIC=1 is the labelled invite-only
// playtest exception (docs/deployment.md); OIDC and PostgreSQL still precede
// any public testing.
const log = createLog();
let config: ServerConfig;
try {
  config = readConfig();
} catch (error) {
  log("config-invalid", { message: (error as Error).message });
  process.exit(1);
}
const savePath = config.savePath;
try {
  mkdirSync(dirname(savePath), { recursive: true });
  const probe = `${savePath}.probe-${process.pid}`;
  writeFileSync(probe, "");
  unlinkSync(probe);
} catch (error) {
  log("save-unwritable", {
    code: (error as NodeJS.ErrnoException).code,
    message: `Save directory ${dirname(savePath)} is not writable by uid ${process.getuid?.() ?? "?"}`,
  });
  process.exit(1);
}
let saved: SavedWorld | undefined;
try {
  saved = JSON.parse(readFileSync(savePath, "utf8")) as SavedWorld;
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
const world = new World(saved);
// Opt-in, isolated load fixture. Never changes the user's playable checkpoint save.
if (config.loadFixture) {
  if (config.public || config.port === 2567 || !process.env.THREEFOLD_SAVE)
    throw new Error(
      "Load fixtures require a separate port and explicit save path",
    );
  const template = [...world.actors.values()].find((a) => a.kind === "wolf")!;
  for (const actor of world.actors.values())
    if (actor.kind === "wolf") actor.active = false;
  for (let i = 0; i < 80; i++) {
    const x = ((i % 10) - 4.5) * 1.15,
      z = 37 + Math.floor(i / 10) * 1.2;
    world.actors.set(`load-ai-${i}`, {
      ...structuredClone(template),
      id: `load-ai-${i}`,
      name: i < 48 ? "AI load hound" : "Summon AI cost proxy",
      x,
      z,
      home: { x, z },
      active: true,
      hp: 100_000,
      maxHp: 100_000,
    });
  }
}
const players = () =>
  [...world.actors.values()].filter((a) => a.kind === "player");
const names = new Names(
  [...world.actors.values()]
    .filter((a) => a.kind !== "player")
    .map((a) => a.name),
);
for (const p of players()) names.add(p.id, p.name);
const saves = new SaveQueue({
  path: savePath,
  serialize: () => JSON.stringify(world.save()),
  intervalMs: config.saveIntervalMs,
  log,
});
const admission = new Admission({
  config,
  names,
  log,
  characters: () => ({
    has: (id) => world.actors.get(id)?.kind === "player",
    count: () => players().length,
  }),
});
const ticks: number[] = [];
const rateLimited = { move: 0, action: 0 };
/** Per-player ceilings from the network contract in technical-architecture.md. */
const LIMITS = { move: 30, action: 10 };
let roomCreated = false;
let stopping = false;
class BriarRoom extends Room {
  maxClients = 16;
  autoDispose = false;
  seatReservationTimeout = 15;
  /** sessionId → character id. */
  private players = new Map<string, string>();
  private rates = new Map<
    string,
    { second: number; move: number; action: number; warned: number }
  >();
  /** Sessions whose connection dropped and may still reconnect. */
  private dropped = new Set<string>();
  private reconnections = new Map<string, Partial<Deferred>>();
  private lastBroadcastEvent = 0;
  /** Runs before Colyseus finds a room or reserves a seat. */
  static async onAuth(_token: string, options: unknown, context: AuthContext) {
    return admission.admit(options, context);
  }
  onCreate() {
    if (roomCreated)
      throw new Error("The local world is full. Try again when a place opens.");
    roomCreated = true;
    this.onMessage("command", (client, payload: unknown) => {
      const id = this.players.get(client.sessionId);
      if (!id) return;
      const kind =
        (payload as { type?: unknown } | null)?.type === "move"
          ? "move"
          : "action";
      if (!this.withinLimit(id, kind)) return;
      if (world.command(id, payload) && kind !== "move") saves.requestSave();
      this.sendNotices();
    });
    this.setFixedTimestep(({ dt }) => {
      const start = performance.now();
      const previousReceipts = world.receipts.size;
      const previousCorpses = world.corpses.size;
      world.step(dt);
      // Loot escrow and receipts reach the disk before anyone can act on them.
      // If they cannot, stop at once: the restart restores the last durable
      // save, so nobody claims or moves property that was never written.
      if (
        world.receipts.size !== previousReceipts ||
        world.corpses.size !== previousCorpses
      ) {
        if (!saves.flushNow("escrow")) {
          log("escrow-unsaved", { players: this.players.size });
          process.exit(1);
        }
      } else if (this.players.size) saves.requestSave();
      if (world.tick % 2 === 0) {
        for (const client of this.clients) {
          const id = this.players.get(client.sessionId);
          if (id)
            client.send(
              "snapshot",
              world.snapshot(id, this.lastBroadcastEvent),
            );
        }
        this.lastBroadcastEvent =
          world.events.at(-1)?.id ?? this.lastBroadcastEvent;
        this.sendNotices();
      }
      ticks.push(performance.now() - start);
      if (ticks.length > 12000) ticks.shift();
    }, 20);
  }
  onJoin(client: Client, _options: unknown, auth: Admitted) {
    admission.joined(auth);
    // A newer connection with the same identity takes over the character.
    for (const [session, id] of this.players) {
      if (id !== auth.id || session === client.sessionId) continue;
      this.players.delete(session);
      this.dropped.delete(session);
      this.reconnections.get(session)?.reject?.(new Error("superseded"));
      this.reconnections.delete(session);
      this.clients.getById(session)?.leave(SESSION_SUPERSEDED, "superseded");
      log("superseded", { ipTag: auth.ipTag, tester: auth.tester });
    }
    world.join(auth.id, auth.name, auth.guild);
    if (auth.created) names.add(auth.id, auth.name);
    this.players.set(client.sessionId, auth.id);
    this.welcome(client, auth.id);
    saves.requestSave();
    log("join", {
      ipTag: auth.ipTag,
      tester: auth.tester,
      created: auth.created,
      players: this.players.size,
    });
  }
  onDrop(client: Client, code?: number) {
    const id = this.players.get(client.sessionId);
    if (stopping || !id) return;
    // Movement stops and the 60 s body rule applies while the client retries.
    world.disconnect(id);
    this.dropped.add(client.sessionId);
    log("drop", { code });
    // At runtime this is a plain rejected promise if the client never finished joining.
    const reconnection: Partial<Deferred> = this.allowReconnection(
      client,
      config.reconnectSeconds,
    );
    this.reconnections.set(client.sessionId, reconnection);
    reconnection.catch?.(() => {});
  }
  onReconnect(client: Client) {
    const id = this.players.get(client.sessionId);
    const actor = id ? world.actors.get(id) : undefined;
    if (!id || !actor) return;
    world.join(id, actor.name, actor.guild);
    this.dropped.delete(client.sessionId);
    this.reconnections.delete(client.sessionId);
    log("reconnected");
    this.welcome(client, id);
  }
  onLeave(client: Client, code?: number) {
    const id = this.players.get(client.sessionId);
    // Superseded and already cleaned-up sessions have no mapping.
    if (!id) return;
    // A dropped session was disconnected when it dropped; keep its offline timer.
    if (!this.dropped.has(client.sessionId)) world.disconnect(id);
    this.players.delete(client.sessionId);
    this.dropped.delete(client.sessionId);
    this.reconnections.delete(client.sessionId);
    this.rates.delete(id);
    saves.requestSave();
    log("leave", { code, players: this.players.size });
  }
  /**
   * Closes every client with 4001. Seats reserved but never taken would
   * otherwise hold the room open, and the shutdown, for up to 15 s.
   */
  onBeforeShutdown() {
    const internals = this as unknown as {
      _reservedSeats?: Record<string, [unknown, unknown, boolean, boolean]>;
      _reservedSeatTimeouts?: Record<string, ReturnType<typeof setTimeout>>;
    };
    const seats = internals._reservedSeats ?? {};
    for (const [session, [, , consumed, reconnecting]] of Object.entries(seats))
      if (!consumed && !reconnecting) {
        clearTimeout(internals._reservedSeatTimeouts?.[session]);
        delete internals._reservedSeatTimeouts?.[session];
        delete seats[session];
      }
    super.onBeforeShutdown();
  }
  private welcome(client: Client, id: string) {
    const welcome: Welcome = { id, build: BUILD, release: config.release };
    client.send("welcome", welcome);
    client.send("snapshot", world.snapshot(id));
  }
  /** Commands over the ceiling are dropped silently and counted. */
  private withinLimit(id: string, kind: "move" | "action") {
    const second = Math.floor(world.now),
      r = this.rates.get(id) ?? { second, move: 0, action: 0, warned: -10 };
    if (r.second !== second) {
      r.second = second;
      r.move = r.action = 0;
    }
    this.rates.set(id, r);
    if (++r[kind] <= LIMITS[kind]) return true;
    rateLimited[kind]++;
    if (second - r.warned >= 10) {
      r.warned = second;
      log("rate-limited", { kind, player: id });
    }
    return false;
  }
  private sendNotices() {
    const notices = world.notices.splice(0);
    for (const n of notices)
      for (const client of this.clients)
        if (this.players.get(client.sessionId) === n.id)
          client.send("notice", n.notice);
  }
}
function tickPercentiles() {
  const sorted = [...ticks].sort((a, b) => a - b);
  return {
    samples: sorted.length,
    tickP95Ms: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
    tickP99Ms: sorted[Math.floor(sorted.length * 0.99)] ?? 0,
  };
}
const connectedPlayers = () => players().filter((p) => p.connected).length;
function routes(app: express.Application) {
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS))
      res.setHeader(name, value);
    next();
  });
  app.get("/health", (_req, res) => {
    res.status(stopping ? 503 : 200).json({
      ok: !stopping,
      build: BUILD,
      protocol: PROTOCOL,
      release: config.release,
      mode: config.public ? "playtest" : "local-checkpoint",
    });
  });
  // Development only: the playtest server registers neither route.
  if (!config.public) {
    app.post(
      "/evidence/:kind",
      express.raw({
        type: ["image/png", "video/webm", "application/json"],
        limit: "128mb",
      }),
      async (req, res) => {
        if (!config.origins.has(req.headers.origin ?? "")) {
          res.status(403).json({ error: "Capture origin refused" });
          return;
        }
        const formats: Record<string, string> = {
          frame: "png",
          video: "webm",
          metrics: "json",
        };
        const extension = formats[req.params.kind];
        if (!extension || !Buffer.isBuffer(req.body) || !req.body.length) {
          res.status(400).json({ error: "Invalid capture" });
          return;
        }
        const directory = "artifacts/checkpoint/captures";
        mkdirSync(directory, { recursive: true });
        const path = `${directory}/${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}.${extension}`;
        await writeFile(path, req.body, { flag: "wx" });
        res.json({ path, bytes: req.body.length, build: BUILD });
      },
    );
    app.get("/metrics", (_req, res) => {
      res.json({
        build: BUILD,
        ticks: world.tick,
        ...tickPercentiles(),
        players: connectedPlayers(),
        rateLimited,
        saves: saves.stats(),
      });
    });
  }
  if (config.clientAvailable)
    serveClient(app, {
      dir: config.clientDir,
      csp: contentSecurityPolicy(config.origins),
    });
}
installCors(config.origins);
// A matchmaking request that fails after admission (a full room, say) must
// not keep holding its pending seat.
const invokeMethod = matchMaker.controller.invokeMethod.bind(
  matchMaker.controller,
);
matchMaker.controller.invokeMethod = async (method, room, options, auth) => {
  try {
    return await invokeMethod(method, room, options, auth);
  } catch (error) {
    if (auth) admission.release(auth);
    throw error;
  }
};
const http = createServer();
const server = new Server({
  gracefullyShutdown: false,
  greet: false,
  transport: new WebSocketTransport({
    server: http,
    maxPayload: 8192,
    perMessageDeflate: config.wsDeflate ? { threshold: 1024 } : false,
  }),
  // Routes go through Colyseus, so it never has to find the Express app by
  // its function name, which a bundler may rename.
  express: routes,
});
server.define("briar-gate", BriarRoom);
await server.listen(config.port, config.host);
installGate(http, config, log);
const address = http.address();
const port =
  typeof address === "object" && address ? address.port : config.port;
log("checkpoint-ready", {
  url: `http://${config.host}:${port}`,
  port,
  host: config.host,
  build: BUILD,
  mode: config.public ? "playtest" : "local-checkpoint",
  release: config.release,
  trustProxy: config.trustProxy,
  origins: config.origins.size,
  testers: config.keys.length,
  client: config.clientAvailable,
});
// Public mode has no /metrics; this line is the operator's view instead.
if (config.public)
  setInterval(() => {
    const s = saves.stats();
    log("stats", {
      players: connectedPlayers(),
      ...tickPercentiles(),
      saves: s.writes,
      slowestSaveMs: Math.round(s.maxMs),
      saveBytes: s.bytes,
      rateLimited,
    });
  }, 60_000).unref();
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = admission.stopping = true;
  const started = performance.now();
  const finish = (ok: boolean, watchdog = false) => {
    log("shutdown", {
      signal,
      ms: Math.round(performance.now() - started),
      ok,
      ...(watchdog ? { watchdog } : {}),
    });
    process.exit(ok ? 0 : 1);
  };
  // Keeps the stop inside the host's draining window if a step hangs.
  setTimeout(() => finish(saves.flushNow("watchdog"), true), 10_000).unref();
  saves.flushNow("shutdown");
  server.onShutdown(async () => {
    saves.flushNow("shutdown-final");
  });
  // Closes every client with 4001 and disposes the room.
  await server.gracefullyShutdown(false);
  finish(saves.flushNow("shutdown"));
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
