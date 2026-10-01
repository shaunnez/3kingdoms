import {
  Color3,
  Color4,
  Constants,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  ParticleSystem,
  Scene,
  StandardMaterial,
  Vector3,
} from "@babylonjs/core";
import {
  distance,
  type ActorView,
  type CombatEvent,
  type Snapshot,
} from "../../../packages/contracts/game";

type Fleeting = {
  mesh: Mesh;
  start: number;
  duration: number;
  animate?: (phase: number) => void;
};
const GOLD = "#edc47f",
  PALE = "#e9e8ce",
  CYAN = "#80dce9";

/** Local presentation only. Resolve/hit events and status snapshots are server-owned. */
export class CombatEffects {
  private time = 0;
  private materials = new Map<string, StandardMaterial>();
  private fleeting: Fleeting[] = [];
  private bursts: { system: ParticleSystem; end: number }[] = [];
  private statuses = new Map<string, Mesh>();
  private texture: DynamicTexture;
  low = false;
  constructor(
    private scene: Scene,
    private position: (id: string) => Vector3 | undefined,
  ) {
    this.texture = new DynamicTexture("combat-soft-spark", 64, scene, false);
    const context = this.texture.getContext();
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 30);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.2, "rgba(255,255,255,.9)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    this.texture.hasAlpha = true;
    this.texture.update();
  }
  private material(color: string) {
    let m = this.materials.get(color);
    if (!m) {
      m = new StandardMaterial(`combat-${color}`, this.scene);
      m.diffuseColor = Color3.FromHexString(color);
      m.emissiveColor = m.diffuseColor.scale(2.4);
      m.disableLighting = true;
      m.backFaceCulling = false;
      m.alphaMode = Constants.ALPHA_ADD;
      m.disableDepthWrite = true;
      this.materials.set(color, m);
    }
    return m;
  }
  private at(a: ActorView, height = 0) {
    return (this.position(a.id)?.clone() ?? new Vector3(a.x, 0, a.z)).add(
      new Vector3(0, height, 0),
    );
  }
  private finish(mesh: Mesh, color: string) {
    mesh.material = this.material(color);
    mesh.isPickable = false;
    return mesh;
  }
  private transient(
    mesh: Mesh,
    duration: number,
    animate?: Fleeting["animate"],
  ) {
    if (this.fleeting.length >= 96) this.fleeting.shift()!.mesh.dispose();
    this.fleeting.push({ mesh, start: this.time, duration, animate });
    return mesh;
  }
  private tube(name: string, points: Vector3[], radius: number, color: string) {
    return this.finish(
      MeshBuilder.CreateTube(
        name,
        { path: points, radius, tessellation: 5 },
        this.scene,
      ),
      color,
    );
  }
  private circle(radius: number, color: string) {
    return this.tube(
      "oath-circle",
      Array.from(
        { length: 49 },
        (_, i) =>
          new Vector3(
            Math.cos((i / 48) * Math.PI * 2) * radius,
            0,
            Math.sin((i / 48) * Math.PI * 2) * radius,
          ),
      ),
      0.023,
      color,
    );
  }
  private shield(color: string) {
    return this.tube(
      "shield-sigil",
      [
        [-0.3, 0.33],
        [0.3, 0.33],
        [0.29, -0.04],
        [0.16, -0.28],
        [0, -0.4],
        [-0.16, -0.28],
        [-0.29, -0.04],
        [-0.3, 0.33],
      ].map(([x, y]) => new Vector3(x, y, 0)),
      0.032,
      color,
    );
  }
  private pulse(pos: Vector3, radius: number, color: string, duration = 0.5) {
    const mesh = this.circle(radius, color);
    mesh.position.copyFrom(pos);
    this.transient(mesh, duration, (t) => mesh.scaling.setAll(0.65 + t * 0.6));
  }
  private sparks(pos: Vector3, color: string, count: number, lift = false) {
    if (this.bursts.length >= (this.low ? 4 : 12)) return;
    const ps = new ParticleSystem(
      "contact-sparks",
      this.low ? 12 : 40,
      this.scene,
    );
    ps.particleTexture = this.texture;
    ps.emitter = pos;
    ps.minEmitBox = new Vector3(-0.12, 0, -0.12);
    ps.maxEmitBox = new Vector3(0.12, 0.15, 0.12);
    ps.direction1 = new Vector3(-1, lift ? 0.7 : 0.4, -1);
    ps.direction2 = new Vector3(1, 2, 1);
    ps.color1 = Color4.FromColor3(Color3.FromHexString(color), 1);
    ps.color2 = Color4.FromColor3(Color3.FromHexString(PALE), 0.9);
    ps.colorDead = new Color4(0.3, 0.19, 0.06, 0);
    ps.minSize = lift ? 0.035 : 0.025;
    ps.maxSize = lift ? 0.08 : 0.055;
    ps.minLifeTime = 0.18;
    ps.maxLifeTime = lift ? 0.85 : 0.42;
    ps.minEmitPower = lift ? 0.2 : 0.9;
    ps.maxEmitPower = lift ? 0.7 : 3;
    ps.gravity = new Vector3(0, lift ? 0.2 : -5, 0);
    ps.updateSpeed = 0.012;
    ps.emitRate = 0;
    ps.manualEmitCount = this.low ? Math.min(8, count) : count;
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.start();
    this.bursts.push({ system: ps, end: this.time + 1.6 });
  }
  private slash(a: ActorView, heavy: boolean) {
    const outer: Vector3[] = [],
      inner: Vector3[] = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24,
        angle = (t - 0.5) * 2.35;
      const width = Math.sin(t * Math.PI) * (heavy ? 0.21 : 0.14);
      if (heavy) {
        const sweep = 0.25 + t * 2.0;
        outer.push(
          new Vector3(
            -0.12,
            1.12 + Math.cos(sweep) * 1.08,
            0.24 + Math.sin(sweep) * 1.2,
          ),
        );
        inner.push(
          new Vector3(
            -0.12 - width,
            1.12 + Math.cos(sweep) * (0.98 - width),
            0.24 + Math.sin(sweep) * (1.12 - width),
          ),
        );
      } else {
        const r = 1.15;
        outer.push(
          new Vector3(
            Math.sin(angle) * r,
            1.0 - t * 0.3,
            0.3 + Math.cos(angle) * r,
          ),
        );
        inner.push(
          new Vector3(
            Math.sin(angle) * (r - width),
            1.0 - t * 0.3,
            0.3 + Math.cos(angle) * (r - width),
          ),
        );
      }
    }
    const mesh = this.finish(
      MeshBuilder.CreateRibbon(
        heavy ? "sunder-edge" : "measured-cut-edge",
        { pathArray: [outer, inner], sideOrientation: Mesh.DOUBLESIDE },
        this.scene,
      ),
      heavy ? GOLD : PALE,
    );
    mesh.position.copyFrom(this.at(a));
    mesh.rotation.y = a.heading;
    this.transient(mesh, heavy ? 0.28 : 0.2, (t) => {
      mesh.rotation.y = a.heading + (heavy ? 0 : t * 0.2);
    });
    if (heavy) {
      this.pulse(
        this.at(a, 0.06).add(
          new Vector3(
            Math.sin(a.heading) * 1.25,
            0,
            Math.cos(a.heading) * 1.25,
          ),
        ),
        0.5,
        GOLD,
        0.32,
      );
      this.sparks(
        this.at(a, 0.65).add(
          new Vector3(Math.sin(a.heading) * 1.2, 0, Math.cos(a.heading) * 1.2),
        ),
        GOLD,
        18,
      );
    }
  }
  event(e: CombatEvent, s: Snapshot) {
    const a = s.actors.find((a) => a.id === e.source),
      target = s.actors.find((a) => a.id === e.target),
      me = s.actors.find((a) => a.id === s.self.id);
    if (
      !a ||
      !me ||
      (distance(a, me) > 27 && (!target || distance(target, me) > 27))
    )
      return;
    const impact = target
      ? this.at(target, target.kind === "wolf" ? 0.65 : 1.15)
      : new Vector3(e.x, 0.8, e.z);
    if (e.type === "resolve") {
      if (a.kind === "wolf") return;
      if (a.guild === "knight") {
        if (e.key === "basic" || e.key === "1") this.slash(a, e.key === "1");
        else if (e.key === "2") {
          const m = this.shield(GOLD);
          m.position.copyFrom(
            this.at(a, 1.15).add(
              new Vector3(
                Math.sin(a.heading) * 0.8,
                0,
                Math.cos(a.heading) * 0.8,
              ),
            ),
          );
          m.rotation.y = a.heading;
          this.transient(m, 0.3, (t) => m.scaling.setAll(0.8 + t * 0.65));
        } else if (e.key === "3" && target) {
          this.pulse(this.at(target, 0.055), 0.6, GOLD, 0.65);
          const m = this.tube(
            "challenge-mark",
            [
              new Vector3(-0.18, 0.15, 0),
              new Vector3(0, 0, 0),
              new Vector3(0.18, 0.15, 0),
            ],
            0.018,
            GOLD,
          );
          m.position.copyFrom(this.at(target, 2.0));
          this.transient(m, 0.7);
        } else if (e.key === "4" && target) {
          const start = this.at(a, 1),
            end = this.at(target, 1);
          const m = this.tube(
            "interpose-link",
            [
              start,
              Vector3.Lerp(start, end, 0.5).add(new Vector3(0, 0.3, 0)),
              end,
            ],
            0.016,
            GOLD,
          );
          this.transient(m, 0.5);
          this.sparks(end, GOLD, 10, true);
        } else if (e.key === "5" || e.key === "r") {
          this.pulse(this.at(a, 0.06), e.key === "r" ? 1.05 : 0.8, GOLD, 0.8);
          this.sparks(this.at(a, 0.3), GOLD, e.key === "r" ? 30 : 16, true);
        }
      } else if (e.key === "1") {
        const end = e.aim ?? target ?? a,
          dir = new Vector3(end.x - a.x, 0, end.z - a.z).normalize();
        const start = this.at(a, 1.18),
          finish = start.add(dir.scale(16));
        const beam = this.tube("pulse-lance", [start, finish], 0.045, CYAN);
        this.transient(beam, 0.22);
        this.sparks(start, CYAN, 16);
      } else if (e.key === "4") {
        this.pulse(this.at(a, 0.13), 2.6, CYAN, 0.65);
        this.sparks(this.at(a, 0.4), CYAN, 24, true);
      } else if (e.key === "r") this.pulse(this.at(a, 0.08), 1, CYAN, 0.6);
    } else if (e.type === "hit") {
      this.sparks(
        impact,
        e.blocked
          ? GOLD
          : a.guild === "cyborg" && a.kind === "player"
            ? CYAN
            : PALE,
        e.blocked ? 20 : e.key === "1" ? 18 : 10,
      );
      if (e.blocked && target) {
        const m = this.shield(GOLD);
        m.position.copyFrom(impact);
        m.rotation.y = target.heading;
        this.transient(m, 0.22, (t) => m.scaling.setAll(0.8 + t * 0.25));
      } else if (a.kind === "wolf") {
        for (const side of [-1, 1]) {
          const m = this.tube(
            "bite-contact",
            [
              new Vector3(side * 0.13, 0.2, 0),
              new Vector3(side * 0.08, 0, 0.07),
              new Vector3(side * 0.13, -0.12, 0),
            ],
            0.016,
            "#bd856c",
          );
          m.position.copyFrom(impact);
          m.rotation.y = a.heading;
          this.transient(m, 0.2);
        }
      }
    } else if (e.type === "dodge") {
      this.sparks(this.at(a, 0.12), e.key === "c" ? GOLD : "#94adb3", 8);
    } else if (e.type === "heal") this.sparks(impact, "#b7d4a5", 5, true);
    else if (e.type === "loot" || e.type === "level") {
      this.pulse(this.at(a, 0.08), 0.6, GOLD, 0.8);
      this.sparks(this.at(a, 0.2), GOLD, 18, true);
    }
  }
  update(dt: number, s: Snapshot) {
    this.time += dt;
    for (let i = this.fleeting.length - 1; i >= 0; i--) {
      const fx = this.fleeting[i],
        t = (this.time - fx.start) / fx.duration;
      if (t >= 1) {
        fx.mesh.dispose();
        this.fleeting.splice(i, 1);
        continue;
      }
      fx.mesh.visibility = (1 - t) ** 1.3;
      fx.animate?.(t);
    }
    for (let i = this.bursts.length - 1; i >= 0; i--)
      if (this.time >= this.bursts[i].end) {
        this.bursts[i].system.dispose(false);
        this.bursts.splice(i, 1);
      }
    const active = new Set<string>(),
      me = s.actors.find((a) => a.id === s.self.id);
    const show = (id: string, create: () => Mesh, pos: Vector3) => {
      active.add(id);
      let mesh = this.statuses.get(id);
      if (!mesh) {
        mesh = create();
        this.statuses.set(id, mesh);
      }
      mesh.position.copyFrom(pos);
      return mesh;
    };
    for (const a of s.actors) {
      if (a.life !== "alive" || !me || distance(a, me) > 27) continue;
      if (a.guarding || a.protectedBy) {
        const m = show(
          `guard-${a.id}`,
          () => this.shield(a.guild === "knight" ? GOLD : CYAN),
          this.at(a, 1.3).add(
            new Vector3(
              Math.sin(a.heading) * 0.62,
              0,
              Math.cos(a.heading) * 0.62,
            ),
          ),
        );
        m.rotation.y = a.heading;
        m.visibility = 0.82;
      }
      if (a.oath) {
        const m = show(
          `oath-${a.id}`,
          () => this.circle(0.88, GOLD),
          this.at(a, 0.045),
        );
        m.visibility = 0.6 + Math.sin(this.time * 2) * 0.1;
        const crest = show(
          `oath-crest-${a.id}`,
          () => this.shield(GOLD),
          this.at(a, 2.8),
        );
        crest.scaling.setAll(0.7);
        crest.billboardMode = Mesh.BILLBOARDMODE_Y;
        crest.visibility = 0.88;
      }
      if (a.healing && a.guild === "knight") {
        const m = show(
          `rally-${a.id}`,
          () => this.circle(0.82, GOLD),
          this.at(a, 0.06),
        );
        m.visibility = 0.5 + Math.sin(this.time * 2) * 0.12;
        const inner = show(
          `rally-inner-${a.id}`,
          () => this.circle(0.6, "#b7d4a5"),
          this.at(a, 0.065),
        );
        inner.visibility = 0.35;
      }
    }
    for (const [id, m] of this.statuses)
      if (!active.has(id)) {
        m.dispose();
        this.statuses.delete(id);
      }
  }
  metrics() {
    return {
      meshes: this.fleeting.length + this.statuses.size,
      burstSystems: this.bursts.length,
      particles: this.bursts.reduce((n, b) => n + b.system.getActiveCount(), 0),
    };
  }
  dispose() {
    this.fleeting.forEach((e) => e.mesh.dispose());
    this.statuses.forEach((m) => m.dispose());
    this.bursts.forEach((b) => b.system.dispose(false));
    this.texture.dispose();
    this.materials.forEach((m) => m.dispose());
  }
}
