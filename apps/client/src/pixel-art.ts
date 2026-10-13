import {
  GUILDS,
  type AbilityKey,
  type Guild,
} from "../../../packages/contracts/game";

/**
 * Pixel-art sprites drawn in code: string grids with per-sprite palettes,
 * rendered once to tiny PNG data URLs (display with image-rendering: pixelated).
 * Every sprite gets an automatic ink outline so it reads as a sticker.
 */

type Layer = {
  rows: readonly string[];
  /** Per-layer palette overrides on top of BASE. */
  colors?: Record<string, string>;
  /** Top-left offset in the canvas; centred when omitted. */
  x?: number;
  y?: number;
  flipX?: boolean;
  flipY?: boolean;
};
type Sprite = { layers: Layer[]; colors?: Record<string, string> };

const INK = "#2b2140";
const BASE: Record<string, string> = {
  k: INK,
  w: "#ffffff",
  t: "#fff7e8",
  l: "#f4f8fc",
  s: "#c6d1df",
  S: "#8a95ad",
  g: "#ffd45e",
  G: "#e59a2c",
  y: "#fff4b0",
  r: "#ff5a5f",
  R: "#c4324a",
  p: "#ff9ec7",
  P: "#ff6b9d",
  b: "#5ea6f2",
  B: "#2f62b8",
  c: "#5ef2ff",
  C: "#1aa7c4",
  n: "#7ccf5a",
  N: "#3f9a4a",
  v: "#c4adff",
  V: "#8a6ce0",
  m: "#ff6bd6",
  o: "#ff9f43",
  O: "#d9662b",
  e: "#c58f53",
  E: "#7a5232",
  h: "#ffdcc2",
  H: "#f2a98a",
  x: "#3d3550",
  X: "#5f4a78",
  a: "#ffb52e",
  i: "#dff8ff",
  q: "#d9d3c7",
  Q: "#8c8796",
  u: "#ffe9a8",
  z: "#1a1428",
};

const cache = new Map<string, string>();

function render(key: string, sprite: Sprite, size: number): string {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  if (typeof document === "undefined") return "";
  const grid: (string | null)[] = new Array(size * size).fill(null);
  for (const layer of sprite.layers) {
    const palette = { ...BASE, ...sprite.colors, ...layer.colors };
    const h = layer.rows.length,
      w = Math.max(...layer.rows.map((r) => r.length));
    let rows = layer.rows.map((r) => r.padEnd(w, "."));
    if (layer.flipX) rows = rows.map((r) => [...r].reverse().join(""));
    if (layer.flipY) rows = rows.slice().reverse();
    const ox = layer.x ?? Math.floor((size - w) / 2),
      oy = layer.y ?? Math.floor((size - h) / 2);
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === "." || ch === " ") continue;
        const px = ox + x,
          py = oy + y;
        if (px < 0 || py < 0 || px >= size || py >= size) continue;
        grid[py * size + px] = palette[ch] ?? INK;
      }
    });
  }
  // Ink outline on empty cells that touch the silhouette (4-neighbour: rounder).
  const out = grid.slice();
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      if (grid[y * size + x]) continue;
      const near =
        (x > 0 && grid[y * size + x - 1]) ||
        (x < size - 1 && grid[y * size + x + 1]) ||
        (y > 0 && grid[(y - 1) * size + x]) ||
        (y < size - 1 && grid[(y + 1) * size + x]);
      if (near) out[y * size + x] = INK;
    }
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  for (let i = 0; i < out.length; i++) {
    const color = out[i];
    if (!color) continue;
    ctx.fillStyle = color;
    ctx.fillRect(i % size, Math.floor(i / size), 1, 1);
  }
  const url = canvas.toDataURL("image/png");
  cache.set(key, url);
  return url;
}

const one = (
  rows: readonly string[],
  colors?: Record<string, string>,
): Sprite => ({
  layers: [{ rows }],
  colors,
});

// ───────────────────────────── shared shapes ─────────────────────────────

