/**
 * Chibi voxel characters with procedural, springy animation. Each kind is
 * meshed once per scene from character-models.ts, then cloned per actor so
 * instances share vertex buffers. Pose targets are layered every frame
 * (stance, idle, locomotion, statuses, ability motion, reactions) and every
 * channel follows its target through a critically damped spring, so state
 * changes never pop. Presentation only: the simulation owns every rule.
 */
import {
  Color3,
  Mesh,
  StandardMaterial,
  TransformNode,
  VertexData,
  type Scene,
  type ShadowGenerator,
} from "@babylonjs/core";
import type {
  AbilityKey,
  ActorKind,
  Guild,
} from "../../../../packages/contracts/game";
import type {
  AnimState,
  CharacterKind,
  CharacterRig,
  CreateCharacter,
} from "./api";
import { mergeMeshes, meshColors, type MeshData } from "./mesher";
import {
  GLOW_FAMILIES,
  HUMANOID_JOINTS,
  PALETTE,
  WOLF_JOINTS,
  buildModel,
  glowFamily,
  glowFamilyColor,
  isGlowIndex,
  type CharacterModel,
  type GlowFamily,
  type JointName,
} from "./character-models";

export function characterKind(actor: {
  kind: ActorKind;
  guild: Guild;
}): CharacterKind {
  return actor.kind === "player" ? actor.guild : actor.kind;
}

// ───────────────────────────── pose channels ─────────────────────────────

const PX = 0,
  PY = 1,
  PZ = 2,
  RX = 3,
  RY = 4,
  RZ = 5,
  SY = 6,
  CH = 7;
const CHANNEL: Record<string, number> = {
  px: PX,
  py: PY,
  pz: PZ,
  rx: RX,
  ry: RY,
  rz: RZ,
  sy: SY,
};
// Humanoid joint indices (HUMANOID_JOINTS order) premultiplied by CH.
const M = 0 * CH,
  H = 1 * CH,
  LL = 2 * CH,
  LR = 3 * CH,
  N = 4 * CH,
  E = 5 * CH,
  AL = 6 * CH,
  AR = 7 * CH,
  HL = 8 * CH,
  HR = 9 * CH;
// Wolf joint indices (WOLF_JOINTS order).
const WB = 1 * CH,
  WN = 2 * CH,
  WE = 3 * CH,
  WJ = 4 * CH,
  FL = 5 * CH,
  FR = 6 * CH,
  BL = 7 * CH,
  BR = 8 * CH,
  WT = 9 * CH;

type PoseDef = Partial<Record<string, number>>;
type Pose = { ch: Int32Array; v: Float32Array };
type RigType = "humanoid" | "wolf";
const jointLists: Record<RigType, readonly JointName[]> = {
  humanoid: HUMANOID_JOINTS,
  wolf: WOLF_JOINTS,
};
function channelOf(rig: RigType, key: string): number {
  const [joint, ch] = key.split(".");
  const j = jointLists[rig].indexOf(joint as JointName);
  if (j < 0 || CHANNEL[ch] === undefined)
    throw new Error(`Unknown pose channel ${key}`);
  return j * CH + CHANNEL[ch];
}
function pose(rig: RigType, def: PoseDef): Pose {
  const keys = Object.keys(def);
  return {
    ch: Int32Array.from(keys.map((k) => channelOf(rig, k))),
    v: Float32Array.from(keys.map((k) => def[k]!)),
  };
}
function addPose(T: Float32Array, p: Pose, w: number) {
  for (let i = 0; i < p.ch.length; i++) T[p.ch[i]] += p.v[i] * w;
}
function blendPose(T: Float32Array, p: Pose, w: number) {
  for (let i = 0; i < p.ch.length; i++) {
    const c = p.ch[i];
    T[c] += (p.v[i] - T[c]) * w;
  }
}
const mix = (T: Float32Array, c: number, v: number, w: number) => {
  T[c] += (v - T[c]) * w;
};

// ───────────────────────────── ability motion ─────────────────────────────

const LIN = 0,
  IO = 1,
  OUT = 2,
  BACK = 3,
  IN = 4;
function ease(kind: number, s: number): number {
  switch (kind) {
    case IO:
      return s * s * (3 - 2 * s);
    case OUT:
      return 1 - (1 - s) * (1 - s) * (1 - s);
    case BACK: {
      const c = 1.9,
        x = s - 1;
      return 1 + (c + 1) * x * x * x + c * x * x;
    }
    case IN:
      return s * s;
    default:
      return s;
  }
}
type KeyDef = { u: number; e?: number; p: PoseDef };
type ActionDef = {
  /** Key poses on a 0..3 timeline: windup 0..1, impact 1..2, recovery 2..3. */
  keys: KeyDef[];
  /** Shiver amplitude while winding up (charging, growling). */
  tremble?: number;
  /** Extra procedural motion. */
  fx?: "roll" | "shake";
};
type Action = {
  ch: Int32Array;
  lower: Uint8Array;
  u: Float32Array;
  e: Uint8Array;
  /** (keys + 2) rows of channel values; NaN means "the base pose". */
  v: Float32Array;
  tremble: number;
  fx: ActionDef["fx"];
};
const LOWER_JOINTS = new Set<JointName>([
  "legL",
  "legR",
  "legFL",
  "legFR",
  "legBL",
  "legBR",
]);
function action(rig: RigType, def: ActionDef): Action {
  const names: string[] = [];
  for (const k of def.keys)
    for (const name of Object.keys(k.p))
      if (!names.includes(name)) names.push(name);
  const n = names.length,
    rows = def.keys.length + 2;
  const v = new Float32Array(rows * n).fill(NaN);
  def.keys.forEach((k, r) => {
    for (let i = 0; i < n; i++) {
      const own = k.p[names[i]];
      // Missing channels hold the previous key's value.
      v[(r + 1) * n + i] = own ?? v[r * n + i];
    }
  });
  return {
    ch: Int32Array.from(names.map((k) => channelOf(rig, k))),
    lower: Uint8Array.from(
      names.map((k) =>
        LOWER_JOINTS.has(k.split(".")[0] as JointName) || k === "model.py"
          ? 1
          : 0,
      ),
    ),
    u: Float32Array.from([0, ...def.keys.map((k) => k.u), 3]),
    e: Uint8Array.from([LIN, ...def.keys.map((k) => k.e ?? IO), IO]),
    v,
    tremble: def.tremble ?? 0,
    fx: def.fx,
  };
}
function applyAction(
  T: Float32Array,
  a: Action,
  u: number,
  w: number,
  lowerW: number,
) {
  const last = a.u.length - 2;
  let k = 0;
  while (k < last && u > a.u[k + 1]) k++;
  const u0 = a.u[k],
    u1 = a.u[k + 1];
  const s = ease(a.e[k + 1], Math.min(1, Math.max(0, (u - u0) / (u1 - u0))));
  const n = a.ch.length;
  for (let i = 0; i < n; i++) {
    const c = a.ch[i],
      base = T[c];
    let v0 = a.v[k * n + i],
      v1 = a.v[(k + 1) * n + i];
    if (v0 !== v0) v0 = base;
    if (v1 !== v1) v1 = base;
    const value = v0 + (v1 - v0) * s;
    T[c] = base + (value - base) * (a.lower[i] ? w * lowerW : w);
  }
}

// ───────────────────────────── per-kind motion ─────────────────────────────

type Personality = (
  T: Float32Array,
  t: number,
  w: number,
  seed: number,
) => void;
type KindMotion = {
  stance: Pose;
  guard: Pose;
  actions: Partial<Record<AbilityKey, Action>>;
  fallback: Action;
  legSwing: number;
  armSwingL: number;
  armSwingR: number;
  personality: Personality;
};

/** 0 → 1 → 0 bump lasting `dur` seconds, repeating every `period`. */
function bump(t: number, period: number, dur: number, offset: number): number {
  const p = (((t + offset) % period) + period) % period;
  if (p > dur) return 0;
  const edge = Math.min(0.4, dur / 3);
  const a = Math.min(1, p / edge),
    b = Math.min(1, (dur - p) / edge);
  const k = Math.min(a, b);
  return k * k * (3 - 2 * k);
}

