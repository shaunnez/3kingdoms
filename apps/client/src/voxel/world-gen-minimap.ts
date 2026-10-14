/**
 * One pixel per voxel column, north up: the colour of the top visible block,
 * lit by height with soft outlines on terrace steps and building edges.
 */
import { B, BLOCKS, VOXEL, WORLD_BOUNDS } from "./blocks";
import type { MinimapImage } from "./api";
import { Gen, SX, SY, SZ, hash3 } from "./world-gen-core";

const HEX: Record<number, string> = {
  [B.GRASS]: "#7ccf5a",
  [B.DIRT]: "#a0704a",
  [B.PATH]: "#d9b27c",
  [B.CLAY_PATH]: "#c99862",
  [B.SAND]: "#f1dc9c",
  [B.GRAVEL]: "#b9b2a6",
  [B.STONE]: "#a8a49c",
  [B.STONE_DARK]: "#7d7a86",
  [B.COBBLE]: "#9b968e",
  [B.STONE_BRICK]: "#a9a4a0",
  [B.MOSSY_BRICK]: "#8fa678",
  [B.PAVING]: "#d6d0c4",
  [B.PAVING_DARK]: "#9d97a0",
  [B.MARBLE]: "#f3efe7",
  [B.BRICK]: "#c4664f",
  [B.PLANKS]: "#c58f53",
  [B.PLANKS_DARK]: "#7a5232",
  [B.LOG]: "#b4864f",
  [B.BIRCH_LOG]: "#e9e3d7",
  [B.LEAVES]: "#4fae4a",
  [B.LEAVES_CHERRY]: "#ffaed1",
  [B.LEAVES_DARK]: "#2f8a4f",
  [B.LEAVES_AUTUMN]: "#ff9f43",
  [B.LEAVES_GOLD]: "#ffd45e",
  [B.MOSS]: "#6db352",
  [B.PLASTER]: "#fff3df",
  [B.TIMBER]: "#7a5232",
  [B.ROOF_RED]: "#e8574f",
  [B.ROOF_BLUE]: "#4e8fe0",
  [B.ROOF_TEAL]: "#3fb8a8",
  [B.ROOF_RED_SLAB]: "#e8574f",
  [B.ROOF_BLUE_SLAB]: "#4e8fe0",
  [B.ROOF_TEAL_SLAB]: "#3fb8a8",
  [B.GLASS_LIT]: "#ffd98a",
  [B.DOOR]: "#7a5232",
  [B.WOOL_RED]: "#e0474c",
  [B.WOOL_BLUE]: "#3f6fd8",
  [B.WOOL_YELLOW]: "#ffd14a",
  [B.WOOL_WHITE]: "#f7f4ee",
  [B.WOOL_GREEN]: "#63c35a",
  [B.COPPER]: "#dc8a52",
  [B.COPPER_OXIDIZED]: "#5fc4ac",
  [B.IRON]: "#a3acb6",
  [B.GOLD]: "#ffd45e",
  [B.LANTERN]: "#ffcf6a",
  [B.RUNE]: "#5ef2ff",
  [B.CRYSTAL]: "#ff6bd6",
  [B.WATER]: "#53c7f0",
  [B.TERRACOTTA]: "#d27a4f",
  [B.HAY]: "#e8c25a",
  [B.PUMPKIN]: "#f39a2e",
  [B.CRATE]: "#b07d47",
  [B.BARREL]: "#8f5e36",
  [B.SNOW]: "#ffffff",
  [B.STONE_SLAB]: "#a9a4a0",
  [B.PLANK_SLAB]: "#c58f53",
  [B.COBBLE_SLAB]: "#9b968e",
  [B.POST_WOOD]: "#7a5232",
  [B.POST_IRON]: "#5d6670",
  [B.POST_STONE]: "#a9a4a0",
  [B.FLOWER_RED]: "#ff5a5f",
  [B.FLOWER_YELLOW]: "#ffe14d",
  [B.FLOWER_BLUE]: "#6aa8ff",
  [B.FLOWER_PINK]: "#ff8fcf",
  [B.TALL_GRASS]: "#6cc24f",
  [B.FERN]: "#4fa548",
  [B.MUSHROOM]: "#ef4b4b",
  [B.REEDS]: "#9cc55a",
};

/** Representative sRGB colour per block id, 0..255 (also handy for previews). */
export const BLOCK_RGB: [number, number, number][] = BLOCKS.map((d) => {
  const hex = HEX[d.id] ?? "#ff00ff";
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
});

const { GRASS, LEAVES, WATER, TALL_GRASS, FERN } = B;
const hash = hash3;
const sx = SX,
  sy = SY,
  sz = SZ;

// 0 = air, 1 = solid top, 2 = see-through accent (flowers), 3 = post.
const KIND = new Uint8Array(256);
for (const d of BLOCKS)
  KIND[d.id] =
    d.shape === "air"
      ? 0
      : d.shape === "cross"
        ? 2
        : d.shape === "post"
          ? 3
          : 1;

export type ColumnScan = {
  /** iy of the highest solid (non cross/post) block per column. */
  solid: Int16Array;
  /** iy of the highest non-air block of any shape, or -1. */
  any: Int16Array;
  /** Highest flower/grass/post above the solid top, or -1. */
  accent: Int16Array;
};

