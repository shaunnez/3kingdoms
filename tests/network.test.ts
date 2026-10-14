import { strict as assert } from "node:assert";
import { test } from "node:test";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { Client, type Room } from "@colyseus/sdk";
import { World } from "../packages/simulation/world";
import { sessionToken } from "../apps/client/src/network";
import { PROTOCOL, type Snapshot } from "../packages/contracts/game";
import { SESSION_SUPERSEDED } from "../packages/contracts/session";

// Parallel checkouts can run the suite at once on separate ports.
const PORT = process.env.THREEFOLD_TEST_PORT ?? "2579";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(
  condition: () => boolean,
  message: string,
  timeout = 6000,
) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeout) throw new Error(message);
    await sleep(30);
  }
}
type Peer = {
  room: Room;
  snapshot: Snapshot | null;
  seq: number;
  token: string;
  left: number | null;
  send: (body: Record<string, unknown>) => void;
};
const newToken = () => randomBytes(32).toString("hex");
const idOf = (token: string) =>
  createHash("sha256").update(token).digest("hex").slice(0, 24);

type Started = {
  port: number;
  url: string;
  logs: () => string;
  child: ChildProcess;
  /** Signals the server and resolves with its exit code (SIGKILL after 5 s). */
  stop: (signal?: NodeJS.Signals) => Promise<number | null>;
};
/** Starts the server on the given port (0 by default) and waits for its ready line. */
async function startServer(env: Record<string, string>): Promise<Started> {
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => !name.startsWith("THREEFOLD_") && name !== "PORT",
    ),
  );
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "apps/server/main.ts"],
    {
      env: { ...inherited, THREEFOLD_PORT: "0", ...env },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let logs = "";
  child.stdout!.on("data", (b) => (logs += b.toString()));
  child.stderr!.on("data", (b) => (logs += b.toString()));
  const exited = new Promise<number | null>((resolve) => {
    if (child.exitCode !== null) resolve(child.exitCode);
    else child.once("exit", (code) => resolve(code));
  });
  await until(
    () => logs.includes('"checkpoint-ready"') || child.exitCode !== null,
    `Server did not start: ${logs}`,
    20000,
  );
  if (!logs.includes('"checkpoint-ready"'))
    throw new Error(`Server exited: ${logs}`);
  const ready = JSON.parse(
    logs.split("\n").find((line) => line.includes('"checkpoint-ready"'))!,
  ) as { port: number };
  return {
    port: ready.port,
    url: `http://127.0.0.1:${ready.port}`,
    logs: () => logs,
    child,
    async stop(signal = "SIGTERM") {
      if (child.exitCode === null) child.kill(signal);
      const code = await Promise.race([exited, sleep(5000).then(() => -1)]);
      if (code === -1) {
        child.kill("SIGKILL");
        return null;
      }
      return code;
    },
  };
}
/** A raw HTTP exchange, so tests control every header (Origin, X-Real-IP, encodings). */
function request(
  port: number,
  path: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {},
): Promise<{ status: number; headers: IncomingHttpHeaders; body: string }> {
  const body =
    options.body === undefined ? undefined : JSON.stringify(options.body);
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port,
        path,
        method: options.method ?? (body ? "POST" : "GET"),
        headers: {
          ...(body
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(body),
              }
            : {}),
          ...options.headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode!,
            headers: res.headers,
            body: Buffer.concat(chunks).toString(),
          }),
        );
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}
/** Resolves with 101 if the WebSocket upgrade was accepted, else the refusal status. */
function upgrade(port: number, headers: Record<string, string>) {
  return new Promise<number>((resolve, reject) => {
    const req = httpRequest({
      host: "127.0.0.1",
      port,
      path: "/",
      headers: {
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Key": randomBytes(16).toString("base64"),
        ...headers,
      },
    });
    req.on("upgrade", (_res, socket) => {
      socket.destroy();
      resolve(101);
    });
    req.on("response", (res) => {
      res.resume();
      resolve(res.statusCode!);
    });
    req.on("error", reject);
    req.end();
  });
}
function peerFor(room: Room, token: string, peers: Peer[]): Peer {
  const p: Peer = {
    room,
    snapshot: null,
    seq: 0,
    token,
    left: null,
    send(body) {
      room.send("command", { seq: ++p.seq, ...body });
    },
  };
  room.onMessage("snapshot", (s: Snapshot) => (p.snapshot = s));
  room.onMessage("welcome", () => {});
  room.onMessage("notice", () => {});
  room.onLeave((code) => (p.left = code));
  peers.push(p);
  return p;
}
async function closePeers(peers: Peer[]) {
  await Promise.race([
    Promise.allSettled(
      peers.filter((p) => p.left === null).map((p) => p.room.leave()),
    ),
    sleep(500),
  ]);
}