const H_ = (def: PoseDef) => pose("humanoid", def);
const HA = (def: ActionDef) => action("humanoid", def);

const PROUD = H_({
  "hips.rx": -0.12,
  "neck.rx": -0.16,
  "armL.rz": 0.22,
  "armR.rz": -0.22,
  "model.sy": 1.03,
});
const DOWN = H_({
  "model.py": -0.3,
  "legL.rx": -1.45,
  "legR.rx": -1.4,
  "legL.rz": 0.22,
  "legR.rz": -0.22,
  "hips.rx": 0.2,
  "neck.rx": 0.12,
  "neck.rz": 0.2,
  "armL.rx": 0.15,
  "armL.rz": 0.32,
  "armR.rx": 0.15,
  "armR.rz": -0.32,
});
const CRAWL = H_({
  "model.rx": 1.0,
  "model.py": 0.14,
  "model.pz": -0.2,
  "legL.rx": 0.3,
  "legR.rx": 0.3,
  "neck.rx": -0.75,
  "armL.rx": -1.75,
  "armR.rx": -1.75,
  "armL.rz": 0.1,
  "armR.rz": -0.1,
});
const DEAD = H_({
  "armL.rx": -0.3,
  "armL.rz": 0.35,
  "armR.rx": 0.2,
  "armR.rz": -0.7,
  "legL.rx": -0.15,
  "legR.rx": 0.2,
  "neck.rz": -0.25,
  "neck.rx": 0.1,
});
const DASH = H_({
  "model.rx": 0.42,
  "model.sy": 0.92,
  "hips.rx": 0.15,
  "neck.rx": -0.3,
  "armL.rx": 1.15,
  "armR.rx": 1.15,
  "armL.rz": 0.25,
  "armR.rz": -0.25,
  "legL.rx": -0.5,
  "legR.rx": 0.6,
});
const ROLL = HA({
  keys: [
    {
      u: 1.15,
      e: OUT,
      p: {
        "model.sy": 0.82,
        "hips.rx": 0.5,
        "neck.rx": 0.5,
        "armL.rx": -1.2,
        "armR.rx": -1.2,
        "legL.rx": -0.9,
        "legR.rx": -0.7,
      },
    },
    { u: 2.1, p: {} },
  ],
  fx: "roll",
});
const BREAK_FREE = HA({
  keys: [
    {
      u: 1.2,
      e: BACK,
      p: {
        "model.py": 0.18,
        "model.sy": 1.1,
        "armL.rz": 1.35,
        "armR.rz": -1.35,
        "armL.rx": -0.4,
        "armR.rx": -0.4,
        "neck.rx": -0.25,
      },
    },
    { u: 1.6, e: IO, p: { "model.py": 0, "model.sy": 0.9 } },
    { u: 2.3, p: { "model.sy": 1 } },
  ],
  fx: "shake",
});

const KNIGHT: KindMotion = {
  stance: H_({
    "armR.rx": -0.25,
    "armR.rz": -0.1,
    "handR.rx": -0.5,
    "armL.rx": -0.3,
    "armL.rz": 0.12,
    "handL.rx": 0.3,
    "handL.ry": 0.55,
  }),
  guard: H_({
    "model.py": -0.08,
    "legL.rx": -0.32,
    "legL.rz": 0.14,
    "legR.rx": 0.3,
    "legR.rz": -0.14,
    "hips.rx": 0.14,
    "neck.rx": 0.06,
    "armL.rx": -1.25,
    "armL.rz": -0.5,
    "handL.rx": 1.25,
    "handL.ry": 0.1,
    "armR.rx": 0.3,
    "armR.rz": -0.25,
    "handR.rx": -0.7,
  }),
  actions: {
    // Horizontal slash: the sword is held level and the shoulder yaws it
    // through a wide arc from the right side across the front.
    basic: HA({
      keys: [
        {
          u: 1,
          p: {
            "hips.ry": -0.5,
            "neck.ry": 0.3,
            "armR.rx": -1.2,
            "armR.ry": -1.45,
            "armR.rz": 0,
            "handR.rx": 1.2,
            "model.py": -0.04,
            "legR.rx": 0.25,
            "legL.rx": -0.2,
          },
        },
        {
          u: 1.45,
          e: BACK,
          p: {
            "hips.ry": 0.6,
            "neck.ry": -0.15,
            "armR.ry": 0.85,
            "model.pz": 0.12,
            "legR.rx": -0.4,
            "legL.rx": 0.3,
          },
        },
        { u: 2.15, e: OUT, p: { "hips.ry": 0.5, "armR.ry": 1.05 } },
      ],
    }),
    "1": HA({
      keys: [
        {
          u: 1,
          p: {
            "armR.rx": -2.9,
            "armR.rz": -0.15,
            "handR.rx": -0.35,
            "armL.rx": -0.55,
            "armL.rz": 0.35,
            "hips.rx": -0.24,
            "neck.rx": -0.22,
            "model.sy": 1.07,
            "legR.rx": -0.2,
            "legL.rx": 0.18,
          },
        },
        {
          u: 1.35,
          e: OUT,
          p: {
            "armR.rx": -0.85,
            "armR.rz": 0.05,
            "handR.rx": 1.45,
            "armL.rx": -0.1,
            "armL.rz": 0.5,
            "hips.rx": 0.45,
            "neck.rx": 0.15,
            "model.sy": 0.8,
            "model.py": -0.09,
            "model.pz": 0.14,
            "legR.rx": -0.5,
            "legL.rx": 0.42,
          },
        },
        { u: 1.75, e: OUT, p: { "model.sy": 0.94 } },
        { u: 2.2, p: { "model.sy": 1 } },
      ],
    }),
    "2": HA({
      keys: [
        {
          u: 1,
          p: {
            "hips.ry": 0.45,
            "armL.rx": -0.5,
            "armL.rz": 0.25,
            "handL.ry": 0.2,
            "model.py": -0.07,
            "legL.rx": 0.3,
            "legR.rx": -0.25,
            "armR.rx": 0.35,
            "handR.rx": -0.2,
          },
        },
        {
          u: 1.3,
          e: BACK,
          p: {
            "hips.ry": -0.4,
            "hips.rx": 0.15,
            "armL.rx": -1.5,
            "armL.rz": -0.4,
            "handL.rx": 1.5,
            "handL.ry": 0.25,
            "model.pz": 0.28,
            "model.py": -0.04,
            "legL.rx": -0.55,
            "legR.rx": 0.4,
            "armR.rx": 0.6,
            "armR.rz": -0.3,
          },
        },
        { u: 2.2, e: OUT, p: { "model.pz": 0.2 } },
      ],
    }),
    "3": HA({
      keys: [
        {
          u: 1,
          e: BACK,
          p: {
            "armR.rx": -2.55,
            "armR.rz": -0.2,
            "handR.rx": 1.0,
            "armL.rz": 0.55,
            "hips.rx": -0.18,
            "neck.rz": 0.28,
            "neck.rx": -0.12,
            "model.sy": 1.05,
          },
        },
        { u: 2.4, p: {} },
      ],
    }),
    "4": HA({
      keys: [
        {
          u: 1,
          e: BACK,
          p: {
            "legL.rx": -0.6,
            "legR.rx": 0.5,
            "model.py": -0.1,
            "model.pz": 0.16,
            "armL.rx": -1.3,
            "armL.rz": -0.3,
            "handL.rx": 1.3,
            "handL.ry": 0.15,
            "hips.rx": 0.22,
            "armR.rx": 0.45,
          },
        },
        { u: 2.3, p: {} },
      ],
    }),
    "5": HA({
      keys: [
        {
          u: 1,
          p: {
            "model.py": -0.1,
            "model.sy": 0.9,
            "armR.rx": -0.6,
            "neck.rx": 0.1,
          },
        },
        {
          u: 1.3,
          e: OUT,
          p: {
            "model.py": 0.28,
            "model.sy": 1.12,
            "armR.rx": -3.05,
            "armR.rz": -0.1,
            "handR.rx": 1.5,
            "armL.rz": 0.6,
            "neck.rx": -0.32,
          },
        },
        { u: 1.65, e: IN, p: { "model.py": 0, "model.sy": 0.9 } },
        { u: 1.9, e: OUT, p: { "model.sy": 1 } },
        { u: 2.3, p: {} },
      ],
    }),
    r: HA({
      keys: [
        {
          u: 0.65,
          p: {
            "model.py": -0.22,
            "legR.rx": 1.35,
            "legL.rx": -0.95,
            "hips.rx": 0.18,
            "neck.rx": 0.4,
            "armR.rx": -0.65,
            "handR.rx": 2.2,
            "armL.rx": -0.2,
          },
        },
        { u: 1, p: { "neck.rx": 0.45 } },
        {
          u: 1.3,
          e: BACK,
          p: {
            "model.py": 0.06,
            "model.sy": 1.08,
            "legR.rx": 0,
            "legL.rx": 0,
            "hips.rx": -0.22,
            "neck.rx": -0.28,
            "armR.rx": -3.0,
            "handR.rx": 1.45,
            "armL.rz": 0.55,
          },
        },
        { u: 2.3, p: { "model.sy": 1, "model.py": 0 } },
      ],
    }),
    space: ROLL,
    c: BREAK_FREE,
  },
  fallback: HA({ keys: [] }),
  legSwing: 1,
  armSwingL: 0.35,
  armSwingR: 0.45,
  personality(T, t, w, seed) {
    const look = bump(t, 7.3, 2.2, seed * 7);
    T[N + RY] +=
      Math.sin((((t + seed * 7) % 7.3) / 2.2) * Math.PI * 2) * 0.45 * look * w;
    T[HR + RX] += -0.25 * bump(t, 11.1, 1.2, seed * 3) * w;
  },
};
KNIGHT.actions.q = HA({
  keys: [
    { u: 1, e: OUT, p: poseDef(KNIGHT.guard, "humanoid") },
    { u: 2.6, p: {} },
  ],
});

