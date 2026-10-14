/**
 * Small voxel models, gradient textures and helpers for ambient VFX. Models are
 * meshed with the shared colour mesher so critters and the astrolabe share the
 * world's chunky, softly occluded look.
 */
import {
  Color3,
  Constants,
  DynamicTexture,
  Material,
  Matrix,
  Mesh,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
  VertexData,
  type Scene,
} from "@babylonjs/core";
import { VoxelGrid } from "../voxel/grid";
import { meshColors, type MeshData } from "../voxel/mesher";
import { hexRgb } from "./ambient-particles";

type RGB = readonly [number, number, number];

/** Everything an ambient feature creates, so dispose() can never miss one. */
export class Owned {
  readonly meshes: Mesh[] = [];
  readonly materials: Material[] = [];
  readonly textures: Texture[] = [];
  readonly nodes: TransformNode[] = [];
  node<T extends TransformNode>(n: T): T {
    this.nodes.push(n);
    return n;
  }
  mesh<T extends Mesh>(m: T): T {
    this.meshes.push(m);
    return m;
  }
  material<T extends Material>(m: T): T {
    this.materials.push(m);
    return m;
  }
  texture<T extends Texture>(t: T): T {
    this.textures.push(t);
    return t;
  }
  /** Enabled, visible meshes (for metrics). */
  activeMeshes(): number {
    let n = 0;
    for (const m of this.meshes)
      if (!m.isDisposed() && m.isEnabled() && m.isVisible) n++;
    return n;
  }
  dispose(): void {
    for (const m of this.meshes) m.dispose(false, false);
    for (const m of this.materials) m.dispose(false, false);
    for (const t of this.textures) t.dispose();
    for (const n of this.nodes) n.dispose();
    this.nodes.length = 0;
    this.meshes.length = 0;
    this.materials.length = 0;
    this.textures.length = 0;
  }
}

export function palette(...hex: string[]): RGB[] {
  return [[0, 0, 0], ...hex.map((h) => hexRgb(h))];
}

export function applyMeshData(
  mesh: Mesh,
  d: MeshData,
  updatable = false,
): void {
  const vd = new VertexData();
  vd.positions = d.positions;
  vd.normals = d.normals;
  vd.colors = d.colors;
  vd.indices = d.indices;
  vd.applyToMesh(mesh, updatable);
}

/** Mesh a voxel model built from a fill function, centred on `pivot` (voxel units). */
export function voxelMesh(
  scene: Scene,
  name: string,
  size: number,
  dims: [number, number, number],
  fill: (x: number, y: number, z: number) => number,
  colors: RGB[],
  pivot: [number, number, number],
  ao = 0.6,
): Mesh {
  const [sx, sy, sz] = dims;
  const grid = new VoxelGrid(sx, sy, sz, { x: 0, y: 0, z: 0 }, size);
  for (let y = 0; y < sy; y++)
    for (let z = 0; z < sz; z++)
      for (let x = 0; x < sx; x++) {
        const v = fill(x, y, z);
        if (v) grid.set(x, y, z, v);
      }
  const data = meshColors(grid, {
    palette: colors,
    aoStrength: ao,
    pivot: { x: pivot[0] * size, y: pivot[1] * size, z: pivot[2] * size },
  });
  const mesh = new Mesh(name, scene);
  applyMeshData(mesh, data);
  return mesh;
}

/** Matte toy material for vertex-coloured voxel models. */
export function toyMaterial(
  scene: Scene,
  name: string,
  emissive = 0,
  tint?: Color3,
): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.White();
  m.specularColor = Color3.Black();
  m.emissiveColor = (tint ?? Color3.White()).scale(emissive);
  return m;
}

/** Unlit glowing material: colour = vertex colour × `color`. */
export function glowMaterial(
  scene: Scene,
  name: string,
  color: Color3,
): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.disableLighting = true;
  m.diffuseColor = Color3.Black();
  m.specularColor = Color3.Black();
  m.emissiveColor = color;
  return m;
}

/** Additive, unlit, double-sided material for light curtains and beams. */
export function additiveMaterial(
  scene: Scene,
  name: string,
  color: Color3,
  emissive: Texture | null,
  opacity: Texture | null,
  alpha: number,
): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.disableLighting = true;
  m.diffuseColor = Color3.Black();
  m.specularColor = Color3.Black();
  m.emissiveColor = color;
  m.emissiveTexture = emissive;
  m.opacityTexture = opacity;
  m.alpha = alpha;
  m.alphaMode = Constants.ALPHA_ADD;
  m.transparencyMode = Material.MATERIAL_ALPHABLEND;
  m.backFaceCulling = false;
  m.disableDepthWrite = true;
  return m;
}