const HEART = [
  ".rrr...rrr.",
  "rwprr.rrrrr",
  "rpprrrrrrrr",
  "rrrrrrrrrrr",
  "rrrrrrrrrrR",
  ".rrrrrrrrR.",
  "..rrrrrrR..",
  "...rrrrR...",
  "....rrR....",
  ".....R.....",
];
const COIN = [
  "..gggggg..",
  ".gyyyyggG.",
  "gyyggggggG",
  "gyggGGgggG",
  "gyggGGgggG",
  "gyggGGgggG",
  "ggggGGgggG",
  "ggggggggGG",
  ".ggggggGG.",
  "..GGGGGG..",
];
const KITE = [
  ".ssssssssss.",
  "slbbbbbbbbSS",
  "sbbbbbbbbbBS",
  "sbbbbgbbbbBS",
  "sbbbgggbbbBS",
  "sbbbbgbbbbBS",
  ".sbbbbbbbBS.",
  ".sbbbbbbbBS.",
  "..sbbbbbBS..",
  "...sbbbBS...",
  "....sBBS....",
  ".....SS.....",
];
const DASH = [
  "...gg...gg...",
  "....gg...gg..",
  "ss...gg...gg.",
  "......gg...gg",
  "sss..gg...gg.",
  "....gg...gg..",
  "...gg...gg...",
];
const CHAIN = [
  ".llss........",
  "ls..sS.......",
  "s....S.......",
  "s....S..y....",
  "sS..SS...y...",
  ".SSSS......y.",
  "......y......",
  ".y.......llss",
  "...y....ls..sS",
  "....y...s....S",
  "........s....S",
  "........sS..SS",
  ".........SSSS.",
];
const SWORD_DIAGONAL = [
  "...........ll",
  "..........lsS",
  ".........lsS.",
  "........lsS..",
  ".......lsS...",
  "......lsS....",
  "..gg.lsS.....",
  "..gGlsS......",
  "...GGS.......",
  "..EE.Gg......",
  ".EE...gg.....",
  "gg...........",
  "gG...........",
];
const SWORD_UP = [
  ".....l.....",
  "....lsS....",
  "....lsS....",
  "....lsS....",
  "....lsS....",
  "....lsS....",
  "....lsS....",
  "..GggggggG.",
  ".....E.....",
  ".....e.....",
  "....ggg....",
];

// ───────────────────────────── abilities ─────────────────────────────

const KNIGHT_ABILITIES: Record<AbilityKey, Sprite> = {
  basic: one(SWORD_DIAGONAL),
  "1": {
    layers: [
      { rows: SWORD_UP, flipY: true, y: 0 },
      {
        rows: [
          ".g....y....g.",
          "..g..yyy..g..",
          "qqqqqQyQqqqqq",
          ".....Q.Q.....",
        ],
        y: 10,
      },
    ],
  },
  "2": one([
    "..ssssss.....",
    ".slbbbbbS....",
    "slbbbbbbBS.yy",
    "sbbbbgbbBS...",
    "sbbbgggbBS.yy",
    "sbbbbgbbBS.yy",
    "sbbbbbbbBS...",
    ".sbbbbbBS..yy",
    "..sbbbBS.....",
    "...sBBS......",
    "....SS.......",
  ]),
  "3": one([
    "....rrrr....",
    "..rprrrrrr..",
    ".rpprggrrrr.",
    ".rprrggrrrR.",
    "rrrrrggrrrrR",
    "rrrrrggrrrrR",
    "rrrrrggrrrrR",
    "rrrrrrrrrrRR",
    ".rrrrggrrRR.",
    ".rrrrggrRRR.",
    "..rRRRRRRR..",
    "....RRRR....",
  ]),
  "4": {
    layers: [
      {
        rows: [
          ".ssssssssss.",
          "slggggggggSS",
          "sgggggggggGS",
          "sggrr.rrggGS",
          "sgrrrrrrrgGS",
          "sgrrrrrrrgGS",
          ".sgrrrrrgGS.",
          ".sggrrrggGS.",
          "..sggrggGS..",
          "...sgggGS...",
          "....sGGS....",
          ".....SS.....",
        ],
      },
    ],
  },
  "5": {
    layers: [
      { rows: HEART, x: 0, y: 3 },
      { rows: [".n.", "nnn", ".n."], x: 10, y: 0, colors: { n: "#7dff8a" } },
      { rows: ["y"], x: 13, y: 5 },
    ],
  },
  r: one([
    "......y......",
    "..y...y...y..",
    "...gggggggg..",
    "..gyyyggggGG.",
    "..gygggwgggG.",
    "yy.ggwwwwgG.yy",
    "..ggggwwggGG.",
    "..gggwggwgGG.",
    "...gggggggG..",
    "....gggggG...",
    ".....ggGG....",
    "......GG.....",
  ]),
  q: one(KITE),
  space: one(DASH),
  c: one(CHAIN, { y: "#ffd45e" }),
};

