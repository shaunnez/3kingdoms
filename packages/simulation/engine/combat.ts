import {
  KITS,
  distance,
  type Ability,
  type AbilityKey,
  type Cast,
  type Guild,
  type Vec2,
} from "../../contracts/game";
import type { Actor } from "../actor";
import { CREATURES } from "../data/creatures";
import { GUILD_COMBAT } from "../data/guilds";
import * as resources from "./resources";
import * as statuses from "./statuses";
import type { AbilityDef, CombatHost, Effect } from "./types";

/** Level-scaled power that every ability's catalogue power multiplies. */
export const power = (p: Actor): number => 40 + 6 * (p.level - 1);

/** Seconds two fighters stay in combat after an exchange. */
export const COMBAT_WINDOW = 20;
/** Seconds a victim may lawfully strike back. */
export const RETALIATION_WINDOW = 30;
const DOWNED_SECONDS = 10;
const DOWNED_LOCKOUT = 60;
/** Out-of-combat health recovery per second. */
const RECOVERY_HP = 12;
/** Slack added to an ability's range when it begins. */
const BEGIN_SLACK = 0.3;
/** How far ahead a targetless cast aims. */
const DEFAULT_AIM = 6;
/** A brace blocks hits that arrive within this cosine of the holder's facing. */
const FRONTAL_COSINE = 0.2;

const stats = (guild: Guild, key: AbilityKey): Ability | undefined =>
  KITS[guild].find((x) => x.key === key);
const behaviour = (guild: Guild, key: AbilityKey): AbilityDef | undefined =>
  GUILD_COMBAT[guild].abilities[key];
function effectOf<K extends Effect["kind"]>(
  guild: Guild,
  kind: K,
): Extract<Effect, { kind: K }> | undefined {
  for (const def of Object.values(GUILD_COMBAT[guild].abilities))
    for (const e of def?.effects ?? [])
      if (e.kind === kind) return e as Extract<Effect, { kind: K }>;
  return undefined;
}

/** Evade charges and recharge per guild, resolved once from the data. */
const EVADE = Object.fromEntries(
  (Object.keys(GUILD_COMBAT) as Guild[]).map((guild) => {
    const d = behaviour(guild, "space")?.delivery;
    return [
      guild,
      d?.kind === "evade"
        ? { charges: d.charges, recharge: stats(guild, "space")!.cooldown }
        : undefined,
    ];
  }),
) as Record<Guild, { charges: number; recharge: number } | undefined>;

/**
 * The single combat pipeline: begin (validate, wind up) → commit (pay, cool
 * down, deliver) → apply effects → hit/heal. Guild and creature behaviour is
 * data in `../data`; this class holds the rules shared by all of it.
 */
export class Combat {
  constructor(private host: CombatHost) {}

