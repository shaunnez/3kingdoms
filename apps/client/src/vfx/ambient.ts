/**
 * Ambient world VFX: chimney smoke, campfire, waterfall, steam and sparks,
 * fireflies, falling petals and leaves, river glints, pollen, critters, the
 * astrolabe, the safe-line curtain, the refuge ring and the quest beacon.
 *
 * Everything is presentation only. Effects run within RANGE metres of the
 * player (or the camera target before joining), particle systems are pooled
 * per recipe and every emission is clamped by a global live-particle budget.
 */
import {
  Color3,
  PointLight,
  Vector3,
  type Scene,
  type TargetCamera,
} from "@babylonjs/core";
import type {
  AmbientContext,
  AmbientVfxModule,
  VfxHooks,
  VoxelWorld,
  WorldEmitter,
} from "../voxel/api";
import { VOXEL, WORLD_BOUNDS } from "../voxel/blocks";
import {
  Budget,
  LayerPool,
  rand,
  smoothstep,
  type AmbientEnv,
  type LayerKind,
  type SpriteLayer,
} from "./ambient-particles";
import {
  astroSparkles,
  beaconRipples,
  beaconSparkles,
  bolts,
  campfireSmoke,
  chimneySmoke,
  circleSparkles,
  drops,
  embers,
  fallMist,
  fallStreaks,
  fireflies,
  flames,
  glints,
  lanternMotes,
  leaves,
  lineSparkles,
  petals,
  pollen,
  rings,
  sparks,
  spot,
  steamPuffs,
  type LanternSet,
  type Spot,
  type WaterSet,
} from "./ambient-recipes";
import { Owned } from "./ambient-meshes";
import {
  Astrolabe,
  QuestBeacon,
  Veil,
  circlePath,
  linePath,
} from "./ambient-landmarks";
import { Critters } from "./ambient-critters";

/** Effects run within this distance (m) of the focus. */
export const AMBIENT_RANGE = 35;
/**
 * Rendering group for sprites that sit on or in front of water (glints, foam,
 * spray). Babylon draws particles before transparent meshes inside a group, so
 * these go in a later group whose depth buffer is kept (the constructor calls
 * setRenderingAutoClearDepthStencil for it).
 */
export const AMBIENT_OVER_WATER_GROUP = 1;

const SAFE_LINE = { x0: -20, x1: 20, z: 0, height: 2.5 };
const REFUGE = { x: 14, z: 45, r: 4 };
const CAMPFIRE_LIGHT_ON = 18;
const CAMPFIRE_LIGHT_OFF = 20;

type Feed<S> = {
  kind: LayerKind<S>;
  src: S;
  layer: SpriteLayer<S> | null;
  drive(layer: SpriteLayer<S>, dt: number): void;
};

/** One world feature: a position, a reach and the layers it feeds while near. */
class Effect {
  active = false;
  constructor(
    readonly x: number,
    readonly z: number,
    readonly reach: number,
    readonly feeds: Feed<never>[],
    readonly extra?: (dt: number, active: boolean, distance: number) => void,
  ) {}
}

function feed<S>(
  kind: LayerKind<S>,
  src: S,
  drive: (layer: SpriteLayer<S>, dt: number) => void,
): Feed<never> {
  return { kind, src, layer: null, drive } as unknown as Feed<never>;
}

/** Emitters of one kind that share a single pooled layer (one draw call). */
type Member = {
  s: Spot;
  reach: number;
  rate: () => number;
  carry: number;
  active: boolean;
};
class Group {
  layer: SpriteLayer<Spot> | null = null;
  readonly members: Member[] = [];
  constructor(readonly kind: LayerKind<Spot>) {}
}

