/**
 * Pooled sprite layers for ambient effects. Each layer is one Babylon
 * ParticleSystem whose spawning and per-frame motion are fully scripted
 * (no built-in emitters, gradients or random ranges), so a recipe reads like a
 * tiny shader: spawn() places a particle, step() poses it from its age.
 *
 * Per-particle scratch (all copied by Particle.copyTo when Babylon recycles):
 * - initialColor: base colour, alpha = peak opacity
 * - colorDead: [r] base size, [g] seed 0..1, [b] spin rad/s, [a] free
 * - direction: velocity in m/s (or an orbit centre for orbiting motes)
 * - cellIndex: free (animation sheets are never enabled)
 */
import {
  Color4,
  DynamicTexture,
  ParticleSystem,
  Vector3,
  type BaseTexture,
  type Particle,
  type Scene,
} from "@babylonjs/core";
import { fxTexture, type FxTextureName } from "./textures";

/** Shared ambient state that recipes read while spawning and stepping. */
export type AmbientEnv = {
  time: number;
  /** 0 day … 1 night. */
  night: number;
  /** Gentle world wind in m/s. */
  windX: number;
  windZ: number;
  /** Tint for unlit, alpha-blended sprites (smoke, petals, mist) at night. */
  shadeR: number;
  shadeG: number;
  shadeB: number;
  low: boolean;
  /** Visual ground height, for things that land. */
  ground(x: number, z: number): number;
};

export type Billboard = "all" | "y" | "flat" | "stretched";
/** Shared fx sprites plus "twinkle", a chunky four-point star owned by the pool. */
export type SpriteName = FxTextureName | "twinkle";

export type LayerKind<S> = {
  key: string;
  texture: SpriteName;
  additive: boolean;
  capacity: number;
  billboard?: Billboard;
  /** 1 draws after the transparent pass (above water); see AMBIENT_OVER_WATER_GROUP. */
  group?: number;
  /**
   * Additive glow vanishes on bright daytime paving, so these layers blend
   * normally by day and switch to additive once night falls.
   */
  dayBlend?: boolean;
  spawn(p: Particle, src: S, env: AmbientEnv): void;
  step(p: Particle, dt: number, src: S, env: AmbientEnv): void;
};

/** Hard cap on live particles across all layers, enforced at emission. */
export class Budget {
  max = 1500;
  used = 0;
  take(n: number): number {
    const k = Math.max(0, Math.min(n, this.max - this.used));
    this.used += k;
    return k;
  }
}

/** Queue of burst origins, consumed in spawn order. */
export class BurstQueue {
  private items: number[] = [];
  private read = 0;
  push(x: number, y: number, z: number, w = 0): void {
    if (this.read >= this.items.length) {
      this.items.length = 0;
      this.read = 0;
    }
    this.items.push(x, y, z, w);
  }
  /** Writes the next origin into `out` and returns its extra value. */
  next(out: Vector3): number {
    if (this.read >= this.items.length) return Number.NaN;
    const i = this.read;
    this.read += 4;
    out.set(this.items[i], this.items[i + 1], this.items[i + 2]);
    return this.items[i + 3];
  }
  clear(): void {
    this.items.length = 0;
    this.read = 0;
  }
}

const MAX_STEP = 0.1;