test(
  "real WebSocket clients enforce safety, loot quotas, replay protection and reconnect ownership",
  { timeout: 45000 },
  async () => {
    mkdirSync(".local", { recursive: true });
    const directory = mkdtempSync(".local/network-test-"),
      save = resolve(directory, "world.json");
    const world = new World(),
      tokens = Array.from({ length: 6 }, newToken);
    const ids = tokens.map(idOf);
    const positions = [
      { x: 0, z: 50 },
      { x: 0, z: 51.8 },
      { x: 5, z: 50 },
      { x: 5, z: 51.8 },
      { x: 0, z: -0.5 },
      { x: 0, z: 0.5 },
    ];
    ids.forEach((id, index) => {
      const p = world.join(id, `Network ${index}`, "knight");
      Object.assign(p, positions[index]);
      p.downedLock = 1000;
      if (index === 1) p.hp = 100;
      if (index === 2) {
        p.hp = 50;
        p.red = 600;
      }
    });
    writeFileSync(save, JSON.stringify(world.save()));
    const server = await startServer({
      THREEFOLD_PORT: PORT,
      THREEFOLD_SAVE: save,
    });
    const peers: Peer[] = [];
    const client = new Client(server.url);
    let named = 0;
    async function join(token: string): Promise<Peer> {
      const room = await client.joinOrCreate("briar-gate", {
        protocol: PROTOCOL,
        token,
        name: `Network traveller ${++named}`,
        guild: "knight",
      });
      const p = peerFor(room, token, peers);
      await until(() => Boolean(p.snapshot), "Initial snapshot missing");
      return p;
    }
    try {
      let a = await join(tokens[0]);
      const b = await join(tokens[1]);
      await until(
        () => a.snapshot!.population === 2,
        "Clients are not in one world",
      );
      // The same identity in a second tab takes over; the first is told why.
      const superseded = a;
      a = await join(tokens[0]);
      await until(
        () => superseded.left !== null,
        "The older connection was not closed",
      );
      assert.equal(superseded.left, SESSION_SUPERSEDED);
      await sleep(150);
      assert.equal(a.snapshot!.population, 2);
      await assert.rejects(
        () =>
          client.joinOrCreate("briar-gate", {
            protocol: 999,
            token: newToken(),
          }),
        /updated/,
      );
      a.send({ type: "ability", key: "basic", target: ids[1] });
      await until(
        () => a.snapshot!.actors.find((p) => p.id === ids[0])!.red > 0,
        "Aggressor not marked",
      );
      await until(
        () => a.snapshot!.now >= (a.snapshot!.self.cooldowns.basic ?? Infinity),
        "Attack recovery stalled",
      );
      a.send({ type: "ability", key: "basic", target: ids[1] });
      await until(
        () => a.snapshot!.corpses.some((c) => c.victim === ids[1]),
        "Death escrow missing",
      );
      const corpse = a.snapshot!.corpses.find((c) => c.victim === ids[1])!;
      assert.equal(corpse.quota, 1);
      assert.ok(corpse.items.every((i) => !i.protected));
      assert.ok(a.snapshot!.actors.find((p) => p.id === ids[0])!.killer);
      b.send({ type: "claim", corpse: corpse.id, item: corpse.items[0].id });
      const claim = {
        seq: ++a.seq,
        type: "claim",
        corpse: corpse.id,
        item: corpse.items[0].id,
      };
      a.room.send("command", claim);
      a.room.send("command", claim);
      await until(
        () =>
          a.snapshot!.self.inventory.some((i) => i.id === corpse.items[0].id),
        "The authorized claim did not complete",
      );
      assert.equal(
        a.snapshot!.self.inventory.filter((i) => i.id === corpse.items[0].id)
          .length,
        1,
      );
      assert.equal(
        a.snapshot!.corpses.some((c) => c.id === corpse.id),
        false,
      );
      assert.equal(
        b.snapshot!.self.inventory.some((i) => i.id === corpse.items[0].id),
        false,
      );
      const c = await join(tokens[2]),
        d = await join(tokens[3]);
      d.send({ type: "ability", key: "basic", target: ids[2] });
      await until(
        () => d.snapshot!.corpses.some((c) => c.victim === ids[2]),
        "Red victim escrow missing",
      );
      const redCorpse = d.snapshot!.corpses.find((c) => c.victim === ids[2])!;
      assert.equal(redCorpse.quota, 2);
      assert.equal(d.snapshot!.actors.find((p) => p.id === ids[3])!.red, 0);
      for (const item of redCorpse.items.slice(0, 2)) {
        d.send({ type: "claim", corpse: redCorpse.id, item: item.id });
        await until(
          () => d.snapshot!.self.inventory.some((i) => i.id === item.id),
          "Two-item claim failed",
        );
      }
      assert.equal(
        d.snapshot!.corpses.some((c) => c.id === redCorpse.id),
        false,
      );
      const owned = a.snapshot!.self.inventory.map((i) => i.id).sort();
      await a.room.leave();
      await until(
        () =>
          d.snapshot!.actors.find((p) => p.id === ids[0])?.connected === false,
        "Disconnected body missing",
      );
      const red = d.snapshot!.actors.find((p) => p.id === ids[0])!.red;
      await sleep(350);
      assert.equal(d.snapshot!.actors.find((p) => p.id === ids[0])!.red, red);
      const returning = await join(tokens[0]);
      assert.deepEqual(
        returning.snapshot!.self.inventory.map((i) => i.id).sort(),
        owned,
      );
      assert.ok(
        returning.snapshot!.actors.find((p) => p.id === ids[0])!.red >=
          red - 0.2,
      );
      const e = await join(tokens[4]),
        f = await join(tokens[5]);
      e.send({ type: "ability", key: "basic", target: ids[5] });
      f.send({ type: "ability", key: "basic", target: ids[4] });
      await sleep(200);
      assert.equal(e.snapshot!.actors.find((p) => p.id === ids[4])!.red, 0);
      assert.equal(f.snapshot!.actors.find((p) => p.id === ids[5])!.red, 0);
      for (let i = 0; i < 4; i++) {
        e.send({ type: "move", x: 0, z: 1 });
        await sleep(100);
      }
      e.send({ type: "move", x: 0, z: 0 });
      const hp = f.snapshot!.actors.find((p) => p.id === ids[5])!.hp;
      e.send({ type: "ability", key: "basic", target: ids[5] });
      f.send({ type: "move", x: 0, z: -1 });
      await until(
        () => f.snapshot!.actors.find((p) => p.id === ids[5])!.safe,
        "The late-hit fixture target did not enter town",
      );
      f.send({ type: "move", x: 0, z: 0 });
      await sleep(400);
      assert.equal(
        f.snapshot!.actors.find((p) => p.id === ids[5])!.hp,
        hp,
        "A late hit crossed the town safety boundary",
      );
      assert.ok(e.snapshot!.actors.find((p) => p.id === ids[4])!.red > 0);
      // Two handshakes with one identity at once: exactly one stays connected.
      const sameToken = newToken();
      const population = e.snapshot!.population;
      const simultaneous = await Promise.allSettled([
        join(sameToken),
        join(sameToken),
      ]);
      for (const result of simultaneous)
        if (result.status === "rejected")
          assert.match(String(result.reason), /already joining/);
      await sleep(200);
      assert.equal(
        peers.filter((p) => p.token === sameToken && p.left === null).length,
        1,
        "Concurrent handshakes left a duplicate identity connected",
      );
      await until(
        () => e.snapshot!.population === population + 1,
        "The shared identity did not join exactly once",
      );
      for (let i = 0; i < 9; i++) await join(newToken());
      await until(
        () => e.snapshot!.population === 16,
        "Sixteen travellers did not share one room",
      );
      await assert.rejects(
        () =>
          client.joinOrCreate("briar-gate", {
            protocol: PROTOCOL,
            token: newToken(),
          }),
        /full/,
      );
      const before = e.snapshot!.now;
      await sleep(300);
      assert.ok(
        e.snapshot!.now - before < 0.6,
        "A refused seventeenth player started a second world ticker",
      );
      // Per-kind command ceilings: 30 moves and 10 actions per second. The
      // burst starts early in a server second so it is counted in one window.
      const metrics = async () =>
        (await (await fetch(`${server.url}/metrics`)).json()) as {
          rateLimited: { move: number; action: number };
        };
      const limited = (await metrics()).rateLimited;
      await until(
        () => e.snapshot!.now % 1 > 0.05 && e.snapshot!.now % 1 < 0.4,
        "Server second boundary not observed",
      );
      for (let i = 0; i < 60; i++) e.send({ type: "move", x: 0, z: 0 });
      for (let i = 0; i < 25; i++)
        e.send({ type: "interact", target: "nobody-here" });
      await sleep(300);
      const after = (await metrics()).rateLimited;
      assert.ok(after.move - limited.move >= 30, "Moves were not limited");
      assert.ok(
        after.action - limited.action >= 15,
        "Actions were not limited",
      );
      const persisted = JSON.parse(readFileSync(save, "utf8")) as ReturnType<
        World["save"]
      >;
      assert.equal(persisted.receipts.length, 3);
      assert.equal(new Set(persisted.receipts).size, 3);
      const allItems = persisted.players.flatMap((p) =>
        p.inventory.map((i) => i.id),
      );
      assert.equal(
        allItems.length,
        new Set(allItems).size,
        "An item exists in two inventories",
      );
      writeFileSync(
        resolve(directory, "result.json"),
        JSON.stringify(
          {
            status: "passed",
            clients: 6,
            transport: "real Colyseus WebSockets",
            durableClaims: 3,
            save,
            checks: [
              "safe source and target",
              "late hit boundary",
              "red on aggression",
              "one item on clean death",
              "two items on outlaw death",
              "lawful hunter",
              "atomic replay",
              "offline timer pause",
              "reconnect possessions",
              "same-identity takeover",
              "per-kind command limits",
            ],
          },
          null,
          2,
        ),
      );
    } finally {
      await closePeers(peers);
      await server.stop();
    }
  },
);

