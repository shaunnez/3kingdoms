import { strict as assert } from "node:assert";
import { test } from "node:test";
import { World, type Actor } from "../packages/simulation/world";
import {
  isSafe,
  move,
  walkable,
  lineOfSight,
  REFUGE,
} from "../packages/simulation/map";
import { distance } from "../packages/contracts/game";

test("a fresh traveller can complete the Briar expedition with ordinary movement and combat", () => {
  const w = new World();
  const p = w.join("expedition", "Wayfarer", "knight");
  const walk = (x: number, z: number) => {
    const until = w.now + 60;
    while (distance(p, { x, z }) > 0.4 && w.now < until) {
      assert.equal(
        p.life,
        "alive",
        "The opening expedition must be survivable",
      );
      const target = [...w.actors.values()]
        .filter(
          (a) =>
            a.kind === "wolf" && a.life === "alive" && distance(a, p) < 2.5,
        )
        .sort((a, b) => distance(a, p) - distance(b, p))[0];
      if (target) {
        command(w, p, { type: "move", x: 0, z: 0 });
        command(w, p, { type: "ability", key: "basic", target: target.id });
      } else {
        const d = distance(p, { x, z });
        command(w, p, { type: "move", x: (x - p.x) / d, z: (z - p.z) / d });
      }
      if (p.hp < p.maxHp * 0.6) command(w, p, { type: "ability", key: "5" });
      advance(w, 0.1);
    }
    assert.ok(
      distance(p, { x, z }) <= 0.4,
      `Unreachable expedition waypoint ${x},${z}`,
    );
    command(w, p, { type: "move", x: 0, z: 0 });
  };
  walk(-5, -10);
  command(w, p, { type: "interact", target: "mara" });
  assert.equal(p.quest, "accepted");
  walk(0, -3);
  walk(0, 14);
  walk(0, 26);
  walk(-4, 32);
  command(w, p, { type: "interact", target: "inscription" });
  assert.equal(p.quest, "inspected");
  walk(0, 26);
  walk(0, 14);
  walk(0, -3);
  walk(-5, -10);
  command(w, p, { type: "interact", target: "mara" });
  assert.equal(p.quest, "complete");
  assert.ok(p.inventory.some((item) => item.name === "Mara’s hourglass charm"));
  assert.ok(p.xp >= 220 || p.level > 5);
  assert.ok(p.marks >= 75);
  assert.equal(p.red, 0);
});

test("quest experience levels immediately and cannot be awarded twice", () => {
  const w = new World();
  const p = w.join("quest-level", "Scholar", "knight");
  Object.assign(p, { x: -5, z: -9, quest: "inspected", xp: 475, hp: 500 });
  command(w, p, { type: "interact", target: "mara" });
  assert.equal(p.level, 6);
  assert.equal(p.xp, 120);
  assert.equal(p.hp, p.maxHp);
  const marks = p.marks;
  command(w, p, { type: "interact", target: "mara" });
  assert.equal(p.level, 6);
  assert.equal(p.xp, 120);
  assert.equal(p.marks, marks);
});

test("a broadcast event cursor avoids replay while retaining authoritative state", () => {
  const { w, a, b } = fixture();
  command(w, a, { type: "ability", key: "basic", target: b.id });
  advance(w, 0.4);
  const first = w.snapshot(a.id);
  assert.ok(first.events.length > 0);
  const cursor = first.events.at(-1)!.id;
  const subsequent = w.snapshot(a.id, cursor);
  assert.equal(subsequent.events.length, 0);
  assert.deepEqual(subsequent.actors, first.actors);
  assert.deepEqual(subsequent.self, first.self);
  advance(w, 1.2);
  command(w, a, { type: "ability", key: "basic", target: b.id });
  advance(w, 0.4);
  const next = w.snapshot(a.id, cursor);
  assert.ok(next.events.length > 0);
  assert.ok(next.events.every((event) => event.id > cursor));
});

