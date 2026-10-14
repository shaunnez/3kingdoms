import {
  BUILD,
  PROTOCOL,
  distance,
  type ActorView,
  type CombatEvent,
  type Command,
  type Guild,
  type Notice,
  type Snapshot,
  type Vec2,
} from "../contracts/game";
import type { Actor, Corpse, Mine, Projectile } from "./actor";
import { CREATURES } from "./data/creatures";
import { GUILD_COMBAT } from "./data/guilds";
import { Combat, COMBAT_WINDOW, RETALIATION_WINDOW } from "./engine/combat";
import * as statuses from "./engine/statuses";
import type { CombatHost } from "./engine/types";
import { isSafe, lineOfSight, move, NPCS, REFUGE } from "./map";

export type { Actor } from "./actor";
export type SavedWorld = {
  version: 1;
  now: number;
  counter: number;
  players: Actor[];
  corpses: Corpse[];
  receipts: string[];
};
export class World implements CombatHost {
  now = 0;
  tick = 0;
  counter = 0;
  actors = new Map<string, Actor>();
  corpses = new Map<string, Corpse>();
  receipts = new Set<string>();
  events: CombatEvent[] = [];
  notices: { id: string; notice: Notice }[] = [];
  mines: Mine[] = [];
  projectiles: Projectile[] = [];
  readonly combat = new Combat(this);
  constructor(saved?: SavedWorld) {
    if (saved) {
      if (saved.version !== 1)
        throw new Error("Unsupported checkpoint save version");
      this.now = saved.now;
      this.counter = saved.counter;
      for (const p of saved.players) {
        p.evadeCharges ??= 2;
        p.evadeRecoverAt ??= 0;
        p.returning = false;
        p.oath = false;
        p.protectedBy = null;
        p.connected = false;
        p.active = false;
        p.move = { x: 0, z: 0 };
        p.cast = null;
        p.channel = null;
        // Saves before the redirect share was stored cannot carry it over.
        if (p.interpose && typeof p.interpose.share !== "number")
          p.interpose = null;
        this.actors.set(p.id, p);
      }
      for (const c of saved.corpses) this.corpses.set(c.id, c);
      this.receipts = new Set(saved.receipts);
    }
    this.npc("mara", "Mara · Keeper of Hours", "mara", NPCS.mara, 1);
    this.npc("merchant", "Nemi · Provisioner", "merchant", NPCS.merchant, 1);
    this.npc("guard", "Concord Watch", "guard", NPCS.guard, 1600);
    this.npc("wolf-1", "Briar Hound", "wolf", { x: 1, z: 11 }, 300);
    this.npc("wolf-2", "Briar Hound", "wolf", { x: -2, z: 29 }, 300);
    this.npc("wolf-3", "Briar Hound", "wolf", { x: 7, z: 39 }, 340);
  }
  private id(prefix: string): string {
    return `${prefix}-${++this.counter}`;
  }
  nextId(): number {
    return ++this.counter;
  }
  isSafe(p: Vec2): boolean {
    return isSafe(p);
  }
  lineOfSight(a: Vec2, b: Vec2): boolean {
    return lineOfSight(a, b);
  }
  move(p: Vec2, dx: number, dz: number): Vec2 {
    return move(p, dx, dz);
  }
  private base(
    id: string,
    name: string,
    kind: ActorView["kind"],
    guild: Guild,
    pos: Vec2,
    hp: number,
  ): Actor {
    return {
      id,
      name,
      kind,
      guild,
      ...pos,
      heading: 0,
      hp,
      maxHp: hp,
      life: "alive",
      level: 5,
      red: 0,
      killer: false,
      safe: isSafe(pos),
      cast: null,
      guarding: false,
      dodging: false,
      connected: true,
      stunned: false,
      healing: false,
      controlRemaining: 0,
      returning: false,
      oath: false,
      protectedBy: null,
      resource: GUILD_COMBAT[guild].resource.start,
      xp: 0,
      marks: 35,
      quest: "unheard",
      inventory: [],
      recovery: [],
      cooldowns: {},
      move: { x: 0, z: 0 },
      moveUntil: 0,
      lastSeq: -1,
      combatUntil: 0,
      disconnectedAt: null,
      downedUntil: 0,
      downedLock: 0,
      evadeUntil: 0,
      evadeCharges: 2,
      evadeRecoverAt: 0,
      braceUntil: 0,
      stunUntil: 0,
      rootUntil: 0,
      slowUntil: 0,
      oathUntil: 0,
      overclockUntil: 0,
      sunderUntil: 0,
      healUntil: 0,
      healTick: 0,
      challenge: null,
      interpose: null,
      channel: null,
      damage: {},
      retaliation: {},
      target: null,
      home: { ...pos },
      respawnAt: 0,
      active: true,
    };
  }
  private npc(
    id: string,
    name: string,
    kind: ActorView["kind"],
    pos: Vec2,
    hp: number,
  ) {
    this.actors.set(id, this.base(id, name, kind, "knight", pos, hp));
  }
  join(id: string, name: string, guild: Guild): Actor {
    const existing = this.actors.get(id);
    if (existing) {
      existing.connected = true;
      existing.active = true;
      existing.disconnectedAt = null;
      existing.lastSeq = -1;
      return existing;
    }
    const p = this.base(id, name, "player", guild, { x: 0, z: -17 }, 768);
    p.inventory = [
      {
        id: this.id("item"),
        name:
          guild === "knight" ? "Concord starter blade" : "Starter pulse core",
        icon: "blade",
        protected: true,
        slot: "primary",
      },
      {
        id: this.id("item"),
        name: "Traveller’s starter coat",
        icon: "armour",
        protected: true,
        slot: "body",
      },
      {
        id: this.id("item"),
        name: "Briar-forged brooch",
        icon: "relic",
        protected: false,
        slot: "relic",
      },
      {
        id: this.id("item"),
        name: "Amber shard",
        icon: "shard",
        protected: false,
      },
      {
        id: this.id("item"),
        name: "Weathered copper ring",
        icon: "ring",
        protected: false,
      },
    ];
    this.actors.set(id, p);
    return p;
  }
  disconnect(id: string) {
    const p = this.actors.get(id);
    if (p) {
      p.connected = false;
      p.disconnectedAt = this.now;
      p.move = { x: 0, z: 0 };
      p.channel = null;
      p.cast = null;
    }
  }
  say(
    id: string,
    text: string,
    kind: Notice["kind"] = "info",
    speaker?: string,
  ) {
    this.notices.push({ id, notice: { kind, text, speaker } });
  }
  emit(
    type: CombatEvent["type"],
    source: Actor,
    target: Actor,
    key: string,
    amount = 0,
    presentation: Pick<CombatEvent, "blocked" | "aim"> = {},
  ) {
    this.events.push({
      id: ++this.counter,
      at: this.now,
      type,
      source: source.id,
      target: target.id,
      key,
      amount,
      ...presentation,
      x: target.x,
      z: target.z,
    });
  }
  offence(p: Actor, killer = false) {
    p.red = Math.max(p.red, killer ? 3600 : 600);
    p.killer = p.killer || killer;
  }
  canHarm(a: Actor, b: Actor): boolean {
    if (
      a.id === b.id ||
      !b.active ||
      b.life === "dead" ||
      b.kind === "mara" ||
      b.kind === "merchant"
    )
      return false;
    if (a.kind === "player" && b.kind === "player")
      return !isSafe(a) && !isSafe(b);
    if (a.kind === "guard")
      return (
        b.kind === "player" &&
        b.red > 0 &&
        distance(b, REFUGE) > REFUGE.radius + 1
      );
    return true;
  }
  private legal(a: Actor, b: Actor): boolean {
    return b.red > 0 || (a.retaliation[b.id] ?? 0) > this.now;
  }
  aggression(a: Actor, b: Actor) {
    if (a.kind !== "player") return;
    if (b.kind === "guard") this.offence(a);
    if (b.kind !== "player") return;
    const unlawful = !this.legal(a, b);
    if (unlawful) this.offence(a);
    b.retaliation[a.id] = this.now + RETALIATION_WINDOW;
    if (unlawful) {
      const r = b.damage[a.id] ?? {
        amount: 0,
        first: this.now,
        last: this.now,
        unlawful: true,
      };
      r.unlawful = true;
      r.last = this.now;
      b.damage[a.id] = r;
    }
    a.combatUntil = b.combatUntil = this.now + COMBAT_WINDOW;
  }
  command(id: string, input: unknown): boolean {
    const p = this.actors.get(id);
    if (!p || !p.connected || typeof input !== "object" || input === null)
      return false;
    const raw = input as Record<string, unknown>;
    if (
      !Number.isSafeInteger(raw.seq) ||
      Number(raw.seq) <= p.lastSeq ||
      Number(raw.seq) > p.lastSeq + 100000
    )
      return false;
    p.lastSeq = Number(raw.seq);
    const c = input as Command;
    if (c.type === "respawn") {
      if (p.life === "dead") this.respawn(p);
      return true;
    }
    if (p.life !== "alive" && !(p.life === "downed" && c.type === "move"))
      return false;
    switch (c.type) {
      case "move": {
        if (!Number.isFinite(c.x) || !Number.isFinite(c.z)) return false;
        const length = Math.hypot(c.x, c.z);
        p.move = length
          ? { x: c.x / Math.max(1, length), z: c.z / Math.max(1, length) }
          : { x: 0, z: 0 };
        p.moveUntil = this.now + 0.25;
        if (length > 0.1) {
          p.channel = null;
          p.cast = null;
        }
        return true;
      }
      case "ability":
        return this.combat.begin(
          p,
          c.key,
          typeof c.target === "string" ? c.target : "",
          c.aim,
        );
      case "interact":
        if (typeof c.target === "string") this.interact(p, c.target);
        return true;
      case "claim":
        if (typeof c.corpse === "string" && typeof c.item === "string")
          return this.beginClaim(p, c.corpse, c.item);
        return false;
      case "buy": {
        if (distance(p, NPCS.merchant) > 3) return false;
        if (p.red > 0) {
          this.say(
            id,
            "The Watch has marked you. I cannot trade with a red name.",
            "dialogue",
            "Nemi",
          );
          return false;
        }
        if (p.marks < 12 || p.inventory.length >= 40) {
          this.say(id, "You need 12 marks and a free inventory slot.", "error");
          return false;
        }
        p.marks -= 12;
        p.inventory.push({
          id: this.id("item"),
          name: "Polished amber charm",
          icon: "relic",
          protected: false,
        });
        this.say(id, "Polished amber charm added to your inventory.");
        return true;
      }
      case "guild": {
        if (
          (c.guild !== "knight" && c.guild !== "cyborg") ||
          p.z > 0 ||
          p.combatUntil > this.now ||
          p.red > 0
        )
          return false;
        p.guild = c.guild;
        p.resource = GUILD_COMBAT[c.guild].resource.start;
        p.cooldowns = {};
        this.say(
          id,
          `${c.guild === "knight" ? "Knight" : "Cyborg"} practice loadout equipped.`,
        );
        return true;
      }
      case "cancel":
        p.cast = null;
        p.channel = null;
        p.move = { x: 0, z: 0 };
        return true;
      default:
        return false;
    }
  }
  die(p: Actor, last?: Actor) {
    if (p.life === "dead") return;
    p.life = "dead";
    p.hp = 0;
    p.cast = null;
    p.channel = null;
    p.move = { x: 0, z: 0 };
    this.emit("death", last ?? p, p, "death");
    if (p.kind !== "player") {
      const creature = CREATURES[p.kind];
      p.respawnAt = this.now + (creature?.respawn ?? 35);
      if (p.kind === "guard" && last?.kind === "player")
        this.offence(last, true);
      const reward = creature?.reward;
      if (reward)
        for (const [id, r] of Object.entries(p.damage)) {
          const winner = this.actors.get(id);
          if (
            winner &&
            winner.kind === "player" &&
            r.amount >= p.maxHp * reward.minShare &&
            this.now - r.last < reward.window
          ) {
            this.awardExperience(winner, reward.xp);
            winner.marks += reward.marks;
          }
        }
      return;
    }
    const participants = Object.entries(p.damage)
      .filter(
        ([id, r]) =>
          this.actors.get(id)?.kind === "player" && this.now - r.last <= 20,
      )
      .sort((a, b) => b[1].amount - a[1].amount || a[1].first - b[1].first);
    for (const [id, r] of participants)
      if (r.unlawful) {
        const offender = this.actors.get(id);
        if (offender) this.offence(offender, true);
      }
    const quota = p.red > 0 ? 2 : participants.length ? 1 : 0;
    const items = quota ? p.inventory.filter((i) => !i.protected) : [];
    if (quota && items.length) {
      p.inventory = p.inventory.filter((i) => i.protected);
      const id = this.id("corpse");
      this.corpses.set(id, {
        id,
        name: `${p.name}’s belongings`,
        victim: p.id,
        x: p.x,
        z: p.z,
        quota,
        expires: this.now + 120,
        owner: participants[0]?.[0] ?? null,
        items: [...items],
        priorItems: [...items],
      });
    }
    this.say(
      p.id,
      quota
        ? `You fell. ${quota} eligible item${quota === 1 ? "" : "s"} may be claimed for 120 seconds. Your starter gear is protected.`
        : "You fell. Your equipment is safe.",
    );
  }
  private respawn(p: Actor) {
    Object.assign(
      p,
      p.red > 0 ? { x: REFUGE.x, z: REFUGE.z } : { x: 0, z: -17 },
    );
    p.hp = p.maxHp;
    p.life = "alive";
    p.safe = true;
    p.damage = {};
    p.cast = null;
    p.channel = null;
    p.move = { x: 0, z: 0 };
    p.resource = GUILD_COMBAT[p.guild].resource.start;
  }
  private beginClaim(p: Actor, corpseId: string, itemId: string): boolean {
    const c = this.corpses.get(corpseId);
    if (
      !c ||
      c.expires <= this.now ||
      c.quota <= 0 ||
      c.victim === p.id ||
      (c.owner && c.owner !== p.id) ||
      distance(p, c) > 3 ||
      !c.items.some((i) => i.id === itemId)
    ) {
      this.say(
        p.id,
        "This item is not available to you. Move within three metres of your claim.",
        "error",
      );
      return false;
    }
    if (p.inventory.length >= 40) {
      this.say(p.id, "Inventory full. The item remains in escrow.", "error");
      return false;
    }
    p.channel = {
      kind: "loot",
      name: "Claiming item",
      start: this.now,
      end: this.now + 3,
      corpse: corpseId,
      item: itemId,
      origin: { x: p.x, z: p.z },
    };
    p.cast = null;
    p.move = { x: 0, z: 0 };
    return true;
  }
  private finishClaim(p: Actor) {
    const claim = p.channel;
    if (!claim || claim.kind !== "loot") return;
    p.channel = null;
    const c = this.corpses.get(claim.corpse);
    if (
      !c ||
      c.quota <= 0 ||
      c.expires <= this.now ||
      distance(p, c) > 3 ||
      p.inventory.length >= 40 ||
      (c.owner && c.owner !== p.id)
    )
      return;
    const i = c.items.findIndex((x) => x.id === claim.item);
    if (i < 0) return;
    const receipt = `${c.id}:${claim.item}`;
    if (this.receipts.has(receipt)) return;
    const [item] = c.items.splice(i, 1);
    delete item.slot;
    p.inventory.push(item);
    c.quota--;
    c.owner = p.id;
    this.receipts.add(receipt);
    this.emit("loot", p, p, "loot");
    this.say(
      p.id,
      `${item.name} claimed. ${c.quota} item${c.quota === 1 ? "" : "s"} remaining.`,
    );
    this.say(c.victim, `${p.name} claimed your ${item.name}.`);
    if (c.quota === 0 || c.items.length === 0) this.release(c);
  }
  private release(c: Corpse) {
    const victim = this.actors.get(c.victim);
    if (victim)
      for (const item of c.items) {
        if (victim.inventory.length < 40) {
          if (item.slot && victim.inventory.some((i) => i.slot === item.slot))
            delete item.slot;
          victim.inventory.push(item);
        } else victim.recovery.push(item);
      }
    this.corpses.delete(c.id);
  }
  private interact(p: Actor, target: string) {
    if (target === "inscription") {
      if (distance(p, NPCS.inscription) > 3) {
        this.say(p.id, "Move closer to examine the stone.", "error");
        return;
      }
      if (p.quest === "accepted") p.quest = "inspected";
      this.say(
        p.id,
        "Under the moss: “Elian Voss, bridge keeper. Lost between the twelfth bell and dawn.” Beneath it, thirteen tally marks. The last is cut across the others, with the words: “We heard him answer.” You copy the name, the marks and the inscription into your journal.",
        "dialogue",
        "Weathered epitaph",
      );
      return;
    }
    const t = this.actors.get(target);
    if (!t || distance(p, t) > 3) return;
    if (
      t.kind === "player" &&
      t.life === "downed" &&
      t.id !== p.id &&
      lineOfSight(p, t)
    ) {
      p.cast = null;
      p.move = { x: 0, z: 0 };
      p.channel = {
        kind: "revive",
        name: `Reviving ${t.name}`,
        start: this.now,
        end: this.now + 4,
        target: t.id,
        origin: { x: p.x, z: p.z },
      };
      if (t.red > 0 && t.combatUntil > this.now && !isSafe(t)) this.offence(p);
      return;
    }
    if (t.kind === "mara") {
      if (p.quest === "unheard") {
        p.quest = "accepted";
        this.say(
          p.id,
          "I keep the gate bell. Last night it rang thirteen times, though its wheel has only twelve teeth. My father's ledger mentions the same thing when a bridge keeper vanished. His memorial is across the Briar bridge, beside the ruined arch on the left. Bring me the name and inscription; I want to check the ledger, not start a panic. Hounds haunt that road, and other travellers can attack beyond the town lanterns.",
          "dialogue",
          "Mara",
        );
      } else if (p.quest === "inspected") {
        p.quest = "complete";
        p.marks += 40;
        this.awardExperience(p, 220);
        const item = {
          id: this.id("item"),
          name: "Mara’s hourglass charm",
          icon: "relic",
          protected: false,
        };
        if (p.inventory.length < 40) p.inventory.push(item);
        else p.recovery.push(item);
        this.say(
          p.id,
          "Elian Voss. Here he is in the ledger: the search party heard him answer after the thirteenth toll, but the bridge was empty. Your copy confirms that last night was no broken bell. I will have the Watch check the bridge at dusk. You have done what I asked; take this charm and your pay.\n\nExpedition complete · +40 marks · +220 XP · Mara’s hourglass charm.",
          "dialogue",
          "Mara",
        );
      } else
        this.say(
          p.id,
          p.quest === "complete"
            ? "I have your copy beside the ledger. The Watch knows to listen at the bridge tonight. Thank you for bringing me evidence, not another rumour. Your work here is done."
            : "Go through the north gate and cross the wooden bridge. Turn left at the ruined arch. Copy the bridge keeper's name and the words on his memorial, then bring them back to me.",
          "dialogue",
          "Mara",
        );
    } else if (t.kind === "merchant")
      this.say(
        p.id,
        p.red > 0
          ? "I know that red name. Clear your debt to the Concord before asking for trade."
          : "A charm for the road? Polished amber, twelve marks. It can be taken if you fall to another traveller.",
        "dialogue",
        "Nemi",
      );
    else if (t.kind === "guard")
      this.say(
        p.id,
        p.red > 0
          ? "Your name is marked. Lay down your arms."
          : "The Concord protects this town. Beyond the lantern posts, you travel at your own risk.",
        "dialogue",
        "Concord Watch",
      );
  }
  step(dt = 0.05) {
    if (!Number.isFinite(dt) || dt <= 0 || dt > 0.1)
      throw new Error("Simulation step must be in (0, 0.1] seconds");
    this.now += dt;
    this.tick++;
    this.events = this.events.filter((e) => this.now - e.at < 2);
    for (const p of this.actors.values()) {
      if (!p.active) continue;
      this.combat.recoverEvade(p);

      if (p.kind === "player" && p.connected) {
        p.red = Math.max(0, p.red - dt);
        if (!p.red) p.killer = false;
      }
      if (
        p.kind === "player" &&
        !p.connected &&
        p.disconnectedAt !== null &&
        this.now - p.disconnectedAt >= 60 &&
        p.combatUntil <= this.now
      ) {
        p.active = false;
        continue;
      }
      if (p.life === "dead") {
        if (p.kind !== "player" && p.respawnAt <= this.now) {
          this.respawn(p);
          Object.assign(p, p.home);
        }
        continue;
      }
      if (p.life === "downed") {
        if (p.downedUntil <= this.now) this.die(p);
        else if (p.moveUntil > this.now) {
          Object.assign(p, move(p, p.move.x * 0.8 * dt, p.move.z * 0.8 * dt));
          p.safe = isSafe(p);
        }
        continue;
      }
      if (p.kind === "guard" || p.kind === "wolf") this.ai(p, dt);
      if (p.moveUntil > this.now && !statuses.blocksMovement(p, this.now)) {
        const speed = 4.5 * statuses.speedScale(p, this.now);
        Object.assign(p, move(p, p.move.x * speed * dt, p.move.z * speed * dt));
        if (Math.hypot(p.move.x, p.move.z) > 0.1)
          p.heading = Math.atan2(p.move.x, p.move.z);
      }
      const safe = isSafe(p);
      if (safe && !p.safe) statuses.clearOnSafety(p);
      p.safe = safe;
      if (p.cast && p.cast.end <= this.now) this.combat.commit(p);
      if (p.channel) {
        if (distance(p, p.channel.origin) > 0.15) p.channel = null;
        else if (p.channel.kind === "revive") {
          const target = this.actors.get(p.channel.target);
          if (
            !target ||
            target.life !== "downed" ||
            distance(p, target) > 3 ||
            !lineOfSight(p, target)
          )
            p.channel = null;
          else if (p.channel.end <= this.now) {
            target.life = "alive";
            target.hp = Math.round(target.maxHp * 0.35);
            target.downedUntil = 0;
            statuses.clear(target, "stun");
            statuses.clear(target, "root");
            p.channel = null;
            this.emit("heal", p, target, "revive", target.hp);
            this.say(target.id, `${p.name} helped you to your feet.`);
          }
        } else if (p.channel.end <= this.now) this.finishClaim(p);
      }
      this.combat.tick(p, dt);
      this.combat.flags(p);
    }
    this.combat.stepObjects(dt);
    for (const c of this.corpses.values())
      if (c.expires <= this.now) this.release(c);
  }
  private ai(p: Actor, dt: number) {
    if (statuses.blocksMovement(p, this.now) || p.cast) return;
    // Finish a retreat before reacquiring: the old leash oscillated at its edge.
    if (p.returning) {
      this.returnHome(p, dt);
      return;
    }
    const creature = CREATURES[p.kind];
    if (!creature) return;
    const limit = creature.sight;
    const candidates = [...this.actors.values()].filter(
      (t) =>
        t.kind === "player" &&
        t.active &&
        t.life !== "dead" &&
        (p.kind === "guard" ? t.red > 0 && !this.inRefuge(t) : !isSafe(t)) &&
        distance(p, t) < limit &&
        lineOfSight(p, t),
    );
    const forced =
      p.challenge && p.challenge.until > this.now
        ? candidates.find((t) => t.id === p.challenge?.owner)
        : undefined;
    const target =
      forced ?? candidates.sort((a, b) => distance(p, a) - distance(p, b))[0];
    if (target && distance(p, p.home) < creature.leash) {
      p.target = target.id;
      const d = distance(p, target);
      p.heading = Math.atan2(target.x - p.x, target.z - p.z);
      if (d > creature.attack.engage) {
        const speed = creature.speed;
        const proposed = move(
          p,
          ((target.x - p.x) / d) * speed * dt,
          ((target.z - p.z) / d) * speed * dt,
        );
        if (!this.inRefuge(proposed)) Object.assign(p, proposed);
      } else if ((p.cooldowns.basic ?? 0) <= this.now)
        this.combat.startCreatureAttack(p, target);
    } else {
      p.target = null;
      p.returning = distance(p, p.home) > 0.2;
      this.returnHome(p, dt);
    }
  }
  private returnHome(p: Actor, dt: number) {
    const d = distance(p, p.home);
    p.target = null;
    if (d > 0.2) {
      p.heading = Math.atan2(p.home.x - p.x, p.home.z - p.z);
      const step = Math.min(d, dt * 2);
      Object.assign(
        p,
        move(p, ((p.home.x - p.x) / d) * step, ((p.home.z - p.z) / d) * step),
      );
    } else p.returning = false;
    if (d < 0.5 && p.combatUntil <= this.now) p.hp = p.maxHp;
  }
  private inRefuge(p: Vec2) {
    return distance(p, REFUGE) <= REFUGE.radius + 1;
  }
  private nextLevel(p: Actor) {
    return 100 + 35 * p.level + 12 * p.level ** 2;
  }
  private awardExperience(p: Actor, amount: number) {
    if (p.level >= 20) return;
    p.xp += amount;
    while (p.level < 20 && p.xp >= this.nextLevel(p)) {
      p.xp -= this.nextLevel(p);
      p.level++;
      p.maxHp += 72;
      p.hp = p.maxHp;
      this.emit("level", p, p, "level");
    }
    if (p.level === 20) p.xp = 0;
  }
  snapshot(id: string, afterEvent = 0): Snapshot {
    const p = this.actors.get(id);
    if (!p) throw new Error("Unknown player");
    return {
      protocol: PROTOCOL,
      build: BUILD,
      tick: this.tick,
      now: this.now,
      population: [...this.actors.values()].filter(
        (p) => p.kind === "player" && p.connected,
      ).length,
      actors: [...this.actors.values()]
        .filter((a) => a.active)
        .map((a) => ({
          id: a.id,
          name: a.name,
          kind: a.kind,
          guild: a.guild,
          x: a.x,
          z: a.z,
          heading: a.heading,
          hp: a.hp,
          maxHp: a.maxHp,
          life: a.life,
          level: a.level,
          red: a.red,
          killer: a.killer,
          safe: isSafe(a),
          cast: a.cast,
          guarding: a.guarding,
          dodging: a.dodging,
          connected: a.connected,
          stunned: a.stunned,
          healing: a.healing,
          returning: a.returning,
          oath: statuses.active(a, "oath", this.now),
          protectedBy:
            a.interpose && a.interpose.until > this.now
              ? a.interpose.owner
              : null,
          controlRemaining: Math.max(
            0,
            statuses.until(a, "stun") - this.now,
            statuses.until(a, "root") - this.now,
          ),
        })),
      corpses: [...this.corpses.values()].map((c) => ({
        id: c.id,
        name: c.name,
        victim: c.victim,
        x: c.x,
        z: c.z,
        quota: c.quota,
        expires: c.expires,
        owner: c.owner,
        items:
          distance(p, c) <= 4 &&
          (c.owner === p.id || c.owner === null || c.victim === p.id)
            ? c.items
            : [],
      })),
      self: {
        id: p.id,
        resource: p.resource,
        xp: p.xp,
        nextLevel: this.nextLevel(p),
        marks: p.marks,
        quest: p.quest,
        inventory: p.inventory,
        held: [...this.corpses.values()]
          .filter((c) => c.victim === p.id)
          .flatMap((c) => c.items),
        cooldowns: p.cooldowns,
        channel: p.channel
          ? { name: p.channel.name, start: p.channel.start, end: p.channel.end }
          : null,
        combatUntil: p.combatUntil,
        evadeCharges: p.evadeCharges,
      },
      events: this.events.filter((event) => event.id > afterEvent),
      projectiles: this.projectiles.map(({ id, owner, key, x, z, dx, dz }) => ({
        id,
        owner,
        key,
        x,
        z,
        dx,
        dz,
      })),
      mines: this.mines.map(({ id, owner, x, z, arm }) => ({
        id,
        owner,
        x,
        z,
        armed: arm <= this.now,
      })),
    };
  }
  save(): SavedWorld {
    return {
      version: 1,
      now: this.now,
      counter: this.counter,
      players: [...this.actors.values()].filter((p) => p.kind === "player"),
      corpses: [...this.corpses.values()],
      receipts: [...this.receipts],
    };
  }
}
