/**
 * Face-culling voxel mesher with baked ambient occlusion. Pure TypeScript:
 * returns typed arrays that world-mesh.ts / characters.ts turn into Babylon
 * VertexData. Winding follows Babylon's convention (the same orientation
 * `VertexData.ComputeNormals` produces), so meshes render with ordinary
 * back-face culling in the right-handed scene.
 */
import { VoxelGrid } from "./grid";
import {
  ATLAS_COLUMNS,
  ATLAS_TILE_PX,
  TILES,
  blockDef,
  blockEmissive,
  isOpaque,
  tileIndex,
  type BlockDef,
} from "./blocks";

export type MeshData = {
  positions: Float32Array;
  normals: Float32Array;
  /** RGBA, 0..1. Alpha carries emissive strength for emissive block meshes. */
  colors: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
};
export type Range = {
  x0: number;
  y0: number;
  z0: number;
  /** Exclusive upper bounds. */
  x1: number;
  y1: number;
  z1: number;
};
/** Face order: +X, -X, +Y, -Y, +Z, -Z. */
export type Face = 0 | 1 | 2 | 3 | 4 | 5;
export const FACE_NORMALS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
type RGB = readonly [number, number, number];

class Builder {
  positions: number[] = [];
  normals: number[] = [];
  colors: number[] = [];
  uvs: number[] = [];
  indices: number[] = [];
  get vertexCount() {
    return this.positions.length / 3;
  }
  finish(): MeshData {
    return {
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      colors: new Float32Array(this.colors),
      uvs: new Float32Array(this.uvs),
      indices: new Uint32Array(this.indices),
    };
  }
}
export const emptyMesh = (data: MeshData): boolean => data.indices.length === 0;

/**
 * For each face: the axis along the normal, the in-plane U and V axes and the
 * sign of the normal. Corners are emitted in (u,v) order 00,10,11,01 and the
 * triangle order is chosen once below so it matches Babylon's front faces.
 */
const FACES = FACE_NORMALS.map((n) => {
  const axis = n[0] !== 0 ? 0 : n[1] !== 0 ? 1 : 2;
  const sign = n[axis];
  // Side faces keep V vertical so textures stay upright.
  const u = axis === 0 ? 2 : 0;
  const v = axis === 1 ? 2 : 1;
  return { n, axis, sign, u, v };
});
const CORNERS: readonly (readonly [number, number])[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];
/** Babylon front face: (p0 - p1) x (p2 - p1) points along the outward normal. */
const WINDING: readonly (readonly number[])[] = FACES.map((f) => {
  const corner = (c: readonly [number, number]) => {
    const p = [0, 0, 0];
    p[f.u] = c[0];
    p[f.v] = c[1];
    return p;
  };
  const [a, b, c] = [
    corner(CORNERS[0]),
    corner(CORNERS[1]),
    corner(CORNERS[2]),
  ];
  const e1 = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const e2 = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
  const cross = [
    e1[1] * e2[2] - e1[2] * e2[1],
    e1[2] * e2[0] - e1[0] * e2[2],
    e1[0] * e2[1] - e1[1] * e2[0],
  ];
  const dot = cross[0] * f.n[0] + cross[1] * f.n[1] + cross[2] * f.n[2];
  return dot > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
});
/** The alternate diagonal, used when AO would otherwise interpolate badly. */
const WINDING_FLIPPED: readonly (readonly number[])[] = WINDING.map((w) =>
  w[1] === 1 ? [1, 2, 3, 1, 3, 0] : [1, 3, 2, 1, 0, 3],
);

/** Brightness for 0..3 unoccluded neighbours (classic voxel AO). */
const AO_CURVE = [0.52, 0.68, 0.84, 1];

function aoLevel(s1: boolean, s2: boolean, c: boolean): number {
  if (s1 && s2) return 0;
  return 3 - (Number(s1) + Number(s2) + Number(c));
}

const ATLAS_ROWS = Math.ceil(TILES.length / ATLAS_COLUMNS);
const INSET = 0.5 / ATLAS_TILE_PX;
/**
 * Atlas UV for a tile-local coordinate (fu, fv in 0..1, fv = 1 at the top of the
 * tile). Row 0 is the top of the atlas image; the atlas texture must be created
 * with invertY so image-top maps to v = 1.
 */
