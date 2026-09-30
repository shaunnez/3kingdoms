import {
  BUILD,
  PROTOCOL,
  KITS,
  distance,
  type AbilityKey,
  type ActorView,
  type CombatEvent,
  type Command,
  type CorpseView,
  type Guild,
  type Item,
  type Notice,
  type Quest,
  type Snapshot,
  type Vec2,
} from "../contracts/game";
import { isSafe, lineOfSight, move, NPCS, REFUGE } from "./map";

type DamageRecord = {
  amount: number;
  first: number;
  last: number;
  unlawful: boolean;
};
export type Actor = ActorView & {
  resource: number;
  xp: number;
  marks: number;
  quest: Quest;
  inventory: Item[];
  recovery: Item[];
  cooldowns: Partial<Record<AbilityKey, number>>;
  move: Vec2;
  moveUntil: number;
  lastSeq: number;
  combatUntil: number;
  disconnectedAt: number | null;
  downedUntil: number;
  downedLock: number;
  evadeUntil: number;
  evadeCharges: number;
  evadeRecoverAt: number;
  braceUntil: number;
  stunUntil: number;
  rootUntil: number;
  slowUntil: number;
  oathUntil: number;
  overclockUntil: number;
  sunderUntil: number;
  healUntil: number;
  healTick: number;
  challenge: { owner: string; until: number } | null;
  interpose: { owner: string; until: number; remaining: number } | null;
  channel:
    | (
        | {
            kind: "loot";
            name: string;
            start: number;
            end: number;
            corpse: string;
            item: string;
            origin: Vec2;
          }
        | {
            kind: "revive";
            name: string;
            start: number;
            end: number;
            target: string;
            origin: Vec2;
          }
      )
    | null;
  damage: Record<string, DamageRecord>;
  retaliation: Record<string, number>;
  target: string | null;
  home: Vec2;
  respawnAt: number;
  active: boolean;
};
type Corpse = CorpseView & { priorItems: Item[] };
type Mine = Vec2 & { id: number; owner: string; arm: number; expires: number };
type Projectile = Vec2 & {
  id: number;
  owner: string;
  key: AbilityKey;
  dx: number;
  dz: number;
  travelled: number;
  range: number;
  damage: number;
};
export type SavedWorld = {
  version: 1;
  now: number;
  counter: number;
  players: Actor[];
  corpses: Corpse[];
  receipts: string[];
};
export class World {
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
  constructor(saved?: SavedWorld) {
    if (saved) {
      if (saved.version !== 1)
        throw new Error("Unsupported checkpoint save version");
      this.now = saved.now;
      this.counter = saved.counter;
      for (const p of saved.players) {
        p.evadeCharges ??= 2;
        p.evadeRecoverAt ??= 0;
        p.connected = false;
        p.active = false;
        p.move = { x: 0, z: 0 };
        p.cast = null;
        p.channel = null;
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
      resource: guild === "knight" ? 60 : 0,
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
  private say(
    id: string,
    text: string,
    kind: Notice["kind"] = "info",
    speaker?: string,
  ) {
    this.notices.push({ id, notice: { kind, text, speaker } });
  }
  private event(
    type: CombatEvent["type"],
    source: Actor,
    target: Actor,
    key: string,
    amount = 0,
  ) {
    this.events.push({
      id: ++this.counter,
      at: this.now,
      type,
      source: source.id,
      target: target.id,
      key,
      amount,
      x: target.x,
      z: target.z,
    });
  }
  private offence(p: Actor, killer = false) {
    p.red = Math.max(p.red, killer ? 3600 : 600);
    p.killer = p.killer || killer;
  }
  private canHarm(a: Actor, b: Actor): boolean {
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
  private aggression(a: Actor, b: Actor) {
    if (a.kind !== "player") return;
    if (b.kind === "guard") this.offence(a);
    if (b.kind !== "player") return;
    const unlawful = !this.legal(a, b);
    if (unlawful) this.offence(a);
    b.retaliation[a.id] = this.now + 30;
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
    a.combatUntil = b.combatUntil = this.now + 20;
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
          if (p.cast && p.cast.key !== "basic") p.cast = null;
        }
        return true;
      }
      case "ability":
        return this.ability(
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
        p.resource = c.guild === "knight" ? 60 : 0;
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
  private ability(
    p: Actor,
    key: AbilityKey,
    targetId: string,
    aim?: Vec2,
  ): boolean {
    const a = KITS[p.guild].find((x) => x.key === key);
    if (
      !a ||
      (p.stunUntil > this.now && key !== "c") ||
      p.cast ||
      (p.cooldowns[key] ?? 0) > this.now
    )
      return false;
    if (key === "c") {
      p.stunUntil = p.rootUntil = 0;
      p.cooldowns.c = this.now + 45;
      this.event("dodge", p, p, key);
      return true;
    }
    if (key === "space") {
      if (p.evadeCharges <= 0) return false;
      if (p.rootUntil > this.now) return false;
      const dir =
        Math.hypot(p.move.x, p.move.z) > 0.1
          ? p.move
          : { x: Math.sin(p.heading), z: Math.cos(p.heading) };
      Object.assign(p, move(p, dir.x * 3, dir.z * 3));
      p.evadeUntil = this.now + 0.35;
      if (p.evadeCharges === 2) p.evadeRecoverAt = this.now + 7;
      p.evadeCharges--;
      p.cooldowns.space = p.evadeCharges > 0 ? 0 : p.evadeRecoverAt;
      p.channel = null;
      p.safe = isSafe(p);
      this.event("dodge", p, p, key);
      return true;
    }
    const t = this.actors.get(targetId);
    const hostile =
      key === "basic" ||
      key === "1" ||
      key === "2" ||
      (key === "3" && p.guild === "knight");
    if (hostile && (!t || !this.canHarm(p, t))) {
      this.say(
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
      (distance(p, t) > a.range + 0.3 || !lineOfSight(p, t))
    ) {
      this.say(p.id, "Move closer and keep a clear line of sight.", "error");
      return false;
    }
    if (p.guild === "knight" && p.resource < a.cost) {
      this.say(
        p.id,
        "Not enough Resolve. Measured Cut and Brace rebuild it.",
        "error",
      );
      return false;
    }
    if (p.guild === "cyborg" && a.cost > 0 && p.resource + a.cost > 100) {
      this.say(
        p.id,
        "Heat limit. Use Coolant Burst or allow the core to cool.",
        "error",
      );
      return false;
    }
    if (
      p.guild === "knight" &&
      key === "4" &&
      (!t ||
        t.kind !== "player" ||
        t.id === p.id ||
        distance(p, t) > 8 ||
        isSafe(p) !== isSafe(t))
    ) {
      this.say(
        p.id,
        "Select a nearby ally on the same side of the safe boundary.",
        "error",
      );
      return false;
    }
    if (hostile && t) this.aggression(p, t);
    const validAim =
      aim &&
      Number.isFinite(aim.x) &&
      Number.isFinite(aim.z) &&
      Math.abs(aim.x) < 80 &&
      Math.abs(aim.z) < 100
        ? aim
        : (t ?? {
            x: p.x + Math.sin(p.heading) * 6,
            z: p.z + Math.cos(p.heading) * 6,
          });
    if (t) p.heading = Math.atan2(t.x - p.x, t.z - p.z);
    p.cast = {
      key,
      name: a.name,
      start: this.now,
      end: this.now + a.windup,
      target: targetId,
      aim: { x: validAim.x, z: validAim.z },
    };
    p.channel = null;
    this.event("cast", p, t ?? p, key);
    return true;
  }
  private resolve(p: Actor) {
    const c = p.cast;
    if (!c) return;
    p.cast = null;
    const a = KITS[p.guild].find((x) => x.key === c.key)!;
    if (
      (p.guild === "knight" && p.resource < a.cost) ||
      (p.guild === "cyborg" && a.cost > 0 && p.resource + a.cost > 100)
    )
      return;
    p.resource = Math.max(
      0,
      Math.min(100, p.resource + (p.guild === "cyborg" ? a.cost : -a.cost)),
    );
    p.cooldowns[c.key] =
      this.now +
      a.cooldown *
        (c.key === "basic" && p.overclockUntil > this.now ? 0.75 : 1);
    const t = this.actors.get(c.target);
    const power = 40 + 6 * (p.level - 1);
    if (c.key === "q") {
      p.braceUntil = this.now + (p.guild === "knight" ? 0.8 : 1);
      if (p.guild === "knight") p.resource = Math.min(100, p.resource + 8);
      return;
    }
    if (c.key === "r") {
      if (p.guild === "knight") p.oathUntil = this.now + 6;
      else p.overclockUntil = this.now + 6;
      return;
    }
    if (c.key === "5") {
      p.healUntil = this.now + (p.guild === "knight" ? 4 : 5);
      p.healTick = this.now;
      return;
    }
    if (c.key === "4") {
      if (p.guild === "cyborg") {
        for (const other of this.actors.values())
          if (
            other.id !== p.id &&
            distance(p, other) <= 3 &&
            this.canHarm(p, other)
          ) {
            this.aggression(p, other);
            other.slowUntil = this.now + 2;
          }
      } else if (t && distance(p, t) <= 8 && isSafe(p) === isSafe(t)) {
        t.interpose = {
          owner: p.id,
          until: this.now + 3,
          remaining: p.maxHp * 0.2,
        };
        if (t.red > 0 && t.combatUntil > this.now && !isSafe(t))
          this.offence(p);
      }
      return;
    }
    if (c.key === "3") {
      if (p.guild === "cyborg") {
        const d = distance(p, c.aim),
          f = d > 6 ? 6 / d : 1;
        this.mines = this.mines.filter((m) => m.owner !== p.id);
        this.mines.push({
          id: ++this.counter,
          x: p.x + (c.aim.x - p.x) * f,
          z: p.z + (c.aim.z - p.z) * f,
          owner: p.id,
          arm: this.now + 1,
          expires: this.now + 12,
        });
      } else if (t && this.canHarm(p, t)) {
        t.challenge = { owner: p.id, until: this.now + 4 };
        if (t.kind !== "player") t.target = p.id;
      }
      return;
    }
    if (p.guild === "cyborg" && c.key === "1") {
      const dx = c.aim.x - p.x,
        dz = c.aim.z - p.z,
        len = Math.hypot(dx, dz) || 1;
      const targets = [...this.actors.values()]
        .filter((b) => {
          const f = ((b.x - p.x) * dx + (b.z - p.z) * dz) / len;
          const side = Math.abs((b.x - p.x) * dz - (b.z - p.z) * dx) / len;
          return (
            f > 0 &&
            f <= a.range &&
            side < 0.75 &&
            this.canHarm(p, b) &&
            lineOfSight(p, b)
          );
        })
        .sort((a, b) => distance(p, a) - distance(p, b));
      targets.forEach((b, i) => {
        this.aggression(p, b);
        this.hit(p, b, power * a.power * (i ? 0.5 : 1), c.key);
      });
      if (!targets.length) this.event("miss", p, t ?? p, c.key);
      return;
    }
    if (p.guild === "cyborg" && ["basic", "2"].includes(c.key) && t) {
      const dx = t.x - p.x,
        dz = t.z - p.z,
        len = Math.hypot(dx, dz) || 1;
      this.projectiles.push({
        id: ++this.counter,
        owner: p.id,
        key: c.key,
        x: p.x,
        z: p.z,
        dx: dx / len,
        dz: dz / len,
        travelled: 0,
        range: a.range,
        damage: power * a.power,
      });
      return;
    }
    if (
      t &&
      distance(p, t) <= a.range + 0.4 &&
      lineOfSight(p, t) &&
      this.canHarm(p, t)
    ) {
      this.hit(p, t, power * a.power, c.key);
      if (c.key === "1" && p.guild === "knight") t.sunderUntil = this.now + 5;
      if (c.key === "2" && t.life === "alive" && t.evadeUntil <= this.now) {
        t.cast = null;
        if (p.guild === "knight") t.stunUntil = this.now + 0.7;
        else t.rootUntil = this.now + 1;
      }
      if (c.key === "basic" && p.guild === "knight")
        p.resource = Math.min(100, p.resource + 10);
    } else this.event("miss", p, t ?? p, c.key);
  }
  private hit(
    a: Actor,
    b: Actor,
    amount: number,
    key: string,
    redirected = false,
  ) {
    if (!this.canHarm(a, b)) return;
    if (b.evadeUntil > this.now) {
      this.event("miss", a, b, key);
      return;
    }
    let damage =
      amount *
      (a.overclockUntil > this.now ? 1.15 : 1) *
      (b.sunderUntil > this.now ? 1.15 : 1);
    if (
      a.challenge &&
      a.challenge.until > this.now &&
      a.challenge.owner !== b.id
    )
      damage *= 0.85;
    if (b.braceUntil > this.now) {
      const facing = Math.cos(b.heading - Math.atan2(a.x - b.x, a.z - b.z));
      if (b.guild === "cyborg" || facing > 0.2) {
        damage *= b.guild === "knight" ? 0.4 : 0.55;
        if (b.oathUntil > this.now) this.heal(b, b, 25);
      }
    }
    if (!redirected && b.interpose && b.interpose.until > this.now) {
      const guard = this.actors.get(b.interpose.owner);
      if (guard && guard.life === "alive" && this.canHarm(a, guard)) {
        const share = Math.min(damage * 0.3, b.interpose.remaining);
        damage -= share;
        b.interpose.remaining -= share;
        this.hit(a, guard, share, key, true);
      }
    }
    damage = Math.max(1, Math.round(damage));
    const record = b.damage[a.id] ?? {
      amount: 0,
      first: this.now,
      last: this.now,
      unlawful: false,
    };
    record.amount += Math.min(damage, b.hp);
    record.last = this.now;
    b.damage[a.id] = record;
    a.combatUntil = b.combatUntil = this.now + 20;
    b.channel = null;
    b.healUntil = 0;
    if (a.kind === "player" && b.kind === "player")
      b.retaliation[a.id] = this.now + 30;
    b.hp = Math.max(0, b.hp - damage);
    this.event("hit", a, b, key, damage);
    if (b.hp === 0) {
      if (
        b.kind === "player" &&
        b.life === "alive" &&
        b.downedLock <= this.now
      ) {
        b.life = "downed";
        b.downedUntil = this.now + 10;
        b.downedLock = this.now + 60;
        b.cast = null;
        b.move = { x: 0, z: 0 };
      } else this.die(b, a);
    }
  }
  private heal(source: Actor, target: Actor, n: number) {
    if (target.life !== "alive") return;
    const amount = Math.min(target.maxHp - target.hp, Math.round(n));
    if (amount > 0) {
      target.hp += amount;
      this.event("heal", source, target, "heal", amount);
    }
  }
  private die(p: Actor, last?: Actor) {
    if (p.life === "dead") return;
    p.life = "dead";
    p.hp = 0;
    p.cast = null;
    p.channel = null;
    p.move = { x: 0, z: 0 };
    this.event("death", last ?? p, p, "death");
    if (p.kind !== "player") {
      p.respawnAt = this.now + (p.kind === "guard" ? 60 : 35);
      if (p.kind === "guard" && last?.kind === "player")
        this.offence(last, true);
      if (p.kind === "wolf")
        for (const [id, r] of Object.entries(p.damage)) {
          const winner = this.actors.get(id);
          if (
            winner &&
            winner.kind === "player" &&
            r.amount >= p.maxHp * 0.05 &&
            this.now - r.last < 20
          ) {
            this.awardExperience(winner, 65);
            winner.marks += 6;
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
    p.resource = p.guild === "knight" ? 60 : 0;
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
    this.event("loot", p, p, "loot");
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
        "Thirteen cuts in the stone. Twelve for the bells we hear. The last for the hour that was taken. You copy the marks into your journal.",
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
          "The bell rang thirteen times last night. Past the bridge, a stone remembers why. Copy its marks for me. Beyond the gate, other travellers can attack you. Keep a way home.",
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
          "The thirteenth mark… someone has stolen an hour. Hollow Abbey holds the next verse. For now, take this. You have earned it. +40 marks · +220 XP · Hourglass charm.",
          "dialogue",
          "Mara",
        );
      } else
        this.say(
          p.id,
          p.quest === "complete"
            ? "The Abbey awaits in the next expedition. Keep the copied verse safe."
            : "Follow the Briar road across the bridge. The inscribed stone stands beside the ruined arch.",
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
      if (p.evadeCharges < 2 && p.evadeRecoverAt <= this.now) {
        p.evadeCharges++;
        p.evadeRecoverAt = p.evadeCharges < 2 ? this.now + 7 : 0;
        p.cooldowns.space = 0;
      }

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
      if (
        p.moveUntil > this.now &&
        p.rootUntil <= this.now &&
        p.stunUntil <= this.now &&
        p.braceUntil <= this.now
      ) {
        const speed = 4.5 * (p.slowUntil > this.now ? 0.7 : 1);
        Object.assign(p, move(p, p.move.x * speed * dt, p.move.z * speed * dt));
        if (Math.hypot(p.move.x, p.move.z) > 0.1)
          p.heading = Math.atan2(p.move.x, p.move.z);
      }
      const safe = isSafe(p);
      if (safe && !p.safe) {
        p.rootUntil = p.stunUntil = p.slowUntil = 0;
      }
      p.safe = safe;
      if (p.cast && p.cast.end <= this.now) {
        if (p.kind === "player") this.resolve(p);
        else {
          const target = this.actors.get(p.cast.target);
          p.cast = null;
          if (target && distance(p, target) < 2.8)
            this.hit(p, target, p.kind === "guard" ? 150 : 30, "basic");
        }
      }
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
            target.stunUntil = target.rootUntil = 0;
            p.channel = null;
            this.event("heal", p, target, "revive", target.hp);
            this.say(target.id, `${p.name} helped you to your feet.`);
          }
        } else if (p.channel.end <= this.now) this.finishClaim(p);
      }
      if (p.guild === "cyborg" && p.kind === "player") {
        p.resource = Math.max(0, p.resource - dt * 5);
        if (p.overclockUntil > this.now) {
          p.resource = Math.min(100, p.resource + dt * 8);
          if (p.resource >= 100) p.overclockUntil = 0;
        }
      }
      if (p.healUntil > this.now && p.healTick <= this.now) {
        p.healTick = this.now + 1;
        this.heal(
          p,
          p,
          (40 + 6 * (p.level - 1)) *
            (p.guild === "knight" ? 0.25 : 0.3) *
            (p.combatUntil > this.now ? 0.75 : 1),
        );
      }
      if (p.kind === "player" && p.combatUntil <= this.now) {
        p.hp = Math.min(p.maxHp, p.hp + dt * 12);
        if (p.guild === "knight")
          p.resource = Math.min(60, p.resource + dt * 4);
      }
      p.guarding = p.braceUntil > this.now;
      p.dodging = p.evadeUntil > this.now;
      p.stunned = p.stunUntil > this.now || p.rootUntil > this.now;
      p.healing = p.healUntil > this.now;
    }
    for (const shot of this.projectiles) {
      const owner = this.actors.get(shot.owner);
      if (!owner || !owner.active) {
        shot.travelled = shot.range;
        continue;
      }
      const length = Math.min(shot.range - shot.travelled, dt * 18);
      const origin = { x: shot.x, z: shot.z };
      shot.x += shot.dx * length;
      shot.z += shot.dz * length;
      shot.travelled += length;
      if (!lineOfSight(origin, shot)) {
        shot.travelled = shot.range;
        continue;
      }
      const hit = [...this.actors.values()]
        .filter((t) => {
          if (!this.canHarm(owner, t)) return false;
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
            ) < 0.48
          );
        })
        .sort((a, b) => distance(origin, a) - distance(origin, b))[0];
      if (hit) {
        this.aggression(owner, hit);
        this.hit(owner, hit, shot.damage, shot.key);
        if (
          shot.key === "2" &&
          hit.evadeUntil <= this.now &&
          hit.life === "alive"
        )
          hit.rootUntil = this.now + 1;
        shot.travelled = shot.range;
      }
    }
    this.projectiles = this.projectiles.filter((s) => s.travelled < s.range);
    for (const m of this.mines) {
      if (m.arm > this.now || m.expires <= this.now) continue;
      const owner = this.actors.get(m.owner);
      if (!owner || owner.life !== "alive") continue;
      const targets = [...this.actors.values()].filter(
        (t) => distance(m, t) <= 2 && this.canHarm(owner, t),
      );
      if (targets.length) {
        for (const t of targets) {
          this.aggression(owner, t);
          this.hit(owner, t, 51, "3");
          t.slowUntil = this.now + 2;
        }
        m.expires = 0;
      }
    }
    this.mines = this.mines.filter((m) => m.expires > this.now);
    for (const c of this.corpses.values())
      if (c.expires <= this.now) this.release(c);
  }
  private ai(p: Actor, dt: number) {
    if (p.stunUntil > this.now || p.rootUntil > this.now || p.cast) return;
    const limit = p.kind === "guard" ? 20 : 8;
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
    if (target && distance(p, p.home) < (p.kind === "guard" ? 40 : 14)) {
      p.target = target.id;
      const d = distance(p, target);
      p.heading = Math.atan2(target.x - p.x, target.z - p.z);
      if (d > 1.9) {
        const speed = p.kind === "guard" ? 4.8 : 3.8;
        const proposed = move(
          p,
          ((target.x - p.x) / d) * speed * dt,
          ((target.z - p.z) / d) * speed * dt,
        );
        if (!this.inRefuge(proposed)) Object.assign(p, proposed);
      } else if ((p.cooldowns.basic ?? 0) <= this.now) {
        p.cooldowns.basic = this.now + (p.kind === "guard" ? 1.7 : 2.2);
        p.cast = {
          key: "basic",
          name: p.kind === "guard" ? "Concord strike" : "Rending bite",
          start: this.now,
          end: this.now + 0.8,
          target: target.id,
          aim: { x: target.x, z: target.z },
        };
        this.event("cast", p, target, "basic");
      }
    } else {
      p.target = null;
      const d = distance(p, p.home);
      if (d > 0.2)
        Object.assign(
          p,
          move(
            p,
            ((p.home.x - p.x) / d) * dt * 2,
            ((p.home.z - p.z) / d) * dt * 2,
          ),
        );
      if (d < 0.5 && p.combatUntil <= this.now) p.hp = p.maxHp;
    }
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
      this.event("level", p, p, "level");
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
          controlRemaining: Math.max(
            0,
            a.stunUntil - this.now,
            a.rootUntil - this.now,
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
