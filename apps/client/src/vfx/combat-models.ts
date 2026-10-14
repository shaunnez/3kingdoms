/**
 * Tiny voxel props for combat: the cyborg's repair drone and the Arc Mine.
 * Pure data meshed with the shared mesher; glowing parts are split out so
 * they can take a tinted glow material.
 */
import { VertexData } from "@babylonjs/core";
import { VoxelGrid } from "../voxel/grid";
import { meshColors, type MeshData } from "../voxel/mesher";

type RGB = readonly [number, number, number];
const rgb = (h: string): RGB => [
  parseInt(h.slice(1, 3), 16) / 255,
  parseInt(h.slice(3, 5), 16) / 255,
  parseInt(h.slice(5, 7), 16) / 255,
];

function toVertexData(m: MeshData): VertexData {
  const d = new VertexData();
  d.positions = m.positions;
  d.normals = m.normals;
  d.colors = m.colors;
  d.indices = m.indices;
  return d;
}

const DRONE_PALETTE: RGB[] = [
  [0, 0, 0],
  rgb("#f4f8fb"), // 1 shell
  rgb("#b7c2d2"), // 2 belly / mast
  rgb("#5ef2ff"), // 3 eyes (glow)
  rgb("#58d86a"), // 4 green cross
  rgb("#3a3f52"), // 5 visor glass
  rgb("#ffaed1"), // 6 blush
];

/** Repair drone: round shell, dark visor with two glowing eyes, green crosses. */
export function droneData(): {
  body: VertexData;
  eyes: VertexData;
  rotor: VertexData;
} {
  const s = 0.05;
  const g = new VoxelGrid(10, 9, 10, { x: 0, y: 0, z: 0 }, s);
  for (let y = 1; y <= 6; y++)
    for (let z = 1; z <= 8; z++)
      for (let x = 1; x <= 8; x++) {
        const cx = Math.abs(x - 4.5),
          cz = Math.abs(z - 4.5);
        const edgeY = y === 1 || y === 6;
        if (cx > 3 && cz > 3) continue;
        if (edgeY && (cx > 2.5 || cz > 2.5)) continue;
        g.set(x, y, z, y <= 2 ? 2 : 1);
      }
  // Face on +Z: visor, eyes, blush.
  for (let x = 2; x <= 7; x++) for (let y = 3; y <= 5; y++) g.set(x, y, 8, 5);
  g.set(3, 4, 9, 3);
  g.set(6, 4, 9, 3);
  g.set(2, 3, 9, 6);
  g.set(7, 3, 9, 6);
  // Green crosses on both sides.
  for (const x of [0, 9]) {
    for (let z = 3; z <= 6; z++) g.set(x, 4, z, 4);
    for (let y = 3; y <= 5; y++) {
      g.set(x, y, 4, 4);
      g.set(x, y, 5, 4);
    }
  }
  // Mast.
  g.set(4, 7, 4, 2);
  g.set(5, 7, 5, 2);
  g.set(4, 7, 5, 2);
  g.set(5, 7, 4, 2);
  const pivot = { x: 5 * s, y: 4 * s, z: 5 * s };
  const body = meshColors(g, {
    palette: DRONE_PALETTE,
    include: (i) => i !== 3,
    pivot,
  });
  const eyes = meshColors(g, {
    palette: DRONE_PALETTE,
    include: (i) => i === 3,
    pivot,
    aoStrength: 0,
  });
  const rs = 0.04;
  const r = new VoxelGrid(15, 1, 15, { x: 0, y: 0, z: 0 }, rs);
  for (let i = 0; i < 15; i++) {
    r.set(i, 0, 7, 2);
    r.set(7, 0, i, 2);
  }
  r.set(7, 0, 7, 5);
  const rotor = meshColors(r, {
    palette: DRONE_PALETTE,
    pivot: { x: 7.5 * rs, y: 0, z: 7.5 * rs },
    aoStrength: 0,
  });
  return {
    body: toVertexData(body),
    eyes: toVertexData(eyes),
    rotor: toVertexData(rotor),
  };
}

const MINE_PALETTE: RGB[] = [
  [0, 0, 0],
  rgb("#4a4e5e"), // 1 casing
  rgb("#ffd45e"), // 2 hazard yellow
  rgb("#9aa6b8"), // 3 dome
  rgb("#5ef2ff"), // 4 prong tips
  rgb("#2b2140"), // 5 hazard ink
  rgb("#ffffff"), // 6 light (glow)
];

/** Arc Mine: squat hazard-striped puck, steel dome, four cyan prongs and a light. */
export function mineData(): { body: VertexData; light: VertexData } {
  const s = 0.06;
  const n = 11,
    c = 5;
  const g = new VoxelGrid(n, 5, n, { x: 0, y: 0, z: 0 }, s);
  for (let z = 0; z < n; z++)
    for (let x = 0; x < n; x++) {
      const d2 = (x - c) ** 2 + (z - c) ** 2;
      if (d2 > 26) continue;
      g.set(x, 0, z, 1);
      if (d2 >= 15) {
        const stripe =
          Math.floor(
            ((Math.atan2(z - c, x - c) + Math.PI) / (Math.PI * 2)) * 10,
          ) % 2;
        g.set(x, 1, z, stripe ? 2 : 5);
      } else g.set(x, 1, z, 1);
      if (d2 <= 7) g.set(x, 2, z, 3);
      if (d2 <= 2) g.set(x, 3, z, 3);
    }
  for (const [x, z] of [
    [2, 2],
    [8, 2],
    [2, 8],
    [8, 8],
  ]) {
    g.set(x, 2, z, 1);
    g.set(x, 3, z, 4);
  }
  g.set(c, 4, c, 6);
  const pivot = { x: (c + 0.5) * s, y: 0, z: (c + 0.5) * s };
  return {
    body: toVertexData(
      meshColors(g, { palette: MINE_PALETTE, include: (i) => i !== 6, pivot }),
    ),
    light: toVertexData(
      meshColors(g, {
        palette: MINE_PALETTE,
        include: (i) => i === 6,
        pivot,
        aoStrength: 0,
      }),
    ),
  };
}