export class SpriteLayer<S> {
  readonly ps: ParticleSystem;
  private carry = 0;
  private queued = 0;
  private on = false;
  /** Per-spawn sources for layers shared by several emitters. */
  private from: S[] = [];
  private fromRead = 0;
  constructor(
    scene: Scene,
    readonly kind: LayerKind<S>,
    public src: S,
    readonly env: AmbientEnv,
    sprite: (name: SpriteName) => BaseTexture,
  ) {
    const ps = new ParticleSystem(`ambient-${kind.key}`, kind.capacity, scene);
    this.ps = ps;
    ps.particleTexture = sprite(kind.texture);
    ps.blendMode = kind.additive
      ? ParticleSystem.BLENDMODE_ADD
      : ParticleSystem.BLENDMODE_STANDARD;
    ps.updateSpeed = 1 / 60;
    ps.emitter = new Vector3(0, 0, 0);
    ps.emitRate = 0;
    ps.manualEmitCount = 0;
    // Newborns are invisible for the frame Babylon creates them; step() poses them.
    ps.minSize = ps.maxSize = 0;
    ps.minScaleX = ps.maxScaleX = ps.minScaleY = ps.maxScaleY = 1;
    ps.minEmitPower = ps.maxEmitPower = 1;
    ps.minLifeTime = ps.maxLifeTime = 1;
    ps.minAngularSpeed = ps.maxAngularSpeed = 0;
    ps.minInitialRotation = 0;
    ps.maxInitialRotation = Math.PI * 2;
    ps.color1 = new Color4(0, 0, 0, 0);
    ps.color2 = new Color4(0, 0, 0, 0);
    ps.colorDead = new Color4(0, 0, 0, 0);
    ps.gravity = Vector3.Zero();
    const mode = kind.billboard ?? "all";
    ps.isBillboardBased = mode !== "flat";
    if (mode === "y") ps.billboardMode = ParticleSystem.BILLBOARDMODE_Y;
    if (mode === "stretched")
      ps.billboardMode = ParticleSystem.BILLBOARDMODE_STRETCHED;
    ps.renderingGroupId = kind.group ?? 0;
    ps.startPositionFunction = (_m, _pos, p) => {
      p.direction.set(0, 0, 0);
      p.cellIndex = 0;
      const src =
        this.fromRead < this.from.length
          ? this.from[this.fromRead++]
          : this.src;
      kind.spawn(p, src, env);
    };
    ps.startDirectionFunction = () => {};
    ps.updateFunction = (particles) => {
      const dt = Math.min(MAX_STEP, ps._scaledUpdateSpeed);
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.age += dt;
        if (p.age >= p.lifeTime) {
          ps.recycleParticle(p);
          i--;
          continue;
        }
        kind.step(p, dt, this.src, env);
      }
    };
  }
  get live(): number {
    return this.ps.getActiveCount() + this.queued;
  }
  get running(): boolean {
    return this.on;
  }
  /** Request n new particles this frame (clamped by the budget). */
  emit(n: number, budget: Budget): number {
    if (n <= 0) return 0;
    const k = budget.take(n);
    if (!k) return 0;
    if (!this.on) {
      this.ps.start();
      this.on = true;
    }
    const pending = this.ps.manualEmitCount > 0 ? this.ps.manualEmitCount : 0;
    this.ps.manualEmitCount = pending + k;
    this.queued += k;
    return k;
  }
  /** Emit n particles spawned from `src` (a layer shared by several emitters). */
  emitFrom(src: S, n: number, budget: Budget): number {
    const k = this.emit(n, budget);
    for (let i = 0; i < k; i++) this.from.push(src);
    return k;
  }
  /** Continuous emission at `rate` particles per second. */
  flow(rate: number, dt: number, budget: Budget): void {
    this.carry += Math.max(0, rate) * dt;
    const n = Math.floor(this.carry);
    if (n > 0) {
      this.carry -= n;
      this.emit(n, budget);
    }
    // Do not bank more than a couple of particles while starved.
    if (this.carry > 2) this.carry = 2;
  }
  /** Keep roughly `target` particles alive, adding at most `rate` per second. */
  fill(target: number, rate: number, dt: number, budget: Budget): void {
    const missing = Math.floor(target) - this.live;
    if (missing <= 0) {
      this.carry = 0;
      return;
    }
    this.carry += rate * dt;
    const n = Math.min(missing, Math.floor(this.carry));
    if (n > 0) {
      this.carry -= n;
      this.emit(n, budget);
    }
    if (this.carry > 2) this.carry = 2;
  }
  /** Called once per frame before any emission. */
  sync(): void {
    // Last frame's spawns have been consumed by the scene's particle animation.
    this.from.length = 0;
    this.fromRead = 0;
    if (this.kind.dayBlend)
      this.ps.blendMode =
        this.env.night >= 0.5
          ? ParticleSystem.BLENDMODE_ADD
          : ParticleSystem.BLENDMODE_STANDARD;
    // manualEmitCount is consumed by the scene's particle animation.
    if (this.ps.manualEmitCount <= 0) this.queued = 0;
    else this.queued = this.ps.manualEmitCount;
  }
  /**
   * Stop animating once the last particle has died. Pass `keepCarry` while the
   * layer is still emitting, so slow emitters keep accumulating fractions.
   */
  idle(keepCarry = false): boolean {
    if (this.ps.manualEmitCount > 0) return false;
    if (this.ps.getActiveCount() > 0) return false;
    if (this.on) {
      this.ps.stop();
      this.on = false;
    }
    if (!keepCarry) this.carry = 0;
    return true;
  }
  dispose(): void {
    // Never dispose the shared fx textures.
    this.ps.dispose(false);
  }
}