const advance = (w: World, seconds: number) => {
  for (let i = 0; i < Math.ceil(seconds / 0.05); i++) w.step(0.05);
};
function fixture() {
  const w = new World();
  for (const p of w.actors.values())
    if (p.kind === "wolf" || p.kind === "guard") p.active = false;
  const a = w.join("a", "Attacker", "knight"),
    b = w.join("b", "Defender", "knight");
  Object.assign(a, { x: 0, z: 40 });
  Object.assign(b, { x: 0, z: 42 });
  return { w, a, b };
}
function command(w: World, p: Actor, body: Record<string, unknown>) {
  return w.command(p.id, { seq: p.lastSeq + 1, ...body });
}
function lethal(w: World, a: Actor, b: Actor) {
  b.hp = 1;
  b.downedLock = w.now + 100;
  command(w, a, { type: "ability", key: "basic", target: b.id });
  advance(w, 0.4);
  assert.equal(b.life, "dead");
}

test("both directions of player damage are refused if either player is safe", () => {
  const { w, a, b } = fixture();
  a.z = 0;
  b.z = 2;
  assert.equal(
    command(w, a, { type: "ability", key: "basic", target: b.id }),
    false,
  );
  assert.equal(
    command(w, b, { type: "ability", key: "basic", target: a.id }),
    false,
  );
  assert.equal(a.red, 0);
  assert.equal(b.red, 0);
  assert.equal(a.hp, a.maxHp);
  assert.equal(b.hp, b.maxHp);
});
test("a cast cannot land player damage after its target crosses the safe boundary", () => {
  const { w, a, b } = fixture();
  a.z = 1;
  b.z = 2;
  assert.ok(command(w, a, { type: "ability", key: "basic", target: b.id }));
  b.z = -0.1;
  advance(w, 0.5);
  assert.equal(b.hp, b.maxHp);
  assert.ok(a.red > 599);
});
test("an unlawful attempted attack turns its owner red even when the victim evades", () => {
  const { w, a, b } = fixture();
  command(w, a, { type: "ability", key: "basic", target: b.id });
  b.evadeUntil = w.now + 1;
  advance(w, 0.4);
  assert.equal(b.hp, b.maxHp);
  assert.ok(a.red > 599);
  assert.equal(b.red, 0);
});
test("self defence does not flag the defender or clear the aggressor", () => {
  const { w, a, b } = fixture();
  command(w, a, { type: "ability", key: "basic", target: b.id });
  advance(w, 0.4);
  command(w, b, { type: "ability", key: "basic", target: a.id });
  advance(w, 0.4);
  assert.ok(a.red > 598);
  assert.equal(b.red, 0);
  assert.ok(a.hp < a.maxHp);
});
test("an unlawful kill exposes exactly one item allowance and protects starter gear", () => {
  const { w, a, b } = fixture();
  lethal(w, a, b);
  const c = [...w.corpses.values()][0];
  assert.equal(c.quota, 1);
  assert.equal(c.owner, a.id);
  assert.ok(c.items.every((i) => !i.protected));
  assert.ok(b.inventory.every((i) => i.protected));
  assert.ok(a.killer && a.red > 3599);
});
test("killing a red player exposes two items and remains lawful for the hunter", () => {
  const { w, a, b } = fixture();
  b.red = 600;
  lethal(w, a, b);
  assert.equal([...w.corpses.values()][0].quota, 2);
  assert.equal(a.red, 0);
});
test("a downed body has no corpse; final death creates the claim", () => {
  const { w, a, b } = fixture();
  b.hp = 1;
  command(w, a, { type: "ability", key: "basic", target: b.id });
  advance(w, 0.4);
  assert.equal(b.life, "downed");
  assert.equal(w.corpses.size, 0);
  advance(w, 10);
  assert.equal(b.life, "dead");
  assert.equal(w.corpses.size, 1);
});
test("replayed claims cannot exceed the global quota or duplicate an item", () => {
  const { w, a, b } = fixture();
  lethal(w, a, b);
  const c = [...w.corpses.values()][0],
    items = [...c.items];
  const request = {
    seq: a.lastSeq + 1,
    type: "claim",
    corpse: c.id,
    item: items[0].id,
  };
  assert.ok(w.command(a.id, request));
  assert.equal(w.command(a.id, request), false);
  advance(w, 3.1);
  assert.equal(w.corpses.size, 0);
  assert.equal(a.inventory.filter((i) => i.id === items[0].id).length, 1);
  assert.equal(b.inventory.filter((i) => i.id === items[0].id).length, 0);
  assert.ok(
    items.slice(1).every((i) => b.inventory.some((x) => x.id === i.id)),
  );
  assert.equal(w.receipts.size, 1);
});
test("moving cancels a corpse channel without losing property", () => {
  const { w, a, b } = fixture();
  lethal(w, a, b);
  const c = [...w.corpses.values()][0],
    item = c.items[0];
  command(w, a, { type: "claim", corpse: c.id, item: item.id });
  command(w, a, { type: "move", x: 1, z: 0 });
  advance(w, 4);
  assert.ok(c.items.some((i) => i.id === item.id));
  assert.equal(
    a.inventory.some((i) => i.id === item.id),
    false,
  );
  assert.equal(c.quota, 1);
});
test("expiry releases every unclaimed item, including when the claimant disconnects", () => {
  const { w, a, b } = fixture();
  const owned = b.inventory.map((i) => i.id);
  lethal(w, a, b);
  w.disconnect(a.id);
  advance(w, 121);
  assert.equal(w.corpses.size, 0);
  assert.deepEqual(b.inventory.map((i) => i.id).sort(), owned.sort());
});
test("full bags refuse a claim without destroying or consuming its quota", () => {
  const { w, a, b } = fixture();
  lethal(w, a, b);
  const c = [...w.corpses.values()][0];
  while (a.inventory.length < 40)
    a.inventory.push({
      id: `f${a.inventory.length}`,
      name: "Filler",
      icon: "ring",
      protected: false,
    });
  assert.equal(
    command(w, a, { type: "claim", corpse: c.id, item: c.items[0].id }),
    false,
  );
  assert.equal(c.quota, 1);
  assert.equal(w.receipts.size, 0);
});
test("offline time and restart preserve red status and ownership escrow", () => {
  const { w, a, b } = fixture();
  lethal(w, a, b);
  const red = a.red;
  w.disconnect(a.id);
  advance(w, 70);
  assert.equal(a.red, red);
  const restored = new World(JSON.parse(JSON.stringify(w.save())));
  restored.join(a.id, a.name, a.guild);
  assert.equal(restored.actors.get(a.id)?.red, red);
  assert.equal(restored.corpses.size, 1);
  advance(restored, 1);
  assert.ok(restored.actors.get(a.id)!.red < red);
});
test("dead outlaws respawn in an unpatrolled safe refuge without clearing their timer", () => {
  const { w, a, b } = fixture();
  b.red = 600;
  lethal(w, a, b);
  const time = b.red;
  command(w, b, { type: "respawn" });
  assert.equal(b.life, "alive");
  assert.equal(b.x, REFUGE.x);
  assert.ok(isSafe(b));
  assert.equal(b.red, time);
});
test("merchant refusal is checked at purchase time, even after a clean conversation", () => {
  const { w, a } = fixture();
  Object.assign(a, { x: 7, z: -14 });
  command(w, a, { type: "interact", target: "merchant" });
  a.red = 50;
  const money = a.marks,
    count = a.inventory.length;
  assert.equal(command(w, a, { type: "buy" }), false);
  assert.equal(a.marks, money);
  assert.equal(a.inventory.length, count);
});
test("the quest reward can be collected once, including after save and reconnect", () => {
  const { w, a } = fixture();
  Object.assign(a, { x: -5, z: -9 });
  command(w, a, { type: "interact", target: "mara" });
  assert.equal(a.quest, "accepted");
  Object.assign(a, { x: -4, z: 34 });
  command(w, a, { type: "interact", target: "inscription" });
  assert.equal(a.quest, "inspected");
  Object.assign(a, { x: -5, z: -9 });
  command(w, a, { type: "interact", target: "mara" });
  const marks = a.marks,
    xp = a.xp;
  command(w, a, { type: "interact", target: "mara" });
  assert.equal(a.marks, marks);
  assert.equal(a.xp, xp);
  assert.equal(
    a.inventory.filter((i) => i.name === "Mara’s hourglass charm").length,
    1,
  );
});
test("malformed and forged movement inputs cannot move a player or change safety", () => {
  const { w, a } = fixture();
  const origin = { x: a.x, z: a.z };
  assert.equal(
    command(w, a, { type: "move", x: NaN, z: 0, safe: true }),
    false,
  );
  advance(w, 0.1);
  assert.equal(a.x, origin.x);
  assert.equal(a.z, origin.z);
  command(w, a, { type: "move", x: 100000, z: 100000, safe: true });
  advance(w, 0.1);
  assert.ok(distanceFrom(origin, a) <= 0.451);
  assert.equal(isSafe(a), false);
});
const distanceFrom = (
  a: { x: number; z: number },
  b: { x: number; z: number },
) => Math.hypot(a.x - b.x, a.z - b.z);
test("movement cannot tunnel through walls or leave the authored world", () => {
  const p = move({ x: 0, z: -23 }, 100, 0);
  assert.ok(p.x <= 10.11);
  assert.ok(p.x >= 0);
  assert.ok(move({ x: 0, z: 59 }, 0, 100).z < 60);
});
test("the revised house facades block entry while the outer town lanes remain open", () => {
  for (const facade of [
    { x: -10, z: -24 },
    { x: 10, z: -25 },
    { x: -10, z: -9 },
    { x: 10.2, z: -9 },
  ]) {
    assert.equal(walkable(facade), false);
    assert.equal(
      lineOfSight(
        { x: 0, z: facade.z },
        { x: Math.sign(facade.x) * 18, z: facade.z },
      ),
      false,
    );
    const stopped = move({ x: 0, z: facade.z }, facade.x, 0);
    assert.ok(Math.abs(stopped.x) < Math.abs(facade.x));
  }
  for (const lane of [
    { x: -18, z: -24 },
    { x: 18, z: -25 },
    { x: -18, z: -9 },
    { x: 18, z: -9 },
  ])
    assert.equal(walkable(lane), true);
});
test("solid landmarks block entry without closing the gate or the paths around the astrolabe", () => {
  for (const x of [-5.6, 5.6]) {
    assert.equal(walkable({ x, z: 5 }), false);
    assert.ok(move({ x, z: 0 }, 0, 8).z < 2.8);
    assert.equal(lineOfSight({ x, z: 0 }, { x, z: 10 }), false);
  }
  assert.ok(Math.abs(move({ x: 0, z: 0 }, 0, 10).z - 10) < 1e-10);
  assert.equal(lineOfSight({ x: 0, z: 0 }, { x: 0, z: 10 }), true);
  assert.equal(walkable({ x: -5, z: -28 }), false);
  assert.ok(move({ x: -5, z: -34 }, 0, 12).z <= -30.5);
  assert.equal(lineOfSight({ x: 0, z: -28 }, { x: -9, z: -28 }), false);
  for (const point of [
    { x: -2.4, z: -28 },
    { x: -7.6, z: -28 },
    { x: -3, z: -26 },
    { x: -7, z: -30 },
  ])
    assert.equal(walkable(point), true);
});
test("guards attack a visible outlaw in town but ignore clean bystanders", () => {
  const { w, a, b } = fixture();
  const guard = w.actors.get("guard")!;
  guard.active = true;
  Object.assign(a, { x: -3, z: -1, red: 600 });
  Object.assign(b, { x: -2, z: -2 });
  advance(w, 2.8);
  assert.ok(a.hp < a.maxHp);
  assert.equal(b.hp, b.maxHp);
  assert.ok(isSafe(a));
});

