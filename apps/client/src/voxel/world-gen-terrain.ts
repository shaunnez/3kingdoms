/**
 * Landform: flat playable valley, terraced hills beyond the map, the river
 * with its waterfall, the road, side trails, bridges and meadow terraces.
 */
import { B } from "./blocks";
import {
  F,
  GROUND,
  Gen,
  SX,
  SZ,
  cx,
  cz,
  fbm,
  hash3,
  noise2,
  roadMid,
  smoothstep,
  spanX,
  spanZ,
  vx,
} from "./world-gen-core";
import { NPCS, REFUGE } from "../../../../packages/simulation/map";

// Short local aliases for the per-voxel fill.
const { GRASS, DIRT, STONE, STONE_DARK, MOSS, COBBLE } = B;
const hash = hash3,
  vnoise = noise2;

export const RIVER = { z0: 17, z1: 23 };
/** West cliff edge the waterfall pours over. */
export const FALL_X = -30.5;
/** Plateau top above the waterfall, in voxels above the ground. */
const PLATEAU = 12;
export const DENS: readonly [number, number][] = [
  [1, 11],
  [-2, 29],
  [7, 39],
];
export const BRIDGES = [
  { x0: -4, x1: 4 },
  { x0: 12.5, x1: 17.5 },
];
export const BRIDGE_Z = { z0: 16, z1: 24 };

const inPlay = (x: number, z: number) =>
  Math.abs(x) < 21.5 && z > -41.5 && z < 61.5;

/** Hill height in metres outside the playable frame (0 inside). */
function hillHeight(x: number, z: number, seed: number): number {
  if (inPlay(x, z)) return 0;
  const south = smoothstep(-40, -46, z);
  const dx = Math.abs(x) - 21.5 - south * 8.5;
  const dn = z - 61.5;
  const d = Math.max(dx, dn);
  if (d <= 0) return 0;
  const n = fbm(x * 0.06, z * 0.06, seed);
  const north = smoothstep(0, 4, dn) * (1 - smoothstep(21.5, 26, Math.abs(x)));
  let h = 0.9 + d * (0.42 + north * 0.14) + (n - 0.45) * 4.2;
  // The river valley stays open from the waterfall to the east edge.
  const riverDist = Math.abs(z - 20);
  if (x >= FALL_X) h *= smoothstep(4.2, 10.5, riverDist);
  else if (riverDist < 4.5) return PLATEAU / 2;
  else if (riverDist < 12) h = Math.max(h, PLATEAU / 2);
  h = Math.min(10, Math.max(0, h));
  // Mixed riser heights read as terraces and small cliffs.
  const step = noise2(x * 0.045, z * 0.045, seed + 7) > 0.58 ? 2 : 1;
  return Math.floor(h / step) * step;
}

function strata(ix: number, iy: number, iz: number, t: number, wobble: number) {
  const band = (iy + wobble) % 4;
  const h = hash(ix, iy, iz + 31);
  if (iy >= t - 3 && h < 0.22) return MOSS;
  if (band === 0) return STONE_DARK;
  if (h > 0.93) return COBBLE;
  return STONE;
}

/** Base columns for the whole grid. */
export function buildLand(g: Gen): void {
  const seed = g.noiseSeed("hills"),
    strataSeed = g.noiseSeed("strata");
  const data = g.grid.data;
  const sx = SX,
    sz = SZ,
    ground = GROUND,
    layer = sx * sz;
  for (let iz = 0; iz < sz; iz++) {
    const z = cz(iz);
    for (let ix = 0; ix < sx; ix++) {
      const x = cx(ix);
      const h = hillHeight(x, z, seed);
      const t = ground + Math.round(h * 2);
      const c = ix + iz * sx;
      g.top[c] = t;
      const hill = t > ground;
      const wobble = hill
        ? Math.floor(vnoise(ix * 0.09, iz * 0.09, strataSeed) * 3)
        : 0;
      for (let iy = 0; iy <= t; iy++) {
        let id: number;
        if (iy === t) id = GRASS;
        else if (iy >= t - (hill ? 1 : 2)) id = DIRT;
        else
          id = hill && iy > ground - 3 ? strata(ix, iy, iz, t, wobble) : STONE;
        data[c + iy * layer] = id;
      }
    }
  }
}

