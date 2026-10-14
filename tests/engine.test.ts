import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { World } from "../packages/simulation/world";
import { KITS, type Guild } from "../packages/contracts/game";
import { GUILD_COMBAT } from "../packages/simulation/data/guilds";
import { CREATURES } from "../packages/simulation/data/creatures";
import { STATUSES, apply, until } from "../packages/simulation/engine/statuses";
import type { StatusId } from "../packages/simulation/engine/types";

const catalogue = JSON.parse(
  readFileSync(
    new URL("../design/content-catalogue.json", import.meta.url),
    "utf8",
  ),
) as { abilities: { id: string; guild: string }[] };

test("status reads and writes use the same actor fields", () => {
  const p = new World().join("p", "P", "knight");
  for (const [i, id] of (Object.keys(STATUSES) as StatusId[]).entries()) {
    apply(p, id, 100 + i);
    assert.equal(until(p, id), 100 + i, id);
    assert.equal(p[STATUSES[id].field], 100 + i, id);
  }
});

test("every kit action has engine behaviour under its catalogue id", () => {
  for (const guild of Object.keys(KITS) as Guild[]) {
    const combat = GUILD_COMBAT[guild];
    assert.equal(combat.guild, guild);
    for (const a of KITS[guild]) {
      const def = combat.abilities[a.key];
      assert.ok(def, `${guild} ${a.key} has no behaviour`);
      assert.equal(def.key, a.key);
      if (def.id.startsWith("ability.shared.")) continue;
      const entry = catalogue.abilities.find((c) => c.id === def.id);
      assert.ok(entry, `${def.id} is not in the catalogue`);
      assert.equal(entry.guild, guild);
    }
    assert.deepEqual(
      Object.keys(combat.abilities).sort(),
      KITS[guild].map((a) => a.key).sort(),
      `${guild} behaviour without a kit entry`,
    );
  }
});

test("creatures that fight have attack, chase and leash rules", () => {
  for (const [kind, def] of Object.entries(CREATURES)) {
    assert.equal(def.kind, kind);
    assert.ok(def.attack.windup > 0 && def.attack.cooldown > 0);
    assert.ok(def.attack.reach >= def.attack.engage);
    assert.ok(def.leash > def.sight);
  }
});

test("interpose keeps its share if the knight changes guild before a hit", () => {
  const w = new World();
  for (const p of w.actors.values()) if (p.kind !== "player") p.active = false;
  const send = (id: string, body: Record<string, unknown>) =>
    w.command(id, { seq: w.actors.get(id)!.lastSeq + 1, ...body });
  const run = (seconds: number) => {
    for (let t = 0; t < seconds; t += 0.05) w.step(0.05);
  };
  const knight = w.join("k", "Knight", "knight"),
    ally = w.join("a", "Ally", "knight"),
    foe = w.join("f", "Foe", "knight");
  Object.assign(knight, { x: 0, z: -2 });
  Object.assign(ally, { x: 1, z: -2 });
  Object.assign(foe, { x: 1, z: 44 });
  assert.ok(send("k", { type: "ability", key: "4", target: "a" }));
  run(0.3);
  assert.ok(ally.interpose, "Interpose did not land");
  assert.ok(send("k", { type: "guild", guild: "cyborg" }));
  Object.assign(knight, { x: 0, z: 42 });
  Object.assign(ally, { x: 1, z: 42 });
  assert.ok(send("f", { type: "ability", key: "basic", target: "a" }));
  run(0.4);
  const redirected = w.events.find(
    (e) => e.type === "hit" && e.source === "f" && e.target === "k",
  );
  const struck = w.events.find(
    (e) => e.type === "hit" && e.source === "f" && e.target === "a",
  );
  // A 64-power cut: 30% (19.2) goes to the guard, the ally takes the rest.
  assert.equal(redirected?.amount, 19, "The redirect share was lost");
  assert.equal(struck?.amount, 45);
});
