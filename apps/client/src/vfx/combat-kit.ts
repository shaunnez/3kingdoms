/**
 * Shared building blocks for combat effects: the cute palette, unit
 * geometries (soft rings, discs, crescents, beams, quads), cached materials
 * and per-shape mesh pools. Everything here is created once per CombatVfx
 * and released by Kit.dispose().
 */
import {
  Color3,
  Constants,
  FresnelParameters,
  Material,
  MeshBuilder,
  StandardMaterial,
  VertexData,
  type AbstractMesh,
  type BaseTexture,
  type Mesh,
  type Scene,
} from "@babylonjs/core";
import { MeshPool } from "./pool";
import { CombatTextures, type CombatTextureName } from "./combat-textures";
import { fxTexture, type FxTextureName } from "./textures";

const hex = (h: string) => Color3.FromHexString(h);
/** Spec palette plus a few combat accents (sRGB). */
export const C = {
  white: hex("#ffffff"),
  cream: hex("#fff7e8"),
  ink: hex("#2b2140"),
  gold: hex("#ffd45e"),
  goldDeep: hex("#ffb43a"),
  amber: hex("#ff9f43"),
  sky: hex("#8fd0ff"),
  pale: hex("#dff1ff"),
  cyan: hex("#5ef2ff"),
  cyanDeep: hex("#2fb8ff"),
  magenta: hex("#ff6bd6"),
  violet: hex("#b98bff"),
  green: hex("#7dff8a"),
  mint: hex("#c8ffd0"),
  pink: hex("#ffaed1"),
  red: hex("#ff4060"),
  crimson: hex("#d8344c"),
  enemy: hex("#ff5d3b"),
  ownGold: hex("#f6bf45"),
  ownCyan: hex("#4fe3f2"),
  frost: hex("#bdf4ff"),
  ice: hex("#8fe3ff"),
  plum: hex("#5a3d6e"),
  plumLight: hex("#7d5a94"),
  charcoal: hex("#3a3446"),
  stone: hex("#c9c3b8"),
  stoneDark: hex("#7d7a86"),
  dirt: hex("#d9b27c"),
  dirtDark: hex("#b08a5a"),
  grass: hex("#7ccf5a"),
  steel: hex("#dfe6ee"),
  steelDark: hex("#9aa6b8"),
  tabard: hex("#4e8fe0"),
  shell: hex("#f4f8fb"),
  slate: hex("#4a4e5e"),
  smoke: hex("#f2eef8"),
  lavender: hex("#d9c8ff"),
} as const;

// ───────────────────────────── geometry ─────────────────────────────

type Stop = readonly [radius: number, alpha: number, bright?: number];

/**
 * Concentric soft bands in the XZ plane: each stop is a ring of vertices with
 * its own alpha and brightness. A first stop at radius 0 makes a filled disc.
 */
export function radialData(
  stops: readonly Stop[],
  segments = 48,
  /** Build in the XY plane (for camera-facing billboards) instead of XZ. */
  vertical = false,
): VertexData {
  const positions: number[] = [],
    normals: number[] = [],
    colors: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  const rows = stops.length;
  for (let r = 0; r < rows; r++) {
    const [radius, alpha, bright = 1] = stops[r];
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      if (vertical) {
        positions.push(Math.cos(a) * radius, Math.sin(a) * radius, 0);
        normals.push(0, 0, -1);
      } else {
        positions.push(Math.cos(a) * radius, 0, Math.sin(a) * radius);
        normals.push(0, 1, 0);
      }
      colors.push(bright, bright, bright, alpha);
      uvs.push(i / segments, r / (rows - 1));
    }
  }
  const stride = segments + 1;
  for (let r = 0; r < rows - 1; r++)
    for (let i = 0; i < segments; i++) {
      const a = r * stride + i,
        b = a + 1,
        c = a + stride,
        d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  return fill(positions, normals, colors, uvs, indices);
}

/**
 * Crescent slash in the XZ plane around +Z: from angle a0 (tail) to a1
 * (head), measured like headings (atan2(x, z)). Thick in the middle, pointed
 * ends, bright outer edge, fading towards the tail.
 */