export class AmbientVfx implements AmbientVfxModule {
  low = false;
  private env: AmbientEnv;
  private budget = new Budget();
  private pool: LayerPool;
  private owned = new Owned();
  private effects: Effect[] = [];
  private astrolabe: Astrolabe | null = null;
  private curtain: Veil;
  private refugeRing: Veil;
  private beacon: QuestBeacon;
  private critters: Critters;
  private campLight: PointLight | null = null;
  private centre = new Vector3();
  private waterCells: Float32Array;
  private water: WaterSet = { near: [] };
  private lanterns: LanternSet = { near: [] };
  private lanternList: [number, number, number][];
  private nearFrom = new Vector3(Infinity, 0, Infinity);
  private pollenSpot = spot(0, 0, 0);
  private lineSpot: Spot;
  private beaconSpot = spot(0, 0, 0, 0, 0, "#ffd45e");
  // Separate sources so droplets and rings each consume their own burst queue.
  private dropSpot = spot(0, 0, 0);
  private ringSpot = spot(0, 0, 0);
  private fishDrops = feed(drops, this.dropSpot, () => {});
  private fishRings = feed(rings, this.ringSpot, () => {});
  private globals: Effect[] = [];
  private groups = new Map<LayerKind<Spot>, Group>();
  private disposed = false;
  private day = 1;
  private nightRamp = 0;
  private scale = 1;

  constructor(
    private scene: Scene,
    private world: VoxelWorld,
    private hooks: VfxHooks,
  ) {
    const env: AmbientEnv = {
      time: 0,
      night: 0,
      windX: 0.3,
      windZ: 0.08,
      shadeR: 1,
      shadeG: 1,
      shadeB: 1,
      low: false,
      ground: (x, z) => {
        const h = world.surfaceHeight(x, z);
        const w = world.waterHeight(x, z);
        return w !== null && w > h ? w : h;
      },
    };
    this.env = env;
    this.pool = new LayerPool(scene, env);
    scene.setRenderingAutoClearDepthStencil(
      AMBIENT_OVER_WATER_GROUP,
      false,
      false,
      false,
    );

    this.waterCells = scanWater(world);
    this.lanternList = world.lights
      .filter((l) => l.kind === "lantern")
      .map((l) => [l.x, l.y, l.z] as [number, number, number]);
    this.lineSpot = spot(0, 0, SAFE_LINE.z, 0, 0.12, "#5ef2ff");

    for (const e of world.emitters) this.addEmitter(e);
    this.addGlobals();

    this.curtain = new Veil(
      scene,
      this.owned,
      "safe-curtain",
      linePath(SAFE_LINE.x0, SAFE_LINE.x1, SAFE_LINE.z),
      0,
      [
        [0, 1],
        [0.1, 0.85],
        [0.4, 0.7],
        [0.9, 0.5],
        [1.5, 0.28],
        [2, 0.1],
        [SAFE_LINE.height, 0],
      ],
      "#5ef2ff",
      "#1fc3dc",
      0.4,
      false,
    );
    const refugeY = world.surfaceHeight(REFUGE.x, REFUGE.z);
    this.refugeRing = new Veil(
      scene,
      this.owned,
      "refuge-shimmer",
      circlePath(REFUGE.x, REFUGE.z, REFUGE.r, 72),
      refugeY,
      [
        [0, 1],
        [0.08, 0.8],
        [0.3, 0.5],
        [0.7, 0.2],
        [1.3, 0],
      ],
      "#ffd45e",
      "#ffa514",
      0.44,
      true,
    );
    this.beacon = new QuestBeacon(scene, this.owned, (m) => hooks.glow(m));
    this.critters = new Critters(scene, world, (x, y, z, big) =>
      this.splash(x, y, z, big),
    );
  }

  // ───────────────────────────── setup ─────────────────────────────