  /** Starts an ability, or performs an instant one. Returns whether it was accepted. */
  begin(p: Actor, key: AbilityKey, targetId: string, aim?: Vec2): boolean {
    const h = this.host,
      now = h.now;
    const a = stats(p.guild, key),
      def = behaviour(p.guild, key);
    const breakFree = def?.delivery.kind === "breakFree",
      evade = def?.delivery.kind === "evade";
    if (
      !a ||
      !def ||
      (!breakFree && statuses.blocksActions(p, now)) ||
      (p.cast && !evade && !breakFree) ||
      (p.cooldowns[key] ?? 0) > now
    )
      return false;
    if (def.delivery.kind === "breakFree") {
      p.cast = null;
      for (const id of def.delivery.clears) statuses.clear(p, id);
      p.cooldowns[key] = now + a.cooldown;
      h.emit("dodge", p, p, key);
      return true;
    }
    if (def.delivery.kind === "evade") {
      const d = def.delivery;
      if (p.evadeCharges <= 0) return false;
      if (statuses.blocksEvade(p, now)) return false;
      p.cast = null;
      const dir =
        Math.hypot(p.move.x, p.move.z) > 0.1
          ? p.move
          : { x: Math.sin(p.heading), z: Math.cos(p.heading) };
      Object.assign(p, h.move(p, dir.x * d.distance, dir.z * d.distance));
      statuses.apply(p, "evade", now + d.duration);
      if (p.evadeCharges === d.charges) p.evadeRecoverAt = now + a.cooldown;
      p.evadeCharges--;
      p.cooldowns[key] = p.evadeCharges > 0 ? 0 : p.evadeRecoverAt;
      p.channel = null;
      p.safe = h.isSafe(p);
      h.emit("dodge", p, p, key);
      return true;
    }
    const t = h.actors.get(targetId);
    const hostile = def.target === "enemy";
    if (hostile && (!t || !h.canHarm(p, t))) {
      h.say(
        p.id,
        t
          ? "Town and sanctuary boundaries prevent player attacks."
          : "Select a target first.",
        "error",
      );
      return false;
    }
    if (
      hostile &&
      t &&
      (distance(p, t) > a.range + BEGIN_SLACK || !h.lineOfSight(p, t))
    ) {
      h.say(p.id, "Move closer and keep a clear line of sight.", "error");
      return false;
    }
    const rule = GUILD_COMBAT[p.guild].resource;
    if (!resources.canAfford(rule, p, a.cost)) {
      h.say(p.id, rule.refusal, "error");
      return false;
    }
    if (
      def.delivery.kind === "ally" &&
      (!t ||
        t.kind !== "player" ||
        t.id === p.id ||
        distance(p, t) > def.delivery.reach ||
        h.isSafe(p) !== h.isSafe(t))
    ) {
      h.say(
        p.id,
        "Select a nearby ally on the same side of the safe boundary.",
        "error",
      );
      return false;
    }
    if (hostile && t) h.aggression(p, t);
    const validAim =
      aim &&
      Number.isFinite(aim.x) &&
      Number.isFinite(aim.z) &&
      Math.abs(aim.x) < 80 &&
      Math.abs(aim.z) < 100
        ? aim
        : (t ?? {
            x: p.x + Math.sin(p.heading) * DEFAULT_AIM,
            z: p.z + Math.cos(p.heading) * DEFAULT_AIM,
          });
    if (t) p.heading = Math.atan2(t.x - p.x, t.z - p.z);
    p.cast = {
      key,
      name: a.name,
      start: now,
      end: now + a.windup,
      target: targetId,
      aim: { x: validAim.x, z: validAim.z },
    };
    p.move = { x: 0, z: 0 };
    p.channel = null;
    h.emit("cast", p, t ?? p, key);
    return true;
  }

  /** Resolves a finished windup. */
  commit(p: Actor) {
    const c = p.cast;
    if (!c) return;
    if (p.kind !== "player") return this.commitCreature(p, c);
    p.cast = null;
    const h = this.host,
      now = h.now;
    const a = stats(p.guild, c.key)!,
      def = behaviour(p.guild, c.key)!;
    const rule = GUILD_COMBAT[p.guild].resource;
    if (!resources.canAfford(rule, p, a.cost)) return;
    resources.pay(rule, p, a.cost);
    const scale =
      def.cooldownScale && statuses.active(p, def.cooldownScale.status, now)
        ? def.cooldownScale.scale
        : 1;
    p.cooldowns[c.key] = now + a.cooldown * scale;
    const t = h.actors.get(c.target);
    h.emit("resolve", p, t ?? p, c.key, 0, { aim: c.aim });
    this.deliver(p, def, a, c, t);
  }

