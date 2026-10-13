/**
 * Chunky, toy-like trees: rounded leaf blobs, tiered spruces, flat cherry
 * domes. Trees only grow into empty space so they never cut other features.
 */
import { B } from "./blocks";
import { Gen, SY, cx, cy, cz, hash3, type Rng } from "./world-gen-core";

export type TreeType =
  "oak" | "birch" | "cherry" | "spruce" | "autumn" | "golden";
export type TreeInfo = {
  type: TreeType;
  /** Canopy centre and horizontal radius in metres. */
  x: number;
  y: number;
  z: number;
  r: number;
};

export function pickTreeType(r: number, golden = 0.04): TreeType {
  if (r < golden) return "golden";
  r = (r - golden) / (1 - golden);
  if (r < 0.36) return "oak";
  if (r < 0.54) return "birch";
  if (r < 0.7) return "cherry";
  if (r < 0.88) return "spruce";
  return "autumn";
}

const hash = hash3;

const LEAF: Record<TreeType, number> = {
  oak: B.LEAVES,
  birch: B.LEAVES,
  cherry: B.LEAVES_CHERRY,
  spruce: B.LEAVES_DARK,
  autumn: B.LEAVES_AUTUMN,
  golden: B.LEAVES_GOLD,
};

/** Rounded-cube blob (superellipsoid) with a few nibbled surface voxels. */
function blob(
  g: Gen,
  ox: number,
  oy: number,
  oz: number,
  rx: number,
  ry: number,
  rz: number,
  id: number,
  salt: number,
  accent?: { id: number; chance: number },
): void {
  // Small blobs read as cubes with a squarish exponent; round them more.
  const p = Math.min(rx, ry) < 2.6 ? 2.0 : 2.5;
  const ex = Math.ceil(rx),
    ey = Math.ceil(ry),
    ez = Math.ceil(rz);
  // The superellipsoid is separable: precompute each axis term once.
  const tx = new Float64Array(ex * 2 + 1),
    ty = new Float64Array(ey * 2 + 1),
    tz = new Float64Array(ez * 2 + 1);
  for (let d = -ex; d <= ex; d++) tx[d + ex] = Math.abs(d / rx) ** p;
  for (let d = -ey; d <= ey; d++) ty[d + ey] = Math.abs(d / ry) ** p;
  for (let d = -ez; d <= ez; d++) tz[d + ez] = Math.abs(d / rz) ** p;
  for (let dy = -ey; dy <= ey; dy++)
    for (let dz = -ez; dz <= ez; dz++)
      for (let dx = -ex; dx <= ex; dx++) {
        const v = tx[dx + ex] + ty[dy + ey] + tz[dz + ez];
        if (v > 1) continue;
        const h = hash(ox + dx, oy + dy, oz + dz + salt);
        // Nibble the outer shell so canopies read hand-made, not machined.
        if (v > 0.62 && h < 0.16) continue;
        const leaf = accent && h > 1 - accent.chance ? accent.id : id;
        g.setIfAir(ox + dx, oy + dy, oz + dz, leaf);
      }
}

/**
 * Grow a tree with its trunk base on top of the terrain at (ix, iz).
 * `size` 0..1 scales height and canopy. Returns null if there is no room.
 */