const CYBORG: KindMotion = {
  stance: H_({
    "armR.rx": -0.5,
    "armR.rz": -0.14,
    "armL.rx": -0.12,
    "armL.rz": 0.12,
  }),
  guard: H_({
    "model.py": -0.07,
    "legL.rz": 0.16,
    "legR.rz": -0.16,
    "legL.rx": -0.15,
    "legR.rx": 0.15,
    "hips.rx": 0.12,
    "neck.rx": 0.12,
    "armL.rx": -1.35,
    "armL.rz": -0.72,
    "armR.rx": -1.2,
    "armR.rz": 0.62,
  }),
  actions: {
    basic: HA({
      keys: [
        {
          u: 1,
          p: {
            "armR.rx": -1.55,
            "armR.rz": 0.08,
            "hips.ry": 0.22,
            "neck.ry": -0.1,
          },
        },
        {
          u: 1.2,
          e: OUT,
          p: {
            "armR.rx": -2.05,
            "model.pz": -0.07,
            "hips.rx": -0.12,
            "neck.rx": -0.08,
          },
        },
        {
          u: 1.75,
          p: { "armR.rx": -1.55, "model.pz": 0, "hips.rx": 0, "neck.rx": 0 },
        },
      ],
    }),
    "1": HA({
      keys: [
        {
          u: 1,
          p: {
            "model.py": -0.11,
            "model.sy": 0.9,
            "legL.rz": 0.22,
            "legR.rz": -0.22,
            "legL.rx": -0.25,
            "legR.rx": 0.25,
            "hips.rx": 0.2,
            "armR.rx": -1.5,
            "armR.rz": 0.2,
            "armL.rx": -1.4,
            "armL.rz": -0.42,
          },
        },
        {
          u: 1.25,
          e: OUT,
          p: {
            "model.pz": -0.26,
            "model.py": -0.04,
            "model.sy": 1.06,
            "hips.rx": -0.36,
            "neck.rx": -0.22,
            "armR.rx": -2.25,
            "armL.rx": -1.95,
          },
        },
        { u: 2.1, p: { "model.sy": 1 } },
      ],
      tremble: 0.05,
    }),
    "2": HA({
      keys: [
        {
          u: 1,
          p: {
            "armL.rx": -2.75,
            "armL.rz": 0.15,
            "hips.ry": 0.38,
            "hips.rx": -0.14,
            "legL.rx": 0.2,
          },
        },
        {
          u: 1.3,
          e: BACK,
          p: {
            "armL.rx": -1.05,
            "armL.rz": -0.2,
            "hips.ry": -0.38,
            "hips.rx": 0.2,
            "legL.rx": -0.42,
            "legR.rx": 0.3,
            "model.pz": 0.1,
          },
        },
        { u: 2.2, p: {} },
      ],
    }),
    "3": HA({
      keys: [
        {
          u: 1,
          p: {
            "model.py": -0.12,
            "hips.rx": 0.35,
            "neck.rx": 0.22,
            "armL.rx": -0.75,
            "armL.rz": 0.05,
            "legL.rx": -0.55,
            "legR.rx": 0.5,
          },
        },
        { u: 1.3, e: OUT, p: { "armL.rx": -0.45, "hips.rx": 0.42 } },
        { u: 2.1, p: {} },
      ],
    }),
    "4": HA({
      keys: [
        {
          u: 1,
          p: {
            "model.py": -0.08,
            "model.sy": 0.9,
            "armL.rx": -1.15,
            "armL.rz": -0.8,
            "armR.rx": -1.05,
            "armR.rz": 0.75,
            "neck.rx": 0.15,
          },
        },
        {
          u: 1.25,
          e: BACK,
          p: {
            "model.py": 0.14,
            "model.sy": 1.12,
            "armL.rx": -0.3,
            "armL.rz": 1.5,
            "armR.rx": -0.3,
            "armR.rz": -1.5,
            "neck.rx": -0.22,
          },
        },
        { u: 1.6, e: IO, p: { "model.py": 0, "model.sy": 0.95 } },
        { u: 2.3, p: { "model.sy": 1 } },
      ],
      tremble: 0.02,
    }),
    "5": HA({
      keys: [
        {
          u: 1,
          p: {
            "armL.rx": -2.8,
            "armL.rz": 0.15,
            "neck.rx": -0.32,
            "hips.rx": -0.06,
          },
        },
        {
          u: 1.3,
          e: BACK,
          p: { "armL.rx": -3.05, "armL.rz": 0.5, "model.py": 0.07 },
        },
        { u: 2.2, p: { "model.py": 0 } },
      ],
    }),
    r: HA({
      keys: [
        {
          u: 1,
          p: {
            "model.py": -0.14,
            "model.sy": 0.86,
            "armL.rx": -0.55,
            "armL.rz": -0.5,
            "armR.rx": -0.55,
            "armR.rz": 0.5,
            "hips.rx": 0.32,
            "neck.rx": 0.3,
          },
        },
        {
          u: 1.25,
          e: BACK,
          p: {
            "model.py": 0.2,
            "model.sy": 1.14,
            "armL.rx": -0.6,
            "armL.rz": 2.25,
            "armR.rx": -0.6,
            "armR.rz": -2.25,
            "hips.rx": -0.25,
            "neck.rx": -0.38,
          },
        },
        { u: 1.6, e: IN, p: { "model.py": 0, "model.sy": 0.92 } },
        { u: 2.3, p: { "model.sy": 1 } },
      ],
      tremble: 0.07,
    }),
    space: ROLL,
    c: BREAK_FREE,
  },
  fallback: HA({ keys: [] }),
  legSwing: 1,
  armSwingL: 0.8,
  armSwingR: 0.4,
  personality(T, t, w, seed) {
    const check = bump(t, 8.3, 2.0, seed * 5) * w;
    T[AR + RX] += (-1.0 - T[AR + RX]) * check;
    T[N + RY] += -0.42 * check;
    T[N + RX] += 0.14 * check;
    T[M + PY] += 0.012 * Math.sin(t * 1.7 + seed) * w;
  },
};
CYBORG.actions.q = HA({
  keys: [
    { u: 1, e: OUT, p: poseDef(CYBORG.guard, "humanoid") },
    { u: 2.6, p: {} },
  ],
});
CYBORG.fallback = CYBORG.actions.basic!;
KNIGHT.fallback = KNIGHT.actions.basic!;

