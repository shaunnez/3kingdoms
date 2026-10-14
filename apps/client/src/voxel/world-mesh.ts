/**
 * Babylon presentation of the generated VoxelWorld: 32 × 32-column terrain
 * chunks (terrain plus non-fading structures), one mesh per fading structure,
 * merged foliage and emissive meshes, and the stylised water. Everything is
 * static: world matrices are frozen and nothing is pickable. Fading structures
 * swap to an alpha-blended material only while they hide the player.
 */
import {
  Mesh,
  TransformNode,
  Vector3,
  VertexData,
  type Material,
  type Scene,
  type ShadowGenerator,
} from "@babylonjs/core";
import type { StructureView, VoxelWorld, WorldView } from "./api";
import { B, blockDef, blockEmissive, isOpaque } from "./blocks";
import {
  emptyMesh,
  mergeMeshes,
  meshBlocks,
  type Face,
  type MeshData,
} from "./mesher";
import { createWorldMaterials } from "./world-mesh-materials";
import { buildWaterData, createWaterMaterial } from "./world-mesh-water";

const CHUNK = 32;
/** Cross (foliage) meshes merge 2 × 2 chunks: few draw calls, still culled. */
const CROSS_GROUP = 2;
const FADED = 0.12;
const FADE_RATE = 7;
/**
 * Shadow casters farther than this from the focus (XZ, metres) are dropped:
 * shadow maps are not frustum-culled, and the scene's 48 m shadow frustum
 * (light kept above ~38° elevation) cannot receive shadows from farther away.
 */
const CASTER_RADIUS = 28;

/** Emissive kind codes written into vertex alpha for the glow plugin. */
const EMISSIVE_CODES = new Map<number, number>([
  [blockEmissive(B.GLASS_LIT), 1],
  [blockEmissive(B.RUNE), 2],
  [blockEmissive(B.CRYSTAL), 3],
  [blockEmissive(B.LANTERN), 4],
]);

// ───────────────────────────── tint ─────────────────────────────

