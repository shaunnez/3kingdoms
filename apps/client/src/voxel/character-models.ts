/**
 * Voxel designs for the chibi characters. Pure data (no Babylon): each kind is
 * a joint hierarchy plus palette-coloured voxel parts attached to joints;
 * characters.ts meshes the parts once per scene and animates the joints.
 *
 * Character space is metres with the origin on the ground between the feet,
 * facing +Z, so the character's left hand is on +X. Body parts use a 0.1 m
 * lattice centred on x and z: voxel (ix, iy, iz) spans x (ix ± 0.5)·0.1,
 * y iy·0.1 … (iy + 1)·0.1 and z (iz ± 0.5)·0.1, which makes mirroring x → -x.
 */
import { VoxelGrid } from "./grid";
import type { CharacterKind } from "./api";

export type Vec3 = [number, number, number];
type RGB = readonly [number, number, number];

const TOKENS = {
  ink: "#2b2140",
  white: "#ffffff",
  skin: "#ffd6b8",
  skinWarm: "#e8a77f",
  blush: "#ff8fab",
  mouth: "#b8405e",
  // Knight
  silver: "#e4e9f2",
  silverShade: "#b4bdcf",
  gold: "#ffd45e",
  goldShade: "#e6a83a",
  plume: "#ef5a52",
  plumeDark: "#c63c4a",
  tabard: "#4e8fe0",
  tabardDark: "#3a6cc4",
  pants: "#404a7c",
  leather: "#8a5a36",
  boot: "#7a5232",
  bootLight: "#a36f45",
  bladeEdge: "#f8fbff",
  // Cyborg
  ceramic: "#f6f8fc",
  ceramicShade: "#d3dce9",
  panel: "#3d4b60",
  panelLight: "#64789a",
  teal: "#3fb8a8",
  vent: "#252d3b",
  // Concord Watch
  crimson: "#d63b55",
  crimsonDark: "#a62b47",
  guardGold: "#ffcc4a",
  guardGoldShade: "#dc982e",
  steel: "#d0d7e3",
  steelDark: "#949db2",
  wood: "#b47c46",
  woodDark: "#7a5232",
  // Mara
  lavender: "#bda1f2",
  lavenderShade: "#9f84da",
  violet: "#7a5abf",
  hair: "#f2f3fa",
  hairShade: "#c9cde0",
  rim: "#f4c55a",
  glass: "#dff3ff",
  shoe: "#6c4a80",
  // Nemi
  apron: "#5fb548",
  apronDark: "#46953a",
  shirt: "#fff3df",
  shirtShade: "#efdbbd",
  straw: "#f6d77f",
  strawShade: "#dbb357",
  band: "#e8574f",
  ginger: "#e47e3c",
  gingerDark: "#c0602b",
  satchel: "#b67b45",
  satchelDark: "#8a5a32",
  trousers: "#7d5f4c",
  // Briar Hound
  fur: "#4a3f5c",
  furDark: "#362c46",
  furLight: "#625679",
  ruff: "#7a6d94",
  muzzle: "#a99cc2",
  nose: "#211a2e",
  earInner: "#cf7fa3",
  fang: "#fff7e8",
  gums: "#6e2f52",
  thorn: "#2a2236",
  // Glowing (meshed into the shared emissive mesh)
  cyan: "#5ef2ff",
  cyanDeep: "#0c5874",
  visorEye: "#f0feff",
  amber: "#ffae2e",
  amberHot: "#ffe58c",
  sand: "#ffd45e",
  sandHot: "#fff1b3",
} as const;
export type Token = keyof typeof TOKENS;
/**
 * Glowing tokens grouped into families. Each family renders with one shared
 * emissive material tinted the family colour, so a glow layer (which reads the
 * material's emissive colour, not vertex colours) blooms in the right hue.
 */
export const GLOW_FAMILIES = {
  cyan: "#5ef2ff",
  cyanDim: "#0c5874",
  amber: "#ffae2e",
  gold: "#ffd45e",
} as const;
export type GlowFamily = keyof typeof GLOW_FAMILIES;
const GLOW_TOKENS: Partial<Record<Token, GlowFamily>> = {
  cyan: "cyan",
  cyanDeep: "cyanDim",
  visorEye: "cyan",
  amber: "amber",
  amberHot: "amber",
  sand: "gold",
  sandHot: "gold",
};

const tokenNames = Object.keys(TOKENS) as Token[];
const tokenIndex = new Map<Token, number>(tokenNames.map((t, i) => [t, i + 1]));
const hexRGB = (hex: string): RGB => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255,
];
/** Palette for meshColors; index 0 is empty. */
export const PALETTE: readonly RGB[] = [
  [0, 0, 0],
  ...tokenNames.map((t) => hexRGB(TOKENS[t])),
];
const glowFamilyOf = new Map<number, GlowFamily>(
  (Object.keys(GLOW_TOKENS) as Token[]).map((t) => [
    tokenIndex.get(t)!,
    GLOW_TOKENS[t]!,
  ]),
);
export const isGlowIndex = (index: number): boolean => glowFamilyOf.has(index);
/** Glow family of a palette index, or undefined for matte voxels. */
export const glowFamily = (index: number): GlowFamily | undefined =>
  glowFamilyOf.get(index);
/** Family tint as 0..1 sRGB. */
export const glowFamilyColor = (family: GlowFamily): RGB =>
  hexRGB(GLOW_FAMILIES[family]);