const HALBERD_SWING = HA({
  keys: [
    {
      u: 1,
      p: {
        "armR.rx": -2.7,
        "armR.rz": 0.05,
        "handR.rx": 2.0,
        "handR.rz": 0,
        "armL.rx": -2.3,
        "armL.rz": -0.25,
        "hips.rx": -0.2,
        "hips.ry": -0.25,
        "neck.rx": -0.1,
        "model.sy": 1.05,
        "legR.rx": 0.25,
        "legL.rx": -0.2,
      },
    },
    {
      u: 1.35,
      e: OUT,
      p: {
        "armR.rx": -1.0,
        "handR.rx": 2.75,
        "armL.rx": -1.1,
        "armL.rz": -0.35,
        "hips.rx": 0.35,
        "hips.ry": 0.2,
        "neck.rx": 0.15,
        "model.sy": 0.85,
        "model.py": -0.08,
        "model.pz": 0.16,
        "legR.rx": -0.45,
        "legL.rx": 0.4,
      },
    },
    { u: 1.7, e: OUT, p: { "model.sy": 0.95 } },
    { u: 2.25, p: { "model.sy": 1 } },
  ],
});
const GUARD: KindMotion = {
  stance: H_({
    "armR.rx": -0.15,
    "armR.rz": -0.12,
    "handR.rx": 0.15,
    "handR.rz": 0.12,
    "armL.rx": 0.05,
    "armL.rz": 0.08,
    "hips.rx": -0.07,
    "neck.rx": -0.06,
  }),
  guard: H_({
    "model.py": -0.07,
    "legL.rx": -0.3,
    "legR.rx": 0.3,
    "armR.rx": -1.0,
    "armR.rz": 0.35,
    "handR.rx": 1.0,
    "handR.rz": -1.0,
    "armL.rx": -1.1,
    "armL.rz": -0.35,
    "hips.rx": 0.1,
  }),
  actions: {},
  fallback: HALBERD_SWING,
  legSwing: 0.85,
  armSwingL: 0.9,
  armSwingR: 0.25,
  personality(T, t, w, seed) {
    T[N + RY] += 0.38 * Math.sin(t * 0.45 + seed * 9) * w;
    const settle = bump(t, 9.7, 1.0, seed * 4) * w;
    T[M + PY] += 0.04 * settle;
    T[H + RX] += -0.06 * settle;
  },
};

const MARA: KindMotion = {
  stance: H_({
    "armL.rx": -0.85,
    "armL.rz": -0.22,
    "handL.rx": 0.85,
    "handL.rz": 0.22,
    "armR.rx": -0.65,
    "armR.rz": 0.38,
    "hips.rx": 0.06,
    "neck.rx": 0.06,
  }),
  guard: H_({
    "armL.rx": -1.4,
    "armL.rz": -0.3,
    "handL.rx": 1.4,
    "armR.rx": -1.3,
    "armR.rz": 0.4,
    "neck.rx": 0.2,
    "model.py": -0.05,
  }),
  actions: {},
  fallback: HA({
    keys: [
      {
        u: 1,
        p: {
          "armL.rx": -1.9,
          "handL.rx": 1.9,
          "armR.rx": -1.6,
          "armR.rz": 0.3,
          "neck.rx": -0.15,
        },
      },
      { u: 2.2, p: {} },
    ],
  }),
  legSwing: 0.45,
  armSwingL: 0.1,
  armSwingR: 0.3,
  personality(T, t, w, seed) {
    const peek = bump(t, 8.6, 2.8, seed * 6) * w;
    T[AL + RX] += (-1.5 - T[AL + RX]) * peek;
    T[HL + RX] += (1.5 - T[HL + RX]) * peek;
    T[AL + RZ] += (-0.35 - T[AL + RZ]) * peek;
    T[N + RX] += 0.22 * peek;
    T[N + RY] += 0.32 * peek;
    T[N + RZ] += 0.1 * peek;
    T[H + RZ] += 0.025 * Math.sin(t * 0.8 + seed) * w;
  },
};

const MERCHANT: KindMotion = {
  stance: H_({
    "armL.rx": -0.1,
    "armL.rz": 0.14,
    "armR.rx": -0.1,
    "armR.rz": -0.14,
  }),
  guard: H_({
    "armL.rx": -1.4,
    "armL.rz": -0.4,
    "armR.rx": -1.4,
    "armR.rz": 0.4,
    "neck.rx": 0.25,
    "model.py": -0.06,
  }),
  actions: {},
  fallback: HA({
    keys: [
      { u: 1, e: BACK, p: { "armR.rz": -2.5, "armR.rx": -0.3 } },
      { u: 2.2, p: {} },
    ],
  }),
  legSwing: 1,
  armSwingL: 0.9,
  armSwingR: 0.9,
  personality(T, t, w, seed) {
    const wave = bump(t, 6.7, 2.4, seed * 5) * w;
    T[AR + RZ] += (-2.55 + 0.38 * Math.sin(t * 13) - T[AR + RZ]) * wave;
    T[AR + RX] += (-0.25 - T[AR + RX]) * wave;
    T[N + RZ] += 0.16 * wave;
    T[M + PY] += Math.abs(Math.sin(t * 8.5)) * 0.06 * wave;
    // A cheerful bounce on the toes even when not waving.
    T[M + PY] += 0.014 * (1 + Math.sin(t * 4.2 + seed)) * w;
    T[N + RZ] += 0.05 * Math.sin(t * 2.1 + seed) * w;
  },
};

/** Re-expand a compiled pose into a definition (to reuse it as a key pose). */
function poseDef(p: Pose, rig: RigType): PoseDef {
  const names = jointLists[rig];
  const chNames = ["px", "py", "pz", "rx", "ry", "rz", "sy"];
  const out: PoseDef = {};
  for (let i = 0; i < p.ch.length; i++)
    out[`${names[Math.floor(p.ch[i] / CH)]}.${chNames[p.ch[i] % CH]}`] = p.v[i];
  return out;
}

const W_ = (def: PoseDef) => pose("wolf", def);
const WOLF_BITE = action("wolf", {
  keys: [
    {
      u: 1,
      p: {
        "model.pz": -0.14,
        "model.py": -0.08,
        "hips.rx": 0.12,
        "neck.rx": 0.3,
        "jaw.rx": 0.3,
        "legFL.rx": -0.35,
        "legFR.rx": -0.35,
        "legBL.rx": -0.45,
        "legBR.rx": -0.45,
        "tail.rx": -0.15,
      },
    },
    {
      u: 1.3,
      e: BACK,
      p: {
        "model.pz": 0.6,
        "model.py": 0.2,
        "model.rx": -0.18,
        "model.sy": 1.1,
        "hips.rx": -0.2,
        "neck.rx": -0.35,
        "jaw.rx": 1.0,
        "legFL.rx": -1.35,
        "legFR.rx": -1.2,
        "legBL.rx": 1.0,
        "legBR.rx": 0.95,
        "tail.rx": 0.8,
      },
    },
    {
      u: 1.6,
      e: OUT,
      p: {
        "jaw.rx": 0,
        "model.py": 0,
        "model.rx": 0,
        "model.sy": 0.9,
        "neck.rx": 0.12,
        "hips.rx": 0.05,
        "legFL.rx": -0.4,
        "legFR.rx": -0.4,
        "legBL.rx": 0.3,
        "legBR.rx": 0.3,
      },
    },
    { u: 2.3, p: { "model.pz": 0.28, "model.sy": 1 } },
  ],
  tremble: 0.035,
});
const WOLF_STANCE = W_({ "neck.rx": 0.04, "tail.rx": 0.35, "jaw.rx": 0.04 });
const WOLF_DEAD = W_({
  "neck.rx": -0.15,
  "neck.rz": -0.2,
  "jaw.rx": 0.35,
  "tail.rx": -0.2,
  "legFL.rx": -0.35,
  "legFR.rx": -0.2,
  "legBL.rx": 0.35,
  "legBR.rx": 0.2,
});
const WOLF_DOWN = W_({
  "model.py": -0.28,
  "legFL.rx": -1.3,
  "legFR.rx": -1.3,
  "legBL.rx": 1.3,
  "legBR.rx": 1.3,
  "neck.rx": 0.25,
  "tail.rx": -0.3,
});

