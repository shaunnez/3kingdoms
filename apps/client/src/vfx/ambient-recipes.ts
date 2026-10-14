/**
 * Sprite recipes for the ambient layers. Positions are world metres, speeds
 * m/s, lifetimes seconds. Colours are sRGB 0..1; additive layers use alpha as
 * intensity.
 */
import { Vector3, type Particle } from "@babylonjs/core";
import {
  BurstQueue,
  discard,
  envelope,
  hexRgb,
  move,
  paint,
  paintShaded,
  rand,
  setBase,
  setSize,
  smoothstep,
  type AmbientEnv,
  type LayerKind,
} from "./ambient-particles";

/** Source of an emitter-bound layer. */
export type Spot = {
  x: number;
  y: number;
  z: number;
  rx: number;
  rz: number;
  r: number;
  g: number;
  b: number;
  /** Water surface or other per-effect height. */
  w: number;
  /** 0..1 global opacity (beacon fade, day/night ramps). */
  fade: number;
  queue: BurstQueue;
};
export function spot(
  x: number,
  y: number,
  z: number,
  rx = 0,
  rz = 0,
  color = "#ffffff",
): Spot {
  const [r, g, b] = hexRgb(color);
  return { x, y, z, rx, rz, r, g, b, w: y, fade: 1, queue: new BurstQueue() };
}

/** Lantern motes pick one of the nearby lantern positions (x, y, z triples). */
export type LanternSet = { near: number[] };
/** River glints pick one of the nearby water cells (x, h, z triples). */
export type WaterSet = { near: number[] };

const TAU = Math.PI * 2;
const G = 9.8;
const easeOut = (k: number) => 1 - (1 - k) * (1 - k);
const tmp = new Vector3();

function size0(p: Particle): number {
  return p.colorDead.r;
}
function seed(p: Particle): number {
  return p.colorDead.g;
}
function spin(p: Particle, dt: number): void {
  p.angle += p.colorDead.b * dt;
}
function scratch(p: Particle, size: number, spinSpeed = 0, extra = 0): void {
  p.colorDead.set(size, Math.random(), spinSpeed, extra);
}
/** Take the next burst origin; discards the particle if none is queued. */
function fromQueue(p: Particle, q: BurstQueue): number | null {
  const w = q.next(tmp);
  if (Number.isNaN(w)) {
    discard(p);
    return null;
  }
  p.position.copyFrom(tmp);
  return w;
}

// ───────────────────────────── smoke & steam ─────────────────────────────

export const chimneySmoke: LayerKind<Spot> = {
  key: "chimney-smoke",
  texture: "puff",
  additive: false,
  capacity: 96,
  spawn(p, s) {
    p.position.set(
      s.x + rand(-0.08, 0.08),
      s.y + 0.05,
      s.z + rand(-0.08, 0.08),
    );
    p.direction.set(rand(-0.05, 0.05), rand(0.5, 0.75), rand(-0.05, 0.05));
    p.lifeTime = rand(4, 5.5);
    const v = rand(0.9, 1);
    setBase(p, v, v, v * 1.03, 0.82);
    scratch(p, rand(0.5, 0.66), rand(-0.4, 0.4));
  },
  step(p, dt, _s, env) {
    const k = p.age / p.lifeTime;
    p.direction.y *= 1 - 0.18 * dt;
    move(p, dt);
    const drift = 0.25 + 0.9 * k;
    p.position.x +=
      (env.windX * drift + Math.sin(env.time * 1.3 + seed(p) * 6) * 0.08) * dt;
    p.position.z += env.windZ * drift * dt;
    setSize(p, size0(p) * (0.5 + 2.4 * easeOut(k)));
    spin(p, dt);
    paintShaded(p, envelope(p, 0.12, 0.55), env);
  },
};