export type JointName =
  | "model"
  | "hips"
  | "legL"
  | "legR"
  | "neck"
  | "eyes"
  | "armL"
  | "armR"
  | "handL"
  | "handR"
  | "jaw"
  | "tail"
  | "legFL"
  | "legFR"
  | "legBL"
  | "legBR";
/** Joint order is fixed per rig type so the animation can index channels directly. */
export const HUMANOID_JOINTS = [
  "model",
  "hips",
  "legL",
  "legR",
  "neck",
  "eyes",
  "armL",
  "armR",
  "handL",
  "handR",
] as const satisfies readonly JointName[];
export const WOLF_JOINTS = [
  "model",
  "hips",
  "neck",
  "eyes",
  "jaw",
  "legFL",
  "legFR",
  "legBL",
  "legBR",
  "tail",
] as const satisfies readonly JointName[];

/** A palette-coloured voxel model attached to one joint. */
export class VoxelPart {
  readonly cells = new Map<number, number>();
  constructor(
    readonly joint: JointName,
    readonly size = 0.1,
    /** Character-space position of the minimum corner of lattice voxel (0, 0, 0). */
    readonly origin: Vec3 = [-size / 2, 0, -size / 2],
  ) {}
  private static key(x: number, y: number, z: number): number {
    return x + 512 + (y + 512) * 1024 + (z + 512) * 1048576;
  }
  set(x: number, y: number, z: number, token: Token | null): this {
    const k = VoxelPart.key(x, y, z);
    if (token) this.cells.set(k, tokenIndex.get(token)!);
    else this.cells.delete(k);
    return this;
  }
  has(x: number, y: number, z: number): boolean {
    return this.cells.has(VoxelPart.key(x, y, z));
  }
  /** Fill an inclusive box (null clears). */
  box(
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    token: Token | null,
  ): this {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++)
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
          this.set(x, y, z, token);
    return this;
  }
  /** Box plus its mirror image across x = 0. */
  sym(
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    token: Token | null,
  ): this {
    this.box(x0, y0, z0, x1, y1, z1, token);
    return this.box(-x0, y0, z0, -x1, y1, z1, token);
  }
  /** Recolour only voxels that already exist. */
  paint(
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    token: Token,
  ): this {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++)
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
          if (this.has(x, y, z)) this.set(x, y, z, token);
    return this;
  }
  /** A copy mirrored across x = 0 onto another joint (centred lattices only). */
  mirror(joint: JointName): VoxelPart {
    const out = new VoxelPart(joint, this.size, [
      this.origin[0],
      this.origin[1],
      this.origin[2],
    ]);
    for (const [k, v] of this.cells) {
      const x = (k % 1024) - 512,
        y = (Math.floor(k / 1024) % 1024) - 512,
        z = Math.floor(k / 1048576) - 512;
      out.cells.set(VoxelPart.key(-x, y, z), v);
    }
    return out;
  }
  /** Dense grid in character space, or null when empty. */
  toGrid(): VoxelGrid | null {
    if (!this.cells.size) return null;
    let x0 = 1e9,
      y0 = 1e9,
      z0 = 1e9,
      x1 = -1e9,
      y1 = -1e9,
      z1 = -1e9;
    const coords: [number, number, number, number][] = [];
    for (const [k, v] of this.cells) {
      const x = (k % 1024) - 512,
        y = (Math.floor(k / 1024) % 1024) - 512,
        z = Math.floor(k / 1048576) - 512;
      coords.push([x, y, z, v]);
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      z0 = Math.min(z0, z);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
      z1 = Math.max(z1, z);
    }
    const s = this.size;
    const grid = new VoxelGrid(
      x1 - x0 + 1,
      y1 - y0 + 1,
      z1 - z0 + 1,
      {
        x: this.origin[0] + x0 * s,
        y: this.origin[1] + y0 * s,
        z: this.origin[2] + z0 * s,
      },
      s,
    );
    for (const [x, y, z, v] of coords) grid.set(x - x0, y - y0, z - z0, v);
    return grid;
  }
}

export type JointSpec = {
  name: JointName;
  parent: JointName | null;
  /** Rest position in character space. */
  pos: Vec3;
  /** Rest scale (eye plates are flattened along z). */
  scale?: Vec3;
};
export type SocketSpec = {
  joint: JointName;
  /** Character-space rest position. */
  pos: Vec3;
  /** Euler rotation so the socket's local +Z points along the weapon. */
  rot?: Vec3;
};
export type CharacterModel = {
  kind: CharacterKind;
  rig: "humanoid" | "wolf";
  /** In HUMANOID_JOINTS / WOLF_JOINTS order. */
  joints: JointSpec[];
  parts: VoxelPart[];
  /** Top of the head (plume and crest excluded) before scaling, metres. */
  height: number;
  /** Built-in size multiplier (the Concord Watch is a little bigger). */
  scale: number;
  sockets: {
    head: SocketSpec;
    chest: SocketSpec;
    weapon?: SocketSpec;
    offhand?: SocketSpec;
  };
};

/** Eye plates are one voxel deep, squashed to this fraction so they sit on the face. */
export const EYE_DEPTH = 0.15;

