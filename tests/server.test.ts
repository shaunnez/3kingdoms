import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AuthContext } from "@colyseus/core";
import { readConfig } from "../apps/server/config";
import { cleanName, nameKey, Names } from "../apps/server/names";
import { SaveQueue } from "../apps/server/saves";
import { RateBuckets } from "../apps/server/gate";
import { accepts, contentSecurityPolicy } from "../apps/server/static";
import { Admission } from "../apps/server/admission";
import { BUILD, PROTOCOL } from "../packages/contracts/game";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
function clientDir() {
  mkdirSync(".local", { recursive: true });
  const dir = mkdtempSync(".local/server-test-");
  writeFileSync(resolve(dir, "index.html"), "<!doctype html>");
  return dir;
}
const publicEnv = (dir: string) => ({
  THREEFOLD_PUBLIC: "1",
  THREEFOLD_ORIGINS: "https://play.threefold.test",
  THREEFOLD_PLAYTEST_KEYS:
    "alice:unit-test-alice-key-0001,bob:unit-test-bob-key-00002",
  THREEFOLD_CLIENT_DIR: dir,
});

test("public mode fails closed and validates every variable", () => {
  const dir = clientDir();
  const ok = readConfig(publicEnv(dir));
  assert.equal(ok.public, true);
  assert.deepEqual([...ok.origins], ["https://play.threefold.test"]);
  assert.deepEqual(
    ok.keys.map((k) => k.label),
    ["alice", "bob"],
  );
  assert.equal(ok.matchmakePerMinute, 30);
  assert.equal(ok.maxSocketsPerIp, 4);
  assert.equal(ok.pendingSeatsPerIp, 2);
  assert.equal(ok.newCharactersPerIp, 4);
  assert.equal(ok.maxCharacters, 200);
  assert.match(ok.release, /^[0-9a-f]{12}$/);
  for (const [name, pattern] of [
    ["THREEFOLD_ORIGINS", /THREEFOLD_ORIGINS/],
    ["THREEFOLD_PLAYTEST_KEYS", /THREEFOLD_PLAYTEST_KEYS/],
  ] as const)
    assert.throws(() => readConfig({ ...publicEnv(dir), [name]: "" }), pattern);
  assert.throws(
    () =>
      readConfig({
        ...publicEnv(dir),
        THREEFOLD_CLIENT_DIR: resolve(dir, "missing"),
      }),
    /THREEFOLD_CLIENT_DIR/,
  );
  for (const keys of [
    "alice:EXAMPLE-ONLY-alice-key-0001",
    "alice:changeme-changeme-1",
    "alice:short",
    "Alice:valid-key-but-bad-name",
    "alice:same-key-for-both-01,bob:same-key-for-both-01",
    "alice:first-key-for-alice-1,alice:second-key-for-alice",
  ])
    assert.throws(
      () => readConfig({ ...publicEnv(dir), THREEFOLD_PLAYTEST_KEYS: keys }),
      /THREEFOLD_PLAYTEST_KEYS/,
    );
  for (const origins of [
    "*",
    "https://play.threefold.test/",
    "https://play.threefold.test/game",
    "play.threefold.test",
    "ftp://play.threefold.test",
  ])
    assert.throws(
      () => readConfig({ ...publicEnv(dir), THREEFOLD_ORIGINS: origins }),
      /THREEFOLD_ORIGINS/,
    );
  // Keys never appear in configuration errors.
  try {
    readConfig({
      ...publicEnv(dir),
      THREEFOLD_PLAYTEST_KEYS: "alice:EXAMPLE-ONLY-alice-key-0001",
    });
  } catch (error) {
    assert.doesNotMatch(String(error), /EXAMPLE-ONLY-alice-key/);
  }
});

