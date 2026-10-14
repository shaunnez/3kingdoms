/**
 * Shared materials for the voxel world: matte atlas blocks (plus a fading
 * variant for occluders), self-lit emissive blocks with a night overdrive and
 * lantern flicker, and alpha-tested foliage that sways in the wind. Material
 * plugins inject into Babylon's standard shader, so lights, shadows and fog
 * keep working without custom shader plumbing.
 */
import {
  Color3,
  Material,
  MaterialPluginBase,
  StandardMaterial,
  type MaterialDefines,
  type Scene,
  type Texture,
  type UniformBuffer,
} from "@babylonjs/core";
import { createAtlasTexture, createEmissiveAtlasTexture } from "./atlas";
import { ATLAS_SIZE } from "./mesher";

export type ShaderCode = { [point: string]: string } | null;

/** GLSL integer-lattice hash without sin(), stable for large world coordinates. */
const HASH_GLSL = `
float vxHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vxHash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float vxNoise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(vxHash12(i), vxHash12(i + vec2(1.0, 0.0)), f.x),
    mix(vxHash12(i + vec2(0.0, 1.0)), vxHash12(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}
`;
export const VOXEL_HASH_GLSL = HASH_GLSL;

/**
 * Wind sway for cut-out plants. The vertex's height within its quad comes from
 * the atlas V coordinate (fract(v * rows) runs 0 at the tile bottom to 1 at its
 * top), so roots stay planted and tips move most.
 */
class FoliageSwayPlugin extends MaterialPluginBase {
  time = 0;
  strength = 1;
  constructor(material: Material) {
    super(material, "VoxelFoliageSway", 200, { VOXEL_SWAY: false });
    this._enable(true);
  }
  override prepareDefines(defines: MaterialDefines): void {
    defines["VOXEL_SWAY"] = true;
  }
  override getClassName(): string {
    return "VoxelFoliageSwayPlugin";
  }
  override getUniforms() {
    return {
      ubo: [{ name: "vxSway", size: 2, type: "vec2" }],
      vertex: "#ifdef VOXEL_SWAY\nuniform vec2 vxSway;\n#endif",
    };
  }
  override bindForSubMesh(ubo: UniformBuffer): void {
    ubo.updateFloat2("vxSway", this.time, this.strength);
  }
  override getCustomCode(shaderType: string): ShaderCode {
    if (shaderType !== "vertex") return null;
    const rows = ATLAS_SIZE.rows.toFixed(1);
    return {
      CUSTOM_VERTEX_UPDATE_WORLDPOS: `
#if defined(VOXEL_SWAY) && defined(UV1)
{
  float vxH = clamp((fract(uv.y * ${rows}) - 0.03125) / 0.9375, 0.0, 1.0);
  float vxP = dot(worldPos.xz, vec2(0.71, 0.53));
  float vxGust = 0.55 + 0.45 * sin(vxSway.x * 0.83 + worldPos.x * 0.11 - worldPos.z * 0.07);
  vec2 vxD = vec2(sin(vxSway.x * 2.3 + vxP), 0.6 * cos(vxSway.x * 1.9 + vxP * 1.37));
  worldPos.xz += vxD * (vxH * vxH) * (0.075 * vxGust * vxSway.y);
}
#endif
`,
    };
  }
}

/**
 * Gentle canopy sway for tree meshes. Vertex alpha holds a sway weight (0 at
 * the trunk base, 1 at the crown); the offset is a smooth function of world
 * position, so vertices shared by neighbouring blocks move together and the
 * canopy never cracks. Shadows keep the rest pose (offsets stay < 6 cm).
 */