type HumanoidLayout = {
  legX: number;
  armL: Vec3;
  armR: Vec3;
  handL: Vec3;
  handR: Vec3;
  /** z of the face plane the eye plate sits on, and the eye joint height. */
  faceZ: number;
  eyeY: number;
  neckZ?: number;
};
function humanoidJoints(l: HumanoidLayout): JointSpec[] {
  return [
    { name: "model", parent: null, pos: [0, 0, 0] },
    { name: "hips", parent: "model", pos: [0, 0.4, 0] },
    { name: "legL", parent: "model", pos: [l.legX, 0.4, 0] },
    { name: "legR", parent: "model", pos: [-l.legX, 0.4, 0] },
    { name: "neck", parent: "hips", pos: [0, 1.0, l.neckZ ?? -0.05] },
    {
      name: "eyes",
      parent: "neck",
      pos: [0, l.eyeY, l.faceZ],
      scale: [1, 1, EYE_DEPTH],
    },
    { name: "armL", parent: "hips", pos: l.armL },
    { name: "armR", parent: "hips", pos: l.armR },
    { name: "handL", parent: "armL", pos: l.handL },
    { name: "handR", parent: "armR", pos: l.handR },
  ];
}
const STANDARD: HumanoidLayout = {
  legX: 0.2,
  armL: [0.45, 0.95, -0.05],
  armR: [-0.45, 0.95, -0.05],
  handL: [0.45, 0.6, -0.05],
  handR: [-0.45, 0.6, -0.05],
  faceZ: 0.35,
  eyeY: 1.3,
};

/** Lattice centred on a joint (voxel 0 straddles the joint on every axis). */
const around = (p: Vec3, size: number): Vec3 => [
  p[0] - size / 2,
  p[1] - size / 2,
  p[2] - size / 2,
];
/** An eye plate part whose iz = 0 layer starts on the face plane. */
const eyePlate = (faceZ: number) =>
  new VoxelPart("eyes", 0.1, [-0.05, 0, faceZ]);

/** Big chibi eyes: dark 2 × h with a white highlight on the upper outer-left. */
function cuteEyes(eyes: VoxelPart, y0: number, h: number, inner = 2) {
  eyes.box(inner, y0, 0, inner + 1, y0 + h - 1, 0, "ink");
  eyes.box(-inner, y0, 0, -inner - 1, y0 + h - 1, 0, "ink");
  eyes.set(inner + 1, y0 + h - 1, 0, "white");
  eyes.set(-inner, y0 + h - 1, 0, "white");
}
/** Soften the silhouette of a head block: drop the top rim and back corners. */
function roundHead(
  p: VoxelPart,
  x: number,
  top: number,
  back: number,
  front: number,
  y0: number,
) {
  p.sym(x, top, back, x, top, front, null);
  p.box(-x, top, back, x, top, back, null);
  p.box(-x, top, front, x, top, front, null);
  p.sym(x, y0, back, x, top, back, null);
}

/** Standard boots + trousers leg on the left; mirror for the right. */
function leg(trousers: Token, boot: Token, cuff: Token): VoxelPart {
  const p = new VoxelPart("legL");
  p.box(1, 2, -1, 3, 3, 1, trousers);
  p.box(1, 0, -1, 3, 0, 2, boot);
  p.box(1, 1, -1, 3, 1, 1, cuff);
  return p;
}