export const campfireSmoke: LayerKind<Spot> = {
  key: "campfire-smoke",
  texture: "smoke",
  additive: false,
  capacity: 14,
  spawn(p, s) {
    p.position.set(s.x + rand(-0.1, 0.1), s.y + 0.85, s.z + rand(-0.1, 0.1));
    p.direction.set(rand(-0.05, 0.05), rand(0.45, 0.65), rand(-0.05, 0.05));
    p.lifeTime = rand(2.8, 3.8);
    setBase(p, 0.62, 0.6, 0.62, 0.42);
    scratch(p, rand(0.45, 0.6), rand(-0.5, 0.5));
  },
  step(p, dt, _s, env) {
    const k = p.age / p.lifeTime;
    move(p, dt);
    p.position.x += env.windX * k * dt;
    p.position.z += env.windZ * k * dt;
    setSize(p, size0(p) * (0.6 + 1.6 * easeOut(k)));
    spin(p, dt);
    paintShaded(p, envelope(p, 0.2, 0.55), env);
  },
};

export const steamPuffs: LayerKind<Spot> = {
  key: "steam",
  texture: "puff",
  additive: false,
  capacity: 48,
  spawn(p, s) {
    p.position.set(s.x + rand(-0.06, 0.06), s.y, s.z + rand(-0.06, 0.06));
    p.direction.set(rand(-0.15, 0.15), rand(1.0, 1.55), rand(-0.15, 0.15));
    p.lifeTime = rand(1.6, 2.4);
    setBase(p, 1, 1, 1, 0.78);
    scratch(p, rand(0.2, 0.28), rand(-1, 1));
  },
  step(p, dt, _s, env) {
    const k = p.age / p.lifeTime;
    p.direction.scaleInPlace(1 - 1.1 * dt);
    move(p, dt);
    p.position.x += env.windX * 0.7 * k * dt;
    p.position.z += env.windZ * 0.7 * k * dt;
    setSize(p, size0(p) * (1 + 3.4 * easeOut(k)));
    spin(p, dt);
    paintShaded(p, envelope(p, 0.06, 0.6), env);
  },
};

// ───────────────────────────── fire ─────────────────────────────

/** Cartoon flame tongues: solid by day, glowing by night. */
export const flames: LayerKind<Spot> = {
  key: "flames",
  texture: "shard",
  additive: true,
  dayBlend: true,
  capacity: 52,
  spawn(p, s) {
    const core = Math.random() < 0.38;
    const r = core ? 0.1 : 0.22;
    p.position.set(s.x + rand(-r, r), s.y + rand(0, 0.06), s.z + rand(-r, r));
    p.direction.set(rand(-0.06, 0.06), rand(0.75, 1.25), rand(-0.06, 0.06));
    p.lifeTime = core ? rand(0.4, 0.6) : rand(0.55, 0.85);
    setBase(p, 1, 1, 1, 0.95);
    scratch(p, core ? rand(0.28, 0.4) : rand(0.4, 0.58), 0, core ? 1 : 0);
  },
  step(p, dt, s) {
    const k = p.age / p.lifeTime;
    move(p, dt);
    // Tongues lean back into the middle as they rise, and sway.
    p.position.x += (s.x - p.position.x) * 1.8 * dt;
    p.position.z += (s.z - p.position.z) * 1.8 * dt;
    p.angle = Math.sin(p.age * 9 + seed(p) * 12) * 0.18;
    setSize(p, size0(p) * (1 - 0.62 * k), 0.72, 1.5);
    const a = envelope(p, 0.12, 0.45) * p.initialColor.a;
    if (p.colorDead.a > 0.5) {
      // Pale yellow heart of the fire.
      p.color.set(1, 0.95 - 0.25 * k, 0.55 - 0.35 * k, a);
      return;
    }
    // Orange body cooling to ember red at the tips.
    p.color.set(
      1,
      Math.max(0.22, 0.62 - 0.45 * k),
      Math.max(0.06, 0.16 - 0.1 * k),
      a,
    );
  },
};

