/**
 * Highcross: paved plaza, compass ring, town walls, timber-frame cottages,
 * market stall, astrolabe pedestal, lanterns and small town props.
 */
import { B } from "./blocks";
import {
  F,
  GROUND,
  Gen,
  cx,
  cy,
  cz,
  hash3,
  row,
  spanX,
  spanZ,
  vx,
  vz,
} from "./world-gen-core";
import { OBSTACLES } from "../../../../packages/simulation/map";
import { growTree, type TreeType } from "./world-gen-trees";

const ASTRO = { x: 0, z: -10 };
/** Realm inlays around the astrolabe: Fantasy, Science, Chaos. */
const INLAYS: [number, number][] = [
  [Math.PI / 2, B.WOOL_GREEN],
  [Math.PI / 2 + (2 * Math.PI) / 3, B.COPPER_OXIDIZED],
  [Math.PI / 2 - (2 * Math.PI) / 3, B.CRYSTAL],
];

function pave(x: number, z: number, ix: number, iz: number): number {
  const dx = x - ASTRO.x,
    dz = z - ASTRO.z;
  const r = Math.hypot(dx, dz);
  if (z > -0.5) return ix % 3 === 2 ? B.PAVING : B.RUNE;
  if (r < 2.2) return B.MARBLE;
  for (const [a, id] of INLAYS) {
    const px = Math.cos(a) * 2.75,
      pz = Math.sin(a) * 2.75;
    if (Math.abs(dx - px) + Math.abs(dz - pz) < 0.8) return id;
  }
  if (r < 3.3) return B.PAVING;
  if (r < 3.8) return B.GOLD;
  if (r <= 4.65) {
    // Marble band with gold ticks at the eight compass points.
    const a = Math.atan2(dz, dx);
    const sector = Math.round(a / (Math.PI / 4));
    const off = Math.abs(a - sector * (Math.PI / 4)) * r;
    return off < (sector % 2 === 0 ? 0.55 : 0.28) ? B.GOLD : B.MARBLE;
  }
  if (r < 5.25) return B.PAVING_DARK;
  // Avenues: gate → compass, and compass → the cottage doors.
  if (z > -5.4 && Math.abs(x) < 3.25)
    return Math.abs(x) > 2.75 ? B.PAVING_DARK : B.PAVING;
  if (Math.abs(z + 9) < 1.75 && Math.abs(x) < 10)
    return Math.abs(z + 9) > 1.25 ? B.PAVING_DARK : B.PAVING;
  if (Math.abs(x) > 19.5 || z < -39.5) return B.PAVING_DARK;
  // Open paving with scattered darker slabs.
  if (hash3(ix >> 1, iz >> 1, 11) < 0.045) return B.PAVING_DARK;
  if (hash3(ix, iz, 12) < 0.035) return B.PAVING_DARK;
  return B.PAVING;
}

export function buildPlaza(g: Gen): void {
  const [x0, x1] = spanX(-20, 20);
  const [z0, z1] = spanZ(-40, 0);
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++) {
      g.surface(ix, iz, pave(cx(ix), cz(iz), ix, iz));
      g.flag(ix, iz, F.PLAZA);
    }
  for (const x of [-15, -5, 5, 15])
    g.light(x, 0.3, -0.25, "rune", "#5ef2ff", 0.45);
}

function wallStone(ix: number, iy: number, iz: number, low: boolean): number {
  const h = hash3(ix, iy, iz + 404);
  if (h < (low ? 0.2 : 0.08)) return B.MOSSY_BRICK;
  if (h > 0.95) return B.COBBLE;
  return B.STONE_BRICK;
}

/** Town banner hung flat on a wall face: red cloth, yellow rod and stripe. */
function banner(
  g: Gen,
  cells: [number, number][],
  top: number,
  length: number,
): void {
  for (let r = 0; r < length; r++) {
    const iy = top - r;
    for (const [ix, iz] of cells) {
      const yellow = r === 0 || r === 2;
      g.set(ix, iy, iz, yellow ? B.WOOL_YELLOW : B.WOOL_RED);
    }
  }
}

