/**
 * The voxel GameScene: engine, camera, sky and day/night, lights, shadows,
 * post-processing, the generated world, chibi characters, combat and ambient
 * effects, picking and screen feedback. Presentation only: the authoritative
 * World (in the page or on the server) owns positions, damage and every rule.
 */
import {
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  GlowLayer,
  HemisphericLight,
  Material,
  Matrix,
  Mesh,
  MeshBuilder,
  PointLight,
  Scene,
  SceneInstrumentation,
  SelectionOutlineLayer,
  ShadowGenerator,
  StandardMaterial,
  TransformNode,
  Vector3,
  type AbstractMesh,
  type Light,
} from "@babylonjs/core";
import type {
  AbilityKey,
  ActorView,
  CombatEvent,
  Life,
  Snapshot,
  Vec2,
} from "../../../packages/contracts/game";
import { KITS } from "../../../packages/contracts/game";
import { NPCS } from "../../../packages/simulation/map";
import { actionState, KNIGHT_MOTION } from "./combat-presentation";
import type {
  AmbientContext,
  AnimState,
  CharacterKind,
  CharacterRig,
  CombatVfxModule,
  VfxHooks,
  VoxelWorld,
  WorldLight,
  WorldView,
} from "./voxel/api";
import { getWorld } from "./voxel/world-gen";
import { buildWorldView, type WorldViewStats } from "./voxel/world-mesh";
import {
  characterGlowMeshes,
  characterKind,
  characterStats,
  createCharacter,
  preloadCharacters,
} from "./voxel/characters";
import { CombatVfx } from "./vfx/combat-vfx";
import { AmbientVfx } from "./vfx/ambient";
import { Sky, computeSky, createSkyState, type SkyState } from "./scene-sky";
import { ScreenPost, type QualityLevel } from "./scene-post";
import {
  ElementalStudy,
  HoundStudy,
  StressFixture,
  idleState,
  type StudyHost,
} from "./scene-studies";

export type { QualityLevel } from "./scene-post";

export type RenderMetrics = {
  fps: number;
  draws: number;
  triangles: number;
  activeTriangles: number;
  trianglesAcrossPasses: number;
  meshes: number;
  textures: number;
  materials: number;
  skeletons: number;
  animationGroups: number;
  gpu: ReturnType<Engine["getGlInfo"]>;
  heapBytes: number | null;
  assetReadyAfterNavigationMs: number;
  frameSamples: number[];
  frameCount: number;
  renderer: string;
  assets: string[];
  studyMotion: string | null;
  combatEffects: ReturnType<CombatVfxModule["metrics"]>;
  /** Ambient effects (extra to the original fields). */
  ambient: { systems: number; particles: number; meshes: number };
  dayPhase: number;
  quality: QualityLevel;
  camera: { alpha: number; beta: number; radius: number };
  actorAudit: {
    model: string;
    clip: string;
    position: number[];
    meshes: {
      name: string;
      enabled: boolean;
      visible: boolean;
      bounds: number[];
      scale: number[];
      skeleton: boolean;
    }[];
  }[];
};

// Gameplay camera defaults (unchanged from the previous scene).
const CAMERA_ALPHA = -Math.PI / 2 - 0.18;
const CAMERA_BETA = 0.79;
const CAMERA_RADIUS = 26;
const MIN_RADIUS = 18;
const MAX_RADIUS = 36;
// Attract mode: a slow, lower orbit of Highcross so the sky shows.
const ATTRACT_CENTRE = new Vector3(0, 3.2, -10);
const ATTRACT_BETA = 1.3;
const ATTRACT_RADIUS = 40;
const ATTRACT_FOV = 0.74;
const CAMERA_FOV = 0.52;
const HANDOFF_SECONDS = 1.8;
const DAY_SECONDS = 12 * 60;
const RUN_SPEED = 4.5;
// Sky + sun/moon + 3 lamp lights + the ambient campfire light = 6. A seventh
// light made every receiver lose its shadow (Babylon 9, observed under
// SwiftShader), so lit materials are capped at six and lamps share the budget.
const MAX_LIGHTS = 6;
const POINT_LIGHTS = 3;
const SHADOW_FRUSTUM = 48;
const SHADOW_MAP = 2048;
const RING_COLORS = {
  self: "#9ff3ff",
  selected: "#ffd45e",
  outlaw: "#ff4a5a",
} as const;

type Motion = {
  key: AbilityKey;
  start: number;
  windup: number;
  impact: number;
  recovery: number;
};
type ActorVisual = {
  id: string;
  kind: CharacterKind;
  rig: CharacterRig;
  state: AnimState;
  /** Reused action object handed to the rig while a motion plays. */
  action: ActionOut;
  /** Smoothed visual ground height and the step-up hop timer. */
  y: number;
  hop: number;
  lastGround: number;
  speed: number;
  movingUntil: number;
  castStarted: number;
  castEvent: number;
  motion: Motion | null;
  hitAt: number;
  deathAt: number;
  life: Life;
  ring: Mesh | null;
  ringKind: keyof typeof RING_COLORS | null;
  /** Whether the rig's meshes are in the shadow map's caster list. */
  casting: boolean;
};
type LightSlot = {
  light: PointLight;
  current: WorldLight | null;
  next: WorldLight | null;
  fade: number;
};
type ActionOut = NonNullable<AnimState["action"]>;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeInOut = (t: number) => t * t * (3 - 2 * t);
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const isFiniteNumber = (v: number) => Number.isFinite(v);

export class GameScene {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly camera: ArcRotateCamera;
  onSelect: (id: string) => void = () => {};
  onGround: (pos: Vec2) => void = () => {};
  onFrame: () => void = () => {};

