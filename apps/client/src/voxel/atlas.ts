/**
 * Procedural block textures: one 16 px pixel-art tile per TILES entry, painted
 * into a single atlas (8 tiles per row, TILES order). Every tile has its own
 * seeded PRNG keyed by its name, so the atlas is identical on every load and
 * unaffected by tiles being added. Soft, low-contrast detail keeps large areas
 * calm at play distance; emissive tiles carry near-white cores for the bloom.
 */
import {
  DynamicTexture,
  Texture,
  type ICanvas,
  type Scene,
} from "@babylonjs/core";
import {
  ATLAS_COLUMNS,
  ATLAS_TILE_PX as T,
  TILES,
  type TileName,
} from "./blocks";
import { ATLAS_SIZE } from "./mesher";

type RGB = readonly [number, number, number];
type Pal = { hi: RGB; light: RGB; base: RGB; dark: RGB; deep: RGB };

const SEED = 0x7e3f01d;
const WHITE: RGB = [255, 255, 255];

const hex = (s: string): RGB => {
  const n = parseInt(s.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const hexes = (s: string): RGB[] => s.split(" ").map(hex);
const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const mul = (a: RGB, f: number): RGB => [a[0] * f, a[1] * f, a[2] * f];
/** Five tones, lightest first: "hi light base dark deep". */
const pal = (tones: string): Pal => {
  const [hi, light, base, dark, deep] = hexes(tones);
  return { hi, light, base, dark, deep };
};
/** 0 → dark, 0.5 → base, 1 → light. */
const ramp = (p: Pal, v: number): RGB =>
  v < 0.5 ? mix(p.dark, p.base, v * 2) : mix(p.base, p.light, (v - 0.5) * 2);
const wrap = (v: number): number => ((v % T) + T) % T;
/** Shortest signed offset on the wrapping tile. */
const wrapDelta = (d: number): number => d - T * Math.round(d / T);
/** Flat [x0, y0, x1, y1, …] lists keep coordinate tables compact. */
function* pairs(flat: readonly number[]): Generator<[number, number]> {
  for (let i = 0; i + 1 < flat.length; i += 2) yield [flat[i], flat[i + 1]];
}
const CORNER_STUDS = [2, 2, 12, 2, 2, 12, 12, 12];

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashName(name: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h ^ SEED) >>> 0;
}

/** One 16 x 16 tile. Coordinates wrap, so painters stay seamless by default. */
class Tile {
  readonly rgba = new Uint8ClampedArray(T * T * 4);
  readonly rand: () => number;
  constructor(seed: number) {
    this.rand = mulberry32(seed);
  }
  int(n: number): number {
    return Math.floor(this.rand() * n);
  }
  range(a: number, b: number): number {
    return a + this.rand() * (b - a);
  }
  pick<V>(list: readonly V[]): V {
    return list[this.int(list.length)];
  }
  private at(x: number, y: number): number {
    return (wrap(Math.floor(x)) + wrap(Math.floor(y)) * T) * 4;
  }
  set(x: number, y: number, c: RGB, a = 255): void {
    const i = this.at(x, y);
    this.rgba[i] = c[0];
    this.rgba[i + 1] = c[1];
    this.rgba[i + 2] = c[2];
    this.rgba[i + 3] = a;
  }
  get(x: number, y: number): RGB {
    const i = this.at(x, y);
    return [this.rgba[i], this.rgba[i + 1], this.rgba[i + 2]];
  }
  /** Blend an existing pixel toward a colour (keeps its alpha). */
  tint(x: number, y: number, c: RGB, t: number): void {
    this.set(x, y, mix(this.get(x, y), c, t), this.rgba[this.at(x, y) + 3]);
  }
  each(fn: (x: number, y: number) => RGB | null): void {
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const c = fn(x, y);
        if (c) this.set(x, y, c);
      }
  }
  rect(x: number, y: number, w: number, h: number, c: RGB): void {
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  /** Periodic smooth value noise in 0..1 with lattice spacing `cell` px. */
  noise(cell: number): (x: number, y: number) => number {
    const n = Math.max(1, Math.round(T / cell));
    const lattice = Array.from({ length: n * n }, () => this.rand());
    const v = (i: number, j: number) =>
      lattice[(((i % n) + n) % n) + (((j % n) + n) % n) * n];
    const s = (t: number) => t * t * (3 - 2 * t);
    return (x, y) => {
      const fx = ((x + 0.5) / T) * n - 0.5,
        fy = ((y + 0.5) / T) * n - 0.5;
      const ix = Math.floor(fx),
        iy = Math.floor(fy);
      const tx = s(fx - ix),
        ty = s(fy - iy);
      const a = v(ix, iy) + (v(ix + 1, iy) - v(ix, iy)) * tx;
      const b = v(ix, iy + 1) + (v(ix + 1, iy + 1) - v(ix, iy + 1)) * tx;
      return a + (b - a) * ty;
    };
  }
  /** Two-octave noise, still in 0..1. */
  fbm(cell = 8): (x: number, y: number) => number {
    const a = this.noise(cell),
      b = this.noise(cell / 2);
    return (x, y) => a(x, y) * 0.62 + b(x, y) * 0.38;
  }
  /** ASCII pixel art; characters missing from `key` ('.') leave the pixel untouched. */
  sprite(
    rows: readonly string[],
    key: Record<string, string>,
    ox = 0,
    oy = 0,
  ): void {
    const colors: Record<string, RGB> = {};
    for (const k in key) colors[k] = hex(key[k]);
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const c = colors[row[x]];
        if (c) this.set(ox + x, oy + y, c);
      }
    });
  }
}

// ───────────────────────────── palettes ─────────────────────────────

const GRASS = pal("#a8e486 #8bd86a #74c955 #63b94a #56a843");
const DIRT = pal("#c9976a #b8855a #a9764b #966541 #835637");
const PATH = pal("#f0d6a8 #e6c592 #d9b27c #c9a06a #b48b5a");
const CLAY = pal("#f0c3a0 #e2ab84 #d39872 #c38562 #a96f52");
const SAND = pal("#fff2c8 #fae7b5 #f2d99a #e6c886 #d6b574");
const STONE = pal("#c2bdbb #b5b0ae #a7a2a1 #99948f #857f80");
const STONE_DARK = pal("#9a97a3 #8b8895 #7d7a86 #6f6c79 #5c5966");
const BRICK_STONE = pal("#e2ddd4 #d6d0c6 #c9c3b8 #bab3a8 #a49d92");
const PAVING = pal("#f7f2e8 #efe8da #e6ddcc #d9cfbc #c4b8a3");
const PAVING_DARK = pal("#c4bdc0 #b7b0b3 #aaa3a7 #9c9599 #867f84");
const MARBLE = pal("#ffffff #fbf9fd #f4f1f7 #e9e3f0 #c9bbe6");
const PLANKS = pal("#e0ac72 #d39f63 #c58f53 #b47e45 #9a6936");
const PLANKS_DARK = pal("#9a6c48 #8a5f3c #7a5232 #6a4629 #563720");
const LEAVES = pal("#9fe07f #6cc65b #4fae4a #419a41 #357f37");
const CHERRY = pal("#fff0f6 #ffc7de #ffaed1 #f394bf #e27dac");
const SPRUCE = pal("#6fbf86 #46a066 #2f8653 #256f45 #1d5a39");
const AUTUMN = pal("#ffd98a #ffb866 #ff9f43 #ef8236 #d9662f");
const AUTUMN_RED = pal("#ffb08a #f77d5c #ea5d43 #d24a39 #b53b33");
const AUTUMN_YELLOW = pal("#fff0a0 #ffdc72 #ffc94f #f2b13d #df9a33");
const GOLD_LEAVES = pal("#fff8cf #ffe58e #ffd45e #f5bb47 #e09a35");
const MOSS = pal("#a6dc7c #86cc61 #6cb84c #5ba540 #4b9036");
const ROOF_RED = pal("#ffb8a2 #f57c69 #e8574f #c94443 #a33539");
const ROOF_BLUE = pal("#b0d6ff #71abf0 #4e8fe0 #3c72c2 #2d58a0");
const ROOF_TEAL = pal("#a6f2e0 #5fd0bc #3fb8a8 #2e988c #23776f");
const COPPER = pal("#ffd7ab #f3a86a #e48a4a #ca6d35 #a8572b");
const PATINA = pal("#b2f0dc #84dcc1 #62c4a7 #4ba88e #3a8571");
const IRON = pal("#e4e7ee #cfd3dc #b9bec8 #9da2ae #7a7f8c");
const GOLD = pal("#fffbe0 #ffe88f #ffd45e #f2b440 #d4902b");
const WATER = pal("#e0f8ff #8adcf8 #53c7f0 #3fb0e6 #2f8fd8");
const TERRACOTTA = pal("#f4b08a #e99c74 #de8a62 #d07b55 #bb6a48");
const HAY = pal("#fff0a8 #fbe082 #f2c94c #ddae3a #c4922c");
const PUMPKIN = pal("#ffd08a #ffad55 #ff9a3c #ef852e #d86a22");
const SNOW = pal("#ffffff #fbfdff #f2f7fd #e2ecf7 #cfdcec");
/** Wool palettes plus their stitch colour. */
const WOOL = {
  red: [pal("#ff9c96 #f37372 #e85a5a #d44b4f #bb3f47"), hex("#ffd9d2")],
  blue: [pal("#a9cbff #76a8f0 #5a92e4 #4779cb #3a65b0"), hex("#dcebff")],
  yellow: [pal("#fff3b8 #ffe07a #ffd04f #f2b93c #dda132"), hex("#fff7d8")],
  white: [pal("#ffffff #fdfaf4 #f5f0e6 #e7e0d3 #d6cdbd"), hex("#d3c8b6")],
  green: [pal("#b6eda8 #7dd174 #5cbf5a #4aa84b #3d8f40"), hex("#e1f7d8")],
} satisfies Record<string, [Pal, RGB]>;