/**
 * One top-down pass over the grid shared by the minimap and water lookup.
 * Layer by layer keeps memory access sequential; empty sky layers are skipped.
 */
export function scanColumns(data: Uint8Array): ColumnScan {
  const layer = sx * sz;
  const solid = new Int16Array(layer).fill(-1);
  const any = new Int16Array(layer).fill(-1);
  const accent = new Int16Array(layer).fill(-1);
  let start = sy - 1;
  while (start > 0) {
    const base = start * layer;
    let used = false;
    for (let c = 0; c < layer && !used; c++) used = data[base + c] !== 0;
    if (used) break;
    start--;
  }
  for (let iy = start; iy >= 0; iy--) {
    const base = iy * layer;
    for (let c = 0; c < layer; c++) {
      if (solid[c] >= 0) continue;
      const id = data[base + c];
      const kind = KIND[id];
      if (kind !== 0 && any[c] < 0) any[c] = iy;
      if (kind === 1 || iy === 0) solid[c] = iy;
      else if (kind >= 2 && accent[c] < 0) accent[c] = id;
    }
  }
  return { solid, any, accent };
}

export function buildMinimap(g: Gen, scan: ColumnScan): MinimapImage {
  const data = g.grid.data;
  const layer = sx * sz;
  const height = scan.solid;
  const accents = scan.accent;
  const colour = new Float32Array(sx * sz * 3);
  const grass0 = [0x7c, 0xcf, 0x5a],
    grass1 = [0x5f, 0xb5, 0x48];
  for (let iz = 0; iz < sz; iz++)
    for (let ix = 0; ix < sx; ix++) {
      const c = ix + iz * sx;
      const iy = height[c];
      const accent = accents[c];
      const id = data[c + iy * layer];
      const rgb = BLOCK_RGB[id];
      let r = rgb[0],
        gg = rgb[1],
        b = rgb[2];
      if (id === GRASS || id === LEAVES) {
        // Gentle biome variation like the tinted world.
        const t = hash(ix >> 3, iz >> 3, 5) * 0.6 + hash(ix, iz, 6) * 0.15;
        r = grass0[0] + (grass1[0] - grass0[0]) * t;
        gg = grass0[1] + (grass1[1] - grass0[1]) * t;
        b = grass0[2] + (grass1[2] - grass0[2]) * t;
        if (id === LEAVES) {
          r *= 0.72;
          gg *= 0.86;
          b *= 0.78;
        }
      }
      if (id === WATER) {
        // Deeper water (pool, mid-river) a touch darker.
        let depth = 0;
        while (depth < 4 && data[c + (iy - depth - 1) * layer] === WATER)
          depth++;
        const k = depth >= 2 ? 0.4 : 0;
        r = r + (0x2f - r) * k;
        gg = gg + (0x8f - gg) * k;
        b = b + (0xd8 - b) * k;
      }
      if (accent >= 0) {
        const a =
          KIND[accent] === 3
            ? 0.55
            : accent === TALL_GRASS || accent === FERN
              ? 0.25
              : 0.6;
        const ac = BLOCK_RGB[accent];
        r += (ac[0] - r) * a;
        gg += (ac[1] - gg) * a;
        b += (ac[2] - b) * a;
      }
      colour[c * 3] = r;
      colour[c * 3 + 1] = gg;
      colour[c * 3 + 2] = b;
    }
  const W = sx,
    H = sz;
  const rgba = new Uint8ClampedArray(W * H * 4);
  const ground = Math.round(-WORLD_BOUNDS.minY / VOXEL) - 1;
  const at = (ix: number, iz: number) =>
    height[
      Math.max(0, Math.min(sx - 1, ix)) + Math.max(0, Math.min(sz - 1, iz)) * sx
    ];
  for (let iz = 0; iz < sz; iz++)
    for (let ix = 0; ix < sx; ix++) {
      const c = ix + iz * sx;
      const h = height[c];
      // Lighter higher up, light from the north-west, darker on step edges.
      let k = 1 + Math.max(-0.12, Math.min(0.3, (h - ground) * 0.018));
      const slope =
        at(ix - 1, iz) + at(ix, iz + 1) - at(ix + 1, iz) - at(ix, iz - 1);
      k += Math.max(-0.2, Math.min(0.14, slope * 0.035));
      const drop = Math.max(
        h - at(ix - 1, iz),
        h - at(ix + 1, iz),
        h - at(ix, iz - 1),
        h - at(ix, iz + 1),
      );
      const rise = Math.max(
        at(ix - 1, iz) - h,
        at(ix + 1, iz) - h,
        at(ix, iz - 1) - h,
        at(ix, iz + 1) - h,
      );
      if (rise >= 2) k *= 0.72;
      else if (rise === 1) k *= 0.88;
      else if (drop >= 2) k *= 0.94;
      const px = ix,
        py = sz - 1 - iz;
      const o = (px + py * W) * 4;
      rgba[o] = colour[c * 3] * k;
      rgba[o + 1] = colour[c * 3 + 1] * k;
      rgba[o + 2] = colour[c * 3 + 2] * k;
      rgba[o + 3] = 255;
    }
  return {
    width: W,
    height: H,
    originX: WORLD_BOUNDS.minX,
    originZ: WORLD_BOUNDS.maxZ - VOXEL,
    metersPerPixel: VOXEL,
    rgba,
  };
}
