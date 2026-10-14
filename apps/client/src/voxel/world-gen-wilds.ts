/**
 * Landmarks north of the safe line: the towered gate, the copper pipe ruin,
 * the memorial, the refuge camp, hound dens and the lantern route.
 */
import { B } from "./blocks";
import {
  F,
  Gen,
  cx,
  cy,
  cz,
  hash3,
  noise2,
  row,
  spanX,
  spanZ,
  vx,
  vz,
} from "./world-gen-core";
import { NPCS, OBSTACLES, REFUGE } from "../../../../packages/simulation/map";
import { DENS } from "./world-gen-terrain";
import { lanternPost } from "./world-gen-town";

export const LAMPS: readonly [number, number][] = [
  [-9, -6],
  [9, -6],
  [-9, -16],
  [-9, -29],
  [9, -29],
  [-7, -0.6],
  [7, -0.6],
  [-6, 11],
  [6, 14],
  [-4, 16.4],
  [4, 23.7],
  [-5, 27],
  [6, 31],
  [11, 44],
  [17.7, 45],
  [10.3, 45],
];
const REFUGE_PILLARS: readonly [number, number][] = [
  [REFUGE.x + 3.7, REFUGE.z],
  [REFUGE.x - 3.7, REFUGE.z],
];

const stone = (ix: number, iy: number, iz: number, moss: number) =>
  hash3(ix, iy, iz + 808) < moss ? B.MOSSY_BRICK : B.STONE_BRICK;

function gateTower(g: Gen, index: 4 | 5): void {
  const o = OBSTACLES[index];
  const side = Math.sign(o.x);
  const [x0, x1] = spanX(o.x - o.w / 2, o.x + o.w / 2);
  const [z0, z1] = spanZ(o.z - o.d / 2, o.z + o.d / 2);
  const inner = side > 0 ? x0 : x1,
    outer = side > 0 ? x1 : x0;
  const TOP = 15;
  g.begin(`gate tower ${side < 0 ? "west" : "east"}`, "tower", true);
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++)
      for (let r = 0; r <= TOP; r++) {
        let id = stone(ix, r, iz, 0.26 - r * 0.014);
        if (r === 0 || r === 6) id = B.STONE_BRICK;
        g.set(ix, row(r), iz, id);
      }
  // Window slits: a pair high on the town side, singles elsewhere.
  for (const r of [9, 10]) {
    g.set(x0 + 1, row(r + 4), z0, B.STONE_DARK);
    g.set(x0 + 2, row(r + 4), z0, B.STONE_DARK);
    g.set(inner, row(r), z0 + 1, B.STONE_DARK);
    g.set(inner, row(r), z1 - 1, B.STONE_DARK);
    g.set(outer, row(r), z0 + 2, B.STONE_DARK);
    g.set(x0 + 1, row(r), z1, B.STONE_DARK);
    g.set(x1 - 1, row(r), z1, B.STONE_DARK);
  }
  // Corbelled crown (above 7 m) with checkered merlons.
  for (let iz = z0 - 1; iz <= z1 + 1; iz++)
    for (let ix = x0 - 1; ix <= x1 + 1; ix++) {
      const rim = ix < x0 || ix > x1 || iz < z0 || iz > z1;
      if (rim) g.set(ix, row(TOP), iz, B.STONE_BRICK);
      if (rim && (ix + iz) % 2 === 0) {
        g.set(ix, row(TOP + 1), iz, B.STONE_BRICK);
        g.set(ix, row(TOP + 2), iz, B.STONE_SLAB);
      }
    }
  g.set(inner, row(TOP + 1), z0 + 2, B.POST_WOOD);
  g.set(inner, row(TOP + 2), z0 + 2, B.POST_WOOD);
  g.set(inner, row(TOP + 3), z0 + 2, B.WOOL_RED);
  // Banner on the town-facing side, hung off the wall.
  const bx = [x0 + 1, x0 + 2];
  for (let r = 7; r <= 12; r++)
    for (const ix of bx) {
      const edge = r === 12 || r === 9;
      if (r === 7 && ix === bx[side > 0 ? 1 : 0]) continue;
      g.set(ix, row(r), z0 - 1, edge ? B.WOOL_YELLOW : B.WOOL_RED);
    }
  // Torch lantern by the road.
  g.set(inner, row(5), z0 - 1, B.LANTERN);
  g.end();
  g.light(cx(inner), cy(row(5)), cz(z0 - 1), "lantern", "#ffb35c", 0.8);
  for (let iz = z0 - 1; iz <= z1 + 1; iz++)
    for (let ix = x0 - 1; ix <= x1 + 1; ix++) g.flag(ix, iz, F.BUILT);
}

