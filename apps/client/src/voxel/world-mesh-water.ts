/**
 * Stylised water for the voxel world. The mesh carries the top faces of the
 * highest water layer, lowered 0.2 m below the block top, plus vertical faces
 * where water meets air (the waterfall). Vertex colours are data, not colour:
 *   r = foam (1 at shores, lips and plunge pools), g = depth (0 shallow … 1 deep),
 *   b = 1 on waterfall faces.
 * A StandardMaterial plugin paints the cute look so lights, shadows and fog
 * still come from Babylon's standard shader.
 */
import {
  Color3,
  Material,
  MaterialPluginBase,
  StandardMaterial,
  type MaterialDefines,
  type Scene,
  type UniformBuffer,
} from "@babylonjs/core";
import { B } from "./blocks";
import type { VoxelWorld } from "./api";
import { VOXEL_HASH_GLSL, type ShaderCode } from "./world-mesh-materials";

export type WaterMeshData = {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
};

/** How far the surface sits below the top of the highest water block (metres). */
export const WATER_DROP = 0.2;
/** Foam band width and shallow → deep distance, in voxels from a shore corner. */
const FOAM_REACH = 2.4;
const DEPTH_REACH = 5.5;
const SEARCH = 7;

export function buildWaterData(world: VoxelWorld): WaterMeshData | null {
  const grid = world.grid;
  const { sx, sy, sz, data } = grid;
  const s = grid.size,
    o = grid.origin;
  const layer = sx * sz;
  const W = B.WATER,
    AIR = B.AIR;
  const water = (x: number, y: number, z: number) =>
    grid.inside(x, y, z) && data[x + sx * (z + sz * y)] === W;

  // Corner lattice ((sx+1) × (sz+1)): shore sources for foam and depth.
  const cw = sx + 1;
  const source = new Uint8Array(cw * (sz + 1));
  type Top = { ix: number; iy: number; iz: number };
  const tops: Top[] = [];
  type Side = {
    ix: number;
    iy: number;
    iz: number;
    dx: number;
    dz: number;
    top: boolean;
    extend: boolean;
  };
  const sides: Side[] = [];
  const DIRS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  for (let i = 0; i < data.length; i++) {
    if (data[i] !== W) continue;
    const ix = i % sx,
      iz = Math.floor(i / sx) % sz,
      iy = Math.floor(i / layer);
    const above = iy + 1 < sy ? data[i + layer] : AIR;
    const isTop = above !== W;
    if (isTop && above === AIR) tops.push({ ix, iy, iz });
    for (const [dx, dz] of DIRS) {
      const nx = ix + dx,
        nz = iz + dz;
      if (nx < 0 || nz < 0 || nx >= sx || nz >= sz) continue;
      if (data[nx + sx * (nz + sz * iy)] !== AIR) continue;
      // Air beside water whose neighbour column holds water one layer down: that
      // surface sits WATER_DROP lower, so stretch the face down to meet it.
      sides.push({
        ix,
        iy,
        iz,
        dx,
        dz,
        top: isTop,
        extend: water(nx, iy - 1, nz),
      });
    }
  }
  if (!tops.length && !sides.length) return null;

  // Shore sources: corners touching anything that is not water at the surface
  // layer, or a neighbour with water falling into it (plunge pools).
  for (const { ix, iy, iz } of tops) {
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = ix + dx,
          nz = iz + dz;
        if (nx < 0 || nz < 0 || nx >= sx || nz >= sz) continue;
        const edge = !water(nx, iy, nz) || water(nx, iy + 1, nz);
        if (!edge) continue;
        const xs = dx > 0 ? [ix + 1] : dx < 0 ? [ix] : [ix, ix + 1];
        const zs = dz > 0 ? [iz + 1] : dz < 0 ? [iz] : [iz, iz + 1];
        for (const x of xs) for (const z of zs) source[x + z * cw] = 1;
      }
  }
  const dist = new Float32Array(cw * (sz + 1)).fill(-1);
  const cornerDistance = (x: number, z: number): number => {
    const k = x + z * cw;
    if (dist[k] >= 0) return dist[k];
    let best = SEARCH;
    for (let dz = -SEARCH; dz <= SEARCH; dz++) {
      const zz = z + dz;
      if (zz < 0 || zz > sz) continue;
      for (let dx = -SEARCH; dx <= SEARCH; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx > sx || !source[xx + zz * cw]) continue;
        const d = Math.hypot(dx, dz);
        if (d < best) best = d;
      }
    }
    dist[k] = best;
    return best;
  };

  const positions: number[] = [],
    normals: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  const quad = (
    pts: number[][],
    n: readonly [number, number, number],
    cols: number[][],
  ) => {
    const base = positions.length / 3;
    for (let c = 0; c < 4; c++) {
      positions.push(pts[c][0], pts[c][1], pts[c][2]);
      normals.push(n[0], n[1], n[2]);
      colors.push(cols[c][0], cols[c][1], cols[c][2], 1);
    }
    // Babylon front face: (p0 - p1) x (p2 - p1) along the outward normal.
    const [a, b, c] = pts;
    const e1 = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const e2 = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
    const cx = e1[1] * e2[2] - e1[2] * e2[1],
      cy = e1[2] * e2[0] - e1[0] * e2[2],
      cz = e1[0] * e2[1] - e1[1] * e2[0];
    const front = cx * n[0] + cy * n[1] + cz * n[2] > 0;
    if (front) indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  };

  for (const { ix, iy, iz } of tops) {
    const y = o.y + (iy + 1) * s - WATER_DROP;
    const pts: number[][] = [];
    const cols: number[][] = [];
    for (const [cu, cv] of [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]) {
      const x = ix + cu,
        z = iz + cv;
      pts.push([o.x + x * s, y, o.z + z * s]);
      const d = cornerDistance(x, z);
      const foam = Math.max(0, 1 - d / FOAM_REACH);
      const t = Math.min(1, Math.max(0, (d - 0.5) / (DEPTH_REACH - 0.5)));
      cols.push([foam, t * t * (3 - 2 * t), 0]);
    }
    quad(pts, [0, 1, 0], cols);
  }

  // Falls: foam where the sheet lands and along its lip.
  for (const f of sides) {
    const { ix, iy, iz, dx, dz } = f;
    const open = (y: number) =>
      water(ix, y, iz) &&
      grid.inside(ix + dx, y, iz + dz) &&
      data[ix + dx + sx * (iz + dz + sz * y)] === AIR;
    let lo = iy,
      hi = iy;
    while (open(lo - 1)) lo--;
    while (open(hi + 1)) hi++;
    const bottomRun =
      o.y + lo * s - (water(ix + dx, lo - 1, iz + dz) ? WATER_DROP : 0);
    const topRun =
      o.y + (hi + 1) * s - (water(ix, hi + 1, iz) ? 0 : WATER_DROP);
    const y0 = o.y + iy * s - (f.extend ? WATER_DROP : 0);
    const y1 = o.y + (iy + 1) * s - (f.top ? WATER_DROP : 0);
    const foamAt = (y: number) =>
      Math.min(
        1,
        Math.max(0, 1 - (y - bottomRun) / 1.1, 1 - (topRun - y) / 0.45),
      );
    // Face plane on the shared side, spanning the other horizontal axis.
    const px = o.x + (ix + (dx > 0 ? 1 : 0)) * s,
      pz = o.z + (iz + (dz > 0 ? 1 : 0)) * s;
    const ax = dx !== 0 ? 0 : 1,
      az = dx !== 0 ? 1 : 0;
    const x0 = dx !== 0 ? px : o.x + ix * s,
      z0 = dx !== 0 ? o.z + iz * s : pz;
    const pts = [
      [x0, y0, z0],
      [x0 + ax * s, y0, z0 + az * s],
      [x0 + ax * s, y1, z0 + az * s],
      [x0, y1, z0],
    ];
    const cols = pts.map((p) => [foamAt(p[1]), 0, 1]);
    quad(pts, [dx, 0, dz], cols);
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    indices: new Uint32Array(indices),
  };
}