class CanopySwayPlugin extends MaterialPluginBase {
  time = 0;
  amplitude = 0.055;
  constructor(material: Material) {
    super(material, "VoxelCanopySway", 200, { VOXEL_CANOPY: false });
    this._enable(true);
  }
  override prepareDefines(defines: MaterialDefines): void {
    defines["VOXEL_CANOPY"] = true;
  }
  override getClassName(): string {
    return "VoxelCanopySwayPlugin";
  }
  override getUniforms() {
    return {
      ubo: [{ name: "vxCanopy", size: 2, type: "vec2" }],
      vertex: "#ifdef VOXEL_CANOPY\nuniform vec2 vxCanopy;\n#endif",
    };
  }
  override bindForSubMesh(ubo: UniformBuffer): void {
    ubo.updateFloat2("vxCanopy", this.time, this.amplitude);
  }
  override getCustomCode(shaderType: string): ShaderCode {
    if (shaderType !== "vertex") return null;
    return {
      CUSTOM_VERTEX_UPDATE_WORLDPOS: `
#if defined(VOXEL_CANOPY) && defined(VERTEXCOLOR)
{
  float vxT = vxCanopy.x;
  float vxP = dot(worldPos.xz, vec2(0.31, 0.23));
  float vxGust = 0.6 + 0.4 * sin(vxT * 0.47 + worldPos.x * 0.05 + worldPos.z * 0.04);
  vec2 vxD = vec2(sin(vxT * 1.15 + vxP), 0.6 * cos(vxT * 0.93 + vxP * 1.4));
  worldPos.xz += vxD * (color.a * vxGust * vxCanopy.y);
}
#endif
`,
    };
  }
}

/**
 * Emissive blocks: the standard emissive path lights the masked emissive atlas
 * (frames stay dark); this plugin zeroes the flat emissive colour in the main
 * pass — the GlowLayer still reads material.emissiveColor — and adds an HDR
 * overdrive per block kind for the bloom, with per-lantern flicker.
 *
 * Vertex alpha carries the kind code (see EMISSIVE_CODES in world-mesh.ts):
 * 1 window, 2 rune, 3 crystal, 4 lantern.
 */
class EmissiveGlowPlugin extends MaterialPluginBase {
  time = 0;
  night = 0;
  constructor(material: Material) {
    super(material, "VoxelEmissiveGlow", 200, { VOXEL_GLOW: false });
    this._enable(true);
  }
  override prepareDefines(defines: MaterialDefines): void {
    defines["VOXEL_GLOW"] = true;
  }
  override getClassName(): string {
    return "VoxelEmissiveGlowPlugin";
  }
  override getUniforms() {
    return {
      ubo: [{ name: "vxGlow", size: 2, type: "vec2" }],
      vertex: "#ifdef VOXEL_GLOW\nuniform vec2 vxGlow;\n#endif",
      fragment: "#ifdef VOXEL_GLOW\nuniform vec2 vxGlow;\n#endif",
    };
  }
  override bindForSubMesh(ubo: UniformBuffer): void {
    ubo.updateColor3("vEmissiveColor", Color3.BlackReadOnly);
    ubo.updateFloat2("vxGlow", this.time, this.night);
  }
  override getCustomCode(shaderType: string): ShaderCode {
    if (shaderType === "vertex")
      return {
        CUSTOM_VERTEX_DEFINITIONS: "varying float vxKind;",
        CUSTOM_VERTEX_MAIN_END: `
#ifdef VERTEXCOLOR
vxKind = color.a;
#else
vxKind = 1.0;
#endif
`,
      };
    if (shaderType !== "fragment") return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `varying float vxKind;\n${HASH_GLSL}`,
      CUSTOM_FRAGMENT_BEFORE_FOG: `
#if defined(VOXEL_GLOW) && defined(EMISSIVE)
{
  vec3 vxTex = texture2D(emissiveSampler, vEmissiveUV).rgb;
  float vxK = floor(vxKind + 0.5);
  float vxLantern = step(3.5, vxK);
  float vxMagic = step(1.5, vxK) * (1.0 - vxLantern);
  // One phase per block: the cell just inside the face.
  vec3 vxCell = floor(vPositionW * 2.0 - normalW * 0.25);
  float vxPh = vxHash13(vxCell + 17.0) * 6.2831;
  float vxT = vxGlow.x;
  float vxFlick = 1.0 + vxLantern * (0.16 * sin(vxT * 7.3 + vxPh) + 0.09 * sin(vxT * 17.9 + vxPh * 2.3));
  float vxPulse = 1.0 + vxMagic * 0.18 * sin(vxT * 1.7 + vxPh);
  float vxDay = vxMagic * 0.22 + vxLantern * 0.05;
  // Runes and crystals keep their hue instead of blooming to white.
  float vxNight = 0.5 + 0.15 * vxLantern - 0.12 * vxMagic;
  color.rgb += vxTex * mix(vxDay, vxNight, vxGlow.y) * vxFlick * vxPulse;
}
#endif
`,
    };
  }
}

