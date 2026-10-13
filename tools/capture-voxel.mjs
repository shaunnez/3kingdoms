/**
 * Dev capture tool for the voxel presentation. Drives a running dev or
 * preview server in headless Chromium (software GL), plays solo with ordinary
 * player intents through the page's loopback-only dev hook
 * (window.__THREEFOLD__.send), and saves labelled 1920×1080 in-engine frames
 * with a JSON sidecar each.
 *
 * Usage: node tools/capture-voxel.mjs [--out dir] [--base url] [--only a,b]
 *
 * Output defaults to .local/captures/ (gitignored). Frames are headless
 * SwiftShader renders: they show composition and effects, not real-time
 * performance. The tool never purchases anything and calls no provider APIs.
 */
import { chromium } from "@playwright/test";
import { execSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const argv = process.argv.slice(2);
const option = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const base = option("base", "http://127.0.0.1:4177/");
const outDir = resolve(option("out", ".local/captures"));
const only = option("only", "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const FULL = { width: 1920, height: 1080 };
// Walk between shots at a small size: software GL renders much faster.
const SMALL = { width: 800, height: 450 };

const git = (cmd) => {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return null;
  }
};
const commit = git("git rev-parse --short HEAD");
const dirty = Boolean(git("git status --porcelain"));

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: [
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
  ],
});
const summary = [];

/** In-page helpers: steering and fighting with ordinary intents only. */
const DRIVER = () => {
  const T = window.__THREEFOLD__;
  const me = () => {
    const s = T.snapshot();
    return s?.actors.find((a) => a.id === s.self.id) ?? null;
  };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  window.__capture = {
    me,
    /** Walk to (x, z); resolves with the final position. */
    walk(x, z, tolerance = 0.5, timeoutMs = 120000) {
      return new Promise((done) => {
        const started = performance.now();
        let last = me(),
          lastMoved = performance.now(),
          nudge = 0;
        const timer = setInterval(() => {
          const p = me();
          if (!p) return;
          const d = dist(p, { x, z });
          if (d < tolerance || performance.now() - started > timeoutMs) {
            clearInterval(timer);
            T.send({ type: "move", x: 0, z: 0 });
            done({ x: p.x, z: p.z, arrived: d < tolerance });
            return;
          }
          if (last && dist(p, last) > 0.15) {
            last = p;
            lastMoved = performance.now();
          } else if (performance.now() - lastMoved > 4000) {
            nudge = 12;
            lastMoved = performance.now();
          }
          let dx = (x - p.x) / d,
            dz = (z - p.z) / d;
          if (nudge > 0) {
            // Side-step around a corner, then resume.
            nudge--;
            [dx, dz] = [dz, -dx];
          }
          T.send({ type: "move", x: dx, z: dz });
        }, 100);
      });
    },
    /** Nearest living hound within `radius` metres, or null. */
    hound(radius = 14) {
      const s = T.snapshot(),
        p = me();
      if (!s || !p) return null;
      return (
        s.actors
          .filter((a) => a.kind === "wolf" && a.life === "alive")
          .filter((a) => dist(a, p) < radius)
          .sort((a, b) => dist(a, p) - dist(b, p))[0] ?? null
      );
    },
    /** Close to `range` of a hound, select it and use `key` once in range. */
    engage(id, key, range, timeoutMs = 60000) {
      T.select(id);
      return new Promise((done) => {
        const started = performance.now();
        const timer = setInterval(() => {
          const s = T.snapshot(),
            p = me(),
            t = s?.actors.find((a) => a.id === id);
          if (!p || !t || t.life !== "alive") {
            clearInterval(timer);
            done({ cast: false, reason: "target gone" });
            return;
          }
          if (performance.now() - started > timeoutMs) {
            clearInterval(timer);
            done({ cast: false, reason: "timeout" });
            return;
          }
          const d = dist(p, t);
          if (d > range) {
            T.send({ type: "move", x: (t.x - p.x) / d, z: (t.z - p.z) / d });
            return;
          }
          T.send({ type: "move", x: 0, z: 0 });
          if (p.cast) return;
          T.send({ type: "ability", key, target: id, aim: { x: t.x, z: t.z } });
          clearInterval(timer);
          done({ cast: true, distance: d });
        }, 100);
      });
    },
    /** Basic attacks on a hound until it dies (or time runs out). */
    finish(id, range, timeoutMs = 90000) {
      T.select(id);
      return new Promise((done) => {
        const started = performance.now();
        const timer = setInterval(() => {
          const s = T.snapshot(),
            p = me(),
            t = s?.actors.find((a) => a.id === id);
          if (!p || p.life !== "alive") {
            clearInterval(timer);
            done({ killed: false, reason: "player down" });
            return;
          }
          if (!t || t.life !== "alive" || t.returning) {
            clearInterval(timer);
            T.send({ type: "move", x: 0, z: 0 });
            done({ killed: !t || t.life !== "alive" });
            return;
          }
          if (performance.now() - started > timeoutMs) {
            clearInterval(timer);
            done({ killed: false, reason: "timeout" });
            return;
          }
          const d = dist(p, t);
          if (d > range) {
            T.send({ type: "move", x: (t.x - p.x) / d, z: (t.z - p.z) / d });
            return;
          }
          T.send({ type: "move", x: 0, z: 0 });
          T.send({ type: "ability", key: "basic", target: id });
        }, 120);
      });
    },
  };
};