export const embers: LayerKind<Spot> = {
  key: "embers",
  texture: "spark",
  additive: true,
  capacity: 40,
  spawn(p, s) {
    p.position.set(s.x + rand(-0.2, 0.2), s.y + 0.2, s.z + rand(-0.2, 0.2));
    p.direction.set(rand(-0.25, 0.25), rand(1.0, 1.8), rand(-0.25, 0.25));
    p.lifeTime = rand(1.4, 2.6);
    setBase(p, 1, rand(0.55, 0.8), 0.2, 1);
    scratch(p, rand(0.13, 0.2));
  },
  step(p, dt, _s, env) {
    p.direction.y *= 1 - 0.35 * dt;
    move(p, dt);
    const sd = seed(p) * 20;
    p.position.x += (Math.sin(env.time * 5 + sd) * 0.4 + env.windX * 0.5) * dt;
    p.position.z += (Math.cos(env.time * 4 + sd) * 0.4 + env.windZ * 0.5) * dt;
    const flicker = 0.55 + 0.45 * Math.sin(env.time * 25 + sd * 2.5);
    setSize(p, size0(p) * (0.8 + 0.4 * flicker));
    paint(p, envelope(p, 0.05, 0.4) * flicker);
  },
};

// ───────────────────────────── water ─────────────────────────────

/** Falling streaks on the waterfall face (sheet faces +X at src.x + 0.1). */
export const fallStreaks: LayerKind<Spot> = {
  key: "fall-streaks",
  texture: "streak",
  additive: true,
  capacity: 56,
  billboard: "stretched",
  group: 1,
  spawn(p, s) {
    const y = rand(0.6, s.w + 0.2);
    p.position.set(
      s.x + 0.14 + rand(0, 0.05),
      y,
      s.z + rand(-s.rz, s.rz) * 0.97,
    );
    const vy = rand(4.2, 6.2);
    p.direction.set(rand(0.02, 0.12), -vy, 0);
    p.lifeTime = Math.max(0.15, (y + 0.1) / vy);
    p.angle = Math.PI / 2;
    setBase(p, 0.88, 0.97, 1, rand(0.35, 0.6));
    scratch(p, rand(0.26, 0.34), 0, rand(2.4, 3.6));
  },
  step(p, dt) {
    move(p, dt);
    p.angle = Math.PI / 2;
    setSize(p, size0(p), p.colorDead.a, 1);
    paint(p, envelope(p, 0.1, 0.15));
  },
};

/** Mist at the plunge pool plus foam puffs along the lip. */
export const fallMist: LayerKind<Spot> = {
  key: "fall-mist",
  texture: "puff",
  additive: false,
  capacity: 40,
  group: 1,
  spawn(p, s) {
    const lip = Math.random() < 0.3;
    if (lip) {
      p.position.set(
        s.x + 0.2,
        s.w + rand(-0.1, 0.15),
        s.z + rand(-s.rz, s.rz),
      );
      p.direction.set(rand(0.1, 0.3), rand(-0.7, -0.3), 0);
      p.lifeTime = rand(0.6, 1.0);
      setBase(p, 1, 1, 1, 0.75);
      scratch(p, rand(0.3, 0.45), rand(-1, 1), 1);
      return;
    }
    p.position.set(
      s.x + rand(0.2, 1.4),
      rand(-0.15, 0.45),
      s.z + rand(-s.rz, s.rz) * 1.05,
    );
    p.direction.set(rand(0.3, 0.8), rand(0.15, 0.35), rand(-0.15, 0.15));
    p.lifeTime = rand(2.4, 3.6);
    setBase(p, 0.97, 0.99, 1, 0.42);
    scratch(p, rand(0.9, 1.3), rand(-0.3, 0.3), 0);
  },
  step(p, dt, _s, env) {
    const k = p.age / p.lifeTime;
    move(p, dt);
    const lip = p.colorDead.a > 0.5;
    setSize(p, size0(p) * (lip ? 1 + 0.6 * k : 1 + 1.4 * easeOut(k)));
    spin(p, dt);
    paintShaded(p, envelope(p, lip ? 0.1 : 0.2, 0.5), env);
  },
};