function knight(): CharacterModel {
  const legL = leg("pants", "boot", "bootLight");

  const body = new VoxelPart("hips");
  body.box(-3, 4, -2, 3, 9, 2, "silverShade");
  body.box(-2, 4, 2, 2, 8, 2, "tabard");
  body.box(-2, 4, -2, 2, 8, -2, "tabard");
  body.box(-2, 3, 2, 2, 3, 2, "tabardDark");
  body.box(-2, 3, -2, 2, 3, -2, "tabardDark");
  body.box(-3, 5, -2, 3, 5, 2, "leather");
  body.set(0, 5, 2, "gold");
  body.box(0, 6, 2, 0, 8, 2, "gold").box(-1, 7, 2, 1, 7, 2, "gold");
  body.box(-3, 9, -2, 3, 9, 2, "silver");
  body.sym(3, 9, 2, 3, 9, 2, null).sym(3, 9, -2, 3, 9, -2, null);

  const head = new VoxelPart("neck");
  head.box(-4, 10, -4, 4, 18, 3, "silver");
  // Open face, recessed one voxel behind the helm rim.
  head.box(-3, 10, 3, 3, 15, 3, null);
  head.box(-3, 10, 2, 3, 15, 2, "skin");
  head.sym(3, 11, 2, 3, 11, 2, "blush");
  head.set(0, 11, 2, "mouth");
  roundHead(head, 4, 18, -4, 3, 10);
  // Gold brow band all the way round, a ridge and rivets.
  head.paint(-4, 16, -4, 4, 16, 3, "gold");
  head.box(-3, 16, 3, 3, 16, 3, "gold");
  head.box(0, 11, -4, 0, 15, -4, "silverShade");
  head.sym(4, 13, 3, 4, 13, 3, "silverShade");
  head.sym(4, 13, -2, 4, 13, -2, "goldShade");
  // Plume: a big red horse-hair crest sweeping back.
  const plume: [number, number, number][] = [
    [2, 19, 20],
    [1, 19, 21],
    [0, 19, 22],
    [-1, 19, 22],
    [-2, 19, 22],
    [-3, 19, 21],
    [-4, 18, 21],
    [-5, 14, 20],
    [-6, 15, 18],
  ];
  for (const [z, a, b] of plume) head.box(0, a, z, 0, b, z, "plume");
  head.sym(1, 19, -4, 1, 21, 1, "plume");
  head.sym(1, 19, -5, 1, 20, -5, "plume");
  head.box(0, 19, 2, 0, 19, 2, "gold");
  head.box(0, 14, -5, 0, 15, -6, "plumeDark");
  head.sym(1, 19, -4, 1, 19, 1, "plumeDark");

  const eyes = eyePlate(0.25);
  cuteEyes(eyes, 12, 3);

  const armL = new VoxelPart("armL");
  armL.box(4, 5, -1, 5, 9, 0, "silverShade");
  armL.box(4, 5, -1, 5, 6, 0, "leather");
  armL.box(4, 8, -2, 6, 9, 1, "silver");
  armL.box(4, 8, -2, 6, 8, 1, "goldShade");
  armL.box(5, 9, -1, 6, 9, 0, "silver");

  // Sword on a 5 cm lattice, blade along +Z from the right fist.
  const swordAt = around(STANDARD.handR, 0.05);
  const sword = new VoxelPart("handR", 0.05, swordAt);
  sword.box(0, 0, -3, 0, 0, 2, "leather");
  sword.box(-1, -1, -5, 1, 1, -4, "gold");
  sword.box(-4, 0, 3, 4, 0, 4, "gold");
  sword.box(-1, -1, 3, 1, 1, 4, "goldShade");
  sword.box(-1, 0, 5, 1, 0, 20, "bladeEdge");
  sword.box(-2, 0, 5, 2, 0, 18, "bladeEdge");
  sword.box(0, -1, 5, 0, 1, 19, "silver");
  sword.box(-1, 0, 5, 1, 0, 6, "silver");
  sword.set(0, 0, 21, "bladeEdge");

  // Kite shield in front of the left fist: blue field, gold trim and cross.
  const shieldAt = around(STANDARD.handL, 0.1);
  const shield = new VoxelPart("handL", 0.1, shieldAt);
  const rows: [number, number][] = [
    [2, 3],
    [1, 3],
    [0, 3],
    [-1, 3],
    [-2, 2],
    [-3, 1],
    [-4, 0],
  ];
  for (const [y, w] of rows) shield.box(-w, y, 2, w, y, 2, "gold");
  for (const [y, w] of rows)
    if (y < 2 && w > 0) shield.box(-w + 1, y, 2, w - 1, y, 2, "tabard");
  shield.box(0, -2, 2, 0, 1, 2, "gold").box(-1, 0, 2, 1, 0, 2, "gold");
  shield.box(0, 0, 1, 0, 0, 1, "leather");

  return {
    kind: "knight",
    rig: "humanoid",
    joints: humanoidJoints({ ...STANDARD, faceZ: 0.25 }),
    parts: [
      legL,
      legL.mirror("legR"),
      body,
      head,
      eyes,
      armL,
      armL.mirror("armR"),
      sword,
      shield,
    ],
    height: 1.9,
    scale: 1,
    sockets: {
      head: { joint: "neck", pos: [0, 1.92, -0.05] },
      chest: { joint: "hips", pos: [0, 0.7, 0] },
      weapon: { joint: "handR", pos: [-0.45, 0.6, 1.0] },
      offhand: { joint: "handL", pos: [0.45, 0.5, 0.2] },
    },
  };
}

