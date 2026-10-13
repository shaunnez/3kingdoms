/**
 * Sprite particles for combat. One persistent ParticleSystem per texture and
 * blend "channel"; bursts are queued with their own origin, shape, velocity,
 * colours, sizes and lifetimes, and each new particle pulls its parameters
 * from that queue. A custom update gives cartoon curves (pop-in, shrink-out,
 * twinkle), drag and gravity per preset. Nothing is allocated per frame.
 */
import {
  Color3,
  Color4,
  ParticleSystem,
  type AbstractMesh,
  type BaseTexture,
  type Matrix,
  type Particle,
  type Scene,
  type Vector3,
} from "@babylonjs/core";

export const SIZE_POP = 0,
  SIZE_SHRINK = 1,
  SIZE_GROW = 2,
  SIZE_CONST = 3,
  SIZE_TWINKLE = 4,
  SIZE_SWELL = 5;
export const ALPHA_FADE = 0,
  ALPHA_LATE = 1,
  ALPHA_INOUT = 2,
  ALPHA_FLICKER = 3;

export type Preset = Readonly<{
  /** Channel key: texture name + blend + stretch share one system. */
  tex: string;
  blend: "add" | "alpha";
  /** 0 = round billboard; otherwise velocity-aligned with this length ratio. */
  stretch: number;
  size: number;
  alpha: number;
  /** m/s² downwards (negative floats up). */
  gravity: number;
  /** Fraction of velocity lost per second. */
  drag: number;
  /** Max spin, rad/s. */
  spin: number;
}>;

export const SHAPE_SPHERE = 0,
  SHAPE_RING = 1,
  SHAPE_BOX = 2,
  SHAPE_LINE = 3;
export const VEL_RADIAL = 0,
  VEL_DIR = 1,
  VEL_INWARD = 2,
  VEL_RANDOM = 3;

/** A burst description. Callers fill `Sparks.spec` and call `emit`. */
export class EmitSpec {
  x = 0;
  y = 0;
  z = 0;
  shape = SHAPE_SPHERE;
  /** Sphere/ring radius; box half-extents use r (x/z) and h (y). */
  r = 0;
  h = 0;
  /** Line end (SHAPE_LINE). */
  x2 = 0;
  y2 = 0;
  z2 = 0;
  vel = VEL_RADIAL;
  speed0 = 1;
  speed1 = 2;
  /** Extra vertical velocity range. */
  up0 = 0;
  up1 = 0;
  dx = 0;
  dy = 1;
  dz = 0;
  /** Cone spread for VEL_DIR (0 = exact, 1 = hemisphere). */
  spread = 0.3;
  /** Flatten radial directions towards the horizontal (0..1). */
  flat = 0;
  readonly c1 = new Color4(1, 1, 1, 1);
  readonly c2 = new Color4(1, 1, 1, 1);
  readonly end = new Color3(1, 1, 1);
  size0 = 0.1;
  size1 = 0.2;
  life0 = 0.4;
  life1 = 0.8;
  /** Internal: particles left to create from this burst. */
  remaining = 0;
  preset: Preset | null = null;