const CYBORG_ABILITIES: Record<AbilityKey, Sprite> = {
  basic: one([
    "..........cc..",
    ".........cwwc.",
    "..CC....cwwwwc",
    "....CCccwwwwwc",
    "..CC....cwwwwc",
    ".........cwwc.",
    "..........cc..",
  ]),
  "1": one([
    "...........cc",
    "..........cwc",
    ".........cwc.",
    "........cwc..",
    ".......cwc...",
    "......cwc....",
    ".....cwc.....",
    "....cwc......",
    "...cwc.......",
    "..cwc........",
    ".sSS.........",
    "sSSS.........",
    "SS...........",
  ]),
  "2": {
    layers: [
      {
        rows: [
          "..rrrrrrrr..",
          ".rrrrrrrrrr.",
          "rrRR....rrRR",
          "rrR......rrR",
          "rrR......rrR",
          "llS......llS",
          "ssS......ssS",
        ],
        y: 1,
      },
      { rows: ["c........c", ".c......c.", "c........c"], y: 9 },
    ],
  },
  "3": one([
    "......cc.....",
    ".....cc......",
    "....cccc.....",
    "......cc.....",
    ".....cc......",
    ".............",
    "....SSSSS....",
    "...SssrrsS...",
    "..SsssrrssS..",
    ".SSSSSSSSSSS.",
    "..C..C..C..C.",
  ]),
  "4": one([
    "......c......",
    "....c.c.c....",
    ".....ccc.....",
    ".c....c....c.",
    "..c...c...c..",
    "...c.iwi.c...",
    "cccccwwwccccc",
    "...c.iwi.c...",
    "..c...c...c..",
    ".c....c....c.",
    ".....ccc.....",
    "....c.c.c....",
    "......c......",
  ]),
  "5": one(
    [
      "SSSS....SSSS",
      "..S......S..",
      ".wwwwwwwwww.",
      "wwccwwwwwwwS",
      "wcaccwwwwwwS",
      "wwccwwwwwwwS",
      ".SSSSSSSSSS.",
      ".....n......",
      "....nnn.....",
      ".....n......",
    ],
    { n: "#7dff8a", a: "#ffffff" },
  ),
  r: one([
    ".......oooo",
    "......oyoO.",
    ".....oyoO..",
    "....oyoO...",
    "...oyooooo.",
    "..ooooooO..",
    ".....ooO...",
    "....ooO....",
    "...ooO.....",
    "..oO.......",
    ".o.........",
  ]),
  q: one([
    "...CCCCCC...",
    "..CcccccccC.",
    ".CcwcccccccC",
    "CcwccCCcccC.",
    "CcccCccCccC.",
    "CcccCccCccC.",
    "CccccCCcccC.",
    ".CcccccccC..",
    "..CcccccC...",
    "...CCCCC....",
  ]),
  space: one(DASH, { g: "#5ef2ff", s: "#c6d1df" }),
  c: one(CHAIN, { y: "#5ef2ff" }),
};

// ───────────────────────────── items ─────────────────────────────