function gateArch(g: Gen): void {
  const [z0, z1] = spanZ(3.2, 6.8);
  const [ax0, ax1] = spanX(-4.5, 4.5);
  g.begin("gate arch", "arch", true);
  for (let r = 7; r <= 18; r++) {
    const y = (r + 0.5) * 0.5;
    for (let ix = ax0; ix <= ax1; ix++) {
      const x = cx(ix);
      const d = Math.hypot(x, y - 3.5);
      if (d < 4.1 || d > 5.15 || y < 3.5) continue;
      const seg = Math.floor(Math.atan2(y - 3.5, x) / (Math.PI / 20));
      for (let iz = z0; iz <= z1; iz++) {
        const face = iz === z0 || iz === z1;
        let id = seg % 5 === 0 ? B.MARBLE : stone(ix, r, iz, 0.1);
        if (Math.abs(x) < 0.5 && d > 4.6 && face) id = B.GOLD;
        g.set(ix, row(r), iz, id);
      }
    }
  }
  g.end();
}

function gateWall(g: Gen, index: 6 | 7, name: string): void {
  const o = OBSTACLES[index];
  let [x0, x1] = spanX(o.x - o.w / 2, o.x + o.w / 2);
  const [z0, z1] = spanZ(o.z - o.d / 2, o.z + o.d / 2);
  // The towers own the overlapping end of each wall box.
  if (o.x < 0) x1 = vx(-6.5) - 1;
  else x0 = vx(6.5);
  const gapEnd = o.x < 0 ? x0 : x1;
  g.begin(name, "wall", true);
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++) {
      const pillar = Math.abs(ix - gapEnd) <= 1;
      const h = pillar ? 8 : 7;
      for (let r = 0; r < h; r++) g.set(ix, row(r), iz, stone(ix, r, iz, 0.22));
      const merlon = pillar ? (ix + iz) % 2 === 0 : ((ix - x0) >> 1) % 2 === 0;
      if (merlon) g.set(ix, row(h), iz, B.STONE_BRICK);
    }
  g.end();
  for (let iz = z0 - 1; iz <= z1 + 1; iz++)
    for (let ix = x0; ix <= x1; ix++) g.flag(ix, iz, F.BUILT);
}

export function buildGate(g: Gen): void {
  gateTower(g, 4);
  gateTower(g, 5);
  gateArch(g);
  gateWall(g, 6, "gate wall west");
  gateWall(g, 7, "gate wall east");
}

/** Oxidised copper pipe half-sunk in the meadow, inside its 6×6 m box. */
export function buildPipeRuin(g: Gen): void {
  const o = OBSTACLES[8];
  const [x0, x1] = spanX(o.x - o.w / 2, o.x + o.w / 2);
  const [z0, z1] = spanZ(o.z - o.d / 2, o.z + o.d / 2);
  const seed = g.noiseSeed("pipe");
  const PX = o.x,
    PY = 0.95;
  const pz0 = vz(28.5),
    pz1 = vz(33.4);
  g.begin("pipe ruin", "ruin", true);
  for (let iz = pz0; iz <= pz1; iz++) {
    // A flange at the south end and one riveted band round the middle.
    const band = iz === pz0 || iz === vz(31.25);
    for (let r = -1; r <= 5; r++) {
      const y = (r + 0.5) * 0.5;
      for (let ix = vx(PX - 1.8); ix <= vx(PX + 1.8); ix++) {
        const dx = cx(ix) - PX,
          dy = y - PY;
        const d = Math.hypot(dx, dy);
        if (d < 0.62 || d > (band ? 1.45 : 1.2) || y < 0) continue;
        // Jagged, broken north end.
        const a = Math.atan2(dy, dx);
        if (
          iz >= pz1 - 1 &&
          hash3(ix, r, 5) < (iz === pz1 ? 0.65 : 0.3) &&
          a > -0.4
        )
          continue;
        let id: number = B.COPPER;
        if (band && d > 1.2) id = B.IRON;
        else if (noise2(ix * 0.7 + r * 0.4, iz * 0.5, seed) + dy * 0.22 > 0.66)
          id = B.COPPER_OXIDIZED;
        if (!band && dy > 0.75 && hash3(ix, r, iz) < 0.12) id = B.MOSS;
        g.set(ix, row(r), iz, id);
      }
    }
  }
  // Ruined wall along the east edge of the box.
  const wx = x1;
  for (let iz = z0; iz <= z1; iz++) {
    const h = 1 + Math.floor(noise2(iz * 0.45, 3.1, seed + 1) * 4.2);
    for (let r = 0; r < h; r++) {
      const roll = hash3(wx, r, iz + seed);
      g.set(
        wx,
        row(r),
        iz,
        roll < 0.55 ? B.MOSSY_BRICK : roll < 0.85 ? B.STONE_BRICK : B.COBBLE,
      );
    }
  }
  // Fallen rubble.
  for (const [x, z] of [
    [-10.75, 28.75],
    [-11.25, 33.25],
    [-15.25, 33.75],
    [-15.75, 28.25],
  ])
    g.setM(x, 0.25, z, hash3(vx(x), 0, vz(z)) < 0.5 ? B.MOSSY_BRICK : B.COBBLE);
  g.end();
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++) g.flag(ix, iz, F.BUILT);
  g.emit({ kind: "steam", x: PX, y: PY + 0.2, z: 28.3 });
  g.emit({ kind: "steam", x: PX + 0.3, y: PY + 0.6, z: 33.6 });
  g.emit({
    kind: "sparks",
    x: PX - 0.5,
    y: PY + 0.9,
    z: 33.5,
    color: "#5ef2ff",
  });
  g.light(PX, 1.4, 31, "magic", "#5ef2ff", 0.6);
}