export function crescentData(
  a0: number,
  a1: number,
  radius: number,
  width: number,
  segments = 28,
): VertexData {
  const positions: number[] = [],
    normals: number[] = [],
    colors: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  // Soft inside, crisp bright outer edge (cartoon slash).
  const across = [
    [0, 0, 0.85],
    [0.45, 0.28, 0.92],
    [0.8, 0.9, 1],
    [1, 1, 1],
  ] as const;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const a = a0 + (a1 - a0) * t;
    const w = width * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.08)), 0.65);
    const along = smooth(0, 0.75, t) * (1 - smooth(0.93, 1, t) * 0.6);
    for (const [k, alpha, bright] of across) {
      const r = radius - w + w * k;
      positions.push(Math.sin(a) * r, 0, Math.cos(a) * r);
      normals.push(0, 1, 0);
      colors.push(bright, bright, bright, alpha * along);
      uvs.push(t, k);
    }
  }
  const n = across.length;
  for (let i = 0; i < segments; i++)
    for (let k = 0; k < n - 1; k++) {
      const a = i * n + k,
        b = a + 1,
        c = a + n,
        d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  return fill(positions, normals, colors, uvs, indices);
}

/** Open cylinder along +Z from 0 to 1, radius 1, soft at both ends. */
export function beamData(sides = 10): VertexData {
  const positions: number[] = [],
    normals: number[] = [],
    colors: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  const rings = [
    [0, 0],
    [0.05, 1],
    [0.9, 1],
    [1, 0],
  ] as const;
  for (const [z, alpha] of rings)
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      positions.push(Math.cos(a), Math.sin(a), z);
      normals.push(Math.cos(a), Math.sin(a), 0);
      colors.push(1, 1, 1, alpha);
      uvs.push(i / sides, z);
    }
  const stride = sides + 1;
  for (let r = 0; r < rings.length - 1; r++)
    for (let i = 0; i < sides; i++) {
      const a = r * stride + i,
        b = a + 1,
        c = a + stride,
        d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  return fill(positions, normals, colors, uvs, indices);
}

/** Vertical soft column from y 0..1, radius 1: bright core band fading up. */
export function pillarData(sides = 16): VertexData {
  const positions: number[] = [],
    normals: number[] = [],
    colors: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  const rings = [
    [0, 0.85],
    [0.15, 1],
    [0.6, 0.55],
    [1, 0],
  ] as const;
  for (const [y, alpha] of rings)
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      positions.push(Math.cos(a), y, Math.sin(a));
      normals.push(Math.cos(a), 0, Math.sin(a));
      colors.push(1, 1, 1, alpha);
      uvs.push(i / sides, y);
    }
  const stride = sides + 1;
  for (let r = 0; r < rings.length - 1; r++)
    for (let i = 0; i < sides; i++) {
      const a = r * stride + i,
        b = a + 1,
        c = a + stride,
        d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  return fill(positions, normals, colors, uvs, indices);
}