  private deliver(
    p: Actor,
    def: AbilityDef,
    a: Ability,
    c: Cast,
    t: Actor | undefined,
  ) {
    const h = this.host,
      now = h.now,
      d = def.delivery,
      amount = power(p) * a.power;
    switch (d.kind) {
      case "self":
        this.applyAll(p, p, def.effects, c.key, amount);
        return;
      case "burst":
        for (const other of h.actors.values())
          if (
            other.id !== p.id &&
            distance(p, other) <= d.radius &&
            h.canHarm(p, other)
          ) {
            h.aggression(p, other);
            this.applyAll(p, other, def.effects, c.key, amount);
          }
        return;
      case "ally":
        if (t && distance(p, t) <= d.reach && h.isSafe(p) === h.isSafe(t)) {
          this.applyAll(p, t, def.effects, c.key, amount);
          // Supporting an outlaw in a fight outside safety makes the helper one.
          if (t.red > 0 && t.combatUntil > now && !h.isSafe(t)) h.offence(p);
        }
        return;
      case "mark":
        if (t && h.canHarm(p, t))
          this.applyAll(p, t, def.effects, c.key, amount);
        return;
      case "mine": {
        const reach = distance(p, c.aim),
          f = reach > d.maxDistance ? d.maxDistance / reach : 1;
        h.mines = h.mines.filter((m) => m.owner !== p.id);
        h.mines.push({
          id: h.nextId(),
          x: p.x + (c.aim.x - p.x) * f,
          z: p.z + (c.aim.z - p.z) * f,
          owner: p.id,
          key: c.key,
          arm: now + d.arm,
          expires: now + d.lifetime,
          radius: d.radius,
          effects: d.effects,
        });
        return;
      }
      case "line": {
        const dx = c.aim.x - p.x,
          dz = c.aim.z - p.z,
          len = Math.hypot(dx, dz) || 1;
        const targets = [...h.actors.values()]
          .filter((b) => {
            const along = ((b.x - p.x) * dx + (b.z - p.z) * dz) / len;
            const side = Math.abs((b.x - p.x) * dz - (b.z - p.z) * dx) / len;
            return (
              along > 0 &&
              along <= a.range &&
              side < d.width &&
              h.canHarm(p, b) &&
              h.lineOfSight(p, b)
            );
          })
          .sort((x, y) => distance(p, x) - distance(p, y));
        targets.forEach((b, i) => {
          h.aggression(p, b);
          this.applyAll(p, b, def.effects, c.key, amount * (i ? d.falloff : 1));
        });
        if (!targets.length) h.emit("miss", p, t ?? p, c.key);
        return;
      }
      case "projectile": {
        if (!t) {
          h.emit("miss", p, p, c.key);
          return;
        }
        const dx = t.x - p.x,
          dz = t.z - p.z,
          len = Math.hypot(dx, dz) || 1;
        const damage = def.effects.find((e) => e.kind === "damage");
        h.projectiles.push({
          id: h.nextId(),
          owner: p.id,
          key: c.key,
          x: p.x,
          z: p.z,
          dx: dx / len,
          dz: dz / len,
          travelled: 0,
          range: a.range,
          damage: amount * (damage?.scale ?? 1),
          speed: d.speed,
          radius: d.radius,
          effects: def.effects.filter((e) => e.kind !== "damage"),
        });
        return;
      }
      case "melee":
        if (
          t &&
          distance(p, t) <= a.range + d.slack &&
          h.lineOfSight(p, t) &&
          h.canHarm(p, t)
        )
          this.applyAll(p, t, def.effects, c.key, amount);
        else h.emit("miss", p, t ?? p, c.key);
        return;
      case "evade":
      case "breakFree":
        return; // Instant; handled in begin().
    }
  }

  private applyAll(
    p: Actor,
    t: Actor,
    effects: Effect[],
    key: string,
    amount: number,
  ) {
    for (const e of effects) this.apply(p, t, e, key, amount);
  }

  private apply(p: Actor, t: Actor, e: Effect, key: string, amount: number) {
    const now = this.host.now;
    switch (e.kind) {
      case "damage":
        this.hit(p, t, amount * (e.scale ?? 1), key);
        return;
      case "flatDamage":
        this.hit(p, t, e.amount, key);
        return;
      case "status": {
        const who = e.self ? p : t;
        if (e.landed && (who.life !== "alive" || statuses.avoidsHits(who, now)))
          return;
        if (e.interrupt) who.cast = null;
        statuses.apply(who, e.status, now + e.duration);
        return;
      }
      case "gain":
        resources.gain(GUILD_COMBAT[p.guild].resource, p, e.amount);
        return;
      case "challenge":
        t.challenge = { owner: p.id, until: now + e.duration };
        if (t.kind !== "player") t.target = p.id;
        return;
      case "interpose":
        t.interpose = {
          owner: p.id,
          until: now + e.duration,
          remaining: p.maxHp * e.capOfCasterMaxHp,
          share: e.share,
        };
        return;
      case "regen":
        statuses.apply(p, "regen", now + e.duration);
        p.healTick = now;
        return;
    }
  }