// ───────────────────────────── shared painters ─────────────────────────────

/** Soft two-octave ground noise; `contrast` 1 spans the full dark..light ramp. */
function ground(t: Tile, p: Pal, contrast = 0.55, cell = 8): void {
  const n = t.fbm(cell);
  t.each((x, y) => ramp(p, 0.5 + (n(x, y) - 0.5) * 2 * contrast));
}

function specks(t: Tile, count: number, c: RGB, strength = 1): void {
  for (let i = 0; i < count; i++) t.tint(t.int(T), t.int(T), c, strength);
}

/** Small rounded pebbles: light body, highlight, soft shadow below-right. */
function pebbles(
  t: Tile,
  count: number,
  body: readonly RGB[],
  shadow: RGB,
  strength = 0.55,
): void {
  for (let i = 0; i < count; i++) {
    const x = t.int(T),
      y = t.int(T);
    const c = t.pick(body);
    const w = 1 + t.int(2),
      h = 1 + (w > 1 ? t.int(2) : 0);
    t.rect(x, y, w, h, c);
    t.set(x, y, mix(c, WHITE, 0.3));
    for (let k = 0; k < w; k++) t.tint(x + k, y + h, shadow, strength);
    t.tint(x + w, y + h - 1, shadow, strength * 0.6);
  }
}

type CellInfo = {
  cell: number;
  d1: number;
  d2: number;
  dx: number;
  dy: number;
};
/** Wrapped Voronoi cells around jittered points on a g x g lattice. */
function cells(
  t: Tile,
  g: number,
  jitter = 0.7,
): { at: CellInfo[]; count: number } {
  const step = T / g;
  const pts: [number, number][] = [];
  for (let j = 0; j < g; j++)
    for (let i = 0; i < g; i++)
      pts.push([
        (i + 0.5 + (j % 2) * 0.5 + (t.rand() - 0.5) * jitter) * step,
        (j + 0.5 + (t.rand() - 0.5) * jitter) * step,
      ]);
  const at: CellInfo[] = [];
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const info = { cell: 0, d1: 1e9, d2: 1e9, dx: 0, dy: 0 };
      pts.forEach(([px, py], k) => {
        const ox = wrapDelta(x + 0.5 - px),
          oy = wrapDelta(y + 0.5 - py);
        const d = Math.hypot(ox, oy);
        if (d < info.d1) {
          info.d2 = info.d1;
          Object.assign(info, { d1: d, cell: k, dx: ox, dy: oy });
        } else if (d < info.d2) info.d2 = d;
      });
      at.push(info);
    }
  return { at, count: pts.length };
}

/** Rounded stones with soft gaps (cobble, gravel), lit from the top-left. */
function stones(
  t: Tile,
  g: number,
  tones: readonly RGB[],
  gap: RGB,
  gapWidth: number,
  light: number,
): void {
  const { at, count } = cells(t, g);
  const tone = Array.from({ length: count }, () => t.pick(tones));
  const n = t.noise(4);
  at.forEach(({ cell, d1, d2, dx, dy }, i) => {
    const x = i % T,
      y = Math.floor(i / T);
    const edge = d2 - d1;
    if (edge < gapWidth) return t.set(x, y, gap);
    const r = Math.max(1.5, d1 + edge / 2);
    let f = 1 + light * Math.max(-1, Math.min(1, (-dx * 0.7 - dy) / r)) * 0.18;
    // Rim: a lit lip on the upper-left, a soft shadow toward the gap below-right.
    if (edge < gapWidth + 1) f *= dx + dy > 0 ? 0.9 : 1.05;
    f += (n(x, y) - 0.5) * 0.05;
    t.set(x, y, mul(tone[cell], f));
  });
}

type BrickLayout = {
  courseH: number;
  brickW: number;
  /** Joint offset per course (cycled). */
  offsets: readonly number[];
  tones: readonly RGB[];
  mortar: RGB;
  hi: RGB;
  lo: RGB;
};
/** Running-bond bricks; returns the mortar mask for later decoration. */
function bricks(t: Tile, b: BrickLayout): boolean[] {
  const mortar: boolean[] = [];
  const n = t.noise(4);
  const tones = Array.from({ length: 64 }, () => t.pick(b.tones));
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const course = Math.floor(y / b.courseH),
        cy = y % b.courseH;
      const bx = wrap(x - b.offsets[course % b.offsets.length]);
      const bi = Math.floor(bx / b.brickW),
        cx = bx % b.brickW;
      const isMortar = cy === b.courseH - 1 || cx === b.brickW - 1;
      mortar.push(isMortar);
      if (isMortar) {
        t.set(x, y, b.mortar);
        continue;
      }
      let c = mul(tones[(course * 8 + bi) % 64], 1 + (n(x, y) - 0.5) * 0.08);
      if (cy === 0) c = mix(c, b.hi, 0.55);
      else if (cx === 0) c = mix(c, b.hi, 0.3);
      if (cy === b.courseH - 2 && b.courseH > 3) c = mix(c, b.lo, 0.5);
      else if (cx === b.brickW - 2) c = mix(c, b.lo, 0.35);
      t.set(x, y, c);
    }
  return mortar;
}

/** Bubbly canopy: overlapping round clusters lit from the top-left. No holes. */
function bubbles(
  t: Tile,
  p: Pal,
  palettes: readonly Pal[] = [p],
  g = 3,
  rMin = 3.1,
  rMax = 3.9,
): void {
  const n = t.noise(4);
  t.each((x, y) => mix(p.deep, p.dark, n(x, y) * 0.8));
  const list: { x: number; y: number; r: number; p: Pal }[] = [];
  const step = T / g;
  for (let j = 0; j < g; j++)
    for (let i = 0; i < g; i++)
      list.push({
        x: (i + 0.5 + (j % 2) * 0.5 + (t.rand() - 0.5) * 0.5) * step,
        y: (j + 0.5 + (t.rand() - 0.5) * 0.5) * step,
        r: t.range(rMin, rMax),
        p: t.pick(palettes),
      });
  // Lower clusters overlap the ones above, so every bump keeps a lit crown.
  list.sort((a, b) => a.y - b.y);
  for (const b of list) {
    const R = Math.ceil(b.r);
    for (let oy = -R; oy <= R; oy++)
      for (let ox = -R; ox <= R; ox++) {
        const px = Math.floor(b.x) + ox,
          py = Math.floor(b.y) + oy;
        const dx = px + 0.5 - b.x,
          dy = py + 0.5 - b.y;
        const d = Math.hypot(dx, dy);
        if (d > b.r) continue;
        const l = (-dx * 0.55 - dy) / b.r;
        let c = b.p.base;
        if (l > 0.42) c = b.p.light;
        else if (l < -0.45 && d > b.r - 1.3) c = b.p.dark;
        t.set(px, py, c);
      }
    const hx = Math.floor(b.x - b.r * 0.38),
      hy = Math.floor(b.y - b.r * 0.55);
    t.set(hx, hy, b.p.hi);
    t.set(hx + 1, hy, mix(b.p.hi, b.p.light, 0.5));
  }
}

