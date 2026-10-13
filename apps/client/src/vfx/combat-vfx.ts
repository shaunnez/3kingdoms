/**
 * Event-driven combat effects for the voxel presentation. Server-confirmed
 * events (cast, resolve, hit, miss, heal, dodge, death, loot, level) become
 * short, colourful bursts; snapshot state (casts, statuses, projectiles,
 * mines) drives persistent, smoothly faded visuals. Telegraphs are drawn
 * alpha-blended with an ink rim so they stay readable over every effect.
 * Presentation only: the simulation owns every rule.
 */
import {
  Color3,
  Mesh,
  Vector3,
  type Material,
  type Node,
  type Scene,
  type TransformNode,
} from "@babylonjs/core";
import type {
  ActorView,
  CombatEvent,
  Snapshot,
} from "../../../../packages/contracts/game";
import type { CombatVfxModule, VfxHooks } from "../voxel/api";
import { C, Kit } from "./combat-kit";
import { droneData, mineData } from "./combat-models";
import {
  ALPHA_FADE,
  ALPHA_FLICKER,
  ALPHA_INOUT,
  ALPHA_LATE,
  SHAPE_BOX,
  SHAPE_LINE,
  SHAPE_RING,
  SIZE_CONST,
  SIZE_GROW,
  SIZE_POP,
  SIZE_SHRINK,
  SIZE_TWINKLE,
  Sparks,
  VEL_INWARD,
  VEL_RADIAL,
  VEL_RANDOM,
  type EmitSpec,
  type Preset,
} from "./combat-particles";
import { Arc, Trail } from "./combat-ribbons";
import { Debris } from "./debris";
import type { MeshPool } from "./pool";

const CULL = 27;
const SHOT_SPEED = 18;
const TAU = Math.PI * 2;
const LOCAL_Z = new Vector3(0, 0, 1);
const TELEGRAPH_RADIUS = 0.85;
const LANE_LENGTH = 16;
const LANE_WIDTH = 1.5;

// ───────────────────────────── curves ─────────────────────────────

const E_OUT = 1,
  E_BACK = 2,
  E_SNAP = 3,
  E_IN = 4;
const F_OUT = 0,
  F_LATE = 1,
  F_FLASH = 2,
  F_INOUT = 3;