export function buildTownWalls(g: Gen): void {
  const H = 8;
  for (const side of [-1, 1]) {
    g.begin(`town wall ${side < 0 ? "west" : "east"}`, "wall", false);
    const [x0, x1] = side > 0 ? spanX(20, 21) : spanX(-21, -20);
    const [z0, z1] = spanZ(-40, 0);
    const inner = side > 0 ? x0 : x1;
    for (let iz = z0; iz <= z1; iz++)
      for (let ix = x0; ix <= x1; ix++) {
        const end = iz >= z1 - 1;
        const height = end ? H + 3 : H;
        for (let r = 0; r < height; r++)
          g.set(ix, row(r), iz, wallStone(ix, r, iz, r < 3));
        if (end ? (ix + iz) % 2 === 0 : ((iz - z0) >> 1) % 2 === 0)
          g.set(ix, row(height), iz, B.STONE_BRICK);
      }
    for (const z of [-34, -26, -18, -10]) {
      const iz = vz(z);
      banner(
        g,
        [
          [inner, iz],
          [inner, iz + 1],
        ],
        row(6),
        4,
      );
    }
    g.end();
  }
  g.begin("town wall south", "wall", true);
  const [x0, x1] = spanX(-22, 22);
  const [z0, z1] = spanZ(-41, -40);
  for (let iz = z0 - 2; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++) {
      const tower = ix < x0 + 4 || ix > x1 - 4;
      if (!tower && iz < z0) continue;
      const height = tower ? H + 3 : H;
      for (let r = 0; r < height; r++)
        g.set(ix, row(r), iz, wallStone(ix, r, iz, r < 3));
      const crown = tower ? (ix + iz) % 2 === 0 : ((ix - x0) >> 1) % 2 === 0;
      if (crown) g.set(ix, row(height), iz, B.STONE_BRICK);
    }
  for (const x of [-15, -6, 6, 15]) {
    const ix = vx(x);
    banner(
      g,
      [
        [ix, z1],
        [ix + 1, z1],
      ],
      row(6),
      4,
    );
  }
  // Lanterns on the corner towers.
  for (const x of [-21, 21]) {
    const ix = vx(x);
    g.set(ix, row(H + 3), z1 - 1, B.LANTERN);
    g.light(cx(ix), cy(row(H + 3)), cz(z1 - 1), "lantern", "#ffb35c", 0.7);
  }
  g.end();
}

type RoofColor = "red" | "blue" | "teal";
const ROOF: Record<RoofColor, [number, number]> = {
  red: [B.ROOF_RED, B.ROOF_RED_SLAB],
  blue: [B.ROOF_BLUE, B.ROOF_BLUE_SLAB],
  teal: [B.ROOF_TEAL, B.ROOF_TEAL_SLAB],
};
type HouseStyle = {
  roof: RoofColor;
  /** Chimney near the north (true) or south gable. */
  chimneyNorth: boolean;
  flowers: number[];
  foundation: number;
  back: "logs" | "barrel" | "flowers";
};
const STYLES: HouseStyle[] = [
  {
    roof: "red",
    chimneyNorth: true,
    flowers: [B.FLOWER_RED, B.FLOWER_YELLOW],
    foundation: B.STONE_BRICK,
    back: "logs",
  },
  {
    roof: "blue",
    chimneyNorth: false,
    flowers: [B.FLOWER_PINK, B.FLOWER_BLUE],
    foundation: B.COBBLE,
    back: "barrel",
  },
  {
    roof: "teal",
    chimneyNorth: false,
    flowers: [B.FLOWER_YELLOW, B.FLOWER_BLUE],
    foundation: B.COBBLE,
    back: "flowers",
  },
  {
    roof: "red",
    chimneyNorth: true,
    flowers: [B.FLOWER_PINK, B.FLOWER_RED],
    foundation: B.STONE_BRICK,
    back: "logs",
  },
];
const LONG = "TWWPTDDTPWWT";
const GABLE = "TPWWPTTPWWPT";