/** Pool of stopped layers per kind, so emitters that come and go reuse systems. */
export class LayerPool {
  private free = new Map<string, SpriteLayer<unknown>[]>();
  readonly all = new Set<SpriteLayer<unknown>>();
  private twinkle: DynamicTexture | null = null;
  private sprite = (name: SpriteName): BaseTexture => {
    if (name !== "twinkle") return fxTexture(this.scene, name);
    return (this.twinkle ??= twinkleTexture(this.scene));
  };
  constructor(
    private scene: Scene,
    private env: AmbientEnv,
  ) {}
  acquire<S>(kind: LayerKind<S>, src: S): SpriteLayer<S> {
    const list = this.free.get(kind.key);
    const reused = list?.pop() as SpriteLayer<S> | undefined;
    if (reused) {
      reused.src = src;
      return reused;
    }
    const layer = new SpriteLayer(this.scene, kind, src, this.env, this.sprite);
    this.all.add(layer as SpriteLayer<unknown>);
    return layer;
  }
  release(layer: SpriteLayer<unknown>): void {
    let list = this.free.get(layer.kind.key);
    if (!list) this.free.set(layer.kind.key, (list = []));
    list.push(layer);
  }
  sync(): void {
    for (const layer of this.all) layer.sync();
  }
  stats(): { systems: number; particles: number } {
    let systems = 0,
      particles = 0;
    for (const layer of this.all) {
      if (layer.running) systems++;
      particles += layer.ps.getActiveCount();
    }
    return { systems, particles };
  }
  dispose(): void {
    for (const layer of this.all) layer.dispose();
    this.all.clear();
    this.free.clear();
    this.twinkle?.dispose();
    this.twinkle = null;
  }
}

/** Chunky four-point twinkle with a soft halo: reads as a star even at 12 px. */
function twinkleTexture(scene: Scene): DynamicTexture {
  const size = 64;
  const tex = new DynamicTexture(
    "ambient-twinkle",
    { width: size, height: size },
    scene,
    true,
  );
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, size, size);
  const c = size / 2;
  const halo = ctx.createRadialGradient(c, c, 0, c, c, c - 1);
  halo.addColorStop(0, "rgba(255,255,255,0.55)");
  halo.addColorStop(0.45, "rgba(255,255,255,0.18)");
  halo.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, size, size);
  // Superellipse |x|^p + |y|^p = r^p with p < 1: fat middle, pointed arms.
  const r = 29,
    pw = 0.62;
  ctx.beginPath();
  for (let i = 0; i <= 96; i++) {
    const t = (i / 96) * Math.PI * 2;
    const cs = Math.cos(t),
      sn = Math.sin(t);
    const x = Math.sign(cs) * Math.pow(Math.abs(cs), 2 / pw) * r;
    const y = Math.sign(sn) * Math.pow(Math.abs(sn), 2 / pw) * r;
    if (i) ctx.lineTo(c + x, c + y);
    else ctx.moveTo(c + x, c + y);
  }
  ctx.closePath();
  ctx.fillStyle = "#fff";
  ctx.fill();
  tex.hasAlpha = true;
  tex.update();
  return tex;
}

// ───────────────────────────── recipe helpers ─────────────────────────────

export const rand = (a = 0, b = 1): number => a + Math.random() * (b - a);
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export function smoothstep(a: number, b: number, v: number): number {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
}
/** Opacity envelope over a particle's life: ramps in over `inn`, out over `out` (fractions). */
export function envelope(p: Particle, inn: number, out: number): number {
  const k = p.age / p.lifeTime;
  const a = inn > 0 ? clamp01(k / inn) : 1;
  const b = out > 0 ? clamp01((1 - k) / out) : 1;
  return a * b;
}
/** Set base colour (hex or rgb 0..1) and peak alpha. */
export function setBase(
  p: Particle,
  r: number,
  g: number,
  b: number,
  a: number,
): void {
  p.initialColor.set(r, g, b, a);
}
export function hexRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.replace("#", ""), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}
/** Pose colour from base × alpha. Additive layers use alpha as intensity. */
export function paint(p: Particle, alpha: number, shade = 1): void {
  const c = p.initialColor;
  p.color.set(c.r * shade, c.g * shade, c.b * shade, c.a * alpha);
}
/** Pose colour for unlit alpha sprites with the night tint. */
export function paintShaded(p: Particle, alpha: number, env: AmbientEnv): void {
  const c = p.initialColor;
  p.color.set(
    c.r * env.shadeR,
    c.g * env.shadeG,
    c.b * env.shadeB,
    c.a * alpha,
  );
}
export function setSize(p: Particle, size: number, sx = 1, sy = 1): void {
  p.size = size;
  p.scale.x = sx;
  p.scale.y = sy;
}
/** Integrate velocity (direction) into position. */
export function move(p: Particle, dt: number): void {
  p.position.x += p.direction.x * dt;
  p.position.y += p.direction.y * dt;
  p.position.z += p.direction.z * dt;
}
/** Hide a particle that could not find a valid spawn spot; it dies next frame. */
export function discard(p: Particle): void {
  p.lifeTime = 1e-4;
  p.initialColor.set(0, 0, 0, 0);
  p.colorDead.set(0, 0, 0, 0);
}