export function growTree(
  g: Gen,
  ix: number,
  iz: number,
  type: TreeType,
  size: number,
  rng: Rng,
  small = false,
): TreeInfo | null {
  const base = g.above(ix, iz);
  if (g.get(ix, base, iz) !== B.AIR) return null;
  const salt = Math.floor(rng() * 1e6);
  const big = !small && size > 0.86 && (type === "oak" || type === "spruce");
  const trunkId = type === "birch" ? B.BIRCH_LOG : B.LOG;
  // Spruces are measured to the tip; blob trees by their clear trunk.
  let height = 10 + Math.round(size * 4);
  if (small) height -= 3;
  if (big) height += 1;
  let clear: number, rx: number, ry: number;
  switch (type) {
    case "birch":
      clear = 5 + Math.round(size * 2);
      rx = 2.1 + size * 0.5;
      ry = 3.3 + size * 0.9;
      break;
    case "cherry":
      clear = 4 + Math.round(size * 1.5);
      rx = 3.4 + size * 0.9;
      ry = 2.3 + size * 0.6;
      break;
    default:
      clear = 4 + Math.round(size * 2);
      rx = 2.7 + size * 1.0;
      ry = 2.5 + size * 0.7;
  }
  if (small) {
    clear = 4;
    rx *= 0.75;
    ry *= 0.8;
  }
  if (big) {
    clear += 1;
    rx += 0.8;
  }
  const blobCentre = base + clear + Math.round(ry);
  if (type !== "spruce") height = blobCentre - base + 1;
  if (base + height + 5 >= SY) return null;
  const trunkTop = base + height - 1;
  const leaf = LEAF[type];
  const widths = big ? [0, 1] : [0];
  // Canopy first so the trunk shows through the underside.
  let r = 0,
    centreY = trunkTop;
  const ox = ix + (big ? 0.5 : 0),
    oz = iz + (big ? 0.5 : 0);
  if (type === "spruce") {
    // Tiered cone: widening layers that step back in every other row.
    const layers = height - 2;
    const tip = trunkTop + 2;
    for (let j = 0; j < layers; j++) {
      const lr = Math.min(
        big ? 4.2 : 3.4,
        Math.floor((j + 1) / 2) * 0.62 + (j % 2 === 0 ? 0.2 : 0.75),
      );
      const iy = tip - j;
      const ri = Math.ceil(lr) + 1;
      const off = big ? 0.5 : 0;
      for (let dz = -ri; dz <= ri + 1; dz++)
        for (let dx = -ri; dx <= ri + 1; dx++) {
          const ddx = dx - off,
            ddz = dz - off;
          if (ddx * ddx + ddz * ddz > lr * lr + 0.6) continue;
          g.setIfAir(ix + dx, iy, iz + dz, leaf);
        }
      r = Math.max(r, lr);
    }
    g.setIfAir(ix, tip + 1, iz, leaf);
    centreY = tip - layers / 2;
  } else {
    const cyv = blobCentre;
    const accent =
      type === "autumn"
        ? { id: B.LEAVES_GOLD, chance: 0.14 }
        : type === "golden"
          ? { id: B.LEAVES_AUTUMN, chance: 0.08 }
          : type === "oak"
            ? { id: B.LEAVES_DARK, chance: 0.06 }
            : undefined;
    const bx = Math.round(ox),
      bz = Math.round(oz);
    blob(g, bx, cyv, bz, rx, ry, rx, leaf, salt, accent);
    // Side lumps make the silhouette cuter and less spherical.
    const lumps = type === "cherry" ? 3 : 2;
    for (let i = 0; i < lumps; i++) {
      const a = rng() * Math.PI * 2;
      const d = rx * 0.62;
      blob(
        g,
        bx + Math.round(Math.cos(a) * d),
        cyv - 1 + Math.round(rng() * 2),
        bz + Math.round(Math.sin(a) * d),
        rx * 0.6,
        ry * 0.62,
        rx * 0.6,
        leaf,
        salt + i + 1,
        accent,
      );
    }
    r = rx * 1.15;
    centreY = cyv;
  }
  // Trunk (single or 2x2) and a few root stubs on big trees.
  for (let iy = base; iy <= trunkTop; iy++)
    for (const wx of widths)
      for (const wz of widths) {
        const id = g.get(ix + wx, iy, iz + wz);
        if (
          id === B.AIR ||
          id === leaf ||
          id === B.LEAVES_DARK ||
          id === B.LEAVES_GOLD ||
          id === B.LEAVES_AUTUMN
        )
          g.set(ix + wx, iy, iz + wz, trunkId);
      }
  if (big) {
    for (const [dx, dz] of [
      [-1, 0],
      [2, 1],
      [0, 2],
      [1, -1],
    ])
      if (rng() < 0.6) g.setIfAir(ix + dx, base, iz + dz, trunkId);
  }
  return {
    type,
    x: cx(ix) + (big ? 0.25 : 0),
    y: cy(Math.round(centreY)),
    z: cz(iz) + (big ? 0.25 : 0),
    r: r * 0.5,
  };
}

/** Low leafy bush (≤ 1 m), optionally with berries/flowers on top. */
export function growBush(g: Gen, ix: number, iz: number, rng: Rng): void {
  const base = g.above(ix, iz);
  const shape = Math.floor(rng() * 3);
  const cells: [number, number, number][] = [[0, 0, 0]];
  if (shape >= 1) cells.push([1, 0, 0], [0, 0, 1], [1, 0, 1], [0, 1, 0]);
  if (shape === 2) cells.push([-1, 0, 0], [0, 0, -1], [1, 1, 1]);
  if (shape === 0) cells.push([1, 0, 0]);
  for (const [dx, dy, dz] of cells)
    g.setIfAir(ix + dx, base + dy, iz + dz, B.LEAVES);
  if (rng() < 0.4) {
    const top = shape >= 1 ? 2 : 1;
    const flower = [B.FLOWER_PINK, B.FLOWER_RED, B.FLOWER_YELLOW][
      Math.floor(rng() * 3)
    ];
    g.setIfAir(ix, base + top, iz, flower);
  }
}