function house(g: Gen, index: number, style: HouseStyle): void {
  const o = OBSTACLES[index];
  const [x0, x1] = spanX(o.x - o.w / 2, o.x + o.w / 2);
  const [z0, z1] = spanZ(o.z - o.d / 2, o.z + o.d / 2);
  const W = x1 - x0 + 1,
    D = z1 - z0 + 1;
  const face = o.x < 0 ? 1 : -1;
  const frontI = face > 0 ? W - 1 : 0;
  const [roof, slab] = ROOF[style.roof];
  // Distance (in voxels) of roof column i from the nearer eave; 0 = overhang.
  const depth = (i: number) => Math.min(i + 1, W - i);
  const ridge = Math.floor(W / 2);
  const flower = (ix: number, iz: number) =>
    style.flowers[Math.floor(hash3(ix, iz, index) * style.flowers.length)];

  g.begin(`house ${index + 1}`, "house", true);
  for (let k = 0; k < D; k++)
    for (let i = 0; i < W; i++) {
      const ix = x0 + i,
        iz = z0 + k;
      const edgeX = i === 0 || i === W - 1,
        edgeZ = k === 0 || k === D - 1;
      const front = i === frontI;
      for (let r = 0; r <= 4 + depth(i); r++) {
        let id: number = B.PLASTER;
        if (r === 5) id = B.TIMBER;
        else if (r > 5) {
          // Gable triangle with a framed attic window.
          if (edgeZ) {
            const mid = i === ridge - 1 || i === ridge;
            if (mid && (r === 7 || r === 8)) id = B.GLASS_LIT;
            else if (mid && r === 6) id = B.TIMBER;
            else if ((i === ridge - 2 || i === ridge + 1) && r >= 6 && r <= 8)
              id = B.TIMBER;
          }
        } else if (edgeX && edgeZ) id = r === 0 ? style.foundation : B.TIMBER;
        else if (edgeX || edgeZ) {
          const p = edgeX ? LONG[k] : GABLE[i];
          if (r === 0)
            id =
              front && p === "D"
                ? B.DOOR
                : hash3(ix, iz, 7) < 0.3
                  ? B.STONE_BRICK
                  : style.foundation;
          else if (p === "T")
            id = r === 3 && front && k === 7 ? B.LANTERN : B.TIMBER;
          else if (p === "W") id = r >= 2 && r <= 3 ? B.GLASS_LIT : B.PLASTER;
          else if (p === "D")
            id = front
              ? r <= 3
                ? B.DOOR
                : B.TIMBER
              : r >= 2 && r <= 3
                ? B.GLASS_LIT
                : B.PLASTER;
        }
        g.set(ix, row(r), iz, id);
      }
    }
  // Gable roof with a one-voxel overhang on every side (all above 3 m).
  for (let k = -1; k <= D; k++)
    for (let i = -1; i <= W; i++) {
      const d = depth(i);
      const ix = x0 + i,
        iz = z0 + k;
      if (d <= 0) g.set(ix, row(6), iz, slab);
      else g.set(ix, row(5 + d), iz, roof);
      if (d === ridge) g.set(ix, row(6 + d), iz, slab);
    }
  // Brick chimney on the back slope.
  const ci = face > 0 ? 2 : W - 4;
  const ck = style.chimneyNorth ? D - 4 : 2;
  for (let r = 0; r <= 12; r++)
    for (const [a, b] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ])
      g.set(
        x0 + ci + a,
        row(r),
        z0 + ck + b,
        r === 12 ? B.STONE_BRICK : B.BRICK,
      );
  g.emit({
    kind: "chimney",
    x: cx(x0 + ci) + 0.25,
    y: (row(13) - GROUND - 1) * 0.5 + 0.1,
    z: cz(z0 + ck) + 0.25,
  });
  // Window box under the south attic window (above 3 m, may overhang).
  for (const i of [ridge - 1, ridge]) {
    g.set(x0 + i, row(6), z0 - 1, B.PLANKS_DARK);
    g.set(x0 + i, row(7), z0 - 1, flower(x0 + i, z0));
  }
  // Pots flanking the door and something homely at the back, in the
  // non-walkable sliver between the footprint and the collision box.
  const fx = x0 + frontI + face,
    bx = x0 + (W - 1 - frontI) - face;
  for (const k of [3, 8]) {
    g.set(fx, row(0), z0 + k, B.TERRACOTTA);
    g.set(fx, row(1), z0 + k, flower(fx, z0 + k));
  }
  if (style.back === "logs")
    for (let k = 6; k <= 9; k++) {
      g.set(bx, row(0), z0 + k, B.LOG);
      if (k > 6 && k < 9) g.set(bx, row(1), z0 + k, B.LOG);
    }
  else if (style.back === "barrel") {
    g.set(bx, row(0), z0 + 6, B.BARREL);
    g.set(bx, row(0), z0 + 7, B.BARREL);
    g.set(bx, row(1), z0 + 6, B.BARREL);
  }
  g.end();

  // Flush flower beds round the house and a dark doorstep apron.
  for (let k = -1; k <= D; k++)
    for (let i = -1; i <= W; i++) {
      if (i >= 0 && i < W && k >= 0 && k < D) continue;
      const ix = x0 + i,
        iz = z0 + k;
      g.flag(ix, iz, F.BUILT);
      const doorSide = i === frontI + face;
      if (doorSide && k >= 3 && k <= 8) {
        if (k >= 4 && k <= 7) g.surface(ix, iz, B.PAVING_DARK);
        continue;
      }
      if (g.get(ix, row(0), iz) !== B.AIR) continue;
      g.surface(ix, iz, B.GRASS);
      if (hash3(ix, iz, 21 + index) < 0.72)
        g.set(ix, row(0), iz, flower(ix, iz));
    }
  for (let k = 4; k <= 7; k++)
    g.surface(x0 + frontI + face * 2, z0 + k, B.PAVING_DARK);
  for (let k = 0; k < D; k++)
    for (let i = 0; i < W; i++) g.flag(x0 + i, z0 + k, F.BUILT);
  g.light(
    cx(x0 + frontI) + face * 0.3,
    1.5,
    cz(z0 + 1) + 0.25,
    "window",
    "#ffcf7a",
    0.55,
  );
}

