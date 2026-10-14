/**
 * Shared state and helpers for the deterministic voxel world generator.
 * Pure TypeScript: no Babylon or DOM, so it runs in node tests and the browser.
 */
import { B, VOXEL, WORLD_BOUNDS } from "./blocks";
import { VoxelGrid } from "./grid";
import type {
  StructureInfo,
  StructureKind,
  WorldEmitter,
  WorldLight,
} from "./api";

export const SX = Math.round((WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX) / VOXEL);
export const SY = Math.round((WORLD_BOUNDS.maxY - WORLD_BOUNDS.minY) / VOXEL);
export const SZ = Math.round((WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ) / VOXEL);
/** iy of the top ground block (world y -0.5..0). */
export const GROUND = Math.round(-WORLD_BOUNDS.minY / VOXEL) - 1;

const AIR = B.AIR;

/** Voxel index containing a world coordinate (may be outside the grid). */
export const vx = (x: number) => Math.floor((x - WORLD_BOUNDS.minX) / VOXEL);
export const vz = (z: number) => Math.floor((z - WORLD_BOUNDS.minZ) / VOXEL);
export const vy = (y: number) => Math.floor((y - WORLD_BOUNDS.minY) / VOXEL);
/** World-space centre of a voxel index. */
export const cx = (ix: number) => WORLD_BOUNDS.minX + (ix + 0.5) * VOXEL;
export const cz = (iz: number) => WORLD_BOUNDS.minZ + (iz + 0.5) * VOXEL;
export const cy = (iy: number) => WORLD_BOUNDS.minY + (iy + 0.5) * VOXEL;
/** iy of the voxel row whose bottom is `r` voxels above the ground surface. */
export const row = (r: number) => GROUND + 1 + r;
/** Inclusive voxel span strictly inside the metre range [a, b] (rounded inward). */
export function inward(a: number, b: number, min: number): [number, number] {
  return [
    Math.ceil((a - min) / VOXEL - 1e-6),
    Math.floor((b - min) / VOXEL + 1e-6) - 1,
  ];
}
export const spanX = (a: number, b: number) => inward(a, b, WORLD_BOUNDS.minX);
export const spanZ = (a: number, b: number) => inward(a, b, WORLD_BOUNDS.minZ);

/** Road centre line: matches the previous scene and the simulation's route. */
export const roadMid = (z: number) => Math.sin(z * 0.13) * 1.3;

// Column flags.
export const F = {
  PATH: 1,
  PLAZA: 2,
  BRIDGE: 4,
  WATER: 8,
  BANK: 16,
  /** Keep clear of terraces, cover and trees (NPC spots, dens, landmarks). */
  KEEP: 32,
  /** Something was built here; scenery avoids it. */
  BUILT: 64,
  TERRACE: 128,
  TRAIL: 256,
} as const;