/** Additive light by night; by day a translucent tint that still reads on pale paving. */
export function dayNightBlend(m: Material, night: number): void {
  const mode = night >= 0.5 ? Constants.ALPHA_ADD : Constants.ALPHA_COMBINE;
  if (m.alphaMode !== mode) m.alphaMode = mode;
}

// ───────────────────────────── painted textures ─────────────────────────────

/** A texture painted per pixel: paint(u, v) → [lum 0..1, alpha 0..1], v = 0 at the TOP row. */
export function paintTexture(
  scene: Scene,
  name: string,
  w: number,
  h: number,
  paint: (u: number, v: number) => [number, number],
  wrapU = false,
  wrapV = false,
): DynamicTexture {
  const tex = new DynamicTexture(
    name,
    { width: w, height: h },
    scene,
    true,
    Texture.TRILINEAR_SAMPLINGMODE,
  );
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [l, a] = paint((x + 0.5) / w, (y + 0.5) / h);
      const i = (x + y * w) * 4;
      const c = Math.round(Math.max(0, Math.min(1, l)) * 255);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = c;
      img.data[i + 3] = Math.round(Math.max(0, Math.min(1, a)) * 255);
    }
  ctx.putImageData(img, 0, 0);
  tex.update(true);
  tex.hasAlpha = true;
  tex.wrapU = wrapU ? Texture.WRAP_ADDRESSMODE : Texture.CLAMP_ADDRESSMODE;
  tex.wrapV = wrapV ? Texture.WRAP_ADDRESSMODE : Texture.CLAMP_ADDRESSMODE;
  return tex;
}

/** Deterministic hash noise 0..1. */
export function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Soft vertical light streaks, tileable in u (and v when `waves` > 0). */
export function streakTexture(
  scene: Scene,
  name: string,
  seed: number,
  columns: number,
  waves = 0,
  floor = 0.18,
  /** Write the streaks into alpha (for opacity textures) instead of luminance. */
  alpha = false,
): DynamicTexture {
  const amp: number[] = [];
  const wid: number[] = [];
  for (let i = 0; i < columns; i++) {
    amp.push(0.35 + 0.65 * hash(seed + i * 3.1));
    wid.push(0.25 + 0.5 * hash(seed + i * 7.7));
  }
  return paintTexture(
    scene,
    name,
    128,
    64,
    (u, v) => {
      const f = u * columns;
      let l = 0;
      // Neighbouring columns overlap so streaks never end in a seam.
      for (let k = -1; k <= 1; k++) {
        const i = Math.floor(f) + k;
        const c = ((i % columns) + columns) % columns;
        const d = (f - i - 0.5) / wid[c];
        let s = amp[c] * Math.exp(-d * d * 2.5);
        if (waves > 0)
          s *= 0.6 + 0.4 * Math.sin((v * waves + hash(seed + c)) * Math.PI * 2);
        l = Math.max(l, s);
      }
      const v2 = floor + (1 - floor) * l;
      return alpha ? [1, v2] : [v2, 1];
    },
    true,
    true,
  );
}

/** Beam opacity: soft horizontal profile with a bright core, fading upward. */
export function beamMask(
  scene: Scene,
  name: string,
  fadePower: number,
  spread = 5,
): DynamicTexture {
  return paintTexture(scene, name, 64, 128, (u, v) => {
    const t = 1 - v; // 0 bottom, 1 top
    const x = (u - 0.5) * 2;
    const across =
      0.62 * Math.exp(-x * x * spread) + 0.38 * Math.exp(-x * x * 60);
    const along =
      Math.min(1, t / 0.035) * Math.pow(Math.max(0, 1 - t), fadePower);
    return [1, across * along];
  });
}

/**
 * A vertical light veil standing on a ground path: vertex alpha fades it
 * upward (rows of [height, alpha]) and toward open path ends; u runs along the
 * path in metres / `tile` so an opacity texture can scroll along it.
 */
