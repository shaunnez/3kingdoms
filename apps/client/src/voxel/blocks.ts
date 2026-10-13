/**
 * Block registry for the voxel world. Pure data: no Babylon or DOM imports,
 * so world generation and meshing can run in tests and workers.
 *
 * One block is VOXEL metres on each side. The walkable ground surface is y = 0,
 * so the top ground block occupies iy = -1 (world y -0.5..0).
 */
export const VOXEL = 0.5;

/** World grid bounds in metres. The playable map is x -20..20, z -40..60. */
export const WORLD_BOUNDS = {
  minX: -40,
  maxX: 40,
  minZ: -56,
  maxZ: 76,
  minY: -4,
  maxY: 24,
} as const;

/** Atlas tiles, 16x16 pixels each, painted procedurally in atlas.ts (8 per row). */
export const TILES = [
  "grass_top",
  "grass_side",
  "dirt",
  "path_top",
  "sand",
  "gravel",
  "stone",
  "cobble",
  "stone_brick",
  "mossy_brick",
  "paving",
  "paving_dark",
  "planks",
  "planks_dark",
  "log_side",
  "log_top",
  "birch_side",
  "leaves",
  "leaves_cherry",
  "leaves_dark",
  "leaves_autumn",
  "plaster",
  "timber",
  "roof_red",
  "roof_blue",
  "roof_teal",
  "glass_lit",
  "door",
  "wool_red",
  "wool_blue",
  "wool_yellow",
  "wool_white",
  "copper",
  "copper_oxidized",
  "gold",
  "lantern",
  "water",
  "terracotta",
  "hay_top",
  "hay_side",
  "pumpkin_top",
  "pumpkin_side",
  "crate",
  "barrel_top",
  "barrel_side",
  "flower_red",
  "flower_yellow",
  "flower_blue",
  "flower_pink",
  "tall_grass",
  "fern",
  "mushroom_red",
  "reeds",
  "rune",
  "stone_dark",
  "crystal",
  "iron",
  "marble",
  "brick",
  "snow",
  "moss",
  "clay_path",
  "leaves_gold",
  "wool_green",
] as const;
export type TileName = (typeof TILES)[number];
export const ATLAS_COLUMNS = 8;
export const ATLAS_TILE_PX = 16;
export const tileIndex = (name: TileName): number => TILES.indexOf(name);

/**
 * cube   – full block; hides neighbour faces when opaque.
 * cross  – two diagonal alpha-tested quads (flowers, grass, reeds).
 * post   – centred thin column (fence posts, lamp posts, poles).
 * slab   – bottom half block (steps, roof edges, low walls).
 * liquid – water; meshed separately with an animated material.
 */
export type BlockShape = "air" | "cube" | "cross" | "post" | "slab" | "liquid";
export type BlockDef = {
  id: number;
  name: string;
  shape: BlockShape;
  top: TileName;
  side: TileName;
  bottom: TileName;
  /** Opaque cubes cull faces they touch. */
  opaque: boolean;
  /** 0..1 self illumination (lanterns, lit windows, runes, crystals). */
  emissive: number;
  /** Receives the gentle biome colour variation (grass, leaves). */
  tint: boolean;
  /** Characters may visually stand on top of it (used for surfaceHeight). */
  ground: boolean;
};

const defs: BlockDef[] = [];
function block(
  name: string,
  shape: BlockShape,
  top: TileName,
  side: TileName = top,
  bottom: TileName = side,
  extra: Partial<Omit<BlockDef, "id" | "name" | "shape">> = {},
): number {
  const id = defs.length;
  defs.push({
    id,
    name,
    shape,
    top,
    side,
    bottom,
    opaque: shape === "cube",
    emissive: 0,
    tint: false,
    ground: shape === "cube" || shape === "slab",
    ...extra,
  });
  return id;
}

