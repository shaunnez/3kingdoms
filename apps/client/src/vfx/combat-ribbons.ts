/**
 * Dynamic strip meshes: sword trails that follow a weapon socket and
 * flickering lightning arcs. Each keeps its own typed arrays and updates
 * them in place every frame (no allocation).
 */
import {
  Mesh,
  Vector3,
  VertexBuffer,
  VertexData,
  type AbstractMesh,
  type Material,
  type Scene,
} from "@babylonjs/core";

class Strip {
  readonly mesh: Mesh;
  readonly positions: Float32Array;
  readonly colors: Float32Array;
  constructor(
    scene: Scene,
    name: string,
    readonly points: number,
  ) {
    const verts = points * 2;
    this.positions = new Float32Array(verts * 3);
    this.colors = new Float32Array(verts * 4);
    const normals = new Float32Array(verts * 3);
    for (let i = 0; i < verts; i++) normals[i * 3 + 1] = 1;
    const indices: number[] = [];
    for (let i = 0; i < points - 1; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const d = new VertexData();
    d.positions = this.positions;
    d.normals = normals;
    d.colors = this.colors;
    d.indices = indices;
    this.mesh = new Mesh(name, scene);
    d.applyToMesh(this.mesh, true);
    this.mesh.hasVertexAlpha = true;
    this.mesh.isPickable = false;
    this.mesh.alwaysSelectAsActiveMesh = true;
    this.mesh.setEnabled(false);
  }
  commit(): void {
    this.mesh.updateVerticesData(VertexBuffer.PositionKind, this.positions);
    this.mesh.updateVerticesData(VertexBuffer.ColorKind, this.colors);
  }
  dispose(): void {
    this.mesh.dispose(false, false);
  }
}

const TRAIL = 18;

/** Sword trail: newest sample first, fading by age and by blade speed. */
export class Trail {
  private strip: Strip;
  private tips = new Float32Array(TRAIL * 3);
  private bases = new Float32Array(TRAIL * 3);
  private ages = new Float32Array(TRAIL);
  private speeds = new Float32Array(TRAIL);
  private head = 0;
  private count = 0;
  owner = "";
  /** Presentation time after which no new samples are taken. */
  until = 0;
  constructor(scene: Scene, name: string) {
    this.strip = new Strip(scene, name, TRAIL);
  }
  get mesh(): Mesh {
    return this.strip.mesh;
  }
  start(owner: string, material: Material, until: number): void {
    if (this.owner !== owner) this.count = 0;
    this.owner = owner;
    this.until = until;
    this.strip.mesh.material = material;
    this.strip.mesh.setEnabled(true);
  }
  /** Add a blade sample (tip and base in world space). */
  push(tip: Vector3, base: Vector3, dt: number): void {
    const prev = this.head;
    this.head = (this.head + 1) % TRAIL;
    const o = this.head * 3;
    this.tips[o] = tip.x;
    this.tips[o + 1] = tip.y;
    this.tips[o + 2] = tip.z;
    this.bases[o] = base.x;
    this.bases[o + 1] = base.y;
    this.bases[o + 2] = base.z;
    this.ages[this.head] = 0;
    if (this.count > 0 && dt > 0) {
      const p = prev * 3;
      const d = Math.hypot(
        tip.x - this.tips[p],
        tip.y - this.tips[p + 1],
        tip.z - this.tips[p + 2],
      );
      this.speeds[this.head] = d / dt;
    } else this.speeds[this.head] = 0;
    this.count = Math.min(TRAIL, this.count + 1);
  }
  /** Age samples and rebuild the strip. Returns false once fully faded. */
  update(dt: number, life: number, minSpeed: number): boolean {
    if (!this.count) return false;
    const P = this.strip.positions,
      C = this.strip.colors;
    let visible = false;
    for (let j = 0; j < TRAIL; j++) {
      const i = (this.head - j + TRAIL) % TRAIL;
      const valid = j < this.count;
      const src = valid ? i : this.head;
      if (valid) this.ages[i] += dt;
      const age = valid ? this.ages[i] : life;
      const fresh = Math.max(0, 1 - age / life);
      const fast = Math.min(
        1,
        Math.max(0, (this.speeds[src] - minSpeed) / minSpeed),
      );
      const a = valid ? fresh * fresh * fast : 0;
      if (a > 0.01) visible = true;
      const o = src * 3,
        v = j * 2;
      P[v * 3] = this.tips[o];
      P[v * 3 + 1] = this.tips[o + 1];
      P[v * 3 + 2] = this.tips[o + 2];
      P[v * 3 + 3] = this.bases[o];
      P[v * 3 + 4] = this.bases[o + 1];
      P[v * 3 + 5] = this.bases[o + 2];
      // Hot white edge at the tip, soft towards the hilt.
      C[v * 4] = C[v * 4 + 1] = C[v * 4 + 2] = 1.7;
      C[v * 4 + 3] = a;
      C[v * 4 + 4] = C[v * 4 + 5] = C[v * 4 + 6] = 0.9;
      C[v * 4 + 7] = a * 0.12;
    }
    this.strip.commit();
    return visible;
  }
  stop(): void {
    this.count = 0;
    this.owner = "";
    this.strip.mesh.setEnabled(false);
  }
  dispose(): void {
    this.strip.dispose();
  }
}

const ARC = 10;
const tmpA = new Vector3(),
  tmpB = new Vector3(),
  tmpC = new Vector3();

/** Jagged, camera-facing lightning between two points that re-rolls as it flickers. */
export class Arc {
  private strip: Strip;
  private offsets = new Float32Array(ARC * 3);
  private from = new Vector3();
  private to = new Vector3();
  private t = 0;
  private life = 0;
  private reroll = 0;
  private jitter = 0.2;
  private width = 0.05;
  active = false;
  constructor(scene: Scene, name: string, glow: (m: AbstractMesh) => void) {
    this.strip = new Strip(scene, name, ARC);
    glow(this.strip.mesh);
  }
  start(
    from: Vector3,
    to: Vector3,
    material: Material,
    life: number,
    jitter: number,
    width: number,
  ): void {
    this.from.copyFrom(from);
    this.to.copyFrom(to);
    this.t = 0;
    this.life = life;
    this.jitter = jitter;
    this.width = width;
    this.reroll = 0;
    this.active = true;
    this.strip.mesh.material = material;
    this.strip.mesh.setEnabled(true);
  }
  update(dt: number, eye: Vector3): boolean {
    if (!this.active) return false;
    this.t += dt;
    if (this.t >= this.life) {
      this.stop();
      return false;
    }
    this.reroll -= dt;
    if (this.reroll <= 0) {
      this.reroll = 0.045;
      for (let i = 0; i < ARC * 3; i++)
        this.offsets[i] = (Math.random() * 2 - 1) * this.jitter;
    }
    const P = this.strip.positions,
      C = this.strip.colors;
    const fade = 1 - this.t / this.life;
    const flicker = 0.55 + 0.45 * Math.random();
    const dir = tmpA.copyFrom(this.to).subtractInPlace(this.from);
    for (let i = 0; i < ARC; i++) {
      const k = i / (ARC - 1);
      const env = Math.sin(Math.PI * k);
      const px = this.from.x + dir.x * k + this.offsets[i * 3] * env,
        py = this.from.y + dir.y * k + this.offsets[i * 3 + 1] * env,
        pz = this.from.z + dir.z * k + this.offsets[i * 3 + 2] * env;
      // Width perpendicular to the bolt and the view direction.
      tmpB.set(eye.x - px, eye.y - py, eye.z - pz);
      Vector3.CrossToRef(dir, tmpB, tmpC);
      const l = tmpC.length() || 1;
      const w = (this.width * (0.6 + 0.4 * env)) / l;
      const v = i * 2;
      P[v * 3] = px + tmpC.x * w;
      P[v * 3 + 1] = py + tmpC.y * w;
      P[v * 3 + 2] = pz + tmpC.z * w;
      P[v * 3 + 3] = px - tmpC.x * w;
      P[v * 3 + 4] = py - tmpC.y * w;
      P[v * 3 + 5] = pz - tmpC.z * w;
      const a = fade * flicker;
      C[v * 4] = C[v * 4 + 1] = C[v * 4 + 2] = 1.8;
      C[v * 4 + 4] = C[v * 4 + 5] = C[v * 4 + 6] = 1.8;
      C[v * 4 + 3] = C[v * 4 + 7] = a;
    }
    this.strip.commit();
    return true;
  }
  stop(): void {
    this.active = false;
    this.strip.mesh.setEnabled(false);
  }
  dispose(): void {
    this.strip.dispose();
  }
}