/** River across the world, banks, plunge pool and the west waterfall. */
export function buildRiver(g: Gen): void {
  const [z0, z1] = spanZ(RIVER.z0, RIVER.z1);
  const bedSeed = g.noiseSeed("riverbed");
  const fallIx = vx(FALL_X);
  for (let iz = z0 - 1; iz <= z1 + 1; iz++) {
    for (let ix = 0; ix < SX; ix++) {
      const c = g.col(ix, iz);
      const bank = iz < z0 || iz > z1;
      if (ix < fallIx) {
        // Plateau channel feeding the falls.
        const t = g.top[c];
        if (bank) {
          g.set(ix, t, iz, B.SAND);
          continue;
        }
        for (let iy = t + 1; iy < t + 6; iy++) g.set(ix, iy, iz, B.AIR);
        g.set(ix, t - 2, iz, B.GRAVEL);
        g.set(ix, t - 1, iz, B.WATER);
        g.set(ix, t, iz, B.WATER);
        g.top[c] = t - 2;
        g.flag(ix, iz, F.WATER);
        continue;
      }
      for (let iy = GROUND + 1; iy < GROUND + 24; iy++)
        g.set(ix, iy, iz, B.AIR);
      if (bank) {
        for (let iy = GROUND - 2; iy <= GROUND; iy++) g.set(ix, iy, iz, B.SAND);
        g.top[c] = GROUND;
        g.flag(ix, iz, F.BANK);
        continue;
      }
      const pool = ix < fallIx + 7;
      const bedY = pool ? GROUND - 3 : GROUND - 2;
      const bed =
        noise2(ix * 0.35, iz * 0.35, bedSeed) > 0.55 ? B.GRAVEL : B.SAND;
      g.set(ix, bedY, iz, bed);
      for (let iy = bedY + 1; iy <= GROUND; iy++) g.set(ix, iy, iz, B.WATER);
      g.top[c] = bedY;
      g.flag(ix, iz, F.WATER);
    }
  }
  // A one-voxel sheet of falling water in front of the cliff face.
  const plateauTop = GROUND + PLATEAU;
  for (let iz = z0; iz <= z1; iz++)
    for (let iy = GROUND + 1; iy <= plateauTop; iy++)
      g.set(fallIx, iy, iz, B.WATER);
  // Mossy, darker rock framing the falls.
  for (let iz = z0 - 3; iz <= z1 + 3; iz++)
    for (let iy = GROUND - 2; iy < plateauTop - 1; iy++) {
      const id = g.get(fallIx - 1, iy, iz);
      if (id === B.STONE || id === B.COBBLE)
        g.set(
          fallIx - 1,
          iy,
          iz,
          hash3(iy, iz, 77) < 0.35 ? B.MOSS : B.STONE_DARK,
        );
    }
  const midZ = (RIVER.z0 + RIVER.z1) / 2;
  g.emit({
    kind: "waterfall",
    x: FALL_X + 0.4,
    y: 0.2,
    z: midZ,
    rx: 0.4,
    rz: 2.8,
  });
  g.emit({ kind: "splash", x: FALL_X + 1.4, y: 0, z: midZ, rx: 1.4, rz: 2.8 });
  for (const [x, z] of [
    [-24, 19.4],
    [-11, 20.6],
    [8.5, 19.6],
    [26, 20.4],
    [35, 19.2],
  ])
    g.emit({ kind: "fish", x, y: -0.2, z, rx: 3, rz: 1.8 });
}

