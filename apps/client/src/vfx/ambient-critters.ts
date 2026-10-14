/**
 * Little voxel critters: leaping fish, butterflies and passing birds. Built on
 * first use; skipped entirely on Low quality.
 */
import { Matrix, Vector3, type Mesh, type Scene } from "@babylonjs/core";
import type { VoxelWorld, WorldEmitter } from "../voxel/api";
import {
  Instances,
  Owned,
  birdBody,
  birdWing,
  butterflyWing,
  fishModel,
  toyMaterial,
} from "./ambient-meshes";
import { hexRgb, rand, smoothstep } from "./ambient-particles";

const TAU = Math.PI * 2;
const BUTTERFLY_COLORS = [
  "#ffaed1",
  "#c9a7ff",
  "#8fd3ff",
  "#fff07a",
  "#9ff0c0",
  "#ffc48a",
].map((h) => hexRgb(h));
const MAX_FISH = 2;

type Jump = {
  mesh: Mesh;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  water: number;
  apex: number;
  duration: number;
  t: number;
  heading: number;
  flip: boolean;
};
type FishSpot = { e: WorldEmitter; next: number };
type Butterfly = {
  x: number;
  y: number;
  z: number;
  heading: number;
  speed: number;
  phase: number;
  rgb: [number, number, number];
  presence: number;
};
type Meadow = { e: WorldEmitter; flock: Butterfly[] };
type Flock = {
  x: number;
  z: number;
  dx: number;
  dz: number;
  y: number;
  speed: number;
  t: number;
  length: number;
  count: number;
};

export type SplashFn = (x: number, y: number, z: number, big: number) => void;

export class Critters {
  private owned = new Owned();
  private built = false;
  private fishMeshes: Mesh[] = [];
  private jumps: Jump[] = [];
  private fishSpots: FishSpot[];
  private meadows: Meadow[];
  private wings!: Instances;
  private birdBodies!: Instances;
  private birdWings!: Instances;
  private flock: Flock | null = null;
  private nextFlock = rand(6, 14);
  private m1 = new Matrix();
  private m2 = new Matrix();
  private m3 = new Matrix();
  private m4 = new Matrix();
  private flip = Matrix.RotationY(Math.PI);

  constructor(
    private scene: Scene,
    private world: VoxelWorld,
    private splash: SplashFn,
  ) {
    this.fishSpots = world.emitters
      .filter((e) => e.kind === "fish")
      .map((e) => ({ e, next: rand(1, 6) }));
    this.meadows = world.emitters
      .filter((e) => e.kind === "butterflies")
      .map((e) => ({ e, flock: [] }));
  }

  private build(): void {
    this.built = true;
    const scene = this.scene,
      o = this.owned;
    const fishMat = o.material(toyMaterial(scene, "ambient-fish", 0.12));
    for (const variant of ["koi", "blue"] as const) {
      const base = o.mesh(fishModel(scene, `ambient-fish-${variant}`, variant));
      base.material = fishMat;
      const twin = o.mesh(base.clone(`ambient-fish-${variant}-2`));
      for (const m of [base, twin]) {
        m.isPickable = false;
        m.setEnabled(false);
        this.fishMeshes.push(m);
      }
    }
    const wingMat = o.material(toyMaterial(scene, "ambient-butterfly", 0.38));
    const wing = o.mesh(butterflyWing(scene, "ambient-butterfly"));
    wing.material = wingMat;
    wing.isPickable = false;
    this.wings = new Instances(wing, 96, true);
    const birdMat = o.material(toyMaterial(scene, "ambient-bird", 0.15));
    const body = o.mesh(birdBody(scene, "ambient-bird-body"));
    const bw = o.mesh(birdWing(scene, "ambient-bird-wing"));
    for (const m of [body, bw]) {
      m.material = birdMat;
      m.isPickable = false;
    }
    this.birdBodies = new Instances(body, 5, false);
    this.birdWings = new Instances(bw, 10, false);
  }

  /** `day` 0..1 (butterflies, birds); `active` false on Low quality. */
  update(
    dt: number,
    time: number,
    centre: Vector3,
    range: number,
    day: number,
    night: number,
    active: boolean,
  ): void {
    if (!active) {
      if (this.built) this.hideAll();
      return;
    }
    if (!this.built) this.build();
    this.updateFish(dt, centre, range, night);
    this.updateButterflies(dt, time, centre, range, day);
    this.updateBirds(dt, time, centre, day);
  }

  private hideAll(): void {
    for (const j of this.jumps) j.mesh.setEnabled(false);
    this.jumps.length = 0;
    for (const m of this.meadows) m.flock.length = 0;
    this.flock = null;
    for (const inst of [this.wings, this.birdBodies, this.birdWings]) {
      inst.begin();
      inst.end();
    }
  }

