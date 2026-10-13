/**
 * Everything that frames the diorama: rooftops south of the wall, the
 * crystal cluster and abbey ruin on the north hill, the forest (playable
 * fade trees and terrain-owned scenery trees), bushes, ground cover, reeds
 * and the ambient emitters that hang off them.
 */
import { B } from "./blocks";
import {
  F,
  GROUND,
  Gen,
  SX,
  SY,
  SZ,
  cx,
  cy,
  cz,
  hash3,
  noise2,
  roadMid,
  spanZ,
  vx,
  vz,
  type Rng,
} from "./world-gen-core";
import { REFUGE } from "../../../../packages/simulation/map";
import {
  growBush,
  growTree,
  pickTreeType,
  type TreeType,
} from "./world-gen-trees";

const ROOFS: [number, number][] = [
  [B.ROOF_RED, B.ROOF_RED_SLAB],
  [B.ROOF_BLUE, B.ROOF_BLUE_SLAB],
  [B.ROOF_TEAL, B.ROOF_TEAL_SLAB],
];

/**
 * Simple cottage with a ridge along x for the town beyond the wall. Returns
 * the top of its chimney, if it has one.
 */
function cottage(
  g: Gen,
  x0: number,
  z0: number,
  w: number,
  d: number,
  rng: Rng,
): [number, number, number] | null {
  const [roof, slab] = ROOFS[Math.floor(rng() * ROOFS.length)];
  const walls = 4 + Math.floor(rng() * 2);
  const depth = (k: number) => Math.min(k + 1, d - k);
  const ridge = Math.floor(d / 2);
  for (let k = 0; k < d; k++)
    for (let i = 0; i < w; i++) {
      const edgeX = i === 0 || i === w - 1,
        edgeZ = k === 0 || k === d - 1;
      const top = walls - 1 + depth(k);
      for (let r = 0; r <= top; r++) {
        let id: number = B.PLASTER;
        if (r === 0) id = B.COBBLE;
        else if (r === walls - 1 && !edgeX) id = B.TIMBER;
        else if (edgeX && edgeZ) id = B.TIMBER;
        else if (edgeZ && r === 2 && i % 3 === 1) id = B.GLASS_LIT;
        else if (edgeX && r === walls + 1 && depth(k) >= ridge)
          id = B.GLASS_LIT;
        g.set(x0 + i, GROUND + 1 + r, z0 + k, id);
      }
    }
  for (let k = -1; k <= d; k++)
    for (let i = -1; i <= w; i++) {
      const dd = depth(k);
      const iy = GROUND + 1 + walls - 1 + dd;
      if (dd <= 0) g.set(x0 + i, GROUND + 1 + walls, z0 + k, slab);
      else g.set(x0 + i, iy, z0 + k, roof);
      if (dd === ridge && d % 2 === 0) g.set(x0 + i, iy + 1, z0 + k, slab);
    }
  if (rng() >= 0.6) return null;
  const ci = x0 + 1 + Math.floor(rng() * (w - 2));
  const ck = z0 + (rng() < 0.5 ? 1 : d - 2);
  const top = GROUND + walls + ridge + 2;
  for (let iy = GROUND + 1; iy <= top; iy++) g.set(ci, iy, ck, B.BRICK);
  return [cx(ci), cy(top) + 0.35, cz(ck)];
}

export function buildSouthTown(g: Gen): void {
  const rng = g.rng("south-town");
  const rows: [number, number][] = [
    [-47, 7],
    [-55.5, 8],
  ];
  const [sz0] = spanZ(-56, -41.5);
  // Cobbled lanes and little gardens.
  for (let iz = sz0; iz < vz(-41.5); iz++)
    for (let ix = 0; ix < SX; ix++) {
      const x = cx(ix);
      if (Math.abs(x) > 31) continue;
      const z = cz(iz);
      const lane = (z > -48.8 && z < -47) || Math.abs(x) < 1.5;
      g.surface(
        ix,
        iz,
        lane ? (hash3(ix, iz, 3) < 0.3 ? B.GRAVEL : B.COBBLE) : B.GRASS,
      );
      g.flag(ix, iz, F.BUILT);
    }
  const chimneys: [number, number, number][] = [];
  for (const [zTop, depth] of rows) {
    let x = -30 + rng() * 2;
    while (x < 28) {
      const w = 6 + Math.floor(rng() * 5);
      const ix0 = vx(x);
      if (Math.abs(x + w * 0.25) > 2.5 && cx(ix0 + w) < 31) {
        const iz0 = vz(zTop) - depth + 1 + Math.floor(rng() * 2);
        const chimney = cottage(g, ix0, iz0, w, depth, rng);
        if (chimney) chimneys.push(chimney);
      }
      x += w * 0.5 + 1 + Math.floor(rng() * 3) * 0.5;
    }
  }
  // Smoke from the two chimneys nearest the plaza's view south.
  for (const target of [-10, 10]) {
    const best = chimneys
      .filter((c) => c[2] > -50)
      .sort((a, b) => Math.abs(a[0] - target) - Math.abs(b[0] - target))[0];
    if (best) g.emit({ kind: "chimney", x: best[0], y: best[1], z: best[2] });
  }
}