  reset(): this {
    this.x = this.y = this.z = 0;
    this.shape = SHAPE_SPHERE;
    this.r = this.h = 0;
    this.x2 = this.y2 = this.z2 = 0;
    this.vel = VEL_RADIAL;
    this.speed0 = 1;
    this.speed1 = 2;
    this.up0 = this.up1 = 0;
    this.dx = this.dz = 0;
    this.dy = 1;
    this.spread = 0.3;
    this.flat = 0;
    this.c1.set(1, 1, 1, 1);
    this.c2.set(1, 1, 1, 1);
    this.end.set(1, 1, 1);
    this.size0 = 0.1;
    this.size1 = 0.2;
    this.life0 = 0.4;
    this.life1 = 0.8;
    this.remaining = 0;
    this.preset = null;
    return this;
  }
  at(p: { x: number; y: number; z: number }, dy = 0): this {
    this.x = p.x;
    this.y = p.y + dy;
    this.z = p.z;
    return this;
  }
  /** Colours: start between a and b (alpha `alpha`), ending tinted towards `end`. */
  colors(a: Color3, b: Color3 = a, end: Color3 = b, alpha = 1): this {
    this.c1.set(a.r, a.g, a.b, alpha);
    this.c2.set(b.r, b.g, b.b, alpha);
    this.end.copyFrom(end);
    return this;
  }
  sizes(a: number, b: number): this {
    this.size0 = a;
    this.size1 = b;
    return this;
  }
  lives(a: number, b: number): this {
    this.life0 = a;
    this.life1 = b;
    return this;
  }
  speeds(a: number, b: number, up0 = 0, up1 = up0): this {
    this.speed0 = a;
    this.speed1 = b;
    this.up0 = up0;
    this.up1 = up1;
    return this;
  }
  dir(x: number, y: number, z: number, spread = 0.3): this {
    this.vel = VEL_DIR;
    const l = Math.hypot(x, y, z) || 1;
    this.dx = x / l;
    this.dy = y / l;
    this.dz = z / l;
    this.spread = spread;
    return this;
  }
  copyFrom(o: EmitSpec): void {
    this.x = o.x;
    this.y = o.y;
    this.z = o.z;
    this.shape = o.shape;
    this.r = o.r;
    this.h = o.h;
    this.x2 = o.x2;
    this.y2 = o.y2;
    this.z2 = o.z2;
    this.vel = o.vel;
    this.speed0 = o.speed0;
    this.speed1 = o.speed1;
    this.up0 = o.up0;
    this.up1 = o.up1;
    this.dx = o.dx;
    this.dy = o.dy;
    this.dz = o.dz;
    this.spread = o.spread;
    this.flat = o.flat;
    this.c1.copyFrom(o.c1);
    this.c2.copyFrom(o.c2);
    this.end.copyFrom(o.end);
    this.size0 = o.size0;
    this.size1 = o.size1;
    this.life0 = o.life0;
    this.life1 = o.life1;
  }
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const QUEUE = 64;

class Channel {
  readonly system: ParticleSystem;
  private queue: EmitSpec[] = [];
  private read = 0;
  private write = 0;
  private pending = 0;

  constructor(
    scene: Scene,
    key: string,
    texture: BaseTexture,
    blend: "add" | "alpha",
    stretched: boolean,
    capacity: number,
    emitter: AbstractMesh,
  ) {
    for (let i = 0; i < QUEUE; i++) this.queue.push(new EmitSpec());
    const ps = new ParticleSystem(`combat-ps-${key}`, capacity, scene);
    ps.particleTexture = texture;
    ps.emitter = emitter;
    ps.emitRate = 0;
    ps.manualEmitCount = 0;
    ps.updateSpeed = 1 / 60;
    ps.minEmitPower = ps.maxEmitPower = 1;
    ps.minLifeTime = ps.maxLifeTime = 1;
    // Newborn particles render once before our update touches them: hide that frame.
    ps.minSize = ps.maxSize = 0;
    ps.color1 = new Color4(0, 0, 0, 0);
    ps.color2 = new Color4(0, 0, 0, 0);
    ps.colorDead = new Color4(0, 0, 0, 0);
    ps.blendMode =
      blend === "add"
        ? ParticleSystem.BLENDMODE_ADD
        : ParticleSystem.BLENDMODE_STANDARD;
    ps.isBillboardBased = true;
    ps.billboardMode = stretched
      ? ParticleSystem.BILLBOARDMODE_STRETCHED
      : ParticleSystem.BILLBOARDMODE_ALL;
    ps.startPositionFunction = this.spawn;
    ps.startDirectionFunction = noop;
    ps.updateFunction = this.step;
    ps.start();
    this.system = ps;
  }

  /** Queue `count` particles described by `spec`; returns false when full. */
  push(spec: EmitSpec, preset: Preset, count: number): boolean {
    if (count <= 0) return true;
    if (this.pending > 0 && this.system.manualEmitCount === 0) {
      // Last frame's leftovers (capacity reached) are stale: drop them.
      this.read = this.write;
      this.pending = 0;
    }
    const next = (this.write + 1) % QUEUE;
    if (next === this.read) return false;
    const slot = this.queue[this.write];
    slot.copyFrom(spec);
    slot.preset = preset;
    slot.remaining = count;
    this.write = next;
    this.pending += count;
    this.system.manualEmitCount = this.pending;
    return true;
  }

  get active(): number {
    return this.system.getActiveCount();
  }