const KEYS = {
  alice: "test-key-alice-0000001",
  bob: "test-key-bob-00000002",
};
const ALLOWED = "http://allowed.test";
/** A tiny hosted client: page with an inline style, a hashed asset with .gz/.br, a plain file. */
function clientFixture(directory: string) {
  const dir = resolve(directory, "client");
  mkdirSync(resolve(dir, "assets"), { recursive: true });
  writeFileSync(
    resolve(dir, "index.html"),
    '<!doctype html><style>body{background:#000}</style><script type="module" src="./assets/main-AbCd1234.js"></script>',
  );
  const script = "console.log('threefold fixture');\n".repeat(64);
  writeFileSync(resolve(dir, "assets/main-AbCd1234.js"), script);
  writeFileSync(resolve(dir, "assets/main-AbCd1234.js.gz"), gzipSync(script));
  writeFileSync(
    resolve(dir, "assets/main-AbCd1234.js.br"),
    brotliCompressSync(script),
  );
  writeFileSync(resolve(dir, "assets/plain.txt"), "plain");
  return dir;
}

test(
  "the invite-only playtest server refuses strangers before a seat is reserved",
  { timeout: 45000 },
  async () => {
    mkdirSync(".local", { recursive: true });
    const directory = mkdtempSync(".local/network-test-"),
      save = resolve(directory, "world.json");
    const stored = new World();
    stored.join(idOf(newToken()), "Wren", "knight");
    writeFileSync(save, JSON.stringify(stored.save()));
    const server = await startServer({
      THREEFOLD_PUBLIC: "1",
      THREEFOLD_SAVE: save,
      THREEFOLD_PLAYTEST_KEYS: `alice:${KEYS.alice},bob:${KEYS.bob}`,
      THREEFOLD_ORIGINS: ALLOWED,
      THREEFOLD_TRUST_PROXY: "1",
      THREEFOLD_CLIENT_DIR: clientFixture(directory),
      THREEFOLD_MAX_SOCKETS_PER_IP: "2",
      THREEFOLD_MATCHMAKE_PER_MINUTE: "6",
      THREEFOLD_PENDING_SEATS_PER_IP: "1",
    });
    const peers: Peer[] = [];
    const tokens: string[] = [];
    let address = 0;
    // Each scenario uses its own client address, so per-IP limits stay independent.
    const nextIp = () => `10.9.${Math.floor(++address / 250)}.${address % 250}`;
    const clientAt = (ip: string) =>
      new Client(server.url, {
        headers: { "X-Real-IP": ip, Origin: ALLOWED },
      });
    const options = (extra: Record<string, unknown> = {}) => {
      const token = newToken();
      tokens.push(token);
      return {
        protocol: PROTOCOL,
        token,
        invite: KEYS.alice,
        guild: "knight",
        name: `Tester ${tokens.length}`,
        ...extra,
      };
    };
    async function join(ip: string, extra: Record<string, unknown> = {}) {
      const o = options(extra);
      const room = await clientAt(ip).joinOrCreate("briar-gate", o);
      const p = peerFor(room, o.token, peers);
      await until(() => Boolean(p.snapshot), "Initial snapshot missing");
      return p;
    }
    const matchmake = (ip: string, body: unknown, origin = ALLOWED) =>
      request(server.port, "/matchmake/joinOrCreate/briar-gate", {
        headers: { "X-Real-IP": ip, Origin: origin },
        body,
      });
    try {
      const health = await request(server.port, "/health");
      assert.equal(health.status, 200);
      assert.equal(JSON.parse(health.body).mode, "playtest");
      assert.equal(
        (await request(server.port, "/evidence/frame", { body: {} })).status,
        404,
      );
      assert.equal((await request(server.port, "/metrics")).status, 404);

      // Invite keys are checked before any seat exists.
      await assert.rejects(
        () =>
          clientAt(nextIp()).joinOrCreate(
            "briar-gate",
            options({ invite: "not-a-real-key-000000" }),
          ),
        /invite key/,
      );
      await assert.rejects(
        () =>
          clientAt(nextIp()).joinOrCreate(
            "briar-gate",
            options({ invite: undefined }),
          ),
        /invite key/,
      );
      for (let i = 0; i < 17; i++)
        await assert.rejects(
          () =>
            clientAt(nextIp()).joinOrCreate(
              "briar-gate",
              options({ invite: `wrong-key-${i}-0000000000` }),
            ),
          /invite key/,
        );
      const bobIp = nextIp();
      const bob = await join(bobIp, { invite: KEYS.bob, name: "Bobbin" });
      assert.ok(server.logs().includes('"tester":"bob"'));

      // Foreign pages are refused on matchmaking and on the WebSocket.
      const foreign = await matchmake(nextIp(), options(), "https://evil.test");
      assert.equal(foreign.status, 403);
      assert.equal(
        await upgrade(server.port, { Origin: "https://evil.test" }),
        403,
      );
      assert.equal(await upgrade(server.port, { Origin: ALLOWED }), 101);

      // Only allowed origins are echoed, and credentials are never allowed.
      const preflight = await request(
        server.port,
        "/matchmake/joinOrCreate/briar-gate",
        {
          method: "OPTIONS",
          headers: {
            Origin: ALLOWED,
            "Access-Control-Request-Method": "POST",
          },
        },
      );
      assert.equal(preflight.status, 204);
      assert.equal(preflight.headers["access-control-allow-origin"], ALLOWED);
      assert.match(String(preflight.headers.vary), /Origin/);
      assert.equal(
        preflight.headers["access-control-allow-credentials"],
        undefined,
      );
      const plain = await request(server.port, "/health", {
        headers: { Origin: ALLOWED },
      });
      assert.equal(plain.headers["access-control-allow-origin"], ALLOWED);
      assert.equal(
        plain.headers["access-control-allow-credentials"],
        undefined,
      );

      // Per-IP limits: matchmaking rate, unconsumed seats, open sockets.
      const busyIp = nextIp();
      for (let i = 0; i < 6; i++)
        assert.equal((await matchmake(busyIp, { protocol: 999 })).status, 525);
      const throttled = await matchmake(busyIp, { protocol: 999 });
      assert.equal(throttled.status, 429);
      assert.ok(Number(throttled.headers["retry-after"]) >= 1);
      const seatIp = nextIp();
      assert.equal((await matchmake(seatIp, options())).status, 200);
      const second = await matchmake(seatIp, options());
      assert.equal(second.status, 503);
      assert.match(second.body, /Too many joins/);
      const crowdIp = nextIp();
      await join(crowdIp);
      await join(crowdIp);
      await assert.rejects(() =>
        clientAt(crowdIp).joinOrCreate("briar-gate", options()),
      );
      await join(nextIp());

      // Names: no impersonation, no duplicates of stored characters, plain text only.
      for (const name of [
        "Mara",
        " mara ",
        "Мara",
        "Ｍａｒａ",
        "Concord Watch Jr",
      ])
        await assert.rejects(
          () =>
            clientAt(nextIp()).joinOrCreate("briar-gate", options({ name })),
          /belongs to someone|single alphabet/,
          name,
        );
      await assert.rejects(
        () =>
          clientAt(nextIp()).joinOrCreate(
            "briar-gate",
            options({ name: "wren" }),
          ),
        /already uses that name/,
      );
      await assert.rejects(
        () =>
          clientAt(nextIp()).joinOrCreate(
            "briar-gate",
            options({ name: "Bobbin" }),
          ),
        /already uses that name/,
      );
      await join(nextIp(), { name: "Unique Nim" });
      const markup = await join(nextIp(), {
        name: "<img src=x onerror=alert(1)>",
      });
      const shown = markup.snapshot!.actors.find(
        (a) => a.id === markup.snapshot!.self.id,
      )!.name;
      assert.ok(shown.length > 0);
      assert.doesNotMatch(shown, /[<>=(]/);

      // The page is served with a strict policy; hashed assets are immutable.
      const page = await request(server.port, "/");
      assert.equal(page.status, 200);
      const csp = String(page.headers["content-security-policy"]);
      assert.match(csp, /script-src 'self'/);
      assert.doesNotMatch(csp, /unsafe-eval/);
      assert.match(csp, /frame-ancestors 'none'/);
      assert.match(csp, /ws:\/\/allowed\.test/);
      assert.equal(page.headers["cache-control"], "no-cache");
      const revalidated = await request(server.port, "/", {
        headers: { "If-None-Match": String(page.headers.etag) },
      });
      assert.equal(revalidated.status, 304);
      const asset = await request(server.port, "/assets/main-AbCd1234.js", {
        headers: { "Accept-Encoding": "gzip, br" },
      });
      assert.equal(asset.status, 200);
      assert.equal(asset.headers["content-encoding"], "br");
      assert.match(String(asset.headers["cache-control"]), /immutable/);
      const text = await request(server.port, "/assets/plain.txt");
      assert.equal(text.body, "plain");
      assert.equal(text.headers["cache-control"], "no-cache");
      assert.equal((await request(server.port, "/nope")).status, 404);

      // A dropped connection reconnects to the same session and character.
      bob.room.reconnection.minUptime = 0;
      const session = bob.room.sessionId,
        bobId = bob.snapshot!.self.id;
      let reconnected = false;
      bob.room.onReconnect(() => (reconnected = true));
      bob.snapshot = null;
      bob.room.connection.close(4010, "network lost");
      await until(() => reconnected, "The client did not reconnect", 8000);
      await until(() => Boolean(bob.snapshot), "No snapshot after reconnect");
      assert.equal(bob.room.sessionId, session);
      const copies = bob.snapshot!.actors.filter((a) => a.id === bobId);
      assert.equal(copies.length, 1);
      assert.equal(copies[0].connected, true);
      assert.match(server.logs(), /"event":"reconnected"/);

      const logs = server.logs();
      for (const secret of [...Object.values(KEYS), ...tokens])
        assert.ok(!logs.includes(secret), "A key or token reached the logs");
    } finally {
      await closePeers(peers);
      await server.stop();
    }
  },
);

test(
  "spoofed addresses are ignored and SIGTERM saves the world for a restart",
  { timeout: 30000 },
  async () => {
    mkdirSync(".local", { recursive: true });
    const directory = mkdtempSync(".local/network-test-"),
      save = resolve(directory, "world.json");
    const env = {
      THREEFOLD_PUBLIC: "1",
      THREEFOLD_SAVE: save,
      THREEFOLD_PLAYTEST_KEYS: `alice:${KEYS.alice}`,
      THREEFOLD_ORIGINS: ALLOWED,
      THREEFOLD_CLIENT_DIR: clientFixture(directory),
      THREEFOLD_MAX_SOCKETS_PER_IP: "1",
    };
    const token = newToken(),
      peers: Peer[] = [];
    let server = await startServer(env);
    try {
      const clientAt = (ip: string) =>
        new Client(server.url, {
          headers: { "X-Real-IP": ip, Origin: ALLOWED },
        });
      const room = await clientAt("10.0.0.1").joinOrCreate("briar-gate", {
        protocol: PROTOCOL,
        token,
        invite: KEYS.alice,
        name: "Rook",
        guild: "cyborg",
      });
      const rook = peerFor(room, token, peers);
      await until(() => Boolean(rook.snapshot), "Initial snapshot missing");
      // Without THREEFOLD_TRUST_PROXY both are 127.0.0.1, whatever they claim.
      await assert.rejects(() =>
        clientAt("10.0.0.2").joinOrCreate("briar-gate", {
          protocol: PROTOCOL,
          token: newToken(),
          invite: KEYS.alice,
          name: "Spoof",
        }),
      );
      const start = rook.snapshot!.actors.find((a) => a.name === "Rook")!;
      for (let i = 0; i < 5; i++) {
        rook.send({ type: "move", x: 1, z: 0 });
        await sleep(100);
      }
      rook.send({ type: "move", x: 0, z: 0 });
      await sleep(300);
      const moved = rook.snapshot!.actors.find((a) => a.name === "Rook")!;
      assert.ok(
        Math.abs(moved.x - start.x) > 0.5,
        "The traveller did not move",
      );
      const inventory = rook.snapshot!.self.inventory.map((i) => i.id).sort();
      const started = Date.now();
      const code = await server.stop("SIGTERM");
      assert.equal(code, 0);
      assert.ok(Date.now() - started < 5000);
      await until(() => rook.left !== null, "The client was not closed");
      assert.equal(rook.left, 4001);
      assert.match(server.logs(), /"event":"shutdown"/);
      const persisted = JSON.parse(readFileSync(save, "utf8")) as ReturnType<
        World["save"]
      >;
      const savedRook = persisted.players.find((p) => p.name === "Rook")!;
      assert.ok(savedRook, "The save does not contain the character");
      assert.ok(Math.abs(savedRook.x - moved.x) < 0.5);

      server = await startServer(env);
      const again = peerFor(
        await clientAt("10.0.0.3").joinOrCreate("briar-gate", {
          protocol: PROTOCOL,
          token,
          invite: KEYS.alice,
          name: "Ignored on return",
        }),
        token,
        peers,
      );
      await until(() => Boolean(again.snapshot), "No snapshot after restart");
      const restored = again.snapshot!.actors.find(
        (a) => a.id === again.snapshot!.self.id,
      )!;
      assert.equal(restored.name, "Rook");
      assert.equal(restored.guild, "cyborg");
      assert.ok(Math.abs(restored.x - savedRook.x) < 0.01);
      assert.ok(Math.abs(restored.z - savedRook.z) < 0.01);
      assert.deepEqual(
        again.snapshot!.self.inventory.map((i) => i.id).sort(),
        inventory,
      );
      const logs = server.logs();
      assert.ok(!logs.includes(token) && !logs.includes(KEYS.alice));
    } finally {
      await closePeers(peers);
      await server.stop();
    }
  },
);

test("the reconnect token survives a browser that refuses session storage", () => {
  const original = Object.getOwnPropertyDescriptor(
    globalThis,
    "sessionStorage",
  );
  const use = (descriptor: PropertyDescriptor) =>
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      ...descriptor,
    });
  try {
    // Sandboxed frames throw on any access to the storage object.
    use({
      get() {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
    });
    const token = sessionToken();
    assert.match(token, /^[a-f0-9]{64}$/);
    assert.equal(sessionToken(), token, "Reconnects changed the traveller");

    // A store that reads but refuses writes keeps the same page token.
    use({
      value: {
        getItem: () => null,
        setItem: () => {
          throw new DOMException("Full", "QuotaExceededError");
        },
      },
    });
    assert.equal(sessionToken(), token);

    // Working session storage is used, and its token wins.
    const values = new Map<string, string>();
    use({
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => void values.set(key, value),
      },
    });
    assert.equal(sessionToken(), token);
    assert.equal(values.get("threefold-token"), token);
    values.set("threefold-token", "a".repeat(64));
    assert.equal(sessionToken(), "a".repeat(64));
  } finally {
    if (original) Object.defineProperty(globalThis, "sessionStorage", original);
    else delete (globalThis as { sessionStorage?: Storage }).sessionStorage;
  }
});