export function buildHouses(g: Gen): void {
  STYLES.forEach((style, i) => house(g, i, style));
}

export function buildStall(g: Gen): void {
  const [x0, x1] = spanX(5.8, 9.3);
  const [z0, z1] = spanZ(-17.2, -12.6);
  g.begin("market stall", "stall", true);
  for (const ix of [x0, x1])
    for (const iz of [z0, z1])
      for (let r = 0; r <= 4; r++) g.set(ix, row(r), iz, B.POST_WOOD);
  const ax0 = x0 - 1,
    ax1 = x1 + 1;
  for (let iz = z0 - 1; iz <= z1 + 1; iz++) {
    const id = (iz - z0) % 2 === 0 ? B.WOOL_RED : B.WOOL_WHITE;
    for (let ix = ax0; ix <= ax1; ix++) {
      const d = Math.min(ix - ax0, ax1 - ix);
      g.set(ix, row(d >= 2 ? 6 : 5), iz, id);
    }
    // Scalloped valance front and back.
    if ((iz - z0) % 2 === 0) {
      g.set(ax0, row(4), iz, B.WOOL_RED);
      g.set(ax1, row(4), iz, B.WOOL_RED);
    }
  }
  g.end();
  g.begin("market goods", "prop", false);
  // Counter facing the plaza; Nemi stands behind it at (7, -14).
  for (let iz = z0 + 1; iz <= z1 - 1; iz++) {
    const end = iz === z0 + 1 || iz === z1 - 1;
    g.set(x0, row(0), iz, end ? B.CRATE : B.PLANKS);
    if (iz === z0 + 1) g.set(x0, row(1), iz, B.PUMPKIN);
    else if (iz === z0 + 3) g.set(x0, row(1), iz, B.HAY);
    else if (!end) g.set(x0, row(1), iz, B.PLANK_SLAB);
  }
  g.set(x1, row(0), z0 + 1, B.CRATE);
  g.set(x1, row(0), z0 + 2, B.CRATE);
  g.set(x1, row(1), z0 + 1, B.CRATE);
  g.set(x1, row(0), z1 - 1, B.BARREL);
  // Hay bales and pumpkins beside the stall.
  const hx = vx(10.1);
  g.set(hx, row(0), z0 + 2, B.HAY);
  g.set(hx, row(0), z0 + 3, B.HAY);
  g.set(hx + 1, row(0), z0 + 2, B.HAY);
  g.set(hx, row(1), z0 + 2, B.PUMPKIN);
  g.set(vx(5.2), row(0), vz(-17.6), B.PUMPKIN);
  g.set(vx(5.2), row(0), vz(-12.2), B.PUMPKIN);
  g.set(vx(4.7), row(0), vz(-12.2), B.PUMPKIN);
  g.end();
  for (let iz = z0 - 1; iz <= z1 + 1; iz++)
    for (let ix = x0 - 1; ix <= hx + 1; ix++) g.flag(ix, iz, F.BUILT);
}