function cyborg(): CharacterModel {
  const legL = leg("panel", "ceramic", "ceramicShade");
  legL.box(1, 2, 1, 3, 2, 1, "ceramicShade");
  legL.set(3, 0, 0, "teal");

  const body = new VoxelPart("hips");
  body.box(-3, 4, -2, 3, 9, 2, "ceramicShade");
  body.box(-3, 6, 2, 3, 9, 2, "ceramic");
  body.box(-3, 4, -2, 3, 5, 2, "panelLight");
  body.box(-3, 5, -2, 3, 5, 2, "teal");
  body.box(0, 7, 2, 0, 8, 2, "cyan");
  body.sym(1, 7, 2, 1, 8, 2, "panel");
  body.sym(3, 9, 2, 3, 9, 2, null).sym(3, 9, -2, 3, 9, -2, null);
  // Backpack reactor with two vent grilles and a pilot light.
  body.box(-2, 5, -3, 2, 8, -3, "ceramicShade");
  body.sym(1, 6, -3, 2, 7, -3, "vent");
  body.box(0, 7, -3, 0, 7, -3, "cyan");
  body.box(-2, 3, 2, 2, 3, 2, "panel");

  const head = new VoxelPart("neck");
  head.box(-4, 10, -4, 4, 18, 3, "ceramic");
  roundHead(head, 4, 18, -4, 3, 10);
  // Visor band wraps the eyes; friendly face below.
  head.box(-4, 13, 3, 4, 15, 3, "cyanDeep");
  head.sym(4, 13, 1, 4, 15, 2, "cyanDeep");
  head.box(-3, 10, 3, 3, 12, 3, "skin");
  head.sym(3, 11, 3, 2, 11, 3, "blush");
  head.set(0, 11, 3, "mouth");
  head.box(-4, 16, 3, 4, 16, 3, "ceramicShade");
  // Ear pods, teal crest stripe and a little antenna.
  head.sym(5, 12, -2, 5, 15, 0, "panel");
  head.sym(5, 13, -1, 5, 14, -1, "cyan");
  head.box(0, 18, -3, 0, 18, 2, "teal");
  head.box(0, 12, -4, 0, 17, -4, "teal");
  head.box(3, 19, -2, 3, 20, -2, "panelLight");
  head.set(3, 21, -2, "cyan");

  const eyes = eyePlate(0.35);
  eyes.box(2, 13, 0, 3, 15, 0, "cyan").box(-2, 13, 0, -3, 15, 0, "cyan");
  eyes.set(3, 15, 0, "visorEye").set(-2, 15, 0, "visorEye");

  const armL = new VoxelPart("armL");
  armL.box(4, 5, -1, 5, 9, 0, "ceramic");
  armL.box(4, 7, -1, 5, 7, 0, "panel");
  armL.box(4, 8, -2, 6, 9, 1, "ceramic");
  armL.box(4, 8, -2, 6, 8, 1, "teal");
  armL.box(4, 5, -1, 5, 5, 0, "ceramicShade");

  // Arm cannon: chunky shell, glowing coils and a muzzle down the arm.
  const armR = new VoxelPart("armR");
  armR.box(-6, 7, -1, -5, 9, 0, "ceramic");
  armR.box(-7, 8, -2, -5, 9, 1, "ceramic");
  armR.box(-7, 8, -2, -5, 8, 1, "teal");
  armR.box(-7, 4, -2, -4, 7, 1, "ceramic");
  armR.box(-7, 7, -2, -4, 7, 1, "panelLight");
  armR.box(-7, 5, -2, -4, 5, 1, "teal");
  armR.box(-8, 4, -1, -8, 6, 0, "panel");
  armR.box(-8, 5, -1, -8, 5, 0, "cyan");
  armR.box(-6, 6, 2, -5, 6, 2, "cyan");
  armR.box(-7, 3, -2, -4, 3, 1, "panel");
  armR.box(-6, 2, -1, -5, 2, 0, "panelLight");
  armR.box(-6, 1, -1, -5, 1, 0, "cyan");

  return {
    kind: "cyborg",
    rig: "humanoid",
    joints: humanoidJoints({
      ...STANDARD,
      armR: [-0.55, 0.95, -0.05],
      handR: [-0.55, 0.45, -0.05],
      faceZ: 0.35,
      eyeY: 1.35,
    }),
    parts: [legL, legL.mirror("legR"), body, head, eyes, armL, armR],
    height: 1.9,
    scale: 1,
    sockets: {
      head: { joint: "neck", pos: [0, 1.92, -0.05] },
      chest: { joint: "hips", pos: [0, 0.7, 0] },
      weapon: {
        joint: "handR",
        pos: [-0.55, 0.1, -0.05],
        rot: [Math.PI / 2, 0, 0],
      },
      offhand: { joint: "handL", pos: [0.45, 0.55, -0.05] },
    },
  };
}

function guard(): CharacterModel {
  const legL = leg("crimson", "steelDark", "steel");

  const body = new VoxelPart("hips");
  body.box(-3, 4, -2, 3, 9, 2, "crimson");
  body.box(-3, 6, -2, 3, 9, 2, "guardGold");
  body.box(-3, 6, -2, 3, 6, 2, "guardGoldShade");
  body.box(0, 7, 2, 0, 9, 2, "crimson").box(-1, 8, 2, 1, 8, 2, "crimson");
  body.box(-3, 5, -2, 3, 5, 2, "leather");
  body.set(0, 5, 2, "guardGold");
  body.box(-2, 3, 2, 2, 3, 2, "crimsonDark");
  body.sym(3, 9, 2, 3, 9, 2, null);
  // Cape.
  body.box(-3, 3, -3, 3, 9, -3, "crimson");
  body.sym(3, 3, -3, 3, 9, -3, "crimsonDark");
  body.box(-3, 3, -3, 3, 3, -3, "crimsonDark");
  body.sym(3, 9, -3, 3, 9, -3, "guardGold");

  const head = new VoxelPart("neck");
  head.box(-4, 10, -4, 4, 18, 3, "guardGold");
  roundHead(head, 4, 18, -4, 3, 10);
  // T-visor slit with eyes peeking through.
  head.box(-3, 13, 3, 3, 13, 3, "ink");
  head.box(0, 11, 3, 0, 12, 3, "ink");
  head.sym(4, 10, 3, 4, 12, 3, "guardGoldShade");
  head.paint(-4, 16, -4, 4, 16, 3, "crimsonDark");
  head.box(-4, 16, 3, 4, 16, 3, "crimsonDark");
  head.sym(3, 11, 3, 3, 11, 3, "guardGoldShade");
  head.sym(4, 14, -1, 4, 14, -1, "crimsonDark");
  // Crimson crest on a gold ridge.
  head.box(0, 19, -4, 0, 19, 2, "guardGold");
  const crest: [number, number, number][] = [
    [2, 20, 20],
    [1, 20, 21],
    [0, 20, 22],
    [-1, 20, 22],
    [-2, 20, 22],
    [-3, 20, 21],
    [-4, 20, 21],
    [-5, 17, 20],
  ];
  for (const [z, a, b] of crest) head.box(0, a, z, 0, b, z, "crimson");
  head.box(0, 22, -2, 0, 22, 0, "crimsonDark");

  const eyes = eyePlate(0.35);
  eyes.set(2, 13, 0, "white").set(-2, 13, 0, "white");

  const armL = new VoxelPart("armL");
  armL.box(4, 5, -1, 5, 9, 0, "steel");
  armL.box(4, 7, -1, 5, 8, 0, "crimson");
  armL.box(4, 8, -2, 6, 9, 1, "guardGold");
  armL.box(4, 8, -2, 6, 8, 1, "crimsonDark");
  armL.box(4, 5, -1, 5, 5, 0, "steelDark");

  // Halberd planted beside the right fist, shaft along +Y.
  const halberd = new VoxelPart("handR", 0.1, around(STANDARD.handR, 0.1));
  halberd.box(0, -5, 0, 0, 15, 0, "wood");
  halberd.set(0, -5, 0, "steelDark");
  halberd.box(-1, 10, -1, 1, 10, 1, "guardGold");
  halberd.box(0, 11, 1, 0, 14, 1, "steel");
  halberd.box(0, 11, 2, 0, 15, 2, "steel");
  halberd.box(0, 12, 3, 0, 14, 3, "bladeEdge");
  halberd.box(0, 13, -1, 0, 13, -2, "steelDark");
  halberd.box(0, 16, 0, 0, 17, 0, "steel");
  halberd.box(0, 7, -1, 0, 9, -2, "crimson");
  halberd.set(0, 8, -3, "crimson");

  return {
    kind: "guard",
    rig: "humanoid",
    joints: humanoidJoints({ ...STANDARD, faceZ: 0.35 }),
    parts: [
      legL,
      legL.mirror("legR"),
      body,
      head,
      eyes,
      armL,
      armL.mirror("armR"),
      halberd,
    ],
    height: 1.9,
    scale: 1.1,
    sockets: {
      head: { joint: "neck", pos: [0, 1.92, -0.05] },
      chest: { joint: "hips", pos: [0, 0.7, 0] },
      weapon: {
        joint: "handR",
        pos: [-0.45, 2.35, -0.05],
        rot: [-Math.PI / 2, 0, 0],
      },
      offhand: { joint: "handL", pos: [0.45, 0.6, -0.05] },
    },
  };
}

