/**
 * Local-only renderer studies for the Field Lab: the draw/animation stress
 * fixture, the hound motion study and the elemental material study. None of
 * these send anything to a server or imply a playable kit.
 */
import {
  Color3,
  Color4,
  Mesh,
  MeshBuilder,
  ParticleSystem,
  StandardMaterial,
  TransformNode,
  Vector3,
  VertexData,
  type AbstractMesh,
  type InstancedMesh,
  type Scene,
  type ShadowGenerator,
} from "@babylonjs/core";
import type { AbilityKey } from "../../../packages/contracts/game";
import type { AnimState, CharacterKind, CharacterRig } from "./voxel/api";
import { createCharacter, characterGlowMeshes } from "./voxel/characters";
import { VoxelGrid } from "./voxel/grid";
import { meshColors, type MeshData } from "./voxel/mesher";
import { fxTexture, type FxTextureName } from "./vfx/textures";

export type StudyHost = {
  scene: Scene;
  shadow: ShadowGenerator | null;
  glow(mesh: AbstractMesh): void;
  ground(x: number, z: number): number;
};

export function idleState(): AnimState {
  return {
    time: 0,
    moving: false,
    speed: 0,
    life: "alive",
    dodging: false,
    guarding: false,
    stunned: false,
    healing: false,
    oath: false,
    returning: false,
    action: null,
    sinceHit: 99,
    sinceDeath: 0,
  };
}

type Action = NonNullable<AnimState["action"]>;
const newAction = (): Action => ({
  key: "basic",
  phase: "windup",
  t: 0,
  progress: 0,
});

function setAction(
  s: AnimState,
  a: Action,
  key: AbilityKey,
  u: number,
  windup: number,
  recovery: number,
) {
  // u: seconds into a windup → short impact → recovery cycle.
  const hold = 0.08;
  s.action = a;
  a.key = key;
  if (u < windup) {
    a.phase = "windup";
    a.t = u / windup;
  } else if (u < windup + hold) {
    a.phase = "impact";
    a.t = (u - windup) / hold;
  } else {
    a.phase = "recovery";
    a.t = Math.min(1, (u - windup - hold) / (recovery - hold));
  }
  a.progress = Math.min(1, u / (windup + recovery));
}

function voxelMesh(
  name: string,
  data: MeshData,
  material: StandardMaterial,
  scene: Scene,
): Mesh {
  const mesh = new Mesh(name, scene);
  const vd = new VertexData();
  vd.positions = data.positions;
  vd.normals = data.normals;
  vd.colors = data.colors;
  vd.indices = data.indices;
  vd.applyToMesh(mesh, false);
  mesh.hasVertexAlpha = false;
  mesh.material = material;
  mesh.isPickable = false;
  return mesh;
}

// ───────────────────────────── stress fixture ─────────────────────────────

/** 60 animated rigs (15 player bodies, 45 hounds) and 32 summon proxies. */
export class StressFixture {
  private rigs: { rig: CharacterRig; state: AnimState; act: Action }[] = [];
  private summons: InstancedMesh[] = [];
  private source: Mesh;
  private material: StandardMaterial;

  constructor(private host: StudyHost) {
    const { scene } = host;
    for (let i = 0; i < 60; i++) {
      const kind: CharacterKind =
        i < 15 ? (i % 2 ? "knight" : "cyborg") : "wolf";
      const rig = createCharacter(scene, kind, {
        id: `render-fixture-${i}`,
        shadow: host.shadow,
      });
      for (const m of characterGlowMeshes(rig)) host.glow(m);
      this.rigs.push({ rig, state: idleState(), act: newAction() });
    }
    this.material = new StandardMaterial("summon-fixture", scene);
    this.material.diffuseColor = Color3.FromHexString("#97d1c5");
    this.material.emissiveColor = Color3.FromHexString("#3f8f86");
    this.material.specularColor = Color3.Black();
    this.source = MeshBuilder.CreateBox("summon-source", { size: 0.36 }, scene);
    this.source.material = this.material;
    this.source.isPickable = false;
    this.source.isVisible = false;
    for (let i = 0; i < 32; i++) {
      const m = this.source.createInstance(`summon-fixture-${i}`);
      m.isPickable = false;
      m.rotation.set(Math.PI / 4, i, Math.PI / 4);
      this.summons.push(m);
    }
  }