export function buildAstrolabe(g: Gen): void {
  g.begin("astrolabe pedestal", "landmark", false);
  const [x0, x1] = spanX(ASTRO.x - 2.1, ASTRO.x + 2.1);
  const [z0, z1] = spanZ(ASTRO.z - 2.1, ASTRO.z + 2.1);
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++) {
      const dx = Math.abs(cx(ix) - ASTRO.x),
        dz = Math.abs(cz(iz) - ASTRO.z);
      // Farthest corner keeps every voxel inside the 2.1 m collision circle.
      const corner = Math.hypot(dx + 0.25, dz + 0.25);
      if (corner > 2.08) continue;
      const tip = Math.min(dx, dz) < 0.5 && corner > 1.75;
      g.set(ix, row(0), iz, tip ? B.GOLD : B.STONE_BRICK);
      if (corner <= 1.6) g.set(ix, row(1), iz, B.MARBLE);
      if (corner <= 1.15) {
        const centre = dx < 0.5 && dz < 0.5;
        g.set(ix, row(2), iz, centre ? B.GOLD : B.STONE_SLAB);
      }
      g.flag(ix, iz, F.BUILT);
    }
  g.end();
  g.light(ASTRO.x, 2.6, ASTRO.z, "magic", "#ffd45e", 1);
  g.emit({ kind: "astrolabe", x: ASTRO.x, y: 2.6, z: ASTRO.z });
}

/** Lamp post (~2.5 m) with a lantern block and a little cap. Terrain-owned. */
export function lanternPost(
  g: Gen,
  x: number,
  z: number,
  style: "iron" | "wood",
): void {
  const ix = vx(x),
    iz = vz(z);
  const base = g.above(ix, iz);
  const post = style === "iron" ? B.POST_IRON : B.POST_WOOD;
  const prev = g.current;
  g.use(0);
  for (let iy = base; iy < base + 4; iy++) g.set(ix, iy, iz, post);
  g.set(ix, base + 4, iz, B.LANTERN);
  g.set(ix, base + 5, iz, style === "iron" ? B.STONE_SLAB : B.PLANK_SLAB);
  g.use(prev);
  g.light(cx(ix), cy(base + 4), cz(iz), "lantern", "#ffb35c", 0.8);
  g.flag(ix, iz, F.KEEP);
}

export function buildTownProps(g: Gen): void {
  g.begin("town props", "prop", false);
  const barrels: [number, number, number][] = [
    [-8, -9, 2],
    [-8, -10, 1],
    [9, -19, 2],
    [8, -20, 1],
    [-9, -32, 1],
    [8, 7, 2],
    [-7, 29, 1],
  ];
  const crates: [number, number, number][] = [
    [-8, -12, 2],
    [-8, -13, 1],
    [9, -18, 1],
    [8, -18, 2],
    [9, -32, 2],
    [-8, 7, 1],
  ];
  for (const [list, id] of [
    [barrels, B.BARREL],
    [crates, B.CRATE],
  ] as const)
    for (const [x, z, n] of list) {
      const ix = vx(x),
        iz = vz(z);
      const base = g.above(ix, iz);
      for (let k = 0; k < n; k++) g.set(ix, base + k, iz, id);
      g.flag(ix, iz, F.KEEP | F.BUILT);
    }
  // Benches round the compass, facing the astrolabe.
  const benches: [number, number, "x" | "z"][] = [
    [-6.25, -14.25, "x"],
    [-6.25, -5.75, "x"],
    [5.75, -5.75, "x"],
    [-3, -16.75, "x"],
    // Round the flower garden in the south of the plaza.
    [-0.75, -26.75, "x"],
    [-0.75, -35.25, "x"],
    [-4.75, -31.75, "z"],
    [4.25, -31.75, "z"],
  ];
  for (const [x, z, axis] of benches) {
    const ix = vx(x),
      iz = vz(z);
    for (let k = 0; k < 3; k++) {
      const bx = axis === "x" ? ix + k : ix,
        bz = axis === "z" ? iz + k : iz;
      if (k !== 1) g.set(bx, row(0), bz, B.POST_WOOD);
      g.set(bx, row(1), bz, B.PLANK_SLAB);
      g.flag(bx, bz, F.KEEP | F.BUILT);
    }
  }
  // Flower pots along the plaza edges.
  const pots: [number, number, number][] = [
    [-3.5, -0.9, B.FLOWER_RED],
    [3.5, -0.9, B.FLOWER_YELLOW],
    [-18.6, -1.2, B.FLOWER_PINK],
    [18.6, -1.2, B.FLOWER_BLUE],
    [-4.5, -38.6, B.FLOWER_YELLOW],
    [4.5, -38.6, B.FLOWER_PINK],
    [5.4, -18.2, B.FLOWER_RED],
  ];
  for (const [x, z, f] of pots) {
    const ix = vx(x),
      iz = vz(z);
    g.set(ix, row(0), iz, B.TERRACOTTA);
    g.set(ix, row(1), iz, f);
    g.flag(ix, iz, F.KEEP | F.BUILT);
  }
  // Signposts just off the road on the town side.
  for (const [x, z] of [
    [-4.6, -1.6],
    [4.6, -1.6],
    [17, -1.6],
  ]) {
    const ix = vx(x),
      iz = vz(z);
    g.set(ix, row(0), iz, B.POST_WOOD);
    g.set(ix, row(1), iz, B.POST_WOOD);
    g.set(ix - 1, row(2), iz, B.PLANKS);
    g.set(ix, row(2), iz, B.PLANKS);
    g.set(ix + 1, row(2), iz, B.PLANKS);
    g.set(ix, row(3), iz, B.POST_WOOD);
    g.flag(ix, iz, F.KEEP | F.BUILT);
  }
  g.end();
  // Flower beds along the inside of the town walls.
  const [bz0, bz1] = spanZ(-38.5, -2);
  for (const ix of [vx(-19.75), vx(-19.25), vx(19.25), vx(19.75)])
    for (let iz = bz0; iz <= bz1; iz++) {
      if (iz % 16 < 3) continue;
      g.surface(ix, iz, B.GRASS);
      g.flag(ix, iz, F.BUILT);
      const h = hash3(ix, iz, 99);
      if (h < 0.68)
        g.set(
          ix,
          row(0),
          iz,
          h < 0.18
            ? B.FLOWER_RED
            : h < 0.34
              ? B.FLOWER_YELLOW
              : h < 0.5
                ? B.FLOWER_PINK
                : h < 0.58
                  ? B.FLOWER_BLUE
                  : B.TALL_GRASS,
        );
    }
}