/** Droplets: from the burst queue when it has entries, else in the source area. */
export const drops: LayerKind<Spot> = {
  key: "drops",
  texture: "soft",
  additive: false,
  capacity: 44,
  group: 1,
  spawn(p, s) {
    const burst = s.queue.next(tmp);
    if (!Number.isNaN(burst)) {
      p.position.copyFrom(tmp);
      const a = rand(0, TAU),
        h = rand(0.4, 1.1);
      p.direction.set(Math.cos(a) * h, rand(1.6, 3.0), Math.sin(a) * h);
    } else if (s.rx > 0) {
      p.position.set(
        s.x + rand(-s.rx, s.rx * 0.2),
        s.w,
        s.z + rand(-s.rz, s.rz),
      );
      p.direction.set(rand(0.4, 2.0), rand(1.8, 3.6), rand(-0.5, 0.5));
    } else {
      discard(p);
      return;
    }
    p.lifeTime = (2 * p.direction.y) / G + 0.05;
    setBase(p, 1, 1, 1, 0.95);
    scratch(p, rand(0.08, 0.13));
  },
  step(p, dt, _s, env) {
    p.direction.y -= G * dt;
    move(p, dt);
    setSize(p, size0(p));
    paintShaded(p, envelope(p, 0.05, 0.2), env);
  },
};

/** Flat foam rings lying on the water. */
export const rings: LayerKind<Spot> = {
  key: "rings",
  texture: "ring",
  additive: false,
  capacity: 18,
  billboard: "flat",
  group: 1,
  spawn(p, s) {
    const burst = s.queue.next(tmp);
    let big = 1;
    if (!Number.isNaN(burst)) {
      p.position.copyFrom(tmp);
      big = burst || 1;
    } else if (s.rx > 0) {
      p.position.set(
        s.x + rand(-s.rx * 0.5, s.rx),
        s.w,
        s.z + rand(-s.rz, s.rz) * 0.9,
      );
    } else {
      discard(p);
      return;
    }
    p.position.y += 0.03;
    // Flat particles are oriented by their direction; keep it vertical.
    p.direction.set(0.001, 1, 0);
    p.lifeTime = rand(1.0, 1.6);
    setBase(p, 1, 1, 1, 0.6);
    scratch(p, rand(0.3, 0.45) * big);
  },
  step(p, _dt, _s, env) {
    const k = p.age / p.lifeTime;
    setSize(p, size0(p) * (1 + 2.6 * easeOut(k)));
    paintShaded(p, Math.pow(1 - k, 1.4) * Math.min(1, k * 8), env);
  },
};

/** Sun (or moon) glints dancing on nearby water. */
export const glints: LayerKind<WaterSet> = {
  key: "glints",
  texture: "twinkle",
  additive: true,
  capacity: 40,
  group: 1,
  spawn(p, s, env) {
    const n = s.near.length / 3;
    if (!n) {
      discard(p);
      return;
    }
    const i = Math.floor(Math.random() * n) * 3;
    p.position.set(
      s.near[i] + rand(-0.25, 0.25),
      s.near[i + 1] + 0.04,
      s.near[i + 2] + rand(-0.25, 0.25),
    );
    p.lifeTime = rand(0.35, 0.8);
    if (env.night > 0.5) setBase(p, 0.62, 0.78, 1, 0.45);
    else setBase(p, 1, 0.98, 0.9, 0.95);
    scratch(p, rand(0.28, 0.46), rand(-2, 2));
  },
  step(p, dt) {
    const k = p.age / p.lifeTime;
    const s = Math.sin(Math.PI * k);
    setSize(p, size0(p) * (0.5 + 0.5 * s));
    spin(p, dt);
    paint(p, Math.pow(s, 1.5));
  },
};

// ───────────────────────────── electricity ─────────────────────────────