export type Rng = () => number;
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++)
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
/** Integer lattice hash in [0, 1). */
export function hash3(a: number, b: number, c: number): number {
  let h =
    Math.imul(a | 0, 374761393) ^
    Math.imul(b | 0, 668265263) ^
    Math.imul(c | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const smooth = (t: number) => t * t * (3 - 2 * t);
export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** 2D value noise in [0, 1). */
export function noise2(x: number, z: number, seed: number): number {
  const x0 = Math.floor(x),
    z0 = Math.floor(z);
  const fx = smooth(x - x0),
    fz = smooth(z - z0);
  const a = hash3(x0, z0, seed),
    b = hash3(x0 + 1, z0, seed),
    c = hash3(x0, z0 + 1, seed),
    d = hash3(x0 + 1, z0 + 1, seed);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
/** Three-octave fractal value noise in roughly [0, 1). */
export function fbm(x: number, z: number, seed: number): number {
  return (
    noise2(x, z, seed) * 0.57 +
    noise2(x * 2.03 + 17.1, z * 2.03 - 9.4, seed + 1) * 0.29 +
    noise2(x * 4.11 - 3.3, z * 4.11 + 5.7, seed + 2) * 0.14
  );
}

/**
 * Mutable generation context. Coordinates passed to the voxel helpers are
 * grid indices; the `*M` helpers take metres.
 */
export class Gen {
  readonly grid: VoxelGrid;
  readonly owner: Uint16Array;
  readonly structures: StructureInfo[] = [];
  readonly lights: WorldLight[] = [];
  readonly emitters: WorldEmitter[] = [];
  /** iy of the top terrain block per column (ground level for scenery). */
  readonly top: Int16Array;
  readonly flags: Uint16Array;
  /** Owner written by set(); 0 = terrain. */
  private cur = 0;
  private bounds: Int32Array[] = [];

  constructor(readonly seed: number) {
    this.grid = new VoxelGrid(
      SX,
      SY,
      SZ,
      { x: WORLD_BOUNDS.minX, y: WORLD_BOUNDS.minY, z: WORLD_BOUNDS.minZ },
      VOXEL,
    );
    this.owner = new Uint16Array(this.grid.data.length);
    this.top = new Int16Array(SX * SZ).fill(GROUND);
    this.flags = new Uint16Array(SX * SZ);
  }

  /** Independent deterministic stream per feature, so features don't reshuffle each other. */
  rng(tag: string): Rng {
    return mulberry32(hashString(tag) ^ Math.imul(this.seed, 2654435761));
  }
  noiseSeed(tag: string): number {
    return (hashString(tag) ^ this.seed) & 0x7fffffff;
  }

  begin(name: string, kind: StructureKind, fade: boolean): number {
    this.structures.push({ name, kind, fade, min: [0, 0, 0], max: [0, 0, 0] });
    this.bounds.push(Int32Array.of(SX, SY, SZ, -1, -1, -1));
    this.cur = this.structures.length;
    return this.cur;
  }
  /** Resume writing into an existing structure (1-based id) or terrain (0). */
  use(id: number): void {
    this.cur = id;
  }
  end(): void {
    this.cur = 0;
  }
  get current(): number {
    return this.cur;
  }

  col(ix: number, iz: number): number {
    return ix + iz * SX;
  }
  inCols(ix: number, iz: number): boolean {
    return ix >= 0 && iz >= 0 && ix < SX && iz < SZ;
  }
  flag(ix: number, iz: number, f: number): void {
    if (this.inCols(ix, iz)) this.flags[ix + iz * SX] |= f;
  }
  has(ix: number, iz: number, f: number): boolean {
    return this.inCols(ix, iz) && (this.flags[ix + iz * SX] & f) !== 0;
  }

  get(ix: number, iy: number, iz: number): number {
    if (ix < 0 || iy < 0 || iz < 0 || ix >= SX || iy >= SY || iz >= SZ)
      return 0;
    return this.grid.data[ix + SX * (iz + SZ * iy)];
  }
  set(ix: number, iy: number, iz: number, id: number): void {
    if (ix < 0 || iy < 0 || iz < 0 || ix >= SX || iy >= SY || iz >= SZ) return;
    const i = ix + SX * (iz + SZ * iy);
    this.grid.data[i] = id;
    this.owner[i] = id === AIR ? 0 : this.cur;
    if (this.cur > 0 && id !== AIR) {
      const b = this.bounds[this.cur - 1];
      if (ix < b[0]) b[0] = ix;
      if (iy < b[1]) b[1] = iy;
      if (iz < b[2]) b[2] = iz;
      if (ix > b[3]) b[3] = ix;
      if (iy > b[4]) b[4] = iy;
      if (iz > b[5]) b[5] = iz;
    }
  }
  /** Write only into empty space (scenery that must not cut other features). */
  setIfAir(ix: number, iy: number, iz: number, id: number): boolean {
    if (ix < 0 || iy < 0 || iz < 0 || ix >= SX || iy >= SY || iz >= SZ)
      return false;
    if (this.grid.data[ix + SX * (iz + SZ * iy)] !== AIR) return false;
    this.set(ix, iy, iz, id);
    return true;
  }
  /** Inclusive box of voxel indices. */
  fill(
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    id: number,
  ): void {
    for (let iy = Math.min(y0, y1); iy <= Math.max(y0, y1); iy++)
      for (let iz = Math.min(z0, z1); iz <= Math.max(z0, z1); iz++)
        for (let ix = Math.min(x0, x1); ix <= Math.max(x0, x1); ix++)
          this.set(ix, iy, iz, id);
  }
  /** Set the voxel containing a world point. */
  setM(x: number, y: number, z: number, id: number): void {
    this.set(vx(x), vy(y), vz(z), id);
  }
  /** Fill voxels whose centres lie in the metre box [x0,x1]×[y0,y1]×[z0,z1]. */
  boxM(
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    id: number,
  ): void {
    const [ax, bx] = spanX(x0, x1),
      [az, bz] = spanZ(z0, z1),
      [ay, by] = inward(y0, y1, WORLD_BOUNDS.minY);
    for (let iy = ay; iy <= by; iy++)
      for (let iz = az; iz <= bz; iz++)
        for (let ix = ax; ix <= bx; ix++) this.set(ix, iy, iz, id);
  }
  /** Replace the top terrain block of a column (flush ground decoration). */
  surface(ix: number, iz: number, id: number): void {
    if (!this.inCols(ix, iz)) return;
    const prev = this.cur;
    this.cur = 0;
    this.set(ix, this.top[ix + iz * SX], iz, id);
    this.cur = prev;
  }
  /** iy of the first air voxel above the column's terrain. */
  above(ix: number, iz: number): number {
    return this.top[this.col(ix, iz)] + 1;
  }

  light(
    x: number,
    y: number,
    z: number,
    kind: WorldLight["kind"],
    color: string,
    intensity: number,
  ): void {
    this.lights.push({ x, y, z, kind, color, intensity });
  }
  emit(e: WorldEmitter): void {
    this.emitters.push(e);
  }

  /** Close structure bounds, dropping empty structures and renumbering owners. */
  finishStructures(): void {
    const remap = new Uint16Array(this.structures.length + 1);
    const kept: StructureInfo[] = [];
    this.structures.forEach((s, i) => {
      const b = this.bounds[i];
      if (b[3] < 0) return;
      s.min = [b[0], b[1], b[2]];
      s.max = [b[3], b[4], b[5]];
      kept.push(s);
      remap[i + 1] = kept.length;
    });
    if (kept.length !== this.structures.length) {
      const o = this.owner;
      for (let i = 0; i < o.length; i++) if (o[i]) o[i] = remap[o[i]];
    }
    this.structures.length = 0;
    this.structures.push(...kept);
  }
}