function ease(kind: number, k: number): number {
  switch (kind) {
    case E_OUT:
      return 1 - (1 - k) ** 3;
    case E_BACK: {
      const c = 2.4,
        u = k - 1;
      return 1 + (c + 1) * u * u * u + c * u * u;
    }
    case E_SNAP:
      return 1 - (1 - k) ** 8;
    case E_IN:
      return k * k;
    default:
      return k;
  }
}
function fade(kind: number, k: number): number {
  switch (kind) {
    case F_LATE:
      return 1 - smooth(0.6, 1, k);
    case F_FLASH:
      return k < 0.12 ? 1 : (1 - (k - 0.12) / 0.88) ** 2;
    case F_INOUT:
      return smooth(0, 0.15, k) * (1 - smooth(0.6, 1, k));
    default:
      return (1 - k) ** 1.4;
  }
}
function smooth(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const rand = (a: number, b: number) => a + Math.random() * (b - a);

// ───────────────────────────── particle presets ─────────────────────────────

const preset = (
  tex: string,
  blend: "add" | "alpha",
  stretch: number,
  size: number,
  alpha: number,
  gravity: number,
  drag: number,
  spin: number,
): Preset => ({ tex, blend, stretch, size, alpha, gravity, drag, spin });

const P = {
  spark: preset("spark", "add", 3.4, SIZE_SHRINK, ALPHA_FADE, 9, 2.4, 0),
  glint: preset("spark", "add", 0, SIZE_POP, ALPHA_FADE, 0, 3, 0),
  ember: preset("spark", "add", 0, SIZE_SHRINK, ALPHA_FLICKER, -2.2, 1, 0),
  star: preset("star4", "add", 0, SIZE_POP, ALPHA_LATE, 1.5, 3.5, 5),
  twinkle: preset("star4", "add", 0, SIZE_TWINKLE, ALPHA_LATE, -0.3, 1.6, 2),
  toon: preset("dizzy", "alpha", 0, SIZE_POP, ALPHA_LATE, 7, 1.8, 7),
  burst5: preset("star5", "add", 0, SIZE_POP, ALPHA_LATE, 2.5, 1.8, 4),
  puff: preset("puff", "alpha", 0, SIZE_GROW, ALPHA_LATE, -0.5, 3.6, 1.2),
  smoke: preset("smoke", "alpha", 0, SIZE_GROW, ALPHA_INOUT, -0.6, 1.4, 0.8),
  wisp: preset("smoke", "alpha", 0, SIZE_GROW, ALPHA_INOUT, -0.7, 0.8, 0.6),
  plus: preset("plusS", "alpha", 0, SIZE_POP, ALPHA_LATE, -1.6, 1.2, 0),
  heart: preset("heartS", "alpha", 0, SIZE_POP, ALPHA_LATE, -1.2, 1.5, 1),
  flake: preset("flake", "add", 0, SIZE_POP, ALPHA_LATE, 1.2, 2.2, 3),
  bolt: preset("bolt", "add", 0, SIZE_POP, ALPHA_FLICKER, 0, 4, 2),
  streak: preset("streak", "add", 1, SIZE_SHRINK, ALPHA_FADE, 0, 3, 0),
  coin: preset("coin", "alpha", 0, SIZE_POP, ALPHA_LATE, 11, 0.8, 0),
  confetti: preset("pixel", "alpha", 0, SIZE_CONST, ALPHA_LATE, 3.2, 2.4, 9),
} as const;

// ───────────────────────────── palettes ─────────────────────────────

const FUR = [C.plum, C.charcoal, C.plumLight] as const;
const GUARD_BITS = [C.gold, C.crimson, C.steel] as const;
const KNIGHT_BITS = [C.steel, C.tabard, C.steelDark] as const;
const CYBORG_BITS = [C.shell, C.cyan, C.steelDark] as const;
const ROBE_BITS = [C.lavender, C.steel] as const;
const APRON_BITS = [C.grass, C.dirt] as const;
const GROUND_BITS = [C.stone, C.dirt, C.grass, C.stoneDark] as const;
const MINE_BITS = [C.slate, C.steelDark, C.cyan, C.gold] as const;
const GOLD_BITS = [C.gold, C.goldDeep, C.amber] as const;
const SHACKLE_BITS = [C.steelDark, C.steel, C.gold] as const;

// ───────────────────────────── records ─────────────────────────────

/** A pooled mesh animated by parameters (scale curve, fade, spin, rise, follow). */
class Fx {
  mesh: Mesh | null = null;
  pool: MeshPool | null = null;
  t = 0;
  dur = 1;
  delay = 0;
  readonly s0 = new Vector3(1, 1, 1);
  readonly s1 = new Vector3(1, 1, 1);
  ease = E_OUT;
  alpha = 1;
  fade = F_OUT;
  spin = 0;
  pitch = 0;
  roll = 0;
  rise = 0;
  follow: string | null = null;
  readonly off = new Vector3();
}

class Slot {
  w = 0;
  t = 0;
  meshes: (Mesh | null)[] = [];
  pools: (MeshPool | null)[] = [];
}

const ACC_TRAIL = 0,
  ACC_CHARGE = 1,
  ACC_OUTLAW = 2,
  ACC_DODGE = 3,
  ACC_RALLY = 4,
  ACC_OATH = 5,
  ACC_ROOT = 6,
  ACC_FROST = 7,
  ACC_OVER = 8,
  ACC_ARC = 9,
  ACC_SPARE = 10;

class ActorFx {
  seen = 0;
  readonly pos = new Vector3();
  heading = 0;
  height = 1.9;
  wolf = false;
  frostUntil = 0;
  overclockUntil = 0;
  rootUntil = 0;
  dronePulse = 0;
  readonly guard = new Slot();
  readonly oath = new Slot();
  readonly rally = new Slot();
  readonly dizzy = new Slot();
  readonly root = new Slot();
  readonly protect = new Slot();
  readonly drone = new Slot();
  readonly overclock = new Slot();
  readonly frost = new Slot();
  readonly charge = new Slot();
  readonly tele = new Slot();
  readonly slots: Slot[];
  readonly acc = new Float32Array(ACC_SPARE + 1);
  trail: Trail | null = null;
  trailUntil = 0;
  trailMaterial: Material | null = null;
  castStart = -1;
  teleProgress = 0;
  teleRadius = 0;
  teleColor: Color3 = C.enemy;
  readonly telePos = new Vector3();
  constructor(readonly id: string) {
    this.slots = [
      this.guard,
      this.oath,
      this.rally,
      this.dizzy,
      this.root,
      this.protect,
      this.drone,
      this.overclock,
      this.frost,
      this.charge,
      this.tele,
    ];
  }
  get idle(): boolean {
    if (this.trail) return false;
    for (const s of this.slots) if (s.w > 0 || s.meshes.length) return false;
    return true;
  }
}

class ShotFx {
  id = 0;
  seen = 0;
  key = "";
  owner = "";
  x = 0;
  y = 1.1;
  z = 0;
  dx = 0;
  dz = 1;
  age = 0;
  acc = 0;
  readonly meshes: (Mesh | null)[] = [null, null, null];
  readonly pools: (MeshPool | null)[] = [null, null, null];
}

class MineFx {
  id = 0;
  seen = 0;
  owner = "";
  x = 0;
  y = 0;
  z = 0;
  born = 0;
  armedAt = -1;
  exploded = false;
  own = false;
  readonly meshes: (Mesh | null)[] = [null, null, null, null];
  readonly pools: (MeshPool | null)[] = [null, null, null, null];
}

class Orb {
  mesh: Mesh | null = null;
  pool: MeshPool | null = null;
  target = "";
  wisp = false;
  readonly p = new Vector3();
  readonly v = new Vector3();
  t = 0;
  hold = 0;
  acc = 0;
}

// ───────────────────────────── module ─────────────────────────────

export class CombatVfx implements CombatVfxModule {
  private kit: Kit;
  private sparks: Sparks;
  private debris: Debris;
  private emitter: Mesh;
  private time = 0;
  private frame = 0;
  private lowMode = false;
  private disposed = false;
  private fxCap = 120;
  private fxs: Fx[] = [];
  private fxFree: Fx[] = [];
  private actors = new Map<string, ActorFx>();
  private shots = new Map<number, ShotFx>();
  private mines = new Map<number, MineFx>();
  private orbs: Orb[] = [];
  private orbFree: Orb[] = [];
  private trailFree: Trail[] = [];
  private trailCount = 0;
  private arcs: Arc[] = [];
  private later: { at: number; run: () => void }[] = [];
  private snapshot: Snapshot | null = null;
  private byId = new Map<string, ActorView>();
  private snapNow = -1;
  private snapAt = 0;
  private hasSelf = false;
  private readonly self = new Vector3();
  private readonly eye = new Vector3();
  // Scratch vectors. v0–v5 belong to event handlers, u0–u5 to update paths.
  private readonly v0 = new Vector3();
  private readonly v1 = new Vector3();
  private readonly v2 = new Vector3();
  private readonly v3 = new Vector3();
  private readonly v4 = new Vector3();
  private readonly v5 = new Vector3();
  private readonly u0 = new Vector3();
  private readonly u1 = new Vector3();
  private readonly u2 = new Vector3();
  private readonly u3 = new Vector3();

  constructor(
    private scene: Scene,
    private hooks: VfxHooks,
  ) {
    this.kit = new Kit(scene, (m) => hooks.glow(m));
    let drone: ReturnType<typeof droneData> | null = null;
    let mine: ReturnType<typeof mineData> | null = null;
    this.kit.define("droneBody", () => (drone ??= droneData()).body);
    this.kit.define("droneEyes", () => (drone ??= droneData()).eyes);
    this.kit.define("droneRotor", () => (drone ??= droneData()).rotor);
    this.kit.define("mineBody", () => (mine ??= mineData()).body);
    this.kit.define("mineLight", () => (mine ??= mineData()).light);
    this.emitter = new Mesh("combat-emitter", scene);
    this.emitter.isPickable = false;
    this.sparks = new Sparks(scene, this.emitter, (name) =>
      this.kit.materials.texture(name as never),
    );
    this.sparks.prewarm(Object.values(P));
    this.debris = new Debris(scene, 400);
    const lane = this.kit.textures.get("lane");
    lane.vScale = LANE_LENGTH / 2;
  }

  get low(): boolean {
    return this.lowMode;
  }
  set low(value: boolean) {
    this.lowMode = value;
    this.sparks.scale = value ? 0.5 : 1;
    this.debris.limit = value ? this.debris.capacity / 2 : this.debris.capacity;
    this.fxCap = value ? 60 : 120;
  }

  // ───────────────────────────── public API ─────────────────────────────

  event(e: CombatEvent, snapshot: Snapshot): void {
    if (this.disposed) return;
    this.sync(snapshot);
    const src = this.byId.get(e.source),
      tgt = this.byId.get(e.target);
    if (
      this.hasSelf &&
      !this.nearXZ(e.x, e.z) &&
      (!src || !this.near(src)) &&
      (!tgt || !this.near(tgt))
    )
      return;
    switch (e.type) {
      case "cast":
        if (src) this.onCast(e, src);
        break;
      case "resolve":
        if (src) this.onResolve(e, src, tgt);
        break;
      case "hit":
        if (tgt) this.onHit(e, src, tgt);
        break;
      case "miss":
        if (src) this.onMiss(src, tgt);
        break;
      case "heal":
        if (tgt) this.onHeal(e, src, tgt);
        break;
      case "dodge":
        if (src) this.onDodge(e, src);
        break;
      case "death":
        if (tgt) this.onDeath(e, src, tgt);
        break;
      case "loot":
        if (src) this.onLoot(src);
        break;
      case "level":
        if (src) this.onLevel(src);
        break;
    }
  }

  update(dt: number, snapshot: Snapshot): void {
    if (this.disposed) return;
    this.time += dt;
    this.frame++;
    this.sync(snapshot);
    const cam = this.scene.activeCamera;
    if (cam) this.eye.copyFrom(cam.globalPosition);
    if (this.later.length) this.runLater();
    for (const a of snapshot.actors) {
      if (!this.near(a)) continue;
      let fx = this.actors.get(a.id);
      if (!fx) {
        fx = new ActorFx(a.id);
        this.actors.set(a.id, fx);
      }
      fx.seen = this.frame;
      this.updateActor(fx, a, dt);
    }
    for (const fx of this.actors.values())
      if (fx.seen !== this.frame) {
        this.updateActor(fx, null, dt);
        if (fx.idle) this.actors.delete(fx.id);
      }
    this.updateShots(snapshot, dt);
    this.updateMines(snapshot);
    this.updateFx(dt);
    this.updateOrbs(dt);
    for (const arc of this.arcs) if (arc.active) arc.update(dt, this.eye);
    this.debris.update(dt);
    const lane = this.kit.textures.get("lane");
    lane.vOffset = (lane.vOffset - dt * 1.6) % 1;
  }

  metrics(): { meshes: number; burstSystems: number; particles: number } {
    let arcs = 0;
    for (const a of this.arcs) if (a.active) arcs++;
    return {
      meshes: this.kit.active + this.trailCount + arcs,
      burstSystems: this.sparks.busySystems,
      particles: this.sparks.particles + this.debris.alive,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const fx of this.fxs) fx.pool?.release(fx.mesh!);
    this.fxs.length = 0;
    for (const fx of this.actors.values()) this.releaseActor(fx);
    this.actors.clear();
    for (const s of this.shots.values()) this.releaseParts(s.meshes, s.pools);
    this.shots.clear();
    for (const m of this.mines.values()) this.releaseParts(m.meshes, m.pools);
    this.mines.clear();
    for (const o of this.orbs) o.pool?.release(o.mesh!);
    this.orbs.length = 0;
    for (const t of this.trailFree) t.dispose();
    this.trailFree.length = 0;
    for (const a of this.arcs) a.dispose();
    this.arcs.length = 0;
    this.later.length = 0;
    this.sparks.dispose();
    this.debris.dispose();
    this.kit.dispose();
    this.emitter.dispose();
    this.byId.clear();
    this.snapshot = null;
  }

  // ───────────────────────────── helpers ─────────────────────────────

  private sync(s: Snapshot) {
    if (s !== this.snapshot) {
      this.snapshot = s;
      this.byId.clear();
      for (const a of s.actors) this.byId.set(a.id, a);
      if (s.now !== this.snapNow) {
        this.snapNow = s.now;
        this.snapAt = this.time;
      }
    }
    const id = this.hooks.selfId();
    const p = this.hooks.position(id);
    if (p) {
      this.self.copyFrom(p);
      this.hasSelf = true;
    } else {
      const me = this.byId.get(id);
      this.hasSelf = !!me;
      if (me) this.self.set(me.x, 0, me.z);
    }
  }
  private nearXZ(x: number, z: number): boolean {
    if (!this.hasSelf) return true;
    const dx = x - this.self.x,
      dz = z - this.self.z;
    return dx * dx + dz * dz <= CULL * CULL;
  }
  private near(a: ActorView): boolean {
    return this.nearXZ(a.x, a.z);
  }
  /** 0..1 weight for shake/hit-stop: 1 when the local player is involved. */
  private proximity(x: number, z: number, ...ids: string[]): number {
    const me = this.hooks.selfId();
    if (ids.includes(me)) return 1;
    if (!this.hasSelf) return 0.5;
    const d = Math.hypot(x - this.self.x, z - this.self.z);
    return clamp01(1 - d / 16);
  }
  private shake(intensity: number, duration: number, weight: number) {
    if (weight <= 0.05) return;
    const k = this.lowMode ? 0.5 : 1;
    this.hooks.shake(intensity * weight * k, duration);
  }
  private hitStop(duration: number, weight: number) {
    if (weight < 0.6) return;
    this.hooks.hitStop(Math.min(0.12, duration * (this.lowMode ? 0.5 : 1)));
  }
  private now(): number {
    return this.snapNow + Math.min(0.1, this.time - this.snapAt);
  }
  private castProgress(a: ActorView): number {
    const c = a.cast;
    if (!c) return 0;
    return clamp01((this.now() - c.start) / Math.max(0.01, c.end - c.start));
  }

  /** Smoothed root (x, ground, z). */
  private ground(a: ActorView, out: Vector3): Vector3 {
    const p = this.hooks.position(a.id);
    if (p) return out.copyFrom(p);
    return out.set(a.x, this.hooks.groundHeight(a.x, a.z), a.z);
  }
  private facing(a: ActorView): number {
    return this.hooks.rig(a.id)?.root.rotation.y ?? a.heading;
  }
  private body(a: ActorView, out: Vector3): Vector3 {
    const rig = this.hooks.rig(a.id);
    if (rig) {
      this.world(rig.sockets.chest, out);
      out.y += a.kind === "wolf" ? 0.05 : 0.25;
      return out;
    }
    this.ground(a, out);
    out.y += a.kind === "wolf" ? 0.62 : 1.0;
    return out;
  }
  private head(a: ActorView, out: Vector3): Vector3 {
    const rig = this.hooks.rig(a.id);
    if (rig) return this.world(rig.sockets.head, out);
    this.ground(a, out);
    out.y += a.kind === "wolf" ? 1.2 : 1.9;
    return out;
  }
  private weapon(a: ActorView, out: Vector3, dir?: Vector3): Vector3 {
    const node = this.hooks.rig(a.id)?.sockets.weapon;
    if (node) {
      this.world(node, out);
      if (dir) {
        node.getDirectionToRef(LOCAL_Z, dir);
        dir.normalize();
      }
      return out;
    }
    const h = this.facing(a);
    this.ground(a, out);
    out.x += Math.sin(h) * 0.55;
    out.z += Math.cos(h) * 0.55;
    out.y += 1.05;
    dir?.set(Math.sin(h), 0, Math.cos(h));
    return out;
  }
  /** Nudge a point towards the camera (keeps sprites out of bodies). */
  private towardCamera(p: Vector3, dist: number): Vector3 {
    const dx = this.eye.x - p.x,
      dy = this.eye.y - p.y,
      dz = this.eye.z - p.z;
    const l = Math.hypot(dx, dy, dz);
    if (l > 0.001) {
      p.x += (dx / l) * dist;
      p.y += (dy / l) * dist * 0.5;
      p.z += (dz / l) * dist;
    }
    return p;
  }
  /** World position of a socket with an up-to-date parent chain. */
  private world(node: TransformNode, out: Vector3): Vector3 {
    refresh(node);
    return out.copyFrom(node.getAbsolutePosition());
  }
  private kindOf(a: ActorView): "knight" | "cyborg" | "wolf" | "guard" | "npc" {
    if (a.kind === "player") return a.guild;
    if (a.kind === "wolf" || a.kind === "guard") return a.kind;
    return "npc";
  }
  private bits(a: ActorView): readonly Color3[] {
    switch (a.kind) {
      case "wolf":
        return FUR;
      case "guard":
        return GUARD_BITS;
      case "mara":
        return ROBE_BITS;
      case "merchant":
        return APRON_BITS;
      default:
        return a.guild === "knight" ? KNIGHT_BITS : CYBORG_BITS;
    }
  }
  private spec(): EmitSpec {
    return this.sparks.spec.reset();
  }
  private trickle(fx: ActorFx, slot: number, rate: number, dt: number): number {
    fx.acc[slot] += rate * dt * this.sparks.scale;
    const n = Math.floor(fx.acc[slot]);
    fx.acc[slot] -= n;
    return n;
  }
  private debrisBurst(
    at: Vector3,
    count: number,
    palette: readonly Color3[],
    speed = 1,
    dirX = 0,
    dirZ = 0,
    bias = 0,
  ) {
    const d = this.debris.spec.reset();
    d.x = at.x;
    d.y = at.y;
    d.z = at.z;
    d.ground = this.hooks.groundHeight(at.x, at.z);
    d.speed0 *= speed;
    d.speed1 *= speed;
    d.up0 *= Math.sqrt(speed);
    d.up1 *= Math.sqrt(speed);
    d.dirX = dirX;
    d.dirZ = dirZ;
    d.bias = bias;
    this.debris.burst(Math.round(count * (this.lowMode ? 0.5 : 1)), palette);
  }
  private schedule(delay: number, run: () => void) {
    this.later.push({ at: this.time + delay, run });
  }
  private runLater() {
    for (let i = this.later.length - 1; i >= 0; i--)
      if (this.later[i].at <= this.time) {
        const job = this.later[i];
        this.later.splice(i, 1);
        job.run();
      }
  }

  // ───────────────────────────── transient meshes ─────────────────────────────

  private spawn(pool: MeshPool, material: Material, dur: number): Fx {
    if (this.fxs.length >= this.fxCap) this.retire(0);
    const fx = this.fxFree.pop() ?? new Fx();
    fx.mesh = pool.acquire(material);
    fx.pool = pool;
    fx.t = 0;
    fx.dur = dur;
    fx.delay = 0;
    fx.s0.setAll(1);
    fx.s1.setAll(1);
    fx.ease = E_OUT;
    fx.alpha = 1;
    fx.fade = F_OUT;
    fx.spin = fx.pitch = fx.roll = fx.rise = 0;
    fx.follow = null;
    fx.off.setAll(0);
    fx.mesh.visibility = 0;
    this.fxs.push(fx);
    return fx;
  }
  private retire(i: number) {
    const fx = this.fxs[i];
    fx.pool!.release(fx.mesh!);
    fx.mesh = null;
    fx.pool = null;
    fx.follow = null;
    const last = this.fxs.pop()!;
    if (i < this.fxs.length) this.fxs[i] = last;
    this.fxFree.push(fx);
  }
  private updateFx(dt: number) {
    for (let i = this.fxs.length - 1; i >= 0; i--) {
      const fx = this.fxs[i];
      const m = fx.mesh!;
      fx.t += dt;
      if (fx.t < fx.delay) {
        m.isVisible = false;
        continue;
      }
      const k = (fx.t - fx.delay) / fx.dur;
      if (k >= 1) {
        this.retire(i);
        continue;
      }
      m.isVisible = true;
      const e = ease(fx.ease, k);
      m.scaling.set(
        fx.s0.x + (fx.s1.x - fx.s0.x) * e,
        fx.s0.y + (fx.s1.y - fx.s0.y) * e,
        fx.s0.z + (fx.s1.z - fx.s0.z) * e,
      );
      m.visibility = fx.alpha * fade(fx.fade, k);
      if (fx.spin) m.rotation.y += fx.spin * dt;
      if (fx.pitch) m.rotation.x += fx.pitch * dt;
      if (fx.roll) m.rotation.z += fx.roll * dt;
      if (fx.follow) {
        fx.off.y += fx.rise * dt;
        const p = this.hooks.position(fx.follow);
        if (p) m.position.set(p.x + fx.off.x, p.y + fx.off.y, p.z + fx.off.z);
      } else if (fx.rise) m.position.y += fx.rise * dt;
    }
  }

  /** Expanding soft ring: flat on the ground, or camera-facing for the V shapes. */
  private ring(
    at: Vector3,
    color: Color3,
    from: number,
    to: number,
    dur: number,
    shape: "ring" | "shock" | "thin" | "ringV" | "shockV" = "shock",
    delay = 0,
    alpha = 1,
    blend: "add" | "alpha" = "alpha",
  ): Fx {
    const fx = this.spawn(
      this.kit.pool(shape),
      this.kit.materials.shape(color, blend),
      dur,
    );
    fx.mesh!.position.copyFrom(at);
    // Vertical rings always face the camera so they never read edge-on.
    if (shape === "ringV" || shape === "shockV")
      fx.mesh!.billboardMode = Mesh.BILLBOARDMODE_ALL;
    fx.s0.setAll(from);
    fx.s1.setAll(to);
    fx.delay = delay;
    fx.alpha = alpha;
    return fx;
  }
  /** Billboard sprite that pops and fades. */
  private sprite(
    at: Vector3,
    material: Material,
    from: number,
    to: number,
    dur: number,
    easeKind = E_OUT,
    fadeKind = F_OUT,
  ): Fx {
    const fx = this.spawn(this.kit.pool("quad"), material, dur);
    const m = fx.mesh!;
    m.position.copyFrom(at);
    m.billboardMode = Mesh.BILLBOARDMODE_ALL;
    fx.s0.setAll(from);
    fx.s1.setAll(to);
    fx.ease = easeKind;
    fx.fade = fadeKind;
    return fx;
  }
  /** Straight glowing beam between two points (radius r0 → r1 over dur). */
  private beam(
    from: Vector3,
    to: Vector3,
    color: Color3,
    r0: number,
    r1: number,
    dur: number,
    fadeKind = F_LATE,
    blend: "add" | "alpha" = "alpha",
  ): Fx {
    const fx = this.spawn(
      this.kit.pool("beam"),
      this.kit.materials.shape(color, blend),
      dur,
    );
    const m = fx.mesh!;
    aim(m, from, to);
    const len = Vector3.Distance(from, to);
    fx.s0.set(r0, r0, len);
    fx.s1.set(r1, r1, len);
    fx.fade = fadeKind;
    return fx;
  }
  private arc(
    from: Vector3,
    to: Vector3,
    color: Color3,
    life: number,
    jitter: number,
    width = 0.05,
  ) {
    let arc = this.arcs.find((a) => !a.active);
    if (!arc) {
      if (this.arcs.length >= (this.lowMode ? 6 : 12)) return;
      arc = new Arc(this.scene, `combat-arc-${this.arcs.length}`, (m) =>
        this.hooks.glow(m),
      );
      this.arcs.push(arc);
    }
    arc.start(
      from,
      to,
      this.kit.materials.glowing(this.kit.materials.shape(color, "add")),
      life,
      jitter,
      width,
    );
  }

  // ───────────────────────────── events ─────────────────────────────

  private onCast(e: CombatEvent, a: ActorView) {
    const fx = this.actors.get(a.id);
    if (!fx) return;
    const kind = this.kindOf(a);
    if (
      (kind === "knight" && (e.key === "basic" || e.key === "1")) ||
      (kind === "guard" && e.key === "basic")
    )
      fx.trailMaterial = this.trailMaterial(
        kind === "guard" ? C.amber : e.key === "1" ? C.gold : C.sky,
      );
  }

  private onResolve(e: CombatEvent, a: ActorView, t: ActorView | undefined) {
    const kind = this.kindOf(a);
    const fx = this.actors.get(a.id);
    if (fx && (kind === "knight" || kind === "guard"))
      fx.trailUntil = this.time + 0.3;
    if (kind === "wolf") return this.lunge(a);
    if (kind === "guard") return this.chop(a);
    if (kind === "knight") {
      switch (e.key) {
        case "basic":
          return this.slash(a);
        case "1":
          return this.sunder(a);
        case "2":
          return this.bash(a, t);
        case "3":
          return t && t !== a ? this.challenge(a, t) : undefined;
        case "4":
          return t && t !== a ? this.interpose(a, t) : undefined;
        case "5":
          return this.rallyBurst(a);
        case "r":
          return this.oathBurst(a);
        case "q":
          return this.braceBurst(a, C.gold);
      }
      return;
    }
    if (kind === "cyborg") {
      switch (e.key) {
        case "basic":
          return this.muzzle(a, C.cyan, 1);
        case "1":
          return this.lance(e, a, t);
        case "2":
          return this.muzzle(a, C.magenta, 1.2);
        case "3":
          return this.deployMine(e, a);
        case "4":
          return this.coolant(a);
        case "5":
          return this.droneBurst(a);
        case "r":
          return this.overclockBurst(a);
        case "q":
          return this.braceBurst(a, C.cyan);
      }
    }
  }

  private slash(a: ActorView) {
    const h = this.facing(a);
    const at = this.ground(a, this.v0);
    at.y += 0.95;
    const mats = this.kit.materials;
    // A sky-blue crescent with a crisp white core just in front of it.
    const outer = this.spawn(this.kit.pool("slash"), mats.shape(C.sky), 0.26);
    outer.mesh!.position.copyFrom(at);
    outer.mesh!.rotation.set(0.12, h - 0.25, -0.16);
    outer.s0.set(1.35, 1, 1.35);
    outer.s1.set(1.8, 1, 1.8);
    outer.spin = 3.2;
    outer.alpha = 0.85;
    const core = this.spawn(this.kit.pool("slash"), mats.shape(C.white), 0.2);
    core.mesh!.position.copyFrom(this.towardCamera(at, 0.06));
    core.mesh!.rotation.set(0.12, h - 0.2, -0.16);
    core.s0.set(1.2, 1, 1.2);
    core.s1.set(1.6, 1, 1.6);
    core.spin = 3.6;
    // Sparkles along the arc.
    for (const off of [-0.7, 0, 0.7]) {
      const s = this.spec();
      s.x = at.x + Math.sin(h + off) * 1.3;
      s.y = at.y - off * 0.1;
      s.z = at.z + Math.cos(h + off) * 1.3;
      s.r = 0.15;
      s.colors(C.white, C.sky, C.sky)
        .sizes(0.12, 0.22)
        .lives(0.2, 0.35)
        .speeds(0.5, 1.6);
      this.sparks.emit(P.star, 2);
    }
  }

  private sunder(a: ActorView) {
    const h = this.facing(a);
    const sx = Math.sin(h),
      sz = Math.cos(h);
    const base = this.ground(a, this.v0);
    const mats = this.kit.materials;
    const pivot = this.v1.set(
      base.x + sx * 0.35,
      base.y + 1.2,
      base.z + sz * 0.35,
    );
    // Golden overhead arc, sweeping down onto the ground in front.
    for (const [color, dur, s0, s1] of [
      [C.gold, 0.32, 1.2, 1.45],
      [C.cream, 0.2, 1.05, 1.25],
    ] as const) {
      const arcFx = this.spawn(
        this.kit.pool("slash"),
        mats.shape(color, "alpha"),
        dur,
      );
      arcFx.mesh!.position.copyFrom(pivot);
      arcFx.mesh!.rotation.set(-0.35, h, -Math.PI / 2);
      arcFx.s0.set(s0, 1, s0);
      arcFx.s1.set(s1, 1, s1);
      arcFx.pitch = 2.6;
    }
    const hit = this.v2.set(base.x + sx * 1.3, 0, base.z + sz * 1.3);
    hit.y = this.hooks.groundHeight(hit.x, hit.z) + 0.04;
    // Ground crack decal.
    const crack = this.spawn(
      this.kit.pool("floor"),
      mats.sticker("crack"),
      1.7,
    );
    crack.mesh!.position.copyFrom(hit);
    crack.mesh!.rotation.y = Math.random() * TAU;
    crack.s0.set(0.6, 1, 0.6);
    crack.s1.set(2.8, 1, 2.8);
    crack.ease = E_SNAP;
    crack.fade = F_LATE;
    this.ring(hit, C.gold, 0.3, 3.2, 0.45, "shock");
    this.ring(hit, C.white, 0.2, 1.8, 0.24, "thin", 0.03);
    // Dust ring, debris, sparks, stars.
    let s = this.spec().at(hit, 0.15);
    s.shape = SHAPE_RING;
    s.r = 0.45;
    s.flat = 1;
    s.colors(C.cream, C.dirt, C.dirt, 0.9)
      .sizes(0.55, 0.95)
      .lives(0.5, 0.9)
      .speeds(2.4, 3.8, 0.2, 0.7);
    this.sparks.emit(P.puff, 14);
    s = this.spec().at(hit, 0.2);
    s.r = 0.2;
    s.colors(C.gold, C.white, C.goldDeep)
      .sizes(0.07, 0.12)
      .lives(0.25, 0.5)
      .speeds(3, 6.5, 2, 4);
    this.sparks.emit(P.spark, 22);
    s = this.spec().at(hit, 0.5);
    s.r = 0.3;
    s.colors(C.gold, C.cream, C.gold)
      .sizes(0.22, 0.38)
      .lives(0.35, 0.55)
      .speeds(1.5, 3, 1, 2);
    this.sparks.emit(P.star, 7);
    this.debrisBurst(hit, 18, GROUND_BITS, 1.1, sx, sz, 0.35);
    const w = this.proximity(hit.x, hit.z, a.id);
    this.shake(0.2, 0.3, w);
    this.hitStop(0.07, w);
  }

  private bash(a: ActorView, t: ActorView | undefined) {
    const h = this.facing(a);
    const sx = Math.sin(h),
      sz = Math.cos(h);
    const at = this.ground(a, this.v0);
    at.set(at.x + sx * 0.7, at.y + 1.0, at.z + sz * 0.7);
    this.towardCamera(at, 0.35);
    const mats = this.kit.materials;
    const sigil = this.spawn(
      this.kit.pool("quad"),
      mats.sprite("kite", C.gold, "alpha", true),
      0.3,
    );
    sigil.mesh!.position.copyFrom(at);
    sigil.mesh!.billboardMode = Mesh.BILLBOARDMODE_ALL;
    sigil.s0.setAll(0.8);
    sigil.s1.setAll(1.7);
    sigil.ease = E_BACK;
    sigil.fade = F_FLASH;
    const wave = this.ring(
      this.v1.set(at.x + sx * 0.2, at.y, at.z + sz * 0.2),
      C.gold,
      0.25,
      1.9,
      0.34,
      "shockV",
    );
    wave.alpha = 0.9;
    const s = this.spec().at(at);
    s.dir(sx, 0.2, sz, 0.6);
    s.colors(C.white, C.gold, C.gold)
      .sizes(0.06, 0.1)
      .lives(0.18, 0.3)
      .speeds(4, 7);
    this.sparks.emit(P.spark, 12);
    if (t) {
      const head = this.head(t, this.v2);
      const st = this.spec().at(head, 0.1);
      st.r = 0.15;
      st.colors(C.white, C.white, C.white)
        .sizes(0.22, 0.32)
        .lives(0.45, 0.65)
        .speeds(1.5, 3, 1.5, 3);
      this.sparks.emit(P.toon, 6);
    }
    const w = this.proximity(at.x, at.z, a.id, t?.id ?? "");
    this.shake(0.1, 0.16, w);
    this.hitStop(0.05, w);
  }

  private challenge(a: ActorView, t: ActorView) {
    const mats = this.kit.materials;
    const top = this.head(t, this.v0);
    const base = this.ground(t, this.v1);
    const bang = this.spawn(this.kit.pool("quad"), mats.sticker("bang"), 1.15);
    bang.mesh!.billboardMode = Mesh.BILLBOARDMODE_ALL;
    bang.follow = t.id;
    bang.off.set(0, top.y - base.y + 0.55, 0);
    bang.mesh!.position.set(base.x, top.y + 0.55, base.z);
    bang.s0.setAll(0.05);
    bang.s1.setAll(0.95);
    bang.ease = E_BACK;
    bang.fade = F_LATE;
    const vein = this.spawn(this.kit.pool("quad"), mats.sticker("vein"), 0.9);
    vein.mesh!.billboardMode = Mesh.BILLBOARDMODE_ALL;
    vein.follow = t.id;
    vein.off.set(0.42, top.y - base.y + 0.05, 0);
    vein.mesh!.position.set(base.x + 0.42, top.y + 0.05, base.z);
    vein.s0.setAll(0.05);
    vein.s1.setAll(0.42);
    vein.ease = E_BACK;
    vein.fade = F_LATE;
    vein.delay = 0.08;
    // Radiating taunt lines.
    const s = this.spec().at(top, 0.55);
    s.r = 0.25;
    s.vel = VEL_RADIAL;
    s.colors(C.gold, C.white, C.goldDeep)
      .sizes(0.5, 0.75)
      .lives(0.22, 0.32)
      .speeds(4, 6);
    this.sparks.emit(P.streak, 12);
    this.ring(
      base.addInPlaceFromFloats(0, 0.05, 0),
      C.gold,
      0.4,
      1.5,
      0.45,
      "shock",
    );
    const from = this.body(a, this.v2),
      to = this.body(t, this.v3);
    this.beam(from, to, C.gold, 0.06, 0.0, 0.28);
  }

  private interpose(a: ActorView, t: ActorView) {
    const from = this.body(a, this.v0),
      to = this.body(t, this.v1);
    this.beam(from, to, C.gold, 0.09, 0.02, 0.4);
    const feet = this.ground(t, this.v2);
    feet.y += 0.05;
    this.ring(feet, C.gold, 0.3, 1.2, 0.4, "thin");
    const s = this.spec().at(to);
    s.r = 0.5;
    s.colors(C.gold, C.white, C.gold)
      .sizes(0.16, 0.28)
      .lives(0.5, 0.8)
      .speeds(0.3, 1, 0.5, 1.2);
    this.sparks.emit(P.twinkle, 10);
  }

  private rallyBurst(a: ActorView) {
    const feet = this.ground(a, this.v0);
    feet.y += 0.06;
    this.ring(feet, C.green, 0.3, 2.0, 0.55, "shock");
    this.ring(feet, C.gold, 0.2, 1.4, 0.4, "thin", 0.06);
    const s = this.spec().at(feet, 0.2);
    s.shape = SHAPE_RING;
    s.r = 0.7;
    s.h = 0.6;
    s.colors(C.white, C.white, C.white)
      .sizes(0.2, 0.32)
      .lives(0.7, 1.1)
      .speeds(0.2, 0.6, 0.8, 1.6);
    this.sparks.emit(P.plus, 12);
  }

  private oathBurst(a: ActorView) {
    const feet = this.ground(a, this.v0);
    const mats = this.kit.materials;
    const pillar = this.spawn(this.kit.pool("pillar"), mats.shape(C.gold), 1.0);
    pillar.mesh!.position.copyFrom(feet);
    pillar.s0.set(0.5, 8, 0.5);
    pillar.s1.set(1.4, 8, 1.4);
    pillar.fade = F_LATE;
    const core = this.spawn(
      this.kit.pool("pillar"),
      mats.shape(C.white, "add"),
      0.6,
    );
    core.mesh!.position.copyFrom(feet);
    core.s0.set(0.3, 9, 0.3);
    core.s1.set(0.05, 9, 0.05);
    feet.y += 0.06;
    this.ring(feet, C.gold, 0.4, 3.2, 0.6, "shock");
    this.ring(feet, C.white, 0.3, 2.4, 0.45, "thin", 0.12);
    const s = this.spec().at(feet, 0.1);
    s.shape = SHAPE_RING;
    s.r = 1.1;
    s.colors(C.gold, C.white, C.gold)
      .sizes(0.16, 0.3)
      .lives(0.8, 1.3)
      .speeds(0.1, 0.4, 2, 4);
    this.sparks.emit(P.twinkle, 26);
    this.shake(0.08, 0.25, this.proximity(feet.x, feet.z, a.id));
  }

  private braceBurst(a: ActorView, color: Color3) {
    const at = this.body(a, this.v0);
    const s = this.spec().at(at);
    s.r = 0.45;
    s.colors(color, C.white, color)
      .sizes(0.12, 0.2)
      .lives(0.25, 0.4)
      .speeds(0.5, 1.5);
    this.sparks.emit(P.star, 6);
  }

  private muzzle(a: ActorView, color: Color3, scale: number) {
    const dir = this.v1;
    const at = this.weapon(a, this.v0, dir);
    const h = this.facing(a);
    const fwd = this.v2.set(Math.sin(h), 0, Math.cos(h));
    const mats = this.kit.materials;
    this.sprite(
      at,
      mats.sprite("star4", color, "add"),
      0.25 * scale,
      0.95 * scale,
      0.12,
      E_OUT,
      F_FLASH,
    );
    this.sprite(
      at,
      mats.sprite("soft", C.white, "add"),
      0.3 * scale,
      0.6 * scale,
      0.08,
      E_OUT,
      F_FLASH,
    );
    this.ring(at, color, 0.08, 0.5 * scale, 0.16, "ringV");
    const s = this.spec().at(at);
    s.dir(fwd.x, 0.05, fwd.z, 0.35);
    s.colors(color, C.white, color)
      .sizes(0.05, 0.09)
      .lives(0.1, 0.2)
      .speeds(4, 8);
    this.sparks.emit(P.spark, 7);
  }

  private lance(e: CombatEvent, a: ActorView, t: ActorView | undefined) {
    const origin = this.weapon(a, this.v0);
    const aimAt = e.aim ??
      t ?? { x: a.x + Math.sin(a.heading), z: a.z + Math.cos(a.heading) };
    let dx = aimAt.x - a.x,
      dz = aimAt.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    const end = this.v1.set(
      origin.x + dx * LANE_LENGTH,
      origin.y,
      origin.z + dz * LANE_LENGTH,
    );
    this.beam(origin, end, C.cyan, 0.42, 0.02, 0.45, F_LATE);
    this.beam(origin, end, C.white, 0.17, 0.0, 0.3, F_OUT, "add");
    this.muzzle(a, C.cyan, 1.6);
    const seg = this.v2,
      next = this.v3;
    seg.copyFrom(origin);
    for (let i = 1; i <= 3; i++) {
      Vector3.LerpToRef(origin, end, i / 3, next);
      this.arc(seg, next, C.cyan, 0.36 + i * 0.04, 0.32, 0.05);
      seg.copyFrom(next);
    }
    let s = this.spec().at(origin);
    s.shape = SHAPE_LINE;
    s.x2 = end.x;
    s.y2 = end.y;
    s.z2 = end.z;
    s.r = 0.12;
    s.vel = VEL_RANDOM;
    s.colors(C.cyan, C.white, C.cyanDeep)
      .sizes(0.07, 0.14)
      .lives(0.25, 0.55)
      .speeds(0.4, 1.4);
    this.sparks.emit(P.glint, 36);
    s = this.spec().at(origin);
    s.shape = SHAPE_LINE;
    s.x2 = end.x;
    s.y2 = end.y;
    s.z2 = end.z;
    s.r = 0.3;
    s.vel = VEL_RANDOM;
    s.colors(C.cyan, C.white, C.cyan)
      .sizes(0.2, 0.32)
      .lives(0.25, 0.45)
      .speeds(0.2, 0.6);
    this.sparks.emit(P.bolt, 7);
    this.ring(end, C.cyan, 0.2, 1.1, 0.3, "ringV");
    const w = this.proximity(origin.x, origin.z, a.id);
    this.shake(0.14, 0.22, w);
    this.hitStop(0.04, a.id === this.hooks.selfId() ? 1 : 0);
  }

  private deployMine(e: CombatEvent, a: ActorView) {
    const aimAt = e.aim;
    const base = this.ground(a, this.v0);
    let x = base.x,
      z = base.z;
    if (aimAt) {
      const d = Math.hypot(aimAt.x - a.x, aimAt.z - a.z);
      const f = d > 6 ? 6 / d : 1;
      x = a.x + (aimAt.x - a.x) * f;
      z = a.z + (aimAt.z - a.z) * f;
    }
    const at = this.v1.set(x, this.hooks.groundHeight(x, z) + 0.05, z);
    this.ring(at, C.cyan, 0.2, 1.0, 0.35, "ring", 0.08);
    const s = this.spec().at(at, 0.1);
    s.r = 0.2;
    s.colors(C.smoke, C.frost, C.frost, 0.8)
      .sizes(0.3, 0.5)
      .lives(0.35, 0.6)
      .speeds(0.6, 1.4, 0.2, 0.6);
    this.sparks.emit(P.puff, 5);
    this.muzzle(a, C.cyan, 0.8);
  }

  private coolant(a: ActorView) {
    const feet = this.ground(a, this.v0);
    feet.y += 0.06;
    this.ring(feet, C.frost, 0.4, 3.2, 0.5, "shock");
    this.ring(feet, C.white, 0.3, 3.0, 0.6, "thin", 0.07);
    let s = this.spec().at(feet, 0.25);
    s.shape = SHAPE_RING;
    s.r = 0.5;
    s.flat = 1;
    s.colors(C.white, C.frost, C.ice, 0.75)
      .sizes(0.55, 0.95)
      .lives(0.55, 0.95)
      .speeds(2.6, 4, 0, 0.4);
    this.sparks.emit(P.puff, 14);
    s = this.spec().at(feet, 0.9);
    s.r = 0.4;
    s.colors(C.white, C.ice, C.ice)
      .sizes(0.16, 0.3)
      .lives(0.6, 1.0)
      .speeds(2, 4.5, 0.8, 2);
    this.sparks.emit(P.flake, 24);
    // Ice shards popping up around the cyborg.
    const n = this.lowMode ? 4 : 7;
    const mat = this.kit.materials.shape(C.ice, "alpha");
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * TAU + Math.random() * 0.5;
      const r = rand(1.5, 2.4);
      const x = feet.x + Math.sin(ang) * r,
        z = feet.z + Math.cos(ang) * r;
      const shard = this.spawn(this.kit.pool("shard"), mat, rand(0.9, 1.2));
      shard.mesh!.position.set(x, this.hooks.groundHeight(x, z), z);
      shard.mesh!.rotation.set(
        Math.cos(ang) * 0.35,
        ang,
        -Math.sin(ang) * 0.35,
      );
      const sz = rand(0.13, 0.22);
      shard.s0.set(sz, 0.01, sz);
      shard.s1.set(sz, rand(0.5, 0.85), sz);
      shard.ease = E_SNAP;
      shard.fade = F_LATE;
      shard.alpha = 0.92;
      shard.delay = r * 0.06;
    }
    const me = this.hooks.selfId();
    for (const b of this.snapshot?.actors ?? []) {
      if (
        b.id === a.id ||
        b.life !== "alive" ||
        b.kind === "mara" ||
        b.kind === "merchant"
      )
        continue;
      if (b.safe || a.safe) continue;
      if (Math.hypot(b.x - a.x, b.z - a.z) <= 3.2) this.frostOn(b.id, 2);
    }
    this.shake(
      0.05,
      0.15,
      this.proximity(feet.x, feet.z, me === a.id ? a.id : ""),
    );
  }

  private droneBurst(a: ActorView) {
    const at = this.ground(a, this.v0);
    at.y += 1.75;
    const s = this.spec().at(at);
    s.r = 0.3;
    s.colors(C.white, C.mint, C.mint, 0.85)
      .sizes(0.3, 0.45)
      .lives(0.35, 0.6)
      .speeds(0.6, 1.3);
    this.sparks.emit(P.puff, 6);
    const p = this.spec().at(at);
    p.r = 0.3;
    p.colors(C.white, C.white, C.white)
      .sizes(0.16, 0.26)
      .lives(0.5, 0.8)
      .speeds(0.5, 1.4, 0.4, 1);
    this.sparks.emit(P.plus, 6);
  }

  private overclockBurst(a: ActorView) {
    const fx = this.actors.get(a.id);
    if (fx) fx.overclockUntil = this.time + 6;
    const feet = this.ground(a, this.v0);
    feet.y += 0.06;
    this.ring(feet, C.cyan, 0.3, 2.3, 0.45, "shock");
    this.ring(feet, C.amber, 0.25, 1.6, 0.35, "thin", 0.05);
    const at = this.body(a, this.v1);
    let s = this.spec().at(at);
    s.r = 0.5;
    s.colors(C.cyan, C.white, C.cyan)
      .sizes(0.24, 0.36)
      .lives(0.3, 0.5)
      .speeds(1.5, 3);
    this.sparks.emit(P.bolt, 8);
    s = this.spec().at(at);
    s.r = 0.4;
    s.colors(C.amber, C.gold, C.red)
      .sizes(0.06, 0.12)
      .lives(0.4, 0.8)
      .speeds(0.5, 1.6, 1, 2.5);
    this.sparks.emit(P.ember, 18);
    for (let i = 0; i < 3; i++) {
      const ang = Math.random() * TAU;
      this.arc(
        at,
        this.v2.set(
          at.x + Math.sin(ang) * 1.1,
          at.y + rand(-0.6, 0.7),
          at.z + Math.cos(ang) * 1.1,
        ),
        C.cyan,
        0.25,
        0.18,
        0.04,
      );
    }
  }

  private lunge(a: ActorView) {
    const feet = this.ground(a, this.v0);
    const h = this.facing(a);
    const s = this.spec().at(feet, 0.12);
    s.r = 0.25;
    s.dir(-Math.sin(h), 0.3, -Math.cos(h), 0.6);
    s.colors(C.cream, C.dirt, C.dirt, 0.8)
      .sizes(0.3, 0.5)
      .lives(0.35, 0.6)
      .speeds(1, 2);
    this.sparks.emit(P.puff, 4);
  }

  private chop(a: ActorView) {
    const h = this.facing(a);
    const sx = Math.sin(h),
      sz = Math.cos(h);
    const base = this.ground(a, this.v0);
    const mats = this.kit.materials;
    const pivot = this.v1.set(
      base.x + sx * 0.3,
      base.y + 1.3,
      base.z + sz * 0.3,
    );
    for (const [color, dur, s0, s1] of [
      [C.crimson, 0.3, 1.2, 1.45],
      [C.gold, 0.2, 1.05, 1.25],
    ] as const) {
      const f = this.spawn(
        this.kit.pool("slash"),
        mats.shape(color, "alpha"),
        dur,
      );
      f.mesh!.position.copyFrom(pivot);
      f.mesh!.rotation.set(-0.35, h, -Math.PI / 2);
      f.s0.set(s0, 1, s0);
      f.s1.set(s1, 1, s1);
      f.pitch = 2.4;
    }
    const hit = this.v2.set(base.x + sx * 1.4, 0, base.z + sz * 1.4);
    hit.y = this.hooks.groundHeight(hit.x, hit.z) + 0.05;
    this.ring(hit, C.crimson, 0.3, 1.6, 0.35, "shock");
    const s = this.spec().at(hit, 0.15);
    s.shape = SHAPE_RING;
    s.r = 0.3;
    s.flat = 1;
    s.colors(C.cream, C.dirt, C.dirt, 0.85)
      .sizes(0.35, 0.6)
      .lives(0.4, 0.7)
      .speeds(1.8, 3, 0.2, 0.5);
    this.sparks.emit(P.puff, 8);
  }

  private onHit(e: CombatEvent, a: ActorView | undefined, t: ActorView) {
    const self = this.hooks.selfId();
    const rig = this.hooks.rig(t.id);
    rig?.flash(e.blocked ? C.gold : undefined, e.blocked ? 0.18 : 0.14);
    const at = this.body(t, this.v0);
    const src = a ? this.ground(a, this.v1) : this.v1.copyFrom(at);
    let dx = at.x - src.x,
      dz = at.z - src.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    // Pop impacts out of the body (towards the attacker and the camera).
    at.x -= dx * 0.2;
    at.z -= dz * 0.2;
    this.towardCamera(at, t.kind === "wolf" ? 0.6 : 0.75);
    const kind = a ? this.kindOf(a) : "npc";
    const heavy =
      (kind === "knight" && e.key === "1") ||
      (kind === "cyborg" && (e.key === "1" || e.key === "3")) ||
      kind === "guard";
    const big = heavy ? 1.45 : 1;
    const mats = this.kit.materials;
    const accent =
      kind === "cyborg"
        ? e.key === "2"
          ? C.magenta
          : C.cyan
        : kind === "wolf"
          ? C.pink
          : kind === "guard"
            ? C.amber
            : C.gold;
    // Squashy impact ring.
    const ring = this.sprite(
      at,
      mats.sprite("ring", e.blocked ? C.gold : C.white, "alpha", true),
      0.2,
      1.15 * big,
      0.22,
      E_BACK,
      F_OUT,
    );
    ring.s0.set(0.15, 0.32, 1);
    ring.s1.set(1.5 * big, 1.15 * big, 1);
    ring.mesh!.rotation.z = Math.random() * TAU;
    let s = this.spec().at(at);
    s.r = 0.15;
    s.colors(C.white, accent, accent)
      .sizes(0.26 * big, 0.42 * big)
      .lives(0.28, 0.45)
      .speeds(2, 4.5, 0.5, 1.5);
    this.sparks.emit(P.star, heavy ? 9 : 6);
    s = this.spec().at(at);
    s.dir(dx, 0.35, dz, 0.75);
    s.colors(C.white, accent, accent)
      .sizes(0.05, 0.09)
      .lives(0.15, 0.3)
      .speeds(4, 8);
    this.sparks.emit(P.spark, heavy ? 14 : 8);
    if (kind === "knight" || kind === "guard" || kind === "wolf") {
      s = this.spec().at(at, 0.35);
      s.r = 0.1;
      s.colors(C.white, C.white, C.white)
        .sizes(0.28, 0.38)
        .lives(0.4, 0.6)
        .speeds(1.5, 2.6, 1.5, 2.5);
      this.sparks.emit(P.toon, heavy ? 3 : 2);
    }
    this.debrisBurst(at, heavy ? 14 : 9, this.bits(t), big, dx, dz, 0.55);
    if (e.blocked) {
      const toward = this.v2.set(
        at.x - dx * 0.45,
        at.y + 0.1,
        at.z - dz * 0.45,
      );
      const tex = t.guild === "cyborg" && t.kind === "player" ? "hex" : "kite";
      const color = tex === "hex" ? C.cyan : C.gold;
      const sigil = this.spawn(
        this.kit.pool("quad"),
        mats.sprite(tex, color, "alpha", true),
        0.28,
      );
      sigil.mesh!.position.copyFrom(toward);
      sigil.mesh!.billboardMode = Mesh.BILLBOARDMODE_ALL;
      sigil.s0.setAll(0.6);
      sigil.s1.setAll(1.25);
      sigil.ease = E_BACK;
      sigil.fade = F_FLASH;
      s = this.spec().at(toward);
      s.dir(-dx, 0.4, -dz, 0.8);
      s.colors(color, C.white, color)
        .sizes(0.05, 0.09)
        .lives(0.2, 0.35)
        .speeds(3, 6);
      this.sparks.emit(P.spark, 14);
    }
    if (kind === "wolf") {
      const claw = this.sprite(
        at,
        mats.sticker("claw", true),
        0.3,
        0.95,
        0.3,
        E_BACK,
        F_LATE,
      );
      claw.mesh!.rotation.z = rand(-0.5, 0.5);
    }
    if (kind === "cyborg" && e.key === "1") {
      for (let i = 0; i < 2; i++)
        this.arc(
          at,
          this.v3.set(
            at.x + rand(-0.8, 0.8),
            at.y + rand(-0.7, 0.6),
            at.z + rand(-0.8, 0.8),
          ),
          C.cyan,
          0.22,
          0.15,
          0.035,
        );
      this.ring(at, C.cyan, 0.2, 1.2, 0.25, "ringV");
    }
    if (kind === "cyborg" && e.key === "basic") {
      this.ring(at, C.cyan, 0.15, 0.8, 0.2, "ringV");
    }
    if (a && kind === "cyborg" && e.key === "2") {
      this.ring(at, C.magenta, 0.2, 1.3, 0.3, "shockV");
      const fx = this.actors.get(t.id);
      if (fx) fx.rootUntil = this.time + 1.2;
    }
    if (a && kind === "cyborg" && e.key === "3") {
      this.explodeMineFor(a.id, t);
      this.frostOn(t.id, 2);
    }
    if (a && kind === "knight" && e.key === "2") {
      const fx = this.actors.get(t.id);
      if (fx) fx.rootUntil = 0;
    }
    // Weight for the local player.
    if (t.id === self) {
      const frac = clamp01(e.amount / Math.max(1, t.maxHp));
      this.hooks.flashScreen("#ff4060", Math.min(1, 0.35 + frac * 3));
      if (frac > 0.12 || heavy) {
        this.shake(0.12 + frac * 0.3, 0.22, 1);
        this.hitStop(0.05, 1);
      }
    } else if (a?.id === self && heavy) this.hitStop(0.04, 1);
  }

  private onMiss(a: ActorView, t: ActorView | undefined) {
    if (!t || t.id === a.id) return;
    const at = this.body(t, this.v0);
    let dx = at.x - a.x,
      dz = at.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    // Whiff: two streaks sweeping across the attack line and a little puff.
    for (const side of [-1, 1]) {
      const s = this.spec().at(at, side * 0.12);
      s.x -= dx * 0.3;
      s.z -= dz * 0.3;
      s.dir(-dz * side + dx * 0.4, 0.15 * side, dx * side + dz * 0.4, 0.15);
      s.colors(C.white, C.sky, C.sky, 0.85)
        .sizes(0.55, 0.85)
        .lives(0.18, 0.26)
        .speeds(3.5, 5);
      this.sparks.emit(P.streak, 2, true);
    }
    const s = this.spec().at(at);
    s.r = 0.15;
    s.colors(C.white, C.smoke, C.smoke, 0.7)
      .sizes(0.25, 0.4)
      .lives(0.3, 0.45)
      .speeds(0.4, 0.9);
    this.sparks.emit(P.puff, 3, true);
  }

  private onHeal(e: CombatEvent, a: ActorView | undefined, t: ActorView) {
    const at = this.towardCamera(this.body(t, this.v0), 0.55);
    at.y += 0.25;
    if (e.key === "revive") {
      const feet = this.ground(t, this.v1);
      feet.y += 0.06;
      this.ring(feet, C.gold, 0.3, 1.8, 0.6, "shock");
      let s = this.spec().at(at);
      s.r = 0.4;
      s.colors(C.white, C.white, C.white)
        .sizes(0.3, 0.45)
        .lives(0.8, 1.2)
        .speeds(0.3, 1, 0.8, 1.6);
      this.sparks.emit(P.heart, 9);
      s = this.spec().at(at);
      s.r = 0.6;
      s.colors(C.gold, C.white, C.gold)
        .sizes(0.14, 0.26)
        .lives(0.6, 1)
        .speeds(0.2, 0.8, 0.4, 1.2);
      this.sparks.emit(P.twinkle, 12);
      if (a && a.id !== t.id)
        this.beam(this.body(a, this.v2), at, C.gold, 0.07, 0, 0.4);
      return;
    }
    const s = this.spec().at(at);
    s.r = 0.35;
    s.colors(C.white, C.white, C.white)
      .sizes(0.16, 0.26)
      .lives(0.55, 0.85)
      .speeds(0.2, 0.7, 0.6, 1.2);
    this.sparks.emit(P.plus, 4);
    const fx = this.actors.get(t.id);
    if (fx && t.kind === "player" && t.guild === "cyborg" && t.healing)
      fx.dronePulse = 0.32;
  }

  private onDodge(e: CombatEvent, a: ActorView) {
    const mats = this.kit.materials;
    const from = this.ground(a, this.v0);
    if (e.key === "c") {
      // Break Free: shackles shatter.
      const at = this.body(a, this.v1);
      this.debrisBurst(at, 16, SHACKLE_BITS, 1.2);
      for (const [y, d] of [
        [0.45, 0],
        [1.0, 0.05],
      ] as const) {
        const r = this.ring(
          this.v2.set(from.x, from.y + y, from.z),
          C.gold,
          0.45,
          1.5,
          0.3,
          "thin",
          d,
        );
        r.fade = F_FLASH;
      }
      this.ring(
        this.v2.set(from.x, from.y + 0.05, from.z),
        C.white,
        0.3,
        1.6,
        0.35,
        "shock",
      );
      const s = this.spec().at(at);
      s.r = 0.3;
      s.colors(C.white, C.gold, C.gold)
        .sizes(0.2, 0.32)
        .lives(0.3, 0.5)
        .speeds(2, 4);
      this.sparks.emit(P.star, 10);
      return;
    }
    // Evade: afterimages along the path, dust at both ends, speed streaks.
    const tx = e.x,
      tz = e.z;
    let dx = tx - from.x,
      dz = tz - from.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.01) {
      dx /= dist;
      dz /= dist;
    } else {
      dx = Math.sin(a.heading);
      dz = Math.cos(a.heading);
    }
    const tint = a.guild === "cyborg" ? C.cyanDeep : C.sky;
    const ghosts = this.lowMode ? 2 : 4;
    const span = Math.max(dist, 1.5);
    for (let i = 0; i < ghosts; i++) {
      const k = i / ghosts;
      const g = this.spawn(
        this.kit.pool("quad"),
        mats.sprite("ghost", tint),
        0.42,
      );
      const m = g.mesh!;
      m.billboardMode = Mesh.BILLBOARDMODE_Y;
      m.position.set(
        from.x + dx * span * k,
        from.y + 0.95,
        from.z + dz * span * k,
      );
      g.s0.set(1.25, 1.9, 1);
      g.s1.set(1.1, 1.9, 1);
      g.alpha = 0.32 + 0.3 * k;
      g.delay = k * 0.09;
      g.fade = F_OUT;
    }
    let s = this.spec().at(from, 0.12);
    s.r = 0.3;
    s.dir(-dx, 0.25, -dz, 0.7);
    s.colors(C.cream, C.dirt, C.dirt, 0.85)
      .sizes(0.35, 0.6)
      .lives(0.4, 0.7)
      .speeds(1, 2.2);
    this.sparks.emit(P.puff, 6);
    s = this.spec().at(from, 0.9);
    s.shape = SHAPE_LINE;
    s.x2 = from.x + dx * span;
    s.y2 = from.y + 0.9;
    s.z2 = from.z + dz * span;
    s.r = 0.45;
    s.dir(dx, 0, dz, 0.05);
    s.colors(C.white, tint, tint, 0.8)
      .sizes(0.7, 1.1)
      .lives(0.18, 0.3)
      .speeds(5, 8);
    this.sparks.emit(P.streak, 8);
    s = this.spec();
    s.x = tx;
    s.y = this.hooks.groundHeight(tx, tz) + 0.12;
    s.z = tz;
    s.r = 0.3;
    s.colors(C.cream, C.dirt, C.dirt, 0.75)
      .sizes(0.3, 0.5)
      .lives(0.35, 0.6)
      .speeds(0.6, 1.4);
    this.sparks.emit(P.puff, 4);
  }

  private onDeath(e: CombatEvent, killer: ActorView | undefined, t: ActorView) {
    const at = this.body(t, this.v0).clone();
    const feet = this.ground(t, this.v1).clone();
    const creature = t.kind !== "player";
    const s = this.spec().at(this.head(t, this.v2));
    s.r = 0.2;
    s.colors(C.white, C.white, C.white)
      .sizes(0.24, 0.34)
      .lives(0.5, 0.75)
      .speeds(1.8, 3.2, 1.5, 2.5);
    this.sparks.emit(P.toon, creature ? 6 : 4);
    this.debrisBurst(at, creature ? 16 : 10, this.bits(t), 1.15);
    const poof = () => this.poof(at, feet, t.kind === "wolf" ? 1 : 0.85);
    if (t.kind === "wolf") this.schedule(1.45, poof);
    else poof();
    if (!creature) this.wisp(at);
    if (
      t.kind === "wolf" &&
      killer &&
      killer.id !== t.id &&
      killer.kind === "player"
    ) {
      const n = this.lowMode ? 3 : 3 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) this.xpOrb(at, killer.id, i);
    }
    if (e.target === this.hooks.selfId()) this.shake(0.15, 0.35, 1);
  }

  private poof(at: Vector3, feet: Vector3, scale: number) {
    let s = this.spec().at(at, -0.15);
    s.r = 0.35 * scale;
    s.flat = 0.4;
    s.colors(C.white, C.smoke, C.lavender, 0.95)
      .sizes(0.7 * scale, 1.25 * scale)
      .lives(0.55, 0.95)
      .speeds(1.2, 2.6, 0.3, 1.0);
    this.sparks.emit(P.puff, 14);
    s = this.spec().at(at);
    s.r = 0.4;
    s.colors(C.lavender, C.white, C.white, 0.7)
      .sizes(0.8, 1.3)
      .lives(0.8, 1.3)
      .speeds(0.3, 0.9, 0.3, 0.8);
    this.sparks.emit(P.smoke, 5);
    s = this.spec().at(at);
    s.r = 0.6;
    s.colors(C.white, C.gold, C.gold)
      .sizes(0.14, 0.26)
      .lives(0.5, 0.9)
      .speeds(0.5, 1.6, 0.5, 1.5);
    this.sparks.emit(P.twinkle, 9);
    const ground = this.v3.copyFrom(feet);
    ground.y += 0.05;
    this.ring(ground, C.white, 0.3, 1.8 * scale, 0.4, "shock", 0, 0.8);
  }

  private wisp(at: Vector3) {
    const orb = this.orbFree.pop() ?? new Orb();
    orb.pool = this.kit.pool("quad", true);
    orb.mesh = orb.pool.acquire(this.kit.materials.sprite("soft", C.lavender));
    orb.mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
    orb.mesh.position.copyFrom(at);
    orb.p.copyFrom(at);
    orb.v.set(0, 0.9, 0);
    orb.t = 0;
    orb.hold = 0;
    orb.acc = 0;
    orb.wisp = true;
    orb.target = "";
    this.orbs.push(orb);
  }

  private xpOrb(at: Vector3, killer: string, i: number) {
    if (this.orbs.length >= 24) return;
    const orb = this.orbFree.pop() ?? new Orb();
    orb.pool = this.kit.pool("quad");
    orb.mesh = orb.pool.acquire(this.kit.materials.sticker("orb"));
    orb.mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
    orb.p.copyFrom(at);
    orb.mesh.position.copyFrom(at);
    const ang = Math.random() * TAU;
    const sp = rand(1.4, 2.6);
    orb.v.set(Math.sin(ang) * sp, rand(4, 5.5), Math.cos(ang) * sp);
    orb.t = 0;
    orb.hold = 0.42 + i * 0.07;
    orb.acc = 0;
    orb.wisp = false;
    orb.target = killer;
    this.orbs.push(orb);
  }

  private onLoot(a: ActorView) {
    const at = this.ground(a, this.v0);
    at.y += 1.1;
    let s = this.spec().at(at);
    s.r = 0.2;
    s.vel = VEL_RANDOM;
    s.colors(C.white).sizes(0.22, 0.3).lives(0.7, 1.0).speeds(1, 2, 3, 5);
    this.sparks.emit(P.coin, 10);
    s = this.spec().at(at);
    s.r = 0.5;
    s.colors(C.gold, C.white, C.gold)
      .sizes(0.14, 0.26)
      .lives(0.5, 0.9)
      .speeds(0.3, 1.2, 0.5, 1.5);
    this.sparks.emit(P.twinkle, 10);
    this.debrisBurst(at, 8, GOLD_BITS, 0.8);
  }

  private onLevel(a: ActorView) {
    const feet = this.ground(a, this.v0);
    const mats = this.kit.materials;
    // Golden beam from the sky.
    for (const [color, r0, r1, dur] of [
      [C.gold, 0.7, 0.1, 1.4],
      [C.white, 0.25, 0.02, 0.9],
    ] as const) {
      const b = this.spawn(
        this.kit.pool("beam"),
        mats.shape(color, color === C.white ? "add" : "alpha"),
        dur,
      );
      b.mesh!.position.copyFrom(feet);
      b.mesh!.rotation.x = -Math.PI / 2;
      b.s0.set(r0, r0, 28);
      b.s1.set(r1, r1, 28);
      b.fade = F_LATE;
    }
    const ground = this.v1.copyFrom(feet);
    ground.y += 0.06;
    for (let i = 0; i < 3; i++)
      this.ring(
        ground,
        i === 1 ? C.white : C.gold,
        0.4,
        3.2 - i * 0.6,
        0.75,
        "thin",
        i * 0.16,
        0.8,
      );
    // Firework burst overhead, then confetti.
    const sky = this.v2.copyFrom(feet);
    sky.y += 3.4;
    let s = this.spec().at(sky);
    s.r = 0.1;
    s.colors(C.gold, C.pink, C.gold)
      .sizes(0.22, 0.36)
      .lives(0.9, 1.3)
      .speeds(3, 5);
    this.sparks.emit(P.burst5, 14);
    s = this.spec().at(sky);
    s.r = 0.1;
    s.colors(C.cyan, C.green, C.white)
      .sizes(0.16, 0.28)
      .lives(0.8, 1.2)
      .speeds(2.5, 4.5);
    this.sparks.emit(P.star, 16);
    s = this.spec().at(sky);
    s.r = 0.4;
    s.colors(C.white, C.gold, C.gold)
      .sizes(0.1, 0.2)
      .lives(1, 1.6)
      .speeds(1, 3);
    this.sparks.emit(P.twinkle, 18);
    s = this.spec().at(sky, 0.3);
    s.shape = SHAPE_BOX;
    s.r = 1.2;
    s.h = 0.4;
    s.vel = VEL_RANDOM;
    s.colors(C.pink, C.cyan, C.gold)
      .sizes(0.08, 0.14)
      .lives(1.6, 2.2)
      .speeds(0.5, 1.5, 0.5, 2);
    this.sparks.emit(P.confetti, 16);
    s = this.spec().at(sky, 0.3);
    s.shape = SHAPE_BOX;
    s.r = 1.2;
    s.h = 0.4;
    s.vel = VEL_RANDOM;
    s.colors(C.green, C.gold, C.magenta)
      .sizes(0.08, 0.14)
      .lives(1.6, 2.2)
      .speeds(0.5, 1.5, 0.5, 2);
    this.sparks.emit(P.confetti, 16);
    s = this.spec().at(feet, 0.1);
    s.shape = SHAPE_RING;
    s.r = 0.8;
    s.colors(C.gold, C.white, C.gold)
      .sizes(0.14, 0.24)
      .lives(0.9, 1.4)
      .speeds(0, 0.3, 2.5, 4.5);
    this.sparks.emit(P.twinkle, 16);
    if (a.id === this.hooks.selfId()) this.shake(0.05, 0.3, 1);
  }

  private frostOn(id: string, seconds: number) {
    const fx = this.actors.get(id);
    if (fx) fx.frostUntil = Math.max(fx.frostUntil, this.time + seconds);
  }

  // ───────────────────────────── per-actor persistent visuals ─────────────────────────────

  private weigh(slot: Slot, on: boolean, dt: number, up = 9, down = 5): number {
    slot.w = on
      ? Math.min(1, slot.w + dt * up)
      : Math.max(0, slot.w - dt * down);
    slot.t = on ? slot.t + dt : slot.w > 0 ? slot.t : 0;
    if (slot.w <= 0) this.clearSlot(slot);
    return slot.w;
  }
  private part(
    slot: Slot,
    i: number,
    pool: MeshPool,
    material: Material,
  ): Mesh {
    let m = slot.meshes[i];
    if (!m) {
      m = pool.acquire(material);
      slot.meshes[i] = m;
      slot.pools[i] = pool;
    } else {
      const use = pool.prepare(material);
      if (m.material !== use) m.material = use;
    }
    return m;
  }
  private clearSlot(slot: Slot) {
    for (let i = 0; i < slot.meshes.length; i++) {
      const m = slot.meshes[i];
      if (m) slot.pools[i]!.release(m);
    }
    slot.meshes.length = 0;
    slot.pools.length = 0;
  }
  private releaseParts(meshes: (Mesh | null)[], pools: (MeshPool | null)[]) {
    for (let i = 0; i < meshes.length; i++) {
      const m = meshes[i];
      if (m) pools[i]!.release(m);
      meshes[i] = null;
      pools[i] = null;
    }
  }
  private releaseActor(fx: ActorFx) {
    for (const s of fx.slots) {
      this.clearSlot(s);
      s.w = 0;
    }
    if (fx.trail) this.freeTrail(fx);
  }

  private updateActor(fx: ActorFx, a: ActorView | null, dt: number) {
    if (a) {
      this.ground(a, fx.pos);
      fx.heading = this.facing(a);
      fx.height =
        this.hooks.rig(a.id)?.height ?? (a.kind === "wolf" ? 1.3 : 1.9);
      fx.wolf = a.kind === "wolf";
    }
    const alive = !!a && a.life === "alive";
    const player = !!a && a.kind === "player";
    const knight = player && a!.guild === "knight";
    const cyborg = player && a!.guild === "cyborg";
    const controlled = alive && a!.stunned;
    const rooted = controlled && fx.rootUntil > this.time;
    this.telegraph(fx, a);
    this.trail(fx, a, dt);
    this.chargeUp(fx, alive ? a : null, dt);
    this.guardShield(fx, alive && a!.guarding && player, knight, dt);
    this.oathAura(fx, alive && a!.oath, dt);
    this.rallyCircle(fx, alive && a!.healing && knight, dt);
    this.droneOrbit(fx, alive && a!.healing && cyborg, a, dt);
    this.dizzyStars(fx, controlled && !rooted, a, dt);
    this.rootRings(fx, rooted, dt);
    this.protectLink(fx, alive ? a : null, dt);
    this.frostMotes(fx, alive && fx.frostUntil > this.time, dt);
    this.overclockAura(
      fx,
      alive && cyborg && fx.overclockUntil > this.time,
      a,
      dt,
    );
    if (fx.dronePulse > 0) fx.dronePulse -= dt;
    if (alive && a!.red > 0) {
      const n = this.trickle(fx, ACC_OUTLAW, 2.6, dt);
      if (n) {
        const s = this.spec().at(fx.pos, fx.wolf ? 0.8 : 1.35);
        s.shape = SHAPE_BOX;
        s.r = 0.3;
        s.h = 0.4;
        s.colors(C.crimson, C.red, C.charcoal, 0.42)
          .sizes(0.28, 0.45)
          .lives(1, 1.5)
          .speeds(0.05, 0.2, 0.2, 0.5);
        this.sparks.emit(P.wisp, n, true);
      }
    }
    if (alive && a!.dodging) {
      const n = this.trickle(fx, ACC_DODGE, 34, dt);
      if (n) {
        const s = this.spec().at(fx.pos, 0.1);
        s.r = 0.25;
        s.colors(C.cream, C.dirt, C.dirt, 0.8)
          .sizes(0.25, 0.45)
          .lives(0.3, 0.55)
          .speeds(0.3, 0.9, 0.2, 0.6);
        this.sparks.emit(P.puff, n, true);
      }
    }
  }

  private telegraph(fx: ActorFx, a: ActorView | null) {
    const slot = fx.tele;
    const cast = a && a.life === "alive" ? a.cast : null;
    const on =
      !!cast && (cast.key === "basic" || cast.key === "1" || cast.key === "2");
    if (on && fx.castStart !== cast!.start) {
      this.clearSlot(slot);
      fx.castStart = cast!.start;
      fx.teleProgress = 0;
    }
    if (!on) {
      if (slot.meshes.length) {
        if (fx.teleProgress > 0.8 && fx.teleRadius > 0) {
          const r = this.ring(
            fx.telePos,
            fx.teleColor,
            fx.teleRadius,
            fx.teleRadius * 1.35,
            0.16,
            "thin",
            0,
            0.9,
          );
          r.fade = F_FLASH;
        }
        this.clearSlot(slot);
      }
      fx.castStart = -1;
      slot.w = 0;
      return;
    }
    const c = cast!,
      actor = a!;
    const progress = this.castProgress(actor);
    fx.teleProgress = progress;
    const self = actor.id === this.hooks.selfId();
    const color = self
      ? actor.guild === "cyborg"
        ? C.ownCyan
        : C.ownGold
      : C.enemy;
    fx.teleColor = color;
    const mats = this.kit.materials;
    const lane =
      actor.kind === "player" && actor.guild === "cyborg" && c.key === "1";
    if (lane) {
      const heading = Math.atan2(c.aim.x - actor.x, c.aim.z - actor.z);
      const at = this.u0.copyFrom(fx.pos);
      at.y += 0.05;
      const bg = this.part(
        slot,
        0,
        this.kit.pool("laneQuad"),
        mats.sprite("lane", color, "alpha"),
      );
      bg.position.copyFrom(at);
      bg.rotation.y = heading;
      bg.scaling.set(LANE_WIDTH, 1, LANE_LENGTH);
      bg.visibility = 0.5 + 0.4 * progress;
      const fill = this.part(
        slot,
        1,
        this.kit.pool("laneFill"),
        mats.shape(color, "alpha"),
      );
      fill.position.copyFrom(at);
      fill.position.y += 0.005;
      fill.rotation.y = heading;
      fill.scaling.set(LANE_WIDTH, 1, LANE_LENGTH * Math.max(0.03, progress));
      fill.visibility = 0.95;
      fx.teleRadius = 0;
      return;
    }
    const target = this.byId.get(c.target);
    const at = this.u0;
    if (target && target !== actor) this.ground(target, at);
    else at.set(c.aim.x, this.hooks.groundHeight(c.aim.x, c.aim.z), c.aim.z);
    at.y += 0.05;
    const R = TELEGRAPH_RADIUS;
    const urgent = progress > 0.7 ? 0.5 + 0.5 * Math.sin(this.time * 30) : 0;
    const base = this.part(
      slot,
      0,
      this.kit.pool("teleBase"),
      mats.shape(color, "alpha"),
    );
    base.position.copyFrom(at);
    base.scaling.setAll(R);
    base.visibility = 1;
    const fill = this.part(
      slot,
      1,
      this.kit.pool("teleFill"),
      mats.shape(color, "alpha"),
    );
    fill.position.copyFrom(at);
    fill.position.y += 0.004;
    fill.scaling.setAll(R * Math.max(0.06, ease(E_OUT, progress) * 0.97));
    fill.visibility = 0.85 + 0.15 * urgent;
    const rim = this.part(
      slot,
      2,
      this.kit.pool("teleRim"),
      mats.shape(color, "alpha"),
    );
    rim.position.copyFrom(at);
    rim.position.y += 0.008;
    rim.scaling.setAll(R * (1 + 0.05 * urgent));
    rim.visibility = 0.6 + 0.4 * progress;
    fx.telePos.copyFrom(at);
    fx.teleRadius = R;
  }

  private trail(fx: ActorFx, a: ActorView | null, dt: number) {
    if (a && a.life === "alive" && a.cast) {
      const k = this.kindOf(a);
      if (
        (k === "knight" && (a.cast.key === "basic" || a.cast.key === "1")) ||
        (k === "guard" && a.cast.key === "basic")
      ) {
        fx.trailUntil = Math.max(fx.trailUntil, this.time + 0.1);
        if (!fx.trailMaterial)
          fx.trailMaterial = this.trailMaterial(
            k === "guard" ? C.amber : a.cast.key === "1" ? C.gold : C.sky,
          );
      }
    }
    const sampling = !!a && this.time < fx.trailUntil;
    if (sampling && !fx.trail) {
      fx.trail = this.trailFree.pop() ?? this.newTrail();
      this.trailCount++;
      fx.trail.start(
        fx.id,
        fx.trailMaterial ?? this.trailMaterial(C.sky),
        fx.trailUntil,
      );
    }
    if (!fx.trail) return;
    if (sampling) {
      const rig = this.hooks.rig(a!.id);
      const node = rig?.sockets.weapon;
      if (node) {
        const tip = this.world(node, this.u1);
        node.getDirectionToRef(LOCAL_Z, this.u2);
        this.u2.normalize();
        const len = rig!.kind === "guard" ? 0.75 : 0.85;
        const base = this.u3.set(
          tip.x - this.u2.x * len,
          tip.y - this.u2.y * len,
          tip.z - this.u2.z * len,
        );
        fx.trail.push(tip, base, dt);
      }
    }
    const visible = fx.trail.update(dt, 0.16, 3.2);
    if (!sampling && !visible) this.freeTrail(fx);
  }
  private newTrail(): Trail {
    const trail = new Trail(this.scene, `combat-trail-${this.trailCount}`);
    this.hooks.glow(trail.mesh);
    return trail;
  }
  private trailMaterial(color: Color3): Material {
    return this.kit.materials.glowing(this.kit.materials.shape(color));
  }
  private freeTrail(fx: ActorFx) {
    fx.trail!.stop();
    this.trailFree.push(fx.trail!);
    fx.trail = null;
    fx.trailMaterial = null;
    this.trailCount--;
  }

  private chargeUp(fx: ActorFx, a: ActorView | null, dt: number) {
    const slot = fx.charge;
    const cast = a && a.kind === "player" ? a.cast : null;
    const on =
      !!cast && cast.key !== "space" && cast.key !== "c" && cast.key !== "q";
    const w = this.weigh(slot, on, dt, 10, 6);
    if (!on || !a) {
      if (w <= 0) return;
      const glow = slot.meshes[0];
      if (glow) glow.visibility = 0.9 * w;
      return;
    }
    const key = cast!.key;
    const progress = this.castProgress(a);
    if (a.guild === "cyborg") {
      const tip = this.weapon(a, this.u1);
      if (key === "1") {
        const glow = this.part(
          slot,
          0,
          this.kit.pool("quad", true),
          this.kit.materials.sprite("soft", C.cyan, "add"),
        );
        glow.billboardMode = Mesh.BILLBOARDMODE_ALL;
        glow.position.copyFrom(tip);
        glow.scaling.setAll(
          0.25 + 0.75 * progress + 0.08 * Math.sin(this.time * 40),
        );
        glow.visibility = 0.9 * w;
        const n = this.trickle(fx, ACC_CHARGE, 70, dt);
        if (n) {
          const s = this.spec().at(tip);
          s.r = 1.0;
          s.vel = VEL_INWARD;
          s.colors(C.cyan, C.white, C.white)
            .sizes(0.06, 0.11)
            .lives(0.26, 0.32)
            .speeds(2.8, 3.6);
          this.sparks.emit(P.glint, n, true);
        }
        return;
      }
      const color =
        key === "2"
          ? C.magenta
          : key === "5"
            ? C.mint
            : key === "r"
              ? C.amber
              : C.cyan;
      const n = this.trickle(
        fx,
        ACC_CHARGE,
        key === "basic" || key === "2" ? 30 : 16,
        dt,
      );
      if (!n) return;
      const s = this.spec();
      if (key === "basic" || key === "2") {
        s.at(tip);
        s.r = 0.45;
        s.vel = VEL_INWARD;
        s.colors(color, C.white, C.white)
          .sizes(0.05, 0.09)
          .lives(0.14, 0.18)
          .speeds(2.4, 3);
        this.sparks.emit(P.glint, n, true);
      } else {
        s.at(fx.pos, 0.2);
        s.shape = SHAPE_RING;
        s.r = 0.6;
        s.h = 0.5;
        s.colors(color, C.white, color)
          .sizes(0.1, 0.18)
          .lives(0.5, 0.8)
          .speeds(0, 0.2, 1.2, 2.2);
        this.sparks.emit(P.twinkle, n, true);
      }
      return;
    }
    if (a.guild !== "knight" || key === "basic") return;
    const n = this.trickle(fx, ACC_CHARGE, key === "1" ? 34 : 18, dt);
    if (!n) return;
    const s = this.spec();
    if (key === "1") {
      s.at(this.weapon(a, this.u1));
      s.r = 0.7;
      s.vel = VEL_INWARD;
      s.colors(C.gold, C.white, C.white)
        .sizes(0.07, 0.12)
        .lives(0.2, 0.26)
        .speeds(2.6, 3.4);
      this.sparks.emit(P.glint, n, true);
    } else {
      s.at(fx.pos, 0.15);
      s.shape = SHAPE_RING;
      s.r = key === "r" ? 1.1 : 0.7;
      s.h = 0.4;
      const color = key === "5" ? C.mint : C.gold;
      s.colors(color, C.white, color)
        .sizes(0.1, 0.2)
        .lives(0.5, 0.8)
        .speeds(0, 0.3, 1.2, 2.4);
      this.sparks.emit(P.twinkle, n, true);
    }
  }

  private guardShield(fx: ActorFx, on: boolean, knight: boolean, dt: number) {
    const slot = fx.guard;
    const w = this.weigh(slot, on, dt, 14, 6);
    if (!w) return;
    const pop = ease(E_BACK, Math.min(1, slot.t * 6 + (on ? 0 : 1)));
    const mats = this.kit.materials;
    const h = fx.heading;
    if (knight) {
      const m = this.part(
        slot,
        0,
        this.kit.pool("quad"),
        mats.sprite("kite", C.gold),
      );
      m.position.set(
        fx.pos.x + Math.sin(h) * 0.62,
        fx.pos.y + 1.0,
        fx.pos.z + Math.cos(h) * 0.62,
      );
      // Turn the shield partly towards the camera so it never reads edge-on.
      const toCam = Math.atan2(
        this.eye.x - m.position.x,
        this.eye.z - m.position.z,
      );
      m.rotation.y = h + angleDelta(h, toCam) * 0.6;
      m.scaling.setAll(1.3 * pop);
      m.visibility = w * (0.82 + 0.1 * Math.sin(this.time * 9));
    } else {
      const m = this.part(
        slot,
        0,
        this.kit.pool("sphere"),
        mats.bubble(C.cyan, "hex"),
      );
      m.position.set(fx.pos.x, fx.pos.y + 0.95, fx.pos.z);
      m.rotation.y = this.time * 0.7;
      m.scaling.set(0.95 * pop, 1.15 * pop, 0.95 * pop);
      m.visibility = 0.36 * w;
    }
  }

  private oathAura(fx: ActorFx, on: boolean, dt: number) {
    const slot = fx.oath;
    const w = this.weigh(slot, on, dt, 5, 3);
    if (!w) return;
    const mats = this.kit.materials;
    const p = fx.pos;
    const pop = ease(E_BACK, Math.min(1, w));
    const circle = this.part(
      slot,
      0,
      this.kit.pool("floor"),
      mats.sprite("rune", C.gold),
    );
    circle.position.set(p.x, p.y + 0.05, p.z);
    circle.rotation.y = this.time * 0.8;
    circle.scaling.set(2.7 * pop, 1, 2.7 * pop);
    circle.visibility = 0.85 * w;
    const aura = this.part(
      slot,
      1,
      this.kit.pool("pillar"),
      mats.shape(C.gold),
    );
    aura.position.copyFrom(p);
    const breathe = 1 + 0.06 * Math.sin(this.time * 4);
    aura.scaling.set(0.72 * breathe, 2.3, 0.72 * breathe);
    aura.visibility = 0.32 * w;
    const pillar = this.part(
      slot,
      2,
      this.kit.pool("pillar"),
      mats.shape(C.gold),
    );
    pillar.position.copyFrom(p);
    pillar.scaling.set(0.4, 7, 0.4);
    pillar.visibility = 0.16 * w;
    const crest = this.part(
      slot,
      3,
      this.kit.pool("quad"),
      mats.sprite("kite", C.gold),
    );
    crest.billboardMode = Mesh.BILLBOARDMODE_Y;
    crest.position.set(
      p.x,
      p.y + fx.height + 0.7 + 0.08 * Math.sin(this.time * 2.5),
      p.z,
    );
    crest.scaling.setAll(0.6 * pop);
    crest.visibility = 0.95 * w;
    const n = on ? this.trickle(fx, ACC_OATH, 12, dt) : 0;
    if (n) {
      const s = this.spec().at(p, 0.1);
      s.shape = SHAPE_RING;
      s.r = 1.1;
      s.colors(C.gold, C.white, C.gold)
        .sizes(0.1, 0.2)
        .lives(0.9, 1.4)
        .speeds(0, 0.2, 1.2, 2.2);
      this.sparks.emit(P.twinkle, n, true);
    }
  }

  private rallyCircle(fx: ActorFx, on: boolean, dt: number) {
    const slot = fx.rally;
    const w = this.weigh(slot, on, dt, 6, 3.5);
    if (!w) return;
    const mats = this.kit.materials;
    const p = fx.pos;
    const pop = ease(E_BACK, Math.min(1, w));
    const circle = this.part(
      slot,
      0,
      this.kit.pool("floor"),
      mats.sprite("heal", C.green),
    );
    circle.position.set(p.x, p.y + 0.05, p.z);
    circle.rotation.y = -this.time * 0.6;
    circle.scaling.set(2.1 * pop, 1, 2.1 * pop);
    circle.visibility = 0.85 * w;
    const glow = this.part(slot, 1, this.kit.pool("disc"), mats.shape(C.green));
    glow.position.set(p.x, p.y + 0.045, p.z);
    glow.scaling.setAll(1.05 * pop);
    glow.visibility = (0.22 + 0.06 * Math.sin(this.time * 3)) * w;
    const n = on ? this.trickle(fx, ACC_RALLY, 7, dt) : 0;
    if (n) {
      const s = this.spec().at(p, 0.15);
      s.shape = SHAPE_RING;
      s.r = 0.75;
      s.h = 0.3;
      s.colors(C.white, C.white, C.white)
        .sizes(0.18, 0.28)
        .lives(0.9, 1.3)
        .speeds(0, 0.1, 0.9, 1.4);
      this.sparks.emit(P.plus, n, true);
      if (Math.random() < 0.6) {
        s.colors(C.gold, C.white, C.gold).sizes(0.1, 0.18);
        this.sparks.emit(P.twinkle, 1, true);
      }
    }
  }

  private droneOrbit(
    fx: ActorFx,
    on: boolean,
    a: ActorView | null,
    dt: number,
  ) {
    const slot = fx.drone;
    const w = this.weigh(slot, on, dt, 5, 4);
    if (!w) return;
    const mats = this.kit.materials;
    const p = fx.pos;
    const ang = this.time * 1.7;
    const pop = ease(E_BACK, Math.min(1, w));
    const x = p.x + Math.sin(ang) * 0.85,
      y = p.y + 1.85 + 0.08 * Math.sin(this.time * 3.1),
      z = p.z + Math.cos(ang) * 0.85;
    const body = this.part(
      slot,
      0,
      this.kit.pool("droneBody"),
      mats.solid("drone", 0.25),
    );
    body.position.set(x, y, z);
    body.rotation.set(0.12 * Math.sin(this.time * 2), ang + Math.PI / 2, 0.15);
    body.scaling.setAll(1.35 * pop);
    const eyes = this.part(
      slot,
      1,
      this.kit.pool("droneEyes", true),
      mats.shape(C.cyan, "alpha"),
    );
    eyes.position.copyFrom(body.position);
    eyes.rotation.copyFrom(body.rotation);
    eyes.scaling.setAll(1.35 * pop);
    const rotor = this.part(
      slot,
      2,
      this.kit.pool("droneRotor"),
      mats.solid("drone", 0.25),
    );
    rotor.position.set(x, y + 0.27 * pop, z);
    rotor.rotation.y = this.time * 28;
    rotor.scaling.setAll(1.35 * pop);
    const halo = this.part(
      slot,
      3,
      this.kit.pool("quad"),
      mats.sprite("soft", C.green),
    );
    halo.billboardMode = Mesh.BILLBOARDMODE_ALL;
    halo.position.set(x, y - 0.12, z);
    halo.scaling.setAll(0.55 * pop);
    halo.visibility = 0.45 * w;
    if (fx.dronePulse > 0 && a) {
      const k = fx.dronePulse / 0.32;
      const chest = this.body(a, this.u1);
      const beam = this.part(
        slot,
        4,
        this.kit.pool("beam"),
        mats.shape(C.green),
      );
      aim(beam, body.position, chest);
      const len = Vector3.Distance(body.position, chest);
      beam.scaling.set(0.07 * k, 0.07 * k, len);
      beam.visibility = 0.9 * k;
    } else if (slot.meshes[4]) {
      slot.pools[4]!.release(slot.meshes[4]!);
      slot.meshes[4] = null;
      slot.pools[4] = null;
    }
  }

  private dizzyStars(
    fx: ActorFx,
    on: boolean,
    a: ActorView | null,
    dt: number,
  ) {
    const slot = fx.dizzy;
    const w = this.weigh(slot, on, dt, 10, 5);
    if (!w) return;
    const mat = this.kit.materials.sticker("dizzy");
    const pool = this.kit.pool("quad");
    const top = a
      ? this.head(a, this.u1)
      : this.u1.set(fx.pos.x, fx.pos.y + fx.height, fx.pos.z);
    const r = fx.wolf ? 0.42 : 0.5;
    for (let i = 0; i < 3; i++) {
      const m = this.part(slot, i, pool, mat);
      m.billboardMode = Mesh.BILLBOARDMODE_ALL;
      const ang = this.time * 4.2 + (i * TAU) / 3;
      m.position.set(
        top.x + Math.sin(ang) * r,
        top.y + 0.18 + 0.07 * Math.sin(ang * 2),
        top.z + Math.cos(ang) * r,
      );
      m.scaling.setAll(
        0.48 * ease(E_BACK, w) * (0.85 + 0.15 * Math.sin(ang * 3)),
      );
      m.rotation.z = this.time * 3 + i;
      m.visibility = w;
    }
  }

  private rootRings(fx: ActorFx, on: boolean, dt: number) {
    const slot = fx.root;
    const w = this.weigh(slot, on, dt, 10, 5);
    if (!w) return;
    const mat = this.kit.materials.shape(C.magenta);
    const pool = this.kit.pool("ring");
    const p = fx.pos;
    for (let i = 0; i < 3; i++) {
      const m = this.part(slot, i, pool, mat);
      const y = 0.18 + i * 0.32 + 0.05 * Math.sin(this.time * 5 + i * 2);
      m.position.set(p.x, p.y + y, p.z);
      m.rotation.set(
        0.18 * Math.sin(this.time * 3 + i),
        this.time * (i % 2 ? -3 : 3),
        0.18 * Math.cos(this.time * 3 + i),
      );
      m.scaling.setAll(((fx.wolf ? 0.78 : 0.62) - i * 0.07) * ease(E_BACK, w));
      m.visibility = 0.9 * w;
    }
    const disc = this.part(slot, 3, this.kit.pool("disc"), mat);
    disc.position.set(p.x, p.y + 0.045, p.z);
    disc.scaling.setAll((fx.wolf ? 0.95 : 0.75) * w);
    disc.visibility = 0.4 * w;
    const n = on ? this.trickle(fx, ACC_ROOT, 10, dt) : 0;
    if (n) {
      const s = this.spec().at(p, 0.5);
      s.r = 0.6;
      s.vel = VEL_INWARD;
      s.colors(C.magenta, C.violet, C.white)
        .sizes(0.06, 0.11)
        .lives(0.25, 0.4)
        .speeds(1, 2);
      this.sparks.emit(P.glint, n, true);
    }
  }

  private protectLink(fx: ActorFx, a: ActorView | null, dt: number) {
    const slot = fx.protect;
    const guardian = a?.protectedBy ? this.byId.get(a.protectedBy) : undefined;
    const on = !!a && !!a.protectedBy;
    const w = this.weigh(slot, on, dt, 8, 4);
    if (!w) return;
    const mats = this.kit.materials;
    const chest = a
      ? this.body(a, this.u1)
      : this.u1.set(fx.pos.x, fx.pos.y + 1, fx.pos.z);
    const bubble = this.part(
      slot,
      0,
      this.kit.pool("sphere"),
      mats.bubble(C.gold),
    );
    bubble.position.copyFrom(chest);
    bubble.position.y -= 0.1;
    const pop = ease(E_BACK, Math.min(1, w));
    const r = fx.wolf ? 0.8 : 1;
    bubble.scaling.set(0.95 * r * pop, 1.15 * r * pop, 0.95 * r * pop);
    bubble.visibility = 0.65 * w;
    if (guardian && guardian.life === "alive" && guardian !== a) {
      const from = this.body(guardian, this.u2);
      const tether = this.part(
        slot,
        1,
        this.kit.pool("beam"),
        mats.shape(C.gold),
      );
      aim(tether, from, chest);
      const len = Vector3.Distance(from, chest);
      const thick = 0.045 + 0.012 * Math.sin(this.time * 10);
      tether.scaling.set(thick, thick, len);
      tether.visibility = 0.75 * w;
      const bead = this.part(
        slot,
        2,
        this.kit.pool("quad", true),
        mats.sprite("spark", C.gold, "add"),
      );
      bead.billboardMode = Mesh.BILLBOARDMODE_ALL;
      Vector3.LerpToRef(from, chest, (this.time * 1.4) % 1, bead.position);
      bead.scaling.setAll(0.4);
      bead.visibility = w;
    } else {
      for (const i of [1, 2]) {
        const m = slot.meshes[i];
        if (m) {
          slot.pools[i]!.release(m);
          slot.meshes[i] = null;
          slot.pools[i] = null;
        }
      }
    }
  }

  private frostMotes(fx: ActorFx, on: boolean, dt: number) {
    const slot = fx.frost;
    const w = this.weigh(slot, on, dt, 8, 3);
    if (!w) return;
    const ring = this.part(
      slot,
      0,
      this.kit.pool("thin"),
      this.kit.materials.shape(C.ice),
    );
    ring.position.set(fx.pos.x, fx.pos.y + 0.06, fx.pos.z);
    ring.scaling.setAll(fx.wolf ? 0.7 : 0.6);
    ring.rotation.y = this.time;
    ring.visibility = 0.7 * w;
    const n = on ? this.trickle(fx, ACC_FROST, 9, dt) : 0;
    if (n) {
      const s = this.spec().at(fx.pos, fx.wolf ? 0.7 : 1.1);
      s.r = 0.5;
      s.colors(C.white, C.frost, C.ice)
        .sizes(0.1, 0.18)
        .lives(0.6, 1)
        .speeds(0.1, 0.4, -0.2, 0.2);
      this.sparks.emit(P.flake, n, true);
    }
  }

  private overclockAura(
    fx: ActorFx,
    on: boolean,
    a: ActorView | null,
    dt: number,
  ) {
    const slot = fx.overclock;
    const w = this.weigh(slot, on, dt, 6, 3);
    if (!w) return;
    const aura = this.part(
      slot,
      0,
      this.kit.pool("pillar"),
      this.kit.materials.shape(C.cyan),
    );
    aura.position.copyFrom(fx.pos);
    const f = 0.85 + 0.15 * Math.sin(this.time * 23) * Math.sin(this.time * 7);
    aura.scaling.set(0.72 * f, 2.2, 0.72 * f);
    aura.visibility = 0.42 * w;
    const ring = this.part(
      slot,
      1,
      this.kit.pool("thin"),
      this.kit.materials.shape(C.cyan),
    );
    ring.position.set(fx.pos.x, fx.pos.y + 0.06, fx.pos.z);
    ring.rotation.y = -this.time * 4;
    ring.scaling.setAll(0.8 + 0.06 * Math.sin(this.time * 17));
    ring.visibility = 0.8 * w;
    if (!on || !a) return;
    const chest = this.body(a, this.u1);
    let n = this.trickle(fx, ACC_OVER, 9, dt);
    if (n) {
      const s = this.spec().at(chest);
      s.r = 0.55;
      s.colors(C.cyan, C.white, C.cyan)
        .sizes(0.22, 0.34)
        .lives(0.18, 0.3)
        .speeds(0.2, 0.6);
      this.sparks.emit(P.bolt, n, true);
    }
    n = this.trickle(fx, ACC_TRAIL, 22, dt);
    if (n) {
      const s = this.spec().at(fx.pos, 0.6);
      s.shape = SHAPE_BOX;
      s.r = 0.35;
      s.h = 0.9;
      s.colors(C.amber, C.gold, C.red)
        .sizes(0.06, 0.12)
        .lives(0.5, 0.9)
        .speeds(0, 0.3, 0.6, 1.4);
      this.sparks.emit(P.ember, n, true);
    }
    if (this.trickle(fx, ACC_ARC, 6, dt)) {
      const ang = Math.random() * TAU;
      this.arc(
        chest,
        this.u2.set(
          chest.x + Math.sin(ang) * 0.7,
          chest.y + rand(-0.5, 0.6),
          chest.z + Math.cos(ang) * 0.7,
        ),
        C.cyan,
        0.14,
        0.12,
        0.03,
      );
    }
  }

  // ───────────────────────────── projectiles, mines, orbs ─────────────────────────────

  private updateShots(s: Snapshot, dt: number) {
    const since = Math.min(0.12, this.time - this.snapAt);
    const mats = this.kit.materials;
    for (const p of s.projectiles ?? []) {
      if (!this.nearXZ(p.x, p.z)) continue;
      let shot = this.shots.get(p.id);
      const clamp = p.key === "2";
      const color = clamp ? C.magenta : C.cyan;
      if (!shot) {
        shot = new ShotFx();
        shot.id = p.id;
        shot.key = p.key;
        shot.owner = p.owner;
        shot.x = p.x;
        shot.z = p.z;
        shot.y = 1.1;
        const owner = this.byId.get(p.owner);
        if (owner && this.hooks.rig(owner.id)) {
          const muzzle = this.weapon(owner, this.u1);
          if (Math.hypot(muzzle.x - p.x, muzzle.z - p.z) < 3) {
            shot.x = muzzle.x;
            shot.y = muzzle.y;
            shot.z = muzzle.z;
          }
        }
        if (clamp) {
          shot.pools[0] = this.kit.pool("ringV", true);
          shot.meshes[0] = shot.pools[0].acquire(mats.shape(color));
          shot.meshes[0].billboardMode = Mesh.BILLBOARDMODE_ALL;
          shot.pools[1] = this.kit.pool("ring", true);
          shot.meshes[1] = shot.pools[1].acquire(mats.shape(C.violet));
        } else {
          shot.pools[0] = this.kit.pool("beam", true);
          shot.meshes[0] = shot.pools[0].acquire(mats.shape(C.white, "add"));
          shot.pools[1] = this.kit.pool("beam", true);
          shot.meshes[1] = shot.pools[1].acquire(mats.shape(color));
        }
        shot.pools[2] = this.kit.pool("quad", true);
        shot.meshes[2] = shot.pools[2].acquire(
          mats.sprite("soft", color, "add"),
        );
        shot.meshes[2].billboardMode = Mesh.BILLBOARDMODE_ALL;
        this.shots.set(p.id, shot);
      }
      shot.seen = this.frame;
      shot.dx = p.dx;
      shot.dz = p.dz;
      shot.age += dt;
      // Extrapolate along the shot, then ease towards the server's line.
      shot.x += p.dx * SHOT_SPEED * dt;
      shot.z += p.dz * SHOT_SPEED * dt;
      const tx = p.x + p.dx * SHOT_SPEED * since,
        tz = p.z + p.dz * SHOT_SPEED * since;
      const k = Math.min(1, dt * 10);
      shot.x += (tx - shot.x) * k;
      shot.z += (tz - shot.z) * k;
      shot.y += (1.1 - shot.y) * Math.min(1, dt * 8);
      const heading = Math.atan2(p.dx, p.dz);
      const [a, b, glow] = shot.meshes;
      if (clamp) {
        const spin = this.time * 14;
        a!.position.set(shot.x, shot.y, shot.z);
        a!.scaling.setAll(0.42 + 0.05 * Math.sin(this.time * 30));
        b!.position.copyFrom(a!.position);
        b!.rotation.set(spin, heading, 0.4);
        b!.scaling.setAll(0.34);
      } else {
        const len = 0.7;
        a!.position.set(
          shot.x - p.dx * len * 0.5,
          shot.y,
          shot.z - p.dz * len * 0.5,
        );
        a!.rotation.set(0, heading, 0);
        a!.scaling.set(0.05, 0.05, len);
        b!.position.copyFrom(a!.position);
        b!.position.x -= p.dx * 0.15;
        b!.position.z -= p.dz * 0.15;
        b!.rotation.set(0, heading, 0);
        b!.scaling.set(0.12, 0.12, len + 0.3);
        b!.visibility = 0.75;
      }
      glow!.position.set(shot.x, shot.y, shot.z);
      glow!.scaling.setAll(clamp ? 0.55 : 0.6);
      glow!.visibility = 0.85;
      shot.acc += dt * 60 * this.sparks.scale;
      const n = Math.floor(shot.acc);
      shot.acc -= n;
      if (n) {
        const sp = this.spec();
        sp.x = shot.x;
        sp.y = shot.y;
        sp.z = shot.z;
        sp.r = 0.05;
        sp.dir(-p.dx, 0, -p.dz, 0.25);
        sp.colors(color, C.white, color)
          .sizes(0.05, 0.09)
          .lives(0.12, 0.22)
          .speeds(0.5, 1.5);
        this.sparks.emit(clamp ? P.glint : P.spark, n, true);
      }
    }
    for (const shot of this.shots.values())
      if (shot.seen !== this.frame) {
        const sp = this.spec();
        sp.x = shot.x;
        sp.y = shot.y;
        sp.z = shot.z;
        sp.r = 0.1;
        const color = shot.key === "2" ? C.magenta : C.cyan;
        sp.colors(color, C.white, color)
          .sizes(0.08, 0.14)
          .lives(0.15, 0.3)
          .speeds(0.5, 1.6);
        this.sparks.emit(P.glint, 5);
        this.releaseParts(shot.meshes, shot.pools);
        this.shots.delete(shot.id);
      }
  }

  private updateMines(s: Snapshot) {
    const mats = this.kit.materials;
    const me = this.hooks.selfId();
    for (const m of s.mines ?? []) {
      if (!this.nearXZ(m.x, m.z)) continue;
      let mine = this.mines.get(m.id);
      if (!mine) {
        mine = new MineFx();
        mine.id = m.id;
        mine.owner = m.owner;
        mine.own = m.owner === me;
        mine.x = m.x;
        mine.z = m.z;
        mine.y = this.hooks.groundHeight(m.x, m.z);
        mine.born = this.time;
        mine.armedAt = m.armed ? this.time - 1 : -1;
        mine.pools[0] = this.kit.pool("mineBody");
        mine.meshes[0] = mine.pools[0].acquire(mats.solid("mine", 0.12));
        mine.pools[1] = this.kit.pool("mineLight", true);
        mine.meshes[1] = mine.pools[1].acquire(
          mats.shape(mine.own ? C.cyan : C.enemy),
        );
        mine.pools[2] = this.kit.pool("thin");
        mine.meshes[2] = mine.pools[2].acquire(mats.shape(C.cyan));
        mine.pools[3] = this.kit.pool("teleRim");
        mine.meshes[3] = mine.pools[3].acquire(
          mats.shape(mine.own ? C.ownCyan : C.enemy, "alpha"),
        );
        this.mines.set(m.id, mine);
      }
      mine.seen = this.frame;
      if (m.armed && mine.armedAt < 0) {
        mine.armedAt = this.time;
        const at = this.u1.set(mine.x, mine.y + 0.06, mine.z);
        this.ring(at, mine.own ? C.cyan : C.enemy, 0.3, 2.0, 0.35, "thin");
      }
      const age = this.time - mine.born;
      const [body, light, arming, danger] = mine.meshes;
      const drop = Math.min(1, age / 0.25);
      body!.position.set(
        mine.x,
        mine.y + (1 - ease(E_BACK, drop)) * 0.4,
        mine.z,
      );
      body!.rotation.y = mine.x * 3.1;
      body!.scaling.setAll(0.6 + 0.4 * ease(E_BACK, drop));
      light!.position.copyFrom(body!.position);
      light!.rotation.y = body!.rotation.y;
      light!.scaling.copyFrom(body!.scaling);
      const armed = mine.armedAt >= 0;
      // The glow layer ignores visibility, so the light blinks on and off.
      light!.isVisible =
        Math.sin(this.time * (armed ? 14 : 6) + mine.born) >
        (armed ? 0.1 : 0.4);
      arming!.position.set(mine.x, mine.y + 0.05, mine.z);
      const prog = armed ? 1 : Math.min(1, age);
      arming!.scaling.setAll(
        0.2 + 0.4 * prog + (armed ? 0.05 * Math.sin(this.time * 8) : 0),
      );
      arming!.visibility = armed ? 0.6 : 0.4 + 0.5 * prog;
      danger!.position.set(mine.x, mine.y + 0.03, mine.z);
      danger!.scaling.setAll(armed ? 2 : 2 * prog);
      const strength = mine.own ? 0.45 : 0.75;
      danger!.visibility = armed
        ? strength + 0.15 * Math.sin(this.time * 6)
        : strength * 0.4 * prog;
    }
    for (const mine of this.mines.values())
      if (mine.seen !== this.frame) {
        if (!mine.exploded) {
          const at = this.u1.set(mine.x, mine.y + 0.2, mine.z);
          const sp = this.spec().at(at);
          sp.r = 0.15;
          sp.colors(C.smoke, C.lavender, C.lavender, 0.8)
            .sizes(0.3, 0.5)
            .lives(0.4, 0.7)
            .speeds(0.4, 1);
          this.sparks.emit(P.puff, 5);
        }
        this.releaseParts(mine.meshes, mine.pools);
        this.mines.delete(mine.id);
      }
  }

  private explodeMineFor(owner: string, victim: ActorView) {
    let best: MineFx | null = null,
      bestD = Infinity;
    for (const m of this.mines.values()) {
      if (m.owner !== owner || m.exploded) continue;
      const d = Math.hypot(m.x - victim.x, m.z - victim.z);
      if (d < bestD) {
        best = m;
        bestD = d;
      }
    }
    if (best && bestD > 3) best = null;
    if (!best && this.recentBlast(victim.x, victim.z)) return;
    const at = this.v4;
    if (best) {
      best.exploded = true;
      at.set(best.x, best.y, best.z);
    } else
      at.set(victim.x, this.hooks.groundHeight(victim.x, victim.z), victim.z);
    this.blastAt = this.time;
    this.blastX = at.x;
    this.blastZ = at.z;
    this.explosion(at, owner);
  }
  private blastAt = -10;
  private blastX = 0;
  private blastZ = 0;
  private recentBlast(x: number, z: number): boolean {
    return (
      this.time - this.blastAt < 0.3 &&
      Math.hypot(x - this.blastX, z - this.blastZ) < 3
    );
  }

  private explosion(ground: Vector3, owner: string) {
    const mats = this.kit.materials;
    const core = this.v5.copyFrom(ground);
    core.y += 0.35;
    // Quick white pop and a cartoon starburst rather than a lingering dome.
    const flash = this.spawn(
      this.kit.pool("sphere"),
      mats.shape(C.white, "add"),
      0.12,
    );
    flash.mesh!.position.copyFrom(core);
    flash.s0.setAll(0.3);
    flash.s1.setAll(1.3);
    flash.fade = F_FLASH;
    this.sprite(
      core,
      mats.sprite("star4", C.cyan, "add"),
      0.8,
      3.4,
      0.22,
      E_OUT,
      F_FLASH,
    );
    this.sprite(
      core,
      mats.sprite("star4", C.white, "add"),
      0.5,
      2.0,
      0.14,
      E_OUT,
      F_FLASH,
    ).mesh!.rotation.z = Math.PI / 4;
    const flat = this.v4.copyFrom(ground);
    flat.y += 0.06;
    this.ring(flat, C.cyan, 0.4, 2.6, 0.4, "shock");
    this.ring(flat, C.white, 0.3, 2.1, 0.28, "thin", 0.04);
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * TAU + Math.random() * 0.6;
      const r = rand(1.2, 2.2);
      this.arc(
        core,
        this.v3.set(
          core.x + Math.sin(ang) * r,
          ground.y + rand(0.1, 1.1),
          core.z + Math.cos(ang) * r,
        ),
        i % 2 ? C.white : C.cyan,
        rand(0.25, 0.4),
        0.25,
        0.05,
      );
    }
    let s = this.spec().at(core);
    s.r = 0.2;
    s.colors(C.cyan, C.white, C.cyan)
      .sizes(0.26, 0.4)
      .lives(0.3, 0.55)
      .speeds(2.5, 4.5);
    this.sparks.emit(P.bolt, 8);
    s = this.spec().at(core);
    s.r = 0.2;
    s.colors(C.white, C.cyan, C.cyanDeep)
      .sizes(0.06, 0.12)
      .lives(0.3, 0.6)
      .speeds(4, 8, 1, 3);
    this.sparks.emit(P.spark, 26);
    s = this.spec().at(core);
    s.r = 0.4;
    s.colors(C.smoke, C.lavender, C.stoneDark, 0.75)
      .sizes(0.6, 1.0)
      .lives(0.6, 1.0)
      .speeds(1, 2.2, 0.4, 1);
    this.sparks.emit(P.puff, 8);
    this.debrisBurst(core, 16, MINE_BITS, 1.3);
    this.debrisBurst(core, 8, GROUND_BITS, 1);
    const w = this.proximity(ground.x, ground.z, owner);
    this.shake(0.26, 0.38, w);
    this.hitStop(0.06, w);
  }

  private updateOrbs(dt: number) {
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      const m = o.mesh!;
      o.t += dt;
      let done = false;
      if (o.wisp) {
        o.p.y += o.v.y * dt;
        m.position.set(
          o.p.x + Math.sin(o.t * 3.2) * 0.22,
          o.p.y,
          o.p.z + Math.cos(o.t * 2.6) * 0.12,
        );
        m.scaling.setAll(0.55 + 0.08 * Math.sin(o.t * 8));
        m.visibility = Math.min(1, o.t * 4) * (1 - smooth(2.0, 2.6, o.t));
        done = o.t >= 2.6;
      } else {
        const target = this.hooks.position(o.target);
        if (o.t < o.hold || !target) {
          o.v.y -= 9.5 * dt;
          if (o.p.y < 0.4 && o.v.y < 0) o.v.y *= -0.5;
        } else {
          const tx = target.x - o.p.x,
            ty = target.y + 1.0 - o.p.y,
            tz = target.z - o.p.z;
          const d = Math.hypot(tx, ty, tz);
          const speed = 4 + 16 * Math.min(1, (o.t - o.hold) * 1.6);
          const k = Math.min(1, dt * 7);
          o.v.x += ((tx / (d || 1)) * speed - o.v.x) * k;
          o.v.y += ((ty / (d || 1)) * speed - o.v.y) * k;
          o.v.z += ((tz / (d || 1)) * speed - o.v.z) * k;
          if (d < 0.35) {
            const s = this.spec().at(o.p);
            s.r = 0.1;
            s.colors(C.gold, C.white, C.gold)
              .sizes(0.18, 0.3)
              .lives(0.3, 0.5)
              .speeds(1, 2.2);
            this.sparks.emit(P.star, 4);
            done = true;
          }
        }
        o.p.x += o.v.x * dt;
        o.p.y += o.v.y * dt;
        o.p.z += o.v.z * dt;
        m.position.copyFrom(o.p);
        m.scaling.setAll(0.5 + 0.08 * Math.sin(o.t * 18));
        m.visibility =
          Math.min(1, o.t * 8) * (target ? 1 : 1 - smooth(1.2, 1.6, o.t));
        if (o.t > 3 || (!target && o.t > 1.6)) done = true;
      }
      o.acc += dt * (o.wisp ? 18 : 40) * this.sparks.scale;
      const n = Math.floor(o.acc);
      o.acc -= n;
      if (n && !done) {
        const s = this.spec().at(m.position);
        s.r = 0.06;
        s.vel = VEL_RANDOM;
        const c = o.wisp ? C.lavender : C.gold;
        s.colors(c, C.white, c)
          .sizes(0.08, 0.15)
          .lives(0.25, 0.45)
          .speeds(0.05, 0.3);
        this.sparks.emit(o.wisp ? P.twinkle : P.glint, n, true);
      }
      if (done) {
        o.pool!.release(m);
        o.mesh = null;
        o.pool = null;
        const last = this.orbs.pop()!;
        if (i < this.orbs.length) this.orbs[i] = last;
        this.orbFree.push(o);
      }
    }
  }
}

// ───────────────────────────── math helpers ─────────────────────────────

/** Signed shortest rotation from angle a to angle b. */
function angleDelta(a: number, b: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Point a +Z-aligned mesh from `from` towards `to` (yaw + pitch). */
function aim(mesh: Mesh, from: Vector3, to: Vector3) {
  const dx = to.x - from.x,
    dy = to.y - from.y,
    dz = to.z - from.z;
  mesh.position.copyFrom(from);
  mesh.rotation.set(-Math.atan2(dy, Math.hypot(dx, dz)), Math.atan2(dx, dz), 0);
}

/** Force world matrices down a socket's parent chain (sockets move every frame). */
function refresh(node: Node) {
  const parent = node.parent;
  if (parent) refresh(parent);
  (node as TransformNode).computeWorldMatrix?.(true);
}