/** Glowing Chaos crystals poking out of the north hill. */
function crystalCluster(
  g: Gen,
  x: number,
  z: number,
  scale: number,
  rng: Rng,
): void {
  const ix = vx(x),
    iz = vz(z);
  const base = g.above(ix, iz);
  const spikes: [number, number, number][] = [
    [0, 0, Math.round(10 * scale)],
    [1, 0, Math.round(8 * scale)],
    [0, 1, Math.round(7 * scale)],
    [1, 1, Math.round(9 * scale)],
  ];
  const count = Math.round(8 * scale);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rng() * 0.6;
    const d = 2 + Math.round(rng() * 1.6);
    spikes.push([
      Math.round(Math.cos(a) * d),
      Math.round(Math.sin(a) * d),
      Math.max(2, Math.round((2 + rng() * 4.5) * scale)),
    ]);
  }
  for (const [dx, dz, h] of spikes) {
    const b = g.above(ix + dx, iz + dz);
    const far = Math.abs(dx) + Math.abs(dz) > 2;
    for (let k = 0; k < h; k++) {
      // Outer spikes are two voxels thick at the root and lean outward.
      const lean = far && k > h * 0.55 ? 1 : 0;
      const ox = Math.sign(dx) * lean,
        oz = Math.sign(dz) * lean;
      g.set(ix + dx + ox, b + k, iz + dz + oz, B.CRYSTAL);
      if (far && k < h * 0.4)
        g.set(ix + dx - Math.sign(dx), b + k, iz + dz, B.CRYSTAL);
    }
    g.setIfAir(ix + dx + Math.sign(dx || 1), b, iz + dz, B.STONE_DARK);
  }
  g.light(
    cx(ix) + 0.25,
    cy(base + 4),
    cz(iz) + 0.25,
    "crystal",
    "#ff6bd6",
    Math.min(1, scale),
  );
  const clear = Math.round(10 * Math.max(0.6, scale));
  for (let dz = -clear; dz <= clear; dz++)
    for (let dx = -clear; dx <= clear; dx++)
      g.flag(ix + dx, iz + dz, F.BUILT | F.KEEP);
}

/** Broken round tower and a gothic window wall: a hint of the Hollow Abbey. */
function abbeyRuin(g: Gen, x: number, z: number): void {
  const ix = vx(x),
    iz = vz(z);
  const base = g.above(ix, iz);
  const R = 4.6;
  for (let dz = -6; dz <= 6; dz++)
    for (let dx = -6; dx <= 6; dx++) {
      const d = Math.hypot(dx, dz);
      // Solid foundation down into the slope.
      if (d <= R + 0.5)
        for (let iy = base - 4; iy < base; iy++)
          g.set(ix + dx, iy, iz + dz, B.COBBLE);
      if (d > R + 0.5 || d < R - 0.9) continue;
      const a = Math.atan2(dz, dx);
      const top =
        16 + Math.round(Math.sin(a * 3 + 1) * 4 + Math.cos(a * 5) * 2);
      for (let k = 0; k < top; k++) {
        const window = (k === 9 || k === 10) && Math.abs(Math.sin(a * 2)) < 0.3;
        if (window) continue;
        const h = hash3(ix + dx, k, iz + dz);
        const id =
          k < 2
            ? B.COBBLE
            : h < 0.3
              ? B.MOSSY_BRICK
              : h < 0.38
                ? B.STONE_DARK
                : B.STONE_BRICK;
        g.set(ix + dx, base + k, iz + dz, id);
      }
    }
  // Wall with a pointed window running west from the tower.
  for (let dx = -16; dx <= -5; dx++) {
    const t = -dx - 5;
    const top =
      base + 13 - Math.floor(t * 0.6) - (hash3(dx, 1, 2) < 0.4 ? 1 : 0);
    const wx = dx + 10.5;
    for (const dz of [0, 1]) {
      const from = g.above(ix + dx, iz + dz) - 1;
      for (let iy = from; iy < top; iy++) {
        const k = iy - base;
        if (Math.abs(wx) < 2 && k >= 3 && k < 9 + (2 - Math.abs(wx)) * 1.5)
          continue;
        const h = hash3(ix + dx, iy, iz + dz);
        g.set(ix + dx, iy, iz + dz, h < 0.3 ? B.MOSSY_BRICK : B.STONE_BRICK);
      }
    }
  }
  for (let dz = -10; dz <= 10; dz++)
    for (let dx = -20; dx <= 10; dx++)
      g.flag(ix + dx, iz + dz, F.BUILT | F.KEEP);
}