export function buildMemorial(g: Gen): void {
  const iz = vz(34.75);
  const left = vx(-6.25),
    right = vx(-1.75);
  g.begin("memorial arch", "arch", true);
  for (const ix of [left, right])
    for (let r = 0; r <= 4; r++)
      g.set(ix, row(r), iz, stone(ix, r, iz, r < 2 ? 0.5 : 0.15));
  for (const ix of [left + 1, right - 1]) g.set(ix, row(5), iz, B.STONE_BRICK);
  for (const ix of [left, right]) g.set(ix, row(5), iz, B.MOSSY_BRICK);
  for (let ix = left; ix <= right; ix++) {
    const key = ix === left + 4 || ix === left + 5;
    g.set(ix, row(6), iz, key ? B.MARBLE : stone(ix, 6, iz, 0.3));
  }
  g.set(left + 4, row(7), iz, B.STONE_SLAB);
  g.set(left + 5, row(7), iz, B.STONE_SLAB);
  g.end();

  g.begin("epitaph stone", "landmark", false);
  const ez = vz(33.75);
  for (const ix of [vx(-4.25), vx(-3.75)]) {
    g.set(ix, row(0), ez, B.MARBLE);
    g.set(ix, row(1), ez, B.RUNE);
    g.set(ix, row(2), ez, B.STONE_SLAB);
  }
  g.end();
  // A little offering of flowers.
  g.set(vx(-4.75), row(0), ez - 1, B.FLOWER_BLUE);
  g.set(vx(-3.25), row(0), ez - 1, B.FLOWER_PINK);
  g.light(-4, 0.8, 33.4, "rune", "#5ef2ff", 0.7);
  for (let z = 33; z <= 35.5; z += 0.5)
    for (let x = -7; x <= -1; x += 0.5) g.flag(vx(x), vz(z), F.KEEP);
}