/** Rows of big rounded shingles (scallops point down, rows offset by half). */
function shingles(t: Tile, p: Pal): void {
  const scale = [
    "LLLLLLLL",
    "LHHLLLLL",
    "BHBBBBBB",
    "BBBBBBBB",
    "dBBBBBBd",
    "xBBBBBBx",
    "xdBBBBdx",
    "xxddddxx",
  ];
  const key: Record<string, RGB> = {
    H: mix(p.light, p.hi, 0.6),
    L: p.light,
    B: p.base,
    d: p.dark,
    x: p.deep,
  };
  const n = t.noise(4);
  t.each((x, y) => {
    const row = Math.floor(y / 8);
    const c = key[scale[y % 8][wrap(x + (row % 2) * 4) % 8]];
    return mul(c, 1 + (n(x, y) - 0.5) * 0.06);
  });
}

/** Soft cloth with a woven texture and a stitched seam just inside the edge. */
function wool(t: Tile, p: Pal, stitch: RGB): void {
  const n = t.noise(4);
  t.each((x, y) => {
    let v = 0.5 + (n(x, y) - 0.5) * 0.5;
    if ((x + y * 2) % 4 === 0) v += 0.16;
    if ((x + y * 2) % 4 === 2) v -= 0.1;
    return ramp(p, v);
  });
  for (let i = 1; i < T - 1; i++) {
    if (i % 3 === 2) continue;
    t.set(i, 1, mix(stitch, p.base, 0.15));
    t.set(i, T - 2, mix(stitch, p.base, 0.25));
    t.set(1, i, mix(stitch, p.base, 0.15));
    t.set(T - 2, i, mix(stitch, p.base, 0.25));
  }
  for (let i = 0; i < T; i++) {
    t.tint(i, 0, p.light, 0.35);
    t.tint(0, i, p.light, 0.25);
    t.tint(i, T - 1, p.deep, 0.35);
    t.tint(T - 1, i, p.deep, 0.25);
  }
}

/** Raised plate with a soft bevel. */
function plate(t: Tile, p: Pal, noise = 0.3): void {
  ground(t, p, noise, 8);
  for (let i = 0; i < T; i++) {
    t.set(i, 0, p.light);
    t.set(0, i, p.light);
    t.set(i, T - 1, p.deep);
    t.set(T - 1, i, p.deep);
  }
  for (let i = 1; i < T - 1; i++) {
    t.tint(i, 1, p.light, 0.4);
    t.tint(1, i, p.light, 0.3);
    t.tint(i, T - 2, p.dark, 0.5);
    t.tint(T - 2, i, p.dark, 0.4);
  }
}
/** Diagonal shine band (x + y in [at, at + width)). */
function shine(
  t: Tile,
  c: RGB,
  at: number,
  width: number,
  strength: number,
): void {
  for (let y = 1; y < T - 1; y++)
    for (let x = 1; x < T - 1; x++) {
      const d = x + y - at;
      if (d >= 0 && d < width) t.tint(x, y, c, strength);
    }
}
function studs(t: Tile, p: Pal, flat: readonly number[] = CORNER_STUDS): void {
  for (const [x, y] of pairs(flat)) {
    t.set(x, y, p.hi);
    t.set(x + 1, y, p.light);
    t.set(x, y + 1, p.base);
    t.set(x + 1, y + 1, p.deep);
  }
}

/** Horizontal boards with staggered butt joints, soft grain and nail heads. */
function boards(t: Tile, p: Pal, seam: RGB): void {
  const n = t.noise(8);
  const tones = [
    p.base,
    mix(p.base, p.light, 0.35),
    mix(p.base, p.dark, 0.3),
    p.base,
  ];
  for (let row = 0; row < 4; row++) {
    const tone = tones[(row + t.int(4)) % 4];
    const joint = (row * 7 + 3 + t.int(3)) % T;
    for (let y = row * 4; y < row * 4 + 4; y++)
      for (let x = 0; x < T; x++) {
        const cy = y - row * 4;
        let c = mul(tone, 1 + (n(x, y) - 0.5) * 0.08);
        if (cy === 3) c = seam;
        else if (cy === 0) c = mix(c, p.light, 0.45);
        else if (cy === 2) c = mix(c, p.dark, 0.25);
        if (x === joint && cy < 3) c = mix(seam, c, 0.15);
        t.set(x, y, c);
      }
    for (let k = 0; k < 2; k++) {
      const gx = t.int(T),
        gy = row * 4 + 1 + t.int(2),
        len = 2 + t.int(4);
      for (let i = 0; i < len; i++)
        if (wrap(gx + i) !== joint) t.tint(gx + i, gy, p.dark, 0.45);
    }
    t.tint(joint + 1, row * 4 + 1, p.deep, 0.6);
    t.tint(joint - 1, row * 4 + 1, p.deep, 0.6);
  }
}

// ───────────────────────────── tiles ─────────────────────────────

function grassTop(t: Tile): void {
  // Mostly fine-grained variation: broad blotches would reveal the block grid.
  const a = t.noise(4),
    b = t.noise(2);
  t.each((x, y) =>
    ramp(GRASS, 0.5 + (a(x, y) - 0.5) * 0.75 + (b(x, y) - 0.5) * 0.55),
  );
  // Little tufts: a bright tip over a shaded base.
  for (let i = 0; i < 12; i++) {
    const x = t.int(T),
      y = t.int(T);
    t.tint(x, y, GRASS.hi, 0.55);
    t.tint(x, y + 1, GRASS.deep, 0.35);
  }
  specks(t, 8, GRASS.light, 0.6);
  // Two tiny flowers, softened so the per-block repeat stays gentle.
  t.tint(4, 3, hex("#fff7e8"), 0.6);
  t.tint(12, 11, hex("#ffe27a"), 0.55);
}

function dirt(t: Tile): void {
  ground(t, DIRT, 0.5, 8);
  specks(t, 14, DIRT.deep, 0.55);
  specks(t, 10, DIRT.light, 0.6);
  pebbles(t, 3, hexes("#c7a07a #bfa48a"), DIRT.deep, 0.5);
}

function grassSide(t: Tile): void {
  dirt(t);
  // A wavy fringe 3-5 px deep with two longer drips, wrapping seamlessly.
  const depth: number[] = [];
  let d = 4;
  for (let x = 0; x < T; x++) {
    d = Math.max(3, Math.min(5, d + t.pick([-1, 0, 0, 1])));
    depth.push(d);
  }
  depth[T - 1] = Math.max(3, Math.min(depth[0] + 1, depth[T - 2]));
  for (let k = 0; k < 2; k++) depth[2 + k * 8 + t.int(4)] += 2;
  const n = t.noise(4);
  for (let x = 0; x < T; x++) {
    const h = depth[x];
    for (let y = 0; y < h; y++) {
      let c = ramp(GRASS, 0.5 + (n(x, y) - 0.5) * 0.6);
      if (y === 0) c = mix(GRASS.light, GRASS.hi, 0.35);
      else if (y === h - 1) c = GRASS.dark;
      t.set(x, y, c);
    }
    t.tint(x, h, DIRT.deep, 0.45);
  }
  for (let i = 0; i < 4; i++) t.set(t.int(T), 1, GRASS.light);
}

function pathTop(p: Pal, pebbleTones: string) {
  return (t: Tile) => {
    ground(t, p, 0.45, 8);
    specks(t, 10, p.deep, 0.45);
    pebbles(t, 9, hexes(pebbleTones), p.deep, 0.55);
  };
}

function sand(t: Tile): void {
  ground(t, SAND, 0.4, 8);
  // Soft wind ripples.
  for (let k = 0; k < 3; k++) {
    const y0 = 2 + k * 5 + t.int(2),
      x0 = t.int(T),
      len = 5 + t.int(4);
    for (let i = 0; i < len; i++) {
      const y = y0 + (i > len / 2 ? 1 : 0);
      t.tint(x0 + i, y, SAND.hi, 0.6);
      t.tint(x0 + i, y + 1, SAND.dark, 0.35);
    }
  }
  specks(t, 8, SAND.deep, 0.5);
  specks(t, 4, hex("#e9b48e"), 0.6);
}

function stone(p: Pal) {
  return (t: Tile) => {
    ground(t, p, 0.6, 8);
    specks(t, 8, p.light, 0.6);
    // Two short soft cracks with a lit lip below.
    for (let k = 0; k < 2; k++) {
      let x = t.int(T),
        y = 2 + t.int(12);
      const len = 3 + t.int(3);
      for (let i = 0; i < len; i++) {
        t.tint(x, y, p.deep, 0.7);
        t.tint(x, y + 1, p.hi, 0.35);
        x += 1;
        if (t.rand() < 0.4) y += t.rand() < 0.5 ? 1 : -1;
      }
    }
  };
}

