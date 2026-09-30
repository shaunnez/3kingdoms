export const PROTOCOL = 1;
export const BUILD = "0.1.0-briar-gate";
export type Guild = "knight" | "cyborg";
export type Vec2 = { x: number; z: number };
export type ActorKind = "player" | "wolf" | "guard" | "mara" | "merchant";
export type Life = "alive" | "downed" | "dead";
export type AbilityKey =
  "basic" | "1" | "2" | "3" | "4" | "5" | "r" | "q" | "space" | "c";
export type Cast = {
  key: AbilityKey;
  name: string;
  start: number;
  end: number;
  target: string;
  aim: Vec2;
};
export type ActorView = Vec2 & {
  id: string;
  name: string;
  kind: ActorKind;
  guild: Guild;
  hp: number;
  maxHp: number;
  heading: number;
  life: Life;
  level: number;
  red: number;
  killer: boolean;
  safe: boolean;
  cast: Cast | null;
  guarding: boolean;
  dodging: boolean;
  connected: boolean;
  stunned: boolean;
  healing: boolean;
  controlRemaining: number;
};
export type Item = {
  id: string;
  name: string;
  icon: string;
  protected: boolean;
  slot?: string;
};
export type CorpseView = Vec2 & {
  id: string;
  name: string;
  victim: string;
  quota: number;
  expires: number;
  owner: string | null;
  items: Item[];
};
export type Quest = "unheard" | "accepted" | "inspected" | "complete";
export type SelfView = {
  id: string;
  resource: number;
  xp: number;
  nextLevel: number;
  marks: number;
  quest: Quest;
  inventory: Item[];
  held: Item[];
  cooldowns: Partial<Record<AbilityKey, number>>;
  channel: { name: string; start: number; end: number } | null;
  combatUntil: number;
  evadeCharges: number;
};
export type CombatEvent = {
  id: number;
  at: number;
  type: "hit" | "miss" | "cast" | "death" | "loot" | "heal" | "dodge" | "level";
  source: string;
  target: string;
  amount: number;
  key: string;
  x: number;
  z: number;
};
export type ProjectileView = Vec2 & {
  id: number;
  owner: string;
  key: string;
  dx: number;
  dz: number;
};
export type MineView = Vec2 & { id: number; owner: string; armed: boolean };
export type Snapshot = {
  protocol: number;
  build: string;
  tick: number;
  now: number;
  actors: ActorView[];
  corpses: CorpseView[];
  self: SelfView;
  events: CombatEvent[];
  population: number;
  projectiles: ProjectileView[];
  mines: MineView[];
};
export type Command =
  | { seq: number; type: "move"; x: number; z: number }
  | {
      seq: number;
      type: "ability";
      key: AbilityKey;
      target?: string;
      aim?: Vec2;
    }
  | { seq: number; type: "interact"; target: string }
  | { seq: number; type: "claim"; corpse: string; item: string }
  | { seq: number; type: "respawn" }
  | { seq: number; type: "buy" }
  | { seq: number; type: "guild"; guild: Guild }
  | { seq: number; type: "cancel" };
export type Notice = {
  kind: "info" | "error" | "dialogue";
  text: string;
  speaker?: string;
};

export const GUILDS = [
  ["knight", "Knight", "Resolve", "Guard. Interrupt. Protect.", "#dab26b"],
  ["cyborg", "Cyborg", "Heat", "Aim. Overclock. Vent.", "#7ad4dd"],
  [
    "necromancer",
    "Necromancer",
    "Essence",
    "Bind the memory of the dead.",
    "#b296d0",
  ],
  ["mage", "Mage", "Mana", "Prepare spells. Combine elements.", "#7ba8e0"],
  ["monk", "Monk", "Focus", "Read the opening. Answer precisely.", "#dea678"],
  ["priest", "Priest", "Devotion", "Keep your vow. Shelter others.", "#e9d693"],
  [
    "bard",
    "Bard",
    "Resonance",
    "Layer songs. Change the encounter.",
    "#a0c997",
  ],
  [
    "changeling",
    "Changeling",
    "Instinct",
    "Discover a form for every journey.",
    "#abc2ad",
  ],
  [
    "elemental",
    "Elemental",
    "Attunement",
    "Become fire, water, air and earth.",
    "#87c8c3",
  ],
  [
    "psion",
    "Psion",
    "Clarity",
    "Control space with focused thought.",
    "#c098df",
  ],
  [
    "symbiont",
    "Symbiont",
    "Adaptation",
    "Change together. Survive together.",
    "#a2b875",
  ],
  [
    "powered-armour",
    "Powered Armour",
    "Charge",
    "Bring weight, firepower and purpose.",
    "#ca9077",
  ],
] as const;