export function veilMesh(
  scene: Scene,
  name: string,
  path: readonly [number, number][],
  ground: number,
  rows: readonly [number, number][],
  tile: number,
  endFade: number,
  closed: boolean,
): Mesh {
  const along: number[] = [0];
  for (let i = 1; i < path.length; i++)
    along.push(
      along[i - 1] +
        Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]),
    );
  const total = along[along.length - 1];
  const top = rows[rows.length - 1][0];
  const positions: number[] = [],
    colors: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  for (let i = 0; i < path.length; i++) {
    const d = along[i];
    const ends =
      closed || endFade <= 0
        ? 1
        : Math.min(1, d / endFade) * Math.min(1, (total - d) / endFade);
    for (const [h, a] of rows) {
      positions.push(path[i][0], ground + h, path[i][1]);
      colors.push(1, 1, 1, a * ends);
      uvs.push(d / tile, h / top);
    }
  }
  const R = rows.length;
  for (let i = 0; i < path.length - 1; i++)
    for (let r = 0; r < R - 1; r++) {
      const a = i * R + r,
        b = (i + 1) * R + r;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const mesh = new Mesh(name, scene);
  const vd = new VertexData();
  vd.positions = positions;
  vd.colors = colors;
  vd.uvs = uvs;
  vd.indices = indices;
  vd.normals = new Array(positions.length).fill(0);
  vd.applyToMesh(mesh);
  mesh.hasVertexAlpha = true;
  mesh.isPickable = false;
  return mesh;
}

// ───────────────────────────── thin instances ─────────────────────────────

/** A thin-instanced mesh rebuilt every frame from a handful of matrices. */
export class Instances {
  private matrices: Float32Array;
  private colors: Float32Array | null;
  private count = 0;
  constructor(
    readonly mesh: Mesh,
    readonly capacity: number,
    withColors: boolean,
  ) {
    this.matrices = new Float32Array(capacity * 16);
    this.colors = withColors ? new Float32Array(capacity * 4).fill(1) : null;
    mesh.thinInstanceSetBuffer("matrix", this.matrices, 16, false);
    if (this.colors) mesh.thinInstanceSetBuffer("color", this.colors, 4, false);
    mesh.thinInstanceCount = 0;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.isVisible = false;
  }
  begin(): void {
    this.count = 0;
  }
  push(m: Matrix, r = 1, g = 1, b = 1): void {
    if (this.count >= this.capacity) return;
    m.copyToArray(this.matrices, this.count * 16);
    if (this.colors) {
      const i = this.count * 4;
      this.colors[i] = r;
      this.colors[i + 1] = g;
      this.colors[i + 2] = b;
      this.colors[i + 3] = 1;
    }
    this.count++;
  }
  end(): void {
    const mesh = this.mesh;
    mesh.thinInstanceCount = this.count;
    mesh.isVisible = this.count > 0;
    if (!this.count) return;
    mesh.thinInstanceBufferUpdated("matrix");
    if (this.colors) mesh.thinInstanceBufferUpdated("color");
  }
}

// ───────────────────────────── trails ─────────────────────────────

/**
 * Camera-facing ribbons fading toward their tails, one draw call for all of
 * them. Trails sample their owner's path (head at k = 0) so they look the same
 * at any frame rate.
 */