const MOTION: Record<Exclude<CharacterKind, "wolf">, KindMotion> = {
  knight: KNIGHT,
  cyborg: CYBORG,
  guard: GUARD,
  mara: MARA,
  merchant: MERCHANT,
};

// ───────────────────────────── templates ─────────────────────────────

type JointTemplate = {
  name: JointName;
  parent: number;
  local: [number, number, number];
  scale: [number, number, number];
};
type MeshTemplate = { joint: number; mesh: Mesh; cast: boolean };
type Template = {
  model: CharacterModel;
  joints: JointTemplate[];
  meshes: MeshTemplate[];
  triangles: number;
  buildMs: number;
};
type Library = {
  material: StandardMaterial;
  glow: Record<GlowFamily, StandardMaterial>;
  holder: TransformNode;
  templates: Map<CharacterKind, Template>;
};
const libraries = new WeakMap<Scene, Library>();

function library(scene: Scene): Library {
  let lib = libraries.get(scene);
  if (lib) return lib;
  const material = new StandardMaterial("voxel-character", scene);
  material.diffuseColor.set(1, 1, 1);
  material.specularColor.set(0, 0, 0);
  // No emissive lift: a glow layer would bloom every character. Shadow
  // brightness comes from the scene's hemispheric light instead.
  // Unlit; emissive colour = family tint, vertex colours carry the detail.
  const glow = {} as Record<GlowFamily, StandardMaterial>;
  for (const family of Object.keys(GLOW_FAMILIES) as GlowFamily[]) {
    const m = new StandardMaterial(`voxel-character-glow-${family}`, scene);
    const [r, g, b] = glowFamilyColor(family);
    m.disableLighting = true;
    m.emissiveColor.set(r, g, b);
    m.specularColor.set(0, 0, 0);
    glow[family] = m;
  }
  const holder = new TransformNode("voxel-character-templates", scene);
  holder.setEnabled(false);
  lib = { material, glow, holder, templates: new Map() };
  libraries.set(scene, lib);
  const created = lib;
  scene.onDisposeObservable.addOnce(() => {
    if (libraries.get(scene) === created) libraries.delete(scene);
  });
  return lib;
}

function toMesh(
  name: string,
  data: MeshData,
  scene: Scene,
  material: StandardMaterial,
  holder: TransformNode,
): Mesh {
  const mesh = new Mesh(name, scene, holder);
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

function template(scene: Scene, kind: CharacterKind): Template {
  const lib = library(scene);
  const cached = lib.templates.get(kind);
  if (cached) return cached;
  const start = performance.now();
  const model = buildModel(kind);
  const names = model.joints.map((j) => j.name);
  const joints: JointTemplate[] = model.joints.map((j) => {
    const parent = j.parent ? names.indexOf(j.parent) : -1;
    const pp = parent >= 0 ? model.joints[parent].pos : [0, 0, 0];
    return {
      name: j.name,
      parent,
      local: [j.pos[0] - pp[0], j.pos[1] - pp[1], j.pos[2] - pp[2]],
      scale: j.scale ?? [1, 1, 1],
    };
  });
  const meshes: MeshTemplate[] = [];
  let triangles = 0;
  model.joints.forEach((joint, index) => {
    const parts = model.parts.filter((p) => p.joint === joint.name);
    if (!parts.length) return;
    const pivot = { x: joint.pos[0], y: joint.pos[1], z: joint.pos[2] };
    const solid: MeshData[] = [];
    const glow = new Map<GlowFamily, MeshData[]>();
    for (const part of parts) {
      const grid = part.toGrid();
      if (!grid) continue;
      solid.push(
        meshColors(grid, {
          palette: PALETTE,
          include: (i) => !isGlowIndex(i),
          pivot,
        }),
      );
      const families = new Set<GlowFamily>();
      for (const v of grid.data) {
        const f = v ? glowFamily(v) : undefined;
        if (f) families.add(f);
      }
      for (const family of families) {
        const data = meshColors(grid, {
          palette: PALETTE,
          include: (i) => glowFamily(i) === family,
          pivot,
          aoStrength: 0,
        });
        // Material emissive × vertex colour reproduces the palette colour.
        const tint = glowFamilyColor(family);
        for (let i = 0; i < data.colors.length; i += 4)
          for (let c = 0; c < 3; c++)
            data.colors[i + c] /= Math.max(0.05, tint[c]);
        glow.set(family, [...(glow.get(family) ?? []), data]);
      }
    }
    const add = (
      data: MeshData,
      material: StandardMaterial,
      suffix: string,
    ) => {
      if (!data.indices.length) return;
      triangles += data.indices.length / 3;
      meshes.push({
        joint: index,
        mesh: toMesh(
          `char-${kind}-${joint.name}${suffix}`,
          data,
          scene,
          material,
          lib.holder,
        ),
        cast: !suffix && joint.name !== "eyes",
      });
    };
    add(mergeMeshes(solid), lib.material, "");
    for (const [family, list] of glow)
      add(mergeMeshes(list), lib.glow[family], `-glow-${family}`);
  });
  const result: Template = {
    model,
    joints,
    meshes,
    triangles,
    buildMs: performance.now() - start,
  };
  lib.templates.set(kind, result);
  return result;
}

/** Build every kind's geometry up front (avoids a hitch on first spawn). */
export function preloadCharacters(scene: Scene): void {
  for (const kind of [
    "knight",
    "cyborg",
    "guard",
    "mara",
    "merchant",
    "wolf",
  ] as const)
    template(scene, kind);
}
/** Template stats for metrics and budgets. */
export function characterStats(scene: Scene): {
  kind: CharacterKind;
  meshes: number;
  triangles: number;
  buildMs: number;
}[] {
  const lib = libraries.get(scene);
  if (!lib) return [];
  return [...lib.templates.entries()].map(([kind, t]) => ({
    kind,
    meshes: t.meshes.length,
    triangles: t.triangles,
    buildMs: t.buildMs,
  }));
}
/** Emissive meshes of a rig (eyes, visor, muzzle, hourglass) for the glow layer. */
export function characterGlowMeshes(rig: CharacterRig): Mesh[] {
  const lib = libraries.get(rig.root.getScene());
  if (!lib) return [];
  const glow = new Set<unknown>(Object.values(lib.glow));
  return rig.meshes.filter((m) => glow.has(m.material));
}

// ───────────────────────────── rig instance ─────────────────────────────

function hashSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}
const approach = (cur: number, target: number, rate: number, dt: number) =>
  target + (cur - target) * Math.exp(-rate * dt);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const TAU = Math.PI * 2;
const WHITE = new Color3(1, 1, 1);
/** Blink: 0 open … 1 closed, deterministic from time and seed. */
function blinkAt(t: number, seed: number): number {
  const tt = t + seed * 13,
    cycle = Math.floor(tt / 3.6);
  const r =
    Math.abs(Math.sin(cycle * 12.9898 + seed * 78.233) * 43758.5453) % 1;
  const local = tt - cycle * 3.6 - r * 3.0;
  // Some cycles get a cute double blink.
  return Math.min(1, lid(local) + (r > 0.72 ? lid(local - 0.24) : 0));
}
const lid = (x: number) =>
  x > 0 && x < 0.16 ? Math.min(1, 1.6 - Math.abs(x - 0.08) / 0.05) : 0;