export const sparks: LayerKind<Spot> = {
  key: "sparks",
  texture: "spark",
  additive: true,
  capacity: 40,
  billboard: "stretched",
  spawn(p, s) {
    if (fromQueue(p, s.queue) === null) return;
    const a = rand(0, TAU),
      h = rand(0.3, 1),
      speed = rand(2, 4.2);
    p.direction.set(
      Math.cos(a) * h * speed,
      rand(0.2, 1.2) * speed,
      Math.sin(a) * h * speed,
    );
    p.lifeTime = rand(0.3, 0.65);
    const w = rand(0.6, 1);
    setBase(p, w * 0.7 + 0.3 * (1 - w), 0.96, 1, 1);
    scratch(p, rand(0.14, 0.2));
  },
  step(p, dt) {
    const k = p.age / p.lifeTime;
    p.direction.y -= 7 * dt;
    move(p, dt);
    p.angle = Math.PI / 2;
    setSize(p, size0(p), 2.8, 1);
    paint(p, Math.pow(1 - k, 0.7) * (0.6 + 0.4 * Math.sin(p.age * 70)));
  },
};

export const bolts: LayerKind<Spot> = {
  key: "bolts",
  texture: "bolt",
  additive: true,
  capacity: 8,
  spawn(p, s) {
    if (fromQueue(p, s.queue) === null) return;
    p.position.x += rand(-0.3, 0.3);
    p.position.y += rand(-0.15, 0.3);
    p.position.z += rand(-0.3, 0.3);
    p.lifeTime = rand(0.12, 0.24);
    p.angle = rand(-0.9, 0.9);
    setBase(p, 0.62, 0.96, 1, 1);
    scratch(p, rand(0.35, 0.55));
  },
  step(p) {
    const k = p.age / p.lifeTime;
    setSize(p, size0(p));
    paint(p, (Math.sin(p.age * 90) > -0.3 ? 1 : 0.25) * (1 - k * 0.6));
  },
};

// ───────────────────────────── creatures of light ─────────────────────────────

/** Shared by every meadow: the area centre rides in direction, radii in colorDead.a / cellIndex. */
export const fireflies: LayerKind<Spot> = {
  key: "fireflies",
  texture: "soft",
  additive: true,
  capacity: 96,
  spawn(p, s) {
    p.position.set(
      s.x + rand(-s.rx, s.rx),
      Math.max(0.4, s.y + rand(-0.6, 1.0)),
      s.z + rand(-s.rz, s.rz),
    );
    p.lifeTime = rand(6, 11);
    const m = Math.random();
    // Emitter yellow blended toward lime.
    setBase(
      p,
      s.r * (1 - m) + 0.82 * m,
      s.g * (1 - m) + 1 * m,
      s.b * (1 - m) + 0.42 * m,
      1,
    );
    scratch(p, rand(0.24, 0.36), rand(1.2, 2.4), Math.max(0.5, s.rx));
    p.cellIndex = Math.max(0.5, s.rz);
    p.direction.set(s.x, 0, s.z);
  },
  step(p, dt, _s, env) {
    const t = env.time,
      sd = seed(p) * 40;
    let vx =
      0.32 * Math.sin(t * 0.9 + sd) + 0.18 * Math.sin(t * 2.1 + sd * 0.7);
    let vz =
      0.32 * Math.cos(t * 0.8 + sd * 1.3) + 0.18 * Math.cos(t * 1.9 + sd);
    const vy = 0.14 * Math.sin(t * 1.3 + sd * 0.5);
    // Drift back into the meadow when wandering off.
    const pull = (d: number, r: number) =>
      Math.max(-0.4, Math.min(0.4, (d / r) * 0.25));
    vx += pull(p.direction.x - p.position.x, p.colorDead.a);
    vz += pull(p.direction.z - p.position.z, p.cellIndex);
    p.position.x += vx * dt;
    p.position.y = Math.max(0.3, p.position.y + vy * dt);
    p.position.z += vz * dt;
    const blink = 0.5 + 0.5 * Math.sin(t * p.colorDead.b + sd);
    const b3 = blink * blink * blink;
    setSize(p, size0(p) * (0.75 + 0.35 * blink));
    const dusk = smoothstep(0.35, 0.75, env.night);
    paint(p, envelope(p, 0.12, 0.15) * (0.12 + 0.88 * b3) * dusk);
  },
};