export function buildNorthHill(g: Gen): void {
  const rng = g.rng("north");
  crystalCluster(g, -9, 68.5, 1, rng);
  crystalCluster(g, -15, 72.5, 0.6, rng);
  crystalCluster(g, 31, 64, 0.55, rng);
  abbeyRuin(g, 11, 70);
}

/** Old-layout forest: 78 seeded candidates, each kept tree is a fade structure. */
export function buildForest(g: Gen): void {
  const rng = g.rng("forest");
  let n = 0;
  for (let i = 0; i < 78; i++) {
    const side = rng() < 0.5 ? -1 : 1;
    const x = side * (8 + rng() * 11),
      z = 7 + rng() * 52;
    const size = rng(),
      roll = rng();
    if (z > 15 && z < 25) continue;
    if (Math.hypot(x - REFUGE.x, z - REFUGE.z) < 6) continue;
    if (x < -9 && z > 26 && z < 37) continue;
    // Keep canopies off the landmarks they would hide.
    if (x < -7 && z > 24.5 && z < 38.5) continue;
    if (Math.hypot(x - 14.25, z - 50.5) < 5) continue;
    const ix = vx(x),
      iz = vz(z);
    if (g.has(ix, iz, F.KEEP | F.BUILT | F.PATH | F.TRAIL | F.BRIDGE | F.WATER))
      continue;
    if (g.get(ix, g.above(ix, iz), iz) !== B.AIR) continue;
    const type = pickTreeType(roll, 0.05);
    g.begin(`tree ${++n}`, "tree", true);
    const info = growTree(g, ix, iz, type, size, rng);
    g.end();
    if (!info) continue;
    flagTrunk(g, ix, iz);
    treeEmitters(g, info);
  }
  // Low bushes giving the road an authored edge.
  const brng = g.rng("bushes");
  for (let z = 7; z < 59; z += 3) {
    if (z > 15 && z < 26) continue;
    for (const side of [-1, 1]) {
      const x = roadMid(z) + side * (6.4 + brng() * 1.8);
      const bz = z + (brng() - 0.5) * 1.5;
      const ix = vx(x),
        iz = vz(bz);
      if (Math.hypot(x - REFUGE.x, bz - REFUGE.z) < 6) continue;
      if (
        g.has(
          ix,
          iz,
          F.KEEP | F.BUILT | F.PATH | F.TRAIL | F.BRIDGE | F.WATER | F.BANK,
        )
      )
        continue;
      growBush(g, ix, iz, brng);
    }
  }
}

function flagTrunk(g: Gen, ix: number, iz: number): void {
  for (let dz = -1; dz <= 1; dz++)
    for (let dx = -1; dx <= 1; dx++) g.flag(ix + dx, iz + dz, F.BUILT);
}

function treeEmitters(
  g: Gen,
  info: { type: TreeType; x: number; y: number; z: number; r: number },
): void {
  if (info.type === "cherry")
    g.emit({
      kind: "petals",
      x: info.x,
      y: info.y,
      z: info.z,
      rx: info.r,
      rz: info.r,
      color: "#ffaed1",
    });
  else if (info.type === "autumn")
    g.emit({
      kind: "leaves",
      x: info.x,
      y: info.y,
      z: info.z,
      rx: info.r,
      rz: info.r,
      color: "#ff9f43",
    });
  else if (info.type === "golden")
    g.emit({
      kind: "leaves",
      x: info.x,
      y: info.y,
      z: info.z,
      rx: info.r,
      rz: info.r,
      color: "#ffd45e",
    });
}

