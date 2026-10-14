/**
 * Voxel debris: small lit cubes drawn as thin instances of one box (a single
 * draw call), with per-cube colour, gravity, tumbling spin, a bounce on the
 * ground and a shrink-out. Live cubes stay packed at the front of the
 * buffers; when none are alive the mesh is disabled and nothing is touched.
 */
import {
  Color3,
  MeshBuilder,
  StandardMaterial,
  type Mesh,
  type Scene,
} from "@babylonjs/core";

export class DebrisSpec {
  x = 0;
  y = 0;
  z = 0;
  /** Spawn jitter radius. */
  r = 0.15;
  speed0 = 1.5;
  speed1 = 3.5;
  up0 = 2;
  up1 = 4.5;
  /** Optional push direction (horizontal) and how strongly it biases spread. */
  dirX = 0;
  dirZ = 0;
  bias = 0;
  size0 = 0.08;
  size1 = 0.16;
  life0 = 0.9;
  life1 = 1.6;
  gravity = 14;
  /** Ground height under the burst (bounce plane). */
  ground = 0;
  reset(): this {
    this.r = 0.15;
    this.speed0 = 1.5;
    this.speed1 = 3.5;
    this.up0 = 2;
    this.up1 = 4.5;
    this.dirX = this.dirZ = this.bias = 0;
    this.size0 = 0.08;
    this.size1 = 0.16;
    this.life0 = 0.9;
    this.life1 = 1.6;
    this.gravity = 14;
    this.ground = 0;
    return this;
  }
}

// Per cube: px py pz vx vy vz ax ay az angle spin life size floor gravity
const S = 15;

export class Debris {
  readonly spec = new DebrisSpec();
  /** Usable cubes (≤ capacity); Low quality halves it. */
  limit: number;
  private mesh: Mesh;
  private material: StandardMaterial;
  private state: Float32Array;
  private matrices: Float32Array;
  private colors: Float32Array;
  private live = 0;

  constructor(
    scene: Scene,
    readonly capacity = 400,
  ) {
    this.limit = capacity;
    this.mesh = MeshBuilder.CreateBox("combat-debris", { size: 1 }, scene);
    this.mesh.isPickable = false;
    this.mesh.alwaysSelectAsActiveMesh = true;
    this.mesh.doNotSyncBoundingInfo = true;
    this.material = new StandardMaterial("combat-debris", scene);
    this.material.specularColor = Color3.Black();
    this.material.emissiveColor = new Color3(0.12, 0.12, 0.14);
    // Keep out of glow layers (see Materials.glowing).
    (
      this.material as unknown as { emissiveIntensity: number }
    ).emissiveIntensity = 0;
    this.mesh.material = this.material;
    this.state = new Float32Array(capacity * S);
    this.matrices = new Float32Array(capacity * 16);
    this.colors = new Float32Array(capacity * 4);
    this.mesh.thinInstanceSetBuffer("matrix", this.matrices, 16, false);
    this.mesh.thinInstanceSetBuffer("color", this.colors, 4, false);
    this.mesh.thinInstanceCount = 0;
    this.mesh.setEnabled(false);
  }

  /** Spawn `count` cubes from the current spec, colours picked from `palette`. */
  burst(count: number, palette: readonly Color3[]): void {
    const s = this.spec;
    const st = this.state;
    for (let k = 0; k < count; k++) {
      // Full: recycle a random live cube rather than growing.
      const i =
        this.live < this.limit ? this.live++ : (Math.random() * this.live) | 0;
      const o = i * S;
      const a = Math.random() * Math.PI * 2;
      let hx = Math.cos(a),
        hz = Math.sin(a);
      if (s.bias > 0) {
        hx = hx * (1 - s.bias) + s.dirX * s.bias;
        hz = hz * (1 - s.bias) + s.dirZ * s.bias;
        const l = Math.hypot(hx, hz) || 1;
        hx /= l;
        hz /= l;
      }
      const speed = s.speed0 + Math.random() * (s.speed1 - s.speed0);
      st[o] = s.x + (Math.random() * 2 - 1) * s.r;
      st[o + 1] = s.y + (Math.random() * 2 - 1) * s.r * 0.6;
      st[o + 2] = s.z + (Math.random() * 2 - 1) * s.r;
      st[o + 3] = hx * speed;
      st[o + 4] = s.up0 + Math.random() * (s.up1 - s.up0);
      st[o + 5] = hz * speed;
      // Random tumble axis.
      const u = Math.random() * 2 - 1,
        t = Math.random() * Math.PI * 2,
        r = Math.sqrt(1 - u * u);
      st[o + 6] = Math.cos(t) * r;
      st[o + 7] = u;
      st[o + 8] = Math.sin(t) * r;
      st[o + 9] = Math.random() * Math.PI * 2;
      st[o + 10] = (Math.random() * 2 - 1) * 14;
      st[o + 11] = s.life0 + Math.random() * (s.life1 - s.life0);
      const size = s.size0 + Math.random() * (s.size1 - s.size0);
      st[o + 12] = size;
      st[o + 13] = s.ground + size * 0.5;
      st[o + 14] = s.gravity;
      const c = palette[(Math.random() * palette.length) | 0];
      const j = 0.88 + Math.random() * 0.2;
      const co = i * 4;
      this.colors[co] = c.r * j;
      this.colors[co + 1] = c.g * j;
      this.colors[co + 2] = c.b * j;
      this.colors[co + 3] = 1;
    }
    if (count > 0) {
      this.mesh.thinInstanceBufferUpdated("color");
      this.mesh.setEnabled(true);
    }
  }