const STONE_BRICK: BrickLayout = {
  courseH: 8,
  brickW: 16,
  offsets: [4, 12],
  tones: hexes("#c9c3b8 #cfc9bd #c3bdb3 #ccc5bb"),
  mortar: hex("#a49e94"),
  hi: BRICK_STONE.hi,
  lo: BRICK_STONE.deep,
};

function stoneBrick(t: Tile): void {
  bricks(t, STONE_BRICK);
  specks(t, 6, BRICK_STONE.dark, 0.5);
}

function mossyBrick(t: Tile): void {
  const mortar = bricks(t, STONE_BRICK);
  const isMortar = (x: number, y: number) => mortar[wrap(y) * T + wrap(x)];
  const n = t.noise(4);
  // Moss settles in the joints and on the top lip of each course.
  const mossy = (x: number, y: number) =>
    n(wrap(x), wrap(y)) +
      (isMortar(x, y) ? 0.3 : 0) +
      (isMortar(x, y - 1) ? 0.18 : 0) >
    0.82;
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      if (!mossy(x, y)) continue;
      t.set(
        x,
        y,
        mossy(x, y - 1)
          ? mossy(x, y + 1)
            ? MOSS.base
            : MOSS.dark
          : MOSS.light,
      );
      if (!mossy(x, y + 1)) t.tint(x, y + 1, MOSS.deep, 0.3);
    }
  // Two short drips.
  for (let k = 0; k < 2; k++) {
    const x = t.int(T),
      y = k * 8 + 7;
    if (mossy(x, y)) {
      t.set(x, y + 1, MOSS.dark);
      t.set(x, y + 2, MOSS.deep);
    }
  }
}

function paving(p: Pal, grout: RGB) {
  return (t: Tile) => {
    ground(t, p, 0.35, 8);
    for (let i = 0; i < T; i++) {
      t.set(i, T - 1, grout);
      t.set(T - 1, i, grout);
      if (i < T - 1) {
        t.tint(i, 0, p.hi, 0.6);
        t.tint(0, i, p.hi, 0.45);
        t.tint(i, T - 2, p.deep, 0.35);
        t.tint(T - 2, i, p.deep, 0.3);
      }
    }
    specks(t, 5, p.deep, 0.35);
    t.tint(T - 3, T - 3, p.deep, 0.4);
  };
}

function marble(t: Tile): void {
  ground(t, MARBLE, 0.4, 8);
  const vein = hex("#cbbde9"),
    soft = hex("#e2d9f3");
  // Diagonal veins wrap exactly (slope 1, periodic wobble) so blocks join up.
  const veins = [
    { y0: 2, amp: 1.6, f: 1, phase: t.range(0, 6), dir: 1, c: vein },
    { y0: 9, amp: 1.2, f: 2, phase: t.range(0, 6), dir: 1, c: soft },
    { y0: 5, amp: 1, f: 1, phase: t.range(0, 6), dir: -1, c: soft },
  ];
  for (const v of veins)
    for (let x = 0; x < T; x++) {
      const y = Math.round(
        v.y0 +
          v.dir * x +
          v.amp * Math.sin((x / T) * Math.PI * 2 * v.f + v.phase),
      );
      t.set(x, y, v.c);
      if (v.c === vein) t.tint(x, y + 1, soft, 0.5);
    }
  t.tint(3, 2, MARBLE.hi, 1);
  t.tint(4, 2, MARBLE.hi, 1);
  t.tint(3, 3, MARBLE.hi, 0.8);
}

function brick(t: Tile): void {
  bricks(t, {
    courseH: 4,
    brickW: 8,
    offsets: [1, 5],
    tones: hexes("#d76a51 #cf5f48 #df7559 #c95a43 #d36f4d"),
    mortar: hex("#ecd8c2"),
    hi: hex("#f39a7c"),
    lo: hex("#b2483a"),
  });
}

function logSide(t: Tile): void {
  const p = pal("#b47a4a #9b6740 #8b5a36 #79502f #5c3a21");
  const n = t.noise(4);
  t.each((x, y) => ramp(p, 0.5 + (n(x, y) - 0.5) * 0.5));
  // Vertical bark ridges: straight grooves with a single jog and a lit edge.
  for (const g of [1, 5, 9, 13]) {
    const a = t.int(T),
      b = a + 4 + t.int(6),
      side = t.pick([-1, 1]);
    for (let y = 0; y < T; y++) {
      const x = g + ((y - a + T) % T < b - a ? side : 0);
      t.set(x, y, p.deep);
      t.tint(x + 1, y, p.light, 0.45);
      t.tint(x - 1, y, p.dark, 0.3);
    }
    // Cracks across the bark plate to the right of the groove.
    for (let k = 0; k < 2; k++) {
      const y = k * 8 + t.int(6);
      t.tint(g + 2, y, p.deep, 0.55);
      t.tint(g + 3, y, p.deep, 0.4);
      t.tint(g + 2, y - 1, p.hi, 0.3);
    }
  }
  specks(t, 5, p.light, 0.4);
}

function logTop(t: Tile): void {
  const ringLight = hex("#ebc68f"),
    ringBase = hex("#deb57b"),
    ring = hex("#c99a5e");
  const barkC = hex("#7d4f2e"),
    barkL = hex("#97633a");
  t.each((x, y) => {
    const dx = x - 7.5,
      dy = y - 7.5;
    const cheb = Math.max(Math.abs(dx), Math.abs(dy));
    const r = cheb * 0.55 + Math.hypot(dx, dy) * 0.45;
    if (cheb >= 7) return (x + y) % 3 === 0 ? barkL : barkC;
    if (cheb >= 6.5) return mix(barkC, ring, 0.6);
    if (r < 1.2) return ring;
    const k = Math.round(r) % 3;
    return k === 0 ? ring : k === 1 ? ringLight : ringBase;
  });
  for (let i = 1; i < T - 1; i++) {
    t.tint(i, 0, barkL, 0.6);
    t.tint(0, i, barkL, 0.4);
  }
  t.tint(4, 5, ring, 0.5);
}

function birchSide(t: Tile): void {
  const p = pal("#ffffff #fbf8f2 #f2eee6 #e2dcd2 #cfc8bd");
  ground(t, p, 0.4, 8);
  const ink = hex("#3e3537"),
    inkSoft = hex("#6e6466");
  // [x, y, length] dashes.
  const dashes = [
    1, 2, 4, 9, 1, 3, 5, 6, 3, 12, 7, 4, 2, 10, 3, 8, 12, 4, 14, 13, 2,
  ];
  for (let k = 0; k < dashes.length; k += 3) {
    const [x, y, len] = dashes.slice(k, k + 3);
    for (let i = 0; i < len; i++) {
      t.set(x + i, y, i === 0 || i === len - 1 ? inkSoft : ink);
      t.tint(x + i, y + 1, p.deep, 0.5);
    }
  }
  for (let k = 0; k < 6; k++) {
    const x = t.int(T),
      y = t.int(T);
    for (let i = 0; i < 3; i++) t.tint(x, y + i, p.deep, 0.35);
  }
}

function spruce(t: Tile): void {
  const p = SPRUCE;
  const n = t.noise(4);
  t.each((x, y) => mix(p.deep, p.dark, 0.3 + n(x, y) * 0.6));
  // Rows of downward chevron sprigs, staggered.
  for (let row = 0; row < 4; row++)
    for (let k = 0; k < 3; k++) {
      const cx = Math.floor(k * 5.33 + (row % 2) * 2.6 + t.range(-0.6, 0.6)),
        cy = row * 4;
      t.set(cx, cy, p.light);
      t.set(cx, cy + 1, p.base);
      t.set(cx, cy + 2, p.base);
      for (let s = 1; s <= 2; s++) {
        t.set(cx - s, cy + s, s === 1 ? p.light : p.base);
        t.set(cx + s, cy + s, p.base);
        t.set(cx - s, cy + s + 1, p.dark);
        t.set(cx + s, cy + s + 1, p.dark);
      }
      t.tint(cx - 1, cy, p.hi, 0.5);
    }
}