/** Road from the safe line to the north edge, plus the side trail to the refuge. */
export function buildPaths(g: Gen): void {
  const seed = g.noiseSeed("road");
  const [rz0, rz1] = spanZ(0, 60);
  const [bz0, bz1] = spanZ(BRIDGE_Z.z0, BRIDGE_Z.z1);
  for (let iz = rz0; iz <= rz1; iz++) {
    const z = cz(iz);
    const mid = roadMid(z);
    for (let ix = vx(mid - 4); ix <= vx(mid + 4); ix++) {
      const x = cx(ix);
      const d = Math.abs(x - mid);
      const edge = 2.8 + (noise2(x * 0.7, z * 0.7, seed) - 0.5) * 0.7;
      if (d > edge + 0.35) continue;
      g.flag(ix, iz, F.PATH);
      if (iz >= bz0 && iz <= bz1) continue;
      let id: number = B.PATH;
      if (d > edge - 0.45) id = B.GRAVEL;
      else if (noise2(x * 0.45, z * 0.45, seed + 3) > 0.66) id = B.CLAY_PATH;
      const stone = hash3(Math.floor(x / 1.5), Math.floor(z / 1.5), seed);
      if (d < edge - 0.6 && stone < 0.07 && hash3(ix, iz, seed) < 0.75)
        id = B.COBBLE;
      if (d > edge) {
        if (hash3(ix, iz, seed + 9) < 0.55) continue;
        id = B.GRAVEL;
      }
      g.surface(ix, iz, id);
    }
  }
  // Worn trail: east gap → east bridge → refuge.
  const trail: [number, number][] = [
    [16, 0],
    [16.3, 5],
    [15.5, 10.5],
    [15, 15.6],
    [15, 24.4],
    [14.6, 30],
    [14.2, 36],
    [14, 41.2],
  ];
  const [tx0, tx1] = spanX(11, 19.5);
  const [tz0, tz1] = spanZ(0, 42);
  for (let iz = tz0; iz <= tz1; iz++)
    for (let ix = tx0; ix <= tx1; ix++) {
      const x = cx(ix),
        z = cz(iz);
      if (z > BRIDGE_Z.z0 && z < BRIDGE_Z.z1) continue;
      let d = Infinity;
      for (let i = 0; i < trail.length - 1; i++)
        d = Math.min(d, segmentDistance(x, z, trail[i], trail[i + 1]));
      const r = hash3(ix, iz, seed + 21);
      if (d > 1.25 || (d > 0.8 && r < 0.6)) continue;
      g.flag(ix, iz, F.TRAIL);
      if (g.has(ix, iz, F.PATH)) continue;
      g.surface(ix, iz, r < 0.22 ? B.CLAY_PATH : B.PATH);
    }
}

function segmentDistance(
  x: number,
  z: number,
  a: [number, number],
  b: [number, number],
): number {
  const dx = b[0] - a[0],
    dz = b[1] - a[1];
  const t = Math.max(
    0,
    Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)),
  );
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
}

/** Flush plank decks with post-and-rail sides outside the walkable deck. */
export function buildBridges(g: Gen): void {
  const [z0, z1] = spanZ(BRIDGE_Z.z0, BRIDGE_Z.z1);
  const [rz0, rz1] = spanZ(RIVER.z0, RIVER.z1);
  for (const [n, b] of BRIDGES.entries()) {
    const [x0, x1] = spanX(b.x0, b.x1);
    for (let iz = z0; iz <= z1; iz++) {
      const dark = hash3(iz, n, 5) < 0.18;
      for (let ix = x0; ix <= x1; ix++) {
        const edge = ix === x0 || ix === x1;
        g.set(ix, GROUND, iz, edge || dark ? B.PLANKS_DARK : B.PLANKS);
        g.top[g.col(ix, iz)] = GROUND;
        g.flag(ix, iz, F.BRIDGE);
        if (iz >= rz0 && iz <= rz1 && edge) g.set(ix, GROUND - 1, iz, B.LOG);
      }
    }
    // Main bridge posts stand on the deck's outer planks; the east bridge's
    // stand just outside it and run down to the riverbed as piles.
    const px = n === 0 ? [x0, x1] : [x0 - 1, x1 + 1];
    for (const ix of px) {
      for (let iz = z0; iz <= z1; iz++) {
        g.flag(ix, iz, F.BRIDGE);
        g.set(ix, GROUND + 3, iz, B.PLANK_SLAB);
        const post = (iz - z0) % 5 === 0 || iz === z1;
        if (!post) continue;
        const wet = iz >= rz0 && iz <= rz1;
        const from = n === 0 ? GROUND + 1 : wet ? GROUND - 1 : GROUND + 1;
        for (let iy = from; iy <= GROUND + 2; iy++)
          g.set(ix, iy, iz, B.POST_WOOD);
      }
    }
  }
}

