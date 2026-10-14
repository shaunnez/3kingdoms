/**
 * Mesh-based ambient landmarks: the Highcross astrolabe, the safe-line
 * curtain, the refuge's golden ring and the quest beacon. Particle layers that
 * accompany them are driven by ambient.ts.
 */
import {
  Color3,
  Matrix,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  TransformNode,
  Vector3,
  type AbstractMesh,
  type Scene,
  type Texture,
} from "@babylonjs/core";
import { fxTexture } from "./textures";
import {
  Owned,
  RibbonTrails,
  additiveMaterial,
  beamMask,
  dayNightBlend,
  veilMesh,
  diamondModel,
  glowMaterial,
  orbModel,
  ringModel,
  streakTexture,
  toyMaterial,
} from "./ambient-meshes";
import { hexRgb, smoothstep } from "./ambient-particles";

const REALMS = ["#7dff8a", "#5ef2ff", "#ff6bd6"] as const;
/** Orbit tilt (pitch) and yaw per realm mote. */
const MOTE_ORBITS: [number, number][] = [
  [0.5, 0.2],
  [-0.35, 2.3],
  [0.9, 4.2],
];

function color(hex: string, scale = 1): Color3 {
  const [r, g, b] = hexRgb(hex);
  return new Color3(r * scale, g * scale, b * scale);
}

/** A Y-billboard quad standing on its bottom edge. */
function beamQuad(
  scene: Scene,
  name: string,
  width: number,
  height: number,
): Mesh {
  const m = MeshBuilder.CreatePlane(name, { width, height }, scene);
  m.bakeTransformIntoVertices(Matrix.Translation(0, height / 2, 0));
  m.billboardMode = Mesh.BILLBOARDMODE_Y;
  m.isPickable = false;
  return m;
}

// ───────────────────────────── astrolabe ─────────────────────────────

type Ring = { pivot: TransformNode; mesh: Mesh; spin: number; precess: number };

export class Astrolabe {
  private root: TransformNode;
  private rings: Ring[] = [];
  private orb: Mesh;
  private halo: Mesh;
  private haloMat: StandardMaterial;
  private motes: Mesh[] = [];
  private trails: RibbonTrails;
  private shaft: Mesh;
  private shaftMat: StandardMaterial;
  private shaftStreaks: Texture;
  private heads = [new Vector3(), new Vector3(), new Vector3()];
  private orbit = new Matrix();
  private local = new Vector3();
  private ringMat: StandardMaterial;