export const lanternMotes: LayerKind<LanternSet> = {
  key: "lantern-motes",
  texture: "spark",
  additive: true,
  capacity: 36,
  spawn(p, s) {
    const n = s.near.length / 3;
    if (!n) {
      discard(p);
      return;
    }
    const i = Math.floor(Math.random() * n) * 3;
    // direction holds the orbit centre for these motes.
    p.direction.set(s.near[i], s.near[i + 1], s.near[i + 2]);
    p.lifeTime = rand(4, 8);
    setBase(p, 1, rand(0.8, 0.92), 0.5, 1);
    const dir = Math.random() < 0.5 ? -1 : 1;
    p.colorDead.set(
      rand(0.07, 0.11),
      Math.random(),
      dir * rand(1.2, 2.3),
      rand(0.35, 0.7),
    );
    p.position.copyFrom(p.direction);
  },
  step(p, _dt, _s, env) {
    const sd = seed(p) * TAU;
    const a = sd + p.colorDead.b * p.age;
    const r = p.colorDead.a * (0.85 + 0.15 * Math.sin(p.age * 3 + sd));
    p.position.set(
      p.direction.x + Math.cos(a) * r,
      p.direction.y + 0.1 + 0.18 * Math.sin(p.age * 2.2 + sd),
      p.direction.z + Math.sin(a) * r,
    );
    const flicker = 0.6 + 0.4 * Math.sin(env.time * 13 + sd * 7);
    setSize(p, size0(p));
    paint(
      p,
      envelope(p, 0.15, 0.2) * flicker * smoothstep(0.4, 0.8, env.night),
    );
  },
};

export const pollen: LayerKind<Spot> = {
  key: "pollen",
  texture: "soft",
  additive: true,
  capacity: 40,
  spawn(p, s, env) {
    const a = rand(0, TAU),
      r = Math.sqrt(Math.random()) * 12;
    const x = s.x + Math.cos(a) * r,
      z = s.z + Math.sin(a) * r;
    p.position.set(x, env.ground(x, z) + rand(0.4, 3.0), z);
    p.direction.set(rand(-0.12, 0.12), rand(-0.03, 0.06), rand(-0.12, 0.12));
    p.lifeTime = rand(5, 9);
    setBase(p, 1, rand(0.88, 0.96), rand(0.55, 0.7), 0.7);
    scratch(p, rand(0.08, 0.14));
  },
  step(p, dt, s, env) {
    move(p, dt);
    const sd = seed(p) * 30;
    p.position.x +=
      (env.windX * 0.25 + Math.sin(env.time * 0.7 + sd) * 0.05) * dt;
    p.position.z +=
      (env.windZ * 0.25 + Math.cos(env.time * 0.6 + sd) * 0.05) * dt;
    const tw = 0.7 + 0.3 * Math.sin(env.time * 3 + sd);
    setSize(p, size0(p));
    paint(p, envelope(p, 0.25, 0.3) * tw * s.fade);
  },
};

// ───────────────────────────── falling foliage ─────────────────────────────

function falling(
  key: string,
  texture: "petal" | "leaf",
  size: [number, number],
  fall: [number, number],
  sway: number,
): LayerKind<Spot> {
  return {
    key,
    texture,
    additive: false,
    capacity: 120,
    spawn(p, s, env) {
      const a = rand(0, TAU),
        r = s.rx * (0.35 + 0.75 * Math.sqrt(Math.random()));
      const x = s.x + Math.cos(a) * r,
        z = s.z + Math.sin(a) * r;
      p.position.set(x, s.y - rand(0.3, 1.0), z);
      const vy = rand(fall[0], fall[1]);
      p.direction.set(0, -vy, 0);
      const ground = env.ground(x, z);
      p.lifeTime = Math.max(0.5, (p.position.y - ground) / vy) + 1.6;
      const v = rand(0.92, 1.08);
      setBase(
        p,
        Math.min(1, s.r * v),
        Math.min(1, s.g * v),
        Math.min(1, s.b * v),
        1,
      );
      p.colorDead.set(
        rand(size[0], size[1]),
        Math.random(),
        rand(-2.5, 2.5),
        ground,
      );
    },
    step(p, dt, _s, env) {
      const ground = p.colorDead.a + 0.03;
      const sd = seed(p) * 20;
      let flip = 1;
      if (p.position.y > ground) {
        const t = env.time;
        p.position.x += (Math.sin(t * 1.7 + sd) * sway + env.windX) * dt;
        p.position.z += (Math.cos(t * 1.3 + sd) * sway * 0.7 + env.windZ) * dt;
        p.position.y +=
          p.direction.y * (0.75 + 0.25 * Math.sin(t * 2.3 + sd)) * dt;
        spin(p, dt);
        flip = 0.35 + 0.65 * Math.abs(Math.cos(t * 2.6 + sd));
        if (p.position.y < ground) p.position.y = ground;
      }
      setSize(p, size0(p), flip, 1);
      const left = p.lifeTime - p.age;
      paintShaded(p, Math.min(1, p.age / 0.4) * Math.min(1, left / 1.2), env);
    },
  };
}
export const petals = falling(
  "petals",
  "petal",
  [0.13, 0.18],
  [0.32, 0.5],
  0.45,
);
export const leaves = falling("leaves", "leaf", [0.17, 0.24], [0.4, 0.62], 0.6);

