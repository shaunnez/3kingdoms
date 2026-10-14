import type {
  AbilityKey,
  ActorKind,
  CombatEvent,
  Guild,
  Notice,
  Vec2,
} from "../../contracts/game";
import type { Actor, Mine, Projectile } from "../actor";

/** Timed conditions. Each maps to one actor field until saves carry a status list. */
export type StatusId =
  | "brace"
  | "stun"
  | "root"
  | "slow"
  | "oath"
  | "overclock"
  | "sunder"
  | "regen"
  | "evade";

export type StatusDef = {
  /** Actor field holding the expiry time (save version 1 layout). */
  field:
    | "braceUntil"
    | "stunUntil"
    | "rootUntil"
    | "slowUntil"
    | "oathUntil"
    | "overclockUntil"
    | "sunderUntil"
    | "healUntil"
    | "evadeUntil";
  /** Multiplies damage the holder deals. */
  dealt?: number;
  /** Multiplies damage the holder takes. */
  taken?: number;
  /** Multiplies movement speed. */
  speed?: number;
  blocksMovement?: boolean;
  /** Stops actions other than Break Free. */
  blocksActions?: boolean;
  blocksEvade?: boolean;
  /** Crowd control that entering a safe area removes. */
  clearedBySafety?: boolean;
  /** Incoming hits miss while active. */
  avoidsHits?: boolean;
  /** Ends when the holder takes damage. */
  endedByDamage?: boolean;
  /** While active, a blocked hit heals the holder this much. */
  healOnBlock?: number;
  /** Heat added per second while active; the status ends at the resource cap. */
  heatPerSecond?: number;
};

/**
 * What an ability does once delivered. Effects apply in order to each
 * recipient; `power` effects scale with the caster's level power and the
 * ability's catalogue power.
 */
export type Effect =
  /** Power-scaled damage. Line deliveries apply their falloff to later targets. */
  | { kind: "damage"; scale?: number }
  | { kind: "flatDamage"; amount: number }
  /**
   * A timed status on the recipient. `landed` requires the recipient to be
   * alive and not evading; `interrupt` also cancels their cast.
   */
  | {
      kind: "status";
      status: StatusId;
      duration: number;
      landed?: boolean;
      interrupt?: boolean;
      /** Apply to the caster instead of the recipient. */
      self?: boolean;
    }
  /** The caster gains spend-mode resource (capped at the resource maximum). */
  | { kind: "gain"; amount: number }
  /** Forces a creature to attack the caster; others attacked meanwhile take less. */
  | { kind: "challenge"; duration: number; otherDamage: number }
  /** Redirects a share of an ally's incoming damage to the caster. */
  | {
      kind: "interpose";
      duration: number;
      share: number;
      capOfCasterMaxHp: number;
    }
  /** Heals the caster every second; scaled down in combat. */
  | {
      kind: "regen";
      duration: number;
      fraction: number;
      combatScale: number;
    };

/** How an ability reaches its recipients when it commits. */
export type Delivery =
  /** Effects apply to the caster. */
  | { kind: "self" }
  /** Instant hit on the selected target within reach. */
  | { kind: "melee"; slack: number }
  /** A shot that travels toward the target and hits the first enemy in its path. */
  | { kind: "projectile"; speed: number; radius: number }
  /** Pierces every enemy in a straight lane toward the aim point. */
  | { kind: "line"; width: number; falloff: number }
  /** Every enemy around the caster. */
  | { kind: "burst"; radius: number }
  /** Places a ground object at the aim point that triggers on enemies. */
  | {
      kind: "mine";
      maxDistance: number;
      arm: number;
      lifetime: number;
      radius: number;
      effects: Effect[];
    }
  /** Applies directly to the selected target without a hit. */
  | { kind: "mark" }
  /** Applies to an ally within reach on the same side of the safe boundary. */
  | { kind: "ally"; reach: number }
  /** Moves the caster at once; charges recover one at a time. */
  | {
      kind: "evade";
      distance: number;
      duration: number;
      charges: number;
    }
  /** Removes listed crowd control at once. */
  | { kind: "breakFree"; clears: StatusId[] };

export type AbilityDef = {
  /** Catalogue identity, e.g. `ability.knight.sunder`. */
  id: string;
  key: AbilityKey;
  /**
   * `enemy` abilities need a harmable target in range and count as aggression
   * when they begin; `ally` needs a nearby player on the same side of the safe
   * boundary; `none` needs no target.
   */
  target: "enemy" | "ally" | "none";
  delivery: Delivery;
  effects: Effect[];
  /** Cooldown multiplier while the caster has a status. */
  cooldownScale?: { status: StatusId; scale: number };
};

export type ResourceRule = {
  name: string;
  /** `spend` pays cost from a pool; `heat` adds cost up to a ceiling. */
  mode: "spend" | "heat";
  start: number;
  max: number;
  /** Heat lost per second (heat mode). */
  cooling?: number;
  /** Out-of-combat recovery toward a cap (spend mode). */
  recovery?: { rate: number; cap: number };
  refusal: string;
};

export type GuildCombat = {
  guild: Guild;
  resource: ResourceRule;
  /** How this guild's brace status blocks while active. */
  block: { frontalOnly: boolean; taken: number };
  abilities: Partial<Record<AbilityKey, AbilityDef>>;
};

/** A creature's single attack and its chase, leash and reward rules. */
export type CreatureDef = {
  kind: ActorKind;
  id: string;
  attack: {
    name: string;
    windup: number;
    cooldown: number;
    /** Distance at which the attack starts. */
    engage: number;
    /** The attack still lands if the target is closer than this at commit. */
    reach: number;
    damage: number;
  };
  /** Players beyond this distance or out of sight are ignored. */
  sight: number;
  /** The creature gives up beyond this distance from home. */
  leash: number;
  speed: number;
  respawn: number;
  reward?: { xp: number; marks: number; minShare: number; window: number };
};

/** What the combat engine needs from the world that hosts it. */
export interface CombatHost {
  readonly now: number;
  readonly actors: Map<string, Actor>;
  mines: Mine[];
  projectiles: Projectile[];
  /** Shared id counter for events, shots and mines. */
  nextId(): number;
  emit(
    type: CombatEvent["type"],
    source: Actor,
    target: Actor,
    key: string,
    amount?: number,
    presentation?: Pick<CombatEvent, "blocked" | "aim">,
  ): void;
  say(id: string, text: string, kind?: Notice["kind"]): void;
  canHarm(a: Actor, b: Actor): boolean;
  aggression(a: Actor, b: Actor): void;
  offence(p: Actor, killer?: boolean): void;
  die(p: Actor, last?: Actor): void;
  isSafe(p: Vec2): boolean;
  lineOfSight(a: Vec2, b: Vec2): boolean;
  move(p: Vec2, dx: number, dz: number): Vec2;
}