/** Gentle one-block grass terraces in the forest meadows. */
export function buildTerraces(g: Gen): void {
  const seed = g.noiseSeed("terrace");
  const [x0, x1] = spanX(-20, 20);
  const [z0, z1] = spanZ(9, 60);
  const w = x1 - x0 + 1,
    h = z1 - z0 + 1;
  const eligible = new Uint8Array(w * h);
  const level = new Float32Array(w * h);
  const blockers =
    F.PATH | F.TRAIL | F.BRIDGE | F.WATER | F.BANK | F.KEEP | F.BUILT;
  const near = (x: number, z: number, px: number, pz: number, r: number) =>
    (x - px) ** 2 + (z - pz) ** 2 < r * r;
  // Circles to keep clear: hound dens and NPC anchors.
  const avoid: [number, number, number][] = [
    ...DENS.map(([x, z]): [number, number, number] => [x, z, 3.8]),
    ...Object.values(NPCS).map((a): [number, number, number] => [
      a.x,
      a.z,
      2.5,
    ]),
  ];
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++) {
      const x = cx(ix),
        z = cz(iz);
      if (g.flags[g.col(ix, iz)] & blockers) continue;
      if (Math.abs(x) > 19.6 || Math.abs(x - roadMid(z)) < 5) continue;
      if (z > RIVER.z0 - 1.5 && z < RIVER.z1 + 1.5) continue;
      if (x > 11.5 && x < 18.5 && z > 14 && z < 26) continue;
      if (near(x, z, REFUGE.x, REFUGE.z, 6.5)) continue;
      if (near(x, z, -4, 34, 4.5)) continue;
      if (x > -16.8 && x < -9.2 && z > 27.2 && z < 34.8) continue;
      let blocked = false;
      for (let k = 0; k < avoid.length && !blocked; k++)
        blocked = near(x, z, avoid[k][0], avoid[k][1], avoid[k][2]);
      if (blocked) continue;
      const c = ix - x0 + (iz - z0) * w;
      eligible[c] = 1;
      level[c] = fbm(x * 0.085, z * 0.085, seed);
    }
  const mask = new Uint8Array(w * h);
  for (let c = 0; c < w * h; c++)
    mask[c] = eligible[c] && level[c] > 0.6 ? 1 : 0;
  // One majority pass rounds off single-voxel notches and nicks.
  const out = new Uint8Array(mask);
  for (let k = 1; k < h - 1; k++)
    for (let i = 1; i < w - 1; i++) {
      const c = i + k * w;
      let s = 0;
      for (let dk = -1; dk <= 1; dk++)
        for (let di = -1; di <= 1; di++) s += mask[c + di + dk * w];
      if (mask[c] && s <= 3) out[c] = 0;
      else if (!mask[c] && s >= 6 && eligible[c] && level[c] > 0.55) out[c] = 1;
    }
  for (let k = 0; k < h; k++)
    for (let i = 0; i < w; i++) {
      if (!out[i + k * w]) continue;
      const ix = x0 + i,
        iz = z0 + k;
      g.set(ix, GROUND, iz, B.DIRT);
      g.set(ix, GROUND + 1, iz, B.GRASS);
      g.top[g.col(ix, iz)] = GROUND + 1;
      g.flag(ix, iz, F.TERRACE);
    }
}