  update(dt: number, time: number, x: number, z: number) {
    this.rigs.forEach(({ rig, state, act }, i) => {
      const px = x + ((i % 8) - 3.5) * 1.65 + Math.sin(time + i) * 0.12,
        pz = z + Math.floor(i / 8) * 1.55 - 2;
      rig.root.position.set(px, this.host.ground(px, pz), pz);
      rig.root.rotation.y = Math.sin(time * 0.5 + i) * 0.6;
      state.time = time;
      if (i % 3) {
        state.moving = true;
        state.speed = 0.9 + (i % 3) * 0.05;
        state.action = null;
      } else {
        state.moving = false;
        state.speed = 0;
        const u = (time + i * 0.37) % 1.4;
        if (u < 1.1) setAction(state, act, "basic", u, 0.4, 0.7);
        else state.action = null;
      }
      rig.update(state, dt);
    });
    this.summons.forEach((m, i) => {
      m.position.set(
        x + ((i % 8) - 3.5) * 1.7,
        this.host.ground(x, z) + 1.2 + Math.sin(time * 2 + i) * 0.2,
        z + Math.floor(i / 8) * 2 + 1,
      );
      m.rotation.y = time + i;
    });
  }

  dispose() {
    for (const { rig } of this.rigs) rig.dispose();
    this.rigs.length = 0;
    for (const m of this.summons) m.dispose();
    this.summons.length = 0;
    this.source.dispose();
    this.material.dispose();
  }
}

// ───────────────────────────── hound study ─────────────────────────────

const HOUND_STATES = ["idle", "walk", "run", "attack", "dodge", "death"];

/** A voxel hound cycling its motions, three seconds each. */
export class HoundStudy {
  readonly rig: CharacterRig;
  private state = idleState();
  private act = newAction();
  private started: number | null = null;
  private label = "idle";

  constructor(private host: StudyHost) {
    this.rig = createCharacter(host.scene, "wolf", {
      id: "hound-rig-study",
      shadow: host.shadow,
    });
    for (const m of characterGlowMeshes(this.rig)) host.glow(m);
  }

  update(dt: number, time: number, x: number, z: number) {
    this.started ??= time;
    const local = time - this.started;
    const index = Math.floor(local / 3) % HOUND_STATES.length;
    const u = local % 3;
    const s = this.state;
    s.time = time;
    s.moving = index === 1 || index === 2;
    s.returning = index === 1;
    s.speed = index === 2 ? 1 : index === 1 ? 0.45 : 0;
    s.dodging = index === 4 && u < 0.6;
    s.life = index === 5 ? "dead" : "alive";
    s.sinceDeath = index === 5 ? u : 0;
    s.action = null;
    if (index === 3) {
      const cycle = u % 1.5;
      if (cycle < 1.2) setAction(s, this.act, "basic", cycle, 0.8, 0.4);
    }
    this.rig.root.position.set(x, this.host.ground(x, z), z);
    this.rig.root.rotation.y = Math.PI / 2;
    this.rig.update(s, dt);
    const a = s.action as Action | null;
    this.label = `${HOUND_STATES[index]}${a ? ` · ${a.phase} ${a.t.toFixed(2)}` : ""} · ${u.toFixed(1)}s`;
  }

  describe(): string {
    return this.label;
  }

  dispose() {
    this.rig.dispose();
  }
}

// ───────────────────────────── elemental study ─────────────────────────────

type Element = "fire" | "water" | "air" | "earth";
const ELEMENTS: Element[] = ["fire", "water", "air", "earth"];
const PALETTES: Record<Element, [number, number, number][]> = {
  fire: [
    [0, 0, 0],
    [1, 0.42, 0.12],
    [1, 0.66, 0.2],
    [1, 0.9, 0.45],
    [0.25, 0.08, 0.06],
  ],
  water: [
    [0, 0, 0],
    [0.2, 0.55, 0.92],
    [0.33, 0.78, 0.96],
    [0.85, 0.97, 1],
    [0.08, 0.18, 0.36],
  ],
  air: [
    [0, 0, 0],
    [0.86, 0.94, 1],
    [0.74, 0.88, 0.98],
    [1, 1, 1],
    [0.3, 0.42, 0.6],
  ],
  earth: [
    [0, 0, 0],
    [0.55, 0.42, 0.3],
    [0.45, 0.47, 0.42],
    [0.42, 0.68, 0.32],
    [0.16, 0.12, 0.1],
  ],
};