class VoxelCharacter implements CharacterRig {
  readonly kind: CharacterKind;
  readonly root: TransformNode;
  readonly meshes: Mesh[] = [];
  readonly height: number;
  readonly sockets: CharacterRig["sockets"];
  private readonly scaleNode: TransformNode;
  private readonly nodes: TransformNode[];
  private readonly rest: Float32Array;
  private readonly restScale: Float32Array;
  private readonly squash: Uint8Array;
  private readonly omega: Float32Array;
  private readonly target: Float32Array;
  private readonly value: Float32Array;
  private readonly velocity: Float32Array;
  private readonly wolf: boolean;
  private readonly motion: KindMotion | null;
  private readonly seed: number;
  private readonly baseScale: number;
  private readonly shadow: ShadowGenerator | null;
  private readonly casters: Mesh[] = [];
  private first = true;
  private phase = 0;
  private gait = 0;
  private wMove = 0;
  private wWalk = 0;
  private speed = 0;
  private wGuard = 0;
  private wStun = 0;
  private wProud = 0;
  private wDodge = 0;
  private wDown = 0;
  private wCrawl = 0;
  private wDead = 0;
  private wAction = 0;
  private act: Action | null = null;
  private actKey: AbilityKey | null = null;
  private actU = 0;
  private roll = -1;
  private flashLeft = 0;
  private flashTime = 0;
  private readonly flashColor = new Color3(1, 1, 1);
  private userAlpha = 1;
  private fadeAlpha = 1;
  private appliedAlpha = 1;
  private disposed = false;

  constructor(
    scene: Scene,
    kind: CharacterKind,
    options: { id: string; shadow?: ShadowGenerator | null; scale?: number },
  ) {
    const tpl = template(scene, kind);
    this.kind = kind;
    this.wolf = tpl.model.rig === "wolf";
    this.motion = this.wolf ? null : MOTION[kind as keyof typeof MOTION];
    this.seed = hashSeed(options.id);
    this.baseScale = tpl.model.scale * (options.scale ?? 1);
    this.height = tpl.model.height * this.baseScale;
    this.shadow = options.shadow ?? null;
    const id = options.id;
    this.root = new TransformNode(`character:${id}`, scene);
    this.scaleNode = new TransformNode(`character:${id}:scale`, scene);
    this.scaleNode.parent = this.root;
    this.scaleNode.scaling.setAll(this.baseScale);

    const n = tpl.joints.length;
    this.rest = new Float32Array(n * 3);
    this.restScale = new Float32Array(n * 3);
    this.squash = new Uint8Array(n);
    this.nodes = tpl.joints.map((j, i) => {
      const node = new TransformNode(`character:${id}:${j.name}`, scene);
      node.parent = j.parent >= 0 ? null : this.scaleNode;
      this.rest.set(j.local, i * 3);
      this.restScale.set(j.scale, i * 3);
      this.squash[i] = j.name === "eyes" ? 0 : 1;
      return node;
    });
    tpl.joints.forEach((j, i) => {
      if (j.parent >= 0) this.nodes[i].parent = this.nodes[j.parent];
    });
    for (const m of tpl.meshes) {
      // Share the template's vertex buffers (much cheaper than Mesh.clone).
      const mesh = new Mesh(`character:${id}:${m.mesh.name}`, scene);
      mesh.parent = this.nodes[m.joint];
      m.mesh.geometry!.applyToMesh(mesh);
      mesh.hasVertexAlpha = false;
      mesh.material = m.mesh.material;
      mesh.receiveShadows = m.cast && !!this.shadow;
      this.meshes.push(mesh);
      if (this.shadow && m.cast) {
        this.shadow.addShadowCaster(mesh, false);
        this.casters.push(mesh);
      }
    }
    const names = tpl.joints.map((j) => j.name);
    const socket = (spec: CharacterModel["sockets"]["head"] | undefined) => {
      if (!spec) return undefined;
      const j = names.indexOf(spec.joint);
      const jp = tpl.model.joints[j].pos;
      const node = new TransformNode(
        `character:${id}:socket:${spec.joint}`,
        scene,
      );
      node.parent = this.nodes[j];
      node.position.set(
        spec.pos[0] - jp[0],
        spec.pos[1] - jp[1],
        spec.pos[2] - jp[2],
      );
      if (spec.rot) node.rotation.set(spec.rot[0], spec.rot[1], spec.rot[2]);
      return node;
    };
    const s = tpl.model.sockets;
    this.sockets = {
      head: socket(s.head)!,
      chest: socket(s.chest)!,
      weapon: socket(s.weapon),
      offhand: socket(s.offhand),
    };

    const channels = n * CH;
    this.target = new Float32Array(channels);
    this.value = new Float32Array(channels);
    this.velocity = new Float32Array(channels);
    this.omega = new Float32Array(channels).fill(30);
    for (let c = 0; c < CH; c++) this.omega[c] = 22;
    if (this.wolf) for (let c = 0; c < CH; c++) this.omega[WJ + c] = 42;
    this.neutral(this.value);
    this.apply();
  }

  private neutral(P: Float32Array) {
    P.fill(0);
    for (let j = SY; j < P.length; j += CH) P[j] = 1;
  }

  update(s: AnimState, dt: number): void {
    if (this.disposed) return;
    dt = Math.min(Math.max(dt, 0), 0.1);
    const alive = s.life === "alive";
    const moving = alive && s.moving;
    // Layer weights ease in and out so nothing switches on a single frame.
    this.wMove = approach(this.wMove, moving ? 1 : 0, 9, dt);
    this.wWalk = approach(this.wWalk, s.returning ? 1 : 0, 5, dt);
    this.speed = approach(
      this.speed,
      moving ? Math.max(0.35, Math.min(1, s.speed)) : this.speed,
      6,
      dt,
    );
    this.wGuard = approach(this.wGuard, alive && s.guarding ? 1 : 0, 16, dt);
    this.wStun = approach(this.wStun, alive && s.stunned ? 1 : 0, 10, dt);
    this.wProud = approach(
      this.wProud,
      alive && (s.healing || s.oath) ? 1 : 0,
      6,
      dt,
    );
    this.wDodge = approach(this.wDodge, alive && s.dodging ? 1 : 0, 18, dt);
    this.wDown = approach(this.wDown, s.life === "downed" ? 1 : 0, 8, dt);
    this.wCrawl = approach(
      this.wCrawl,
      s.life === "downed" && s.moving ? 1 : 0,
      6,
      dt,
    );
    this.wDead = s.life === "dead" ? 1 : approach(this.wDead, 0, 10, dt);
    this.trackAction(s, dt);
    if (this.first) {
      // Spawn straight into the current state instead of easing in from rest.
      this.wMove = moving ? 1 : 0;
      this.wDown = s.life === "downed" ? 1 : 0;
      this.wGuard = alive && s.guarding ? 1 : 0;
    }

    const T = this.target;
    this.neutral(T);
    if (this.wolf) this.poseWolf(s, dt);
    else this.poseHumanoid(s, dt);

    // Critically damped springs toward the layered target.
    const V = this.value,
      Vel = this.velocity;
    if (this.first) {
      V.set(T);
      Vel.fill(0);
      this.first = false;
    } else
      for (let c = 0; c < T.length; c++) {
        const w = this.omega[c];
        const f = 1 + 2 * dt * w,
          oo = w * w,
          hoo = dt * oo,
          hhoo = dt * hoo;
        const inv = 1 / (f + hhoo);
        const x = (f * V[c] + dt * Vel[c] + hhoo * T[c]) * inv;
        Vel[c] = (Vel[c] + hoo * (T[c] - V[c])) * inv;
        V[c] = x;
      }
    // Blinks and the death topple are too quick for the springs.
    const eyes = this.wolf ? WE : E;
    V[eyes + SY] = T[eyes + SY];
    if (s.life === "dead") {
      const fall = this.topple(s.sinceDeath);
      V[M + RZ] = -fall * (Math.PI / 2);
      V[M + PY] = T[M + PY] + fall * (this.wolf ? 0.36 : 0.42);
      Vel[M + RZ] = Vel[M + PY] = 0;
    }
    this.apply();
    this.updateFade(s);
    this.updateFlash(dt);
  }

