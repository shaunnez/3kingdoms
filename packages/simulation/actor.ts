import type {
  AbilityKey,
  ActorView,
  CorpseView,
  Item,
  Quest,
  Vec2,
} from "../contracts/game";
import type { Effect } from "./engine/types";

export type DamageRecord = {
  amount: number;
  first: number;
  last: number;
  unlawful: boolean;
};

/**
 * The authoritative actor. Timed statuses still live in the `*Until` fields
 * that version 1 saves carry; `engine/statuses.ts` is the only code that
 * should read or write them by name.
 */
export type Actor = ActorView & {
  resource: number;
  xp: number;
  marks: number;
  quest: Quest;
  inventory: Item[];
  recovery: Item[];
  cooldowns: Partial<Record<AbilityKey, number>>;
  move: Vec2;
  moveUntil: number;
  lastSeq: number;
  combatUntil: number;
  disconnectedAt: number | null;
  downedUntil: number;
  downedLock: number;
  evadeUntil: number;
  evadeCharges: number;
  evadeRecoverAt: number;
  braceUntil: number;
  stunUntil: number;
  rootUntil: number;
  slowUntil: number;
  oathUntil: number;
  overclockUntil: number;
  sunderUntil: number;
  healUntil: number;
  healTick: number;
  challenge: { owner: string; until: number } | null;
  interpose: { owner: string; until: number; remaining: number } | null;
  channel:
    | (
        | {
            kind: "loot";
            name: string;
            start: number;
            end: number;
            corpse: string;
            item: string;
            origin: Vec2;
          }
        | {
            kind: "revive";
            name: string;
            start: number;
            end: number;
            target: string;
            origin: Vec2;
          }
      )
    | null;
  damage: Record<string, DamageRecord>;
  retaliation: Record<string, number>;
  target: string | null;
  home: Vec2;
  respawnAt: number;
  active: boolean;
};
export type Corpse = CorpseView & { priorItems: Item[] };
/** A placed ground object that triggers once when an enemy comes close. */
export type Mine = Vec2 & {
  id: number;
  owner: string;
  key: AbilityKey;
  arm: number;
  expires: number;
  radius: number;
  effects: Effect[];
};
/** A travelling shot. Damage is fixed when it leaves the caster. */
export type Projectile = Vec2 & {
  id: number;
  owner: string;
  key: AbilityKey;
  dx: number;
  dz: number;
  travelled: number;
  range: number;
  damage: number;
  speed: number;
  radius: number;
  effects: Effect[];
};