export function atlasUV(
  tile: number,
  fu: number,
  fv: number,
): [number, number] {
  const col = tile % ATLAS_COLUMNS,
    row = Math.floor(tile / ATLAS_COLUMNS);
  const u = INSET + fu * (1 - 2 * INSET),
    v = INSET + fv * (1 - 2 * INSET);
  return [(col + u) / ATLAS_COLUMNS, 1 - (row + 1 - v) / ATLAS_ROWS];
}
export const ATLAS_SIZE = {
  width: ATLAS_COLUMNS * ATLAS_TILE_PX,
  height: ATLAS_ROWS * ATLAS_TILE_PX,
  columns: ATLAS_COLUMNS,
  rows: ATLAS_ROWS,
};

const tileCache = new Map<number, [number, number, number]>();
function faceTiles(def: BlockDef): [number, number, number] {
  let t = tileCache.get(def.id);
  if (!t) {
    t = [tileIndex(def.top), tileIndex(def.side), tileIndex(def.bottom)];
    tileCache.set(def.id, t);
  }
  return t;
}

export type BlockMeshOptions = {
  range?: Range;
  /** Whether a voxel emits geometry in this mesh. Default: every visible block. */
  include?: (index: number, id: number) => boolean;
  /** Whether a neighbouring voxel hides a face. Default: opaque cube. */
  occludes?: (index: number, id: number) => boolean;
  /** Per-face colour multiplier for biome tint and hand-made jitter. */
  tint?: (
    ix: number,
    iy: number,
    iz: number,
    id: number,
    face: Face,
  ) => RGB | undefined;
  /** 0 disables baked AO, 1 is full strength. */
  aoStrength?: number;
};
export type BlockMeshes = {
  /** Opaque cubes, slabs and posts using the atlas. */
  solid: MeshData;
  /** Faces of emissive blocks (lanterns, lit windows, runes, crystals). */
  emissive: MeshData;
  /** Alpha-tested crossed quads (flowers, grass, reeds). Double-sided material. */
  cross: MeshData;
};

