import { strict as assert } from "node:assert";
import { readFileSync, writeFileSync } from "node:fs";
import { test } from "node:test";
import { World, type Actor } from "../packages/simulation/world";
import type { Guild } from "../packages/contracts/game";

// Golden combat traces. Each scripted fight records every event and the
// combat state of its actors; the engine must reproduce them exactly.
// Regenerate deliberately with UPDATE_PARITY=1 after an intended rule change.
const GOLDEN = new URL("./fixtures/combat-parity.json", import.meta.url);
const STEP = 0.05;

type Order = { at: number; who: string; cmd: Record<string, unknown> };
type Scenario = {
  name: string;
  /** Players to join: id → guild and position. */
  players: Record<string, { guild: Guild; x: number; z: number }>;
  /** NPC ids left active (all others are deactivated). */
  npcs?: string[];
  setup?: (w: World, actors: Record<string, Actor>) => void;
  orders: Order[];
  seconds: number;
};

const ability = (
  key: string,
  target?: string,
  aim?: { x: number; z: number },
) => ({
  type: "ability",
  key,
  ...(target ? { target } : {}),
  ...(aim ? { aim } : {}),
});
const go = (x: number, z: number) => ({ type: "move", x, z });

const SCENARIOS: Scenario[] = [
  {
    name: "knight basics, Resolve gain and cooldowns",
    players: {
      a: { guild: "knight", x: 0, z: 40 },
      b: { guild: "knight", x: 0, z: 42 },
    },
    orders: [0, 1.2, 2.4, 3.6].map((at) => ({
      at,
      who: "a",
      cmd: ability("basic", "b"),
    })),
    seconds: 5,
  },
  {
    name: "knight sunder amplifies the next cut",
    players: {
      a: { guild: "knight", x: 0, z: 40 },
      b: { guild: "cyborg", x: 0, z: 42 },
    },
    orders: [
      { at: 0, who: "a", cmd: ability("1", "b") },
      { at: 0.6, who: "a", cmd: ability("basic", "b") },
      { at: 6, who: "a", cmd: ability("basic", "b") },
    ],
    seconds: 7,
  },
  {
    name: "shield bash interrupts and stuns; a dodging target is not stunned",
    players: {
      a: { guild: "knight", x: 0, z: 40 },
      b: { guild: "cyborg", x: 0, z: 42 },
      c: { guild: "knight", x: 4, z: 40 },
      d: { guild: "knight", x: 4, z: 42 },
    },
    orders: [
      { at: 0, who: "b", cmd: ability("1", "a") },
      { at: 0.05, who: "a", cmd: ability("2", "b") },
      { at: 0.1, who: "c", cmd: ability("2", "d") },
      { at: 0.3, who: "d", cmd: ability("space") },
      { at: 0.6, who: "b", cmd: ability("basic", "a") },
    ],
    seconds: 2,
  },
  {
    name: "challenge pulls a hound and weakens a challenged attacker",
    players: {
      a: { guild: "knight", x: 1, z: 15 },
      b: { guild: "cyborg", x: 4, z: 13 },
    },
    npcs: ["wolf-1"],
    orders: [
      { at: 0, who: "a", cmd: ability("3", "wolf-1") },
      { at: 0.5, who: "a", cmd: ability("basic", "wolf-1") },
    ],
    seconds: 6,
  },
  {
    name: "interpose redirects part of an ally's damage until it runs out",
    players: {
      a: { guild: "knight", x: 0, z: 40 },
      b: { guild: "knight", x: 1, z: 40 },
      c: { guild: "knight", x: 0, z: 42 },
    },
    orders: [
      { at: 0, who: "a", cmd: ability("4", "b") },
      { at: 0.3, who: "c", cmd: ability("1", "b") },
      { at: 1, who: "c", cmd: ability("basic", "b") },
      { at: 2.2, who: "c", cmd: ability("basic", "b") },
      { at: 3.4, who: "c", cmd: ability("basic", "b") },
    ],
    seconds: 4.5,
  },
  {
    name: "rally heals in combat until damage ends it",
    players: {
      a: { guild: "knight", x: 0, z: 40 },
      b: { guild: "knight", x: 0, z: 42 },
    },
    setup: (_w, p) => {
      p.a.hp = 300;
    },
    orders: [
      { at: 0, who: "b", cmd: ability("basic", "a") },
      { at: 0.5, who: "a", cmd: ability("5") },
      { at: 3, who: "b", cmd: ability("basic", "a") },
    ],
    seconds: 6,
  },
  {
    name: "last oath turns a frontal brace into healing",
    players: {
      a: { guild: "knight", x: 0, z: 40 },
      b: { guild: "knight", x: 0, z: 42 },
    },
    setup: (_w, p) => {
      p.a.heading = 0;
      p.a.hp = 500;
    },
    orders: [
      { at: 0, who: "a", cmd: ability("r") },
      { at: 0.7, who: "a", cmd: ability("q") },
      { at: 0.75, who: "b", cmd: ability("basic", "a") },
      { at: 2, who: "a", cmd: ability("q") },
      { at: 2.05, who: "b", cmd: ability("1", "a") },
    ],
    seconds: 3,
  },
  {
    name: "resolve limits, rejected orders and regeneration out of combat",
    players: {
      a: { guild: "knight", x: 0, z: 40 },
      b: { guild: "knight", x: 0, z: 42 },
    },
    setup: (_w, p) => {
      p.a.resource = 12;
    },
    orders: [
      { at: 0, who: "a", cmd: ability("1", "b") },
      { at: 0.1, who: "a", cmd: ability("basic", "nobody") },
      { at: 0.2, who: "a", cmd: ability("4", "a") },
      { at: 0.3, who: "a", cmd: ability("basic", "b") },
      { at: 0.4, who: "a", cmd: ability("basic", "b") },
    ],
    seconds: 25,
  },
  {
    name: "pulse taps travel; overclock speeds and strengthens them until heat peaks",
    players: {
      a: { guild: "cyborg", x: 0, z: 40 },
      b: { guild: "knight", x: 0, z: 48 },
    },
    orders: [
      { at: 0, who: "a", cmd: ability("basic", "b") },
      { at: 1.0, who: "a", cmd: ability("r") },
      ...[1.5, 2.3, 3.1, 3.9, 4.7, 5.5, 6.3].map((at) => ({
        at,
        who: "a",
        cmd: ability("basic", "b"),
      })),
    ],
    seconds: 12,
  },
  {
    name: "pulse lance pierces a line with falloff and misses an empty lane",
    players: {
      a: { guild: "cyborg", x: 0, z: 36 },
      b: { guild: "knight", x: 0, z: 40 },
      c: { guild: "knight", x: 0.3, z: 44 },
      d: { guild: "knight", x: 3, z: 42 },
    },
    orders: [
      { at: 0, who: "a", cmd: ability("1", "b") },
      { at: 5, who: "a", cmd: ability("1", undefined, { x: -6, z: 36 }) },
    ],
    seconds: 6,
  },
  {
    name: "mag clamp roots on contact and can be sidestepped",
    players: {
      a: { guild: "cyborg", x: 0, z: 36 },
      b: { guild: "knight", x: 0, z: 44 },
      c: { guild: "cyborg", x: 6, z: 36 },
      d: { guild: "knight", x: 6, z: 46 },
    },
    orders: [
      { at: 0, who: "a", cmd: ability("2", "b") },
      { at: 0, who: "c", cmd: ability("2", "d") },
      { at: 0.55, who: "d", cmd: go(1, 0) },
      { at: 0.75, who: "d", cmd: go(1, 0) },
      { at: 0.95, who: "d", cmd: go(1, 0) },
      { at: 1.2, who: "b", cmd: go(1, 0) },
      { at: 1.4, who: "b", cmd: go(1, 0) },
      { at: 2.2, who: "b", cmd: go(1, 0) },
      { at: 2.4, who: "b", cmd: go(1, 0) },
    ],
    seconds: 3,
  },
  {
    name: "arc mines arm, trigger once, slow, and replace the owner's older mine",
    players: {
      a: { guild: "cyborg", x: 0, z: 36 },
      b: { guild: "knight", x: 0, z: 44 },
    },
    orders: [
      { at: 0, who: "a", cmd: ability("3", undefined, { x: 0, z: 50 }) },
      { at: 0.6, who: "b", cmd: go(0, -1) },
      { at: 2, who: "a", cmd: ability("3", undefined, { x: 3, z: 40 }) },
      { at: 15, who: "a", cmd: ability("3", undefined, { x: 0, z: 39 }) },
      { at: 16.2, who: "b", cmd: go(0, -1) },
      { at: 16.4, who: "b", cmd: go(0, -1) },
      { at: 16.6, who: "b", cmd: go(0, -1) },
      { at: 16.8, who: "b", cmd: go(0, -1) },
    ],
    seconds: 20,
  },
  {
    name: "coolant burst vents heat and slows nearby enemies",
    players: {
      a: { guild: "cyborg", x: 0, z: 40 },
      b: { guild: "knight", x: 0, z: 42 },
      c: { guild: "knight", x: 0, z: 46 },
    },
    setup: (_w, p) => {
      p.a.resource = 80;
    },
    orders: [
      { at: 0, who: "a", cmd: ability("4") },
      { at: 1, who: "b", cmd: go(0, 1) },
      { at: 1.2, who: "b", cmd: go(0, 1) },
    ],
    seconds: 3,
  },
  {
    name: "reactive plating blocks from any side; the drone heals",
    players: {
      a: { guild: "cyborg", x: 0, z: 40 },
      b: { guild: "knight", x: 0, z: 42 },
    },
    setup: (_w, p) => {
      p.a.heading = Math.PI;
      p.a.hp = 400;
    },
    orders: [
      { at: 0, who: "a", cmd: ability("q") },
      { at: 0.1, who: "b", cmd: ability("basic", "a") },
      { at: 1.5, who: "a", cmd: ability("5") },
      { at: 4, who: "b", cmd: ability("basic", "a") },
    ],
    seconds: 8,
  },
  {
    name: "heat limit refuses costly orders",
    players: {
      a: { guild: "cyborg", x: 0, z: 40 },
      b: { guild: "knight", x: 0, z: 42 },
    },
    setup: (_w, p) => {
      p.a.resource = 90;
    },
    orders: [
      { at: 0, who: "a", cmd: ability("1", "b") },
      { at: 0.1, who: "a", cmd: ability("basic", "b") },
      { at: 0.5, who: "a", cmd: ability("4") },
      { at: 1.2, who: "a", cmd: ability("1", "b") },
    ],
    seconds: 3,
  },
  {
    name: "evade charges, roots and break free",
    players: {
      a: { guild: "knight", x: 0, z: 40 },
      b: { guild: "cyborg", x: 0, z: 46 },
    },
    orders: [
      { at: 0, who: "a", cmd: ability("space") },
      { at: 0.1, who: "a", cmd: ability("space") },
      { at: 0.2, who: "a", cmd: ability("space") },
      { at: 1, who: "b", cmd: ability("2", "a") },
      { at: 2, who: "a", cmd: ability("space") },
      { at: 2.1, who: "a", cmd: ability("c") },
      { at: 2.2, who: "a", cmd: ability("c") },
      { at: 8, who: "a", cmd: ability("space") },
    ],
    seconds: 16,
  },
  {
    name: "a hound chases, bites, dies, rewards and respawns",
    players: {
      a: { guild: "knight", x: 1, z: 17 },
    },
    npcs: ["wolf-1"],
    setup: (_w, p) => {
      p.a.level = 9;
    },
    orders: [0.5, 1.7, 2.9, 4.1, 5.3, 6.5, 7.7, 8.9, 10.1, 11.3].map((at) => ({
      at,
      who: "a",
      cmd: ability("basic", "wolf-1"),
    })),
    seconds: 50,
  },
  {
    name: "the watch strikes a red player in town",
    players: {
      a: { guild: "knight", x: -3, z: -6 },
    },
    npcs: ["guard"],
    setup: (_w, p) => {
      p.a.red = 300;
    },
    orders: [],
    seconds: 4,
  },
  {
    name: "a cast and a pulse cannot land after their target reaches safety",
    players: {
      a: { guild: "knight", x: 0, z: 1.5 },
      b: { guild: "knight", x: 0, z: 0.4 },
      c: { guild: "cyborg", x: 4, z: 9 },
      d: { guild: "knight", x: 4, z: 1.6 },
    },
    orders: [
      { at: 0, who: "a", cmd: ability("1", "b") },
      { at: 0.05, who: "b", cmd: go(0, -1) },
      { at: 0, who: "c", cmd: ability("basic", "d") },
      { at: 0.1, who: "d", cmd: go(0, -1) },
      { at: 0.3, who: "d", cmd: go(0, -1) },
    ],
    seconds: 2,
  },
  {
    name: "lethal damage downs, then kills, an outlaw and opens two claims",
    players: {
      a: { guild: "knight", x: 0, z: 40 },
      b: { guild: "cyborg", x: 0, z: 42 },
    },
    setup: (_w, p) => {
      p.b.red = 500;
      p.b.hp = 60;
    },
    orders: [
      { at: 0, who: "a", cmd: ability("1", "b") },
      { at: 1, who: "a", cmd: ability("basic", "b") },
    ],
    seconds: 13,
  },
];