function mara(): CharacterModel {
  const legL = new VoxelPart("legL");
  legL.box(1, 1, -1, 2, 3, 0, "lavenderShade");
  legL.box(1, 0, -1, 2, 0, 2, "shoe");

  const robe = new VoxelPart("hips");
  robe.box(-3, 4, -2, 3, 9, 2, "lavender");
  robe.box(-4, 1, -3, 4, 3, 3, "lavender");
  robe.sym(4, 1, 3, 4, 3, 3, null).sym(4, 1, -3, 4, 3, -3, null);
  robe.box(-4, 1, -3, 4, 1, 3, "violet");
  robe.sym(4, 1, 3, 4, 1, 3, null).sym(4, 1, -3, 4, 1, -3, null);
  robe.box(-3, 5, -2, 3, 5, 2, "violet");
  robe.set(0, 5, 2, "rim");
  robe.box(-3, 9, -2, 3, 9, 2, "violet");
  robe.sym(3, 9, 2, 3, 9, 2, null).sym(3, 9, -2, 3, 9, -2, null);
  // Little golden hour marks on the hem and a moon on the back.
  robe.set(0, 2, 3, "rim").sym(3, 2, 3, 3, 2, 3, "rim");
  robe.box(0, 7, -2, 0, 8, -2, "rim").set(1, 8, -2, "rim");

  const head = new VoxelPart("neck");
  head.box(-4, 10, -4, 4, 17, 3, "skin");
  head.box(-4, 16, -4, 4, 17, 3, "hair");
  head.box(-4, 11, -4, 4, 17, -3, "hair");
  head.sym(4, 12, -4, 4, 17, 2, "hair");
  head.box(-3, 15, 3, 3, 15, 3, "hair");
  head.box(-1, 15, 3, 1, 15, 3, "skin");
  head.sym(4, 12, 1, 4, 12, 2, "skin");
  head.box(-1, 18, -3, 1, 19, -1, "hair");
  head.box(-1, 18, -3, 1, 18, -1, "violet");
  // Combed strands down the back of the head.
  for (const x of [-3, -1, 1, 3]) head.paint(x, 11, -4, x, 16, -4, "hairShade");
  head.box(-2, 19, -2, 2, 19, -2, "rim");
  roundHead(head, 4, 17, -4, 3, 11);
  head.sym(3, 11, 3, 3, 11, 3, "blush");
  head.sym(1, 11, 3, 1, 11, 3, "mouth").set(0, 10, 3, "mouth");

  const eyes = eyePlate(0.35);
  cuteEyes(eyes, 12, 2);

  // Round spectacles on a 5 cm lattice just in front of the face.
  const specs = new VoxelPart("neck", 0.05, [0, 0, 0.35]);
  for (const side of [1, -1]) {
    const x0 = side > 0 ? 2 : -8;
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 6; j++) {
        const edge = i === 0 || i === 5 || j === 0 || j === 5;
        const corner = (i === 0 || i === 5) && (j === 0 || j === 5);
        if (edge && !corner) specs.set(x0 + i, 23 + j, 0, "rim");
      }
  }
  specs.box(-2, 27, 0, 1, 27, 0, "rim");

  const armL = new VoxelPart("armL");
  armL.box(4, 6, -1, 5, 9, 0, "lavender");
  armL.box(4, 6, -2, 5, 6, 1, "violet");
  armL.box(4, 5, -1, 5, 5, 0, "skin");

  // Hourglass of glowing sand sitting on the left fist.
  const hg = new VoxelPart("handL", 0.05, [0.425, 0.6, -0.075]);
  hg.box(-2, 0, -2, 2, 0, 2, "rim").box(-2, 7, -2, 2, 7, 2, "rim");
  for (const [x, z] of [
    [2, 2],
    [2, -2],
    [-2, 2],
    [-2, -2],
  ])
    hg.box(x, 1, z, x, 6, z, "goldShade");
  hg.box(-1, 1, -1, 1, 2, 1, "sand");
  hg.box(0, 3, 0, 0, 4, 0, "sandHot");
  hg.box(-1, 5, -1, 1, 5, 1, "sand");
  hg.box(-1, 6, -1, 1, 6, 1, "glass");
  hg.set(0, 2, 0, "sandHot");

  return {
    kind: "mara",
    rig: "humanoid",
    joints: humanoidJoints({
      ...STANDARD,
      legX: 0.15,
      handL: [0.45, 0.55, -0.05],
      handR: [-0.45, 0.55, -0.05],
      faceZ: 0.35,
      eyeY: 1.25,
    }),
    parts: [
      legL,
      legL.mirror("legR"),
      robe,
      head,
      eyes,
      specs,
      armL,
      armL.mirror("armR"),
      hg,
    ],
    height: 1.85,
    scale: 1,
    sockets: {
      head: { joint: "neck", pos: [0, 2.0, -0.05] },
      chest: { joint: "hips", pos: [0, 0.7, 0] },
      weapon: { joint: "handL", pos: [0.45, 0.8, -0.05] },
      offhand: { joint: "handL", pos: [0.45, 0.55, -0.05] },
    },
  };
}