export type Ability = {
  key: AbilityKey;
  name: string;
  icon: number;
  cooldown: number;
  windup: number;
  range: number;
  power: number;
  cost: number;
  description: string;
};
const ability = (
  key: AbilityKey,
  name: string,
  icon: number,
  cooldown: number,
  windup: number,
  range: number,
  power: number,
  cost: number,
  description: string,
): Ability => ({
  key,
  name,
  icon,
  cooldown,
  windup,
  range,
  power,
  cost,
  description,
});
export const KITS: Record<Guild, Ability[]> = {
  knight: [
    ability(
      "basic",
      "Measured Cut",
      0,
      1.1,
      0.3,
      2.5,
      1,
      0,
      "A measured sword strike. Hold F to keep attacking.",
    ),
    ability(
      "1",
      "Sunder",
      0,
      5,
      0.45,
      2.5,
      1.4,
      15,
      "A committed overhead cut. Breaks armour for 5 seconds.",
    ),
    ability(
      "2",
      "Shield Bash",
      1,
      12,
      0.35,
      2,
      0.5,
      20,
      "Interrupt your target and stun for 0.7 seconds.",
    ),
    ability(
      "3",
      "Challenge",
      2,
      14,
      0.3,
      10,
      0,
      10,
      "Draw the attention of a creature.",
    ),
    ability(
      "4",
      "Interpose",
      3,
      16,
      0.2,
      8,
      0,
      25,
      "Guard an ally. Redirect part of their incoming damage.",
    ),
    ability(
      "5",
      "Rally",
      4,
      22,
      0.7,
      4,
      0,
      30,
      "Plant a field of restorative light for 4 seconds.",
    ),
    ability(
      "r",
      "Last Oath",
      5,
      75,
      0.6,
      0,
      0,
      60,
      "For 6 seconds, bracing also restores health.",
    ),
    ability(
      "q",
      "Brace",
      1,
      8,
      0.1,
      0,
      0,
      0,
      "Raise your shield. Reduce frontal damage for 0.8 seconds.",
    ),
    ability(
      "space",
      "Evade",
      6,
      7,
      0,
      3,
      0,
      0,
      "Evade three metres in your movement direction.",
    ),
  ],
  cyborg: [
    ability(
      "basic",
      "Pulse Tap",
      7,
      1,
      0.2,
      12,
      0.8,
      4,
      "A precise pulse shot. Adds heat.",
    ),
    ability(
      "1",
      "Pulse Lance",
      7,
      4,
      0.65,
      16,
      1.6,
      24,
      "A narrow, piercing pulse. Sidestepping avoids it.",
    ),
    ability(
      "2",
      "Mag Clamp",
      8,
      14,
      0.5,
      10,
      0.3,
      18,
      "Launch a magnetic snare. Roots for one second.",
    ),
    ability(
      "3",
      "Arc Mine",
      9,
      12,
      0.5,
      6,
      0.8,
      16,
      "Deploy a visible mine. Arms after one second.",
    ),
    ability(
      "4",
      "Coolant Burst",
      10,
      12,
      0.4,
      3,
      0,
      -45,
      "Vent 45 heat and slow nearby enemies.",
    ),
    ability(
      "5",
      "Repair Drone",
      11,
      24,
      0.6,
      0,
      0,
      20,
      "Release a small healing drone for five seconds.",
    ),
    ability(
      "r",
      "Overclock",
      12,
      75,
      0.4,
      0,
      0,
      0,
      "Faster, stronger pulse shots for six seconds. Adds heat.",
    ),
    ability(
      "q",
      "Reactive Plating",
      13,
      10,
      0.1,
      0,
      0,
      8,
      "Close ceramic shutters. Reduce damage for one second.",
    ),
    ability(
      "space",
      "Evade",
      6,
      7,
      0,
      3,
      0,
      0,
      "Evade three metres in your movement direction.",
    ),
  ],
};
for (const kit of Object.values(KITS))
  kit.push(
    ability(
      "c",
      "Break Free",
      6,
      45,
      0,
      0,
      0,
      0,
      "Remove current stun and root. Does not grant immunity.",
    ),
  );
export const distance = (a: Vec2, b: Vec2): number =>
  Math.hypot(a.x - b.x, a.z - b.z);