export function buildRefuge(g: Gen): void {
  const { x: rx, z: rz } = REFUGE;
  const [x0, x1] = spanX(rx - 4.2, rx + 4.2);
  const [z0, z1] = spanZ(rz - 4.2, rz + 4.2);
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++) {
      const dx = cx(ix) - rx,
        dz = cz(iz) - rz;
      const d = Math.hypot(dx, dz);
      if (d > 4.1) continue;
      let id: number = B.MARBLE;
      if (d >= 3.6) id = B.GOLD;
      else if (d > 2.8 && d < 3.25) id = B.PAVING;
      else if (d < 0.75) id = B.PAVING;
      g.surface(ix, iz, id);
      g.flag(ix, iz, F.KEEP | F.BUILT);
    }
  g.begin("refuge pillars", "prop", false);
  for (const [px, pz] of REFUGE_PILLARS) {
    const ix = vx(px),
      iz = vz(pz);
    for (let r = 0; r < 6; r++)
      g.set(ix, row(r), iz, r === 0 ? B.MARBLE : stone(ix, r, iz, 0.12));
    g.set(ix, row(6), iz, B.LANTERN);
    g.set(ix, row(7), iz, B.STONE_SLAB);
    g.light(cx(ix), cy(row(6)), cz(iz), "lantern", "#ffb35c", 0.85);
  }
  g.end();

  // Cosy A-frame tent just north of the ring, opening toward the fire.
  g.begin("refuge tent", "prop", true);
  const tx = vx(14.25),
    [tz0, tz1] = spanZ(49.5, 51.5);
  for (let iz = tz0; iz <= tz1; iz++)
    for (let dx = -2; dx <= 2; dx++)
      for (let r = 0; r <= 2 - Math.abs(dx); r++) {
        const outer = r === 2 - Math.abs(dx);
        const id = !outer
          ? B.WOOL_WHITE
          : Math.abs(dx) === 2 || r === 2
            ? B.WOOL_RED
            : B.WOOL_WHITE;
        g.set(tx + dx, row(r), iz, id);
      }
  g.set(tx, row(0), tz0, B.AIR);
  g.set(tx, row(1), tz0, B.AIR);
  g.set(tx, row(0), tz0 + 1, B.PLANKS_DARK);
  g.set(tx, row(1), tz0 + 1, B.PLANKS_DARK);
  g.set(tx, row(3), tz1, B.POST_WOOD);
  g.set(tx, row(4), tz1, B.WOOL_YELLOW);
  g.end();
  for (let iz = tz0 - 1; iz <= tz1 + 1; iz++)
    for (let ix = tx - 3; ix <= tx + 3; ix++) g.flag(ix, iz, F.KEEP | F.BUILT);

  // Campfire ring with log stumps for seats.
  g.begin("refuge campfire", "prop", false);
  const fx = vx(12.2),
    fz = vz(46.6);
  g.surface(fx, fz, B.GRAVEL);
  for (let dz = -1; dz <= 1; dz++)
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      g.set(fx + dx, row(0), fz + dz, dx && dz ? B.COBBLE_SLAB : B.STONE_SLAB);
    }
  g.set(fx, row(0), fz, B.LOG);
  for (const [x, z] of [
    [13.9, 46.9],
    [11.3, 48.1],
    [12.0, 44.9],
  ])
    g.set(vx(x), row(0), vz(z), B.LOG);
  g.end();
  g.set(fx, row(1), fz, B.AIR);
  const fireX = cx(fx),
    fireZ = cz(fz);
  g.emit({ kind: "campfire", x: fireX, y: 0.55, z: fireZ });
  g.light(fireX, 0.9, fireZ, "campfire", "#ff9a3c", 1);
  g.emit({ kind: "fireflies", x: rx, y: 1.2, z: rz, rx: 5.5, rz: 5.5 });
}

/** Trampled earth and a few dark rocks mark where the hounds den. */
export function buildDens(g: Gen): void {
  g.begin("hound dens", "prop", false);
  DENS.forEach(([x, z], n) => {
    const [x0, x1] = spanX(x - 2.2, x + 2.2),
      [z0, z1] = spanZ(z - 2.2, z + 2.2);
    for (let iz = z0; iz <= z1; iz++)
      for (let ix = x0; ix <= x1; ix++) {
        const d = Math.hypot(cx(ix) - x, cz(iz) - z);
        g.flag(ix, iz, F.KEEP);
        if (g.has(ix, iz, F.PATH | F.WATER | F.BRIDGE)) continue;
        const h = hash3(ix, iz, 600 + n);
        if (d < 1.4 + h * 0.6)
          g.surface(ix, iz, h < 0.3 ? B.GRAVEL : h < 0.55 ? B.PATH : B.DIRT);
      }
    for (let k = 0; k < 3; k++) {
      const a = n * 1.7 + k * 2.2;
      const ix = vx(x + Math.cos(a) * 2.1),
        iz = vz(z + Math.sin(a) * 2.1);
      if (g.has(ix, iz, F.PATH | F.WATER | F.BRIDGE)) continue;
      g.set(ix, g.above(ix, iz), iz, k === 0 ? B.STONE_DARK : B.COBBLE_SLAB);
    }
  });
  g.end();
}

export function buildLamps(g: Gen): void {
  for (const [x, z] of LAMPS) {
    if (
      REFUGE_PILLARS.some(
        ([px, pz]) => Math.abs(px - x) < 0.6 && Math.abs(pz - z) < 0.6,
      )
    )
      continue;
    lanternPost(g, x, z, z < 0 ? "iron" : "wood");
  }
}

/** NPC anchors and lamp posts stay clear of terraces and decoration. */
export function keepClear(g: Gen): void {
  for (const a of Object.values(NPCS))
    for (let dz = -1.25; dz <= 1.25; dz += 0.5)
      for (let dx = -1.25; dx <= 1.25; dx += 0.5)
        g.flag(vx(a.x + dx), vz(a.z + dz), F.KEEP);
  for (const [x, z] of LAMPS)
    for (let dz = -2; dz <= 2; dz++)
      for (let dx = -2; dx <= 2; dx++) g.flag(vx(x) + dx, vz(z) + dz, F.KEEP);
}