  /** 0 upright … 1 on its side, with a little bounce. */
  private topple(since: number): number {
    const s = since / 0.5;
    if (s >= 1) return 1;
    if (s < 0.62) {
      const k = s / 0.62;
      return k * k;
    }
    return 1 - Math.sin(((s - 0.62) / 0.38) * Math.PI) * 0.1;
  }

  private trackAction(s: AnimState, dt: number) {
    const a = s.action;
    if (a && s.life === "alive") {
      const u =
        (a.phase === "windup" ? 0 : a.phase === "impact" ? 1 : 2) +
        clamp01(a.t);
      if (a.key !== this.actKey || u < this.actU - 0.25 || !this.act) {
        this.actKey = a.key;
        this.act = this.resolveAction(a.key);
        if (this.act.fx === "roll") this.roll = 0;
      }
      this.actU = u;
      this.wAction = approach(this.wAction, 1, 28, dt);
    } else {
      this.wAction = approach(this.wAction, 0, s.life === "alive" ? 7 : 20, dt);
      if (this.wAction < 0.002) {
        this.act = null;
        this.actKey = null;
      }
    }
    // The roll finishes on its own clock so an early cancel cannot pop.
    if (this.roll >= 0) {
      this.roll += dt / 0.42;
      if (this.roll >= 1) this.roll = -1;
    }
  }

  private resolveAction(key: AbilityKey): Action {
    if (this.wolf) return WOLF_BITE;
    const m = this.motion!;
    return m.actions[key] ?? m.fallback;
  }

  private poseHumanoid(s: AnimState, dt: number) {
    const T = this.target,
      m = this.motion!,
      t = s.time,
      seed = this.seed;
    addPose(T, m.stance, 1);

    // Idle: breathing, wandering gaze, personality beats.
    const idle = (1 - this.wMove) * (1 - this.wDown) * (1 - this.wDead);
    const breath = Math.sin(t * 2.1 + seed * TAU);
    T[H + SY] += 0.024 * breath;
    T[N + RX] += 0.025 * breath;
    T[AL + RZ] += 0.03 * breath * idle;
    T[AR + RZ] -= 0.03 * breath * idle;
    T[N + RY] +=
      0.2 *
      Math.sin(t * 0.37 + seed * 11) *
      Math.sin(t * 0.19 + seed * 3) *
      idle;
    T[N + RZ] += 0.06 * Math.sin(t * 0.29 + seed * 5) * idle;
    if (idle > 0.01) m.personality(T, t, idle, seed);

    // Run cycle: legs ±40°, opposite arm swing, bouncy squash and a lean.
    const sp = this.speed;
    if (this.wMove > 0.001 || this.wCrawl > 0.001)
      this.phase +=
        dt * TAU * (1.3 + 1.05 * sp) * (this.wCrawl > 0.5 ? 0.45 : 1);
    const w = this.wMove;
    if (w > 0.001) {
      const sn = Math.sin(this.phase),
        cs = Math.cos(this.phase);
      const amp = (0.45 + 0.3 * sp) * m.legSwing * w;
      T[LL + RX] -= amp * sn;
      T[LR + RX] += amp * sn;
      T[AL + RX] += amp * 0.9 * m.armSwingL * sn;
      T[AR + RX] -= amp * 0.9 * m.armSwingR * sn;
      T[AL + RZ] += 0.07 * w;
      T[AR + RZ] -= 0.07 * w;
      const lift = 0.4 * (1 - Math.cos(amp * Math.abs(sn)));
      T[M + PY] += 0.08 * sp * Math.abs(cs) * w - lift * 0.85;
      T[M + SY] += 0.08 * sp * (Math.abs(cs) - 0.5) * w;
      T[H + RX] += (0.14 + 0.1 * sp) * w;
      T[H + RY] += 0.14 * sn * w;
      T[N + RX] -= 0.09 * w;
      T[N + RZ] += 0.05 * sn * w;
    }

    if (this.wGuard > 0.001) blendPose(T, m.guard, this.wGuard);
    if (this.wProud > 0.001) blendPose(T, PROUD, this.wProud);
    if (this.wStun > 0.001) {
      const k = this.wStun,
        ws = t * 5.5;
      mix(T, N + RZ, 0.3 * Math.sin(ws), k);
      mix(T, N + RX, 0.16 + 0.1 * Math.cos(ws), k);
      mix(T, H + RZ, 0.07 * Math.sin(ws * 0.5), k);
      mix(T, AL + RX, 0.12, k);
      mix(T, AR + RX, 0.12, k);
      mix(T, AL + RZ, 0.16 + 0.07 * Math.sin(ws), k);
      mix(T, AR + RZ, -0.16 - 0.07 * Math.sin(ws), k);
      T[M + PY] -= 0.03 * k;
    }
    if (this.wDodge > 0.001) blendPose(T, DASH, this.wDodge);

    // Ability motion on top; legs keep running while the actor moves.
    if (this.act && this.wAction > 0.001) {
      applyAction(T, this.act, this.actU, this.wAction, 1 - this.wMove);
      if (this.act.tremble && this.actU < 1) {
        const k = this.act.tremble * this.actU;
        T[H + RZ] += Math.sin(t * 57) * k;
        T[M + PX] += Math.sin(t * 63 + 1) * k * 0.4;
      }
      if (this.act.fx === "shake" && this.actU > 1 && this.actU < 2.3) {
        const k = Math.min(1, 2.3 - this.actU) * this.wAction;
        T[H + RZ] += Math.sin(t * 42) * 0.2 * k;
        T[N + RZ] += Math.sin(t * 42 + 1.3) * 0.22 * k;
      }
    }
    this.flinch(s, M, H, N, AL, AR);

    if (this.wDown > 0.001) {
      blendPose(T, DOWN, this.wDown);
      T[H + SY] += 0.02 * Math.sin(t * 3.2) * this.wDown;
      if (this.wCrawl > 0.001) {
        blendPose(T, CRAWL, this.wCrawl);
        const sn = Math.sin(this.phase);
        T[AL + RX] += 0.45 * sn * this.wCrawl;
        T[AR + RX] -= 0.45 * sn * this.wCrawl;
        T[LL + RX] -= 0.25 * sn * this.wCrawl;
        T[LR + RX] += 0.25 * sn * this.wCrawl;
        T[M + RZ] += 0.06 * sn * this.wCrawl;
      }
    }
    if (this.wDead > 0.001) blendPose(T, DEAD, this.wDead);

    // Eyes: blink, sleepy when downed, shut when dead.
    let lid = blinkAt(t, seed);
    if (s.life === "downed") lid = Math.max(lid, 0.45);
    if (s.life === "dead") lid = 1;
    if (s.stunned) lid = Math.max(lid, 0.35);
    T[E + SY] = 1 - 0.88 * lid;
  }