/** Mesh atlas-textured blocks of a world grid. */
export function meshBlocks(
  grid: VoxelGrid,
  opts: BlockMeshOptions = {},
): BlockMeshes {
  const r = opts.range ?? {
    x0: 0,
    y0: 0,
    z0: 0,
    x1: grid.sx,
    y1: grid.sy,
    z1: grid.sz,
  };
  const include = opts.include;
  const occludes = opts.occludes ?? ((_i: number, id: number) => isOpaque(id));
  const ao = opts.aoStrength ?? 1;
  const solid = new Builder(),
    emissive = new Builder(),
    cross = new Builder();
  const s = grid.size,
    o = grid.origin,
    data = grid.data;
  const occ = (x: number, y: number, z: number): boolean => {
    if (!grid.inside(x, y, z)) return false;
    const i = grid.index(x, y, z);
    return occludes(i, data[i]);
  };
  const white: RGB = [1, 1, 1];
  const emitQuad = (
    b: Builder,
    face: Face,
    corners: number[][],
    uvs: [number, number][],
    shade: number[],
    tint: RGB,
    alpha: number,
  ) => {
    const base = b.vertexCount;
    const n = FACES[face].n;
    for (let c = 0; c < 4; c++) {
      b.positions.push(corners[c][0], corners[c][1], corners[c][2]);
      b.normals.push(n[0], n[1], n[2]);
      b.colors.push(
        tint[0] * shade[c],
        tint[1] * shade[c],
        tint[2] * shade[c],
        alpha,
      );
      b.uvs.push(uvs[c][0], uvs[c][1]);
    }
    // Split along the darker diagonal so AO gradients do not show a crease.
    const order =
      shade[0] + shade[2] > shade[1] + shade[3]
        ? WINDING_FLIPPED[face]
        : WINDING[face];
    for (const k of order) b.indices.push(base + k);
  };

  for (let iy = r.y0; iy < r.y1; iy++)
    for (let iz = r.z0; iz < r.z1; iz++)
      for (let ix = r.x0; ix < r.x1; ix++) {
        const index = grid.index(ix, iy, iz);
        const id = data[index];
        if (id === 0) continue;
        const def = blockDef(id);
        if (def.shape === "air" || def.shape === "liquid") continue;
        if (include && !include(index, id)) continue;
        const [topTile, sideTile, bottomTile] = faceTiles(def);
        const glow = blockEmissive(id);
        const target = glow > 0 ? emissive : solid;
        const x = o.x + ix * s,
          y = o.y + iy * s,
          z = o.z + iz * s;

        if (def.shape === "cross") {
          const t = opts.tint?.(ix, iy, iz, id, 2) ?? white;
          const tile = topTile;
          const h = s * 0.98;
          for (const [ax, az, bx, bz] of [
            [0.12, 0.12, 0.88, 0.88],
            [0.88, 0.12, 0.12, 0.88],
          ]) {
            const base = cross.vertexCount;
            const pts = [
              [x + ax * s, y, z + az * s],
              [x + bx * s, y, z + bz * s],
              [x + bx * s, y + h, z + bz * s],
              [x + ax * s, y + h, z + az * s],
            ];
            const uv = [
              atlasUV(tile, 0, 0),
              atlasUV(tile, 1, 0),
              atlasUV(tile, 1, 1),
              atlasUV(tile, 0, 1),
            ];
            const shade = [0.72, 0.72, 1, 1];
            for (let c = 0; c < 4; c++) {
              cross.positions.push(pts[c][0], pts[c][1], pts[c][2]);
              // Up-facing normals light foliage like the ground beneath it.
              cross.normals.push(0, 1, 0);
              cross.colors.push(
                t[0] * shade[c],
                t[1] * shade[c],
                t[2] * shade[c],
                1,
              );
              cross.uvs.push(uv[c][0], uv[c][1]);
            }
            cross.indices.push(
              base,
              base + 1,
              base + 2,
              base,
              base + 2,
              base + 3,
            );
          }
          continue;
        }

        const slab = def.shape === "slab",
          post = def.shape === "post";
        const inset = post ? 0.32 : 0;
        const height = slab ? 0.5 : 1;
        for (let face = 0; face < 6; face++) {
          const f = face as Face;
          const F = FACES[f];
          const nx = ix + F.n[0],
            ny = iy + F.n[1],
            nz = iz + F.n[2];
          // Slab tops and post sides never touch their neighbour's face.
          const touches = !(slab && f === 2) && !(post && F.axis !== 1);
          if (touches && occ(nx, ny, nz)) continue;
          if (post && F.axis === 1 && grid.get(nx, ny, nz) === id) continue;
          const tile = f === 2 ? topTile : f === 3 ? bottomTile : sideTile;
          const tint = opts.tint?.(ix, iy, iz, id, f) ?? white;
          const corners: number[][] = [];
          const uvs: [number, number][] = [];
          const shade: number[] = [];
          for (const [cu, cv] of CORNERS) {
            const local = [0, 0, 0];
            local[F.axis] = F.sign > 0 ? 1 : 0;
            local[F.u] = cu;
            local[F.v] = cv;
            // Shape adjustments in voxel-local units.
            if (post) {
              if (F.axis !== 0) local[0] = inset + local[0] * (1 - 2 * inset);
              else local[0] = F.sign > 0 ? 1 - inset : inset;
              if (F.axis !== 2) local[2] = inset + local[2] * (1 - 2 * inset);
              else local[2] = F.sign > 0 ? 1 - inset : inset;
            }
            if (slab) local[1] *= height;
            corners.push([
              x + local[0] * s,
              y + local[1] * s,
              z + local[2] * s,
            ]);
            const fu = post && F.axis !== 1 ? inset + cu * (1 - 2 * inset) : cu;
            const fv = slab && F.axis !== 1 ? cv * 0.5 : cv;
            uvs.push(atlasUV(tile, fu, fv));
            if (ao > 0 && !post) {
              const su = cu ? 1 : -1,
                sv = cv ? 1 : -1;
              const du = [0, 0, 0],
                dv = [0, 0, 0];
              du[F.u] = su;
              dv[F.v] = sv;
              // Slab tops sample their own layer; everything else the layer outside.
              const lx = slab && f === 2 ? ix : nx,
                ly = slab && f === 2 ? iy : ny,
                lz = slab && f === 2 ? iz : nz;
              const s1 = occ(lx + du[0], ly + du[1], lz + du[2]);
              const s2 = occ(lx + dv[0], ly + dv[1], lz + dv[2]);
              const c = occ(
                lx + du[0] + dv[0],
                ly + du[1] + dv[1],
                lz + du[2] + dv[2],
              );
              const level = AO_CURVE[aoLevel(s1, s2, c)];
              shade.push(1 - (1 - level) * ao);
            } else shade.push(1);
          }
          emitQuad(target, f, corners, uvs, shade, tint, glow > 0 ? glow : 1);
        }
      }
  return {
    solid: solid.finish(),
    emissive: emissive.finish(),
    cross: cross.finish(),
  };
}

