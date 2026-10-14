import { strict as assert } from "node:assert";
import { test } from "node:test";
import { World } from "../packages/simulation/world";
import {
  actionPhase,
  actionState,
  canDisplayTarget,
  type ActionState,
} from "../apps/client/src/combat-presentation";

test("encounter UI drops retreating, dead, distant and wall-hidden targets but keeps downed players", () => {
  const w = new World(),
    observer = w.join("viewer", "Viewer", "knight");
  Object.assign(observer, { x: 0, z: 10 });
  const target = w.actors.get("wolf-1")!;
  assert.ok(canDisplayTarget(target, observer));
  target.returning = true;
  assert.equal(canDisplayTarget(target, observer), false);
  target.returning = false;
  target.life = "dead";
  assert.equal(canDisplayTarget(target, observer), false);
  Object.assign(target, { life: "alive", z: 40 });
  assert.equal(canDisplayTarget(target, observer), false);
  Object.assign(target, { x: 5.6, z: 4 });
  Object.assign(observer, { x: 5.6, z: 8 });
  assert.equal(
    canDisplayTarget(target, observer),
    false,
    "solid gate tower hides the target",
  );
  Object.assign(target, { kind: "player", life: "downed", x: 0, z: 10 });
  Object.assign(observer, { x: 0, z: 11 });
  assert.ok(
    canDisplayTarget(target, observer),
    "keep nearby allies selectable for revive",
  );
});

test("an action reaches contact at authoritative commit and retains its recovery with a slower windup", () => {
  for (const windup of [0.3, 0.8]) {
    assert.equal(actionPhase(0, windup, 0.3, 0.36), 0);
    assert.ok(
      Math.abs(actionPhase(windup, windup, 0.3, 0.36) - 0.3 / 0.66) < 1e-9,
    );
    assert.equal(actionPhase(windup + 0.36, windup, 0.3, 0.36), 1);
    assert.equal(actionPhase(-0.1, windup, 0.3, 0.36), 0);
    assert.equal(actionPhase(4, windup, 0.3, 0.36), 1);
  }
});

test("voxel rigs see windup until the server commit, a short impact hold, then recovery", () => {
  const out: ActionState = { phase: "windup", t: 0, progress: 0 };
  const windup = 0.45,
    impact = 0.45,
    recovery = 0.45;
  assert.ok(actionState(0.2, windup, impact, recovery, out));
  assert.equal(out.phase, "windup");
  assert.ok(Math.abs(out.t - 0.2 / 0.45) < 1e-9);
  assert.equal(out.progress, actionPhase(0.2, windup, impact, recovery));
  assert.ok(actionState(0.47, windup, impact, recovery, out));
  assert.equal(out.phase, "impact");
  assert.ok(actionState(0.8, windup, impact, recovery, out));
  assert.equal(out.phase, "recovery");
  assert.ok(out.t > 0 && out.t < 1);
  assert.equal(actionState(0.91, windup, impact, recovery, out), false);
  assert.equal(actionState(-0.01, windup, impact, recovery, out), false);
  // Instant abilities skip straight to the impact pose.
  assert.ok(actionState(0, 0, 0.1, 0.3, out));
  assert.equal(out.phase, "impact");
});