test("development defaults keep loopback origins and no per-IP limits", () => {
  const dev = readConfig({
    THREEFOLD_ORIGINS: "http://127.0.0.1:4400",
    THREEFOLD_CLIENT_DIR: ".local/does-not-exist",
  });
  assert.equal(dev.public, false);
  assert.equal(dev.port, 2567);
  assert.equal(dev.host, "127.0.0.1");
  assert.ok(dev.origins.has("http://127.0.0.1:4177"));
  assert.ok(dev.origins.has("http://127.0.0.1:4400"));
  assert.equal(dev.clientAvailable, false);
  assert.equal(dev.release, BUILD);
  assert.equal(dev.matchmakePerMinute + dev.maxSocketsPerIp, 0);
  assert.equal(dev.maxCharacters, 0);
  // Example keys are fine locally; only public mode refuses them.
  assert.equal(
    readConfig({ THREEFOLD_PLAYTEST_KEYS: "me:EXAMPLE-ONLY-local-key-01" }).keys
      .length,
    1,
  );
  assert.equal(readConfig({ THREEFOLD_PORT: "2601", PORT: "8080" }).port, 2601);
  assert.equal(readConfig({ PORT: "8080" }).port, 8080);
  assert.equal(readConfig({ THREEFOLD_PORT: "0" }).port, 0);
  assert.throws(() => readConfig({ PORT: "80a" }), /PORT/);
  assert.throws(() => readConfig({ THREEFOLD_PORT: "70000" }), /PORT/);
  assert.equal(
    readConfig({ THREEFOLD_SAVE_INTERVAL_MS: "50" }).saveIntervalMs,
    1000,
  );
  assert.equal(
    readConfig({ THREEFOLD_SAVE_INTERVAL_MS: "60000" }).saveIntervalMs,
    10000,
  );
});

test("names are canonical, single-alphabet, unique and never impersonate", () => {
  assert.equal(cleanName("  Ｔｈｏｒｎｅ  "), "Thorne");
  assert.equal(
    cleanName("<img src=x onerror=alert(1)>"),
    "img srcx onerroraler",
  );
  assert.equal(cleanName("Ann   Marie"), "Ann Marie");
  assert.equal(cleanName(42), "");
  assert.equal(cleanName("a".repeat(40)).length, 20);
  assert.equal(nameKey("Rnara"), "mara");
  assert.equal(nameKey("M4R4"), "mara");
  assert.equal(nameKey("Vvren"), "wren");
  assert.equal(nameKey("Mára-Lee"), "maralee");
  const names = new Names(["Mara · Keeper of Hours", "Briar Hound"]);
  const cases: [string, string | null][] = [
    ["", "empty"],
    ["Mara", "reserved"],
    ["mara", "reserved"],
    ["Rnara", "reserved"],
    ["M4ra", "reserved"],
    ["Concord Watch Jr", "reserved"],
    ["Keeper of Hours", "reserved"],
    ["Admin", "reserved"],
    ["Game Master", "reserved"],
    ["Elian-Voss", "reserved"],
    ["Мara", "mixed-script"],
    ["Μara", "mixed-script"],
    ["Marathon", null],
    ["Watchful Wren", null],
    ["Zoë", null],
    ["Renée O'Hara", null],
    ["Олег", null],
    ["山田太郎", null],
  ];
  for (const [name, problem] of cases)
    assert.equal(names.problem(cleanName(name)), problem, name);
  names.add("id-1", "Wren");
  assert.equal(names.taken("wren"), true);
  assert.equal(names.taken("VVren"), true);
  assert.equal(names.taken("Wren", "id-1"), false);
  assert.equal(names.taken("Wrenna"), false);
});

function memoryFs() {
  const files = new Map<string, string>();
  let gate: Promise<void> = Promise.resolve();
  let failures = 0;
  return {
    files,
    hold() {
      let release!: () => void;
      gate = new Promise<void>((r) => (release = r));
      return () => release();
    },
    failNext(n: number) {
      failures = n;
    },
    fs: {
      async writeFile(path: string, data: string) {
        if (failures > 0) {
          failures--;
          throw Object.assign(new Error("disk full"), { code: "ENOSPC" });
        }
        await gate;
        files.set(path, data);
      },
      writeFileSync(path: string, data: string) {
        files.set(path, data);
      },
      renameSync(from: string, to: string) {
        files.set(to, files.get(from)!);
        files.delete(from);
      },
      unlinkSync(path: string) {
        files.delete(path);
      },
    },
  };
}

test("a late background save never replaces a newer immediate save", async () => {
  const memory = memoryFs();
  let state = "first";
  const logged: string[] = [];
  const saves = new SaveQueue({
    path: "world.json",
    serialize: () => state,
    intervalMs: 60_000,
    log: (event) => logged.push(event),
    fs: memory.fs,
  });
  try {
    const release = memory.hold();
    const slow = saves.writeAsync();
    state = "second";
    assert.equal(saves.flushNow("escrow"), true);
    assert.equal(memory.files.get("world.json"), "second");
    release();
    await slow;
    assert.equal(memory.files.get("world.json"), "second");
    assert.equal(memory.files.has("world.json.async.tmp"), false);
    // Unchanged state is not written again.
    await saves.writeAsync();
    assert.equal(saves.stats().skipped, 1);
    assert.equal(saves.stats().writes, 1);
  } finally {
    saves.stop();
  }
});