const ITEMS: Record<string, Sprite> = {
  blade: one(SWORD_UP),
  armour: one([
    ".bb......bb.",
    "bbbbs..sbbbb",
    "bbbbbssbbbbb",
    "bbbbbggbbbbB",
    ".bbbbggbbbB.",
    ".bbbggggbbB.",
    ".bbbbggbbbB.",
    ".bbbbbbbbbB.",
    ".EEEEgEEEEE.",
    ".bbbbbbbbbB.",
    ".bbbbbbbbBB.",
  ]),
  relic: one([
    "....gggg....",
    "..ggGGGGgg..",
    ".gGgyyggGgG.",
    ".gGyaaaagGG.",
    "gGgaaayaaGgG",
    "gGgaaaaaaGgG",
    "gGgaOaaaOGgG",
    ".gGgaOOOaGG.",
    ".gGGgggggGG.",
    "..ggGGGGgg..",
    "....gggg....",
  ]),
  shard: one([
    "....a....",
    "...aya...",
    "..ayaaa..",
    "..yaaaO..",
    ".yaaaaOO.",
    ".aaaaaOO.",
    "aaaaaaOOO",
    ".aaaaOOO.",
    "..aaaOO..",
    "...aOO...",
    "....O....",
  ]),
  ring: one([
    "....bbb....",
    "...bwbbB...",
    "....bBB....",
    "..ggggggg..",
    ".gyG...Ggg.",
    "gyG.....GgG",
    "gG.......gG",
    "gG.......gG",
    ".gG.....GG.",
    "..gGGGGGG..",
  ]),
  charm: one([
    "....SSS....",
    "...S...S...",
    "...S...S...",
    "....S.S....",
    "....ggg....",
    "...gaaag...",
    "..gayaaag..",
    "..gaaaaOg..",
    "..gaaaOOg..",
    "...gaOOg...",
    "....ggg....",
  ]),
  coin: one(COIN),
  default: one([
    "....EEEE....",
    ".....ee.....",
    "...eEEEEe...",
    "..eeeeeeee..",
    ".eeeeggeeeE.",
    ".eeeeggeeeE.",
    "eeeeeeeeeeEE",
    "eeeeeeeeeeEE",
    "eeeeeeeeeEEE",
    ".eeeeeeeEEE.",
    "..EEEEEEEE..",
  ]),
};

// ───────────────────────────── portraits (16 px) ─────────────────────────────

const PORTRAITS: Record<string, Sprite> = {
  knight: one([
    "......rrr.......",
    ".....rrrrr......",
    "......rRrr......",
    "....lllsssss....",
    "...llssssssSS...",
    "..lssssssssSSS..",
    "..lssssssssSSS..",
    "..sskkkkkkkkSS..",
    "..sskwkkkkwkSS..",
    "..ssssssssssSS..",
    "..sssSssSssSSS..",
    "...SSssssssSS...",
    "..bbbSSSSSSbbb..",
    ".bbbbbbggbbbbbb.",
    ".bbbbbggggbbbbB.",
    ".bbbbbbggbbbbbB.",
  ]),
  cyborg: one(
    [
      ".......c........",
      ".......S........",
      ".....wwwwww.....",
      "...wwwwwwwwww...",
      "..wwwllllllwwS..",
      "..wwccccccccwS..",
      "..wcwccccwcccS..",
      "..wcccccccccwS..",
      "..wwccccccccwS..",
      "..wwwwwwwwwwwS..",
      "..wwwwSSSSwwSS..",
      "...SwwwwwwwwS...",
      "..CCSSSSSSSSCC..",
      ".CCwwwwccwwwwCC.",
      ".CwwwwcaacwwwwC.",
      ".CwwwwwccwwwwwC.",
    ],
    { a: "#ffffff" },
  ),
  guard: one(
    [
      "......RRR.......",
      ".....RrrrR......",
      "....ggggggg.....",
      "...gyyggggggG...",
      "..gygggggggggG..",
      "..ggGGGGGGGGgG..",
      "..gGhhhhhhhhGG..",
      "..gGhkhhhhkhGG..",
      "..gGhhhhhhhhGG..",
      "..gGhhhppHhhGG..",
      "..ggGhhhhhhGGG..",
      "...gGGGGGGGGG...",
      "..RRRgggggRRR...",
      ".RrrrrrggrrrrrR.",
      ".RrrrrgggrrrrrR.",
      ".RrrrrrggrrrrrR.",
    ],
    { p: "#ff8a8a" },
  ),
  mara: one(
    [
      "......ssss......",
      ".....sllssS.....",
      "......sssS......",
      "....ssssssss....",
      "...sslssssssS...",
      "...shhhhhhhhS...",
      "..shgggghgggghS.",
      "..shgwzghgwzghS.",
      "..shgggghgggghS.",
      "..shhpphhhpphhS.",
      "...shhhhHhhhhS..",
      "....shhhhhhhS...",
      "...vvvvvggvvvv..",
      "..vvvvvvggvvvvV.",
      ".vvvvvvvggvvvvVV",
      ".vvvvvvvggvvvvVV",
    ],
    { s: "#e6e9f2", l: "#ffffff", S: "#b4b9cc", p: "#ffb3c7" },
  ),
  merchant: one(
    [
      ".......uu.......",
      ".....uuuuuu.....",
      "....uuuuuuuu....",
      "....ERRRRRRE....",
      ".uuuuuuuuuuuuuu.",
      "uuuuuuuuuuuuuuuE",
      "..EEhhhhhhhhEE..",
      "....hkhhhhkh....",
      "....hzhhhhzh....",
      "....hpphhpph....",
      ".....hhHHhh.....",
      "......hhhh......",
      "...nnnwwwwnnn...",
      "..nnnnwwwwnnnN..",
      ".nnnnnwggwnnnnN.",
      ".nnnnnwwwwnnnnN.",
    ],
    { u: "#ffe08a", E: "#c99a3d", R: "#ff6b6b", p: "#ffa8b8" },
  ),
  wolf: one(
    [
      "..X..........X..",
      ".XxX........XxX.",
      ".XpxX......XxpX.",
      ".XppxxxxxxxxppX.",
      ".XxxxxxxxxxxxxX.",
      "XxxxxxxxxxxxxxxX",
      "XxxaaxxxxxxaaxxX",
      "XxxazxxxxxxazxxX",
      "XxxxxxxxxxxxxxxX",
      ".XxxxxXqqXxxxxX.",
      ".XxxxqqqqqqxxxX.",
      "..XxqqqzzqqqxX..",
      "..XxqqqqqqqqxX..",
      "...XxqwqqwqxX...",
      "....XXqqqqXX....",
      "......XXXX......",
    ],
    { p: "#ff8fb4", a: "#ffb52e", q: "#8c7a9e" },
  ),
};