  private spawn = (
    _world: Matrix,
    pos: Vector3,
    particle: Particle,
    _local: boolean,
  ): void => {
    if (this.read === this.write) {
      particle.lifeTime = 0.001;
      particle.metadata = null;
      return;
    }
    const e = this.queue[this.read];
    if (--e.remaining <= 0) this.read = (this.read + 1) % QUEUE;
    this.pending = Math.max(0, this.pending - 1);
    // Position by shape.
    let ox = 0,
      oy = 0,
      oz = 0;
    if (e.shape === SHAPE_SPHERE) {
      const u = Math.random() * 2 - 1,
        a = Math.random() * Math.PI * 2,
        s = Math.sqrt(1 - u * u),
        r = e.r * Math.cbrt(Math.random());
      ox = Math.cos(a) * s * r;
      oy = u * r;
      oz = Math.sin(a) * s * r;
    } else if (e.shape === SHAPE_RING) {
      const a = Math.random() * Math.PI * 2;
      ox = Math.cos(a) * e.r;
      oz = Math.sin(a) * e.r;
      oy = Math.random() * e.h;
    } else if (e.shape === SHAPE_BOX) {
      ox = (Math.random() * 2 - 1) * e.r;
      oy = Math.random() * e.h;
      oz = (Math.random() * 2 - 1) * e.r;
    } else {
      const t = Math.random();
      ox = (e.x2 - e.x) * t + (Math.random() * 2 - 1) * e.r;
      oy = (e.y2 - e.y) * t + (Math.random() * 2 - 1) * e.r;
      oz = (e.z2 - e.z) * t + (Math.random() * 2 - 1) * e.r;
    }
    pos.set(e.x + ox, e.y + oy, e.z + oz);
    // Velocity by mode.
    const speed = rand(e.speed0, e.speed1);
    let vx = 0,
      vy = 0,
      vz = 0;
    if (e.vel === VEL_DIR) {
      vx = e.dx + (Math.random() * 2 - 1) * e.spread;
      vy = e.dy + (Math.random() * 2 - 1) * e.spread;
      vz = e.dz + (Math.random() * 2 - 1) * e.spread;
    } else if (e.vel === VEL_RANDOM || (ox === 0 && oy === 0 && oz === 0)) {
      vx = Math.random() * 2 - 1;
      vy = Math.random() * 2 - 1;
      vz = Math.random() * 2 - 1;
    } else {
      vx = ox;
      vy = e.shape === SHAPE_RING || e.shape === SHAPE_LINE ? 0 : oy;
      vz = oz;
      if (e.vel === VEL_INWARD) {
        vx = -vx;
        vy = -vy;
        vz = -vz;
      }
    }
    vy *= 1 - e.flat;
    const l = Math.hypot(vx, vy, vz) || 1;
    particle.direction.set(
      (vx / l) * speed,
      (vy / l) * speed + rand(e.up0, e.up1),
      (vz / l) * speed,
    );
    particle.lifeTime = rand(e.life0, e.life1);
    // Per-particle look lives in fields the system copies when recycling.
    const k = Math.random();
    particle.initialColor.set(
      e.c1.r + (e.c2.r - e.c1.r) * k,
      e.c1.g + (e.c2.g - e.c1.g) * k,
      e.c1.b + (e.c2.b - e.c1.b) * k,
      e.c1.a + (e.c2.a - e.c1.a) * k,
    );
    particle.colorDead.set(e.end.r, e.end.g, e.end.b, rand(e.size0, e.size1));
    particle.metadata = e.preset;
  };