export class RibbonTrails {
  readonly mesh: Mesh;
  private points: Float32Array;
  private positions: Float32Array;
  private colors: Float32Array;
  private side = new Vector3();
  private tangent = new Vector3();
  private toEye = new Vector3();
  private sampled = new Vector3();
  constructor(
    scene: Scene,
    name: string,
    readonly tints: RGB[],
    readonly count: number,
    readonly width: number,
    material: Material,
  ) {
    const n = tints.length;
    this.points = new Float32Array(count * 3);
    this.positions = new Float32Array(n * count * 2 * 3);
    this.colors = new Float32Array(n * count * 2 * 4);
    const indices: number[] = [];
    for (let t = 0; t < n; t++)
      for (let i = 0; i < count - 1; i++) {
        const a = (t * count + i) * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    const mesh = new Mesh(name, scene);
    const vd = new VertexData();
    vd.positions = this.positions;
    vd.colors = this.colors;
    vd.indices = indices;
    vd.normals = new Float32Array(this.positions.length);
    vd.applyToMesh(mesh, true);
    mesh.hasVertexAlpha = true;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.isPickable = false;
    mesh.material = material;
    this.mesh = mesh;
  }
  /** Rebuild every ribbon from `sample(trail, k, out)`, k = 0 at the head. */
  update(
    sample: (trail: number, k: number, out: Vector3) => void,
    eye: Vector3,
    fade: number,
  ): void {
    const P = this.count,
      h = this.points,
      pos = this.positions,
      col = this.colors;
    for (let t = 0; t < this.tints.length; t++) {
      for (let i = 0; i < P; i++) {
        sample(t, i, this.sampled);
        h[i * 3] = this.sampled.x;
        h[i * 3 + 1] = this.sampled.y;
        h[i * 3 + 2] = this.sampled.z;
      }
      const [r, g, b] = this.tints[t];
      for (let i = 0; i < P; i++) {
        const c = i * 3,
          prev = Math.max(0, i - 1) * 3,
          next = Math.min(P - 1, i + 1) * 3;
        this.tangent.set(
          h[prev] - h[next],
          h[prev + 1] - h[next + 1],
          h[prev + 2] - h[next + 2],
        );
        this.toEye.set(eye.x - h[c], eye.y - h[c + 1], eye.z - h[c + 2]);
        Vector3.CrossToRef(this.tangent, this.toEye, this.side);
        const len = this.side.length();
        const k = i / (P - 1);
        const w = (this.width * (1 - k * 0.85)) / 2;
        if (len > 1e-6) this.side.scaleInPlace(w / len);
        else this.side.set(0, w, 0);
        const v = (t * P + i) * 2 * 3;
        pos[v] = h[c] + this.side.x;
        pos[v + 1] = h[c + 1] + this.side.y;
        pos[v + 2] = h[c + 2] + this.side.z;
        pos[v + 3] = h[c] - this.side.x;
        pos[v + 4] = h[c + 1] - this.side.y;
        pos[v + 5] = h[c + 2] - this.side.z;
        const a = Math.pow(1 - k, 1.4) * fade;
        const ci = (t * P + i) * 2 * 4;
        col[ci] = col[ci + 4] = r;
        col[ci + 1] = col[ci + 5] = g;
        col[ci + 2] = col[ci + 6] = b;
        col[ci + 3] = col[ci + 7] = a;
      }
    }
    this.mesh.updateVerticesData("position", pos, false, false);
    this.mesh.updateVerticesData("color", col, false, false);
  }
}

// ───────────────────────────── models ─────────────────────────────

/** Chunky little fish facing +Z, ~0.5 m long. */
export function fishModel(
  scene: Scene,
  name: string,
  variant: "koi" | "blue",
): Mesh {
  const colors =
    variant === "koi"
      ? palette("#ff8a3d", "#fff7e8", "#2b2140", "#ffb36b", "#ff6a2a")
      : palette("#4ea7f0", "#e6f6ff", "#2b2140", "#ffd45e", "#3a86d8");
  // 1 body, 2 stripe/belly, 3 eye, 4 fins, 5 back
  return voxelMesh(
    scene,
    name,
    0.062,
    [3, 6, 10],
    (x, y, z) => {
      const side = x !== 1;
      // Forked tail at z 0..1, centre column only.
      if (z === 0) return x === 1 && y !== 2 && y >= 1 && y <= 4 ? 4 : 0;
      if (z === 1) return x === 1 && y >= 2 && y <= 3 ? 4 : 0;
      if (y === 5) return x === 1 && (z === 4 || z === 5) ? 4 : 0;
      const ey = (y - 2.5) / (side ? 2.1 : 2.6),
        ez = (z - 5.2) / (side ? 3.4 : 3.9);
      if (ey * ey + ez * ez > 1) return 0;
      if (side && z === 7 && y === 3) return 3;
      if (variant === "koi") {
        if (z === 4 || (z === 6 && y >= 1 && y <= 4)) return 2;
        return y >= 4 ? 5 : 1;
      }
      if (y <= 1) return 2;
      return y >= 4 ? 5 : 1;
    },
    colors,
    [1.5, 2.5, 5],
    0.45,
  );
}

/** Bluebird body facing +Z (wings are separate instances). */
export function birdBody(scene: Scene, name: string): Mesh {
  // 1 body, 2 belly, 3 beak, 4 eye, 5 tail
  const colors = palette("#6ec3ff", "#fff3df", "#ffb347", "#2b2140", "#4e8fe0");
  return voxelMesh(
    scene,
    name,
    0.075,
    [3, 4, 8],
    (x, y, z) => {
      if (z === 0) return x === 1 && (y === 1 || y === 2) ? 5 : 0;
      if (z >= 1 && z <= 4 && y <= 2) return y === 0 && x === 1 ? 2 : 1;
      if (z >= 5 && z <= 6 && y >= 1 && y <= 3) {
        if (z === 6 && y === 3 && x !== 1) return 4;
        return y === 1 ? 2 : 1;
      }
      if (z === 7 && x === 1 && y === 2) return 3;
      return 0;
    },
    colors,
    [1.5, 1.5, 3.5],
    0.5,
  );
}

/** One bird wing extending along +X from a hinge at the origin. */
export function birdWing(scene: Scene, name: string): Mesh {
  const colors = palette("#4e8fe0", "#ffffff", "#9fd8ff");
  return voxelMesh(
    scene,
    name,
    0.075,
    [5, 1, 3],
    (x, _y, z) => {
      if (x === 4) return z === 1 ? 2 : 0;
      if (x === 3) return 3;
      return 1;
    },
    colors,
    [0, 0.5, 1.5],
    0.3,
  );
}

/** One butterfly wing (plus half the body) extending along +X; tinted per instance. */
export function butterflyWing(scene: Scene, name: string): Mesh {
  // 1 wing (instance colour), 2 spot, 3 rim, 4 body
  const colors: RGB[] = [
    [0, 0, 0],
    [1, 1, 1],
    [0.55, 0.5, 0.62],
    [0.8, 0.78, 0.86],
    [0.2, 0.16, 0.3],
  ];
  // Rows of wing pixels outward from the body: forewing zz = 1..4, hindwing zz = 0..-3.
  const fore = ["1111.", "11213", "11113", ".11.."];
  const hind = ["111..", "1213.", "113..", ".1..."];
  return voxelMesh(
    scene,
    name,
    0.052,
    [6, 1, 9],
    (x, _y, z) => {
      const zz = z - 4; // -4..4
      if (x === 0) return zz >= -2 && zz <= 3 ? 4 : 0;
      const wx = x - 1;
      if (zz >= 1) {
        const row = fore[zz - 1];
        const ch = row?.[wx];
        return ch === "1" ? 1 : ch === "2" ? 2 : ch === "3" ? 3 : 0;
      }
      const row = hind[-zz];
      const ch = row?.[wx];
      return ch === "1" ? 1 : ch === "2" ? 2 : ch === "3" ? 3 : 0;
    },
    colors,
    [0.5, 0.5, 4.5],
    0.25,
  );
}

/** Golden voxel gem (octahedron) for the quest beacon. */
export function diamondModel(scene: Scene, name: string): Mesh {
  const colors = palette("#fff4b8", "#ffd45e", "#f2a93b", "#ffffff");
  return voxelMesh(
    scene,
    name,
    0.085,
    [9, 15, 9],
    (x, y, z) => {
      const dx = Math.abs(x - 4),
        dz = Math.abs(z - 4),
        dy = y - 7;
      if (dx + dz + Math.abs(dy) * 0.6 > 4.3) return 0;
      if (dy >= 5) return 4;
      if (dy >= 0) return (dx + dz) % 3 === 0 ? 1 : 2;
      return (dx + dz) % 3 === 0 ? 2 : 3;
    },
    colors,
    [4.5, 7.5, 4.5],
    0.5,
  );
}

/** Faceted voxel orb; its colours glow through an unlit material. */
export function orbModel(scene: Scene, name: string): Mesh {
  const colors = palette("#e8ffff", "#9ff6ff", "#55def5");
  const r = 4.4;
  return voxelMesh(
    scene,
    name,
    0.07,
    [9, 9, 9],
    (x, y, z) => {
      const d = Math.hypot(x - 4, y - 4, z - 4);
      if (d > r) return 0;
      const n = (x * 7 + y * 13 + z * 5) % 9;
      return n === 0 ? 1 : n < 3 ? 3 : 2;
    },
    colors,
    [4.5, 4.5, 4.5],
    0.35,
  );
}

/** Flat voxel ring of radius `radius` m in the local XZ plane, with gems. */
export function ringModel(
  scene: Scene,
  name: string,
  radius: number,
  gem: string,
  ticks: number,
): Mesh {
  const s = 0.08;
  const n = Math.ceil((radius * 2 + 0.6) / s);
  const c = n / 2;
  const colors = palette("#ffd45e", "#e8ae45", "#ffe9a0", gem);
  return voxelMesh(
    scene,
    name,
    s,
    [n, 2, n],
    (x, y, z) => {
      const px = (x + 0.5 - c) * s,
        pz = (z + 0.5 - c) * s;
      const d = Math.hypot(px, pz);
      const off = d - radius;
      if (Math.abs(off) > 0.085) return 0;
      const a = (Math.atan2(pz, px) / (Math.PI * 2) + 1) % 1;
      const half = (a * 2) % 1;
      if (half < 0.02 || half > 0.98) return 4;
      const tick = (a * ticks) % 1;
      if (y === 1 && off > 0 && (tick < 0.08 || tick > 0.92)) return 3;
      return off < 0 ? 2 : 1;
    },
    colors,
    [c, 1, c],
    0.55,
  );
}