  private addEmitter(e: WorldEmitter): void {
    const rx = e.rx ?? 0,
      rz = e.rz ?? 0;
    const reach = Math.max(rx, rz);
    const env = this.env,
      budget = this.budget;
    const s = spot(e.x, e.y, e.z, rx, rz, e.color ?? "#ffffff");
    const rate = (r: number) => r * this.scale;
    switch (e.kind) {
      case "chimney":
        this.join(chimneySmoke, s, 0, () => rate(2.8));
        return;
      case "campfire": {
        this.effects.push(
          new Effect(
            e.x,
            e.z,
            0,
            [
              feed(flames, s, (l, dt) => l.flow(rate(36), dt, budget)),
              feed(embers, s, (l, dt) =>
                l.flow(rate(7 + 5 * env.night), dt, budget),
              ),
              feed(campfireSmoke, s, (l, dt) => l.flow(rate(1.6), dt, budget)),
            ],
            (dt, _active, distance) => this.updateCampLight(e, distance),
          ),
        );
        return;
      }
      case "waterfall": {
        // Sheet top from the plateau channel next to the fall.
        const top = this.world.waterHeight(e.x - 1, e.z);
        s.w = top !== null && top > 1 ? top + 0.2 : 6;
        this.effects.push(
          new Effect(e.x, e.z, reach + 1, [
            feed(fallStreaks, s, (l, dt) => l.flow(rate(42), dt, budget)),
            feed(fallMist, s, (l, dt) => l.flow(rate(13), dt, budget)),
          ]),
        );
        return;
      }
      case "splash": {
        s.w = this.world.waterHeight(e.x, e.z) ?? e.y;
        this.effects.push(
          new Effect(e.x, e.z, reach, [
            feed(drops, s, (l, dt) => l.flow(rate(26), dt, budget)),
            feed(rings, s, (l, dt) => l.flow(rate(5), dt, budget)),
          ]),
        );
        return;
      }
      case "steam": {
        const phase = rand(0, 6);
        // Rhythmic hissing on top of a gentle simmer.
        this.join(steamPuffs, s, 0, () => {
          const hiss = Math.pow(
            Math.max(0, Math.sin(env.time * 1.6 + phase)),
            6,
          );
          return rate(2.5 + 11 * hiss);
        });
        return;
      }
      case "sparks": {
        let timer = rand(0.5, 2);
        let pendingBolts = 0;
        const burst = (l: SpriteLayer<Spot>, count: number) => {
          for (let i = 0; i < count; i++) s.queue.push(e.x, e.y, e.z);
          l.emit(count, budget);
        };
        const sparkFeed = feed(sparks, s, (l, dt) => {
          timer -= dt;
          if (timer > 0) return;
          timer = rand(1.2, 3.4);
          s.queue.clear();
          burst(l, Math.round(rate(12)));
          pendingBolts = Math.random() < 0.7 ? 2 : 1;
        });
        const boltFeed = feed(bolts, s, (l) => {
          if (!pendingBolts) return;
          burst(l, pendingBolts);
          pendingBolts = 0;
        });
        this.effects.push(new Effect(e.x, e.z, 0, [sparkFeed, boltFeed]));
        return;
      }
      case "fireflies": {
        // Steady population ≈ rate × mean life (8.5 s).
        const target = Math.min(16, Math.max(6, Math.round(rx * rz * 0.45)));
        this.join(fireflies, s, reach, () =>
          rate((target / 8.5) * this.nightRamp),
        );
        return;
      }
      case "petals":
        if (!e.color) Object.assign(s, colorOf("#ffaed1"));
        this.join(petals, s, reach, () => rate(2.6));
        return;
      case "leaves":
        if (!e.color) Object.assign(s, colorOf("#ff9f43"));
        this.join(leaves, s, reach, () => rate(1.7));
        return;
      case "astrolabe": {
        this.astrolabe = new Astrolabe(
          this.scene,
          this.owned,
          (m) => this.hooks.glow(m),
          e.x,
          e.y,
          e.z,
        );
        s.y = e.y;
        this.effects.push(
          new Effect(e.x, e.z, 2, [
            feed(astroSparkles, s, (l, dt) => {
              s.fade = 0.8 + 0.3 * env.night;
              l.flow(rate(7), dt, budget);
            }),
          ]),
        );
        return;
      }
      // Fish and butterflies are critters; see Critters.
      case "fish":
      case "butterflies":
        return;
    }
  }

  private join(
    kind: LayerKind<Spot>,
    s: Spot,
    reach: number,
    rate: () => number,
  ): void {
    let group = this.groups.get(kind);
    if (!group) this.groups.set(kind, (group = new Group(kind)));
    group.members.push({ s, reach, rate, carry: 0, active: false });
  }

