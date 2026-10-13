import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { generateWorld, getWorld } from "../apps/client/src/voxel/world-gen";
import { B, isOpaque } from "../apps/client/src/voxel/blocks";
import { NPCS, OBSTACLES, REFUGE, walkable } from "../packages/simulation/map";

const world = getWorld();
const { grid, owner, structures } = world;
const hash = (data: Uint8Array) =>
  createHash("sha256").update(data).digest("hex");

test("the voxel world is deterministic and sized from the world bounds", () => {
  const again = generateWorld();
  assert.equal(hash(again.grid.data), hash(grid.data));
  assert.equal(
    hash(new Uint8Array(again.owner.buffer)),
    hash(new Uint8Array(owner.buffer)),
  );
  assert.deepEqual([grid.sx, grid.sy, grid.sz], [160, 56, 264]);
  assert.deepEqual(grid.origin, { x: -40, y: -4, z: -56 });
  assert.equal(grid.size, 0.5);
  assert.equal(owner.length, grid.data.length);
  assert.equal(world.seed, 1847);
  assert.notEqual(hash(generateWorld(7).grid.data), hash(grid.data));
  // Ground surface is y = 0: the top ground block in town sits at iy 7.
  const [ix, iy, iz] = grid.toVoxel(-6, -0.25, -30);
  assert.ok(isOpaque(grid.get(ix, iy, iz)));
  assert.equal(grid.get(ix, iy + 1, iz), B.AIR);
});

test("structure owners and bounds are consistent", () => {
  const counts = new Map<number, number>();
  for (let i = 0; i < owner.length; i++) {
    const o = owner[i];
    if (!o) continue;
    assert.ok(o <= structures.length, "owner points at a structure");
    assert.notEqual(grid.data[i], B.AIR, "owned voxels are not air");
    counts.set(o, (counts.get(o) ?? 0) + 1);
  }
  structures.forEach((s, i) => {
    assert.ok(counts.get(i + 1), `${s.name} owns voxels`);
    for (let a = 0; a < 3; a++) assert.ok(s.min[a] <= s.max[a]);
  });
  const kinds = new Set(structures.map((s) => s.kind));
  for (const k of [
    "house",
    "tower",
    "arch",
    "wall",
    "tree",
    "ruin",
    "stall",
    "landmark",
    "prop",
  ])
    assert.ok(kinds.has(k as never), `has a ${k}`);
  assert.equal(structures.filter((s) => s.kind === "house").length, 4);
  assert.ok(structures.filter((s) => s.kind === "house").every((s) => s.fade));
  for (const s of structures)
    if (s.kind === "tree") {
      const [x0] = grid.toWorld(s.min[0], 0, 0);
      const [x1] = grid.toWorld(s.max[0], 0, 0);
      assert.ok(x1 > -21 && x0 < 21, `${s.name} is inside the playable area`);
    }
});

const BLOCKING = new Set([
  "house",
  "tower",
  "wall",
  "ruin",
  "arch",
  "stall",
  "landmark",
]);
// The epitaph stands in open meadow (no collision box), as in the previous scene.
const OPEN_LANDMARKS = new Set(["epitaph stone"]);

test("walkable space stays clear of buildings at body height", () => {
  const [, y0] = grid.toVoxel(0, 0.05, 0);
  const [, y1] = grid.toVoxel(0, 1.9, 0);
  const bad: string[] = [];
  for (let z = -40; z <= 60; z += 0.25)
    for (let x = -20; x <= 20; x += 0.25) {
      if (!walkable({ x, z })) continue;
      const [ix, , iz] = grid.toVoxel(x, 0, z);
      for (let iy = y0; iy <= y1; iy++) {
        const i = grid.index(ix, iy, iz);
        const o = owner[i];
        if (!o || !isOpaque(grid.data[i])) continue;
        const s = structures[o - 1];
        if (!BLOCKING.has(s.kind) || OPEN_LANDMARKS.has(s.name)) continue;
        const [, y] = grid.toWorld(ix, iy, iz);
        if (s.kind === "arch" && y > 2.5) continue;
        if (s.kind === "stall" && y > 2.2) continue;
        bad.push(`${s.name} at (${x}, ${y.toFixed(2)}, ${z})`);
      }
    }
  assert.deepEqual(bad.slice(0, 10), []);
});