export type ColorMeshOptions = {
  range?: Range;
  /** Palette index → linear-ish sRGB colour 0..1. Index 0 is empty. */
  palette: ArrayLike<RGB>;
  /** Restrict to some palette indices (e.g. split emissive eyes into their own mesh). */
  include?: (paletteIndex: number) => boolean;
  aoStrength?: number;
  /** Translate the result so this world point becomes the origin (part pivots). */
  pivot?: { x: number; y: number; z: number };
};

/** Mesh a palette-coloured voxel model (characters, props, VFX debris). */
export function meshColors(grid: VoxelGrid, opts: ColorMeshOptions): MeshData {
  const r = opts.range ?? {
    x0: 0,
    y0: 0,
    z0: 0,
    x1: grid.sx,
    y1: grid.sy,
    z1: grid.sz,
  };
  const out = new Builder();
  const s = grid.size,
    o = grid.origin,
    p = opts.pivot ?? { x: 0, y: 0, z: 0 };
  const ao = opts.aoStrength ?? 0.8;
  const filled = (x: number, y: number, z: number) => grid.get(x, y, z) !== 0;
  for (let iy = r.y0; iy < r.y1; iy++)
    for (let iz = r.z0; iz < r.z1; iz++)
      for (let ix = r.x0; ix < r.x1; ix++) {
        const value = grid.get(ix, iy, iz);
        if (!value || (opts.include && !opts.include(value))) continue;
        const color = opts.palette[value] ?? [1, 0, 1];
        const x = o.x + ix * s - p.x,
          y = o.y + iy * s - p.y,
          z = o.z + iz * s - p.z;
        for (let face = 0; face < 6; face++) {
          const f = face as Face;
          const F = FACES[f];
          const nx = ix + F.n[0],
            ny = iy + F.n[1],
            nz = iz + F.n[2];
          if (filled(nx, ny, nz)) continue;
          const base = out.vertexCount;
          const shade: number[] = [];
          for (const [cu, cv] of CORNERS) {
            const local = [0, 0, 0];
            local[F.axis] = F.sign > 0 ? 1 : 0;
            local[F.u] = cu;
            local[F.v] = cv;
            out.positions.push(
              x + local[0] * s,
              y + local[1] * s,
              z + local[2] * s,
            );
            out.normals.push(F.n[0], F.n[1], F.n[2]);
            let level = 1;
            if (ao > 0) {
              const du = [0, 0, 0],
                dv = [0, 0, 0];
              du[F.u] = cu ? 1 : -1;
              dv[F.v] = cv ? 1 : -1;
              const s1 = filled(nx + du[0], ny + du[1], nz + du[2]);
              const s2 = filled(nx + dv[0], ny + dv[1], nz + dv[2]);
              const c = filled(
                nx + du[0] + dv[0],
                ny + du[1] + dv[1],
                nz + du[2] + dv[2],
              );
              level = 1 - (1 - AO_CURVE[aoLevel(s1, s2, c)]) * ao;
            }
            shade.push(level);
            out.colors.push(
              color[0] * level,
              color[1] * level,
              color[2] * level,
              1,
            );
          }
          const order =
            shade[0] + shade[2] > shade[1] + shade[3]
              ? WINDING_FLIPPED[f]
              : WINDING[f];
          for (const k of order) out.indices.push(base + k);
        }
      }
  return out.finish();
}

/** Concatenate mesh data (e.g. merging small props before upload). */
export function mergeMeshes(parts: MeshData[]): MeshData {
  const b = new Builder();
  for (const m of parts) {
    const base = b.vertexCount;
    // Element-wise copies: spreading large typed arrays overflows the call stack.
    for (const v of m.positions) b.positions.push(v);
    for (const v of m.normals) b.normals.push(v);
    for (const v of m.colors) b.colors.push(v);
    for (const v of m.uvs) b.uvs.push(v);
    for (const i of m.indices) b.indices.push(base + i);
  }
  return b.finish();
}
