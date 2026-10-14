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
