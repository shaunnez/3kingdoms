import type { Vec2 } from "../contracts/game";
export const MAP = { minX: -20, maxX: 20, minZ: -40, maxZ: 60, safeZ: 0 };
export const REFUGE = { x: 14, z: 45, radius: 4 };
export const OBSTACLES = [
  { x: -15, z: -23, w: 9, d: 16 },
  { x: 15, z: -24, w: 9, d: 14 },
  { x: -14, z: -8, w: 9, d: 8 },
  { x: 15, z: -9, w: 7, d: 8 },
  { x: -11, z: 5, w: 10, d: 1.8 },
  { x: 9, z: 5, w: 7, d: 1.8 },
  { x: -13, z: 31, w: 6, d: 6 },
];
export const NPCS = {
  mara: { x: -5, z: -9 },
  merchant: { x: 7, z: -14 },
  guard: { x: -3, z: -3 },
  inscription: { x: -4, z: 34 },
};
export function isSafe(p: Vec2): boolean {
  return p.z <= MAP.safeZ || distanceSquared(p, REFUGE) <= REFUGE.radius ** 2;
}
export function distanceSquared(a: Vec2, b: Vec2): number {
  return (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
}
export function walkable(p: Vec2, radius = 0.4): boolean {
  if (
    p.x < MAP.minX + radius ||
    p.x > MAP.maxX - radius ||
    p.z < MAP.minZ + radius ||
    p.z > MAP.maxZ - radius
  )
    return false;
  if (
    p.z > 17 - radius &&
    p.z < 23 + radius &&
    !(
      Math.abs(p.x) < 3.6 - radius ||
      (p.x > 12.5 + radius && p.x < 17.5 - radius)
    )
  )
    return false;
  return !OBSTACLES.some(
    (o) =>
      Math.abs(p.x - o.x) < o.w / 2 + radius &&
      Math.abs(p.z - o.z) < o.d / 2 + radius,
  );
}
export function move(p: Vec2, x: number, z: number): Vec2 {
  let out = { ...p };
  const steps = Math.max(1, Math.ceil(Math.hypot(x, z) / 0.2));
  for (let i = 0; i < steps; i++) {
    const dx = x / steps,
      dz = z / steps;
    if (walkable({ x: out.x + dx, z: out.z + dz }))
      out = { x: out.x + dx, z: out.z + dz };
    else {
      if (walkable({ x: out.x + dx, z: out.z })) out.x += dx;
      if (walkable({ x: out.x, z: out.z + dz })) out.z += dz;
    }
  }
  return out;
}
export function lineOfSight(a: Vec2, b: Vec2): boolean {
  const n = Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) / 0.3);
  for (let i = 1; i < n; i++) {
    const x = a.x + ((b.x - a.x) * i) / n,
      z = a.z + ((b.z - a.z) * i) / n;
    if (
      OBSTACLES.some(
        (o) => Math.abs(x - o.x) < o.w / 2 && Math.abs(z - o.z) < o.d / 2,
      )
    )
      return false;
  }
  return true;
}