  private step = (particles: Particle[]): void => {
    const dt = this.system._scaledUpdateSpeed;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const preset = p.metadata as Preset | null;
      if (p.age === 0 && preset) {
        p.angularSpeed = rand(-preset.spin, preset.spin);
        p.angle = preset.stretch ? Math.PI / 2 : Math.random() * Math.PI * 2;
      }
      p.age += dt;
      if (p.age >= p.lifeTime || !preset) {
        this.system.recycleParticle(p);
        i--;
        continue;
      }
      const r = p.age / p.lifeTime;
      const v = p.direction;
      const drag = Math.max(0, 1 - preset.drag * dt);
      v.x *= drag;
      v.z *= drag;
      v.y = v.y * drag - preset.gravity * dt;
      p.position.x += v.x * dt;
      p.position.y += v.y * dt;
      p.position.z += v.z * dt;
      if (!preset.stretch) p.angle += p.angularSpeed * dt;
      // Size curve via scale, base size from colorDead.a.
      let s = 1;
      switch (preset.size) {
        case SIZE_POP:
          s = r < 0.12 ? backOut(r / 0.12) : 1 - smooth(0.55, 1, r);
          break;
        case SIZE_SHRINK:
          s = Math.min(1, r * 12) * (1 - r);
          break;
        case SIZE_GROW:
          s = 0.45 + 0.85 * (1 - (1 - r) * (1 - r));
          break;
        case SIZE_TWINKLE:
          s =
            (r < 0.1 ? r / 0.1 : 1 - smooth(0.6, 1, r)) *
            (0.65 + 0.35 * Math.sin(p.age * 22 + p.id));
          break;
        case SIZE_SWELL:
          s = r < 0.15 ? backOut(r / 0.15) * 0.8 : 0.8 + 0.5 * r;
          break;
      }
      p.size = p.colorDead.a;
      const stretch = preset.stretch || 1;
      p.scale.x = s * stretch;
      p.scale.y = s;
      let a = 1;
      switch (preset.alpha) {
        case ALPHA_FADE:
          a = 1 - r * r;
          break;
        case ALPHA_LATE:
          a = 1 - smooth(0.6, 1, r);
          break;
        case ALPHA_INOUT:
          a = smooth(0, 0.2, r) * (1 - smooth(0.55, 1, r));
          break;
        case ALPHA_FLICKER:
          a = (1 - r) * (0.55 + 0.45 * Math.sin(p.age * 38 + p.id * 1.7));
          break;
      }
      const c0 = p.initialColor,
        c1 = p.colorDead,
        k = r;
      p.color.r = c0.r + (c1.r - c0.r) * k;
      p.color.g = c0.g + (c1.g - c0.g) * k;
      p.color.b = c0.b + (c1.b - c0.b) * k;
      p.color.a = c0.a * a;
    }
  };

  dispose(): void {
    this.system.dispose(false);
  }
}

const noop = () => {};
function smooth(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
function backOut(t: number): number {
  const c = 2.2;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
}

/** All combat particle channels, created lazily (one system per channel). */
export class Sparks {
  /** Scratch burst description; fill it, then call emit(). */
  readonly spec = new EmitSpec();
  /** Global particle budget multiplier (0.5 on Low). */
  scale = 1;
  private channels = new Map<string, Channel>();

  constructor(
    private scene: Scene,
    private emitter: AbstractMesh,
    private texture: (name: string) => BaseTexture,
    private capacity = 320,
    /** Hard cap on concurrent particle systems. */
    private maxSystems = 24,
  ) {}

  private channel(preset: Preset): Channel | null {
    const key = `${preset.tex}-${preset.blend}-${preset.stretch ? "s" : "b"}`;
    let ch = this.channels.get(key);
    if (!ch) {
      if (this.channels.size >= this.maxSystems) return null;
      ch = new Channel(
        this.scene,
        key,
        this.texture(preset.tex),
        preset.blend,
        preset.stretch > 0,
        this.capacity,
        this.emitter,
      );
      this.channels.set(key, ch);
    }
    return ch;
  }

  /** Emit `count` particles using the current spec (scaled by `scale` unless `exact`). */
  emit(preset: Preset, count: number, exact = false): void {
    const n = exact
      ? count
      : Math.max(count > 0 ? 1 : 0, Math.round(count * this.scale));
    if (!n) return;
    this.channel(preset)?.push(this.spec, preset, n);
  }

  /** Create every channel up front so shaders compile during loading. */
  prewarm(presets: readonly Preset[]): void {
    for (const p of presets) this.channel(p);
  }

  /** Systems that currently hold live particles. */
  get busySystems(): number {
    let n = 0;
    for (const ch of this.channels.values()) if (ch.active > 0) n++;
    return n;
  }
  get systems(): number {
    return this.channels.size;
  }
  get particles(): number {
    let n = 0;
    for (const ch of this.channels.values()) n += ch.active;
    return n;
  }

  dispose(): void {
    for (const ch of this.channels.values()) ch.dispose();
    this.channels.clear();
  }
}