/** Dense terrain-owned forest on the hills around the map. */
export function buildScenery(g: Gen): void {
  const rng = g.rng("scenery");
  const seed = g.noiseSeed("groves");
  const CELL = 3.4;
  for (let z = -56 + CELL / 2; z < 76; z += CELL)
    for (let x = -40 + CELL / 2; x < 40; x += CELL) {
      const px = x + (rng() - 0.5) * CELL * 0.8,
        pz = z + (rng() - 0.5) * CELL * 0.8;
      const roll = rng(),
        size = rng(),
        typeRoll = rng();
      if (Math.abs(px) < 22.2 && pz > -42 && pz < 62.2) continue;
      if (pz < -41 && Math.abs(px) < 31.5) continue;
      if (Math.abs(pz - 20) < 4.6) continue;
      if (px < -27 && px > -34 && Math.abs(pz - 20) < 7) continue;
      const ix = vx(px),
        iz = vz(pz);
      if (ix < 1 || iz < 1 || ix >= SX - 1 || iz >= SZ - 1) continue;
      if (g.has(ix, iz, F.KEEP | F.BUILT | F.WATER | F.BANK)) continue;
      const top = g.top[g.col(ix, iz)];
      if (g.get(ix, top, iz) !== B.GRASS) continue;
      const density = 0.62 + (noise2(px * 0.08, pz * 0.08, seed) - 0.5) * 0.7;
      if (roll > density) continue;
      const height = (top - GROUND) * 0.5;
      const grove = noise2(px * 0.05 + 40, pz * 0.05, seed + 1);
      let type: TreeType = pickTreeType(typeRoll, 0.02);
      if (type === "cherry" && size < 0.6) type = "oak";
      if (height >= 6 && typeRoll < 0.55) type = "spruce";
      else if (grove > 0.76) type = typeRoll < 0.55 ? "cherry" : "birch";
      else if (grove < 0.22) type = typeRoll < 0.6 ? "autumn" : "oak";
      if (top + 18 >= SY) continue;
      growTree(g, ix, iz, type, size, rng);
    }
}

/** A sprinkle of small mossy rocks in the meadows (props, ≤ 0.5 m). */
export function buildRocks(g: Gen): void {
  const rng = g.rng("rocks");
  const blockers =
    F.PATH | F.TRAIL | F.BRIDGE | F.WATER | F.BANK | F.KEEP | F.BUILT | F.PLAZA;
  g.begin("meadow rocks", "prop", false);
  for (let i = 0; i < 70; i++) {
    const x = (rng() * 2 - 1) * 19.5,
      z = 1 + rng() * 58.5;
    const kind = rng(),
      spread = rng();
    if (Math.abs(x - roadMid(z)) < 4 || (z > 15.5 && z < 24.5)) continue;
    if (Math.hypot(x - REFUGE.x, z - REFUGE.z) < 5.5) continue;
    const ix = vx(x),
      iz = vz(z);
    if (g.has(ix, iz, blockers)) continue;
    const id =
      kind < 0.45
        ? B.COBBLE_SLAB
        : kind < 0.75
          ? B.STONE_DARK
          : kind < 0.9
            ? B.MOSSY_BRICK
            : B.STONE;
    g.set(ix, g.above(ix, iz), iz, id);
    if (spread < 0.35 && !g.has(ix + 1, iz, blockers))
      g.set(ix + 1, g.above(ix + 1, iz), iz, B.COBBLE_SLAB);
    g.flag(ix, iz, F.BUILT);
  }
  g.end();
}

const FLOWERS = [B.FLOWER_RED, B.FLOWER_YELLOW, B.FLOWER_BLUE, B.FLOWER_PINK];
// Short local aliases for the per-column loop.
const { AIR, GRASS, REEDS, MUSHROOM, FERN, TALL_GRASS } = B;
const hash = hash3,
  vnoise = noise2;