const round = (v: number) => Math.round(v * 1e6) / 1e6;
function pick(p: Actor) {
  return [
    p.id,
    round(p.x),
    round(p.z),
    round(p.heading),
    round(p.hp),
    p.maxHp,
    p.life,
    p.level,
    round(p.xp),
    p.marks,
    round(p.red),
    p.killer,
    p.safe,
    round(p.resource),
    Object.entries(p.cooldowns)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, round(v ?? 0)]),
    p.cast && [p.cast.key, round(p.cast.end), p.cast.target],
    p.channel && [p.channel.kind, round(p.channel.end)],
    [
      p.braceUntil,
      p.stunUntil,
      p.rootUntil,
      p.slowUntil,
      p.oathUntil,
      p.overclockUntil,
      p.sunderUntil,
      p.healUntil,
      p.healTick,
      p.evadeUntil,
      p.combatUntil,
      p.downedUntil,
      p.respawnAt,
    ].map(round),
    p.evadeCharges,
    p.challenge && [p.challenge.owner, round(p.challenge.until)],
    p.interpose && [
      p.interpose.owner,
      round(p.interpose.until),
      round(p.interpose.remaining),
    ],
    p.target,
    p.returning,
    [p.guarding, p.dodging, p.stunned, p.healing],
    Object.entries(p.retaliation)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, round(v)]),
  ];
}