// ───────────────────────────── guild emblems ─────────────────────────────

const BADGE = [
  ".LLLLLLLLLLLL.",
  "LLffffffffffFF",
  "LfffffffffffFF",
  "LfffffffffffFF",
  "LfffffffffffFF",
  "LfffffffffffFF",
  "LfffffffffffFF",
  "LfffffffffffFF",
  "LfffffffffffFF",
  ".LfffffffffFF.",
  "..LffffffffF..",
  "...LffffffF...",
  ".....fFFF.....",
  "......FF......",
];
const SYMBOLS: Record<string, readonly string[]> = {
  knight: [
    "...tt...",
    "...tt...",
    "...tt...",
    "...tt...",
    ".tttttt.",
    "...kk...",
    "...tt...",
  ],
  cyborg: [
    "....tt",
    "...tt.",
    "..tt..",
    ".tttt.",
    "..tt..",
    ".tt...",
    "tt....",
  ],
  necromancer: [
    ".tttttt.",
    "tttttttt",
    "tkkttkkt",
    "tkkttkkt",
    "tttkkttt",
    ".tttttt.",
    ".t.tt.t.",
  ],
  mage: [
    "...t...",
    "...t...",
    "..ttt..",
    "ttttttt",
    ".ttttt.",
    "..ttt..",
    ".tt.tt.",
    ".t...t.",
  ],
  monk: [
    "..tttt..",
    ".tt..tt.",
    "tt....tt",
    "t..tt..t",
    "t..tt..t",
    "tt....tt",
    ".tt..tt.",
    "..tttt..",
  ],
  priest: [
    "t..t..t",
    ".t.t.t.",
    "..ttt..",
    "ttttttt",
    "..ttt..",
    ".t.t.t.",
    "t..t..t",
  ],
  bard: [
    "...ttttt",
    "...t...t",
    "...t...t",
    "...t...t",
    ".ttt.ttt",
    "tttttttt",
    ".tt..tt.",
  ],
  changeling: [
    "..tt.tt..",
    "..tt.tt..",
    "tt.....tt",
    "tt.ttt.tt",
    "..ttttt..",
    ".ttttttt.",
    ".ttttttt.",
    "..tt.tt..",
  ],
  elemental: [
    "...t....",
    "...tt...",
    "..ttt.t.",
    ".tttttt.",
    ".ttottt.",
    "ttooottt",
    "ttooott.",
    ".tttttt.",
  ],
  psion: [
    "...tttt...",
    ".tttttttt.",
    "tttkkkkttt",
    "ttkkwkkktt",
    "tttkkkkttt",
    ".tttttttt.",
    "...tttt...",
  ],
  symbiont: [
    ".....ttt",
    "...ttttt",
    "..tttkkt",
    ".tttktt.",
    ".ttktt..",
    ".tktt...",
    "k.tt....",
    "k.......",
  ],
  "powered-armour": [
    "..tttt..",
    ".tttttt.",
    "tttttttt",
    "tkkkkkkt",
    "tttttttt",
    "tt.tt.tt",
    "tttttttt",
    ".tt..tt.",
  ],
};