  // ───────────────────────────── fish ─────────────────────────────

  private updateFish(
    dt: number,
    centre: Vector3,
    range: number,
    night: number,
  ): void {
    for (const s of this.fishSpots) {
      const d = Math.hypot(s.e.x - centre.x, s.e.z - centre.z);
      if (d > range) continue;
      s.next -= dt;
      if (s.next > 0) continue;
      s.next = rand(3.5, 9) * (1 + night);
      if (this.jumps.length < MAX_FISH) this.startJump(s.e);
    }
    for (let i = this.jumps.length - 1; i >= 0; i--) {
      const j = this.jumps[i];
      j.t += dt;
      const u = j.t / j.duration;
      if (u >= 1) {
        this.splash(j.x1, j.water, j.z1, 1.6);
        j.mesh.setEnabled(false);
        this.jumps.splice(i, 1);
        continue;
      }
      const L = Math.hypot(j.x1 - j.x0, j.z1 - j.z0);
      const lift = j.apex + 0.2;
      const y = j.water - 0.2 + lift * 4 * u * (1 - u);
      const slope = (lift * 4 * (1 - 2 * u)) / L;
      const m = j.mesh;
      m.position.set(j.x0 + (j.x1 - j.x0) * u, y, j.z0 + (j.z1 - j.z0) * u);
      m.rotation.y = j.heading + Math.sin(j.t * 28) * 0.22 * (1 - u);
      m.rotation.x = -Math.atan(slope);
      m.rotation.z = j.flip ? smoothstep(0.25, 0.75, u) * TAU : 0;
      const squash = 1 + 0.12 * Math.sin(j.t * 28);
      m.scaling.set(1, squash, 2 - squash);
    }
  }

  private startJump(e: WorldEmitter): void {
    const used = new Set(this.jumps.map((j) => j.mesh));
    const pick = Math.random() < 0.55 ? 0 : 2;
    const mesh =
      [
        this.fishMeshes[pick],
        this.fishMeshes[pick + 1],
        ...this.fishMeshes,
      ].find((m) => !used.has(m)) ?? null;
    if (!mesh) return;
    const rx = e.rx ?? 2,
      rz = e.rz ?? 1.5;
    for (let attempt = 0; attempt < 6; attempt++) {
      const x0 = e.x + rand(-rx, rx) * 0.7,
        z0 = e.z + rand(-rz, rz) * 0.7;
      const heading = rand(0, TAU),
        len = rand(1.3, 2.1);
      const x1 = x0 + Math.sin(heading) * len,
        z1 = z0 + Math.cos(heading) * len;
      const w0 = this.world.waterHeight(x0, z0),
        w1 = this.world.waterHeight(x1, z1);
      if (w0 === null || w1 === null) continue;
      const water = (w0 + w1) / 2;
      this.jumps.push({
        mesh,
        x0,
        z0,
        x1,
        z1,
        water,
        apex: rand(0.75, 1.2),
        duration: 0.7 + len * 0.12,
        t: 0,
        heading,
        flip: Math.random() < 0.4,
      });
      mesh.setEnabled(true);
      mesh.position.set(x0, water - 0.3, z0);
      this.splash(x0, water, z0, 1);
      return;
    }
  }

  // ───────────────────────────── butterflies ─────────────────────────────