function run(s: Scenario) {
  const w = new World();
  const keep = new Set(s.npcs ?? []);
  for (const p of w.actors.values()) if (!keep.has(p.id)) p.active = false;
  const actors: Record<string, Actor> = {};
  for (const [id, spec] of Object.entries(s.players)) {
    const p = w.join(id, id.toUpperCase(), spec.guild);
    Object.assign(p, { x: spec.x, z: spec.z });
    actors[id] = p;
  }
  for (const id of keep) actors[id] = w.actors.get(id)!;
  s.setup?.(w, actors);
  const ids = Object.keys(actors).sort();
  const trace: unknown[] = [];
  const pending = [...s.orders].sort((a, b) => a.at - b.at);
  let seen = 0;
  const steps = Math.round(s.seconds / STEP);
  for (let i = 0; i <= steps; i++) {
    const t = i * STEP + 1e-9;
    while (pending.length && pending[0].at <= t) {
      const o = pending.shift()!;
      const p = actors[o.who];
      const ok = w.command(p.id, { seq: p.lastSeq + 1, ...o.cmd });
      trace.push(["order", i, o.who, o.cmd.type, o.cmd.key ?? null, ok]);
    }
    if (i === steps) break;
    w.step(STEP);
    for (const e of w.events.filter((e) => e.id > seen))
      trace.push([
        "event",
        i,
        e.id,
        e.type,
        e.source,
        e.target,
        e.key,
        e.amount,
        Boolean(e.blocked),
        e.aim ? [round(e.aim.x), round(e.aim.z)] : null,
      ]);
    seen = Math.max(seen, w.events.at(-1)?.id ?? 0);
    if (i % 5 === 4) {
      trace.push(["state", i, ids.map((id) => pick(actors[id]))]);
      trace.push([
        "objects",
        i,
        w.projectiles.map((p) => [
          p.id,
          p.owner,
          p.key,
          round(p.x),
          round(p.z),
          round(p.damage),
        ]),
        w.mines.map((m) => [
          m.id,
          m.owner,
          round(m.x),
          round(m.z),
          round(m.arm),
          round(m.expires),
        ]),
        [...w.corpses.values()].map((c) => [
          c.id,
          c.victim,
          c.quota,
          c.owner,
          c.items.length,
        ]),
      ]);
    }
  }
  trace.push([
    "notices",
    w.notices.map((n) => [n.id, n.notice.kind, n.notice.text]),
  ]);
  trace.push(["final", ids.map((id) => pick(actors[id]))]);
  return trace;
}

const traces = Object.fromEntries(SCENARIOS.map((s) => [s.name, run(s)]));
if (process.env.UPDATE_PARITY)
  writeFileSync(GOLDEN, JSON.stringify(traces) + "\n");
const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as Record<
  string,
  unknown
>;

for (const s of SCENARIOS)
  test(`combat parity: ${s.name}`, () => {
    assert.ok(golden[s.name], "Missing golden trace; run with UPDATE_PARITY=1");
    assert.deepEqual(traces[s.name], golden[s.name]);
  });

test("combat parity covers every scripted fight in the golden file", () => {
  assert.deepEqual(Object.keys(golden).sort(), Object.keys(traces).sort());
});