test("evade has two charges, recharges one at a time, and respects roots", () => {
  const { w, a } = fixture();
  assert.ok(command(w, a, { type: "ability", key: "space" }));
  assert.equal(w.snapshot(a.id).self.evadeCharges, 1);
  assert.ok(command(w, a, { type: "ability", key: "space" }));
  assert.equal(w.snapshot(a.id).self.evadeCharges, 0);
  assert.equal(command(w, a, { type: "ability", key: "space" }), false);
  advance(w, 7.05);
  assert.equal(w.snapshot(a.id).self.evadeCharges, 1);
  a.rootUntil = w.now + 2;
  assert.equal(command(w, a, { type: "ability", key: "space" }), false);
  advance(w, 7.05);
  assert.equal(w.snapshot(a.id).self.evadeCharges, 2);
});
test("break free removes crowd control during a stun and cannot be repeated for 45 seconds", () => {
  const { w, a } = fixture();
  a.stunUntil = a.rootUntil = w.now + 5;
  assert.ok(command(w, a, { type: "ability", key: "c" }));
  assert.equal(
    w.snapshot(a.id).actors.find((p) => p.id === a.id)!.controlRemaining,
    0,
  );
  a.stunUntil = w.now + 2;
  assert.equal(command(w, a, { type: "ability", key: "c" }), false);
  advance(w, 45.05);
  assert.ok(command(w, a, { type: "ability", key: "c" }));
});
test("cancelling during windup keeps the resource and cooldown, but keeps unlawful aggression", () => {
  const { w, a, b } = fixture();
  const resource = a.resource;
  assert.ok(command(w, a, { type: "ability", key: "1", target: b.id }));
  assert.equal(a.resource, resource);
  command(w, a, { type: "cancel" });
  advance(w, 0.6);
  assert.equal(a.resource, resource);
  assert.equal(a.cooldowns["1"], undefined);
  assert.equal(b.hp, b.maxHp);
  assert.ok(a.red > 599);
  assert.ok(command(w, a, { type: "ability", key: "1", target: b.id }));
  advance(w, 0.5);
  assert.equal(a.resource, resource - 15);
  assert.ok(a.cooldowns["1"]! > w.now);
});
test("a travelling pulse can be dodged sideways after it is committed", () => {
  const { w, a, b } = fixture();
  a.guild = "cyborg";
  a.resource = 0;
  b.z = 50;
  assert.ok(command(w, a, { type: "ability", key: "basic", target: b.id }));
  advance(w, 0.3);
  assert.ok(w.snapshot(a.id).projectiles.length > 0);
  b.x = 3;
  advance(w, 0.8);
  assert.equal(b.hp, b.maxHp);
  assert.equal(w.snapshot(a.id).projectiles.length, 0);
});
test("an in-flight pulse cannot damage a player who reaches sanctuary", () => {
  const { w, a, b } = fixture();
  a.guild = "cyborg";
  a.resource = 0;
  a.z = 10;
  b.z = 1;
  assert.ok(command(w, a, { type: "ability", key: "basic", target: b.id }));
  advance(w, 0.3);
  b.z = -0.1;
  advance(w, 0.8);
  assert.equal(b.hp, b.maxHp);
});
test("competing loot requests are exclusive to the owning claimant", () => {
  const { w, a, b } = fixture();
  lethal(w, a, b);
  const c = [...w.corpses.values()][0];
  const thief = w.join("thief", "Thief", "knight");
  Object.assign(thief, { x: 0, z: 42 });
  const item = c.items[0];
  assert.ok(command(w, a, { type: "claim", corpse: c.id, item: item.id }));
  assert.equal(
    command(w, thief, { type: "claim", corpse: c.id, item: item.id }),
    false,
  );
  advance(w, 3.1);
  assert.equal(a.inventory.filter((i) => i.id === item.id).length, 1);
  assert.equal(thief.inventory.filter((i) => i.id === item.id).length, 0);
});