/** Block ids. Values are stable within a build; saves never store them. */
export const B = {
  AIR: block("air", "air", "dirt", "dirt", "dirt", {
    opaque: false,
    ground: false,
  }),
  GRASS: block("grass", "cube", "grass_top", "grass_side", "dirt", {
    tint: true,
  }),
  DIRT: block("dirt", "cube", "dirt"),
  PATH: block("path", "cube", "path_top", "dirt", "dirt"),
  CLAY_PATH: block("clay path", "cube", "clay_path", "dirt", "dirt"),
  SAND: block("sand", "cube", "sand"),
  GRAVEL: block("gravel", "cube", "gravel"),
  STONE: block("stone", "cube", "stone"),
  STONE_DARK: block("dark stone", "cube", "stone_dark"),
  COBBLE: block("cobble", "cube", "cobble"),
  STONE_BRICK: block("stone brick", "cube", "stone_brick"),
  MOSSY_BRICK: block("mossy brick", "cube", "mossy_brick"),
  PAVING: block("paving", "cube", "paving", "stone_brick", "stone"),
  PAVING_DARK: block("dark paving", "cube", "paving_dark", "stone", "stone"),
  MARBLE: block("marble", "cube", "marble"),
  BRICK: block("brick", "cube", "brick"),
  PLANKS: block("planks", "cube", "planks"),
  PLANKS_DARK: block("dark planks", "cube", "planks_dark"),
  LOG: block("log", "cube", "log_top", "log_side", "log_top"),
  BIRCH_LOG: block("birch log", "cube", "log_top", "birch_side", "log_top"),
  LEAVES: block("leaves", "cube", "leaves", "leaves", "leaves", {
    tint: true,
    ground: false,
  }),
  LEAVES_CHERRY: block(
    "cherry leaves",
    "cube",
    "leaves_cherry",
    undefined,
    undefined,
    {
      ground: false,
    },
  ),
  LEAVES_DARK: block(
    "spruce leaves",
    "cube",
    "leaves_dark",
    undefined,
    undefined,
    {
      tint: true,
      ground: false,
    },
  ),
  LEAVES_AUTUMN: block(
    "autumn leaves",
    "cube",
    "leaves_autumn",
    undefined,
    undefined,
    {
      ground: false,
    },
  ),
  LEAVES_GOLD: block(
    "golden leaves",
    "cube",
    "leaves_gold",
    undefined,
    undefined,
    {
      ground: false,
    },
  ),
  MOSS: block("moss", "cube", "moss", "moss", "moss", { tint: true }),
  PLASTER: block("plaster", "cube", "plaster"),
  TIMBER: block("timber", "cube", "timber"),
  ROOF_RED: block("red roof", "cube", "roof_red"),
  ROOF_BLUE: block("blue roof", "cube", "roof_blue"),
  ROOF_TEAL: block("teal roof", "cube", "roof_teal"),
  ROOF_RED_SLAB: block("red roof slab", "slab", "roof_red"),
  ROOF_BLUE_SLAB: block("blue roof slab", "slab", "roof_blue"),
  ROOF_TEAL_SLAB: block("teal roof slab", "slab", "roof_teal"),
  GLASS_LIT: block("lit window", "cube", "glass_lit", undefined, undefined, {
    emissive: 0.85,
  }),
  DOOR: block("door", "cube", "planks_dark", "door", "planks_dark"),
  WOOL_RED: block("red cloth", "cube", "wool_red"),
  WOOL_BLUE: block("blue cloth", "cube", "wool_blue"),
  WOOL_YELLOW: block("yellow cloth", "cube", "wool_yellow"),
  WOOL_WHITE: block("white cloth", "cube", "wool_white"),
  WOOL_GREEN: block("green cloth", "cube", "wool_green"),
  COPPER: block("copper", "cube", "copper"),
  COPPER_OXIDIZED: block("oxidized copper", "cube", "copper_oxidized"),
  IRON: block("iron", "cube", "iron"),
  GOLD: block("gold", "cube", "gold"),
  LANTERN: block("lantern", "cube", "lantern", undefined, undefined, {
    emissive: 1,
  }),
  RUNE: block("rune tile", "cube", "rune", "stone_brick", "stone", {
    emissive: 0.9,
  }),
  CRYSTAL: block("crystal", "cube", "crystal", undefined, undefined, {
    emissive: 0.75,
  }),
  WATER: block("water", "liquid", "water", "water", "water", {
    opaque: false,
    ground: false,
  }),
  TERRACOTTA: block("terracotta", "cube", "terracotta"),
  HAY: block("hay", "cube", "hay_top", "hay_side", "hay_top"),
  PUMPKIN: block(
    "pumpkin",
    "cube",
    "pumpkin_top",
    "pumpkin_side",
    "pumpkin_top",
  ),
  CRATE: block("crate", "cube", "crate"),
  BARREL: block("barrel", "cube", "barrel_top", "barrel_side", "barrel_top"),
  SNOW: block("snow", "cube", "snow", "snow", "dirt"),
  STONE_SLAB: block("stone slab", "slab", "stone_brick"),
  PLANK_SLAB: block("plank slab", "slab", "planks"),
  COBBLE_SLAB: block("cobble slab", "slab", "cobble"),
  POST_WOOD: block(
    "wooden post",
    "post",
    "planks_dark",
    "log_side",
    "planks_dark",
  ),
  POST_IRON: block("iron post", "post", "iron"),
  POST_STONE: block("stone post", "post", "stone_brick"),
  FLOWER_RED: block("poppy", "cross", "flower_red"),
  FLOWER_YELLOW: block("dandelion", "cross", "flower_yellow"),
  FLOWER_BLUE: block("cornflower", "cross", "flower_blue"),
  FLOWER_PINK: block("tulip", "cross", "flower_pink"),
  TALL_GRASS: block("tall grass", "cross", "tall_grass", undefined, undefined, {
    tint: true,
  }),
  FERN: block("fern", "cross", "fern", undefined, undefined, { tint: true }),
  MUSHROOM: block("mushroom", "cross", "mushroom_red"),
  REEDS: block("reeds", "cross", "reeds"),
} as const;
export type BlockId = number;

export const BLOCKS: readonly BlockDef[] = defs;
const opaque = new Uint8Array(256);
const emissive = new Float32Array(256);
for (const d of defs) {
  opaque[d.id] = d.opaque ? 1 : 0;
  emissive[d.id] = d.emissive;
}
export const isOpaque = (id: number): boolean => opaque[id] === 1;
export const blockEmissive = (id: number): number => emissive[id];
export const blockDef = (id: number): BlockDef => defs[id] ?? defs[0];