// ───────────────────────────── magic sparkles ─────────────────────────────

const MAGIC: [number, number, number][] = [
  hexRgb("#ffd45e"),
  hexRgb("#ffd45e"),
  hexRgb("#fff7e8"),
  hexRgb("#5ef2ff"),
  hexRgb("#7dff8a"),
  hexRgb("#ff6bd6"),
];

function twinkle(p: Particle, t: number): number {
  return 0.55 + 0.45 * Math.sin(t * 9 + seed(p) * 40);
}
/**
 * Sparkle colour. By day sparkles blend as solid colour over pale paving, so
 * they stay saturated (no white) and a little deeper; at night some go white.
 */
function sparkleBase(
  p: Particle,
  r: number,
  g: number,
  b: number,
  env: AmbientEnv,
  white: number,
): void {
  if (env.night >= 0.5 && Math.random() < white)
    setBase(p, 1, 0.98, 0.92, 0.95);
  else if (env.night >= 0.5) setBase(p, r, g, b, 0.95);
  else setBase(p, r * 0.86, g * 0.86, b * 0.86, 1);
}
/** Day sparkles are drawn a little larger to read against bright ground. */
const daySize = (env: AmbientEnv) => (env.night >= 0.5 ? 1 : 1.3);

/** Slow rising, swirling sparkles around the astrolabe. */
export const astroSparkles: LayerKind<Spot> = {
  key: "astro-sparkles",
  dayBlend: true,
  texture: "twinkle",
  additive: true,
  capacity: 36,
  spawn(p, s, env) {
    const a = rand(0, TAU),
      r = rand(0.35, 2.0);
    p.position.set(
      s.x + Math.cos(a) * r,
      s.y + rand(-1.2, 0.8),
      s.z + Math.sin(a) * r,
    );
    p.direction.set(0, rand(0.25, 0.55), 0);
    p.lifeTime = rand(2.2, 3.6);
    const c = MAGIC[Math.floor(Math.random() * MAGIC.length)];
    sparkleBase(p, c[0], c[1], c[2], env, 0.2);
    scratch(p, daySize(env) * rand(0.22, 0.4), rand(-1.5, 1.5));
  },
  step(p, dt, s, env) {
    move(p, dt);
    // Gentle swirl around the vertical axis.
    const dx = p.position.x - s.x,
      dz = p.position.z - s.z;
    const w = 0.5 * dt;
    p.position.x = s.x + dx * Math.cos(w) - dz * Math.sin(w);
    p.position.z = s.z + dx * Math.sin(w) + dz * Math.cos(w);
    spin(p, dt);
    setSize(p, size0(p));
    paint(p, envelope(p, 0.2, 0.4) * twinkle(p, env.time) * s.fade);
  },
};