  constructor(
    scene: Scene,
    owned: Owned,
    glow: (m: AbstractMesh) => void,
    readonly x: number,
    readonly y: number,
    readonly z: number,
  ) {
    this.root = owned.node(new TransformNode("astrolabe-root", scene));
    this.root.position.set(x, y, z);

    this.ringMat = owned.material(
      toyMaterial(scene, "astrolabe-gold", 0.16, color("#ffd45e")),
    );
    this.ringMat.specularColor = new Color3(0.35, 0.3, 0.2);
    this.ringMat.specularPower = 24;
    const specs: [number, string, number, number, number, number][] = [
      // radius, gem, tilt x, tilt z, spin, precession
      [1.45, REALMS[0], 0.38, 0.12, 0.32, 0.07],
      [1.12, REALMS[1], 1.05, -0.35, -0.55, -0.11],
      [0.8, REALMS[2], 0.45, 1.15, 0.9, 0.16],
    ];
    specs.forEach(([radius, gem, tx, tz, spin, precess], i) => {
      const pivot = owned.node(new TransformNode(`astrolabe-tilt${i}`, scene));
      pivot.parent = this.root;
      pivot.rotation.set(tx, i * 2.1, tz);
      const mesh = owned.mesh(
        ringModel(scene, `astrolabe-ring${i}`, radius, gem, 24),
      );
      mesh.parent = pivot;
      mesh.material = this.ringMat;
      mesh.isPickable = false;
      this.rings.push({ pivot, mesh, spin, precess });
    });

    this.orb = owned.mesh(orbModel(scene, "astrolabe-orb"));
    this.orb.parent = this.root;
    this.orb.material = owned.material(
      glowMaterial(scene, "astrolabe-orb", new Color3(0.62, 0.95, 1)),
    );
    this.orb.isPickable = false;
    glow(this.orb);

    this.halo = owned.mesh(
      MeshBuilder.CreatePlane("astrolabe-halo", { size: 1.6 }, scene),
    );
    this.halo.parent = this.root;
    this.halo.billboardMode = Mesh.BILLBOARDMODE_ALL;
    this.halo.isPickable = false;
    this.haloMat = owned.material(
      additiveMaterial(
        scene,
        "astrolabe-halo",
        color("#5ef2ff"),
        null,
        fxTexture(scene, "soft"),
        0.35,
      ),
    );
    this.halo.material = this.haloMat;

    REALMS.forEach((hex, i) => {
      const mote = owned.mesh(
        MeshBuilder.CreateBox(`astrolabe-mote${i}`, { size: 0.22 }, scene),
      );
      mote.material = owned.material(
        glowMaterial(scene, `astrolabe-mote${i}`, color(hex)),
      );
      mote.isPickable = false;
      glow(mote);
      this.motes.push(mote);
    });
    const trailMat = owned.material(
      additiveMaterial(scene, "astrolabe-trail", Color3.White(), null, null, 1),
    );
    this.trails = new RibbonTrails(
      scene,
      "astrolabe-trails",
      REALMS.map((h) => hexRgb(h)),
      22,
      0.2,
      trailMat,
    );
    owned.mesh(this.trails.mesh);

    // Soft light shaft rising from the orb.
    this.shaft = owned.mesh(beamQuad(scene, "astrolabe-shaft", 1.25, 6.5));
    this.shaft.position.set(x, y + 0.15, z);
    this.shaftStreaks = owned.texture(
      streakTexture(scene, "astrolabe-shaft-streaks", 11, 5, 2, 0.4),
    );
    this.shaftStreaks.vScale = 1.5;
    this.shaftMat = owned.material(
      additiveMaterial(
        scene,
        "astrolabe-shaft",
        color("#bff8ff"),
        this.shaftStreaks,
        owned.texture(beamMask(scene, "astrolabe-shaft-mask", 1.8)),
        0.3,
      ),
    );
    this.shaft.material = this.shaftMat;
  }

  /** Realm motes on tilted, slowly precessing orbits around the orb. */
  private motePosition(i: number, time: number, out: Vector3): void {
    const [tilt, yaw] = MOTE_ORBITS[i];
    const a = time * (1.05 + 0.22 * i) + (i * Math.PI * 2) / 3;
    const r = 1.85 + 0.12 * Math.sin(time * 0.9 + i);
    this.local.set(Math.cos(a) * r, 0.1 * Math.sin(a * 2), Math.sin(a) * r);
    Matrix.RotationYawPitchRollToRef(yaw + time * 0.05, tilt, 0, this.orbit);
    Vector3.TransformCoordinatesToRef(this.local, this.orbit, out);
    out.x += this.x;
    out.y += this.y + Math.sin(time * 1.4) * 0.06;
    out.z += this.z;
  }

  update(dt: number, time: number, eye: Vector3, night: number): void {
    // Rings catch the orb's light at night.
    this.ringMat.emissiveColor.set(1, 0.83, 0.37);
    this.ringMat.emissiveColor.scaleInPlace(0.16 + 0.34 * night);
    for (const ring of this.rings) {
      ring.mesh.rotation.y += ring.spin * dt;
      ring.pivot.rotation.y += ring.precess * dt;
    }
    const bob = Math.sin(time * 1.4) * 0.06;
    this.orb.position.y = bob;
    this.orb.rotation.y += 0.5 * dt;
    this.orb.rotation.x = Math.sin(time * 0.4) * 0.3;
    const pulse = 0.5 + 0.5 * Math.sin(time * 2.2);
    this.halo.position.y = bob;
    this.halo.scaling.setAll(0.9 + 0.15 * pulse);
    this.haloMat.alpha = (0.26 + 0.12 * pulse) * (0.85 + 0.3 * night);

    for (let i = 0; i < this.motes.length; i++) {
      this.motePosition(i, time, this.heads[i]);
      const mote = this.motes[i];
      mote.position.copyFrom(this.heads[i]);
      mote.rotation.set(time * 1.7 + i, time * 2.3, 0.6);
    }
    this.trails.update(
      (i, k, out) => this.motePosition(i, time - k * 0.035, out),
      eye,
      1,
    );

    dayNightBlend(this.haloMat, night);
    dayNightBlend(this.shaftMat, night);
    this.shaftStreaks.vOffset -= dt * 0.18;
    this.shaftMat.alpha =
      (0.2 + 0.05 * Math.sin(time * 0.9)) * (0.85 + 0.5 * night);
  }
}