function merchant(): CharacterModel {
  const legL = leg("trousers", "boot", "bootLight");

  const body = new VoxelPart("hips");
  body.box(-3, 4, -2, 3, 9, 2, "shirt");
  body.box(-2, 3, 2, 2, 8, 2, "apron");
  body.box(-1, 5, 2, 1, 5, 2, "apronDark");
  body.sym(2, 9, 2, 2, 9, 2, "apron");
  body.box(-3, 6, -2, 3, 6, 2, "apronDark");
  body.box(-2, 6, 2, 2, 6, 2, "apron");
  body.box(-1, 6, -3, 1, 6, -3, "apron").sym(1, 5, -3, 1, 7, -3, "apron");
  body.sym(3, 9, 2, 3, 9, 2, null).sym(3, 9, -2, 3, 9, -2, null);
  // Satchel strap across the chest to the bag on the right hip.
  for (const [x, y] of [
    [3, 9],
    [2, 8],
    [1, 7],
    [0, 7],
    [-1, 6],
    [-2, 5],
    [-3, 4],
  ]) {
    body.set(x, y, 2, "satchelDark");
    body.set(x, y, -2, "satchelDark");
  }
  body.box(-5, 3, -1, -4, 4, 1, "satchel");
  body.box(-5, 4, -1, -5, 4, 1, "satchelDark");
  body.set(-5, 4, 0, "gold");

  const head = new VoxelPart("neck");
  head.box(-4, 10, -4, 4, 15, 3, "skinWarm");
  head.box(-4, 11, -4, 4, 15, -3, "ginger");
  head.sym(4, 12, -4, 4, 15, 1, "ginger");
  head.box(-3, 15, 3, 3, 15, 3, "ginger");
  head.box(-1, 15, 3, 0, 15, 3, "skinWarm");
  head.sym(5, 11, -2, 5, 12, -1, "ginger");
  head.sym(5, 11, -2, 5, 11, -2, "gingerDark");
  head.sym(3, 11, 3, 3, 11, 3, "blush").sym(2, 11, 3, 2, 11, 3, "blush");
  head.sym(1, 11, 3, 1, 11, 3, "mouth");
  head.set(0, 10, 3, "mouth");
  // Straw hat: wide brim (short at the front so the eyes stay visible).
  head.box(-6, 16, -6, 6, 16, 4, "straw");
  head.sym(6, 16, -6, 6, 16, -5, null).sym(6, 16, 4, 6, 16, 4, null);
  head.sym(5, 16, -6, 5, 16, -6, null);
  head.box(-6, 16, 4, -5, 16, 4, null).box(5, 16, 4, 6, 16, 4, null);
  head.box(-4, 17, -4, 4, 18, 3, "straw");
  head.box(-4, 17, -4, 4, 17, 3, "band");
  roundHead(head, 4, 18, -4, 3, 17);
  head.box(4, 17, 0, 4, 18, 1, "blush").set(5, 17, 0, "gold");
  head.paint(-6, 16, -6, 6, 16, -6, "strawShade");

  const eyes = eyePlate(0.35);
  cuteEyes(eyes, 12, 3);

  const armL = new VoxelPart("armL");
  armL.box(4, 5, -1, 5, 9, 0, "shirt");
  armL.box(4, 7, -1, 5, 7, 0, "shirtShade");
  armL.box(4, 5, -1, 5, 6, 0, "skinWarm");

  return {
    kind: "merchant",
    rig: "humanoid",
    joints: humanoidJoints({ ...STANDARD, faceZ: 0.35 }),
    parts: [
      legL,
      legL.mirror("legR"),
      body,
      head,
      eyes,
      armL,
      armL.mirror("armR"),
    ],
    height: 1.9,
    scale: 1,
    sockets: {
      head: { joint: "neck", pos: [0, 1.92, -0.05] },
      chest: { joint: "hips", pos: [0, 0.7, 0] },
      offhand: { joint: "handL", pos: [0.45, 0.6, -0.05] },
    },
  };
}

