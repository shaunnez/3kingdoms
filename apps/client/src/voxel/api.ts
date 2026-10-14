/**
 * Module contracts for the voxel presentation. Each module implements one of
 * these shapes; scene.ts composes them. Presentation only: the server (or the
 * in-browser World) owns positions, damage and every rule.
 */
import type {
  AbstractMesh,
  Color3,
  Mesh,
  Scene,
  ShadowGenerator,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import type {
  AbilityKey,
  CombatEvent,
  Life,
  Snapshot,
} from "../../../../packages/contracts/game";
import type { VoxelGrid } from "./grid";

// ───────────────────────────── world-gen.ts (pure data) ─────────────────────────────

export type StructureKind =
  | "house"
  | "tower"
  | "arch"
  | "wall"
  | "tree"
  | "ruin"
  | "stall"
  | "landmark"
  | "prop";
export type StructureInfo = {
  name: string;
  kind: StructureKind;
  /** Fades when it hides the player from the camera. Meshed separately. */
  fade: boolean;
  /** Inclusive voxel bounds in the world grid. */
  min: [number, number, number];
  max: [number, number, number];
};
export type WorldLight = {
  x: number;
  y: number;
  z: number;
  /** CSS hex colour. */
  color: string;
  /** Rough brightness, 0..1; scene decides real intensity. */
  intensity: number;
  kind: "lantern" | "window" | "campfire" | "magic" | "rune" | "crystal";
};
export type WorldEmitter = {
  kind:
    | "chimney"
    | "campfire"
    | "waterfall"
    | "steam"
    | "sparks"
    | "fireflies"
    | "petals"
    | "leaves"
    | "fish"
    | "butterflies"
    | "astrolabe"
    | "splash";
  x: number;
  y: number;
  z: number;
  /** Optional area half-extents for area emitters (fireflies, petals, fish). */
  rx?: number;
  rz?: number;
  /** Optional colour hint (CSS hex). */
  color?: string;
};
export type MinimapImage = {
  width: number;
  height: number;
  /** World x/z of pixel (0, 0)'s minimum corner; +x right, +z UP the image (north up). */
  originX: number;
  originZ: number;
  metersPerPixel: number;
  /** RGBA rows, row 0 is the NORTH edge (largest z). */
  rgba: Uint8ClampedArray;
};
export interface VoxelWorld {
  /** Block ids (see blocks.ts). */
  grid: VoxelGrid;
  /** Per voxel: 0 = terrain, otherwise structures[owner - 1]. */
  owner: Uint16Array;
  structures: StructureInfo[];
  lights: WorldLight[];
  emitters: WorldEmitter[];
  /** Visual standing height in metres at a world x/z (0 on paths and plaza). */
  surfaceHeight(x: number, z: number): number;
  /** Water surface height in metres, or null when the column has no water. */
  waterHeight(x: number, z: number): number | null;
  minimap: MinimapImage;
  /** Deterministic seed used to build this world. */
  seed: number;
}

// ───────────────────────────── world-mesh.ts (Babylon) ─────────────────────────────

export type StructureView = {
  mesh: Mesh;
  info: StructureInfo;
  /** World-space bounds for occlusion tests. */
  min: Vector3;
  max: Vector3;
};
export interface WorldView {
  root: TransformNode;
  chunks: Mesh[];
  structures: StructureView[];
  water: Mesh | null;
  /** Meshes that should glow (lanterns, windows, runes): add to the GlowLayer. */
  emissiveMeshes: Mesh[];
  /** 0 = full day, 1 = deep night. Drives lantern/window emission. */
  setNight(amount: number): void;
  /** Water motion, foliage sway, lantern flicker. */
  update(dt: number, time: number): void;
  /** Fade fade-able structures that sit between camera and focus. */
  updateOcclusion(camera: Vector3, focus: Vector3, dt: number): void;
  dispose(): void;
}

// ───────────────────────────── characters.ts (Babylon) ─────────────────────────────

export type CharacterKind =
  "knight" | "cyborg" | "guard" | "mara" | "merchant" | "wolf";
export type ActionPhase = "windup" | "impact" | "recovery";
export type AnimState = {
  /** Seconds since scene start (monotonic, presentation clock). */
  time: number;
  moving: boolean;
  /** 0..1, 1 = full run speed. */
  speed: number;
  life: Life;
  dodging: boolean;
  guarding: boolean;
  stunned: boolean;
  healing: boolean;
  oath: boolean;
  returning: boolean;
  /** Current ability motion, if any; `progress` 0..1 across windup+recovery. */
  action: {
    key: AbilityKey;
    phase: ActionPhase;
    /** 0..1 within the current phase. */
    t: number;
    progress: number;
  } | null;
  /** Seconds since the last confirmed hit on this actor (large if none). */
  sinceHit: number;
  /** Seconds since this actor died (0 while alive). */
  sinceDeath: number;
};
export interface CharacterRig {
  kind: CharacterKind;
  /** Positioned/rotated by scene.ts: position = (x, ground, z), rotation.y = heading. Faces local +Z. */
  root: TransformNode;
  /** All renderable meshes (picking metadata, shadows, outline/highlight). */
  meshes: Mesh[];
  /** Approximate top of head in metres, for labels and status effects. */
  height: number;
  /** Anchors for VFX: weapon tip (sword trail / muzzle), off-hand, head, chest. */
  sockets: {
    head: TransformNode;
    chest: TransformNode;
    weapon?: TransformNode;
    offhand?: TransformNode;
  };
  update(state: AnimState, dt: number): void;
  /** Cartoon hit flash (white by default). */
  flash(color?: Color3, duration?: number): void;
  /** 0..1 visibility for ghosting/afterimages/fade-out. */
  setVisibility(alpha: number): void;
  dispose(): void;
}
export type CreateCharacter = (
  scene: Scene,
  kind: CharacterKind,
  options: { id: string; shadow?: ShadowGenerator | null; scale?: number },
) => CharacterRig;

// ───────────────────────────── vfx (Babylon) ─────────────────────────────

export interface VfxHooks {
  /** Smoothed visual root position (x, ground, z) of an actor. */
  position(id: string): Vector3 | undefined;
  rig(id: string): CharacterRig | undefined;
  selfId(): string;
  groundHeight(x: number, z: number): number;
  /** Camera shake; intensity in metres of jitter, duration in seconds. */
  shake(intensity: number, duration: number): void;
  /** Brief presentation freeze for weighty impacts (seconds, ≤ 0.12). */
  hitStop(duration: number): void;
  /** Full-screen colour pulse (CSS hex) e.g. red when the player is hurt. */
  flashScreen(color: string, strength: number): void;
  /** Add meshes to the glow layer (emissive VFX). */
  glow(mesh: AbstractMesh): void;
}
export interface CombatVfxModule {
  low: boolean;
  /** One-shot: server-confirmed combat events (hit, resolve, cast, death, level…). */
  event(e: CombatEvent, snapshot: Snapshot): void;
  /** Persistent: statuses, projectiles, mines, drones, telegraphs. */
  update(dt: number, snapshot: Snapshot): void;
  metrics(): { meshes: number; burstSystems: number; particles: number };
  dispose(): void;
}
export type AmbientContext = {
  time: number;
  /** 0..1 day phase: 0 midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset. */
  dayPhase: number;
  /** 0 day … 1 night. */
  night: number;
  /** Player position, if in the world. */
  focus: Vector3 | null;
  camera: Vector3;
  /** Current quest objective for the guiding beacon, or null. */
  objective: { x: number; z: number } | null;
};
export interface AmbientVfxModule {
  low: boolean;
  update(dt: number, context: AmbientContext): void;
  metrics(): { systems: number; particles: number; meshes: number };
  dispose(): void;
}