// ───────────────────────────── safe line & refuge ─────────────────────────────

type VeilLayer = {
  mesh: Mesh;
  mat: StandardMaterial;
  tex: Texture;
  du: number;
  dv: number;
  base: number;
};

/**
 * Two overlapping light veils on a ground path with scrolling, alpha-banded
 * streaks: additive by night, a translucent tint by day so it reads on pale
 * paving. Used for the safe-town edge and the refuge circle.
 */
export class Veil {
  private layers: VeilLayer[] = [];
  private nightTint: Color3;
  private dayTint: Color3;
  constructor(
    scene: Scene,
    owned: Owned,
    name: string,
    path: readonly [number, number][],
    ground: number,
    rows: readonly [number, number][],
    hex: string,
    /** Deeper colour used by day, when the veil is a tint rather than light. */
    dayHex: string,
    alpha: number,
    closed: boolean,
  ) {
    const tint = color(hex);
    this.nightTint = tint;
    this.dayTint = color(dayHex);
    const configs: [number, number, number, number, number, number][] = [
      // seed, columns, waves, du, dv, alpha share
      [3, 7, 0, 0.16, 0, 1],
      [8, 5, 1, -0.1, 0.12, 0.65],
    ];
    configs.forEach(([seed, columns, waves, du, dv, share], i) => {
      const mesh = owned.mesh(
        veilMesh(
          scene,
          `${name}${i}`,
          path,
          ground,
          rows,
          4 + i * 1.5,
          1.6,
          closed,
        ),
      );
      const tex = owned.texture(
        streakTexture(
          scene,
          `${name}-streaks${i}`,
          seed,
          columns,
          waves,
          0.22,
          true,
        ),
      );
      const mat = owned.material(
        additiveMaterial(scene, `${name}${i}`, tint, null, tex, alpha * share),
      );
      mesh.material = mat;
      this.layers.push({ mesh, mat, tex, du, dv, base: alpha * share });
    });
  }
  update(dt: number, time: number, night: number, visible: boolean): void {
    for (const [i, l] of this.layers.entries()) {
      l.mesh.setEnabled(visible);
      if (!visible) continue;
      l.tex.uOffset += l.du * dt;
      l.tex.vOffset -= l.dv * dt;
      dayNightBlend(l.mat, night);
      const lit = night >= 0.5;
      l.mat.emissiveColor.copyFrom(lit ? this.nightTint : this.dayTint);
      const breathe = 0.88 + 0.12 * Math.sin(time * 1.3 + i * 2);
      // A tint over pale paving needs more opacity than light at night.
      l.mat.alpha = l.base * breathe * (lit ? 0.85 : 1.5);
    }
  }
}

/** Straight path from (x0, z) to (x1, z) sampled every metre. */
export function linePath(
  x0: number,
  x1: number,
  z: number,
): [number, number][] {
  const out: [number, number][] = [];
  const n = Math.max(1, Math.round(x1 - x0));
  for (let i = 0; i <= n; i++) out.push([x0 + ((x1 - x0) * i) / n, z]);
  return out;
}

/** Closed circle path. */
export function circlePath(
  x: number,
  z: number,
  r: number,
  segments = 64,
): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    out.push([x + Math.cos(a) * r, z + Math.sin(a) * r]);
  }
  return out;
}

// ───────────────────────────── quest beacon ─────────────────────────────

export class QuestBeacon {
  /** Smoothed ground position of the beacon; read by its particle layers. */
  readonly position = new Vector3();
  /** 0..1 overall visibility. */
  fade = 0;
  private target = new Vector3();
  private has = false;
  private pillar: Mesh;
  private core: Mesh;
  private pillarMat: StandardMaterial;
  private coreMat: StandardMaterial;
  private streaks: Texture;
  private gem: Mesh;
  private gemMat: StandardMaterial;