function hash3(a: number, b: number, c: number): number {
  let h =
    Math.imul(a | 0, 374761393) ^
    Math.imul(b | 0, 668265263) ^
    Math.imul(c | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function valueNoise(x: number, z: number, seed: number): number {
  const x0 = Math.floor(x),
    z0 = Math.floor(z);
  const fx = x - x0,
    fz = z - z0;
  const u = fx * fx * (3 - 2 * fx),
    v = fz * fz * (3 - 2 * fz);
  const a = hash3(x0, z0, seed),
    b = hash3(x0 + 1, z0, seed),
    c = hash3(x0, z0 + 1, seed),
    d = hash3(x0 + 1, z0 + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Gentle biome variation for tint blocks (the atlas already paints final
 * greens, so these are multipliers near 1) and ±3% per-block brightness jitter
 * on every block for a hand-made look. Returns a reused tuple.
 */
function createTint(world: VoxelWorld) {
  const grid = world.grid;
  const { sx, sz } = grid;
  const s = grid.size,
    o = grid.origin;
  const table = new Float32Array(sx * sz * 3);
  // Fresh #7ccf5a-ish, deeper #5fb548-ish and a sunny, warmer patch.
  const fresh = [1.06, 1.03, 1.04],
    deep = [0.86, 0.92, 0.86],
    warm = [1.1, 1.04, 0.82];
  for (let iz = 0; iz < sz; iz++)
    for (let ix = 0; ix < sx; ix++) {
      const x = o.x + (ix + 0.5) * s,
        z = o.z + (iz + 0.5) * s;
      const base =
        valueNoise(x * 0.05, z * 0.05, world.seed + 11) * 0.7 +
        valueNoise(x * 0.13, z * 0.13, world.seed + 12) * 0.3;
      const g = smoothstep(0.3, 0.7, base);
      const w =
        smoothstep(
          0.62,
          0.82,
          valueNoise(x * 0.07, z * 0.07, world.seed + 13),
        ) * 0.65;
      const k = (ix + iz * sx) * 3;
      for (let c = 0; c < 3; c++)
        table[k + c] =
          (fresh[c] + (deep[c] - fresh[c]) * g) * (1 - w) + warm[c] * w;
    }
  const tinted = new Uint8Array(256),
    plain = new Uint8Array(256);
  for (let id = 0; id < 256; id++) {
    const d = blockDef(id);
    tinted[id] = d.tint && id === d.id ? 1 : 0;
    plain[id] = !d.tint && d.emissive === 0 && id === d.id ? 1 : 0;
  }
  const out: [number, number, number] = [1, 1, 1];
  return (ix: number, iy: number, iz: number, id: number, _face: Face) => {
    const j = 0.97 + 0.06 * hash3(ix, iy, iz);
    if (tinted[id]) {
      const k = (ix + iz * sx) * 3;
      out[0] = table[k] * j;
      out[1] = table[k + 1] * j;
      out[2] = table[k + 2] * j;
      return out;
    }
    if (!plain[id]) return undefined;
    out[0] = out[1] = out[2] = j;
    return out;
  };
}

// ───────────────────────────── geometry helpers ─────────────────────────────

/**
 * Drop quads lying on the outer faces of the grid (its solid bottom and sides
 * are never seen). Every mesher quad is 4 vertices + 6 indices in order.
 */
function dropGridShell(
  d: MeshData,
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    minZ: number;
    maxZ: number;
  },
): MeshData {
  const quads = d.indices.length / 6;
  const keep: number[] = [];
  const eps = 1e-4;
  for (let q = 0; q < quads; q++) {
    const p = q * 12; // first vertex of the quad
    const nx = d.normals[p],
      ny = d.normals[p + 1],
      nz = d.normals[p + 2];
    const x = d.positions[p],
      y = d.positions[p + 1],
      z = d.positions[p + 2];
    const outer =
      (nx < -0.5 && Math.abs(x - bounds.minX) < eps) ||
      (nx > 0.5 && Math.abs(x - bounds.maxX) < eps) ||
      (ny < -0.5 && Math.abs(y - bounds.minY) < eps) ||
      (nz < -0.5 && Math.abs(z - bounds.minZ) < eps) ||
      (nz > 0.5 && Math.abs(z - bounds.maxZ) < eps);
    if (!outer) keep.push(q);
  }
  if (keep.length === quads) return d;
  const out: MeshData = {
    positions: new Float32Array(keep.length * 12),
    normals: new Float32Array(keep.length * 12),
    colors: new Float32Array(keep.length * 16),
    uvs: new Float32Array(keep.length * 8),
    indices: new Uint32Array(keep.length * 6),
  };
  keep.forEach((q, n) => {
    const v0 = q * 4;
    out.positions.set(d.positions.subarray(v0 * 3, v0 * 3 + 12), n * 12);
    out.normals.set(d.normals.subarray(v0 * 3, v0 * 3 + 12), n * 12);
    out.colors.set(d.colors.subarray(v0 * 4, v0 * 4 + 16), n * 16);
    out.uvs.set(d.uvs.subarray(v0 * 2, v0 * 2 + 8), n * 8);
    for (let k = 0; k < 6; k++)
      out.indices[n * 6 + k] = d.indices[q * 6 + k] - v0 + n * 4;
  });
  return out;
}

/** Rewrite emissive vertex alpha (mesher glow strength) to the glow plugin's kind codes. */
function encodeEmissive(d: MeshData): MeshData {
  for (let i = 3; i < d.colors.length; i += 4) {
    let code = 1;
    for (const [strength, k] of EMISSIVE_CODES)
      if (Math.abs(d.colors[i] - strength) < 1e-3) code = k;
    d.colors[i] = code;
  }
  return d;
}

/**
 * Canopy sway weight in vertex alpha (the tree material reads it; the mesh has
 * hasVertexAlpha = false so it never affects transparency): still for the
 * lower trunk, rising to 1 at the crown. A function of height only, so shared
 * corners always agree.
 */
function swayWeights(d: MeshData, baseY: number, height: number): void {
  const span = Math.max(1, height - 1.5);
  for (let v = 0; v < d.positions.length / 3; v++) {
    const t = Math.min(
      1,
      Math.max(0, (d.positions[v * 3 + 1] - baseY - 1.5) / span),
    );
    d.colors[v * 4 + 3] = t * Math.sqrt(t);
  }
}

function toMesh(
  name: string,
  d: Omit<MeshData, "uvs"> & { uvs?: Float32Array },
  material: Material,
  root: TransformNode,
  scene: Scene,
): Mesh {
  const mesh = new Mesh(name, scene);
  const vd = new VertexData();
  vd.positions = d.positions;
  vd.normals = d.normals;
  vd.colors = d.colors;
  if (d.uvs) vd.uvs = d.uvs;
  vd.indices = d.indices;
  vd.applyToMesh(mesh, false);
  mesh.hasVertexAlpha = false;
  mesh.material = material;
  mesh.parent = root;
  mesh.isPickable = false;
  mesh.receiveShadows = true;
  mesh.freezeWorldMatrix();
  mesh.doNotSyncBoundingInfo = true;
  return mesh;
}

// ───────────────────────────── view ─────────────────────────────

type FadeState = {
  view: StructureView;
  parts: Mesh[];
  /** The solid part, which swaps to the `faded` material while see-through. */
  solid: Mesh | null;
  foliage: Mesh | null;
  opaque: Material;
  faded: Material;
  visibility: number;
  fading: boolean;
};

export type WorldViewStats = {
  buildMs: number;
  /** Phase timings in ms: setup (materials, atlas, tint), terrain, structures, water. */
  phases: Record<string, number>;
  meshes: number;
  vertices: number;
  triangles: number;
};

export function buildWorldView(
  scene: Scene,
  world: VoxelWorld,
  options: { shadow: ShadowGenerator | null },
): WorldView & { stats: WorldViewStats } {
  const started = performance.now();
  const grid = world.grid;
  const { sx, sy, sz } = grid;
  const s = grid.size,
    o = grid.origin;
  const layer = sx * sz;
  const owner = world.owner;
  const structures = world.structures;
  const shell = {
    minX: o.x,
    maxX: o.x + sx * s,
    minY: o.y,
    minZ: o.z,
    maxZ: o.z + sz * s,
  };

  const phases: Record<string, number> = {};
  let mark = started;
  const phase = (name: string) => {
    const now = performance.now();
    phases[name] = Math.round(now - mark);
    mark = now;
  };
  const root = new TransformNode("voxel-world", scene);
  const materials = createWorldMaterials(scene);
  const water = createWaterMaterial(scene);
  const tint = createTint(world);
  phase("setup");

  const fading = new Uint8Array(structures.length + 1);
  structures.forEach((st, i) => (fading[i + 1] = st.fade ? 1 : 0));
  const opaque = new Uint8Array(256);
  for (let id = 0; id < 256; id++) opaque[id] = isOpaque(id) ? 1 : 0;

  const meshes: Mesh[] = [];
  const chunks: Mesh[] = [];
  const emissiveMeshes: Mesh[] = [];
  const casters: Mesh[] = [];
  let vertices = 0,
    triangles = 0;
  const add = (
    name: string,
    d: Omit<MeshData, "uvs"> & { uvs?: Float32Array },
    material: Material,
  ): Mesh => {
    const mesh = toMesh(name, d, material, root, scene);
    meshes.push(mesh);
    vertices += d.positions.length / 3;
    triangles += d.indices.length / 3;
    return mesh;
  };

  // The mesher calls include() for a voxel right before testing its faces, so
  // `current` tells a face-culling query (a direct neighbour) from an AO sample.
  // Terrain faces are only culled by terrain (no holes when a house fades), but
  // fading structures still darken the ground around them.
  let current = -1;
  const faceNeighbour = (delta: number) =>
    delta === 1 ||
    delta === -1 ||
    delta === sx ||
    delta === -sx ||
    delta === layer ||
    delta === -layer;
  const data = grid.data;
  // Terrain-owned, opaque and not hiding a fading structure.
  const solidTerrain = (i: number) =>
    opaque[data[i]] === 1 && fading[owner[i]] === 0;
  const terrainInclude = (index: number) => {
    current = index;
    if (fading[owner[index]] !== 0) return false;
    // Early out for buried voxels (most of the grid). Index neighbours alias
    // across rows only on the grid's outer shell, whose faces are dropped anyway.
    return !(
      index >= layer &&
      index + layer < data.length &&
      solidTerrain(index + 1) &&
      solidTerrain(index - 1) &&
      solidTerrain(index + sx) &&
      solidTerrain(index - sx) &&
      solidTerrain(index + layer) &&
      solidTerrain(index - layer)
    );
  };
  const terrainOccludes = (index: number, id: number) =>
    opaque[id] === 1 &&
    (fading[owner[index]] === 0 || !faceNeighbour(index - current));

  // ── Terrain chunks ──
  // Skip the solid bottom layer (its faces are hidden) and the empty sky above
  // the tallest column in each chunk.
  let bottom = 1;
  for (let i = 0; i < layer; i++)
    if (!opaque[data[i]]) {
      bottom = 0;
      break;
    }
  const columnTop = new Int16Array(layer);
  for (let iy = sy - 1; iy >= 0; iy--) {
    const base = iy * layer;
    for (let c = 0; c < layer; c++)
      if (columnTop[c] === 0 && data[base + c] !== 0) columnTop[c] = iy + 1;
  }
  const crossGroups = new Map<string, MeshData[]>();
  const terrainEmissive: MeshData[] = [];
  for (let cz = 0; cz < sz; cz += CHUNK)
    for (let cx = 0; cx < sx; cx += CHUNK) {
      const x1 = Math.min(sx, cx + CHUNK),
        z1 = Math.min(sz, cz + CHUNK);
      let top = 0;
      for (let iz = cz; iz < z1; iz++)
        for (let ix = cx; ix < x1; ix++)
          top = Math.max(top, columnTop[ix + iz * sx]);
      const range = { x0: cx, y0: bottom, z0: cz, x1, y1: top, z1 };
      const out = meshBlocks(grid, {
        range,
        include: terrainInclude,
        occludes: terrainOccludes,
        tint,
      });
      const solid = dropGridShell(out.solid, shell);
      if (!emptyMesh(solid)) {
        const mesh = add(`voxel-chunk-${cx}-${cz}`, solid, materials.solid);
        chunks.push(mesh);
        casters.push(mesh);
      }
      if (!emptyMesh(out.cross)) {
        const key = `${Math.floor(cx / (CHUNK * CROSS_GROUP))}:${Math.floor(cz / (CHUNK * CROSS_GROUP))}`;
        const list = crossGroups.get(key) ?? [];
        list.push(out.cross);
        crossGroups.set(key, list);
      }
      if (!emptyMesh(out.emissive))
        terrainEmissive.push(dropGridShell(out.emissive, shell));
    }
  for (const [key, list] of crossGroups)
    add(`voxel-foliage-${key}`, mergeMeshes(list), materials.cross);
  if (terrainEmissive.length) {
    const d = encodeEmissive(mergeMeshes(terrainEmissive));
    if (!emptyMesh(d)) {
      const glow = add("voxel-glow-terrain", d, materials.emissive);
      emissiveMeshes.push(glow);
      casters.push(glow);
    }
  }

  phase("terrain");

  // ── Fading structures ──
  const fades: FadeState[] = [];
  structures.forEach((info, k) => {
    if (!info.fade) return;
    const id = k + 1;
    const range = {
      x0: info.min[0],
      y0: info.min[1],
      z0: info.min[2],
      x1: info.max[0] + 1,
      y1: info.max[1] + 1,
      z1: info.max[2] + 1,
    };
    const out = meshBlocks(grid, {
      range,
      include: (index) => owner[index] === id,
      tint,
    });
    const base = `voxel-${info.kind}-${k}`;
    const parts: Mesh[] = [];
    const isTree = info.kind === "tree";
    let solid: Mesh | null = null;
    if (!emptyMesh(out.solid)) {
      if (isTree)
        swayWeights(
          out.solid,
          o.y + info.min[1] * s,
          (info.max[1] + 1 - info.min[1]) * s,
        );
      solid = add(base, out.solid, isTree ? materials.tree : materials.solid);
      casters.push(solid);
      parts.push(solid);
    }
    if (!emptyMesh(out.emissive)) {
      const glow = add(
        `${base}-glow`,
        encodeEmissive(out.emissive),
        materials.emissive,
      );
      emissiveMeshes.push(glow);
      // Windows and lanterns are solid too: without them shadows get holes.
      casters.push(glow);
      parts.push(glow);
    }
    const foliage = emptyMesh(out.cross)
      ? null
      : add(`${base}-foliage`, out.cross, materials.cross);
    if (foliage) parts.push(foliage);
    if (!parts.length) return;
    for (const p of parts)
      p.metadata = { structure: info.name, kind: info.kind };
    const view: StructureView = {
      mesh: parts[0],
      info,
      min: new Vector3(
        o.x + info.min[0] * s,
        o.y + info.min[1] * s,
        o.z + info.min[2] * s,
      ),
      max: new Vector3(
        o.x + (info.max[0] + 1) * s,
        o.y + (info.max[1] + 1) * s,
        o.z + (info.max[2] + 1) * s,
      ),
    };
    fades.push({
      view,
      parts,
      solid,
      foliage,
      opaque: isTree ? materials.tree : materials.solid,
      faded: isTree ? materials.treeFade : materials.solidFade,
      visibility: 1,
      fading: false,
    });
  });

  phase("structures");

  // ── Water ──
  const wd = buildWaterData(world);
  const waterMesh = wd ? add("voxel-water", wd, water.material) : null;

  phase("water");

  // ── Shadows ──
  const shadow = options.shadow;
  const casterBounds = casters.map((m) => m.getBoundingInfo().boundingBox);
  const active = new Set<Mesh>();
  if (shadow)
    for (const m of casters) {
      shadow.addShadowCaster(m, false);
      active.add(m);
    }
  let lastCasterFocus: Vector3 | null = null;
  let casterTimer = 0;
  const refreshCasters = (focus: Vector3) => {
    if (!shadow) return;
    casters.forEach((m, i) => {
      const b = casterBounds[i];
      const dx = Math.max(
        b.minimumWorld.x - focus.x,
        0,
        focus.x - b.maximumWorld.x,
      );
      const dz = Math.max(
        b.minimumWorld.z - focus.z,
        0,
        focus.z - b.maximumWorld.z,
      );
      const near = dx * dx + dz * dz < CASTER_RADIUS * CASTER_RADIUS;
      if (near && !active.has(m)) {
        shadow.addShadowCaster(m, false);
        active.add(m);
      } else if (!near && active.has(m)) {
        shadow.removeShadowCaster(m, false);
        active.delete(m);
      }
    });
  };

  // ── Occlusion ──
  // Slab test of the camera → focus segment (t in 0..1) against a padded box.
  const PAD = 0.25;
  const span = { t0: 0, t1: 1 };
  const slab = (p: number, d: number, lo: number, hi: number) => {
    lo -= PAD;
    hi += PAD;
    if (Math.abs(d) < 1e-9) return p >= lo && p <= hi;
    let ta = (lo - p) / d,
      tb = (hi - p) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    span.t0 = Math.max(span.t0, ta);
    span.t1 = Math.min(span.t1, tb);
    return span.t0 <= span.t1;
  };
  const segmentHits = (a: Vector3, b: Vector3, min: Vector3, max: Vector3) => {
    span.t0 = 0;
    span.t1 = 1;
    return (
      slab(a.x, b.x - a.x, min.x, max.x) &&
      slab(a.y, b.y - a.y, min.y, max.y) &&
      slab(a.z, b.z - a.z, min.z, max.z)
    );
  };
  const setVisibility = (f: FadeState, v: number) => {
    f.visibility = v;
    const fade = v < 0.999;
    if (fade !== f.fading) {
      f.fading = fade;
      if (f.solid) f.solid.material = fade ? f.faded : f.opaque;
    }
    for (const p of f.parts) p.visibility = fade ? v : 1;
    // Alpha-tested plants cannot blend: hide them once the structure is mostly gone.
    if (f.foliage) f.foliage.isVisible = v > 0.6;
  };

  const setNight = (amount: number) => {
    const night = Math.min(1, Math.max(0, amount));
    materials.setNight(night);
    water.setNight(night);
  };
  setNight(0);

  let disposed = false;
  const stats: WorldViewStats = {
    buildMs: Math.round(performance.now() - started),
    phases,
    meshes: meshes.length,
    vertices,
    triangles,
  };
  return {
    root,
    chunks,
    structures: fades.map((f) => f.view),
    water: waterMesh,
    emissiveMeshes,
    setNight,
    update(_dt, time) {
      materials.update(time);
      water.update(time);
    },
    updateOcclusion(camera, focus, dt) {
      const k = 1 - Math.exp(-FADE_RATE * Math.max(0, dt));
      for (const f of fades) {
        const target = segmentHits(camera, focus, f.view.min, f.view.max)
          ? FADED
          : 1;
        if (f.visibility === target) continue;
        let v = f.visibility + (target - f.visibility) * k;
        if (Math.abs(v - target) < 0.004) v = target;
        setVisibility(f, v);
      }
      casterTimer -= dt;
      if (
        shadow &&
        (casterTimer <= 0 ||
          !lastCasterFocus ||
          Vector3.DistanceSquared(lastCasterFocus, focus) > 9)
      ) {
        casterTimer = 0.5;
        lastCasterFocus = focus.clone();
        refreshCasters(focus);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (shadow) for (const m of active) shadow.removeShadowCaster(m, false);
      active.clear();
      for (const m of meshes) m.dispose(false, false);
      root.dispose();
      materials.dispose();
      water.material.dispose(false, false);
      meshes.length = 0;
    },
    stats,
  };
}