function leavesCherry(t: Tile): void {
  bubbles(t, CHERRY);
  const petal = hex("#fffafc"),
    heart = hex("#ff7fae");
  for (const [x, y] of pairs([3, 3, 11, 5, 6, 10, 13, 13])) {
    const ox = x + t.int(2),
      oy = y + t.int(2);
    t.set(ox, oy, heart);
    t.set(ox - 1, oy, petal);
    t.set(ox + 1, oy, petal);
    t.set(ox, oy - 1, petal);
    t.set(ox, oy + 1, mix(petal, CHERRY.light, 0.4));
  }
}

function plaster(t: Tile): void {
  const p = pal("#fffdf6 #fff8ea #fff3df #f6e7cd #ead8b9");
  ground(t, p, 0.3, 8);
  specks(t, 6, p.deep, 0.35);
  specks(t, 4, p.hi, 0.8);
}

function timber(t: Tile): void {
  const p = pal("#87603f #6d4b30 #5e3f27 #4f3420 #3f2918");
  const n = t.noise(4);
  t.each((x, y) => ramp(p, 0.5 + (n(x, y) - 0.5) * 0.5));
  for (let k = 0; k < 4; k++) {
    const x = 2 + t.int(12),
      y = t.int(T),
      len = 3 + t.int(5);
    for (let i = 0; i < len; i++) t.tint(x, y + i, p.deep, 0.45);
  }
  for (let i = 0; i < T; i++) {
    t.tint(0, i, p.light, 0.55);
    t.tint(1, i, p.light, 0.2);
    t.tint(T - 1, i, p.deep, 0.6);
  }
}

function glassLit(t: Tile): void {
  const frame = hex("#6b4429"),
    frameLit = hex("#8f5f39"),
    frameDeep = hex("#4e301c");
  const core = hex("#fffbe6"),
    warm = hex("#ffe58a"),
    edge = hex("#ffb54d");
  const curtain = hex("#ef7d72"),
    curtainDark = hex("#cf5d5a");
  t.each((x, y) => {
    const r = Math.min(1, Math.hypot((x - 7.5) / 6, ((y - 7.5) / 6) * 1.1));
    return r < 0.5
      ? mix(core, warm, r / 0.5)
      : mix(warm, edge, (r - 0.5) / 0.5);
  });
  // Curtains gathered in the outer top corners of the upper panes: [y, width].
  for (const [y, w] of pairs([2, 4, 3, 3, 4, 2, 5, 1, 6, 1]))
    for (let i = 0; i < w; i++) {
      const c = i === w - 1 ? curtainDark : curtain;
      t.set(2 + i, y, c);
      t.set(T - 3 - i, y, c);
    }
  for (const [x, y] of pairs([4, 9, 5, 10, 10, 9, 11, 10])) t.set(x, y, core);
  // Frame: 2 px border and a 2 px cross.
  for (let i = 0; i < T; i++)
    for (const k of [0, 1, 7, 8, 14, 15]) {
      const c =
        k === 0 || k === 7 ? frameLit : k === 15 || k === 8 ? frameDeep : frame;
      t.set(i, k, c);
      t.set(k, i, c);
    }
  for (const [x, y] of pairs([0, 0, 15, 0, 0, 15, 15, 15])) t.set(x, y, frame);
}

function door(t: Tile): void {
  const p = pal("#d8975a #c4834a #b5743d #a06333 #7f4c27");
  const n = t.noise(8);
  t.each((x, y) => {
    const c = mul(
      p.base,
      1 + (n(x, y) - 0.5) * 0.1 + (x % 8 < 4 ? 0.03 : -0.02),
    );
    return x % 4 === 3 ? p.deep : x % 4 === 0 ? mix(c, p.light, 0.45) : c;
  });
  for (let x = 0; x < T; x++) {
    t.set(x, 0, p.deep);
    t.tint(x, 1, p.light, 0.3);
    t.set(x, T - 1, p.deep);
  }
  // Tiny warm window.
  t.rect(5, 2, 6, 5, p.deep);
  t.rect(6, 3, 4, 3, hex("#ffe08a"));
  for (const [x, y] of pairs([6, 3, 7, 3])) t.set(x, y, hex("#fff8d8"));
  for (const [x, y] of pairs([8, 4, 9, 5])) t.set(x, y, hex("#ffc85e"));
  // Iron hinges.
  const iron = hex("#4a4552"),
    ironHi = hex("#7d7788");
  for (const hy of [4, 11]) {
    for (let x = 0; x < 6; x++) {
      t.set(x, hy, ironHi);
      t.set(x, hy + 1, iron);
    }
    t.set(5, hy + 1, ironHi);
    t.set(2, hy, hex("#b0aab8"));
  }
  // Round brass handle.
  t.sprite(["hb", "bd"], { h: "#fff3b0", b: "#ffd45e", d: "#c98f2e" }, 12, 8);
  t.tint(14, 9, p.deep, 0.5);
  t.tint(13, 10, p.deep, 0.5);
}

function copper(t: Tile): void {
  plate(t, COPPER, 0.35);
  shine(t, COPPER.hi, 6, 2, 0.55);
  shine(t, COPPER.hi, 11, 1, 0.3);
  specks(t, 5, COPPER.dark, 0.4);
  studs(t, COPPER);
}

function patina(t: Tile): void {
  plate(t, PATINA, 0.45);
  // Verdigris streaks running down the plate.
  for (let k = 0; k < 5; k++) {
    const x = 2 + t.int(12),
      y = 2 + t.int(6),
      len = 3 + t.int(6);
    const c = k % 2 ? PATINA.hi : PATINA.deep;
    for (let i = 0; i < len; i++) t.tint(x, y + i, c, 0.4 - i * 0.03);
  }
  // Copper still peeking through: rivets and a few small flecks.
  studs(t, COPPER);
  const fleck = hex("#e08f55");
  for (const [x, y] of pairs([6, 4, 10, 9, 4, 11, 12, 6])) {
    t.set(x, y, fleck);
    t.tint(x + 1, y, fleck, 0.5);
    t.tint(x, y + 1, PATINA.deep, 0.4);
  }
}

function iron(t: Tile): void {
  plate(t, IRON, 0.2);
  for (let y = 2; y < T - 2; y += 2)
    for (let x = 2; x < T - 2; x++) t.tint(x, y, IRON.light, 0.18);
  studs(t, IRON);
}

function gold(t: Tile): void {
  plate(t, GOLD, 0.35);
  shine(t, GOLD.hi, 5, 2, 0.7);
  shine(t, GOLD.hi, 10, 1, 0.4);
  t.sprite([".h.", "hWh", ".h."], { h: "#fffbe0", W: "#ffffff" }, 10, 3);
}

function lantern(t: Tile): void {
  const frameDeep = hex("#38323f"),
    frame = hex("#544c5e"),
    frameLit = hex("#7a7186");
  const core = hex("#fffdf0"),
    warm = hex("#ffe27a"),
    amber = hex("#ffae45"),
    edge = hex("#ff8f3a");
  t.each((x, y) => {
    const r = Math.hypot((x - 7.5) / 5.5, (y - 8) / 6);
    if (r < 0.35) return mix(core, warm, r / 0.35);
    if (r < 0.75) return mix(warm, amber, (r - 0.35) / 0.4);
    return mix(amber, edge, Math.min(1, (r - 0.75) / 0.4));
  });
  // Candle flame.
  t.sprite(
    ["...w...", "..wWw..", "..WWW..", "..WWW..", "...W..."],
    { w: "#fff7c2", W: "#ffffff" },
    5,
    5,
  );
  // Iron frame with a cap and corner studs.
  for (let i = 0; i < T; i++) {
    t.set(i, 0, frameDeep);
    t.set(i, 1, frameLit);
    t.set(i, 2, frame);
    t.set(i, T - 1, frameDeep);
    t.set(i, T - 2, frame);
    t.set(0, i, frameDeep);
    t.set(1, i, frame);
    t.set(T - 1, i, frameDeep);
    t.set(T - 2, i, frame);
  }
  for (let y = 3; y < T - 2; y++) {
    t.tint(1, y, frameLit, 0.4);
    t.set(2, y, mix(edge, frame, 0.35));
    t.set(T - 3, y, mix(edge, frame, 0.35));
  }
  for (const [x, y] of pairs([1, 1, 14, 1, 1, 14, 14, 14]))
    t.set(x, y, hex("#a39ab0"));
}

function water(t: Tile): void {
  const n = t.fbm(8);
  t.each((x, y) => mix(WATER.deep, WATER.light, 0.25 + n(x, y) * 0.5));
  for (let k = 0; k < 5; k++) {
    const x0 = t.int(T),
      y0 = 1 + k * 3 + t.int(2),
      len = 3 + t.int(3);
    for (let i = 0; i < len; i++) {
      const lift = i === 0 || i === len - 1 ? 1 : 0;
      t.set(x0 + i, y0 + lift, WATER.hi);
      t.tint(x0 + i, y0 + 1 + lift, WATER.light, 0.5);
    }
  }
}