/** Round flower garden with a little cherry tree in the south of the plaza. */
export function buildGarden(g: Gen): void {
  const GX = 0,
    GZ = -31;
  const [x0, x1] = spanX(GX - 3.2, GX + 3.2);
  const [z0, z1] = spanZ(GZ - 3.2, GZ + 3.2);
  const rings = [B.FLOWER_YELLOW, B.FLOWER_PINK, B.FLOWER_RED, B.FLOWER_BLUE];
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++) {
      const d = Math.hypot(cx(ix) - GX, cz(iz) - GZ);
      if (d > 3.15) continue;
      g.flag(ix, iz, F.BUILT);
      if (d > 2.6) {
        g.surface(ix, iz, B.PAVING_DARK);
        continue;
      }
      g.surface(ix, iz, B.GRASS);
      if (d < 0.8) continue;
      const ring = Math.min(3, Math.floor((d - 0.8) / 0.5));
      if (hash3(ix, iz, 77) < 0.85) g.set(ix, row(0), iz, rings[ring]);
    }
  const rng = g.rng("garden");
  g.begin("town tree garden", "tree", true);
  growTree(g, vx(GX), vz(GZ), "cherry", 0.35, rng, true);
  g.end();
  g.emit({ kind: "butterflies", x: GX, y: 1, z: GZ, rx: 3, rz: 3 });
}

/** Small trees in stone planters, away from the main paths. */
export function buildTownTrees(g: Gen): void {
  const rng = g.rng("town-trees");
  const spots: [number, number, TreeType][] = [
    [-17.5, -17, "cherry"],
    [17.5, -17.5, "oak"],
    [-17, -36.5, "oak"],
    [17, -36.5, "cherry"],
    [-17.5, -3.5, "birch"],
    [17.5, -3.5, "oak"],
  ];
  spots.forEach(([x, z, type], i) => {
    const ix = vx(x),
      iz = vz(z);
    const id = g.begin(`town tree ${i + 1}`, "tree", true);
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        g.flag(ix + dx, iz + dz, F.BUILT);
        if (dx || dz) g.set(ix + dx, row(0), iz + dz, B.COBBLE_SLAB);
      }
    g.end();
    g.surface(ix, iz, B.GRASS);
    g.use(id);
    const info = growTree(g, ix, iz, type, 0.4 + rng() * 0.3, rng, true);
    g.end();
    if (info && type === "cherry")
      g.emit({
        kind: "petals",
        x: info.x,
        y: info.y,
        z: info.z,
        rx: info.r,
        rz: info.r,
      });
  });
}