  private runGroup(g: Group, c: Vector3, dt: number): void {
    let any = false;
    for (const m of g.members) {
      const distance = Math.hypot(m.s.x - c.x, m.s.z - c.z) - m.reach;
      m.active = distance < (m.active ? AMBIENT_RANGE + 4 : AMBIENT_RANGE);
      if (!m.active) {
        m.carry = 0;
        continue;
      }
      any = true;
      m.carry = Math.min(2, m.carry + Math.max(0, m.rate()) * dt);
      const n = Math.floor(m.carry);
      if (n <= 0) continue;
      m.carry -= n;
      g.layer ??= this.pool.acquire(g.kind, m.s);
      g.layer.emitFrom(m.s, n, this.budget);
    }
    if (!g.layer) return;
    if (any) g.layer.idle(true);
    else if (g.layer.idle()) {
      this.pool.release(g.layer as SpriteLayer<unknown>);
      g.layer = null;
    }
  }

  private addGlobals(): void {
    const budget = this.budget;
    const rate = (r: number) => r * this.scale;
    // Safe-line sparkles follow the visible stretch of the line.
    this.globals.push(
      new Effect(0, SAFE_LINE.z, 20, [
        feed(lineSparkles, this.lineSpot, (l, dt) => {
          const span = this.lineSpot.rx;
          if (span > 0.5) l.flow(rate(span * 2 * 0.75), dt, budget);
        }),
      ]),
    );
    const refuge = spot(
      REFUGE.x,
      this.world.surfaceHeight(REFUGE.x, REFUGE.z),
      REFUGE.z,
      REFUGE.r,
      REFUGE.r,
      "#ffd45e",
    );
    this.globals.push(
      new Effect(REFUGE.x, REFUGE.z, REFUGE.r, [
        feed(circleSparkles, refuge, (l, dt) => l.flow(rate(9), dt, budget)),
      ]),
    );
    // Centre-following layers: reach is effectively infinite (positions move).
    this.globals.push(
      new Effect(0, 0, Infinity, [
        feed(glints, this.water, (l, dt) => {
          if (this.water.near.length)
            l.flow(rate(20 * (0.35 + 0.65 * this.day)), dt, budget);
        }),
        feed(pollen, this.pollenSpot, (l, dt) => {
          this.pollenSpot.fade = this.day;
          if (this.day > 0.02) l.flow(rate(5 * this.day), dt, budget);
        }),
        feed(lanternMotes, this.lanterns, (l, dt) => {
          const want =
            Math.min(36, (this.lanterns.near.length / 3) * 3) *
            this.nightRamp *
            this.scale;
          l.fill(want, 6, dt, budget);
        }),
        feed(beaconSparkles, this.beaconSpot, (l, dt) => {
          if (this.beacon.fade > 0.02) l.flow(rate(14), dt, budget);
        }),
        feed(beaconRipples, this.beaconSpot, (l, dt) => {
          if (this.beacon.fade > 0.02) l.flow(0.75, dt, budget);
        }),
        this.fishDrops,
        this.fishRings,
      ]),
    );
  }

  /** Fish splash: droplets and foam rings at a water point. */
  private splash(x: number, y: number, z: number, big: number): void {
    const dropFeed = this.fishDrops as unknown as Feed<Spot>,
      ringFeed = this.fishRings as unknown as Feed<Spot>;
    const dropLayer = (dropFeed.layer ??= this.pool.acquire(
      drops,
      this.dropSpot,
    ));
    const ringLayer = (ringFeed.layer ??= this.pool.acquire(
      rings,
      this.ringSpot,
    ));
    const nDrops = Math.round(7 * big * this.scale);
    const nRings = big > 1.2 ? 2 : 1;
    for (let i = 0; i < nDrops; i++) this.dropSpot.queue.push(x, y, z, 0);
    for (let i = 0; i < nRings; i++)
      this.ringSpot.queue.push(x, y, z, i ? 1.6 : 1);
    dropLayer.emit(nDrops, this.budget);
    ringLayer.emit(nRings, this.budget);
  }