  private poseWolf(s: AnimState, dt: number) {
    const T = this.target,
      t = s.time,
      seed = this.seed;
    addPose(T, WOLF_STANCE, 1);
    const idle = (1 - this.wMove) * (1 - this.wDead);
    const breath = Math.sin(t * 2.6 + seed * TAU);
    T[WB + SY] += 0.03 * breath;
    T[WN + RX] += 0.03 * breath;
    T[WT + RY] += 0.32 * Math.sin(t * 5.2 + seed * 7) * idle;
    T[WN + RY] +=
      0.32 * Math.sin(t * 0.41 + seed * 9) * Math.sin(t * 0.23 + seed) * idle;
    const sniff = bump(t, 6.1, 1.6, seed * 8) * idle;
    T[WN + RX] += 0.42 * sniff;
    T[WN + RZ] += 0.12 * sniff;
    T[WJ + RX] += 0.08 * sniff * Math.max(0, Math.sin(t * 18));

    const w = this.wMove,
      sp = this.speed,
      walk = this.wWalk;
    if (w > 0.001) {
      this.phase += dt * TAU * (1.7 + 1.0 * sp);
      this.gait += dt * TAU * 1.05;
      // Trot: diagonal pairs.
      const sn = Math.sin(this.phase),
        cs = Math.cos(this.phase);
      const trot = w * (1 - walk),
        amp = 0.5 + 0.25 * sp;
      T[FL + RX] -= amp * sn * trot;
      T[BR + RX] -= amp * sn * trot;
      T[FR + RX] += amp * sn * trot;
      T[BL + RX] += amp * sn * trot;
      T[M + PY] += (0.06 * sp * Math.abs(cs) - 0.04) * trot;
      T[WB + RX] += 0.05 * Math.sin(this.phase * 2) * trot;
      T[WN + RX] += (-0.06 * Math.sin(this.phase * 2) - 0.1) * trot;
      T[WT + RX] += (0.35 + 0.1 * cs) * trot;
      T[WT + RY] += 0.18 * sn * trot;
      // Walk (returning home): four-beat, head and tail low.
      const g = this.gait,
        wk = w * walk;
      T[BL + RX] += 0.38 * Math.sin(g) * wk;
      T[FL + RX] += 0.38 * Math.sin(g + Math.PI / 2) * wk;
      T[BR + RX] += 0.38 * Math.sin(g + Math.PI) * wk;
      T[FR + RX] += 0.38 * Math.sin(g + Math.PI * 1.5) * wk;
      T[M + PY] += 0.015 * Math.sin(g * 2) * wk;
      T[WN + RX] += 0.22 * wk;
      T[WT + RX] -= 0.45 * wk;
      T[WT + RY] += 0.1 * Math.sin(g) * wk;
    }

    if (this.wStun > 0.001) {
      const k = this.wStun,
        ws = t * 5.5;
      mix(T, WN + RZ, 0.32 * Math.sin(ws), k);
      mix(T, WN + RX, 0.2 + 0.1 * Math.cos(ws), k);
      mix(T, WB + RZ, 0.06 * Math.sin(ws * 0.5), k);
      mix(T, WT + RX, -0.3, k);
      mix(T, WJ + RX, 0.3, k);
    }
    if (this.wGuard > 0.001) {
      mix(T, M + PY, -0.08, this.wGuard);
      mix(T, WN + RX, 0.25, this.wGuard);
      mix(T, WJ + RX, 0.3, this.wGuard);
    }
    if (this.act && this.wAction > 0.001) {
      applyAction(T, this.act, this.actU, this.wAction, 1 - this.wMove);
      if (this.actU < 1) {
        const k = this.act.tremble * this.actU;
        T[WB + RZ] += Math.sin(t * 61) * k;
        T[WJ + RX] += Math.max(0, Math.sin(t * 23)) * 0.12 * this.actU;
      }
    }
    this.flinch(s, M, WB, WN, -1, -1);
    if (this.wDown > 0.001) blendPose(T, WOLF_DOWN, this.wDown);
    if (this.wDead > 0.001) blendPose(T, WOLF_DEAD, this.wDead);

    let lid = blinkAt(t, seed) * 0.8;
    if (s.life !== "alive") lid = 1;
    T[WE + SY] = 1 - 0.85 * lid;
  }

  /** Recoil from a confirmed hit: lean back, squash, head snaps, arms fly. */
  private flinch(
    s: AnimState,
    model: number,
    body: number,
    head: number,
    armL: number,
    armR: number,
  ) {
    if (!(s.sinceHit < 0.3) || s.life === "dead") return;
    const x = s.sinceHit / 0.3;
    const k = (1 - x) * (1 - x) * Math.min(1, s.sinceHit * 40 + 0.35);
    const T = this.target;
    T[model + RX] -= 0.2 * k;
    T[model + PZ] -= 0.09 * k;
    T[model + SY] -= 0.15 * k;
    T[body + RX] -= 0.18 * k;
    T[head + RX] -= 0.28 * k;
    if (armL >= 0) {
      T[armL + RZ] += 0.45 * k;
      T[armR + RZ] -= 0.45 * k;
      T[armL + RX] -= 0.3 * k;
      T[armR + RX] -= 0.3 * k;
    }
  }

  private apply() {
    const V = this.value;
    for (let j = 0; j < this.nodes.length; j++) {
      const node = this.nodes[j],
        c = j * CH,
        r = j * 3;
      node.position.set(
        this.rest[r] + V[c + PX],
        this.rest[r + 1] + V[c + PY],
        this.rest[r + 2] + V[c + PZ],
      );
      node.rotation.set(V[c + RX], V[c + RY], V[c + RZ]);
      const sy = Math.max(0.05, V[c + SY]);
      const k = this.squash[j] ? 1 / Math.sqrt(sy) : 1;
      node.scaling.set(
        this.restScale[r] * k,
        this.restScale[r + 1] * sy,
        this.restScale[r + 2] * k,
      );
    }
    // Forward roll about the belly rather than the feet.
    if (this.roll >= 0) {
      const p = this.roll,
        a = TAU * (p * p * (3 - 2 * p));
      const model = this.nodes[0],
        hc = 0.62;
      model.rotation.x += a;
      model.position.y += hc * (1 - Math.cos(a));
      model.position.z -= hc * Math.sin(a);
    }
  }

  private updateFade(s: AnimState) {
    let fade = 1;
    if (this.wolf && s.life === "dead") {
      const f = clamp01((s.sinceDeath - 1.5) / 0.4);
      fade = 1 - f;
      this.scaleNode.scaling.setAll(this.baseScale * (1 - 0.85 * f * f));
    } else if (this.scaleNode.scaling.x !== this.baseScale)
      this.scaleNode.scaling.setAll(this.baseScale);
    if (fade !== this.fadeAlpha) {
      this.fadeAlpha = fade;
      this.applyAlpha();
    }
  }

  private updateFlash(dt: number) {
    if (this.flashLeft <= 0) return;
    this.flashLeft -= dt;
    const done = this.flashLeft <= 0;
    // Solid white for the first frames, then a quick fade.
    const k = done ? 0 : Math.min(1, (1.6 * this.flashLeft) / this.flashTime);
    for (const mesh of this.meshes) {
      mesh.overlayAlpha = 0.92 * k;
      if (done) mesh.renderOverlay = false;
    }
  }

  flash(color: Color3 = WHITE, duration = 0.14): void {
    if (this.disposed) return;
    this.flashColor.copyFrom(color);
    this.flashTime = this.flashLeft = Math.max(0.02, duration);
    for (const mesh of this.meshes) {
      mesh.renderOverlay = true;
      mesh.overlayColor.copyFrom(this.flashColor);
      mesh.overlayAlpha = 0.92;
    }
  }

  setVisibility(alpha: number): void {
    this.userAlpha = clamp01(alpha);
    this.applyAlpha();
  }

  private applyAlpha() {
    const a = this.userAlpha * this.fadeAlpha;
    if (a === this.appliedAlpha) return;
    this.appliedAlpha = a;
    for (const mesh of this.meshes) {
      mesh.visibility = a;
      mesh.isVisible = a > 0.002;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.shadow)
      for (const mesh of this.casters)
        try {
          this.shadow.removeShadowCaster(mesh, false);
        } catch {
          // The generator may already be gone with the scene.
        }
    this.casters.length = 0;
    this.root.dispose(false, false);
    this.meshes.length = 0;
  }
}

export const createCharacter: CreateCharacter = (scene, kind, options) =>
  new VoxelCharacter(scene, kind, options);