  private world: VoxelWorld | null = null;
  private worldView: (WorldView & { stats: WorldViewStats }) | null = null;
  private combatVfx: CombatVfx | null = null;
  private ambientVfx: AmbientVfx | null = null;
  private hemi: HemisphericLight;
  private sun: DirectionalLight;
  private shadow: ShadowGenerator;
  private slots: LightSlot[] = [];
  private lightCandidates: WorldLight[] = [];
  private lightsCheckedAt = -1;
  private sky: Sky;
  private skyState = createSkyState();
  private post: ScreenPost;
  private glowLayer: GlowLayer;
  private selectionLayer: SelectionOutlineLayer;
  private inkLayer: SelectionOutlineLayer | null = null;
  private inkDirty = true;
  private selectionShown = "";
  private selectionRed = false;
  private actors = new Map<string, ActorVisual>();
  private ringMaterials = new Map<string, StandardMaterial>();
  private snapshot: Snapshot | null = null;
  private snapshotReceived = 0;
  private lastEvent = 0;
  private selfId = "";
  private selected = "";
  private hooks: VfxHooks;
  // Clocks: `time` is real seconds; `ptime` is the presentation clock that
  // hit-stop slows (rigs, VFX, camera). Network and simulation never slow.
  private time = 0;
  private ptime = 0;
  private lastFrame = performance.now();
  private frames: number[] = [];
  private frameCount = 0;
  private assetReady = 0;
  private loadingReport: string[] = [];
  private instrumentation: SceneInstrumentation;
  private level: QualityLevel = "medium";
  // Day/night.
  private phase = 0.32;
  private dayCycle = true;
  private frozenPhase: number | null = null;
  // Camera.
  private follow = new Vector3(0, 0.6, -6);
  /** The camera keeps a reference to this vector; only ever mutate it. */
  private camTarget = ATTRACT_CENTRE.clone();
  private alphaGoal = CAMERA_ALPHA;
  private radiusGoal = CAMERA_RADIUS;
  private betaGoal = CAMERA_BETA;
  private attract = true;
  private attractAngle = CAMERA_ALPHA;
  private handoff = -1;
  private handoffFrom = { alpha: 0, beta: 0, radius: 0, target: new Vector3() };
  private shakeAmp = 0;
  private shakeLeft = 0;
  private shakeTime = 0;
  private jitter = new Vector3();
  private studyCamera: {
    alpha: number;
    beta: number;
    radius: number;
  } | null = null;
  // Hit-stop.
  private stopUntil = 0;
  private stopBudget = 0.2;
  // Click marker.
  private marker: TransformNode;
  private markerRing: Mesh;
  private markerArrow: Mesh;
  private markerMaterial: StandardMaterial;
  private markerAge = 99;
  // Studies.
  private stressFixture: StressFixture | null = null;
  private houndStudy: HoundStudy | null = null;
  private elemental: ElementalStudy | null = null;
  // Materials frozen by modules that must recompile when the light set changes.
  private refreeze: Material[] = [];
  private refreezeFrames = 0;
  private disposed = false;
  private cleanup: (() => void)[] = [];
  // Scratch.
  private v0 = new Vector3();
  private v1 = new Vector3();
  private focus = new Vector3();
  private projectOut = new Vector3();

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly onProgress: (text: string) => void,
  ) {
    this.engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.engine.setHardwareScalingLevel(this.scalingFor("medium"));
    const s = (this.scene = new Scene(this.engine));
    s.useRightHandedSystem = true;
    s.skipPointerMovePicking = true;
    s.fogMode = Scene.FOGMODE_EXP2;
    s.fogDensity = 0.0065;
    s.clearColor = new Color4(0.8, 0.9, 1, 1);
    this.instrumentation = new SceneInstrumentation(s);
    const fixed = Number(
      new URLSearchParams(location.search).get("time") ?? "NaN",
    );
    if (isFiniteNumber(fixed) && fixed >= 0 && fixed <= 1) {
      this.frozenPhase = fixed;
      this.phase = fixed;
    }

    this.camera = new ArcRotateCamera(
      "camera",
      CAMERA_ALPHA,
      ATTRACT_BETA,
      ATTRACT_RADIUS,
      this.camTarget,
      s,
    );
    this.camera.fov = ATTRACT_FOV;
    this.camera.minZ = 0.2;
    this.camera.maxZ = 320;
    this.camera.lowerRadiusLimit = 6;
    this.camera.upperRadiusLimit = 60;

    // Lights: hemisphere and sun/moon first so every material always has them.
    this.hemi = new HemisphericLight("sky-light", new Vector3(0, 1, 0), s);
    this.sun = new DirectionalLight(
      "sun-and-moon",
      new Vector3(-0.42, -0.82, 0.38),
      s,
    );
    this.sun.shadowFrustumSize = SHADOW_FRUSTUM;
    this.sun.shadowMinZ = 1;
    this.sun.shadowMaxZ = 140;
    this.shadow = new ShadowGenerator(SHADOW_MAP, this.sun);
    this.shadow.usePercentageCloserFiltering = true;
    this.shadow.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
    this.shadow.setDarkness(0.38);
    for (let i = 0; i < POINT_LIGHTS; i++) {
      const light = new PointLight(`world-light-${i}`, new Vector3(), s);
      light.intensity = 0;
      light.range = 9;
      light.specular = Color3.Black();
      this.slots.push({ light, current: null, next: null, fade: 0 });
    }
    s.onNewLightAddedObservable.add((light) => this.watchLight(light));
    s.onLightRemovedObservable.add(() => this.relightFrozen());
    s.onNewMaterialAddedObservable.add((m) => this.pendingMaterials.push(m));

    this.sky = new Sky(s);
    this.post = new ScreenPost(s, this.camera);
    this.glowLayer = new GlowLayer("glow", s, {
      mainTextureSamples: 1,
      blurKernelSize: 32,
      mainTextureRatio: 0.5,
    });
    this.glowLayer.intensity = 0.6;
    this.selectionLayer = new SelectionOutlineLayer("selection", s, {
      useDepthOcclusion: false,
      mainTextureRatio: 1,
    });
    this.selectionLayer.outlineColor = Color3.FromHexString("#ffd45e");
    this.selectionLayer.outlineThickness = 3;
    this.setInkOutline(true);

    this.hooks = {
      position: (id) => this.actors.get(id)?.rig.root.position,
      rig: (id) => this.actors.get(id)?.rig,
      selfId: () => this.selfId,
      groundHeight: (x, z) => this.world?.surfaceHeight(x, z) ?? 0,
      shake: (intensity, duration) => this.shake(intensity, duration),
      hitStop: (duration) => this.hitStop(duration),
      flashScreen: (color, strength) => {
        if (this.level === "low") strength *= 0.7;
        this.post.flashScreen(color, strength);
      },
      glow: (mesh) => this.addGlow(mesh),
    };

    // Click marker: a squashy ring and a bouncing arrow.
    this.markerMaterial = new StandardMaterial("click-marker", s);
    this.markerMaterial.disableLighting = true;
    this.markerMaterial.emissiveColor = Color3.FromHexString("#ffd45e");
    this.marker = new TransformNode("click-marker", s);
    this.markerRing = MeshBuilder.CreateTorus(
      "click-marker-ring",
      { diameter: 0.9, thickness: 0.09, tessellation: 20 },
      s,
    );
    this.markerArrow = MeshBuilder.CreateCylinder(
      "click-marker-arrow",
      { diameterTop: 0.42, diameterBottom: 0, height: 0.46, tessellation: 4 },
      s,
    );
    for (const m of [this.markerRing, this.markerArrow]) {
      m.parent = this.marker;
      m.material = this.markerMaterial;
      m.isPickable = false;
    }
    this.markerRing.scaling.y = 0.5;
    this.marker.setEnabled(false);

    this.bindInput();
    this.engine.runRenderLoop(() => this.frame());
  }

  // ───────────────────────────── loading ─────────────────────────────

  async load() {
    const step = async (text: string) => {
      this.onProgress(text);
      // Let the entrance paint the progress line before the next block of work.
      await new Promise((r) => setTimeout(r, 16));
      if (this.disposed) throw new Error("Scene disposed while loading");
    };
    const timed = <T>(name: string, work: () => T): T => {
      const t0 = performance.now();
      const out = work();
      this.loadingReport.push(
        `${name}:${Math.round(performance.now() - t0)}ms`,
      );
      return out;
    };
    await step("Stacking the blocks of Highcross…");
    const world = timed("world", () => getWorld());
    this.world = world;
    await step("Painting the meadow and the river…");
    const view = timed("world-mesh", () =>
      buildWorldView(this.scene, world, { shadow: this.shadow }),
    );
    this.worldView = view;
    for (const mesh of view.emissiveMeshes) this.addGlow(mesh);
    this.lightCandidates = world.lights.filter(
      (l) => l.kind === "lantern" || l.kind === "magic",
    );
    await step("Waking the travellers of Highcross…");
    timed("characters", () => preloadCharacters(this.scene));
    await step("Lighting the lanterns…");
    this.combatVfx = timed(
      "combat-vfx",
      () => new CombatVfx(this.scene, this.hooks),
    );
    this.ambientVfx = timed(
      "ambient-vfx",
      () => new AmbientVfx(this.scene, world, this.hooks),
    );
    this.applyQualityToModules();
    this.fixMaterials();
    await step("Warming up the shaders…");
    const t0 = performance.now();
    // Compile shaders up front, but never let a stubborn effect block entry.
    await Promise.race([
      this.scene.whenReadyAsync(),
      new Promise((r) => setTimeout(r, 8000)),
    ]);
    this.loadingReport.push(`shaders:${Math.round(performance.now() - t0)}ms`);
    this.loadingReport.push(
      `world-mesh:${view.stats.meshes} meshes/${view.stats.triangles} tris`,
    );
    for (const c of characterStats(this.scene))
      this.loadingReport.push(`${c.kind}:${c.triangles} tris`);
    this.onProgress("Ready");
    this.assetReady = performance.now();
  }

  // ───────────────────────────── public API ─────────────────────────────

  get dayPhase(): number {
    return this.phase;
  }

  setDayCycle(enabled: boolean) {
    this.dayCycle = enabled;
  }

  setQuality(level: QualityLevel) {
    this.level = level;
    this.engine.setHardwareScalingLevel(this.scalingFor(level));
    const shadows = level !== "low";
    if (this.sun.shadowEnabled !== shadows) {
      this.sun.shadowEnabled = shadows;
      this.relightFrozen();
    }
    this.shadow.filteringQuality =
      level === "high"
        ? ShadowGenerator.QUALITY_HIGH
        : ShadowGenerator.QUALITY_MEDIUM;
    this.post.setQuality(level);
    this.glowLayer.blurKernelSize = level === "low" ? 16 : 32;
    this.setInkOutline(level !== "low");
    this.applyQualityToModules();
  }

  /** Legacy toggle: low or the default medium quality. */
  quality(low: boolean) {
    this.setQuality(low ? "low" : "medium");
  }

  setSnapshot(s: Snapshot) {
    const first = !this.snapshot;
    this.snapshot = s;
    this.snapshotReceived = this.time;
    this.selfId = s.self.id;
    for (const event of s.events)
      if (event.id > this.lastEvent) {
        this.lastEvent = event.id;
        // Skip stale history on join so it does not replay as a burst.
        if (first && s.now - event.at > 0.6) continue;
        this.showEvent(event, s);
      }
  }

  select(id: string) {
    this.selected = id;
  }

  rotate(direction: number) {
    this.alphaGoal += (direction * Math.PI) / 2;
  }

  project(
    pos: Vec2,
    height = 2.25,
  ): { x: number; y: number; visible: boolean } {
    const w = this.engine.getRenderWidth(),
      h = this.engine.getRenderHeight();
    const ground = this.world?.surfaceHeight(pos.x, pos.z) ?? 0;
    const p = Vector3.ProjectToRef(
      this.v0.set(pos.x, ground + height, pos.z),
      Matrix.IdentityReadOnly,
      this.scene.getTransformMatrix(),
      this.camera.viewport.toGlobal(w, h),
      this.projectOut,
    );
    return {
      x: (p.x * this.canvas.clientWidth) / w,
      y: (p.y * this.canvas.clientHeight) / h,
      visible:
        p.z >= 0 && p.z <= 1 && p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h,
    };
  }

  direction(x: number, z: number): Vec2 {
    // The settled camera heading, so input stays stable while it turns.
    const alpha = this.alphaGoal;
    const fx = -Math.cos(alpha),
      fz = -Math.sin(alpha);
    return { x: fx * z - fz * x, z: fz * z + fx * x };
  }

  get aim(): Vec2 {
    const p = this.groundPick(this.scene.pointerX, this.scene.pointerY);
    return p ? { x: p.x, z: p.z } : { x: 0, z: 0 };
  }

  metrics(): RenderMetrics {
    const active = this.scene.getActiveMeshes();
    const unique = new Set<AbstractMesh>();
    for (let i = 0; i < active.length; i++) unique.add(active.data[i]);
    let activeTriangles = 0;
    for (const m of unique) activeTriangles += m.getTotalIndices() / 3;
    return {
      fps: this.engine.getFps(),
      draws: this.instrumentation.drawCallsCounter.current,
      triangles: this.scene.meshes.reduce(
        (n, m) => n + m.getTotalIndices() / 3,
        0,
      ),
      activeTriangles,
      trianglesAcrossPasses: this.scene.getActiveIndices() / 3,
      meshes: this.scene.meshes.length,
      textures: this.scene.textures.length,
      materials: this.scene.materials.length,
      skeletons: this.scene.skeletons.length,
      animationGroups: this.scene.animationGroups.length,
      gpu: this.engine.getGlInfo(),
      heapBytes:
        (performance as Performance & { memory?: { usedJSHeapSize: number } })
          .memory?.usedJSHeapSize ?? null,
      frameSamples: [...this.frames],
      frameCount: this.frameCount,
      assetReadyAfterNavigationMs: this.assetReady,
      renderer: this.engine.description,
      assets: [...this.loadingReport],
      studyMotion: this.houndStudy?.describe() ?? null,
      combatEffects: this.combatVfx?.metrics() ?? {
        meshes: 0,
        burstSystems: 0,
        particles: 0,
      },
      ambient: this.ambientVfx?.metrics() ?? {
        systems: 0,
        particles: 0,
        meshes: 0,
      },
      dayPhase: this.phase,
      quality: this.level,
      camera: {
        alpha: this.camera.alpha,
        beta: this.camera.beta,
        radius: this.camera.radius,
      },
      actorAudit: [...this.actors.values()].map((v) => ({
        model: v.kind,
        clip: this.describe(v),
        position: v.rig.root.position.asArray(),
        meshes: v.rig.meshes.map((m) => ({
          name: m.name,
          enabled: m.isEnabled(),
          visible: m.isVisible,
          bounds: [
            ...m.getBoundingInfo().boundingBox.minimumWorld.asArray(),
            ...m.getBoundingInfo().boundingBox.maximumWorld.asArray(),
          ],
          scale: m.scaling.asArray(),
          skeleton: false,
        })),
      })),
    };
  }

  /** Synthetic renderer fixture only. No fake players or AI are sent to the server. */
  stress(enabled: boolean) {
    this.stressFixture?.dispose();
    this.stressFixture = null;
    if (enabled && this.snapshot && this.world)
      this.stressFixture = new StressFixture(this.studyHost());
    this.inkDirty = true;
  }

  /** Local asset inspection, with no server actor or playable transformation implied. */
  previewHound(enabled: boolean) {
    this.houndStudy?.dispose();
    this.houndStudy = null;
    if (!enabled || !this.snapshot || !this.world) {
      if (this.studyCamera) {
        this.alphaGoal = this.studyCamera.alpha;
        this.betaGoal = this.studyCamera.beta;
        this.radiusGoal = this.studyCamera.radius;
        this.camera.lowerRadiusLimit = MIN_RADIUS;
        this.studyCamera = null;
      }
      return;
    }
    this.studyCamera ??= {
      alpha: this.alphaGoal,
      beta: this.betaGoal,
      radius: this.radiusGoal,
    };
    this.camera.lowerRadiusLimit = 6;
    this.alphaGoal = -0.4;
    this.betaGoal = 1.1;
    this.radiusGoal = 7;
    this.houndStudy = new HoundStudy(this.studyHost());
  }

  /** Four deliberately different surface modes, independent of any playable kit. */
  previewElemental(enabled: boolean) {
    this.elemental?.dispose();
    this.elemental = null;
    if (enabled && this.world)
      this.elemental = new ElementalStudy(this.studyHost());
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.engine.stopRenderLoop();
    for (const stop of this.cleanup) stop();
    this.cleanup.length = 0;
    this.stressFixture?.dispose();
    this.houndStudy?.dispose();
    this.elemental?.dispose();
    this.combatVfx?.dispose();
    this.ambientVfx?.dispose();
    for (const v of this.actors.values()) this.disposeActor(v);
    this.actors.clear();
    this.worldView?.dispose();
    this.inkLayer?.dispose();
    this.selectionLayer.dispose();
    this.glowLayer.dispose();
    this.post.dispose();
    this.sky.dispose();
    for (const m of this.ringMaterials.values()) m.dispose();
    this.markerMaterial.dispose();
    this.shadow.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }

  // ───────────────────────────── frame ─────────────────────────────

  private frame() {
    if (this.disposed) return;
    const now = performance.now(),
      frameMs = now - this.lastFrame,
      dt = Math.min(frameMs / 1000, 0.1);
    this.lastFrame = now;
    if (!document.hidden) {
      this.frames.push(frameMs);
      this.frameCount++;
      // Benchmarks collect intervals every second; keep a bounded recent window.
      if (this.frames.length > 4096) this.frames.shift();
    }
    this.time += dt;
    const scale = this.time < this.stopUntil ? 0.08 : 1;
    this.stopBudget = Math.min(0.2, this.stopBudget + dt * 0.2);
    const pdt = dt * scale;
    this.ptime += pdt;
    if (this.pendingMaterials.length) this.fixMaterials();
    if (this.refreezeFrames > 0 && --this.refreezeFrames === 0) {
      for (const m of this.refreeze) m.freeze();
      this.refreeze.length = 0;
    }

    if (this.dayCycle && this.frozenPhase === null)
      this.phase = (this.phase + dt / DAY_SECONDS) % 1;
    const sky = computeSky(this.phase, this.skyState);
    this.applySky(sky, dt);

    const snapshot = this.snapshot;
    const me = snapshot?.actors.find((a) => a.id === this.selfId);
    if (snapshot) this.updateActors(snapshot, pdt);
    const self = me ? this.actors.get(me.id) : undefined;
    const focus = self
      ? this.focus.set(
          self.rig.root.position.x,
          self.y + 1.1,
          self.rig.root.position.z,
        )
      : null;
    this.updateCamera(pdt, dt, self ?? null);
    if (focus) this.cullCharacterCasters(focus);
    this.updateLights(dt, focus ?? this.camera.target);
    this.updateStudies(pdt, self ?? null);
    this.updateHighlight(snapshot);
    this.updateMarker(dt);

    const view = this.worldView;
    if (view) {
      view.setNight(sky.night);
      view.update(pdt, this.ptime);
      view.updateOcclusion(
        this.camera.position,
        focus ?? this.v1.copyFrom(this.camera.target),
        dt,
      );
    }
    if (snapshot) this.combatVfx?.update(pdt, snapshot);
    if (this.ambientVfx) {
      const quest = snapshot?.self.quest;
      const context: AmbientContext = {
        time: this.ptime,
        dayPhase: this.phase,
        night: sky.night,
        focus,
        camera: this.camera.position,
        objective: !snapshot
          ? null
          : quest === "accepted"
            ? NPCS.inscription
            : quest === "complete"
              ? null
              : NPCS.mara,
      };
      this.ambientVfx.update(pdt, context);
    }

    const hp = me ? me.hp / Math.max(1, me.maxHp) : null;
    this.post.update(dt, this.time, hp, me?.life ?? null);
    this.updateFocusBand(self ?? null);

    // Particle systems age by the scene's animation ratio; hit-stop slows it.
    if (scale !== 1)
      this.scene.onAfterAnimationsObservable.addOnce(() => {
        (
          this.scene as unknown as { _animationRatio: number }
        )._animationRatio *= scale;
      });
    this.scene.render();
    this.onFrame();
  }

  private applySky(sky: SkyState, dt: number) {
    const s = this.scene;
    this.sky.update(sky, this.time, dt);
    s.fogColor.copyFrom(sky.fog);
    s.clearColor.set(sky.fog.r, sky.fog.g, sky.fog.b, 1);
    s.fogDensity = 0.0062 + 0.0018 * sky.night;
    this.hemi.diffuse.copyFrom(sky.hemiSky);
    this.hemi.groundColor.copyFrom(sky.hemiGround);
    this.hemi.intensity = sky.hemiIntensity;
    this.sun.direction.copyFrom(sky.lightDir);
    this.sun.diffuse.copyFrom(sky.lightColor);
    this.sun.intensity = sky.lightIntensity;
    this.shadow.setDarkness(sky.shadowDarkness);
    this.glowLayer.intensity = 0.55 + 0.4 * sky.night;
  }

  // ───────────────────────────── actors ─────────────────────────────

  private makeActor(a: ActorView): ActorVisual {
    const kind = characterKind(a);
    const rig = createCharacter(this.scene, kind, {
      id: a.id,
      shadow: this.shadow,
    });
    for (const m of rig.meshes) {
      m.metadata = { actor: a.id };
      m.isPickable = true;
    }
    for (const m of characterGlowMeshes(rig)) this.addGlow(m);
    const ground = this.footGround(a.x, a.z);
    rig.root.position.set(a.x, ground, a.z);
    rig.root.rotation.y = a.heading;
    this.inkDirty = true;
    return {
      id: a.id,
      kind,
      rig,
      state: idleState(),
      action: { key: "basic", phase: "windup", t: 0, progress: 0 },
      y: ground,
      hop: 1,
      lastGround: ground,
      speed: 0,
      movingUntil: 0,
      castStarted: -1,
      castEvent: -1,
      motion: null,
      hitAt: -100,
      // Already dead when first seen: skip straight to the end of the fall.
      deathAt: a.life === "dead" ? -100 : 0,
      life: a.life,
      ring: null,
      ringKind: null,
      casting: true,
    };
  }

  private disposeActor(v: ActorVisual) {
    v.rig.dispose();
    v.ring?.dispose();
    this.inkDirty = true;
    // A rebuilt rig (guild change) must be re-added to the selection outline.
    if (v.id === this.selectionShown) this.selectionShown = "";
  }

  /**
   * Shadow maps are not frustum-culled: bodies far from the player leave the
   * caster list (they are off-screen or too far for the 48 m shadow frustum).
   */
  private cullCharacterCasters(focus: Vector3) {
    if (this.time - this.castersCheckedAt < 0.5) return;
    this.castersCheckedAt = this.time;
    for (const v of this.actors.values()) {
      const p = v.rig.root.position;
      const near = (p.x - focus.x) ** 2 + (p.z - focus.z) ** 2 < 26 * 26;
      if (near === v.casting) continue;
      v.casting = near;
      for (const m of v.rig.meshes)
        if (near) {
          if (m.receiveShadows) this.shadow.addShadowCaster(m, false);
        } else this.shadow.removeShadowCaster(m, false);
    }
  }
  private castersCheckedAt = -1;

  private updateActors(snapshot: Snapshot, dt: number) {
    for (const [id, v] of this.actors)
      if (!snapshot.actors.some((a) => a.id === id)) {
        this.disposeActor(v);
        this.actors.delete(id);
      }
    const serverNow =
      snapshot.now + Math.min(0.1, this.time - this.snapshotReceived);
    for (const a of snapshot.actors) {
      let v = this.actors.get(a.id);
      if (v && v.kind !== characterKind(a)) {
        this.disposeActor(v);
        this.actors.delete(a.id);
        v = undefined;
      }
      if (!v) {
        v = this.makeActor(a);
        this.actors.set(a.id, v);
      }
      this.updateActor(v, a, snapshot, serverNow, dt);
    }
  }

  private updateActor(
    v: ActorVisual,
    a: ActorView,
    snapshot: Snapshot,
    serverNow: number,
    dt: number,
  ) {
    const root = v.rig.root;
    const p = root.position;
    const dx = a.x - p.x,
      dz = a.z - p.z;
    if (dx * dx + dz * dz > 0.035 * 0.035) v.movingUntil = this.ptime + 0.12;
    const moving = this.ptime < v.movingUntil;
    const k = 1 - Math.exp(-dt * 16);
    const px = p.x,
      pz = p.z;
    p.x += dx * k;
    p.z += dz * k;
    if (dt > 0) {
      const inst = Math.hypot(p.x - px, p.z - pz) / dt;
      v.speed += (inst - v.speed) * Math.min(1, dt * 10);
    }
    // Ground: the highest block under the footprint, so feet never sink into
    // a terrace edge; climb quickly with a little hop, drop a touch slower.
    const ground = this.footGround(p.x, p.z);
    if (ground - v.lastGround > 0.25) v.hop = 0;
    v.lastGround = ground;
    v.y += (ground - v.y) * Math.min(1, dt * (ground > v.y ? 20 : 12));
    v.hop = Math.min(1, v.hop + dt / 0.24);
    p.y = v.y + Math.sin(v.hop * Math.PI) * 0.14;
    root.rotation.y +=
      wrapAngle(a.heading - root.rotation.y) * Math.min(1, dt * 14);

    if (a.life === "dead" && v.life !== "dead") v.deathAt = this.ptime;
    v.life = a.life;

    // Ability motion: port of the previous scene's cast/commit/cancel rules.
    let castEvent: CombatEvent | undefined;
    for (let i = snapshot.events.length - 1; i >= 0; i--) {
      const e = snapshot.events[i];
      if (e.source === a.id && e.type === "cast" && e.id > v.castEvent) {
        castEvent = e;
        break;
      }
    }
    if (castEvent || (a.cast && a.cast.start !== v.castStarted)) {
      const key = (castEvent?.key ?? a.cast!.key) as AbilityKey;
      const start = castEvent?.at ?? a.cast!.start;
      const authored = v.kind === "knight" ? KNIGHT_MOTION[key] : undefined;
      const windup =
        a.cast && a.cast.start === start
          ? a.cast.end - a.cast.start
          : a.kind === "wolf" || a.kind === "guard"
            ? 0.8
            : (KITS[a.guild].find((x) => x.key === key)?.windup ?? 0.3);
      v.castStarted = start;
      if (castEvent) v.castEvent = castEvent.id;
      v.motion = {
        key,
        start,
        windup,
        impact: authored?.impact ?? 0.35,
        recovery: authored?.recovery ?? (a.kind === "wolf" ? 0.4 : 0.32),
      };
    }
    const m = v.motion;
    if (m) {
      const committed = snapshot.events.some(
        (e) =>
          e.source === a.id &&
          e.type === "resolve" &&
          e.key === m.key &&
          e.at >= m.start,
      );
      if (
        a.life !== "alive" ||
        a.dodging ||
        a.stunned ||
        (moving && !a.cast) ||
        (!a.cast && !committed && snapshot.now < m.start + m.windup) ||
        serverNow > m.start + m.windup + m.recovery
      )
        v.motion = null;
    }

    const s = v.state;
    s.time = this.ptime;
    s.moving = moving;
    s.speed = clamp01(v.speed / RUN_SPEED);
    s.life = a.life;
    s.dodging = a.dodging;
    s.guarding = a.guarding;
    s.stunned = a.stunned;
    s.healing = a.healing;
    s.oath = a.oath;
    s.returning = a.returning;
    s.sinceHit = this.ptime - v.hitAt;
    s.sinceDeath = a.life === "dead" ? this.ptime - v.deathAt : 0;
    s.action = null;
    if (
      v.motion &&
      actionState(
        serverNow - v.motion.start,
        v.motion.windup,
        v.motion.impact,
        v.motion.recovery,
        v.action,
      )
    ) {
      v.action.key = v.motion.key;
      s.action = v.action;
    }
    v.rig.update(s, dt);
    this.updateRing(v, a);
  }

  private describe(v: ActorVisual): string {
    const s = v.state;
    if (s.life !== "alive") return s.life;
    if (s.action) return `${s.action.key}:${s.action.phase}`;
    if (s.dodging) return "dodge";
    if (s.guarding) return "guard";
    if (s.moving) return s.returning ? "walk" : "run";
    return "idle";
  }

  private updateRing(v: ActorVisual, a: ActorView) {
    const want: ActorVisual["ringKind"] =
      a.life === "dead"
        ? null
        : a.red > 0
          ? "outlaw"
          : a.id === this.selected
            ? "selected"
            : a.id === this.selfId
              ? "self"
              : null;
    if (!want) {
      v.ring?.setEnabled(false);
      return;
    }
    if (!v.ring) {
      v.ring = MeshBuilder.CreateTorus(
        `ring-${a.id}`,
        {
          diameter: v.kind === "wolf" ? 1.15 : 1.0,
          thickness: 0.07,
          tessellation: 28,
        },
        this.scene,
      );
      v.ring.isPickable = false;
      v.ring.scaling.y = 0.35;
    }
    if (v.ringKind !== want) {
      v.ring.material = this.ringMaterial(RING_COLORS[want]);
      v.ringKind = want;
    }
    v.ring.setEnabled(true);
    const p = v.rig.root.position;
    v.ring.position.set(p.x, v.y + 0.05, p.z);
    const pulse = want === "self" ? 1 : 1 + Math.sin(this.ptime * 5) * 0.05;
    v.ring.scaling.x = v.ring.scaling.z = pulse;
  }

  private ringMaterial(hex: string): StandardMaterial {
    let m = this.ringMaterials.get(hex);
    if (!m) {
      m = new StandardMaterial(`ring-${hex}`, this.scene);
      m.disableLighting = true;
      m.emissiveColor = Color3.FromHexString(hex);
      m.alpha = 0.9;
      this.ringMaterials.set(hex, m);
    }
    return m;
  }

  private showEvent(e: CombatEvent, s: Snapshot) {
    if (e.type === "hit") {
      const target = this.actors.get(e.target);
      if (target) target.hitAt = this.ptime;
    }
    this.combatVfx?.event(e, s);
  }

  /** Highest visual ground under a 0.22 m footprint around (x, z). */
  private footGround(x: number, z: number): number {
    const w = this.world;
    if (!w) return 0;
    const r = 0.22;
    return Math.max(
      w.surfaceHeight(x, z),
      w.surfaceHeight(x + r, z),
      w.surfaceHeight(x - r, z),
      w.surfaceHeight(x, z + r),
      w.surfaceHeight(x, z - r),
    );
  }

  // ───────────────────────────── camera ─────────────────────────────

  private updateCamera(pdt: number, dt: number, self: ActorVisual | null) {
    const cam = this.camera;
    if (this.attract && self) {
      // First snapshot: hand the cinematic orbit over to the follow camera.
      this.attract = false;
      this.handoff = 0;
      this.handoffFrom.alpha = cam.alpha;
      this.handoffFrom.beta = cam.beta;
      this.handoffFrom.radius = cam.radius;
      this.handoffFrom.target.copyFrom(cam.target);
      // Settle on the default heading nearest to where the orbit is.
      this.alphaGoal =
        CAMERA_ALPHA +
        Math.round((cam.alpha - CAMERA_ALPHA) / (Math.PI * 2)) * Math.PI * 2;
      this.follow.set(
        self.rig.root.position.x,
        self.y + 0.6,
        self.rig.root.position.z,
      );
    }
    if (this.attract) {
      this.attractAngle += dt * 0.045;
      cam.alpha = this.attractAngle;
      cam.beta = ATTRACT_BETA + Math.sin(this.time * 0.13) * 0.03;
      cam.radius = ATTRACT_RADIUS;
      cam.fov = ATTRACT_FOV;
      this.camTarget.copyFrom(ATTRACT_CENTRE);
      cam.setTarget(this.camTarget, false, true, true);
      return;
    }
    // Follow target: ahead of the player along the camera's forward axis.
    const ahead = this.houndStudy ? 0 : 2.8;
    if (self) {
      const p = self.rig.root.position;
      const fx = -Math.cos(this.alphaGoal),
        fz = -Math.sin(this.alphaGoal);
      const tx = this.houndStudy ? p.x + 2.5 : p.x + fx * ahead,
        tz = this.houndStudy ? p.z + 1 : p.z + fz * ahead;
      const k = 1 - Math.exp(-pdt * 7);
      this.follow.x += (tx - this.follow.x) * k;
      this.follow.y += (self.y + 0.6 - this.follow.y) * k;
      this.follow.z += (tz - this.follow.z) * k;
    }
    // Smooth 90° turns and zoom.
    const ka = 1 - Math.exp(-pdt * 9);
    let alpha = cam.alpha + (this.alphaGoal - cam.alpha) * ka;
    let beta = cam.beta + (this.betaGoal - cam.beta) * ka;
    let radius =
      cam.radius + (this.radiusGoal - cam.radius) * (1 - Math.exp(-pdt * 10));
    const target = this.camTarget.copyFrom(this.follow);
    if (this.handoff >= 0) {
      this.handoff = Math.min(1, this.handoff + dt / HANDOFF_SECONDS);
      const e = easeInOut(this.handoff);
      const from = this.handoffFrom;
      alpha = from.alpha + wrapAngle(this.alphaGoal - from.alpha) * e;
      beta = from.beta + (this.betaGoal - from.beta) * e;
      radius = from.radius + (this.radiusGoal - from.radius) * e;
      cam.fov = ATTRACT_FOV + (CAMERA_FOV - ATTRACT_FOV) * e;
      Vector3.LerpToRef(from.target, this.follow, e, target);
      if (this.handoff >= 1) {
        this.handoff = -1;
        alpha = this.alphaGoal;
        cam.fov = CAMERA_FOV;
      }
    }
    // Shake: decaying jitter of the look-at point.
    if (this.shakeLeft > 0) {
      this.shakeLeft = Math.max(0, this.shakeLeft - pdt);
      this.shakeTime += pdt;
      const fade = this.shakeLeft / Math.max(0.001, this.shakeTotal);
      const a = this.shakeAmp * fade * fade;
      const t = this.shakeTime * 60;
      this.jitter.set(
        Math.sin(t * 1.7) * a,
        Math.sin(t * 2.3 + 1) * a * 0.6,
        Math.cos(t * 1.9) * a,
      );
      target.addInPlace(this.jitter);
    }
    cam.alpha = alpha;
    cam.beta = beta;
    cam.radius = radius;
    if (this.handoff < 0) {
      cam.lowerRadiusLimit = this.houndStudy ? 6 : MIN_RADIUS;
      cam.upperRadiusLimit = MAX_RADIUS;
    }
    cam.setTarget(target, false, true, true);
  }

  private shakeTotal = 0;
  private shake(intensity: number, duration: number) {
    const cap = this.level === "low" ? 0.12 : 0.3;
    const amp = Math.min(cap, intensity * (this.level === "low" ? 0.5 : 1));
    if (amp <= 0 || duration <= 0) return;
    if (
      amp >=
      this.shakeAmp * (this.shakeLeft / Math.max(0.001, this.shakeTotal))
    ) {
      this.shakeAmp = amp;
      this.shakeTotal = this.shakeLeft = Math.min(0.8, duration);
    }
    if (amp > 0.18) this.post.pulseAberration(amp * 2.5);
  }

  private hitStop(duration: number) {
    const want = Math.min(0.12, Math.max(0, duration));
    // Only extend past the current stop, within a 0.2 s per second budget.
    const extension = Math.max(
      0,
      this.time + want - Math.max(this.stopUntil, this.time),
    );
    const grant = Math.min(extension, this.stopBudget);
    if (grant <= 0.005) return;
    this.stopBudget -= grant;
    this.stopUntil = Math.max(this.stopUntil, this.time) + grant;
    if (want >= 0.07) this.post.pulseAberration(0.8);
  }

  private updateFocusBand(self: ActorVisual | null) {
    if (!self || this.handoff >= 0) {
      this.post.focusY += (0.45 - this.post.focusY) * 0.1;
      this.post.bandBoost = this.attract ? 0.08 : 0.04;
      return;
    }
    const p = self.rig.root.position;
    const h = this.engine.getRenderHeight();
    const out = Vector3.ProjectToRef(
      this.v1.set(p.x, self.y + 0.9, p.z),
      Matrix.IdentityReadOnly,
      this.scene.getTransformMatrix(),
      this.camera.viewport.toGlobal(this.engine.getRenderWidth(), h),
      this.projectOut,
    );
    const y = clamp01(1 - out.y / h);
    this.post.focusY += (y - this.post.focusY) * 0.25;
    this.post.bandBoost = 0;
  }

  // ───────────────────────────── lights ─────────────────────────────

  private updateLights(dt: number, focus: Vector3) {
    const night = this.skyState.night;
    // Shadow frustum follows the focus, snapped to shadow-map texels so
    // shadow edges do not crawl while walking.
    const dir = this.sun.direction;
    const up = Math.abs(dir.y) > 0.99 ? Vector3.Forward() : Vector3.Up();
    const right = Vector3.Cross(up, dir).normalize();
    const u = Vector3.Cross(dir, right);
    const texel = SHADOW_FRUSTUM / SHADOW_MAP;
    const r = Math.round(Vector3.Dot(focus, right) / texel) * texel,
      uu = Math.round(Vector3.Dot(focus, u) / texel) * texel,
      d = Vector3.Dot(focus, dir);
    this.sun.position.set(
      right.x * r + u.x * uu + dir.x * (d - 60),
      right.y * r + u.y * uu + dir.y * (d - 60),
      right.z * r + u.z * uu + dir.z * (d - 60),
    );
    // The nearest lanterns/magic lights become real point lights at night.
    if (this.time - this.lightsCheckedAt > 0.25) {
      this.lightsCheckedAt = this.time;
      const nearest = [...this.lightCandidates]
        .sort(
          (a, b) =>
            (a.x - focus.x) ** 2 +
            (a.z - focus.z) ** 2 -
            ((b.x - focus.x) ** 2 + (b.z - focus.z) ** 2),
        )
        .slice(0, POINT_LIGHTS);
      const free = nearest.filter(
        (l) => !this.slots.some((s) => s.current === l),
      );
      for (const slot of this.slots)
        slot.next =
          slot.current && nearest.includes(slot.current)
            ? slot.current
            : (free.shift() ?? slot.current);
    }
    for (const [i, slot] of this.slots.entries()) {
      const next = slot.next;
      if (next && next !== slot.current) {
        // Cross-fade so light pools never pop when the set changes.
        slot.fade = Math.max(0, slot.fade - dt * 4);
        if (slot.fade === 0) {
          slot.current = next;
          slot.light.position.set(next.x, next.y, next.z);
          slot.light.diffuse = Color3.FromHexString(next.color);
          slot.light.range = next.kind === "magic" ? 8 : 9;
        }
      } else slot.fade = Math.min(1, slot.fade + dt * 3);
      const l = slot.current;
      const flicker =
        l?.kind === "lantern"
          ? 0.92 +
            0.05 * Math.sin(this.time * 9.3 + i * 2.1) +
            0.03 * Math.sin(this.time * 23 + i)
          : 1;
      slot.light.intensity = l
        ? (0.12 + 1.35 * night) * l.intensity * 1.4 * flicker * slot.fade
        : 0;
    }
  }

  /** Lights added or toggled later (the campfire) recompile frozen materials. */
  private watchLight(light: Light) {
    light.onEnabledStateChangedObservable.add(() => this.relightFrozen());
    this.relightFrozen();
  }

  private relightFrozen() {
    for (const m of this.scene.materials)
      if (m.isFrozen && !this.refreeze.includes(m)) {
        m.unfreeze();
        this.refreeze.push(m);
      }
    if (this.refreeze.length) this.refreezeFrames = 3;
  }

  private pendingMaterials: Material[] = [];
  /** Every lit material gets room for all scene lights (sky, sun, lamps, campfire). */
  private fixMaterials() {
    for (const m of this.pendingMaterials.splice(0)) {
      const lit = m as Material & { maxSimultaneousLights?: number };
      if (
        typeof lit.maxSimultaneousLights !== "number" ||
        lit.maxSimultaneousLights >= MAX_LIGHTS
      )
        continue;
      const frozen = m.isFrozen;
      if (frozen) m.unfreeze();
      lit.maxSimultaneousLights = MAX_LIGHTS;
      if (frozen) m.freeze();
    }
  }

  // ───────────────────────────── highlight & glow ─────────────────────────────

  private addGlow(mesh: AbstractMesh) {
    const glow = this.glowLayer;
    glow.addIncludedOnlyMesh(mesh as Mesh);
    mesh.onDisposeObservable.addOnce(() =>
      glow.removeIncludedOnlyMesh(mesh as Mesh),
    );
  }

  private setInkOutline(enabled: boolean) {
    if (!enabled) {
      this.inkLayer?.dispose();
      this.inkLayer = null;
      return;
    }
    if (this.inkLayer) return;
    this.inkLayer = new SelectionOutlineLayer("ink", this.scene, {
      useDepthOcclusion: false,
      mainTextureRatio: 1,
    });
    this.inkLayer.outlineColor = Color3.FromHexString("#2b2140");
    this.inkLayer.outlineThickness = 2;
    this.inkDirty = true;
  }

  private updateHighlight(snapshot: Snapshot | null) {
    const v = this.selected ? this.actors.get(this.selected) : undefined;
    const actor = v && snapshot?.actors.find((a) => a.id === v.id);
    const show = v && actor && actor.life !== "dead" ? v.id : "";
    const red = Boolean(actor && actor.red > 0);
    if (show !== this.selectionShown || red !== this.selectionRed) {
      this.selectionLayer.clearSelection();
      if (v && show) this.selectionLayer.addSelection(v.rig.meshes);
      this.selectionLayer.outlineColor = Color3.FromHexString(
        red ? "#ff4a5a" : "#ffd45e",
      );
      this.selectionShown = show;
      this.selectionRed = red;
    }
    // Ink outline on the player's own character only: it keeps them readable
    // in foliage and effects, and costs one extra draw per body part.
    if (this.inkLayer && this.inkDirty) {
      this.inkDirty = false;
      this.inkLayer.clearSelection();
      const self = this.actors.get(this.selfId);
      if (self) this.inkLayer.addSelection(self.rig.meshes);
    }
  }

  // ───────────────────────────── input & marker ─────────────────────────────

  private bindInput() {
    const canvas = this.canvas;
    const context = (e: Event) => e.preventDefault();
    const down = (event: PointerEvent) => {
      const s = this.scene;
      const hit = s.pick(
        s.pointerX,
        s.pointerY,
        (m) => Boolean(m.metadata?.actor) && m.isEnabled() && m.isVisible,
      );
      if (hit?.pickedMesh?.metadata?.actor) {
        this.onSelect(String(hit.pickedMesh.metadata.actor));
        return;
      }
      const ground = this.groundPick(s.pointerX, s.pointerY);
      if (!ground) return;
      if (event.button === 2) {
        this.onGround({ x: ground.x, z: ground.z });
        this.marker.position.copyFrom(ground);
        this.marker.setEnabled(true);
        this.markerAge = 0;
      } else if (event.button === 0 && this.snapshot) {
        // Forgiving selection: the nearest body within reach of the click.
        let best = "",
          bestD = 0.9 * 0.9;
        for (const v of this.actors.values()) {
          if (v.id === this.selfId) continue;
          const p = v.rig.root.position;
          const d = (p.x - ground.x) ** 2 + (p.z - ground.z) ** 2;
          if (d < bestD) {
            best = v.id;
            bestD = d;
          }
        }
        if (best) this.onSelect(best);
      }
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (this.attract) return;
      const lower = this.houndStudy ? 6 : MIN_RADIUS;
      this.radiusGoal = Math.max(
        lower,
        Math.min(MAX_RADIUS, this.radiusGoal + e.deltaY * 0.008),
      );
    };
    const resize = () => this.engine.resize();
    canvas.addEventListener("contextmenu", context);
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("resize", resize);
    this.cleanup.push(() => {
      canvas.removeEventListener("contextmenu", context);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("wheel", wheel);
      window.removeEventListener("resize", resize);
    });
  }

  /** Pointer ray against the visual ground (terraces and water surface). */
  private groundPick(x: number, y: number): Vector3 | null {
    const ray = this.scene.createPickingRay(
      x,
      y,
      Matrix.Identity(),
      this.camera,
    );
    if (Math.abs(ray.direction.y) < 1e-4) return null;
    let h = 0,
      px = 0,
      pz = 0;
    for (let i = 0; i < 3; i++) {
      const t = (h - ray.origin.y) / ray.direction.y;
      if (t <= 0) return null;
      px = ray.origin.x + ray.direction.x * t;
      pz = ray.origin.z + ray.direction.z * t;
      const next = this.visualGround(px, pz);
      if (Math.abs(next - h) < 0.01) break;
      h = next;
    }
    return new Vector3(px, h, pz);
  }

  private visualGround(x: number, z: number): number {
    const w = this.world;
    if (!w) return 0;
    const ground = w.surfaceHeight(x, z),
      water = w.waterHeight(x, z);
    return water !== null && water > ground ? water : ground;
  }

  private updateMarker(dt: number) {
    if (this.markerAge > 0.9) {
      if (this.marker.isEnabled()) this.marker.setEnabled(false);
      return;
    }
    this.markerAge += dt;
    const t = this.markerAge / 0.9;
    // Ring pops out with an overshoot, then shrinks away; the arrow bounces.
    const pop = Math.min(1, this.markerAge / 0.18);
    const back = 1 + 2.2 * (pop - 1) ** 3 + 1.2 * (pop - 1) ** 2;
    const ring = back * (1 - Math.max(0, t - 0.7) / 0.3);
    this.markerRing.scaling.set(ring, 0.5, ring);
    this.markerRing.position.y = 0.06;
    const bounce = Math.abs(Math.sin(this.markerAge * 11)) * (1 - t);
    this.markerArrow.position.y = 0.42 + bounce * 0.35;
    this.markerArrow.rotation.y = this.markerAge * 6;
    const fade = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    this.markerArrow.scaling.setAll(Math.max(0.01, fade));
  }

  // ───────────────────────────── studies & quality ─────────────────────────────

  private studyHost(): StudyHost {
    return {
      scene: this.scene,
      shadow: this.level === "low" ? null : this.shadow,
      glow: (m) => this.addGlow(m),
      ground: (x, z) => this.world?.surfaceHeight(x, z) ?? 0,
    };
  }

  private updateStudies(dt: number, self: ActorVisual | null) {
    if (!self) return;
    const p = self.rig.root.position;
    this.stressFixture?.update(dt, this.ptime, p.x, p.z);
    this.houndStudy?.update(dt, this.ptime, p.x + 2.5, p.z + 1);
    this.elemental?.update(this.ptime, p.x - 2.6, p.z + 1);
  }

  private applyQualityToModules() {
    const low = this.level === "low";
    if (this.combatVfx) this.combatVfx.low = low;
    if (this.ambientVfx) this.ambientVfx.low = low;
  }

  private scalingFor(level: QualityLevel): number {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    if (level === "low") return dpr;
    if (level === "high") return 1 / Math.min(dpr, 1.5);
    return Math.max(1, dpr / 1.5);
  }
}
