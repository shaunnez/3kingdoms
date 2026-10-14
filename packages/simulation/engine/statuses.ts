import type { Actor } from "../actor";
import type { StatusDef, StatusId } from "./types";

export const STATUSES: Record<StatusId, StatusDef> = {
  brace: { field: "braceUntil", blocksMovement: true },
  stun: {
    field: "stunUntil",
    blocksMovement: true,
    blocksActions: true,
    clearedBySafety: true,
  },
  root: {
    field: "rootUntil",
    blocksMovement: true,
    blocksEvade: true,
    clearedBySafety: true,
  },
  slow: { field: "slowUntil", speed: 0.7, clearedBySafety: true },
  oath: { field: "oathUntil", healOnBlock: 25 },
  overclock: { field: "overclockUntil", dealt: 1.15, heatPerSecond: 8 },
  sunder: { field: "sunderUntil", taken: 1.15 },
  regen: { field: "healUntil", endedByDamage: true },
  evade: { field: "evadeUntil", avoidsHits: true },
};
const IDS = Object.keys(STATUSES) as StatusId[];
// Lists are fixed at load so per-step checks allocate nothing. Multipliers
// apply in this order, which keeps results bit-for-bit stable.
const having = (flag: keyof StatusDef) =>
  IDS.filter((id) => STATUSES[id][flag] !== undefined);
const DEALT = having("dealt");
const TAKEN = having("taken");
const SPEED = having("speed");
const MOVE_BLOCKERS = having("blocksMovement");
const ACTION_BLOCKERS = having("blocksActions");
const EVADE_BLOCKERS = having("blocksEvade");
const SAFETY_CLEARED = having("clearedBySafety");
const DAMAGE_ENDED = having("endedByDamage");
const AVOIDING = having("avoidsHits");
const BLOCK_HEALING = having("healOnBlock");
const HEATING = having("heatPerSecond");
const any = (ids: StatusId[], p: Actor, now: number): boolean => {
  for (const id of ids) if (until(p, id) > now) return true;
  return false;
};

export const active = (p: Actor, id: StatusId, now: number): boolean =>
  until(p, id) > now;
/**
 * Expiry time of a status. Reads are spelled out per field because they run
 * for every actor every step; `STATUSES[id].field` names the same fields and
 * a test keeps the two in step.
 */
export function until(p: Actor, id: StatusId): number {
  switch (id) {
    case "brace":
      return p.braceUntil;
    case "stun":
      return p.stunUntil;
    case "root":
      return p.rootUntil;
    case "slow":
      return p.slowUntil;
    case "oath":
      return p.oathUntil;
    case "overclock":
      return p.overclockUntil;
    case "sunder":
      return p.sunderUntil;
    case "regen":
      return p.healUntil;
    case "evade":
      return p.evadeUntil;
  }
}
export function apply(p: Actor, id: StatusId, end: number) {
  p[STATUSES[id].field] = end;
}
export function clear(p: Actor, id: StatusId) {
  p[STATUSES[id].field] = 0;
}

export const blocksMovement = (p: Actor, now: number): boolean =>
  any(MOVE_BLOCKERS, p, now);
export const blocksActions = (p: Actor, now: number): boolean =>
  any(ACTION_BLOCKERS, p, now);
export const blocksEvade = (p: Actor, now: number): boolean =>
  any(EVADE_BLOCKERS, p, now);

export function speedScale(p: Actor, now: number): number {
  let scale = 1;
  for (const id of SPEED) if (active(p, id, now)) scale *= STATUSES[id].speed!;
  return scale;
}
export function dealt(p: Actor, amount: number, now: number): number {
  for (const id of DEALT) if (active(p, id, now)) amount *= STATUSES[id].dealt!;
  return amount;
}
export function taken(p: Actor, amount: number, now: number): number {
  for (const id of TAKEN) if (active(p, id, now)) amount *= STATUSES[id].taken!;
  return amount;
}
/** Entering a safe area removes crowd control. */
export function clearOnSafety(p: Actor) {
  for (const id of SAFETY_CLEARED) clear(p, id);
}
/** Damage ends statuses such as regeneration. */
export function clearOnDamage(p: Actor) {
  for (const id of DAMAGE_ENDED) clear(p, id);
}
export const avoidsHits = (p: Actor, now: number): boolean =>
  any(AVOIDING, p, now);
/** Healing a blocked hit grants (0 when no such status is active). */
export function healOnBlock(p: Actor, now: number): number {
  for (const id of BLOCK_HEALING)
    if (active(p, id, now)) return STATUSES[id].healOnBlock!;
  return 0;
}
/** Adds heat for active heating statuses; each ends when heat reaches `max`. */
export function heat(p: Actor, dt: number, max: number, now: number) {
  for (const id of HEATING)
    if (active(p, id, now)) {
      p.resource = Math.min(max, p.resource + dt * STATUSES[id].heatPerSecond!);
      if (p.resource >= max) clear(p, id);
    }
}
