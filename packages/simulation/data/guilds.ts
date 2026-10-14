import type { AbilityKey, Guild } from "../../contracts/game";
import type { AbilityDef, GuildCombat } from "../engine/types";

// Combat behaviour for each guild, keyed by catalogue ability ids. Names,
// cooldowns, windups, ranges, powers and costs stay in `KITS`
// (packages/contracts/game.ts), which the HUD also reads.

/** Evade and Break Free are shared by every guild. */
const SHARED: Partial<Record<AbilityKey, AbilityDef>> = {
  space: {
    id: "ability.shared.evade",
    key: "space",
    target: "none",
    delivery: { kind: "evade", distance: 3, duration: 0.35, charges: 2 },
    effects: [],
  },
  c: {
    id: "ability.shared.break-free",
    key: "c",
    target: "none",
    delivery: { kind: "breakFree", clears: ["stun", "root"] },
    effects: [],
  },
};

const melee = { kind: "melee", slack: 0.4 } as const;
const self = { kind: "self" } as const;

export const KNIGHT: GuildCombat = {
  guild: "knight",
  resource: {
    name: "Resolve",
    mode: "spend",
    start: 60,
    max: 100,
    recovery: { rate: 4, cap: 60 },
    refusal: "Not enough Resolve. Measured Cut and Brace rebuild it.",
  },
  block: { frontalOnly: true, taken: 0.4 },
  abilities: {
    ...SHARED,
    basic: {
      id: "ability.knight.measured-cut",
      key: "basic",
      target: "enemy",
      delivery: melee,
      effects: [{ kind: "damage" }, { kind: "gain", amount: 10 }],
    },
    "1": {
      id: "ability.knight.sunder",
      key: "1",
      target: "enemy",
      delivery: melee,
      effects: [
        { kind: "damage" },
        { kind: "status", status: "sunder", duration: 5 },
      ],
    },
    "2": {
      id: "ability.knight.shield-bash",
      key: "2",
      target: "enemy",
      delivery: melee,
      effects: [
        { kind: "damage" },
        {
          kind: "status",
          status: "stun",
          duration: 0.7,
          landed: true,
          interrupt: true,
        },
      ],
    },
    "3": {
      id: "ability.knight.challenge",
      key: "3",
      target: "enemy",
      delivery: { kind: "mark" },
      effects: [{ kind: "challenge", duration: 4, otherDamage: 0.85 }],
    },
    "4": {
      id: "ability.knight.interpose",
      key: "4",
      target: "ally",
      delivery: { kind: "ally", reach: 8 },
      effects: [
        { kind: "interpose", duration: 3, share: 0.3, capOfCasterMaxHp: 0.2 },
      ],
    },
    "5": {
      id: "ability.knight.rally",
      key: "5",
      target: "none",
      delivery: self,
      effects: [
        { kind: "regen", duration: 4, fraction: 0.25, combatScale: 0.75 },
      ],
    },
    r: {
      id: "ability.knight.last-oath",
      key: "r",
      target: "none",
      delivery: self,
      effects: [{ kind: "status", status: "oath", duration: 6, self: true }],
    },
    q: {
      id: "ability.knight.brace",
      key: "q",
      target: "none",
      delivery: self,
      effects: [
        { kind: "status", status: "brace", duration: 0.8, self: true },
        { kind: "gain", amount: 8 },
      ],
    },
  },
};

export const CYBORG: GuildCombat = {
  guild: "cyborg",
  resource: {
    name: "Heat",
    mode: "heat",
    start: 0,
    max: 100,
    cooling: 5,
    refusal: "Heat limit. Use Coolant Burst or allow the core to cool.",
  },
  block: { frontalOnly: false, taken: 0.55 },
  abilities: {
    ...SHARED,
    basic: {
      id: "ability.cyborg.pulse-tap",
      key: "basic",
      target: "enemy",
      delivery: { kind: "projectile", speed: 18, radius: 0.48 },
      effects: [{ kind: "damage" }],
      cooldownScale: { status: "overclock", scale: 0.75 },
    },
    "1": {
      id: "ability.cyborg.pulse-lance",
      key: "1",
      target: "enemy",
      delivery: { kind: "line", width: 0.75, falloff: 0.5 },
      effects: [{ kind: "damage" }],
    },
    "2": {
      id: "ability.cyborg.mag-clamp",
      key: "2",
      target: "enemy",
      delivery: { kind: "projectile", speed: 18, radius: 0.48 },
      effects: [
        { kind: "damage" },
        { kind: "status", status: "root", duration: 1, landed: true },
      ],
    },
    "3": {
      id: "ability.cyborg.arc-mine",
      key: "3",
      target: "none",
      delivery: {
        kind: "mine",
        maxDistance: 6,
        arm: 1,
        lifetime: 12,
        radius: 2,
        effects: [
          { kind: "flatDamage", amount: 51 },
          { kind: "status", status: "slow", duration: 2 },
        ],
      },
      effects: [],
    },
    "4": {
      id: "ability.cyborg.coolant-burst",
      key: "4",
      target: "none",
      delivery: { kind: "burst", radius: 3 },
      effects: [{ kind: "status", status: "slow", duration: 2 }],
    },
    "5": {
      id: "ability.cyborg.repair-drone",
      key: "5",
      target: "none",
      delivery: self,
      effects: [
        { kind: "regen", duration: 5, fraction: 0.3, combatScale: 0.75 },
      ],
    },
    r: {
      id: "ability.cyborg.overclock",
      key: "r",
      target: "none",
      delivery: self,
      effects: [
        { kind: "status", status: "overclock", duration: 6, self: true },
      ],
    },
    q: {
      id: "ability.cyborg.reactive-plating",
      key: "q",
      target: "none",
      delivery: self,
      effects: [{ kind: "status", status: "brace", duration: 1, self: true }],
    },
  },
};

export const GUILD_COMBAT: Record<Guild, GuildCombat> = {
  knight: KNIGHT,
  cyborg: CYBORG,
};
