/**
 * Smoke test of the bundled playtest server (dist/server/main.mjs) in public
 * mode, run from an empty folder so it proves the bundle needs no
 * node_modules. Requires `npm run build:hosted && npm run build:server`.
 *
 * Usage: node --import tsx tools/smoke-server.mjs
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@colyseus/sdk";
import { PROTOCOL } from "../packages/contracts/game.ts";

const bundle = resolve("dist/server/main.mjs");
const client = resolve("dist/hosted");
const folder = mkdtempSync(join(tmpdir(), "threefold-smoke-"));
const save = join(folder, "world.json");
const key = "smoke-" + randomBytes(12).toString("hex");
const fail = (message) => {
  console.error(`smoke: ${message}`);
  process.exitCode = 1;
};

// Port 0: the operating system picks a free port, read from the ready log.
const server = spawn(process.execPath, [bundle], {
  cwd: folder,
  env: {
    PATH: process.env.PATH,
    THREEFOLD_PUBLIC: "1",
    THREEFOLD_PORT: "0",
    THREEFOLD_HOST: "127.0.0.1",
    THREEFOLD_CLIENT_DIR: client,
    THREEFOLD_SAVE: save,
    THREEFOLD_PLAYTEST_KEYS: `smoke:${key}`,
    THREEFOLD_ORIGINS: "http://127.0.0.1",
  },
});
let output = "";
const ready = new Promise((resolveReady, reject) => {
  const timer = setTimeout(() => reject(new Error("no ready log")), 20_000);
  const read = (chunk) => {
    output += chunk;
    const line = output
      .split("\n")
      .find((l) => l.includes('"event":"checkpoint-ready"'));
    if (line) {
      clearTimeout(timer);
      resolveReady(JSON.parse(line));
    }
  };
  server.stdout.on("data", read);
  server.stderr.on("data", read);
  server.once("exit", (code) => reject(new Error(`exited ${code}\n${output}`)));
});
const { port } = await ready;
const base = `http://127.0.0.1:${port}`;

try {
  const health = await fetch(`${base}/health`);
  if (!health.ok) fail(`/health returned ${health.status}`);

  const page = await fetch(`${base}/`);
  const csp = page.headers.get("content-security-policy") ?? "";
  if (!csp.includes("script-src 'self'")) fail(`weak or missing CSP: ${csp}`);
  if (!/no-cache/.test(page.headers.get("cache-control") ?? ""))
    fail("the page must not be cached");
  const asset = (await page.text()).match(/assets\/[^"]+\.js/)?.[0];
  if (!asset) fail("the page links no script asset");
  else {
    const res = await fetch(`${base}/${asset}`, {
      headers: { "accept-encoding": "br" },
    });
    if (res.headers.get("content-encoding") !== "br")
      fail("assets are not served precompressed");
    if (!/immutable/.test(res.headers.get("cache-control") ?? ""))
      fail("hashed assets should be immutable");
  }

  for (const path of ["/evidence/capture", "/metrics"]) {
    const res = await fetch(`${base}${path}`);
    if (res.status !== 404) fail(`${path} returned ${res.status}, not 404`);
  }

  const foreign = await fetch(`${base}/matchmake/joinOrCreate/briar-gate`, {
    method: "POST",
    headers: {
      origin: "https://elsewhere.example",
      "content-type": "application/json",
    },
    body: JSON.stringify({ protocol: PROTOCOL, token: "a".repeat(64) }),
  });
  if (foreign.status !== 403)
    fail(`a foreign origin got ${foreign.status}, not 403`);

  const sdk = new Client(base);
  sdk.http.options.credentials = "omit";
  // Node sends no Origin by default; the server checks the one browsers send.
  sdk.http.options.headers = { origin: "http://127.0.0.1" };
  const room = await sdk.joinOrCreate("briar-gate", {
    protocol: PROTOCOL,
    token: randomBytes(32).toString("hex"),
    name: "Smoke",
    guild: "knight",
    invite: key,
  });
  const welcome = await new Promise((resolveWelcome, reject) => {
    const timer = setTimeout(() => reject(new Error("no welcome")), 10_000);
    room.onMessage("welcome", (w) => {
      clearTimeout(timer);
      resolveWelcome(w);
    });
    room.onMessage("snapshot", () => {});
  });
  if (!welcome?.id) fail("the join got no welcome");
  await new Promise((r) => setTimeout(r, 300));

  const exited = new Promise((r) => server.once("exit", (code) => r(code)));
  server.kill("SIGTERM");
  const code = await Promise.race([
    exited,
    new Promise((r) => setTimeout(() => r("timeout"), 10_000)),
  ]);
  if (code !== 0) fail(`SIGTERM exit was ${code}`);
  const saved = JSON.parse(readFileSync(save, "utf8"));
  if (!saved.players?.some((p) => p.name === "Smoke"))
    fail("the save does not contain the player");
} catch (error) {
  fail(String(error?.stack ?? error));
} finally {
  if (server.exitCode === null) server.kill("SIGKILL");
}
if (process.exitCode) console.error(output.slice(-2000));
else console.log(JSON.stringify({ smoke: "ok", port }));