/** A chibi elemental of 0.1 m voxels: round body, big head, stubby arms, two eyes. */
function elementalData(element: Element): MeshData {
  const g = new VoxelGrid(12, 16, 10, { x: 0, y: 0, z: 0 }, 0.1);
  let seed = element.length * 977;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const blob = (
    cx: number,
    cy: number,
    cz: number,
    rx: number,
    ry: number,
    rz: number,
  ) => {
    for (let y = 0; y < 16; y++)
      for (let z = 0; z < 10; z++)
        for (let x = 0; x < 12; x++) {
          const d =
            ((x + 0.5 - cx) / rx) ** 2 +
            ((y + 0.5 - cy) / ry) ** 2 +
            ((z + 0.5 - cz) / rz) ** 2;
          if (d <= 1) {
            const band = y < 5 ? 1 : y < 10 ? 2 : 3;
            const pick =
              element === "earth"
                ? rand() < 0.3
                  ? 2
                  : y > 13
                    ? 3
                    : 1
                : rand() < 0.18
                  ? Math.min(3, band + 1)
                  : band;
            g.set(x, y, z, pick);
          }
        }
  };
  blob(6, 4.5, 5, 3.2, 3.6, 2.8); // body
  blob(6, 10.5, 5, 3.6, 3.2, 3.2); // head
  blob(1.8, 5.5, 5, 1.2, 2.2, 1.2); // arms
  blob(10.2, 5.5, 5, 1.2, 2.2, 1.2);
  if (element === "fire")
    for (const x of [3, 6, 9]) g.fill(x, 13, 5, x, 15, 5, 3); // flame crown
  if (element === "earth")
    for (let i = 0; i < 10; i++)
      g.set(
        1 + Math.floor(rand() * 10),
        2 + Math.floor(rand() * 12),
        rand() < 0.5 ? 1 : 8,
        2,
      );
  // Eyes on the front (+z) of the head.
  g.fill(4, 10, 8, 4, 11, 8, 4);
  g.fill(7, 10, 8, 7, 11, 8, 4);
  return meshColors(g, {
    palette: PALETTES[element],
    aoStrength: 0.6,
    pivot: { x: 0.6, y: 0, z: 0.5 },
  });
}

type ParticleSpec = {
  texture: FxTextureName;
  color1: string;
  color2: string;
  size: [number, number];
  life: [number, number];
  rate: number;
  add: boolean;
  gravity: number;
  power: [number, number];
  dir1: [number, number, number];
  dir2: [number, number, number];
};
const PARTICLES: Record<Element, ParticleSpec> = {
  fire: {
    texture: "soft",
    color1: "#ffd45e",
    color2: "#ff6a2a",
    size: [0.1, 0.24],
    life: [0.35, 0.75],
    rate: 46,
    add: true,
    gravity: 1.6,
    power: [0.4, 0.9],
    dir1: [-0.25, 1, -0.25],
    dir2: [0.25, 1.4, 0.25],
  },
  water: {
    texture: "spark",
    color1: "#a8ecff",
    color2: "#3fa8ff",
    size: [0.05, 0.1],
    life: [0.5, 0.9],
    rate: 24,
    add: false,
    gravity: -5,
    power: [0.6, 1.2],
    dir1: [-0.6, 1, -0.6],
    dir2: [0.6, 1.4, 0.6],
  },
  air: {
    texture: "streak",
    color1: "#ffffff",
    color2: "#bfefff",
    size: [0.12, 0.24],
    life: [0.25, 0.45],
    rate: 40,
    add: true,
    gravity: 0,
    power: [0.1, 0.3],
    dir1: [-0.2, 0.2, -0.2],
    dir2: [0.2, 0.5, 0.2],
  },
  earth: {
    texture: "puff",
    color1: "#c7a77c",
    color2: "#8a7158",
    size: [0.16, 0.3],
    life: [0.7, 1.2],
    rate: 12,
    add: false,
    gravity: 0.3,
    power: [0.15, 0.35],
    dir1: [-1, 0.2, -1],
    dir2: [1, 0.5, 1],
  },
};

/** Four small elemental figures: a material and VFX study, not a playable kit. */
export class ElementalStudy {
  private root: TransformNode;
  private figures: {
    element: Element;
    node: TransformNode;
    emitter: Vector3;
    ps: ParticleSystem;
  }[] = [];
  private materials: StandardMaterial[] = [];