  /** Applies damage after evasion, status modifiers, blocks and redirection. */
  hit(a: Actor, b: Actor, amount: number, key: string, redirected = false) {
    const h = this.host,
      now = h.now;
    if (!h.canHarm(a, b)) return;
    if (statuses.avoidsHits(b, now)) {
      h.emit("miss", a, b, key);
      return;
    }
    let damage = statuses.taken(b, statuses.dealt(a, amount, now), now);
    if (a.challenge && a.challenge.until > now && a.challenge.owner !== b.id) {
      const owner = h.actors.get(a.challenge.owner);
      damage *= (owner && effectOf(owner.guild, "challenge")?.otherDamage) ?? 1;
    }
    let blocked = false;
    if (statuses.active(b, "brace", now)) {
      const facing = Math.cos(b.heading - Math.atan2(a.x - b.x, a.z - b.z));
      const block = GUILD_COMBAT[b.guild].block;
      if (!block.frontalOnly || facing > FRONTAL_COSINE) {
        blocked = true;
        damage *= block.taken;
        const heal = statuses.healOnBlock(b, now);
        if (heal) this.heal(b, b, heal);
      }
    }
    if (!redirected && b.interpose && b.interpose.until > now) {
      const guard = h.actors.get(b.interpose.owner);
      if (guard && guard.life === "alive" && h.canHarm(a, guard)) {
        const share = Math.min(
          damage * b.interpose.share,
          b.interpose.remaining,
        );
        damage -= share;
        b.interpose.remaining -= share;
        this.hit(a, guard, share, key, true);
      }
    }
    damage = Math.max(1, Math.round(damage));
    const record = b.damage[a.id] ?? {
      amount: 0,
      first: now,
      last: now,
      unlawful: false,
    };
    record.amount += Math.min(damage, b.hp);
    record.last = now;
    b.damage[a.id] = record;
    a.combatUntil = b.combatUntil = now + COMBAT_WINDOW;
    b.channel = null;
    statuses.clearOnDamage(b);
    if (a.kind === "player" && b.kind === "player")
      b.retaliation[a.id] = now + RETALIATION_WINDOW;
    b.hp = Math.max(0, b.hp - damage);
    h.emit("hit", a, b, key, damage, blocked ? { blocked: true } : {});
    if (b.hp === 0) {
      if (b.kind === "player" && b.life === "alive" && b.downedLock <= now) {
        b.life = "downed";
        b.downedUntil = now + DOWNED_SECONDS;
        b.downedLock = now + DOWNED_LOCKOUT;
        b.cast = null;
        b.move = { x: 0, z: 0 };
      } else h.die(b, a);
    }
  }

  heal(source: Actor, target: Actor, n: number) {
    if (target.life !== "alive") return;
    const amount = Math.min(target.maxHp - target.hp, Math.round(n));
    if (amount > 0) {
      target.hp += amount;
      this.host.emit("heal", source, target, "heal", amount);
    }
  }