test("failed saves are logged and retried by the timer", async () => {
  const memory = memoryFs();
  const logged: unknown[] = [];
  const saves = new SaveQueue({
    path: "world.json",
    serialize: () => "state",
    intervalMs: 20,
    log: (event, fields) => logged.push({ event, ...fields }),
    fs: memory.fs,
  });
  try {
    memory.failNext(1);
    saves.requestSave();
    const start = Date.now();
    while (!memory.files.has("world.json") && Date.now() - start < 2000)
      await sleep(10);
    assert.equal(memory.files.get("world.json"), "state");
    assert.equal(saves.stats().failures, 1);
    assert.deepEqual(logged[0], { event: "save-failed", code: "ENOSPC" });
  } finally {
    saves.stop();
  }
});

test("rate buckets allow a burst and refill evenly", () => {
  const buckets = new RateBuckets(6);
  for (let i = 0; i < 6; i++) assert.equal(buckets.take("ip", 0), 0);
  assert.equal(buckets.take("ip", 0), 10);
  assert.equal(buckets.take("other", 0), 0);
  // One token returns every 10 s.
  assert.equal(buckets.take("ip", 10_000), 0);
  assert.ok(buckets.take("ip", 10_000) > 0);
  buckets.prune(120_000);
  assert.equal(buckets.size, 0);
  assert.equal(new RateBuckets(0).take("ip", 0), 0);
});

test("the page policy allows only this origin's scripts and its sockets", () => {
  const csp = contentSecurityPolicy([
    "https://play.threefold.test",
    "http://127.0.0.1:2600",
  ]);
  assert.match(csp, /script-src 'self';/);
  assert.match(csp, /wss:\/\/play\.threefold\.test/);
  assert.match(csp, /ws:\/\/127\.0\.0\.1:2600/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.doesNotMatch(csp, /unsafe-eval|script-src[^;]*unsafe-inline/);
  assert.equal(accepts("gzip, deflate, br", "br"), true);
  assert.equal(accepts("br;q=0, gzip", "br"), false);
  assert.equal(accepts(undefined, "gzip"), false);
});

test("admission is idempotent for a retried request and refuses a second one", () => {
  const dir = clientDir();
  const config = readConfig({
    ...publicEnv(dir),
    THREEFOLD_PENDING_SEATS_PER_IP: "2",
    THREEFOLD_NEW_CHARACTERS_PER_IP: "1",
  });
  const stored = new Set<string>();
  let now = 1_000_000;
  const admission = new Admission({
    config,
    names: new Names(),
    log: () => {},
    characters: () => ({
      has: (id) => stored.has(id),
      count: () => stored.size,
    }),
    now: () => now,
  });
  const context = (ip: string) => ({ ip }) as AuthContext;
  const token = "ab".repeat(32);
  const id = createHash("sha256").update(token).digest("hex").slice(0, 24);
  const options = {
    protocol: PROTOCOL,
    token,
    invite: "unit-test-alice-key-0001",
    name: "Pip",
  };
  assert.throws(
    () => admission.admit({ ...options, invite: "nope" }, context("1.1.1.1")),
    /invite key/,
  );
  const first = context("1.1.1.1");
  const auth = admission.admit(options, first);
  assert.equal(auth.id, id);
  assert.equal(auth.tester, "alice");
  assert.equal(auth.created, true);
  // Colyseus retries a failed seat reservation with the same request context.
  assert.equal(admission.admit(options, first).id, id);
  assert.throws(
    () => admission.admit(options, context("1.1.1.1")),
    /already joining/,
  );
  admission.joined(auth);
  stored.add(id);
  // A second new character from the same address today is refused.
  assert.throws(
    () =>
      admission.admit(
        { ...options, token: "cd".repeat(32), name: "Quill" },
        context("1.1.1.1"),
      ),
    /Too many new travellers/,
  );
  // A returning character keeps its name and is not counted again.
  assert.equal(admission.admit(options, context("1.1.1.1")).created, false);
  admission.stopping = true;
  assert.throws(
    () => admission.admit(options, context("2.2.2.2")),
    /restarting/,
  );
});