/** Unit quad in the XY plane (centred), v = 1 at the top. */
export function quadData(): VertexData {
  return fill(
    [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0],
    [0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [0, 0, 1, 0, 1, 1, 0, 1],
    [0, 2, 1, 0, 3, 2],
  );
}

/** Unit quad lying in the XZ plane; `start` puts its near edge at z = 0. */
export function floorQuadData(start = false): VertexData {
  const z0 = start ? 0 : -0.5,
    z1 = start ? 1 : 0.5;
  return fill(
    [-0.5, 0, z0, 0.5, 0, z0, 0.5, 0, z1, -0.5, 0, z1],
    [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [0, 0, 1, 0, 1, 1, 0, 1],
    [0, 2, 1, 0, 3, 2],
  );
}

/** Lane fill along +Z from 0..1 with a bright leading edge. */
export function laneFillData(): VertexData {
  const rows = [
    [0, 0.12],
    [0.82, 0.3],
    [0.97, 0.85],
    [1, 0.2],
  ] as const;
  const positions: number[] = [],
    normals: number[] = [],
    colors: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  for (const [z, alpha] of rows)
    for (const x of [-0.5, 0.5]) {
      positions.push(x, 0, z);
      normals.push(0, 1, 0);
      colors.push(1, 1, 1, alpha);
      uvs.push(x + 0.5, z);
    }
  for (let r = 0; r < rows.length - 1; r++) {
    const a = r * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  return fill(positions, normals, colors, uvs, indices);
}

/** Ice shard: hexagonal bipyramid, base at y 0, tip at y 1 (radius 1). */
export function shardData(): VertexData {
  const positions: number[] = [],
    indices: number[] = [];
  const sides = 6;
  positions.push(0, 1, 0, 0, -0.15, 0);
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    positions.push(Math.cos(a), 0.22, Math.sin(a));
  }
  for (let i = 0; i < sides; i++) {
    const a = 2 + i,
      b = 2 + ((i + 1) % sides);
    indices.push(0, b, a, 1, a, b);
  }
  // Flat-shaded: unshare vertices so each face gets its own normal.
  const flatPos: number[] = [],
    flatIdx: number[] = [];
  for (let i = 0; i < indices.length; i++) {
    const v = indices[i] * 3;
    flatPos.push(positions[v], positions[v + 1], positions[v + 2]);
    flatIdx.push(i);
  }
  const normals: number[] = [];
  VertexData.ComputeNormals(flatPos, flatIdx, normals);
  const colors: number[] = [];
  for (let i = 0; i < flatPos.length / 3; i++) {
    const y = flatPos[i * 3 + 1];
    const b = 0.75 + Math.max(0, y) * 0.5;
    colors.push(b, b, b, 1);
  }
  return fill(flatPos, normals, colors, [], flatIdx);
}

function fill(
  positions: number[],
  normals: number[],
  colors: number[],
  uvs: number[],
  indices: number[],
): VertexData {
  const d = new VertexData();
  d.positions = positions;
  d.normals = normals;
  d.colors = colors;
  if (uvs.length) d.uvs = uvs;
  d.indices = indices;
  return d;
}

export function smooth(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// ───────────────────────────── materials ─────────────────────────────

export type Blend = "add" | "alpha";

/** Cached materials. Colours are baked per material so the glow layer tints correctly. */
export class Materials {
  private cache = new Map<string, Material>();
  constructor(
    private scene: Scene,
    private textures: CombatTextures,
  ) {}

  private base(key: string, blend: Blend): StandardMaterial {
    const m = new StandardMaterial(`combat-${key}`, this.scene);
    m.disableLighting = true;
    m.diffuseColor = Color3.Black();
    m.specularColor = Color3.Black();
    m.backFaceCulling = false;
    m.disableDepthWrite = true;
    m.alphaMode =
      blend === "add" ? Constants.ALPHA_ADD : Constants.ALPHA_COMBINE;
    m.transparencyMode = Material.MATERIAL_ALPHABLEND;
    m.fogEnabled = false;
    setGlow(m, 0);
    this.cache.set(key, m);
    return m;
  }

  /**
   * The same material, but contributing to a glow layer. Everything else is
   * kept out of glow layers (they ignore mesh.visibility, so fading effects
   * would bloom at full strength until they vanish).
   */
  glowing(material: Material): Material {
    const key = `${material.name}-glow`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    // Copy by hand: Material.clone() would also clone (and blank) dynamic textures.
    const src = material as StandardMaterial;
    const m = new StandardMaterial(key, this.scene);
    m.disableLighting = src.disableLighting;
    m.diffuseColor.copyFrom(src.diffuseColor);
    m.specularColor.copyFrom(src.specularColor);
    m.emissiveColor.copyFrom(src.emissiveColor);
    m.diffuseTexture = src.diffuseTexture;
    m.useAlphaFromDiffuseTexture = src.useAlphaFromDiffuseTexture;
    m.opacityFresnelParameters = src.opacityFresnelParameters;
    m.backFaceCulling = src.backFaceCulling;
    m.disableDepthWrite = src.disableDepthWrite;
    m.depthFunction = src.depthFunction;
    m.alpha = src.alpha;
    m.alphaMode = src.alphaMode;
    m.transparencyMode = src.transparencyMode;
    m.fogEnabled = src.fogEnabled;
    setGlow(m, 1);
    this.cache.set(key, m);
    return m;
  }

  /** Vertex-coloured shape tinted by `color` (geometry alpha = opacity). */
  shape(color: Color3, blend: Blend = "alpha"): Material {
    const key = `shape-${blend}-${color.toHexString()}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const m = this.base(key, blend);
    m.emissiveColor = color.clone();
    return m;
  }

  /** White sprite texture tinted by `color`. */
  sprite(
    name: FxTextureName | CombatTextureName,
    color: Color3,
    blend: Blend = "alpha",
    /** Draw over bodies (no depth test): brief impact sprites only. */
    onTop = false,
  ): Material {
    const key = `sprite-${name}-${blend}-${color.toHexString()}${onTop ? "-top" : ""}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const m = this.base(key, blend);
    m.emissiveColor = color.clone();
    m.diffuseTexture = this.texture(name);
    m.useAlphaFromDiffuseTexture = true;
    if (onTop) m.depthFunction = Constants.ALWAYS;
    return m;
  }

  /** Full-colour sticker texture (its own colours and ink outline). */
  sticker(name: CombatTextureName, onTop = false): Material {
    const key = `sticker-${name}${onTop ? "-top" : ""}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const m = this.base(key, "alpha");
    m.emissiveColor = Color3.White();
    m.diffuseTexture = this.textures.get(name);
    m.useAlphaFromDiffuseTexture = true;
    if (onTop) m.depthFunction = Constants.ALWAYS;
    return m;
  }

  /** Soft bubble: transparent centre, bright fresnel rim (fresnel adds to alpha). */
  bubble(color: Color3, texture?: CombatTextureName): Material {
    const key = `bubble-${texture ?? "plain"}-${color.toHexString()}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const m = this.base(key, "add");
    m.emissiveColor = color.clone();
    m.backFaceCulling = true;
    m.alpha = texture ? 0.55 : 0.02;
    m.opacityFresnelParameters = new FresnelParameters();
    m.opacityFresnelParameters.bias = 0.06;
    m.opacityFresnelParameters.power = 2.4;
    m.opacityFresnelParameters.leftColor = Color3.Black();
    m.opacityFresnelParameters.rightColor = Color3.White();
    if (texture) {
      m.diffuseTexture = this.textures.get(texture);
      m.useAlphaFromDiffuseTexture = true;
    }
    return m;
  }

  /** Lit, vertex-coloured voxel models (drone, mine, shards). */
  solid(key: string, emissive = 0): Material {
    const id = `solid-${key}`;
    const hit = this.cache.get(id);
    if (hit) return hit;
    const m = new StandardMaterial(`combat-${id}`, this.scene);
    m.specularColor = Color3.Black();
    m.emissiveColor = new Color3(emissive, emissive, emissive);
    setGlow(m, 0);
    this.cache.set(id, m);
    return m;
  }

  texture(name: FxTextureName | CombatTextureName): BaseTexture {
    return isCombatTexture(name)
      ? this.textures.get(name)
      : fxTexture(this.scene, name);
  }

  get count(): number {
    return this.cache.size;
  }

  dispose(): void {
    // Textures belong to CombatTextures / the shared fx cache, not to us.
    for (const m of this.cache.values()) m.dispose(false, false);
    this.cache.clear();
  }
}

/** Glow layers scale a material's emissive by `emissiveIntensity` when present. */
export function setGlow(material: Material, intensity: number): void {
  (material as unknown as { emissiveIntensity: number }).emissiveIntensity =
    intensity;
}

const COMBAT_TEXTURES = new Set<string>([
  "rune",
  "heal",
  "kite",
  "hex",
  "bang",
  "dizzy",
  "claw",
  "crack",
  "ghost",
  "lane",
  "coin",
  "vein",
  "plusS",
  "heartS",
  "orb",
]);
const isCombatTexture = (
  name: FxTextureName | CombatTextureName,
): name is CombatTextureName => COMBAT_TEXTURES.has(name);

// ───────────────────────────── kit ─────────────────────────────

export type ShapeName =
  | "ring"
  | "ringV"
  | "shock"
  | "shockV"
  | "thin"
  | "disc"
  | "teleRim"
  | "teleFill"
  | "teleBase"
  | "slash"
  | "beam"
  | "pillar"
  | "quad"
  | "floor"
  | "laneQuad"
  | "laneFill"
  | "sphere"
  | "shard";

/**
 * Shape pools, split by whether their meshes join the glow layer. The glow
 * layer ignores mesh.visibility, so only steady emissive meshes (bolts,
 * drone eyes, mine lights) opt in; fading effects stay out of it.
 */
export class Kit {
  readonly textures: CombatTextures;
  readonly materials: Materials;
  private pools = new Map<string, MeshPool>();
  private data = new Map<string, () => VertexData>();
  private opaque = new Set<string>(["sphere", "shard"]);

  constructor(
    private scene: Scene,
    private glow: (mesh: AbstractMesh) => void,
  ) {
    this.textures = new CombatTextures(scene);
    this.materials = new Materials(scene, this.textures);
    const d = this.data;
    // Soft rings: a bright line with a feathered inside (shockwave look).
    d.set("ring", () =>
      radialData([
        [0.78, 0],
        [0.93, 1, 1],
        [1, 0],
      ]),
    );
    d.set("shock", () =>
      radialData([
        [0.45, 0],
        [0.84, 0.55, 0.95],
        [0.95, 1, 1],
        [1, 0],
      ]),
    );
    d.set("ringV", () =>
      radialData(
        [
          [0.74, 0],
          [0.92, 1, 1],
          [1, 0],
        ],
        48,
        true,
      ),
    );
    d.set("shockV", () =>
      radialData(
        [
          [0.45, 0],
          [0.84, 0.55, 0.95],
          [0.95, 1, 1],
          [1, 0],
        ],
        48,
        true,
      ),
    );
    d.set("thin", () =>
      radialData(
        [
          [0.9, 0],
          [0.96, 1, 1],
          [1, 0],
        ],
        64,
      ),
    );
    d.set("disc", () =>
      radialData([
        [0, 1, 1],
        [0.35, 0.75],
        [1, 0],
      ]),
    );
    // Telegraph rim: coloured band with a dark ink outline outside it.
    d.set("teleRim", () =>
      radialData(
        [
          [0.82, 0],
          [0.87, 0.95],
          [0.95, 1],
          [0.965, 1, 0.18],
          [1.0, 0.85, 0.12],
          [1.05, 0, 0.12],
        ],
        64,
      ),
    );
    // Telegraph fill: grows from the centre with a bright leading edge.
    d.set("teleFill", () =>
      radialData([
        [0, 0.16],
        [0.75, 0.32],
        [0.93, 0.7, 1],
        [1, 0.05],
      ]),
    );
    d.set("teleBase", () =>
      radialData([
        [0, 0.08],
        [0.9, 0.14],
        [1, 0.0],
      ]),
    );
    d.set("slash", () => crescentData(-1.3, 1.3, 1, 0.5));
    d.set("beam", () => beamData());
    d.set("pillar", () => pillarData());
    d.set("quad", () => quadData());
    d.set("floor", () => floorQuadData());
    d.set("laneQuad", () => floorQuadData(true));
    d.set("laneFill", () => laneFillData());
    d.set("sphere", () => {
      const s = MeshBuilder.CreateIcoSphere(
        "combat-ico",
        { radius: 1, subdivisions: 3 },
        scene,
      );
      const v = VertexData.ExtractFromMesh(s);
      s.dispose();
      return v;
    });
    d.set("shard", () => shardData());
  }

  /** Register an extra shape (voxel props); `opaque` shapes ignore vertex alpha. */
  define(name: string, build: () => VertexData, opaque = true): void {
    this.data.set(name, build);
    if (opaque) this.opaque.add(name);
  }

  /** A pool for `shape`; glow pools register each new mesh with the glow layer. */
  pool(shape: ShapeName | string, glow = false): MeshPool {
    const key = glow ? shape : `${shape}-plain`;
    let pool = this.pools.get(key);
    if (!pool) {
      const data = this.data.get(shape)!();
      pool = new MeshPool(this.scene, key, data, {
        vertexAlpha: !!data.colors && !this.opaque.has(shape),
        setup: glow ? (m: Mesh) => this.glow(m) : undefined,
        material: glow ? (m) => this.materials.glowing(m) : undefined,
      });
      this.pools.set(key, pool);
    }
    return pool;
  }

  /** Meshes currently handed out across all pools. */
  get active(): number {
    let n = 0;
    for (const p of this.pools.values()) n += p.active;
    return n;
  }

  get allocated(): number {
    let n = 0;
    for (const p of this.pools.values()) n += p.size;
    return n;
  }

  dispose(): void {
    for (const p of this.pools.values()) p.dispose();
    this.pools.clear();
    this.materials.dispose();
    this.textures.dispose();
  }
}