function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255,
    g = ((n >> 8) & 255) / 255,
    b = (n & 255) / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min,
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r
      ? (g - b) / d + (g < b ? 6 : 0)
      : max === g
        ? (b - r) / d + 2
        : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hsl(h: number, s: number, l: number): string {
  return `hsl(${Math.round(h)} ${Math.round(Math.min(1, s) * 100)}% ${Math.round(Math.min(0.97, l) * 100)}%)`;
}
/** Brighter, candy-coloured version of a guild's muted identity colour. */
export function guildColor(id: string): string {
  const entry = GUILDS.find(([g]) => g === id);
  const [h, s, l] = hexToHsl(entry?.[4] ?? "#b8a8d8");
  return hsl(h, Math.max(0.62, s * 1.35), Math.min(0.66, Math.max(0.58, l)));
}

// ───────────────────────────── UI icons ─────────────────────────────

export type UiIconName =
  | "coin"
  | "heart"
  | "shield"
  | "swords"
  | "gear"
  | "help"
  | "bag"
  | "book"
  | "map"
  | "skull"
  | "sparkle"
  | "sun"
  | "moon";
const UI: Record<UiIconName, Sprite> = {
  coin: one(COIN),
  heart: one(HEART),
  shield: one([
    ".ssssssssss.",
    "slnnnnnnnnSS",
    "snwnnnnnnnNS",
    "snnnnnnnwnNS",
    "snnnnnnwwnNS",
    "snwnnnwwnnNS",
    ".snwwwwnnNS.",
    ".snnwwnnnNS.",
    "..snnnnnNS..",
    "...snnnNS...",
    "....sNNS....",
    ".....SS.....",
  ]),
  swords: {
    layers: [
      { rows: SWORD_DIAGONAL, x: 1, y: 1, flipX: true },
      { rows: SWORD_DIAGONAL, x: 1, y: 1 },
    ],
  },
  gear: one([
    ".....ss.....",
    "..s.ssss.s..",
    ".sssssssssS.",
    "..ssSSSSsS..",
    ".sssS..SssS.",
    "ssssS..SssSS",
    ".sssSllSssS.",
    "..sssSSssS..",
    ".sssssssssS.",
    "..S.sSSS.S..",
    ".....SS.....",
  ]),
  help: one([
    "..wwwwwwww..",
    ".wwwwkkwwww.",
    "wwwwkwwkwwww",
    "wwwwwwwkwwww",
    "wwwwwwkwwwww",
    "wwwwwkwwwwww",
    ".wwwwwwwwww.",
    "..wwwkwwww..",
    "...ww.......",
    "..w.........",
  ]),
  bag: one([
    "...EEEEEE...",
    "..E......E..",
    "..E......E..",
    ".eeeeeeeeeE.",
    "eeeeeeeeeeEE",
    "eeeEggEeeeEE",
    "eeeEgyEeeeEE",
    "eeeeEEeeeeEE",
    "eeeeeeeeeeEE",
    "eeeeeeeeeEEE",
    ".EEEEEEEEEE.",
  ]),
  book: one([
    ".VVVVVVVVVV.",
    "VvvvvvvvvvVt",
    "VvvvggvvvvVt",
    "VvvgyygvvvVt",
    "VvvggggvvvVt",
    "VvvvggvvvvVt",
    "VvvvvvvvvvVt",
    "VvvvvvvvvvVt",
    "VvvvvvvvvvVt",
    "VVVVVVVVVVVt",
    ".tttttttttt.",
  ]),
  map: one(
    [
      "uuuu.uuuu.uuu",
      "uuuuuuuuuuuuu",
      "uukuuuuuuuuuG",
      "uuukuuuuurrrG",
      "uuuukkuuuurrG",
      "uuuuuukuurrrG",
      "uuuuuuukuuuuG",
      "uunnuuuukuuuG",
      "unnnuuuuuuuuG",
      "uunuuuuuuuuuG",
      "uuuu.uuuu.uuG",
    ],
    { u: "#ffe7b0", G: "#d9a15a", r: "#ff5a5f" },
  ),
  skull: one([
    "..wwwwwwww..",
    ".wwwwwwwwww.",
    "wwwwwwwwwwwq",
    "wwkkwwwwkkwq",
    "wwkkkwwkkkwq",
    "wwkkwwwwkkwq",
    "wwwwwkkwwwwq",
    ".wwwwwwwwwq.",
    "..wkwkwkwq..",
    "..wwwwwwwq..",
  ]),
  sparkle: one([
    "......g......",
    "......g......",
    ".....gyg.....",
    ".....gyg.....",
    "....gyyyg....",
    "gggggyywyggGG",
    "....gyyyg....",
    ".....gyG.....",
    ".....gyG.....",
    "......G......",
    "......G......",
  ]),
  sun: one(
    [
      "......y......",
      "..y...g...y..",
      "...g.....g...",
      ".....ggg.....",
      "....gyygG....",
      "yg.gyygggG.gy",
      "...ggygggG...",
      "....ggggG....",
      ".....GGG.....",
      "...g.....g...",
      "..y...g...y..",
      "......y......",
    ],
    { g: "#ffc93c", G: "#ff9f43" },
  ),
  moon: one(
    [
      "....vvvv...",
      "..vvwv.....",
      ".vwvv......",
      ".vvv.......",
      "vvvv.......",
      "vvvv.......",
      "vvvvv....V.",
      ".vvvvv..VV.",
      ".vvvvvvVVV.",
      "..vvvvvVV..",
      "....VVVV...",
    ],
    { v: "#e9e4ff", V: "#a99ce8", w: "#ffffff" },
  ),
};