/** Grass tufts, flower clusters, ferns, mushrooms and riverbank reeds. */
export function buildGroundCover(g: Gen): {
  meadow: number;
  covered: number;
  playMeadow: number;
  playCovered: number;
} {
  const seed = g.noiseSeed("cover");
  const blockers =
    F.PATH | F.TRAIL | F.BRIDGE | F.WATER | F.KEEP | F.BUILT | F.PLAZA;
  let meadow = 0,
    covered = 0,
    playMeadow = 0,
    playCovered = 0;
  const flowerCells = new Map<number, number>();
  for (let iz = 1; iz < SZ - 1; iz++) {
    const z = cz(iz);
    for (let ix = 1; ix < SX - 1; ix++) {
      const c = g.col(ix, iz);
      const flags = g.flags[c];
      const x = cx(ix);
      if (flags & F.BANK) {
        if (!(flags & F.BRIDGE) && hash(ix, iz, seed) < 0.42)
          g.setIfAir(ix, GROUND + 1, iz, REEDS);
        continue;
      }
      if (flags & blockers) continue;
      const top = g.top[c];
      if (g.get(ix, top, iz) !== GRASS || g.get(ix, top + 1, iz) !== AIR)
        continue;
      const play = Math.abs(x) < 21 && z > -41 && z < 61;
      if (play && z > -0.5 && z < 60.5 && Math.abs(x - roadMid(z)) < 2.8)
        continue;
      meadow++;
      if (play) playMeadow++;
      const cluster = vnoise(x * 0.22, z * 0.22, seed);
      let p = 0.07 + Math.max(0, cluster - 0.5) * 1.1;
      if (!play) p *= 0.55;
      const h = hash(ix, iz, seed + 1);
      if (h >= p) continue;
      const shade = shaded(g, ix, top, iz);
      let id: number;
      const pick = hash(ix, iz, seed + 2);
      if (shade) id = pick < 0.16 ? MUSHROOM : pick < 0.62 ? FERN : TALL_GRASS;
      else if (cluster > 0.62 && pick < 0.75) {
        const hue = vnoise(x * 0.07 + 9, z * 0.07, seed + 3);
        id = FLOWERS[Math.min(3, Math.floor(hue * 4.4 + pick * 0.8) % 4)];
        if (play) {
          const key = Math.floor((x + 40) / 8) + Math.floor((z + 56) / 8) * 16;
          flowerCells.set(key, (flowerCells.get(key) ?? 0) + 1);
        }
      } else id = pick < 0.85 ? TALL_GRASS : FERN;
      g.set(ix, top + 1, iz, id);
      covered++;
      if (play) playCovered++;
    }
  }
  // Butterflies over the richest flower patches in the playable meadows.
  const best = [...flowerCells.entries()].sort(
    (a, b) => b[1] - a[1] || a[0] - b[0],
  );
  const chosen: [number, number][] = [];
  for (const [key, count] of best) {
    if (chosen.length >= 6 || count < 4) break;
    const x = (key % 16) * 8 - 40 + 4,
      z = Math.floor(key / 16) * 8 - 56 + 4;
    if (chosen.some(([a, b]) => Math.hypot(a - x, b - z) < 12)) continue;
    chosen.push([x, z]);
    g.emit({ kind: "butterflies", x, y: 0.9, z, rx: 4, rz: 4 });
  }
  return { meadow, covered, playMeadow, playCovered };
}

function shaded(g: Gen, ix: number, top: number, iz: number): boolean {
  for (let iy = top + 3; iy < Math.min(SY, top + 14); iy++) {
    const id = g.get(ix, iy, iz);
    if (
      id === B.LEAVES ||
      id === B.LEAVES_DARK ||
      id === B.LEAVES_CHERRY ||
      id === B.LEAVES_AUTUMN ||
      id === B.LEAVES_GOLD
    )
      return true;
  }
  return false;
}

export function ambientAreas(g: Gen): void {
  const fireflies: [number, number, number, number][] = [
    [-13, 11, 5, 3.5],
    [13, 10.5, 4.5, 3],
    [-14, 46, 5, 6],
    [-11, 55, 5, 4],
    [6, 52, 4, 4],
    [16, 31, 3.5, 4],
    [-17.5, -27, 2, 7],
    [17.5, -32, 2, 6],
    [-25, 15.6, 4, 1],
  ];
  for (const [x, z, rx, rz] of fireflies)
    g.emit({ kind: "fireflies", x, y: 1.1, z, rx, rz, color: "#fff27a" });
}
