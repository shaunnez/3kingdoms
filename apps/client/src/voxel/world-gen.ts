/**
 * Deterministic voxel world: Highcross, the Briar March road, the river and
 * the hills that frame the diorama. Pure data (no Babylon/DOM); the same seed
 * always produces a byte-identical grid. Layout follows
 * docs/voxel-art-direction.md and packages/simulation/map.ts.
 */
import { B, VOXEL, WORLD_BOUNDS, blockDef } from "./blocks";
import type { VoxelWorld } from "./api";
import { GROUND, Gen, SX, SY, SZ } from "./world-gen-core";
import {
  buildBridges,
  buildLand,
  buildPaths,
  buildRiver,
  buildTerraces,
} from "./world-gen-terrain";
import {
  buildAstrolabe,
  buildGarden,
  buildHouses,
  buildPlaza,
  buildStall,
  buildTownProps,
  buildTownTrees,
  buildTownWalls,
} from "./world-gen-town";
import {
  buildDens,
  buildGate,
  buildLamps,
  buildMemorial,
  buildPipeRuin,
  buildRefuge,
  keepClear,
} from "./world-gen-wilds";
import {
  ambientAreas,
  buildForest,
  buildGroundCover,
  buildNorthHill,
  buildRocks,
  buildScenery,
  buildSouthTown,
} from "./world-gen-scenery";
import {
  buildMinimap,
  scanColumns,
  type ColumnScan,
} from "./world-gen-minimap";

export const DEFAULT_SEED = 1847;
const AIR = B.AIR,
  WATER = B.WATER,
  sx = SX,
  sy = SY,
  sz = SZ,
  minY = WORLD_BOUNDS.minY;

export function generateWorld(seed: number = DEFAULT_SEED): VoxelWorld {
  const g = new Gen(seed);
  buildLand(g);
  buildRiver(g);
  buildPlaza(g);
  buildPaths(g);
  buildBridges(g);
  keepClear(g);
  buildTerraces(g);

  buildTownWalls(g);
  buildHouses(g);
  buildStall(g);
  buildAstrolabe(g);
  buildGarden(g);
  buildTownProps(g);
  buildTownTrees(g);

  buildGate(g);
  buildPipeRuin(g);
  buildMemorial(g);
  buildRefuge(g);
  buildDens(g);
  buildLamps(g);

  buildSouthTown(g);
  buildNorthHill(g);
  buildForest(g);
  buildScenery(g);
  buildRocks(g);
  buildGroundCover(g);
  ambientAreas(g);
  g.finishStructures();

  const scan = scanColumns(g.grid.data);
  const surface = surfaceHeights(g);
  const water = waterHeights(g, scan);
  const minimap = buildMinimap(g, scan);
  const minX = WORLD_BOUNDS.minX,
    minZ = WORLD_BOUNDS.minZ;
  const sample = (arr: Float32Array | Float64Array, x: number, z: number) => {
    const ix = Math.floor((x - minX) / VOXEL),
      iz = Math.floor((z - minZ) / VOXEL);
    if (ix < 0 || iz < 0 || ix >= sx || iz >= sz) return NaN;
    return arr[ix + iz * sx];
  };
  return {
    grid: g.grid,
    owner: g.owner,
    structures: g.structures,
    lights: g.lights,
    emitters: g.emitters,
    surfaceHeight(x, z) {
      const h = sample(surface, x, z);
      return Number.isNaN(h) ? 0 : h;
    },
    waterHeight(x, z) {
      const h = sample(water, x, z);
      return Number.isNaN(h) ? null : h;
    },
    minimap,
    seed,
  };
}

/**
 * Top of the highest terrain-owned ground block whose top is ≤ 1 m. Trees,
 * props and buildings are structures, so they never lift characters.
 */
function surfaceHeights(g: Gen): Float32Array {
  const layer = sx * sz;
  const out = new Float32Array(layer).fill(NaN);
  const data = g.grid.data,
    owner = g.owner;
  const ground = new Uint8Array(256),
    slab = new Uint8Array(256);
  for (let id = 0; id < 256; id++) {
    const d = blockDef(id);
    ground[id] = d.ground && id !== AIR ? 1 : 0;
    slab[id] = d.shape === "slab" ? 1 : 0;
  }
  // From the highest row whose block top can be ≤ 1 m (y 0.5..1.0) down,
  // layer by layer so memory access stays sequential.
  for (let iy = Math.min(GROUND + 2, sy - 1); iy >= 0; iy--) {
    const base = iy * layer;
    const top = minY + iy * VOXEL;
    for (let c = 0; c < layer; c++) {
      if (out[c] === out[c]) continue;
      const id = data[base + c];
      if (!ground[id] || owner[base + c] !== 0) continue;
      out[c] = top + (slab[id] ? VOXEL / 2 : VOXEL);
    }
  }
  for (let c = 0; c < layer; c++) if (out[c] !== out[c]) out[c] = minY;
  return out;
}

/** Water surface (top of the highest block, minus 0.2 m) where it is water. */
function waterHeights(g: Gen, scan: ColumnScan): Float64Array {
  const layer = sx * sz;
  const out = new Float64Array(layer).fill(NaN);
  const data = g.grid.data;
  for (let c = 0; c < layer; c++) {
    const iy = scan.any[c];
    if (iy >= 0 && data[c + iy * layer] === WATER)
      out[c] = minY + (iy + 1) * VOXEL - 0.2;
  }
  return out;
}

let cached: VoxelWorld | null = null;
/** Cached default world, shared by the scene, minimap and ambience. */
export function getWorld(): VoxelWorld {
  return (cached ??= generateWorld());
}
