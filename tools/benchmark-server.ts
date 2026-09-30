/** Isolated real-time transport/load trace. No browser automation or paid services. */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { Client, type Room } from "@colyseus/sdk";
import { World } from "../packages/simulation/world";
import { BUILD, PROTOCOL, type Snapshot } from "../packages/contracts/game";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const duration = Number(process.argv[2] ?? 600);
if (!Number.isFinite(duration) || duration < 10 || duration > 1800)
  throw new Error("Expected 10–1800 seconds");
mkdirSync(".local", { recursive: true });
const directory = mkdtempSync(".local/load-test-"),
  save = resolve(directory, "world.json");
const fixture = new World(),
  tokens = Array.from({ length: 16 }, () => randomBytes(32).toString("hex"));
for (const [i, token] of tokens.entries()) {
  const p = fixture.join(
    createHash("sha256").update(token).digest("hex").slice(0, 24),
    `Load ${i}`,
    i % 2 ? "cyborg" : "knight",
  );
  Object.assign(p, {
    x: ((i % 4) - 1.5) * 2,
    z: 38 + Math.floor(i / 4) * 2,
    hp: 100_000,
    maxHp: 100_000,
  });
}
writeFileSync(save, JSON.stringify(fixture.save()), { mode: 0o600 });
const child = spawn(
  process.execPath,
  [
    ...(process.env.THREEFOLD_PROFILE === "1"
      ? ["--cpu-prof", `--cpu-prof-dir=${resolve(directory)}`]
      : []),
    "--import",
    "tsx",
    "apps/server/main.ts",
  ],
  {
    env: {
      ...process.env,
      THREEFOLD_PORT: "2578",
      THREEFOLD_SAVE: save,
      THREEFOLD_LOAD_FIXTURE: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let log = "";
child.stdout.on("data", (b) => (log += b.toString()));
child.stderr.on("data", (b) => (log += b.toString()));
const peers: {
  room: Room;
  seq: number;
  snapshot: Snapshot | null;
  messages: number;
  bytes: number;
  lastArrival: number;
  gaps: number[];
}[] = [];
let commandTimer: ReturnType<typeof setInterval> | undefined;
const samples: unknown[] = [];
try {
  for (let i = 0; i < 100 && !log.includes("checkpoint-ready"); i++) {
    if (child.exitCode !== null) throw new Error(log);
    await sleep(100);
  }
  if (!log.includes("checkpoint-ready"))
    throw new Error("Load server did not become ready");
  const client = new Client("http://127.0.0.1:2578");
  for (const [i, token] of tokens.entries()) {
    const room = await client.joinOrCreate("briar-gate", {
      protocol: PROTOCOL,
      token,
      name: `Load ${i}`,
      guild: i % 2 ? "cyborg" : "knight",
    });
    const peer = {
      room,
      seq: 0,
      snapshot: null as Snapshot | null,
      messages: 0,
      bytes: 0,
      lastArrival: 0,
      gaps: [] as number[],
    };
    room.onMessage("welcome", () => {});
    room.onMessage("notice", () => {});
    room.onMessage("snapshot", (s: Snapshot) => {
      const now = performance.now();
      if (peer.lastArrival) peer.gaps.push(now - peer.lastArrival);
      peer.lastArrival = now;
      peer.snapshot = s;
      peer.messages++;
      peer.bytes += Buffer.byteLength(JSON.stringify(s));
    });
    peers.push(peer);
  }
  const started = performance.now();
  commandTimer = setInterval(() => {
    peers.forEach((p, i) => {
      if (!p.snapshot) return;
      const me = p.snapshot.actors.find((a) => a.id === p.snapshot!.self.id)!;
      const target = p.snapshot.actors
        .filter((a) => a.kind === "wolf")
        .sort(
          (a, b) =>
            Math.hypot(a.x - me.x, a.z - me.z) -
            Math.hypot(b.x - me.x, b.z - me.z),
        )[0];
      if (target)
        p.room.send("command", {
          seq: ++p.seq,
          type: "ability",
          key: "basic",
          target: target.id,
        });
      if (i % 3 === 0)
        p.room.send("command", {
          seq: ++p.seq,
          type: "ability",
          key: "3",
          target: target?.id,
          aim: { x: me.x + 0.5, z: me.z + 1 },
        });
    });
  }, 100);
  while (performance.now() - started < duration * 1000) {
    await sleep(1000);
    const metrics = await fetch("http://127.0.0.1:2578/metrics").then((r) =>
      r.json(),
    );
    samples.push({
      elapsedSeconds: (performance.now() - started) / 1000,
      ...metrics,
    });
  }
  const percentile = (a: number[], p: number) => {
    a.sort((a, b) => a - b);
    return a[Math.floor((a.length - 1) * p)] ?? 0;
  };
  const elapsed = (performance.now() - started) / 1000;
  const report = {
    build: BUILD,
    recordedAt: new Date().toISOString(),
    durationSeconds: elapsed,
    clients: 16,
    aiActors: 80,
    aiFixture:
      "48 hound AI plus 32 hound-cost summon proxies. Summon behavior is not implemented.",
    transport:
      "16 independent real loopback Colyseus WebSocket clients; normal input protocol; production room tick and persistence path",
    artificialHealth: true,
    samples,
    peers: peers.map((p) => ({
      messages: p.messages,
      decodedBytes: p.bytes,
      decodedKbitPerSecond: (p.bytes * 8) / elapsed / 1000,
      arrivalP95Ms: percentile(p.gaps, 0.95),
      arrivalP99Ms: percentile(p.gaps, 0.99),
    })),
  };
  const path = `artifacts/checkpoint/server-load-${duration}s.json`;
  mkdirSync("artifacts/checkpoint", { recursive: true });
  writeFileSync(path, JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify({
      path,
      durationSeconds: elapsed,
      clients: 16,
      lastSample: samples.at(-1),
    }),
  );
} finally {
  if (commandTimer) clearInterval(commandTimer);
  await Promise.race([
    Promise.allSettled(peers.map((p) => p.room.leave())),
    sleep(500),
  ]);
  child.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((r) => {
      if (child.exitCode !== null) r();
      else child.once("exit", () => r());
    }),
    sleep(2500),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}