function terracotta(t: Tile): void {
  ground(t, TERRACOTTA, 0.35, 8);
  specks(t, 8, TERRACOTTA.deep, 0.4);
  specks(t, 5, TERRACOTTA.hi, 0.5);
}

function hayTop(t: Tile): void {
  const n = t.noise(4);
  t.each((x, y) => ramp(HAY, 0.5 + (n(x, y) - 0.5) * 0.5));
  // Cut stalk ends in loose diagonal rows: a soft hollow with a lit rim.
  for (let y = 1; y < T; y += 3)
    for (let x = (y % 2) * 2; x < T; x += 4) {
      const jx = x + t.int(2),
        jy = y + t.int(2);
      t.tint(jx, jy, HAY.deep, 0.45);
      t.tint(jx - 1, jy - 1, HAY.hi, 0.5);
    }
  for (let i = 0; i < T; i++) {
    t.tint(i, 0, HAY.light, 0.4);
    t.tint(0, i, HAY.light, 0.3);
    t.tint(i, T - 1, HAY.deep, 0.45);
    t.tint(T - 1, i, HAY.deep, 0.45);
  }
}

function haySide(t: Tile): void {
  const cols = Array.from({ length: T }, () => t.pick([0.35, 0.5, 0.6, 0.75]));
  const n = t.noise(4);
  t.each((x, y) => ramp(HAY, cols[x] + (n(x, y) - 0.5) * 0.3));
  for (let k = 0; k < 10; k++) {
    const x = t.int(T),
      y = t.int(T),
      len = 3 + t.int(4);
    const c = t.rand() < 0.5 ? HAY.hi : HAY.deep;
    for (let i = 0; i < len; i++) t.tint(x, y + i, c, 0.5);
  }
  const band = hex("#e0493e"),
    bandHi = hex("#f47460"),
    bandLo = hex("#a8322f");
  for (const by of [3, 11])
    for (let x = 0; x < T; x++) {
      t.set(x, by, x % 4 === 1 ? mix(band, bandHi, 0.5) : bandHi);
      t.set(x, by + 1, band);
      t.tint(x, by + 2, bandLo, 0.45);
    }
}

function pumpkinSide(t: Tile): void {
  const ribs = [PUMPKIN.deep, PUMPKIN.light, PUMPKIN.base, PUMPKIN.dark];
  t.each((x, y) => {
    const v = Math.abs(y - 7.5) / 7.5;
    return mul(ribs[x % 4], 1.03 - v * v * 0.16);
  });
  for (let x = 1; x < T; x += 4) {
    t.tint(x, 3, PUMPKIN.hi, 0.6);
    t.tint(x, 4, PUMPKIN.hi, 0.35);
  }
}

function pumpkinTop(t: Tile): void {
  t.each((x, y) => {
    const dx = x - 7.5,
      dy = y - 7.5;
    const k = ((((Math.atan2(dy, dx) / (Math.PI * 2)) * 8) % 1) + 1) % 1;
    const c =
      k < 0.18
        ? PUMPKIN.deep
        : k < 0.45
          ? PUMPKIN.light
          : k < 0.8
            ? PUMPKIN.base
            : PUMPKIN.dark;
    return mul(c, 1.04 - (Math.hypot(dx, dy) / 10.6) * 0.18);
  });
  t.sprite(
    ["..ll..", ".LgGg.", "LdgGgd", "dggGgd", ".dggd.", "..dd.."],
    { l: "#8bd06a", L: "#6fbf4f", g: "#6e8b3d", G: "#93ad5a", d: "#4b6327" },
    5,
    5,
  );
}

function crate(t: Tile): void {
  const p = pal("#f0c58e #e6b67c #d9a66b #c38f57 #9c6b3a");
  const n = t.noise(8);
  t.each((x, y) => {
    const c = mul(p.base, 1 + (n(x, y) - 0.5) * 0.1);
    return y % 5 === 0
      ? mix(c, p.light, 0.4)
      : y % 5 === 4
        ? mix(c, p.dark, 0.5)
        : c;
  });
  // Diagonal brace, bottom-left to top-right.
  for (let i = 1; i < T - 1; i++) {
    const y = T - 1 - i;
    t.set(i, y, p.dark);
    t.set(i, y - 1, mix(p.base, p.light, 0.3));
    t.set(i + 1, y, p.deep);
    t.set(i - 1, y - 1, mix(p.light, p.hi, 0.4));
  }
  for (let i = 0; i < T; i++) {
    t.set(i, 0, p.light);
    t.set(i, 1, p.dark);
    t.set(0, i, p.light);
    t.set(1, i, p.dark);
    t.set(i, T - 1, p.deep);
    t.set(i, T - 2, p.dark);
    t.set(T - 1, i, p.deep);
    t.set(T - 2, i, p.dark);
  }
  for (const [x, y] of pairs([1, 1, 14, 1, 1, 14, 14, 14]))
    t.set(x, y, hex("#6b4a2e"));
}

function barrelTop(t: Tile): void {
  const lid = pal("#e2ad74 #d39e63 #c38c53 #b07a45 #8a5a32");
  const n = t.noise(8);
  t.each((x, y) => {
    const c = mul(lid.base, 1 + (n(x, y) - 0.5) * 0.1);
    return x % 4 === 3 ? lid.dark : x % 4 === 0 ? mix(c, lid.light, 0.35) : c;
  });
  const stave = hex("#9a6a3e");
  for (let i = 0; i < T; i++) {
    for (const k of [0, 15]) {
      t.set(i, k, lid.deep);
      t.set(k, i, lid.deep);
    }
    if (i < 1 || i > 14) continue;
    for (const k of [1, 14]) {
      t.set(i, k, stave);
      t.set(k, i, stave);
    }
    if (i < 2 || i > 13) continue;
    t.set(i, 2, hex("#8e8b98"));
    t.set(2, i, hex("#8e8b98"));
    t.set(i, 13, hex("#5b5864"));
    t.set(13, i, hex("#5b5864"));
  }
  t.sprite(["dD", "Dd"], { d: "#8a5a32", D: "#b07a45" }, 7, 7);
}

function barrelSide(t: Tile): void {
  const tones = hexes("#b67f48 #c08950 #ab7441 #bb844c");
  const n = t.noise(8);
  t.each((x, y) => {
    if (x % 4 === 3) return hex("#7a4e2c");
    const bulge = 0.9 + 0.12 * Math.sin((Math.PI * (y + 0.5)) / T);
    const c = mul(tones[Math.floor(x / 4)], bulge + (n(x, y) - 0.5) * 0.08);
    return x % 4 === 0 ? mix(c, hex("#e0ad74"), 0.3) : c;
  });
  const iron = hex("#64606c"),
    ironHi = hex("#9c98a6"),
    ironLo = hex("#45424d");
  for (const by of [2, 12])
    for (let x = 0; x < T; x++) {
      t.set(x, by, ironHi);
      t.set(x, by + 1, x % 8 === 5 ? ironHi : iron);
      t.tint(x, by + 2, ironLo, 0.5);
    }
}

function rune(t: Tile): void {
  // Cool, slightly darker paving so the glyph pops.
  paving(pal("#bfc2cc #adb1bc #9da1ad #8e929f #777a88"), hex("#6f7280"))(t);
  // An algiz stave inside a diamond.
  const mask: boolean[] = [];
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const dx = Math.abs(x - 7.5),
        dy = Math.abs(y - 7.5);
      const ring = Math.abs(dx + dy - 6) < 0.6;
      const stem = dx < 1 && y >= 4 && y <= 11;
      const arm = y >= 4 && y <= 7 && dx > 1 && Math.abs(dx - (8 - y)) < 0.6;
      mask.push(ring || stem || arm);
    }
  const core = hex("#e6fdff"),
    glow = hex("#5ef2ff"),
    halo = hex("#3ec7d6");
  const lit = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < T && y < T && mask[y * T + x];
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      if (lit(x, y)) {
        const inner = Math.abs(x - 7.5) < 1 && y >= 5 && y <= 10;
        t.set(x, y, inner ? core : mix(glow, core, 0.35));
        continue;
      }
      let near = 0;
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) if (lit(x + ox, y + oy)) near++;
      if (near) t.tint(x, y, halo, Math.min(0.5, 0.16 + near * 0.08));
    }
}