test("every collision box is filled by a structure at body height", () => {
  for (const o of OBSTACLES) {
    let found = false;
    for (let z = o.z - o.d / 2; z < o.z + o.d / 2 && !found; z += 0.25)
      for (let x = o.x - o.w / 2; x < o.x + o.w / 2 && !found; x += 0.25)
        for (let y = 0.25; y <= 1.75 && !found; y += 0.25) {
          const [ix, iy, iz] = grid.toVoxel(x, y, z);
          const i = grid.index(ix, iy, iz);
          found = owner[i] > 0 && isOpaque(grid.data[i]);
        }
    assert.ok(found, `obstacle at (${o.x}, ${o.z}) has a visible structure`);
  }
  // Astrolabe pedestal sits inside its 2.1 m collision radius.
  const pedestal =
    structures.findIndex((s) => s.name === "astrolabe pedestal") + 1;
  assert.ok(pedestal > 0);
  for (let i = 0; i < owner.length; i++) {
    if (owner[i] !== pedestal) continue;
    const ix = i % grid.sx,
      iz = Math.floor(i / grid.sx) % grid.sz;
    const [x, , z] = grid.toWorld(ix, 0, iz);
    assert.ok(Math.hypot(Math.abs(x) + 0.25, Math.abs(z + 10) + 0.25) <= 2.1);
  }
});

test("surface height is flat where people stand and follows terraces gently", () => {
  for (const a of Object.values(NPCS))
    assert.equal(world.surfaceHeight(a.x, a.z), 0, `NPC at ${a.x},${a.z}`);
  for (const z of [0.5, 5, 10, 14, 30, 40, 50, 59])
    assert.equal(
      world.surfaceHeight(Math.sin(z * 0.13) * 1.3, z),
      0,
      `road at ${z}`,
    );
  for (const [x, z] of [
    [0, 20],
    [-3, 17],
    [3, 23],
    [15, 20],
    [13, 18],
    [17, 22],
  ])
    assert.equal(world.surfaceHeight(x, z), 0, `bridge deck at ${x},${z}`);
  assert.equal(world.surfaceHeight(REFUGE.x, REFUGE.z), 0);
  assert.equal(world.surfaceHeight(0, -20), 0, "plaza");
  assert.equal(world.surfaceHeight(500, 500), 0, "outside the grid");
  let raised = 0;
  for (let z = -40; z <= 60; z += 0.25)
    for (let x = -20; x <= 20; x += 0.25) {
      if (!walkable({ x, z })) continue;
      const h = world.surfaceHeight(x, z);
      assert.ok(h >= 0 && h <= 0.5, `surface ${h} at ${x},${z}`);
      if (h > 0) raised++;
    }
  assert.ok(raised > 0, "meadow terraces exist");
});

test("the river runs under the banks and stops at the bridge decks", () => {
  for (const [x, z] of [
    [8, 20],
    [-8, 20],
    [30, 19],
    [-25, 21],
  ])
    assert.equal(world.waterHeight(x, z), -0.2, `water at ${x},${z}`);
  for (const [x, z] of [
    [0, 20],
    [15, 20],
    [0, 10],
    [0, -10],
  ])
    assert.equal(world.waterHeight(x, z), null, `no water at ${x},${z}`);
  assert.ok(world.emitters.some((e) => e.kind === "waterfall"));
  assert.ok(world.emitters.some((e) => e.kind === "astrolabe"));
  assert.ok(world.lights.filter((l) => l.kind === "lantern").length >= 16);
});

test("the minimap covers every voxel column, north up", () => {
  const m = world.minimap;
  assert.equal(m.width, 160);
  assert.equal(m.height, 264);
  assert.equal(m.rgba.length, 160 * 264 * 4);
  assert.equal(m.metersPerPixel, 0.5);
  assert.ok(m.rgba.every((v, i) => i % 4 !== 3 || v === 255));
  // Row 0 is the north edge: the river (z 17..23) is near the top half.
  const riverRow = Math.floor((76 - 20) / 0.5);
  const o = (riverRow * 160 + 80 + 20) * 4;
  assert.ok(m.rgba[o + 2] > m.rgba[o], "river pixel is blue");
});

test("generation stays fast", () => {
  const t = performance.now();
  generateWorld(1847);
  assert.ok(performance.now() - t < 1500);
});