function wolf(): CharacterModel {
  const legFL = new VoxelPart("legFL");
  legFL.box(1, 0, 2, 2, 3, 3, "fur");
  legFL.box(1, 0, 2, 2, 0, 4, "furLight");
  legFL.set(1, 0, 4, "fang").set(2, 0, 4, "fang");
  const legBL = new VoxelPart("legBL");
  legBL.box(1, 0, -3, 2, 3, -2, "furDark");
  legBL.box(1, 0, -3, 2, 0, -1, "furLight");
  legBL.box(1, 2, -4, 2, 3, -2, "fur");

  const body = new VoxelPart("hips");
  body.box(-2, 4, -4, 2, 8, 2, "fur");
  body.box(-1, 4, -3, 1, 4, 1, "muzzle");
  body.box(-2, 8, -4, 2, 8, 2, "furDark");
  // Bristly briar spines along the back.
  for (const z of [-3, -1, 1]) body.box(0, 9, z, 0, 9, z, "thorn");
  body.box(0, 10, -1, 0, 10, -1, "thorn");
  // Fluffy ruff around the chest.
  body.box(-3, 4, 1, 3, 9, 2, "ruff");
  body.sym(3, 4, 1, 3, 4, 2, null).sym(3, 9, 1, 3, 9, 2, null);
  body.box(0, 3, 2, 0, 3, 2, "ruff");

  const head = new VoxelPart("neck");
  head.box(-3, 7, 3, 3, 12, 8, "fur");
  head.box(-3, 12, 3, 3, 12, 8, "furDark");
  head.sym(3, 12, 3, 3, 12, 3, null).sym(3, 7, 3, 3, 12, 3, null);
  head.sym(3, 12, 8, 3, 12, 8, null);
  head.box(-3, 7, 8, 3, 8, 8, "furLight");
  // Snout with a dark nose and fangs hanging over the jaw.
  head.box(-1, 7, 9, 1, 9, 11, "muzzle");
  head.box(-1, 7, 9, 1, 7, 11, "gums");
  head.box(0, 9, 11, 0, 9, 12, "nose");
  head.box(0, 10, 9, 0, 10, 9, "furLight");
  head.sym(1, 6, 11, 1, 6, 11, "fang");
  // Angry brows over the eyes.
  head.sym(1, 12, 9, 2, 12, 9, "furDark");
  head.sym(3, 11, 9, 3, 11, 9, "furDark");
  // Pointed ears with pink insides.
  head.sym(2, 13, 4, 3, 13, 6, "fur");
  head.sym(2, 14, 4, 3, 14, 5, "fur");
  head.sym(3, 15, 4, 3, 15, 4, "furDark");
  head.sym(2, 13, 6, 2, 14, 6, "earInner");

  const eyes = eyePlate(0.85);
  eyes.box(1, 10, 0, 2, 11, 0, "amber").box(-1, 10, 0, -2, 11, 0, "amber");
  eyes.set(1, 11, 0, "amberHot").set(-1, 11, 0, "amberHot");

  const jaw = new VoxelPart("jaw");
  jaw.box(-1, 6, 7, 1, 6, 10, "muzzle");
  jaw.box(0, 6, 8, 0, 6, 10, "gums");

  const tail = new VoxelPart("tail");
  tail.box(-1, 8, -5, 1, 9, -5, "fur");
  tail.box(-1, 8, -6, 1, 10, -6, "fur");
  tail.box(-1, 9, -7, 1, 11, -7, "furLight");
  tail.box(0, 10, -8, 0, 12, -8, "ruff");
  tail.sym(1, 12, -7, 1, 12, -7, "ruff");

  const joints: JointSpec[] = [
    { name: "model", parent: null, pos: [0, 0, 0] },
    { name: "hips", parent: "model", pos: [0, 0.6, -0.05] },
    { name: "neck", parent: "hips", pos: [0, 0.85, 0.35] },
    {
      name: "eyes",
      parent: "neck",
      pos: [0, 1.05, 0.85],
      scale: [1, 1, EYE_DEPTH],
    },
    { name: "jaw", parent: "neck", pos: [0, 0.7, 0.65] },
    { name: "legFL", parent: "model", pos: [0.15, 0.4, 0.25] },
    { name: "legFR", parent: "model", pos: [-0.15, 0.4, 0.25] },
    { name: "legBL", parent: "model", pos: [0.15, 0.4, -0.25] },
    { name: "legBR", parent: "model", pos: [-0.15, 0.4, -0.25] },
    { name: "tail", parent: "hips", pos: [0, 0.85, -0.45] },
  ];
  return {
    kind: "wolf",
    rig: "wolf",
    joints,
    parts: [
      legFL,
      legFL.mirror("legFR"),
      legBL,
      legBL.mirror("legBR"),
      body,
      head,
      eyes,
      jaw,
      tail,
    ],
    height: 1.32,
    scale: 1,
    sockets: {
      head: { joint: "neck", pos: [0, 1.35, 0.55] },
      chest: { joint: "hips", pos: [0, 0.65, 0.1] },
      weapon: { joint: "neck", pos: [0, 0.75, 1.25] },
    },
  };
}

const BUILDERS: Record<CharacterKind, () => CharacterModel> = {
  knight,
  cyborg,
  guard,
  mara,
  merchant,
  wolf,
};
export function buildModel(kind: CharacterKind): CharacterModel {
  return BUILDERS[kind]();
}