export type WorldMaterials = {
  atlas: Texture;
  emissiveAtlas: Texture;
  /** Opaque terrain and structures. Frozen. */
  solid: StandardMaterial;
  /** Same look, alpha-blended with a depth pre-pass, for occluders while they fade. */
  solidFade: StandardMaterial;
  /** Lanterns, lit windows, runes, crystals. Not frozen (night/flicker uniforms). */
  emissive: StandardMaterial;
  /** Alpha-tested swaying plants. Frozen; sway runs through a plugin uniform. */
  cross: StandardMaterial;
  /** Trees: like solid / solidFade plus canopy sway (weight in vertex alpha). */
  tree: StandardMaterial;
  treeFade: StandardMaterial;
  setNight(amount: number): void;
  update(time: number): void;
  dispose(): void;
};

function atlasMaterial(
  name: string,
  scene: Scene,
  atlas: Texture,
): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseTexture = atlas;
  m.specularColor = Color3.Black();
  m.specularPower = 1;
  return m;
}

export function createWorldMaterials(scene: Scene): WorldMaterials {
  const atlas = createAtlasTexture(scene);
  const emissiveAtlas = createEmissiveAtlasTexture(scene);

  const solid = atlasMaterial("voxel-solid", scene, atlas);
  solid.transparencyMode = Material.MATERIAL_OPAQUE;

  const solidFade = atlasMaterial("voxel-solid-fade", scene, atlas);
  solidFade.transparencyMode = Material.MATERIAL_ALPHABLEND;
  // Only the nearest surface of a fading house shows, not its insides.
  solidFade.needDepthPrePass = true;

  const emissive = atlasMaterial("voxel-emissive", scene, atlas);
  emissive.emissiveTexture = emissiveAtlas;
  // Read by the GlowLayer (times emissiveTexture.level); zeroed in the main pass.
  emissive.emissiveColor = new Color3(1, 1, 1);
  // Leave transparency automatic so a fading house's windows fade with it.
  const glow = new EmissiveGlowPlugin(emissive);

  const cross = atlasMaterial("voxel-cross", scene, atlas);
  cross.transparencyMode = Material.MATERIAL_ALPHATEST;
  cross.useAlphaFromDiffuseTexture = true;
  cross.alphaCutOff = 0.5;
  cross.backFaceCulling = false;
  const sway = new FoliageSwayPlugin(cross);

  const tree = atlasMaterial("voxel-tree", scene, atlas);
  tree.transparencyMode = Material.MATERIAL_OPAQUE;
  const treeFade = atlasMaterial("voxel-tree-fade", scene, atlas);
  treeFade.transparencyMode = Material.MATERIAL_ALPHABLEND;
  treeFade.needDepthPrePass = true;
  const canopies = [new CanopySwayPlugin(tree), new CanopySwayPlugin(treeFade)];

  const setNight = (amount: number) => {
    const n = Math.min(1, Math.max(0, amount));
    glow.night = n;
    // Main-pass emission and GlowLayer strength: dim by day, full at night.
    emissiveAtlas.level = 0.35 + 0.65 * n;
  };
  setNight(0);

  // The fade variants stay unfrozen: a frozen material would keep the
  // DEPTHPREPASS define from its depth-only pass and draw the colour pass black.
  for (const m of [solid, cross, tree]) m.freeze();
  const all = [solid, solidFade, emissive, cross, tree, treeFade];

  return {
    atlas,
    emissiveAtlas,
    solid,
    solidFade,
    emissive,
    cross,
    tree,
    treeFade,
    setNight,
    update(time) {
      sway.time = time;
      glow.time = time;
      for (const c of canopies) c.time = time;
    },
    dispose() {
      for (const m of all) m.dispose(false, false);
      atlas.dispose();
      emissiveAtlas.dispose();
    },
  };
}