const WATER_GLSL = `
${VOXEL_HASH_GLSL}
void vxWaterShade(inout vec3 col, inout float a, out vec3 glow) {
  float t = vxWater.x;
  float night = vxWater.y;
  vec3 P = vPositionW;
  vec3 N = normalize(vNormalW);
  glow = vec3(0.0);
  if (vColor.b > 0.5) {
    // Waterfall: pixel lanes of white streaks racing down a bright sheet.
    float along = abs(N.x) > 0.5 ? P.z : P.x;
    float lane = floor(along * 16.0);
    float r = vxHash12(vec2(lane, 3.7));
    float yq = floor(P.y * 32.0) / 32.0;
    float s = fract(yq * (0.45 + 0.3 * r) + t * (1.6 + 0.9 * r) + r * 7.0);
    float streak = step(0.62 + 0.14 * r, s);
    col = mix(vec3(0.36, 0.78, 0.95), vec3(0.55, 0.88, 1.0), r);
    col = mix(col, vec3(1.0), streak * 0.8);
    float churn = vxNoise2(vec2(floor(along * 32.0) / 4.0, floor(P.y * 32.0) / 4.0 + t * 9.0));
    float foam = step(0.5, vColor.r + (churn - 0.5) * 0.6);
    col = mix(col, vec3(1.0), foam);
    a = mix(0.88, 0.97, max(foam, streak));
    glow = vec3(0.9, 0.97, 1.0) * streak * 0.1;
    return;
  }
  // Snap to the atlas texel grid (32 per metre) for a pixel-art surface.
  vec2 q = (floor(P.xz * 32.0) + 0.5) / 32.0;
  vec2 fq = q - vec2(t * 0.42, 0.0);
  float depth = vColor.g;
  col = mix(vec3(0.325, 0.780, 0.941), vec3(0.184, 0.561, 0.847), depth);
  float swell = vxNoise2(fq * vec2(0.7, 1.4) + vec2(0.0, t * 0.12));
  col *= 0.93 + 0.12 * swell;
  // Caustic ripple lines drifting downstream.
  float c1 = sin(fq.x * 3.6 + sin(fq.y * 2.7 + t * 1.1) * 1.5 + t * 0.8);
  float c2 = sin(fq.y * 4.6 + sin(fq.x * 2.1 - t * 0.9) * 1.7 - t * 1.25);
  float broken = step(0.38, vxNoise2(fq * 1.2 + vec2(t * 0.15, 3.0)));
  float rip = step(abs(c1 + c2), 0.15) * broken;
  col = mix(col, vec3(0.68, 0.93, 1.0), rip * (0.55 - 0.2 * depth));
  // Foam: a crisp wobbly band hugging the shore plus little lapping lines.
  float sh = vColor.r;
  float wob = vxNoise2(q * 2.6 + vec2(t * 0.7, -t * 0.45));
  float foam = step(0.74 - 0.26 * wob, sh);
  float lap = fract(sh * 1.5 + (wob - 0.5) * 0.6 - t * 0.35);
  float dash = step(0.5, vxNoise2(q * 1.9 + vec2(-t * 0.3, t * 0.2)));
  foam = max(foam, step(0.2, sh) * step(0.9, lap) * dash);
  col = mix(col, vec3(1.0), foam);
  a = mix(0.78 + 0.14 * depth, 0.97, foam);
  // Twinkling plus-shaped sparkles, moonlit at night.
  vec2 g = P.xz * (32.0 / 5.0);
  vec2 cell = floor(g);
  float h = vxHash12(cell + 41.0);
  float tw = sin(t * (1.6 + 2.6 * h) + h * 50.0);
  vec2 sub = floor(fract(g) * 5.0) - 2.0;
  float plus = step(abs(sub.x) + abs(sub.y), 1.0);
  float centre = step(abs(sub.x) + abs(sub.y), 0.0);
  float sp = step(0.965 - 0.02 * night, h) * smoothstep(0.55, 1.0, tw) * (plus * 0.6 + centre * 0.6);
  col = mix(col, col * vec3(0.62, 0.72, 1.0), night * 0.45);
  glow = mix(vec3(1.0, 0.97, 0.86), vec3(0.78, 0.9, 1.0), night) * sp * (1.0 + 1.2 * night) * (1.0 - foam);
}
`;