function crystal(t: Tile): void {
  const [hi, table, top, left, right, bottom, rim, edgeLit] = hexes(
    "#ffffff #ffd2f6 #ff9be8 #ff6bd6 #c357e2 #9443d4 #7a34b8 #ffd8f7",
  );
  t.each((x, y) => {
    const dx = x - 7.5,
      dy = y - 7.5;
    const ad = Math.abs(dx) + Math.abs(dy);
    // A bright table facet in the middle, four sloped facets around it.
    if (ad < 4.2) return mix(hi, table, Math.min(1, ad / 4.2 + 0.25));
    if (ad < 5) return dx + dy < 0 ? edgeLit : mix(table, right, 0.5);
    let c =
      Math.abs(dy) >= Math.abs(dx)
        ? dy < 0
          ? top
          : bottom
        : dx < 0
          ? left
          : right;
    if (Math.abs(Math.abs(dx) - Math.abs(dy)) < 0.6)
      c = dx + dy < 0 ? edgeLit : mix(c, rim, 0.35);
    return mul(c, 1.05 - (ad - 5) * 0.025);
  });
  for (let i = 0; i < T; i++) {
    t.tint(i, T - 1, rim, 0.6);
    t.tint(T - 1, i, rim, 0.6);
    t.tint(i, 0, hi, 0.25);
    t.tint(0, i, hi, 0.2);
  }
  t.sprite([".s.", "sWs", ".s."], { s: "#ffd0f4", W: "#ffffff" }, 2, 2);
  t.set(12, 11, mix(hi, right, 0.3));
}

function snow(t: Tile): void {
  ground(t, SNOW, 0.5, 8);
  specks(t, 8, SNOW.deep, 0.5);
  specks(t, 6, SNOW.hi, 1);
  t.set(10, 4, WHITE);
  t.tint(11, 5, hex("#bcd2ea"), 0.4);
}

function moss(t: Tile): void {
  ground(t, MOSS, 0.6, 8);
  for (let i = 0; i < 14; i++) {
    const x = t.int(T),
      y = t.int(T);
    t.tint(x, y, MOSS.hi, 0.6);
    t.tint(x, y + 1, MOSS.deep, 0.45);
  }
}

// ───────────────────────────── cross sprites ─────────────────────────────
// Transparent background, bottom-anchored (row 15 touches the ground).

const STEM = { g: "#5aa83f", G: "#7cc85a", d: "#3f8a34", l: "#a3e07c" };

const FLOWER_RED = [
  "................",
  "................",
  ".....LL..LL.....",
  "....LRRLLRRL....",
  "...LRRRRRRRRr...",
  "...RRRRkkRRRr...",
  "...RRRkkkkRRr...",
  "...RRRRkkRRRr...",
  "....rRRRRRRr....",
  ".....rrrrrr.....",
  ".......gg.......",
  "..lG...gg.......",
  "...GGG.gg..GG...",
  "....GGdgg.GGd...",
  ".......ggGd.....",
  ".......gg.......",
];
const FLOWER_YELLOW = [
  "................",
  "................",
  "......W..W......",
  "....W.WYYW.W....",
  "....WYYYYYYy....",
  "...WYYYooYYYy...",
  "....YYooooYy....",
  "...WYYYooYYYy...",
  "....yYYYYYYy....",
  "....y.yyyy.y....",
  ".......gg.......",
  "...GG..gg.......",
  "....GGdgg..GG...",
  ".......gg.GGd...",
  ".......ggd......",
  ".......gg.......",
];
const FLOWER_BLUE = [
  "................",
  "................",
  "....L..L..L.....",
  "...LBL.B.LBb....",
  "....LBBBBBb.....",
  "..LBBBcccBBBb...",
  "...BBccoccBb....",
  "..LBBBcccBBBb...",
  "....bBBBBBb.....",
  "...bBb.b.bBb....",
  "....b..gg..b....",
  ".......gg.......",
  "..lGG..gg.......",
  "....GGdgg..GG...",
  ".......ggGGd....",
  ".......gg.......",
];
const FLOWER_PINK = [
  "................",
  "................",
  "....L..L..p.....",
  "....LP.PP.pp....",
  "...LLPPPPPPp....",
  "...LPPPLPPPpp...",
  "...LPPPPPPPpp...",
  "...LPPPPPPPpp...",
  "....PPPPPPPp....",
  ".....pppppp.....",
  ".......gg.......",
  "..GG...gg...G...",
  "..GGG..gg..GG...",
  "...GGG.gg.GGd...",
  ".....Gdgg.d.....",
  ".......gg.......",
];
const MUSHROOM = [
  "................",
  "................",
  "................",
  "................",
  "......LLLL......",
  "....LLRRRRLL....",
  "...LRWWRRRRRr...",
  "..LRRWWRRRWWRr..",
  "..RRRRRRRRWWRr..",
  ".LRWRRRRRRRRRRr.",
  ".rRRRRRWWRRRRrr.",
  "..rruuuuuuuurr..",
  "......ssSs......",
  "......sssS......",
  "......sssS......",
  ".....ssssSS.....",
];
const REEDS = [
  "....l...........",
  "....g......l....",
  "...Cck.....g....",
  "...Cck....Cck...",
  "...Cck....Cck...",
  "...cck....Cck...",
  "...cck..l.cck...",
  "....g...g..g....",
  "....g..g...g.l..",
  ".l..g..g...g.g..",
  ".g..g..g..gg.g..",
  "..g.g.gg..g.g...",
  "..g.g.g...g.g...",
  "..ggg.g..gg.g...",
  "...gGgGgdgGgd...",
  "...dgggdgggd....",
];

function tallGrass(t: Tile): void {
  const [tip, light, mid, base] = hexes("#b3eb8e #8cd86a #6cc552 #4f9e3f");
  // [x, height, lean] per blade, drawn back to front.
  const blades = [
    2, 8, -1, 4, 11, -1, 6, 6, -1, 5, 13, 0, 7, 9, 1, 8, 14, 0, 9, 7, 1, 10, 12,
    1, 12, 10, 1, 13, 7, 1, 11, 5, -1, 3, 5, 1,
  ];
  for (let k = 0; k < blades.length; k += 3) {
    const [x0, h, lean] = blades.slice(k, k + 3);
    for (let i = 0; i < h; i++) {
      const f = i / (h - 1);
      const x = x0 + Math.round(lean * f * f * 2.5);
      t.set(
        x,
        T - 1 - i,
        f > 0.85 ? tip : f > 0.55 ? light : f > 0.2 ? mid : base,
      );
    }
  }
}

function fern(t: Tile): void {
  const [leafLight, leaf, rib, deep] = hexes("#9be276 #6cc552 #4a9a3c #3c8434");
  // Fronds from the crown at the bottom centre: [tip x, tip y].
  const fronds = [7, 1, 2, 4, 13, 4, 0, 10, 15, 10];
  for (let k = 0; k < fronds.length; k += 2) {
    const tx = fronds[k],
      ty = fronds[k + 1];
    const bx = 7.5,
      by = 15;
    const len = Math.hypot(tx - bx, ty - by);
    // Unit direction and its perpendicular.
    const ux = (tx - bx) / len,
      uy = (ty - by) / len;
    for (let s = 0; s <= len; s += 0.5) {
      // Slight droop toward the tip.
      const u = s / len;
      const x = bx + ux * s,
        y = by + uy * s + u * u * 1.5 * Math.abs(ux);
      t.set(x, y, u < 0.25 ? deep : rib);
      if (u > 0.2 && Math.round(s * 2) % 3 === 0) {
        const w = u < 0.7 ? 2 : 1;
        for (let i = 1; i <= w; i++) {
          t.set(x - uy * i, y + ux * i - 0.5, i === w ? leafLight : leaf);
          t.set(x + uy * i, y - ux * i - 0.5, i === w ? leaf : leafLight);
        }
      }
    }
    t.set(tx, ty, leafLight);
  }
}

// ───────────────────────────── registry ─────────────────────────────