  constructor(scene: Scene, owned: Owned, glow: (m: AbstractMesh) => void) {
    this.streaks = owned.texture(
      streakTexture(scene, "beacon-streaks", 31, 6, 3, 0.45),
    );
    this.streaks.vScale = 2;
    const mask = owned.texture(beamMask(scene, "beacon-mask", 1.15, 3.2));
    this.pillar = owned.mesh(beamQuad(scene, "beacon-pillar", 1.7, 12));
    this.pillarMat = owned.material(
      additiveMaterial(
        scene,
        "beacon-pillar",
        color("#ffcf4a"),
        this.streaks,
        mask,
        0.55,
      ),
    );
    this.pillar.material = this.pillarMat;
    this.core = owned.mesh(beamQuad(scene, "beacon-core", 0.42, 9));
    this.coreMat = owned.material(
      additiveMaterial(scene, "beacon-core", color("#fff4c9"), null, mask, 0.6),
    );
    this.core.material = this.coreMat;
    this.gem = owned.mesh(diamondModel(scene, "beacon-gem"));
    this.gemMat = owned.material(
      toyMaterial(scene, "beacon-gem", 0.55, color("#ffd45e")),
    );
    this.gem.material = this.gemMat;
    this.gem.isPickable = false;
    glow(this.gem);
    for (const m of [this.pillar, this.core, this.gem]) m.setEnabled(false);
  }

  /** `ground` is the visual height under the objective. */
  update(
    dt: number,
    time: number,
    objective: { x: number; z: number } | null,
    ground: (x: number, z: number) => number,
    focus: Vector3 | null,
    night: number,
  ): void {
    if (objective) {
      this.target.set(
        objective.x,
        ground(objective.x, objective.z),
        objective.z,
      );
      if (!this.has || this.fade < 0.02) this.position.copyFrom(this.target);
      this.has = true;
    }
    // Glide toward a changed objective.
    const k = 1 - Math.exp(-dt * 2.6);
    this.position.x += (this.target.x - this.position.x) * k;
    this.position.z += (this.target.z - this.position.z) * k;
    this.position.y += (this.target.y - this.position.y) * k;
    let want = objective ? 1 : 0;
    if (want && focus) {
      const d = Math.hypot(
        focus.x - this.position.x,
        focus.z - this.position.z,
      );
      want *= smoothstep(1.6, 3.6, d);
    }
    const rate = want > this.fade ? 1.6 : 2.4;
    this.fade += Math.max(-rate * dt, Math.min(rate * dt, want - this.fade));
    const on = this.fade > 0.005;
    for (const m of [this.pillar, this.core, this.gem]) m.setEnabled(on);
    if (!on) {
      if (!objective) this.has = false;
      return;
    }
    const p = this.position;
    const pulse = 0.5 + 0.5 * Math.sin(time * 2.4);
    this.pillar.position.copyFrom(p);
    this.core.position.copyFrom(p);
    this.streaks.vOffset -= dt * 0.45;
    dayNightBlend(this.pillarMat, night);
    dayNightBlend(this.coreMat, night);
    // By day the beam is a tint, so it needs a deeper gold and more opacity.
    const lit = night >= 0.5;
    const boost = lit ? 1 : 1.9;
    if (lit) this.pillarMat.emissiveColor.set(1, 0.81, 0.29);
    else this.pillarMat.emissiveColor.set(1, 0.66, 0.08);
    this.pillarMat.alpha = Math.min(
      1,
      (0.42 + 0.16 * pulse) * this.fade * boost,
    );
    this.coreMat.alpha = Math.min(1, (0.45 + 0.2 * pulse) * this.fade * boost);
    this.gem.position.set(p.x, p.y + 3.2 + Math.sin(time * 2) * 0.16, p.z);
    this.gem.rotation.y = time * 1.3;
    const s = 0.4 + 0.6 * this.fade;
    this.gem.scaling.setAll(s * (1 + 0.04 * pulse));
    this.gemMat.emissiveColor.set(
      0.55 + 0.2 * pulse,
      0.42 + 0.15 * pulse,
      0.12,
    );
  }
}
