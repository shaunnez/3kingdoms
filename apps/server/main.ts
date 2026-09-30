import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import express from "express";
import { Room, Server, type Client } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { World, type SavedWorld } from "../../packages/simulation/world";
import { BUILD, PROTOCOL } from "../../packages/contracts/game";

// This checkpoint is intentionally loopback-only. OIDC and PostgreSQL precede external testing.
const port = Number(process.env.THREEFOLD_PORT ?? 2567);
const savePath = process.env.THREEFOLD_SAVE ?? ".local/checkpoint-world.json";
const origins = new Set([
  "http://127.0.0.1:4177",
  "http://localhost:4177",
  "http://127.0.0.1:4181",
]);
let saved: SavedWorld | undefined;
try {
  saved = JSON.parse(readFileSync(savePath, "utf8")) as SavedWorld;
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
const world = new World(saved);
// Opt-in, isolated load fixture. Never changes the user's playable checkpoint save.
if (process.env.THREEFOLD_LOAD_FIXTURE === "1") {
  if (port === 2567 || !process.env.THREEFOLD_SAVE)
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
mkdirSync(".local", { recursive: true });
function persist() {
  writeFileSync(`${savePath}.tmp`, JSON.stringify(world.save()), {
    mode: 0o600,
  });
  renameSync(`${savePath}.tmp`, savePath);
}
const ticks: number[] = [];
let roomCreated = false;
class BriarRoom extends Room {
  maxClients = 16;
  autoDispose = false;
  private players = new Map<string, string>();
  private rates = new Map<string, { second: number; count: number }>();
  private lastBroadcastEvent = 0;
  private reservations = new Map<
    string,
    { session: string; expires: number }
  >();
  onCreate() {
    if (roomCreated)
      throw new Error("The local world is full. Try again when a place opens.");
    roomCreated = true;
    this.onMessage("command", (client, payload: unknown) => {
      const id = this.players.get(client.sessionId);
      if (!id) return;
      const second = Math.floor(world.now),
        r = this.rates.get(id) ?? { second, count: 0 };
      if (r.second !== second) {
        r.second = second;
        r.count = 0;
      }
      this.rates.set(id, r);
      if (++r.count > 50) return;
      if (
        world.command(id, payload) &&
        (payload as { type: string }).type !== "move"
      )
        persist();
      this.sendNotices();
    });
    this.setFixedTimestep(({ dt }) => {
      const start = performance.now();
      const previousReceipts = world.receipts.size;
      const previousCorpses = world.corpses.size;
      world.step(dt);
      if (
        world.receipts.size !== previousReceipts ||
        world.corpses.size !== previousCorpses
      )
        persist();
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
      if (world.tick % 20 === 0) persist();
      ticks.push(performance.now() - start);
      if (ticks.length > 12000) ticks.shift();
    }, 20);
  }
  onAuth(client: Client, options: Record<string, unknown>) {
    if (
      options.protocol !== PROTOCOL ||
      typeof options.token !== "string" ||
      !/^[a-f0-9]{64}$/.test(options.token)
    )
      throw new Error(
        "Checkpoint identity or protocol is invalid. Reload to reconnect.",
      );
    const id = createHash("sha256")
      .update(options.token)
      .digest("hex")
      .slice(0, 24);
    const reservation = this.reservations.get(id);
    if (
      [...this.players.values()].includes(id) ||
      (reservation && reservation.expires > Date.now())
    )
      throw new Error(
        "This traveller is already connected. Use a separate browser tab identity.",
      );
    const name =
      typeof options.name === "string"
        ? options.name
            .trim()
            .replace(/[^\p{L}\p{N} '-]/gu, "")
            .slice(0, 20)
        : "Traveller";
    for (const [reservedId, r] of this.reservations)
      if (r.expires < Date.now()) this.reservations.delete(reservedId);
    this.reservations.set(id, {
      session: client.sessionId,
      expires: Date.now() + 20_000,
    });
    return {
      id,
      name: name || "Traveller",
      guild: options.guild === "cyborg" ? "cyborg" : "knight",
    };
  }
  onJoin(client: Client) {
    const auth = client.auth as {
      id: string;
      name: string;
      guild: "knight" | "cyborg";
    };
    if ([...this.players.values()].includes(auth.id))
      throw new Error("This traveller is already connected.");
    this.reservations.delete(auth.id);
    world.join(auth.id, auth.name, auth.guild);
    this.players.set(client.sessionId, auth.id);
    persist();
    client.send("welcome", { id: auth.id, build: BUILD });
    client.send("snapshot", world.snapshot(auth.id));
  }
  onLeave(client: Client) {
    const id = this.players.get(client.sessionId);
    if (id) {
      world.disconnect(id);
      this.players.delete(client.sessionId);
      this.rates.delete(id);
      persist();
    }
  }
  private sendNotices() {
    const notices = world.notices.splice(0);
    for (const n of notices)
      for (const client of this.clients)
        if (this.players.get(client.sessionId) === n.id)
          client.send("notice", n.notice);
  }
}
const app = express();
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !origins.has(origin)) {
    res.status(403).json({ error: "Origin refused" });
    return;
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
});
app.post(
  "/evidence/:kind",
  express.raw({
    type: ["image/png", "video/webm", "application/json"],
    limit: "128mb",
  }),
  async (req, res) => {
    if (!origins.has(req.headers.origin ?? "")) {
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
app.get("/health", (_req, res) =>
  res.json({
    ok: true,
    build: BUILD,
    protocol: PROTOCOL,
    mode: "local-checkpoint",
  }),
);
app.get("/metrics", (_req, res) => {
  const sorted = [...ticks].sort((a, b) => a - b);
  res.json({
    build: BUILD,
    ticks: world.tick,
    samples: sorted.length,
    tickP95Ms: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
    tickP99Ms: sorted[Math.floor(sorted.length * 0.99)] ?? 0,
    players: [...world.actors.values()].filter(
      (p) => p.kind === "player" && p.connected,
    ).length,
  });
});
const http = createServer(app);
const server = new Server({
  gracefullyShutdown: false,
  greet: false,
  transport: new WebSocketTransport({
    server: http,
    maxPayload: 8192,
    beforeUpgrade: (context) => {
      const origin = context.headers.get("origin");
      return origin && !origins.has(origin)
        ? new Response("Origin refused", { status: 403 })
        : undefined;
    },
  }),
});
server.define("briar-gate", BriarRoom);
await server.listen(port, "127.0.0.1");
console.log(
  JSON.stringify({
    event: "checkpoint-ready",
    url: `http://127.0.0.1:${port}`,
    build: BUILD,
  }),
);
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  persist();
  void server.gracefullyShutdown().then(() => process.exit(0));
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