  constructor(private host: StudyHost) {
    const { scene } = host;
    this.root = new TransformNode("elemental-study", scene);
    ELEMENTS.forEach((element, i) => {
      const node = new TransformNode(`elemental-${element}`, scene);
      node.parent = this.root;
      node.position.x = (i - 1.5) * 1.4;
      const mat = new StandardMaterial(`elemental-${element}`, scene);
      mat.specularColor = new Color3(0.1, 0.1, 0.1);
      if (element === "fire") {
        mat.emissiveColor = new Color3(1, 0.42, 0.12);
        mat.disableLighting = true;
      } else if (element === "water") {
        mat.alpha = 0.66;
        mat.specularColor = new Color3(0.8, 0.9, 1);
        mat.specularPower = 48;
      } else if (element === "air") {
        mat.alpha = 0.38;
        mat.emissiveColor = new Color3(0.35, 0.42, 0.5);
      }
      this.materials.push(mat);
      const mesh = voxelMesh(
        `elemental-${element}-body`,
        elementalData(element),
        mat,
        scene,
      );
      mesh.parent = node;
      if (element !== "air" && element !== "water")
        host.shadow?.addShadowCaster(mesh, false);
      if (element === "fire") host.glow(mesh);
      const spec = PARTICLES[element];
      const ps = new ParticleSystem(`elemental-${element}-fx`, 120, scene);
      ps.particleTexture = fxTexture(scene, spec.texture);
      const c1 = Color3.FromHexString(spec.color1),
        c2 = Color3.FromHexString(spec.color2);
      ps.color1 = new Color4(c1.r, c1.g, c1.b, 1);
      ps.color2 = new Color4(c2.r, c2.g, c2.b, 0.9);
      ps.colorDead = new Color4(c2.r, c2.g, c2.b, 0);
      ps.minSize = spec.size[0];
      ps.maxSize = spec.size[1];
      ps.minLifeTime = spec.life[0];
      ps.maxLifeTime = spec.life[1];
      ps.emitRate = spec.rate;
      ps.blendMode = spec.add
        ? ParticleSystem.BLENDMODE_ADD
        : ParticleSystem.BLENDMODE_STANDARD;
      ps.gravity = new Vector3(0, spec.gravity, 0);
      ps.minEmitPower = spec.power[0];
      ps.maxEmitPower = spec.power[1];
      ps.direction1 = new Vector3(...spec.dir1);
      ps.direction2 = new Vector3(...spec.dir2);
      ps.minEmitBox = new Vector3(-0.2, 0, -0.2);
      ps.maxEmitBox = new Vector3(0.2, 0.2, 0.2);
      ps.updateSpeed = 1 / 60;
      const emitter = new Vector3();
      ps.emitter = emitter;
      ps.start();
      this.figures.push({ element, node, emitter, ps });
    });
  }

  update(time: number, x: number, z: number) {
    const ground = this.host.ground(x, z);
    this.root.position.set(x, ground, z);
    this.root.rotation.y = time * 0.3;
    const cos = Math.cos(this.root.rotation.y),
      sin = Math.sin(this.root.rotation.y);
    this.figures.forEach((f, i) => {
      f.node.position.y = 0.04 + Math.abs(Math.sin(time * 2.2 + i)) * 0.06;
      const lx = (i - 1.5) * 1.4,
        wx = x + lx * cos,
        wz = z - lx * sin;
      if (f.element === "fire") f.emitter.set(wx, ground + 1.3, wz);
      else if (f.element === "water") f.emitter.set(wx, ground + 0.9, wz);
      else if (f.element === "earth") f.emitter.set(wx, ground + 0.05, wz);
      else {
        // Air: the emitter circles the figure so the streaks swirl.
        const a = time * 7 + i;
        f.emitter.set(
          wx + Math.cos(a) * 0.55,
          ground + 0.5 + ((time * 0.9) % 1) * 0.9,
          wz + Math.sin(a) * 0.55,
        );
      }
    });
  }

  dispose() {
    for (const f of this.figures) f.ps.dispose(false);
    this.figures.length = 0;
    for (const m of this.materials) m.dispose();
    this.materials.length = 0;
    this.root.dispose(false, false);
  }
}