// ───────────────────────────── exports ─────────────────────────────

export function abilityIcon(guild: Guild, key: AbilityKey): string {
  const set = guild === "cyborg" ? CYBORG_ABILITIES : KNIGHT_ABILITIES;
  return render(`ability:${guild}:${key}`, set[key] ?? set.basic, 16);
}
export function itemIcon(icon: string): string {
  const name = icon in ITEMS ? icon : "default";
  return render(`item:${name}`, ITEMS[name], 16);
}
export type PortraitKind =
  "knight" | "cyborg" | "guard" | "mara" | "merchant" | "wolf";
export function portrait(kind: PortraitKind): string {
  return render(`portrait:${kind}`, PORTRAITS[kind] ?? PORTRAITS.knight, 18);
}
export function guildEmblem(id: string): string {
  const color = guildColor(id);
  const [h, s, l] = hexToHslFromCss(color);
  const symbol = SYMBOLS[id] ?? SYMBOLS.mage;
  const sx = Math.floor((16 - Math.max(...symbol.map((r) => r.length))) / 2),
    sy = 2 + Math.max(0, Math.floor((8 - symbol.length) / 2));
  // A darker drop shadow keeps cream symbols legible on pale badges.
  const shadow = symbol.map((r) => r.replace(/[^.]/g, "F"));
  return render(
    `emblem:${id}`,
    {
      layers: [
        {
          rows: BADGE,
          colors: {
            f: color,
            L: hsl(h, s, l + 0.14),
            F: hsl(h, s * 0.9, l - 0.2),
          },
        },
        { rows: shadow, x: sx, y: sy + 1, colors: { F: hsl(h, s, l - 0.24) } },
        { rows: symbol, x: sx, y: sy },
      ],
    },
    16,
  );
}
export function uiIcon(name: UiIconName): string {
  return render(`ui:${name}`, UI[name], 16);
}

function hexToHslFromCss(css: string): [number, number, number] {
  const m = /hsl\((\d+) (\d+)% (\d+)%\)/.exec(css);
  return m
    ? [Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100]
    : [0, 0, 0.7];
}