  private updateCampLight(e: WorldEmitter, distance: number): void {
    const want = this.campLight?.isEnabled()
      ? distance < CAMPFIRE_LIGHT_OFF
      : distance < CAMPFIRE_LIGHT_ON;
    if (!want) {
      this.campLight?.setEnabled(false);
      return;
    }
    if (!this.campLight) {
      const light = new PointLight(
        "ambient-campfire",
        new Vector3(e.x, e.y + 0.6, e.z),
        this.scene,
      );
      light.diffuse = new Color3(1, 0.62, 0.28);
      light.specular = new Color3(0.2, 0.12, 0.05);
      light.range = 9;
      this.campLight = light;
    }
    this.campLight.setEnabled(true);
    const t = this.env.time;
    const flicker =
      0.82 +
      0.1 * Math.sin(t * 13.7) +
      0.06 * Math.sin(t * 23.1 + 1.3) +
      0.04 * Math.sin(t * 41);
    this.campLight.intensity = (0.55 + 1.1 * this.env.night) * flicker;
  }

  // ───────────────────────────── frame ─────────────────────────────

  update(dt: number, context: AmbientContext): void {
    if (this.disposed) return;
    dt = Math.min(dt, 0.1);
    const env = this.env;
    env.time = context.time;
    env.night = context.night;
    env.low = this.low;
    this.day = 1 - smoothstep(0.35, 0.7, context.night);
    this.nightRamp = smoothstep(0.35, 0.75, context.night);
    this.scale = this.low ? 0.5 : 1;
    this.budget.max = this.low ? 600 : 1500;
    // Moonlit tint for unlit sprites.
    const n = context.night;
    env.shadeR = 1 - 0.6 * n;
    env.shadeG = 1 - 0.55 * n;
    env.shadeB = 1 - 0.4 * n;
    env.windX = 0.3 + 0.15 * Math.sin(context.time * 0.07);
    env.windZ = 0.1 * Math.cos(context.time * 0.05);

    const c = this.resolveCentre(context);
    this.refreshNear(c);

    this.pool.sync();
    this.budget.used = this.pool.stats().particles + this.queuedTotal();

    for (const e of this.effects) this.runEffect(e, c, dt);
    for (const g of this.groups.values()) this.runGroup(g, c, dt);
    // Line sparkles: emit only on the stretch of the line within range.
    const dz = Math.abs(c.z - SAFE_LINE.z);
    const half =
      dz < AMBIENT_RANGE ? Math.sqrt(AMBIENT_RANGE ** 2 - dz * dz) : 0;
    const x0 = Math.max(SAFE_LINE.x0, c.x - half),
      x1 = Math.min(SAFE_LINE.x1, c.x + half);
    this.lineSpot.x = (x0 + x1) / 2;
    this.lineSpot.rx = Math.max(0, (x1 - x0) / 2);
    this.pollenSpot.x = c.x;
    this.pollenSpot.z = c.z;
    this.beaconSpot.x = this.beacon.position.x;
    this.beaconSpot.y = this.beacon.position.y;
    this.beaconSpot.z = this.beacon.position.z;
    this.beaconSpot.fade = this.beacon.fade;
    for (const e of this.globals) this.runEffect(e, c, dt);

    const eye = context.camera;
    const nearAstro =
      this.astrolabe !== null &&
      Math.hypot(this.astrolabe.x - c.x, this.astrolabe.z - c.z) <
        AMBIENT_RANGE + 25;
    if (this.astrolabe && nearAstro)
      this.astrolabe.update(dt, context.time, eye, n);
    this.curtain.update(
      dt,
      context.time,
      n,
      Math.abs(c.z - SAFE_LINE.z) < AMBIENT_RANGE + 10,
    );
    this.refugeRing.update(
      dt,
      context.time,
      n,
      Math.hypot(c.x - REFUGE.x, c.z - REFUGE.z) < AMBIENT_RANGE + 10,
    );
    this.beacon.update(
      dt,
      context.time,
      context.objective,
      (x, z) => this.hooks.groundHeight(x, z),
      context.focus,
      n,
    );
    this.critters.update(
      dt,
      context.time,
      c,
      AMBIENT_RANGE,
      this.day,
      n,
      !this.low,
    );
  }