/** Sparkles rising along a straight line from (x - rx, z) to (x + rx, z). */
export const lineSparkles: LayerKind<Spot> = {
  key: "line-sparkles",
  dayBlend: true,
  texture: "twinkle",
  additive: true,
  capacity: 70,
  spawn(p, s, env) {
    p.position.set(
      s.x + rand(-s.rx, s.rx),
      rand(0.05, 0.4),
      s.z + rand(-s.rz, s.rz),
    );
    p.direction.set(rand(-0.05, 0.05), rand(0.45, 0.9), 0);
    p.lifeTime = rand(1.8, 3.0);
    sparkleBase(p, s.r, s.g, s.b, env, 0.3);
    scratch(p, daySize(env) * rand(0.22, 0.38), rand(-1, 1));
  },
  step(p, dt, s, env) {
    move(p, dt);
    spin(p, dt);
    setSize(p, size0(p));
    paint(p, envelope(p, 0.15, 0.45) * twinkle(p, env.time) * s.fade);
  },
};

/** Sparkles rising from a circle of radius rx. */
export const circleSparkles: LayerKind<Spot> = {
  key: "circle-sparkles",
  dayBlend: true,
  texture: "twinkle",
  additive: true,
  capacity: 40,
  spawn(p, s, env) {
    const a = rand(0, TAU),
      r = s.rx + rand(-0.12, 0.12);
    p.position.set(
      s.x + Math.cos(a) * r,
      s.y + rand(0.05, 0.3),
      s.z + Math.sin(a) * r,
    );
    p.direction.set(0, rand(0.35, 0.7), 0);
    p.lifeTime = rand(1.6, 2.6);
    sparkleBase(p, s.r, s.g, s.b, env, 0.35);
    scratch(p, daySize(env) * rand(0.22, 0.38), rand(-1, 1));
  },
  step(p, dt, s, env) {
    move(p, dt);
    spin(p, dt);
    setSize(p, size0(p));
    paint(p, envelope(p, 0.15, 0.45) * twinkle(p, env.time) * s.fade);
  },
};

/** Sparkles spiralling up the quest beacon; positions follow the beacon. */
export const beaconSparkles: LayerKind<Spot> = {
  key: "beacon-sparkles",
  dayBlend: true,
  texture: "twinkle",
  additive: true,
  capacity: 40,
  spawn(p, s, env) {
    p.lifeTime = rand(2.4, 3.6);
    // direction: x = start angle, y = rise speed, z = radius.
    p.direction.set(rand(0, TAU), rand(1.0, 1.6), rand(0.45, 0.9));
    p.position.set(s.x, s.y, s.z);
    sparkleBase(p, 1, 0.84, 0.36, env, 0.4);
    scratch(p, daySize(env) * rand(0.24, 0.4), rand(-2, 2), rand(0.1, 0.5));
  },
  step(p, dt, s, env) {
    const a = p.direction.x + p.age * 2.2;
    const r = p.direction.z * (1 - 0.35 * (p.age / p.lifeTime));
    p.position.set(
      s.x + Math.cos(a) * r,
      s.y + p.colorDead.a + p.direction.y * p.age,
      s.z + Math.sin(a) * r,
    );
    spin(p, dt);
    setSize(p, size0(p));
    paint(p, envelope(p, 0.12, 0.4) * twinkle(p, env.time) * s.fade);
  },
};

/** Golden ripples spreading on the ground under the beacon. */
export const beaconRipples: LayerKind<Spot> = {
  key: "beacon-ripples",
  dayBlend: true,
  texture: "ring",
  additive: true,
  capacity: 6,
  billboard: "flat",
  spawn(p, s) {
    p.position.set(s.x, s.y + 0.06, s.z);
    p.direction.set(0.001, 1, 0);
    p.lifeTime = 1.8;
    setBase(p, 1, 0.84, 0.37, 0.9);
    scratch(p, 0.7);
  },
  step(p, _dt, s) {
    const k = p.age / p.lifeTime;
    p.position.set(s.x, s.y + 0.06, s.z);
    setSize(p, size0(p) * (1 + 3.4 * easeOut(k)));
    paint(p, Math.pow(1 - k, 1.3) * Math.min(1, k * 6) * s.fade);
  },
};