  private updateButterflies(
    dt: number,
    time: number,
    centre: Vector3,
    range: number,
    day: number,
  ): void {
    const inst = this.wings;
    inst.begin();
    for (const meadow of this.meadows) {
      const e = meadow.e;
      const near = Math.hypot(e.x - centre.x, e.z - centre.z) < range;
      if (!near) {
        meadow.flock.length = 0;
        continue;
      }
      const r = Math.max(e.rx ?? 3, e.rz ?? 3);
      if (!meadow.flock.length && day > 0.05)
        for (let i = 0; i < 4; i++) {
          const a = rand(0, TAU),
            d = Math.sqrt(Math.random()) * r;
          meadow.flock.push({
            x: e.x + Math.cos(a) * d,
            y: 0.8,
            z: e.z + Math.sin(a) * d,
            heading: rand(0, TAU),
            speed: rand(0.7, 1.1),
            phase: rand(0, TAU),
            rgb: BUTTERFLY_COLORS[
              Math.floor(Math.random() * BUTTERFLY_COLORS.length)
            ],
            presence: 0,
          });
        }
      for (const b of meadow.flock) {
        const want = day;
        b.presence += Math.max(
          -dt * 0.6,
          Math.min(dt * 0.6, want - b.presence),
        );
        if (b.presence <= 0.01) continue;
        // Lazy curving flight that keeps returning to the flowers.
        const dx = e.x - b.x,
          dz = e.z - b.z;
        const dist = Math.hypot(dx, dz);
        let turn =
          Math.sin(time * 0.8 + b.phase) * 1.3 +
          Math.sin(time * 2.3 + b.phase * 3) * 0.6;
        if (dist > r * 0.8) {
          const want = Math.atan2(dx, dz);
          let diff = want - b.heading;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          turn += diff * 2.2 * Math.min(1, (dist - r * 0.8) / r + 0.3);
        }
        b.heading += turn * dt;
        b.x += Math.sin(b.heading) * b.speed * dt;
        b.z += Math.cos(b.heading) * b.speed * dt;
        const ground = this.world.surfaceHeight(b.x, b.z);
        b.y =
          Math.max(ground, 0) +
          0.75 +
          0.4 * Math.sin(time * 0.9 + b.phase) +
          0.1 * Math.sin(time * 7 + b.phase);
        const flap =
          0.2 + 1.05 * (0.5 + 0.5 * Math.sin(time * 16 + b.phase * 5));
        const s = b.presence;
        // Body frame: yaw, a slight nose-up pitch, then position.
        Matrix.ScalingToRef(s, s, s, this.m1);
        Matrix.RotationYawPitchRollToRef(b.heading, -0.25, 0, this.m2);
        this.m1.multiplyToRef(this.m2, this.m3);
        this.m3.setTranslationFromFloats(b.x, b.y, b.z);
        const [cr, cg, cb] = b.rgb;
        // Right wing: lift around the body axis.
        Matrix.RotationZToRef(flap, this.m1);
        this.m1.multiplyToRef(this.m3, this.m4);
        inst.push(this.m4, cr, cg, cb);
        // Left wing: the same wing turned around.
        this.m1.multiplyToRef(this.flip, this.m2);
        this.m2.multiplyToRef(this.m3, this.m4);
        inst.push(this.m4, cr, cg, cb);
      }
    }
    inst.end();
  }

  // ───────────────────────────── birds ─────────────────────────────

  private updateBirds(
    dt: number,
    time: number,
    centre: Vector3,
    day: number,
  ): void {
    const bodies = this.birdBodies,
      wings = this.birdWings;
    bodies.begin();
    wings.begin();
    if (!this.flock) {
      this.nextFlock -= dt;
      if (this.nextFlock <= 0 && day > 0.6) {
        this.nextFlock = rand(16, 30);
        const a =
          (Math.random() < 0.5 ? -1 : 1) * Math.PI * 0.5 + rand(-0.5, 0.5);
        const dx = Math.sin(a),
          dz = Math.cos(a);
        const length = 70;
        // South of the focus (toward the camera) so the flock crosses the view.
        const offset = rand(-10, -3);
        const cx = centre.x + -dz * offset * 0.3,
          cz = centre.z + offset;
        this.flock = {
          x: cx - (dx * length) / 2,
          z: cz - (dz * length) / 2,
          dx,
          dz,
          y: rand(7, 8.5),
          speed: rand(5.5, 7),
          t: 0,
          length,
          count: 2 + Math.floor(Math.random() * 3),
        };
      }
    }
    const f = this.flock;
    if (f) {
      f.t += dt;
      const travelled = f.t * f.speed;
      if (travelled > f.length) this.flock = null;
      else {
        const heading = Math.atan2(f.dx, f.dz);
        for (let i = 0; i < f.count; i++) {
          // V formation: leader in front, the rest trailing to either side.
          const back = Math.ceil(i / 2) * 1.1,
            side = i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.9;
          const along = travelled - back;
          const x = f.x + f.dx * along + -f.dz * side;
          const z = f.z + f.dz * along + f.dx * side;
          const y = f.y + Math.sin(time * 2 + i * 1.7) * 0.18;
          const glide = Math.sin(time * 0.9 + i) > 0.55;
          const flap = glide
            ? 0.12
            : 0.15 + 0.75 * Math.sin(time * 11 + i * 1.3);
          Matrix.RotationYawPitchRollToRef(
            heading,
            0,
            Math.sin(time * 1.3 + i) * 0.12,
            this.m3,
          );
          this.m3.setTranslationFromFloats(x, y, z);
          bodies.push(this.m3);
          for (const sideSign of [1, -1]) {
            Matrix.RotationZToRef(flap, this.m1);
            if (sideSign < 0) {
              this.m1.multiplyToRef(this.flip, this.m2);
              this.m2.setTranslationFromFloats(-0.1, 0.06, 0);
            } else {
              this.m2.copyFrom(this.m1);
              this.m2.setTranslationFromFloats(0.1, 0.06, 0);
            }
            this.m2.multiplyToRef(this.m3, this.m4);
            wings.push(this.m4);
          }
        }
      }
    }
    bodies.end();
    wings.end();
  }

  meshes(): number {
    return this.owned.activeMeshes();
  }

  dispose(): void {
    this.jumps.length = 0;
    this.owned.dispose();
  }
}