async function framesRendered(page, count) {
  const start = await page.evaluate(
    () => window.__THREEFOLD__.metrics().frameCount,
  );
  await page.waitForFunction(
    (target) => window.__THREEFOLD__.metrics().frameCount >= target,
    start + count,
    { timeout: 120000, polling: 200 },
  );
}

async function session({ name, guild, time }, steps) {
  const context = await browser.newContext({
    viewport: SMALL,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning")
      errors.push(`[${m.type()}] ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));
  const url = new URL(base);
  url.searchParams.set("time", String(time));
  console.log(`· ${name}: ${url.href}`);
  await page.goto(url.href, { waitUntil: "load", timeout: 180000 });
  await page.waitForSelector("button.enter:not([disabled])", {
    timeout: 300000,
  });

  const shoot = async (label, note = "") => {
    if (only.length && !only.includes(label)) return;
    const size = page.viewportSize();
    if (size?.width !== FULL.width) {
      await page.setViewportSize(FULL);
      await framesRendered(page, 3);
    } else await framesRendered(page, 1);
    const file = join(outDir, `${label}.png`);
    await page.screenshot({ path: file });
    const info = await page.evaluate(() => {
      const T = window.__THREEFOLD__,
        s = T.snapshot(),
        me = s?.actors.find((a) => a.id === s.self.id),
        m = T.metrics();
      return {
        build: T.build,
        position: me ? { x: me.x, z: me.z } : null,
        dayPhase: m.dayPhase,
        quality: m.quality,
        metrics: {
          draws: m.draws,
          activeTriangles: Math.round(m.activeTriangles),
          meshes: m.meshes,
          fps: Number(m.fps.toFixed(2)),
          combatEffects: m.combatEffects,
          ambient: m.ambient,
        },
      };
    });
    const sidecar = {
      label,
      kind: "in-engine frame (headless Chromium, SwiftShader software GL)",
      note,
      session: name,
      guild,
      url: url.href,
      commit: commit ? `${commit}${dirty ? "-dirty" : ""}` : null,
      capturedAt: new Date().toISOString(),
      viewport: FULL,
      ...info,
    };
    await writeFile(
      join(outDir, `${label}.json`),
      JSON.stringify(sidecar, null, 2) + "\n",
    );
    summary.push({ label, draws: info.metrics.draws, file });
    console.log(
      `  ✓ ${label} · ${info.metrics.draws} draws · ${(info.metrics.activeTriangles / 1000).toFixed(0)}k tris`,
    );
  };
  const small = () => page.setViewportSize(SMALL);
  const settle = async (frames = 12) => {
    await small();
    await framesRendered(page, frames);
  };
  const walk = async (x, z, tolerance) => {
    await small();
    return page.evaluate(
      ([x, z, t]) => window.__capture.walk(x, z, t),
      [x, z, tolerance ?? 0.5],
    );
  };
  const join_ = async () => {
    await page.fill("#traveller", name.slice(0, 20));
    await page.click(`button.guild-tile.${guild}`);
    await page.click("button.enter");
    await page.waitForFunction(
      () => window.__THREEFOLD__.snapshot()?.self,
      null,
      { timeout: 120000 },
    );
    await page.evaluate(DRIVER);
    // Let the attract camera hand over to the follow camera.
    await page.waitForFunction(
      () => {
        const c = window.__THREEFOLD__.metrics().camera;
        return Math.abs(c.radius - 26) < 0.6 && Math.abs(c.beta - 0.79) < 0.03;
      },
      null,
      { timeout: 240000, polling: 500 },
    );
  };
  try {
    await steps({ page, shoot, walk, settle, join: join_, small });
  } catch (error) {
    console.error(`  ✗ ${name} stopped: ${error.message}`);
    errors.push(`[capture] ${error.message}`);
  }
  if (errors.length) {
    console.log(`  console (${errors.length}):`);
    for (const e of [...new Set(errors)].slice(0, 12))
      console.log(`    ${e.slice(0, 220)}`);
  }
  await context.close();
  return errors;
}

const fightAll = async (page, settle, range) => {
  for (let i = 0; i < 3; i++) {
    const hound = await page.evaluate(() => window.__capture.hound(9));
    if (!hound) return;
    await page.evaluate(
      ([id, r]) => window.__capture.finish(id, r),
      [hound.id, range],
    );
    await settle(4);
  }
};

const errors = [];
errors.push(
  ...(await session(
    { name: "Thorne", guild: "knight", time: 0.35 },
    async ({ page, shoot, walk, settle, join }) => {
      await page.setViewportSize(FULL);
      await framesRendered(page, 6);
      await shoot("01-entrance-attract", "Attract-mode orbit behind the title");
      await join();
      await walk(1.5, -15.5);
      await settle();
      await shoot("02-plaza-astrolabe", "Highcross plaza and the astrolabe");
      await walk(-3.6, -10.8, 0.4);
      const mara = await page.evaluate(
        () =>
          window.__THREEFOLD__.snapshot().actors.find((a) => a.kind === "mara")
            ?.id,
      );
      await page.evaluate(
        (id) => window.__THREEFOLD__.send({ type: "interact", target: id }),
        mara,
      );
      await settle(6);
      await shoot("03-mara-dialogue", "Talking to Mara, keeper of hours");
      await page.keyboard.press("Escape");
      await walk(-2.5, -4);
      await walk(0.5, -1.4, 0.4);
      await settle();
      await shoot("04-gate-safe-line", "The safe line and the north gate");
      // Hound fight at the first den, just outside the gate.
      await walk(0.5, 6.5, 0.6);
      const hound = await page.evaluate(() => window.__capture.hound(12));
      if (hound) {
        await page.evaluate(
          ([id]) => window.__capture.engage(id, "basic", 2.2, 40000),
          [hound.id],
        );
        await settle(4);
        await page.setViewportSize(FULL);
        await framesRendered(page, 2);
        const cast = await page.evaluate(
          ([id]) => window.__capture.engage(id, "1", 2.3, 30000),
          [hound.id],
        );
        if (cast.cast)
          for (let i = 1; i <= 4; i++)
            await shoot(`05-hound-sunder-${i}`, "Knight Sunder on a hound");
        await shoot("06-hound-melee", "Mid-combat with a Briar Hound");
        await page.evaluate(
          ([id]) => window.__capture.finish(id, 2.2),
          [hound.id],
        );
        await settle(6);
        await shoot("07-hound-defeated", "After the fight");
      }
      await walk(0, 12);
      await walk(0, 19.6, 0.5);
      await settle();
      await shoot("08-bridge-river", "Crossing the river bridge");
      await walk(0, 25);
      await walk(-4.5, 29.5, 0.8);
      await fightAll(page, settle, 2.2);
      await walk(-4, 31.6, 0.5);
      await settle();
      await shoot("09-memorial", "The memorial and its epitaph");
      await walk(-8.6, 27.5, 0.6);
      await settle();
      await shoot("10-pipe-ruin", "The copper pipe ruin");
      await walk(-4, 30);
      await walk(4, 36);
      await fightAll(page, settle, 2.2);
      await walk(10.5, 41, 0.8);
      await fightAll(page, settle, 2.2);
      await walk(13, 42.5, 0.5);
      await settle();
      await shoot("11-refuge", "Wayfarer's Refuge and its campfire");
      await page.keyboard.press("i");
      await settle(4);
      await shoot("12-inventory", "Inventory panel");
      await page.keyboard.press("Escape");
      await page.keyboard.press("g");
      await settle(4);
      await shoot("13-guild-codex", "Guild codex");
      await page.keyboard.press("Escape");
    },
  )),
);
errors.push(
  ...(await session(
    { name: "Vela", guild: "cyborg", time: 0.42 },
    async ({ page, shoot, walk, settle, join }) => {
      await join();
      await walk(0.5, -1.5);
      await walk(0.5, 4.2, 0.6);
      const hound = await page.evaluate(() => window.__capture.hound(12));
      if (!hound) return;
      await page.setViewportSize(FULL);
      await framesRendered(page, 2);
      const cast = await page.evaluate(
        ([id]) => window.__capture.engage(id, "1", 7, 30000),
        [hound.id],
      );
      if (cast.cast)
        for (let i = 1; i <= 4; i++)
          await shoot(`14-cyborg-lance-${i}`, "Cyborg Pulse Lance on a hound");
      await page.evaluate(([id]) => window.__capture.finish(id, 9), [hound.id]);
      await settle(4);
      await shoot("15-cyborg-after", "Cyborg after the fight");
    },
  )),
);
errors.push(
  ...(await session(
    { name: "Nox", guild: "knight", time: 0.9 },
    async ({ shoot, walk, settle, join }) => {
      await join();
      await walk(1.5, -15.5);
      await settle();
      await shoot("16-night-plaza", "Highcross at night");
      await walk(-2.5, -3);
      await walk(-2, 1.5);
      await walk(-9, 9.6, 0.6);
      await settle(16);
      await shoot("17-night-forest-fireflies", "Night forest with fireflies");
    },
  )),
);

await browser.close();
await writeFile(
  join(outDir, "summary.json"),
  JSON.stringify({ base, commit, dirty, frames: summary, errors }, null, 2) +
    "\n",
);
console.log(
  `${summary.length} frames in ${outDir}; ${errors.length} console messages`,
);