class WaterPlugin extends MaterialPluginBase {
  time = 0;
  night = 0;
  constructor(material: Material) {
    super(material, "VoxelWater", 200, { VOXEL_WATER: false });
    this._enable(true);
  }
  override prepareDefines(defines: MaterialDefines): void {
    defines["VOXEL_WATER"] = true;
  }
  override getClassName(): string {
    return "VoxelWaterPlugin";
  }
  override getUniforms() {
    return {
      ubo: [{ name: "vxWater", size: 2, type: "vec2" }],
      fragment: "#ifdef VOXEL_WATER\nuniform vec2 vxWater;\n#endif",
    };
  }
  override bindForSubMesh(ubo: UniformBuffer): void {
    ubo.updateFloat2("vxWater", this.time, this.night);
  }
  override getCustomCode(shaderType: string): ShaderCode {
    if (shaderType !== "fragment") return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `
#if defined(VOXEL_WATER) && defined(VERTEXCOLOR) && defined(NORMAL)
${WATER_GLSL}
#endif
`,
      CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `
vec3 vxWaterGlow = vec3(0.0);
#if defined(VOXEL_WATER) && defined(VERTEXCOLOR) && defined(NORMAL)
vxWaterShade(baseColor.rgb, alpha, vxWaterGlow);
#endif
`,
      CUSTOM_FRAGMENT_BEFORE_FOG: "color.rgb += vxWaterGlow;",
    };
  }
}

export type WaterMaterial = {
  material: StandardMaterial;
  update(time: number): void;
  setNight(amount: number): void;
};

export function createWaterMaterial(scene: Scene): WaterMaterial {
  const material = new StandardMaterial("voxel-water", scene);
  material.diffuseColor = new Color3(1, 1, 1);
  material.specularColor = Color3.Black();
  material.transparencyMode = Material.MATERIAL_ALPHABLEND;
  material.alpha = 0.86;
  const plugin = new WaterPlugin(material);
  return {
    material,
    update(time) {
      plugin.time = time;
    },
    setNight(amount) {
      plugin.night = Math.min(1, Math.max(0, amount));
    },
  };
}