  update(dt: number): void {
    if (!this.live) return;
    const st = this.state,
      m = this.matrices;
    let recolor = false;
    for (let i = 0; i < this.live; i++) {
      const o = i * S;
      st[o + 11] -= dt;
      if (st[o + 11] <= 0 || i >= this.limit) {
        // Swap the last live cube into this slot.
        const last = --this.live;
        if (i !== last) {
          st.copyWithin(o, last * S, last * S + S);
          this.colors.copyWithin(i * 4, last * 4, last * 4 + 4);
          recolor = true;
        }
        i--;
        continue;
      }
      st[o + 4] -= st[o + 14] * dt;
      st[o] += st[o + 3] * dt;
      st[o + 1] += st[o + 4] * dt;
      st[o + 2] += st[o + 5] * dt;
      if (st[o + 1] < st[o + 13]) {
        st[o + 1] = st[o + 13];
        if (st[o + 4] < -0.6) {
          st[o + 4] *= -0.38;
          st[o + 3] *= 0.55;
          st[o + 5] *= 0.55;
          st[o + 10] *= 0.5;
        } else {
          // Resting: slide to a stop.
          st[o + 4] = 0;
          st[o + 3] *= 0.8;
          st[o + 5] *= 0.8;
          st[o + 10] *= 0.8;
        }
      }
      st[o + 9] += st[o + 10] * dt;
      const left = st[o + 11];
      const size = st[o + 12] * (left < 0.35 ? left / 0.35 : 1);
      // Axis-angle rotation (Rodrigues), scaled, then translation.
      const x = st[o + 6],
        y = st[o + 7],
        z = st[o + 8];
      const c = Math.cos(st[o + 9]),
        sn = Math.sin(st[o + 9]),
        t = 1 - c;
      const w = i * 16;
      m[w] = (t * x * x + c) * size;
      m[w + 1] = (t * x * y + sn * z) * size;
      m[w + 2] = (t * x * z - sn * y) * size;
      m[w + 3] = 0;
      m[w + 4] = (t * x * y - sn * z) * size;
      m[w + 5] = (t * y * y + c) * size;
      m[w + 6] = (t * y * z + sn * x) * size;
      m[w + 7] = 0;
      m[w + 8] = (t * x * z + sn * y) * size;
      m[w + 9] = (t * y * z - sn * x) * size;
      m[w + 10] = (t * z * z + c) * size;
      m[w + 11] = 0;
      m[w + 12] = st[o];
      m[w + 13] = st[o + 1];
      m[w + 14] = st[o + 2];
      m[w + 15] = 1;
    }
    this.mesh.thinInstanceCount = this.live;
    this.mesh.thinInstanceBufferUpdated("matrix");
    if (recolor) this.mesh.thinInstanceBufferUpdated("color");
    if (!this.live) this.mesh.setEnabled(false);
  }

  get alive(): number {
    return this.live;
  }

  /** Kill everything immediately. */
  clear(): void {
    this.live = 0;
    this.mesh.thinInstanceCount = 0;
    this.mesh.setEnabled(false);
  }

  dispose(): void {
    this.mesh.dispose(false, false);
    this.material.dispose();
  }
}