const PAINTERS: Record<TileName, (t: Tile) => void> = {
  grass_top: grassTop,
  grass_side: grassSide,
  dirt,
  path_top: pathTop(PATH, "#ecd3a6 #e4c99e #d8c8b0 #f1dcb6"),
  sand,
  gravel: (t) =>
    stones(
      t,
      5,
      hexes("#c9c2b6 #bdb6aa #b3ac9f #c4baa8 #aca69c"),
      hex("#9a948a"),
      0.6,
      0.8,
    ),
  stone: stone(STONE),
  cobble: (t) =>
    stones(
      t,
      3,
      hexes("#bdb8b2 #b0aba6 #c6c0b7 #a9a49f #b9b1a6 #b5b1bb"),
      hex("#86828c"),
      0.9,
      1,
    ),
  stone_brick: stoneBrick,
  mossy_brick: mossyBrick,
  paving: paving(PAVING, hex("#c7bca8")),
  paving_dark: paving(PAVING_DARK, hex("#878085")),
  planks: (t) => boards(t, PLANKS, hex("#9a6936")),
  planks_dark: (t) => boards(t, PLANKS_DARK, hex("#4f331e")),
  log_side: logSide,
  log_top: logTop,
  birch_side: birchSide,
  leaves: (t) => bubbles(t, LEAVES),
  leaves_cherry: leavesCherry,
  leaves_dark: spruce,
  leaves_autumn: (t) =>
    bubbles(t, AUTUMN, [AUTUMN, AUTUMN, AUTUMN_RED, AUTUMN_YELLOW]),
  plaster,
  timber,
  roof_red: (t) => shingles(t, ROOF_RED),
  roof_blue: (t) => shingles(t, ROOF_BLUE),
  roof_teal: (t) => shingles(t, ROOF_TEAL),
  glass_lit: glassLit,
  door,
  wool_red: (t) => wool(t, ...WOOL.red),
  wool_blue: (t) => wool(t, ...WOOL.blue),
  wool_yellow: (t) => wool(t, ...WOOL.yellow),
  wool_white: (t) => wool(t, ...WOOL.white),
  copper,
  copper_oxidized: patina,
  gold,
  lantern,
  water,
  terracotta,
  hay_top: hayTop,
  hay_side: haySide,
  pumpkin_top: pumpkinTop,
  pumpkin_side: pumpkinSide,
  crate,
  barrel_top: barrelTop,
  barrel_side: barrelSide,
  flower_red: (t) =>
    t.sprite(FLOWER_RED, {
      L: "#ff7d6e",
      R: "#ee4b4b",
      r: "#c93a42",
      k: "#3b2b3a",
      ...STEM,
    }),
  flower_yellow: (t) =>
    t.sprite(FLOWER_YELLOW, {
      W: "#fff08a",
      Y: "#ffd93b",
      y: "#f0b42a",
      o: "#ec9a1f",
      ...STEM,
    }),
  flower_blue: (t) =>
    t.sprite(FLOWER_BLUE, {
      L: "#9dbaff",
      B: "#5b7cf0",
      b: "#3f5ad0",
      c: "#33409a",
      o: "#c9d6ff",
      ...STEM,
    }),
  flower_pink: (t) =>
    t.sprite(FLOWER_PINK, {
      L: "#ffc6e0",
      P: "#ff8fc0",
      p: "#e5619c",
      ...STEM,
    }),
  tall_grass: tallGrass,
  fern,
  mushroom_red: (t) =>
    t.sprite(MUSHROOM, {
      L: "#ff7a66",
      R: "#e8453c",
      r: "#bf3434",
      W: "#ffffff",
      u: "#f2d8bf",
      s: "#fbf0dc",
      S: "#e2cfab",
    }),
  reeds: (t) =>
    t.sprite(REEDS, { C: "#a8713f", c: "#8a5a33", k: "#6b4226", ...STEM }),
  rune,
  stone_dark: stone(STONE_DARK),
  crystal,
  iron,
  marble,
  brick,
  snow,
  moss,
  clay_path: pathTop(CLAY, "#e8bd98 #dcb08f #d8c0ac #efc8a6"),
  leaves_gold: (t) => bubbles(t, GOLD_LEAVES),
  wool_green: (t) => wool(t, ...WOOL.green),
};

/**
 * Which parts of the emissive tiles glow (0..1 per pixel), so frames, glyph
 * stones and window mullions stay dark in the emissive atlas.
 */
const smooth = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const luma = (r: number, g: number, b: number) =>
  0.299 * r + 0.587 * g + 0.114 * b;
const GLOW: Partial<
  Record<TileName, (r: number, g: number, b: number) => number>
> = {
  // Warm glass, plus the near-white flame.
  lantern: (r, g, b) =>
    Math.max(smooth(30, 80, r - b), smooth(200, 240, luma(r, g, b))),
  glass_lit: (r, g, b) => smooth(125, 195, luma(r, g, b)),
  rune: (r, _g, b) => smooth(20, 90, b - r),
  crystal: (r, g, b) => 0.45 + 0.55 * (luma(r, g, b) / 255),
};

// ───────────────────────────── public API ─────────────────────────────

/** Paint the whole atlas into an RGBA buffer (row 0 = image top). No DOM needed. */
export function paintAtlasPixels(): Uint8ClampedArray<ArrayBuffer> {
  const { width, height } = ATLAS_SIZE;
  const out = new Uint8ClampedArray(width * height * 4);
  TILES.forEach((name, index) => {
    const tile = new Tile(hashName(name));
    PAINTERS[name](tile);
    const ox = (index % ATLAS_COLUMNS) * T,
      oy = Math.floor(index / ATLAS_COLUMNS) * T;
    for (let y = 0; y < T; y++)
      out.set(
        tile.rgba.subarray(y * T * 4, (y + 1) * T * 4),
        ((oy + y) * width + ox) * 4,
      );
  });
  return out;
}

/**
 * Emissive companion atlas (same layout): the glowing parts of lantern,
 * glass_lit, rune and crystal in colour, everything else black. Use it as an
 * emissive texture so frames, mullions and rune-stone sides do not glow.
 */
export function paintEmissiveAtlasPixels(
  source: Uint8ClampedArray = paintAtlasPixels(),
): Uint8ClampedArray<ArrayBuffer> {
  const { width } = ATLAS_SIZE;
  const out = new Uint8ClampedArray(source.length);
  for (let i = 3; i < out.length; i += 4) out[i] = source[i];
  TILES.forEach((name, index) => {
    const rule = GLOW[name];
    if (!rule) return;
    const ox = (index % ATLAS_COLUMNS) * T,
      oy = Math.floor(index / ATLAS_COLUMNS) * T;
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const i = ((oy + y) * width + ox + x) * 4;
        const f = rule(source[i], source[i + 1], source[i + 2]);
        for (let c = 0; c < 3; c++) out[i + c] = source[i + c] * f;
      }
  });
  return out;
}

function toCanvas(
  pixels: Uint8ClampedArray<ArrayBuffer>,
  target?: HTMLCanvasElement | OffscreenCanvas,
): HTMLCanvasElement | OffscreenCanvas {
  const { width, height } = ATLAS_SIZE;
  const canvas =
    target ??
    (typeof document !== "undefined"
      ? document.createElement("canvas")
      : new OffscreenCanvas(width, height));
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d") as
    CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error("voxel atlas: 2D canvas context unavailable");
  ctx.putImageData(new ImageData(pixels, width, height), 0, 0);
  return canvas;
}

function toTexture(
  name: string,
  canvas: HTMLCanvasElement | OffscreenCanvas,
  scene: Scene,
): Texture {
  const texture = new DynamicTexture(
    name,
    canvas as unknown as ICanvas,
    scene,
    false,
    Texture.NEAREST_SAMPLINGMODE,
  );
  texture.wrapU = Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  texture.anisotropicFilteringLevel = 1;
  texture.hasAlpha = true;
  texture.update(true);
  return texture;
}

/** Paint the atlas (ATLAS_SIZE: 8 x 8 tiles of 16 px in TILES order) into a canvas. */
export function paintAtlas(
  target?: HTMLCanvasElement | OffscreenCanvas,
): HTMLCanvasElement | OffscreenCanvas {
  return toCanvas(paintAtlasPixels(), target);
}

/**
 * Atlas texture for block meshes: nearest sampling, no mipmaps, clamped, with
 * alpha (cross tiles are cut out) and image-top at v = 1 to match atlasUV().
 * Cross materials need `useAlphaFromDiffuseTexture = true` for the cut-out.
 * The caller owns the texture and disposes it.
 */
export function createAtlasTexture(scene: Scene): Texture {
  return toTexture("voxel-atlas", paintAtlas(), scene);
}

/** Emissive companion of createAtlasTexture (see paintEmissiveAtlasPixels). */
export function createEmissiveAtlasTexture(scene: Scene): Texture {
  return toTexture(
    "voxel-atlas-emissive",
    toCanvas(paintEmissiveAtlasPixels()),
    scene,
  );
}