  private queuedTotal(): number {
    let n = 0;
    for (const layer of this.pool.all)
      n += layer.live - layer.ps.getActiveCount();
    return n;
  }

  private runEffect(e: Effect, c: Vector3, dt: number): void {
    const distance = Math.hypot(e.x - c.x, e.z - c.z) - e.reach;
    const limit = e.active ? AMBIENT_RANGE + 4 : AMBIENT_RANGE;
    e.active = !Number.isFinite(e.reach) || distance < limit;
    for (const f of e.feeds) {
      if (e.active) {
        f.layer ??= this.pool.acquire(f.kind, f.src);
        f.drive(f.layer, dt);
        // Stop animating systems with nothing to show (e.g. fireflies by day).
        f.layer.idle(true);
      } else if (f.layer && f.layer.idle()) {
        this.pool.release(f.layer as SpriteLayer<unknown>);
        f.layer = null;
      }
    }
    e.extra?.(dt, e.active, distance);
  }

  private resolveCentre(context: AmbientContext): Vector3 {
    if (context.focus) this.centre.copyFrom(context.focus);
    else {
      const cam = this.scene.activeCamera as TargetCamera | null;
      const target = cam && "getTarget" in cam ? cam.getTarget() : null;
      this.centre.copyFrom(target ?? context.camera);
    }
    return this.centre;
  }

  /** Nearby water cells and lanterns, refreshed when the centre moves 2 m. */
  private refreshNear(c: Vector3): void {
    if (Math.hypot(c.x - this.nearFrom.x, c.z - this.nearFrom.z) < 2) return;
    this.nearFrom.copyFrom(c);
    const water: number[] = [];
    const cells = this.waterCells;
    const r2 = 18 * 18;
    for (let i = 0; i < cells.length; i += 3) {
      const dx = cells[i] - c.x,
        dz = cells[i + 2] - c.z;
      if (dx * dx + dz * dz < r2)
        water.push(cells[i], cells[i + 1], cells[i + 2]);
    }
    this.water.near = water;
    const lanterns: number[] = [];
    for (const [x, y, z] of this.lanternList)
      if (Math.hypot(x - c.x, z - c.z) < 24) lanterns.push(x, y, z);
    this.lanterns.near = lanterns;
  }

  metrics(): { systems: number; particles: number; meshes: number } {
    const { systems, particles } = this.pool.stats();
    return {
      systems,
      particles,
      meshes: this.owned.activeMeshes() + this.critters.meshes(),
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pool.dispose();
    this.critters.dispose();
    this.owned.dispose();
    this.campLight?.dispose();
    this.campLight = null;
    this.scene.setRenderingAutoClearDepthStencil(
      AMBIENT_OVER_WATER_GROUP,
      true,
    );
    this.effects.length = 0;
    this.globals.length = 0;
    this.groups.clear();
  }
}

function colorOf(hex: string): { r: number; g: number; b: number } {
  const s = spot(0, 0, 0, 0, 0, hex);
  return { r: s.r, g: s.g, b: s.b };
}

/** Every open-water surface cell (x, height, z) on the 0.5 m grid. */
function scanWater(world: VoxelWorld): Float32Array {
  const out: number[] = [];
  for (let z = WORLD_BOUNDS.minZ + VOXEL / 2; z < WORLD_BOUNDS.maxZ; z += VOXEL)
    for (
      let x = WORLD_BOUNDS.minX + VOXEL / 2;
      x < WORLD_BOUNDS.maxX;
      x += VOXEL
    ) {
      const h = world.waterHeight(x, z);
      if (h !== null) out.push(x, h, z);
    }
  return new Float32Array(out);
}