test("a downed traveller can crawl and another player can revive them once", () => {
  const { w, a, b } = fixture();
  b.hp = 1;
  command(w, a, { type: "ability", key: "basic", target: b.id });
  advance(w, 0.4);
  const helper = w.join("helper", "Helper", "knight");
  Object.assign(helper, { x: 1, z: 42 });
  const start = b.z;
  command(w, b, { type: "move", x: 0, z: 1 });
  advance(w, 0.2);
  assert.ok(b.z > start && b.z - start <= 0.17);
  assert.equal(command(w, b, { type: "ability", key: "space" }), false);
  command(w, helper, { type: "interact", target: b.id });
  advance(w, 4.1);
  assert.equal(b.life, "alive");
  assert.equal(b.hp, Math.round(b.maxHp * 0.35));
  assert.equal(w.corpses.size, 0);
  b.hp = 1;
  command(w, a, { type: "ability", key: "basic", target: b.id });
  advance(w, 0.4);
  assert.equal(b.life, "dead");
});
test("moving during a revive interrupts it; helping an outlaw in combat flags the helper", () => {
  const { w, a, b } = fixture();
  b.hp = 1;
  b.red = 600;
  command(w, a, { type: "ability", key: "basic", target: b.id });
  advance(w, 0.4);
  const helper = w.join("helper", "Helper", "knight");
  Object.assign(helper, { x: 1, z: 42 });
  command(w, helper, { type: "interact", target: b.id });
  assert.ok(helper.red > 599);
  command(w, helper, { type: "move", x: 1, z: 0 });
  advance(w, 4.1);
  assert.equal(b.life, "downed");
  assert.equal(helper.channel, null);
});