  /** Moves shots and triggers armed mines. */
  stepObjects(dt: number) {
    const h = this.host,
      now = h.now;
    for (const shot of h.projectiles) {
      const owner = h.actors.get(shot.owner);
      if (!owner || !owner.active) {
        shot.travelled = shot.range;
        continue;
      }
      const length = Math.min(shot.range - shot.travelled, dt * shot.speed);
      const origin = { x: shot.x, z: shot.z };
      shot.x += shot.dx * length;
      shot.z += shot.dz * length;
      shot.travelled += length;
      if (!h.lineOfSight(origin, shot)) {
        shot.travelled = shot.range;
        continue;
      }
      const struck = [...h.actors.values()]
        .filter((t) => {
          if (!h.canHarm(owner, t)) return false;
          const along = Math.max(
            0,
            Math.min(
              length,
              (t.x - origin.x) * shot.dx + (t.z - origin.z) * shot.dz,
            ),
          );
          return (
            Math.hypot(
              t.x - origin.x - shot.dx * along,
              t.z - origin.z - shot.dz * along,
            ) < shot.radius
          );
        })
        .sort((a, b) => distance(origin, a) - distance(origin, b))[0];
      if (struck) {
        h.aggression(owner, struck);
        this.hit(owner, struck, shot.damage, shot.key);
        this.applyAll(owner, struck, shot.effects, shot.key, shot.damage);
        shot.travelled = shot.range;
      }
    }
    h.projectiles = h.projectiles.filter((s) => s.travelled < s.range);
    for (const m of h.mines) {
      if (m.arm > now || m.expires <= now) continue;
      const owner = h.actors.get(m.owner);
      if (!owner || owner.life !== "alive") continue;
      const targets = [...h.actors.values()].filter(
        (t) => distance(m, t) <= m.radius && h.canHarm(owner, t),
      );
      if (targets.length) {
        for (const t of targets) {
          h.aggression(owner, t);
          this.applyAll(owner, t, m.effects, m.key, 0);
        }
        m.expires = 0;
      }
    }
    h.mines = h.mines.filter((m) => m.expires > now);
  }

  /** Recovers one evade charge when its timer is due. */
  recoverEvade(p: Actor) {
    const evade = EVADE[p.guild];
    if (!evade) return;
    const now = this.host.now;
    if (p.evadeCharges < evade.charges && p.evadeRecoverAt <= now) {
      p.evadeCharges++;
      p.evadeRecoverAt =
        p.evadeCharges < evade.charges ? now + evade.recharge : 0;
      p.cooldowns.space = 0;
    }
  }

  /** Per-step resource flow, regeneration ticks and out-of-combat recovery. */
  tick(p: Actor, dt: number) {
    const now = this.host.now,
      rule = GUILD_COMBAT[p.guild].resource;
    if (p.kind === "player" && rule.mode === "heat") {
      p.resource = Math.max(0, p.resource - dt * (rule.cooling ?? 0));
      statuses.heat(p, dt, rule.max, now);
    }
    if (statuses.active(p, "regen", now) && p.healTick <= now) {
      p.healTick = now + 1;
      const regen = effectOf(p.guild, "regen");
      if (regen)
        this.heal(
          p,
          p,
          power(p) *
            regen.fraction *
            (p.combatUntil > now ? regen.combatScale : 1),
        );
    }
    if (p.kind === "player" && p.combatUntil <= now) {
      p.hp = Math.min(p.maxHp, p.hp + dt * RECOVERY_HP);
      if (rule.recovery)
        p.resource = Math.min(
          rule.recovery.cap,
          p.resource + dt * rule.recovery.rate,
        );
    }
  }

  /** Mirrors statuses into the flags snapshots carry. */
  flags(p: Actor) {
    const now = this.host.now;
    p.guarding = statuses.active(p, "brace", now);
    p.dodging = statuses.active(p, "evade", now);
    p.stunned =
      statuses.active(p, "stun", now) || statuses.active(p, "root", now);
    p.healing = statuses.active(p, "regen", now);
  }

  /** A creature starts its attack on a target in reach. */
  startCreatureAttack(p: Actor, target: Actor) {
    const def = CREATURES[p.kind];
    if (!def) return;
    const now = this.host.now;
    p.cooldowns.basic = now + def.attack.cooldown;
    p.cast = {
      key: "basic",
      name: def.attack.name,
      start: now,
      end: now + def.attack.windup,
      target: target.id,
      aim: { x: target.x, z: target.z },
    };
    this.host.emit("cast", p, target, "basic");
  }

  private commitCreature(p: Actor, c: Cast) {
    const h = this.host;
    const target = h.actors.get(c.target);
    h.emit("resolve", p, target ?? p, c.key);
    p.cast = null;
    const def = CREATURES[p.kind];
    if (target && def && distance(p, target) < def.attack.reach)
      this.hit(p, target, def.attack.damage, c.key);
  }
}
