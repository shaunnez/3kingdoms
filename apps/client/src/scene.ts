import {
  ArcRotateCamera,
  Color3,
  Color4,
  Constants,
  DefaultRenderingPipeline,
  DirectionalLight,
  DynamicTexture,
  Engine,
  HemisphericLight,
  Matrix,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  PointLight,
  RawCubeTexture,
  Scene,
  SceneLoader,
  ShadowGenerator,
  StandardMaterial,
  TransformNode,
  Vector3,
  Plane,
  SceneInstrumentation,
  type AnimationGroup,
  type AssetContainer,
  type AbstractMesh,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import type {
  ActorView,
  CombatEvent,
  Snapshot,
  Vec2,
} from "../../../packages/contracts/game";
import { KITS, type AbilityKey } from "../../../packages/contracts/game";
import { NPCS, REFUGE } from "../../../packages/simulation/map";
import { actionPhase, KNIGHT_MOTION } from "./combat-presentation";
import { CombatEffects } from "./combat-effects";

const LANTERNS = [
  [-9, -6],
  [9, -6],
  [-9, -16],
  [-9, -29],
  [9, -29],
  [-7, -0.6],
  [7, -0.6],
  [-6, 11],
  [6, 14],
  [-4, 16.4],
  [4, 23.7],
  [-5, 27],
  [6, 31],
  [11, 44],
  [17.7, 45],
  [10.3, 45],
] as const;

type Visual = {
  root: TransformNode;
  groups: AnimationGroup[];
  clip: string;
  last: Vec2;
  ring: Mesh;
  meshRoot: TransformNode;
  dead: boolean;
  model: string;
  ownsMaterials: boolean;
  castStarted: number;
  castEvent: number;
  motion: {
    clip: string;
    key: AbilityKey;
    start: number;
    windup: number;
    impact: number;
    recovery: number;
  } | null;
  weights: Map<AnimationGroup, number>;
  movingUntil: number;
  hitAt: number;
  hitHeading: number;
  sampleFrame: number | null;
};
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
  combatEffects: ReturnType<CombatEffects["metrics"]>;
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
export class GameScene {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly camera: ArcRotateCamera;
  onSelect: (id: string) => void = () => {};
  onGround: (pos: Vec2) => void = () => {};
  onFrame: () => void = () => {};
  private shadow: ShadowGenerator;
  private actors = new Map<string, Visual>();
  private containers = new Map<string, AssetContainer>();
  private loading = new Set<string>();
  private combatFx: CombatEffects;
  private snapshotReceived = 0;
  private lastEvent = 0;
  private snapshot: Snapshot | null = null;
  private selfId = "";
  private selected = "";
  private frames: number[] = [];
  private frameCount = 0;
  private assetReady = 0;
  private lastFrame = performance.now();
  private eventMeshes: Mesh[] = [];
  private light: PointLight;
  private worldLights: PointLight[] = [];
  private marker: Mesh;
  private time = 0;
  private stopResize: () => void;
  private loadingReport: string[] = [];
  private instrumentation: SceneInstrumentation;
  private persistentEffects = new Map<string, Mesh>();
  private stressActors: Visual[] = [];
  private stressSummons: AbstractMesh[] = [];
  private summonSource: Mesh | null = null;
  private elemental: TransformNode | null = null;
  private houndStudy: Visual | null = null;
  private houndStudyStarted = 0;
  private gateOccluders: PBRMaterial[] = [];
  private awningOccluders: PBRMaterial[] = [];
  private canopyOccluders: { material: PBRMaterial; x: number; z: number }[] =
    [];
  private studyCamera: { alpha: number; beta: number; radius: number } | null =
    null;
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
    this.engine.setHardwareScalingLevel(Math.max(1, devicePixelRatio / 1.5));
    this.scene = new Scene(this.engine);
    const s = this.scene;
    this.combatFx = new CombatEffects(
      s,
      (id) => this.actors.get(id)?.root.position,
    );
    s.useRightHandedSystem = true;
    this.instrumentation = new SceneInstrumentation(s);
    s.clearColor = new Color4(0.065, 0.11, 0.145, 1);
    s.fogMode = Scene.FOGMODE_EXP2;
    s.fogDensity = 0.012;
    s.fogColor = new Color3(0.14, 0.22, 0.25);
    s.ambientColor = new Color3(0.4, 0.46, 0.48);
    this.camera = new ArcRotateCamera(
      "camera",
      -Math.PI / 2 - 0.18,
      0.72,
      22,
      new Vector3(0, 0.7, -6),
      s,
    );
    this.camera.fov = 0.66;
    this.camera.minZ = 0.2;
    this.camera.maxZ = 200;
    this.camera.lowerRadiusLimit = 18;
    this.camera.upperRadiusLimit = 36;
    const hemi = new HemisphericLight("sky", new Vector3(0.1, 1, -0.3), s);
    hemi.intensity = 0.8;
    hemi.diffuse = new Color3(0.62, 0.77, 0.9);
    hemi.groundColor = new Color3(0.18, 0.2, 0.18);
    const sun = new DirectionalLight(
      "moon-and-last-light",
      new Vector3(-0.5, -1, 0.55),
      s,
    );
    sun.position = new Vector3(15, 35, -20);
    sun.intensity = 1.8;
    sun.diffuse = new Color3(0.83, 0.88, 1);
    this.shadow = new ShadowGenerator(2048, sun);
    this.shadow.usePercentageCloserFiltering = true;
    this.shadow.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
    this.shadow.bias = 0.0007;
    this.shadow.normalBias = 0.035;
    this.shadow.setDarkness(0.35);
    this.light = new PointLight("traveller-lantern", new Vector3(0, 2, -14), s);
    this.light.diffuse = new Color3(1, 0.56, 0.25);
    this.light.intensity = 14;
    this.light.range = 7;
    for (let i = 0; i < 3; i++) {
      const l = new PointLight(
        `nearby-lantern-${i}`,
        new Vector3(0, 2.6, 0),
        s,
      );
      l.diffuse = new Color3(1, 0.52, 0.2);
      l.intensity = 115;
      l.range = 14;
      this.worldLights.push(l);
    }
    const size = 32;
    const faces: Uint8Array[] = [];
    for (let face = 0; face < 6; face++) {
      const data = new Uint8Array(size * size * 4);
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          const i = (y * size + x) * 4;
          const t = face === 2 ? 1 : face === 3 ? 0.1 : 1 - y / size;
          data[i] = 30 + 90 * t;
          data[i + 1] = 42 + 112 * t;
          data[i + 2] = 46 + 140 * t;
          data[i + 3] = 255;
        }
      faces.push(data);
    }
    s.environmentTexture = new RawCubeTexture(
      s,
      faces,
      size,
      Constants.TEXTUREFORMAT_RGBA,
      Constants.TEXTURETYPE_UNSIGNED_BYTE,
      true,
      false,
      Constants.TEXTURE_TRILINEAR_SAMPLINGMODE,
    );
    s.environmentIntensity = 0.7;
    const pipeline = new DefaultRenderingPipeline("finish", true, s, [
      this.camera,
    ]);
    pipeline.fxaaEnabled = true;
    pipeline.bloomEnabled = true;
    pipeline.bloomThreshold = 1.5;
    pipeline.bloomWeight = 0.18;
    pipeline.bloomKernel = 32;
    pipeline.samples = 1;
    s.imageProcessingConfiguration.toneMappingEnabled = true;
    s.imageProcessingConfiguration.toneMappingType = 1;
    s.imageProcessingConfiguration.exposure = 1.15;
    s.imageProcessingConfiguration.contrast = 1.07;
    s.imageProcessingConfiguration.vignetteEnabled = true;
    s.imageProcessingConfiguration.vignetteWeight = 1.3;
    s.imageProcessingConfiguration.vignetteStretch = 0.2;
    this.marker = this.ring("cursor", 0.23, "#d9bd83");
    this.marker.isVisible = false;
    this.makeWater();
    this.makeBoundaries();
    this.makeMotes();
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("pointerdown", (event) => {
      const hit = s.pick(s.pointerX, s.pointerY, (m) =>
        Boolean(m.metadata?.actor),
      );
      if (hit?.pickedMesh?.metadata?.actor)
        this.onSelect(String(hit.pickedMesh.metadata.actor));
      else if (event.button === 2) {
        const ray = s.createPickingRay(
          s.pointerX,
          s.pointerY,
          Matrix.Identity(),
          this.camera,
        );
        const t = ray.intersectsPlane(new Plane(0, 1, 0, 0));
        if (t !== null && t > 0) {
          const p = ray.origin.add(ray.direction.scale(t));
          this.onGround({ x: p.x, z: p.z });
          this.marker.position.set(p.x, 0.07, p.z);
          this.marker.isVisible = true;
          setTimeout(() => (this.marker.isVisible = false), 900);
        }
      }
    });
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.camera.radius = Math.max(
          18,
          Math.min(36, this.camera.radius + e.deltaY * 0.008),
        );
      },
      { passive: false },
    );
    const resize = () => this.engine.resize();
    window.addEventListener("resize", resize);
    this.stopResize = () => window.removeEventListener("resize", resize);
    this.engine.runRenderLoop(() => {
      const now = performance.now(),
        frameMs = now - this.lastFrame,
        dt = Math.min(frameMs / 1000, 0.1);
      this.lastFrame = now;
      if (!document.hidden) {
        this.frames.push(frameMs);
        this.frameCount++;
        if (this.frames.length > 36000) this.frames.shift();
      }
      this.update(dt);
      s.render();
      this.onFrame();
    });
  }
  async load() {
    this.onProgress("Laying the wet stone of Highcross…");
    await SceneLoader.ImportMeshAsync(
      "",
      "/models/",
      "briar-gate.glb",
      this.scene,
    ).then((result) => {
      for (const mesh of result.meshes) {
        mesh.isPickable = false;
        mesh.receiveShadows = true;
        if (
          mesh.name.includes("occluder-gate.") &&
          mesh.material instanceof PBRMaterial
        ) {
          const material = mesh.material.clone(`${mesh.name}-fade`);
          material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
          mesh.material = material;
          this.gateOccluders.push(material);
        }
        const canopy = /occluder-canopy\.(-?\d+)\.(-?\d+)\./.exec(mesh.name);
        if (
          mesh.name.includes("occluder-awning.") &&
          mesh.material instanceof PBRMaterial
        ) {
          const material = mesh.material.clone(`${mesh.name}-fade`);
          material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
          mesh.material = material;
          this.awningOccluders.push(material);
        }
        if (canopy && mesh.material instanceof PBRMaterial) {
          const material = mesh.material.clone(`${mesh.name}-fade`);
          material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
          material.backFaceCulling = false;
          mesh.material = material;
          this.canopyOccluders.push({
            material,
            x: Number(canopy[1]),
            z: Number(canopy[2]),
          });
        }
        if (mesh.getTotalVertices() > 0)
          this.shadow.addShadowCaster(mesh, false);
        mesh.freezeWorldMatrix();
      }
      for (const m of this.scene.materials)
        if (m instanceof PBRMaterial) {
          m.maxSimultaneousLights = 6;
          if (m.name.startsWith("leaf")) m.backFaceCulling = false;
        }
      this.loadingReport.push("environment:loaded");
    });
    await Promise.all(
      ["knight", "cyborg", "wolf", "mara", "nemi"].map((x) =>
        this.loadModel(x),
      ),
    );
    this.onProgress("Ready");
    this.assetReady = performance.now();
  }
  private async loadModel(name: string) {
    if (this.loading.has(name)) return;
    this.loading.add(name);
    try {
      const container = await SceneLoader.LoadAssetContainerAsync(
        "/models/",
        `${name}.glb`,
        this.scene,
      );
      for (const material of container.materials)
        if (material instanceof PBRMaterial) material.maxSimultaneousLights = 6;
      this.containers.set(name, container);
      this.loadingReport.push(`${name}:loaded`);
    } catch {
      this.loadingReport.push(`${name}:proxy`);
    }
  }
  setSnapshot(s: Snapshot) {
    this.snapshot = s;
    this.snapshotReceived = this.time;
    this.selfId = s.self.id;
    for (const event of s.events)
      if (event.id > this.lastEvent) {
        this.lastEvent = event.id;
        this.showEvent(event);
      }
  }
  select(id: string) {
    this.selected = id;
  }
  rotate(direction: number) {
    this.camera.alpha += (direction * Math.PI) / 2;
  }
  quality(low: boolean) {
    this.combatFx.low = low;
    this.engine.setHardwareScalingLevel(
      low ? Math.max(1, devicePixelRatio) : Math.max(1, devicePixelRatio / 1.5),
    );
    this.scene.shadowsEnabled = !low;
  }
  private material(name: string, hex: string, emission = 0): StandardMaterial {
    const m = new StandardMaterial(name, this.scene);
    m.diffuseColor = Color3.FromHexString(hex);
    m.specularColor = new Color3(0.15, 0.2, 0.22);
    if (emission) m.emissiveColor = m.diffuseColor.scale(emission);
    return m;
  }
  private ring(name: string, radius: number, color: string): Mesh {
    const mesh = MeshBuilder.CreateTorus(
      name,
      { diameter: radius * 2, thickness: 0.025, tessellation: 64 },
      this.scene,
    );
    mesh.material = this.material(name, color, 1);
    mesh.isPickable = false;
    mesh.position.y = 0.045;
    return mesh;
  }
  private proxy(a: ActorView, parent: TransformNode) {
    const s = this.scene,
      cloth = this.material(
        `${a.id}-cloth`,
        a.kind === "mara"
          ? "#cab7a1"
          : a.kind === "merchant"
            ? "#a68b5d"
            : a.guild === "cyborg"
              ? "#d3cbb9"
              : "#25434a",
      );
    const metal = this.material(`${a.id}-metal`, "#7c8b91"),
      skin = this.material(`${a.id}-skin`, "#b9a18c");
    const part = (
      name: string,
      d: Vector3,
      pos: Vector3,
      m: StandardMaterial,
    ) => {
      const o = MeshBuilder.CreateBox(
        name,
        { width: d.x, height: d.y, depth: d.z },
        s,
      );
      o.parent = parent;
      o.position = pos;
      o.material = m;
      return o;
    };
    if (a.kind === "wolf") {
      const body = MeshBuilder.CreateSphere(
        "wolf-proxy",
        { diameter: 1, segments: 8 },
        s,
      );
      body.scaling.set(0.45, 0.55, 1.1);
      body.position.y = 0.6;
      body.material = metal;
      body.parent = parent;
      for (const x of [-0.2, 0.2])
        for (const z of [-0.35, 0.35])
          part(
            "leg",
            new Vector3(0.12, 0.5, 0.12),
            new Vector3(x, 0.25, z),
            metal,
          );
      return;
    }
    const npc = a.kind === "mara" || a.kind === "merchant";
    const body = MeshBuilder.CreateCylinder(
      "body",
      {
        height: npc ? 1.2 : 0.7,
        diameterTop: 0.42,
        diameterBottom: npc ? 0.65 : 0.38,
        tessellation: 12,
      },
      s,
    );
    body.position.y = npc ? 0.65 : 1.12;
    body.parent = parent;
    body.material = cloth;
    const head = MeshBuilder.CreateSphere(
      "head",
      { diameter: 0.3, segments: 12 },
      s,
    );
    head.position.y = 1.72;
    head.parent = parent;
    head.material = npc ? skin : metal;
    for (const side of [-1, 1]) {
      part(
        "arm",
        new Vector3(0.15, 0.64, 0.15),
        new Vector3(side * 0.31, 1.03, 0),
        npc ? cloth : metal,
      );
      if (!npc)
        part(
          "leg",
          new Vector3(0.18, 0.7, 0.2),
          new Vector3(side * 0.14, 0.42, 0),
          metal,
        );
    }
    if (!npc) {
      const shield = MeshBuilder.CreateCylinder(
        "shield",
        { diameter: 0.64, height: 0.08, tessellation: 8 },
        s,
      );
      shield.rotation.x = Math.PI / 2;
      shield.position.set(-0.38, 1, 0.17);
      shield.material = cloth;
      shield.parent = parent;
      const blade = part(
        "sword",
        new Vector3(0.065, 1, 0.045),
        new Vector3(0.38, 0.65, 0.18),
        metal,
      );
      blade.rotation.z = -0.2;
    }
  }
  private makeActor(a: ActorView): Visual {
    const root = new TransformNode(a.id, this.scene),
      modelRoot = new TransformNode(`${a.id}-body`, this.scene);
    modelRoot.parent = root;
    const model =
      a.kind === "wolf"
        ? "wolf"
        : a.kind === "guard"
          ? "knight"
          : a.kind === "mara"
            ? "mara"
            : a.kind === "merchant"
              ? "nemi"
              : a.guild;
    const container = this.containers.get(model);
    let groups: AnimationGroup[] = [];
    if (container) {
      const instance = container.instantiateModelsToScene(
        (name) => `${a.id}-${name}`,
        false,
        { doNotInstantiate: true },
      );
      for (const node of instance.rootNodes) node.parent = modelRoot;
      groups = instance.animationGroups;
      groups.forEach((g) => {
        g.stop();
        g.enableBlending = false;
      });
    } else this.proxy(a, modelRoot);
    for (const mesh of modelRoot.getChildMeshes()) {
      mesh.metadata = { actor: a.id };
      mesh.isPickable = true;
      this.shadow.addShadowCaster(mesh, false);
    }
    const ring = this.ring(
      `${a.id}-ring`,
      a.kind === "wolf" ? 0.5 : 0.46,
      a.id === this.selfId ? "#d3b570" : "#718f92",
    );
    ring.parent = root;
    root.position.set(a.x, 0, a.z);
    return {
      root,
      groups,
      clip: "",
      last: { x: a.x, z: a.z },
      ring,
      meshRoot: modelRoot,
      dead: false,
      model,
      ownsMaterials: !container,
      castStarted: -1,
      castEvent: -1,
      motion: null,
      weights: new Map(),
      movingUntil: 0,
      hitAt: -100,
      hitHeading: 0,
      sampleFrame: null,
    };
  }
  private clip(v: Visual, name: string, speed = 1) {
    const match =
      v.groups.find((g) => g.name.toLowerCase().endsWith(name)) ??
      v.groups.find((g) => g.name.toLowerCase().includes(name));
    if (!match) return;
    if (v.clip !== name) {
      const first = !v.clip;
      v.clip = name;
      match.stop();
      match.start(["idle", "walk", "run"].includes(name), speed || 1);
      const weight = first ? 1 : 0;
      v.weights.set(match, weight);
      match.setWeightForAllAnimatables(weight);
    }
    match.speedRatio = speed || 1;
    // Pause before sampling: zero-speed playback otherwise re-evaluates frame zero.
    if (speed === 0 && match.isPlaying) match.pause();
    else if (speed !== 0 && !match.isPlaying && match.isStarted)
      match.restart();
    return match;
  }
  private update(dt: number) {
    this.time += dt;
    const snapshot = this.snapshot;
    if (!snapshot) return;
    const me = snapshot.actors.find((a) => a.id === this.selfId);
    if (me) {
      const target = this.houndStudy
        ? new Vector3(me.x + 2.5, 0.6, me.z + 1)
        : new Vector3(me.x, 0.6, me.z + 2.8);
      this.camera.setTarget(
        Vector3.Lerp(this.camera.target, target, 1 - Math.exp(-dt * 7)),
        false,
        false,
        true, // Follow the traveller while preserving the player's orbit and zoom.
      );
      this.light.position.set(me.x, 2, me.z - 1);
      const nearby = [...LANTERNS].sort(
        (a, b) =>
          Math.hypot(a[0] - me.x, a[1] - me.z) -
          Math.hypot(b[0] - me.x, b[1] - me.z),
      );
      this.worldLights.forEach((light, i) =>
        light.position.set(nearby[i][0], 2.6, nearby[i][1]),
      );
      const archAlpha =
        Math.abs(me.x) < 7 && Math.abs(me.z - 5) < 12 ? 0.14 : 1;
      for (const material of this.gateOccluders)
        material.alpha += (archAlpha - material.alpha) * Math.min(1, dt * 6);
      const awningAlpha =
        Math.abs(me.x - 7.5) < 3.5 && Math.abs(me.z + 15) < 5 ? 0.16 : 1;
      for (const material of this.awningOccluders)
        material.alpha += (awningAlpha - material.alpha) * Math.min(1, dt * 6);
      for (const canopy of this.canopyOccluders) {
        const alpha =
          Math.abs(me.x - canopy.x) < 12 && Math.abs(me.z - canopy.z) < 12
            ? 0.08
            : 1;
        canopy.material.alpha +=
          (alpha - canopy.material.alpha) * Math.min(1, dt * 6);
      }
      for (const [i, v] of this.stressActors.entries()) {
        v.root.position.set(
          me.x + ((i % 8) - 3.5) * 1.65 + Math.sin(this.time + i) * 0.12,
          0,
          me.z + Math.floor(i / 8) * 1.55 - 2,
        );
        v.root.rotation.y = Math.sin(this.time * 0.5 + i) * 0.6;
      }
      for (const [i, m] of this.stressSummons.entries())
        m.position.set(
          me.x + ((i % 8) - 3.5) * 1.7,
          1.2 + Math.sin(this.time * 2 + i) * 0.2,
          me.z + Math.floor(i / 8) * 2 + 1,
        );
      if (this.elemental) {
        this.elemental.position.set(me.x - 2.6, 0, me.z + 1);
        this.elemental.rotation.y = this.time * 0.3;
      }
      if (this.houndStudy) {
        this.houndStudy.root.position.set(me.x + 2.5, 0, me.z + 1);
        this.houndStudy.root.rotation.y = Math.PI / 2;
        const clips = ["idle", "walk", "run", "attack", "dodge", "death"];
        this.clip(
          this.houndStudy,
          clips[
            Math.floor((this.time - this.houndStudyStarted) / 3) % clips.length
          ],
        );
        this.blend(this.houndStudy, dt);
      }
    }
    const present = new Set(snapshot.actors.map((a) => a.id));
    for (const [id, v] of this.actors)
      if (!present.has(id)) {
        this.disposeActor(v);
        this.actors.delete(id);
      }
    for (const a of snapshot.actors) {
      let v = this.actors.get(a.id);
      const model =
        a.kind === "wolf"
          ? "wolf"
          : a.kind === "guard"
            ? "knight"
            : a.kind === "mara"
              ? "mara"
              : a.kind === "merchant"
                ? "nemi"
                : a.guild;
      if (v && v.model !== model) {
        this.disposeActor(v);
        this.actors.delete(a.id);
        v = undefined;
      }
      if (!v) {
        v = this.makeActor(a);
        this.actors.set(a.id, v);
      }
      const goal = new Vector3(a.x, 0, a.z);
      if (Vector3.Distance(v.root.position, goal) > 0.035)
        v.movingUntil = this.time + 0.12;
      const moving = this.time < v.movingUntil;
      v.root.position = Vector3.Lerp(
        v.root.position,
        goal,
        1 - Math.exp(-dt * 16),
      );
      let delta = a.heading - v.root.rotation.y;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      v.root.rotation.y += delta * Math.min(1, dt * 14);
      v.ring.isVisible =
        a.life !== "dead" &&
        (a.id === this.selfId || a.id === this.selected || a.red > 0);
      (v.ring.material as StandardMaterial).emissiveColor =
        Color3.FromHexString(
          a.red > 0
            ? "#e25946"
            : a.id === this.selected
              ? "#e4bc72"
              : "#4c929b",
        );
      v.meshRoot.rotation.z =
        a.life === "dead" && !v.groups.length ? -Math.PI / 2 : 0;
      v.meshRoot.position.y = a.life === "downed" ? -1 : 0;
      v.sampleFrame = null;
      const serverNow =
        snapshot.now + Math.min(0.1, this.time - this.snapshotReceived);
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
        const motion = v.model === "knight" ? KNIGHT_MOTION[key] : undefined;
        const windup =
          a.cast && a.cast.start === start
            ? a.cast.end - a.cast.start
            : a.kind === "wolf" || a.kind === "guard"
              ? 0.8
              : (KITS[a.guild].find((k) => k.key === key)?.windup ?? 0.3);
        v.castStarted = start;
        if (castEvent) v.castEvent = castEvent.id;
        v.motion = {
          clip: motion?.clip ?? "attack",
          key,
          start,
          windup,
          impact: motion?.impact ?? 0.35,
          recovery: motion?.recovery ?? 0.32,
        };
        if (v.clip === v.motion.clip) v.clip = "";
      }
      const committed =
        v.motion &&
        snapshot.events.some(
          (e) =>
            e.source === a.id &&
            e.type === "resolve" &&
            e.key === v.motion!.key &&
            e.at >= v.motion!.start,
        );
      if (
        v.motion &&
        (a.life !== "alive" ||
          a.dodging ||
          a.stunned ||
          (moving && !a.cast) ||
          (!a.cast &&
            !committed &&
            snapshot.now < v.motion.start + v.motion.windup) ||
          serverNow > v.motion.start + v.motion.windup + v.motion.recovery)
      )
        v.motion = null;
      if (a.life === "dead") {
        v.motion = null;
        this.clip(v, "death");
      } else if (a.dodging) this.clip(v, "dodge", 1.6);
      else if (v.motion) {
        const m = v.motion,
          group = this.clip(v, m.clip, 0);
        if (group)
          v.sampleFrame =
            group.from +
            (group.to - group.from) *
              actionPhase(serverNow - m.start, m.windup, m.impact, m.recovery);
      } else if (a.guarding && v.model === "knight") {
        const group = this.clip(v, "guard", 0);
        if (group) v.sampleFrame = group.to;
      } else if (moving)
        this.clip(
          v,
          a.returning && v.model === "wolf" ? "walk" : "run",
          a.returning ? 0.8 : 1,
        );
      else this.clip(v, "idle");
      this.blend(v, dt);
      const reaction = Math.max(0, 1 - (this.time - v.hitAt) / 0.18);
      v.meshRoot.position.x =
        Math.sin(v.hitHeading - v.root.rotation.y) * reaction * 0.055;
      v.meshRoot.position.z =
        Math.cos(v.hitHeading - v.root.rotation.y) * reaction * 0.055;
      if (!v.groups.length && a.life === "alive")
        v.meshRoot.position.y = moving
          ? Math.sin(this.time * 14) * 0.045
          : Math.sin(this.time * 2) * 0.009;
    }
    this.refreshTelegraphs(snapshot);
    this.refreshPersistentEffects(snapshot);
    this.combatFx.update(dt, snapshot);
  }
  private blend(v: Visual, dt: number) {
    for (const [group, weight] of v.weights) {
      const desired = group.name.toLowerCase().endsWith(v.clip) ? 1 : 0;
      const next = weight + (desired - weight) * Math.min(1, dt * 18);
      if (!desired && next < 0.005) {
        group.stop();
        v.weights.delete(group);
      } else {
        group.setWeightForAllAnimatables(next);
        v.weights.set(group, next);
        if (group.isStarted && !group.isPlaying)
          group.goToFrame(
            desired && v.sampleFrame !== null
              ? v.sampleFrame
              : group.getRetainedCurrentFrame(),
            true,
          );
      }
    }
  }
  private disposeActor(v: Visual) {
    for (const mesh of v.root.getChildMeshes())
      this.shadow.removeShadowCaster(mesh, false);
    const skeletons = new Set(
      v.meshRoot
        .getChildMeshes()
        .map((m) => m.skeleton)
        .filter(Boolean),
    );
    if (v.ownsMaterials)
      for (const m of new Set(
        v.meshRoot.getChildMeshes().map((m) => m.material),
      ))
        m?.dispose();
    v.ring.material?.dispose();
    v.root.dispose();
    v.groups.forEach((g) => g.dispose());
    skeletons.forEach((s) => s?.dispose());
  }
  private refreshPersistentEffects(s: Snapshot) {
    const active = new Set<string>();
    const show = (id: string, create: () => Mesh, pos: Vector3) => {
      active.add(id);
      let mesh = this.persistentEffects.get(id);
      if (!mesh) {
        mesh = create();
        this.persistentEffects.set(id, mesh);
      }
      mesh.position.copyFrom(pos);
      return mesh;
    };
    for (const p of s.projectiles ?? []) {
      const beam = show(
        `shot-${p.id}`,
        () => {
          const m = MeshBuilder.CreateCylinder(
            "pulse",
            { diameter: 0.065, height: 0.85, tessellation: 6 },
            this.scene,
          );
          m.material = this.material("pulse", "#85eaff", 3);
          m.isPickable = false;
          return m;
        },
        new Vector3(p.x, 1.1, p.z),
      );
      beam.rotation.set(Math.PI / 2, Math.atan2(p.dx, p.dz), 0);
    }
    for (const mine of s.mines ?? []) {
      const m = show(
        `mine-${mine.id}`,
        () => {
          const ring = this.ring("armed mine", 0.42, "#7fdee7");
          return ring;
        },
        new Vector3(mine.x, 0.08, mine.z),
      );
      m.scaling.setAll(mine.armed ? 1 + Math.sin(this.time * 5) * 0.08 : 0.65);
    }
    for (const a of s.actors.filter((a) => a.healing && a.life === "alive")) {
      if (a.guild === "cyborg") {
        const drone = show(
          `drone-${a.id}`,
          () => {
            const m = MeshBuilder.CreatePolyhedron(
              "repair drone",
              { type: 1, size: 0.16 },
              this.scene,
            );
            m.material = this.material("drone", "#a9e0d4", 1.3);
            m.isPickable = false;
            return m;
          },
          new Vector3(
            a.x + Math.sin(this.time * 2) * 0.65,
            1.7 + Math.cos(this.time * 3) * 0.07,
            a.z + Math.cos(this.time * 2) * 0.65,
          ),
        );
        drone.rotation.y = this.time;
      }
    }
    for (const [id, m] of this.persistentEffects)
      if (!active.has(id)) {
        m.dispose(false, true);
        this.persistentEffects.delete(id);
      }
  }
  private refreshTelegraphs(s: Snapshot) {
    const attacks = s.actors.filter(
      (a) => a.cast && ["basic", "1", "2"].includes(a.cast.key),
    );
    const active = new Set(attacks.map((a) => `cast-${a.id}`));
    for (let i = this.eventMeshes.length - 1; i >= 0; i--)
      if (!active.has(this.eventMeshes[i].name)) {
        this.eventMeshes[i].dispose(false, true);
        this.eventMeshes.splice(i, 1);
      }
    for (const a of attacks) {
      const cast = a.cast!,
        lane = a.kind === "player" && a.guild === "cyborg" && cast.key === "1";
      let mesh = this.eventMeshes.find((m) => m.name === `cast-${a.id}`);
      if (!mesh) {
        mesh = lane
          ? MeshBuilder.CreateGround(
              `cast-${a.id}`,
              { width: 1.5, height: 16 },
              this.scene,
            )
          : this.ring(
              `cast-${a.id}`,
              0.53,
              a.id === this.selfId ? "#e8c990" : "#e47a48",
            );
        if (lane)
          mesh.material = this.material(
            "pulse-lance-warning",
            a.id === this.selfId ? "#7bc9d6" : "#e47a48",
            1,
          );
        const mat = mesh.material as StandardMaterial;
        mat.alpha = 0.35;
        mat.disableLighting = true;
        mesh.isPickable = false;
        this.eventMeshes.push(mesh);
      }
      const target = s.actors.find((t) => t.id === cast.target);
      if (lane) {
        const heading = Math.atan2(cast.aim.x - a.x, cast.aim.z - a.z);
        mesh.position.set(
          a.x + Math.sin(heading) * 8,
          0.055,
          a.z + Math.cos(heading) * 8,
        );
        mesh.rotation.y = heading;
      } else {
        const pos = target
          ? this.actors.get(target.id)?.root.position
          : undefined;
        mesh.position.set(pos?.x ?? cast.aim.x, 0.065, pos?.z ?? cast.aim.z);
      }
      const progress = Math.max(
        0,
        Math.min(
          1,
          (s.now +
            Math.min(0.1, this.time - this.snapshotReceived) -
            cast.start) /
            Math.max(0.01, cast.end - cast.start),
        ),
      );
      mesh.visibility = 0.35 + progress * 0.55;
    }
  }
  private showEvent(e: CombatEvent) {
    if (!this.snapshot) return;
    this.combatFx.event(e, this.snapshot);
    if (e.type === "hit") {
      const target = this.actors.get(e.target),
        source = this.snapshot.actors.find((a) => a.id === e.source);
      if (target && source) {
        target.hitAt = this.time;
        target.hitHeading = Math.atan2(e.x - source.x, e.z - source.z);
      }
    }
  }
  private makeBoundaries() {
    const mat = this.material("safe-stone", "#66b7b2", 0.5);
    const markers: Mesh[] = [];
    for (let x = -19; x <= 19; x += 0.6) {
      const marker = MeshBuilder.CreateBox(
        "safe-boundary",
        { width: 0.35, height: 0.012, depth: 0.07 },
        this.scene,
      );
      marker.position.set(x, 0.03, 0);
      marker.material = mat;
      marker.isPickable = false;
      markers.push(marker);
    }
    const merged = Mesh.MergeMeshes(
      markers,
      true,
      true,
      undefined,
      false,
      true,
    );
    if (merged) merged.isPickable = false;
    const refuge = this.ring("refuge", REFUGE.radius, "#9fc5ae");
    refuge.position.set(REFUGE.x, 0.04, REFUGE.z);
  }
  private makeWater() {
    const water = MeshBuilder.CreateGround(
      "stream",
      { width: 40, height: 6, subdivisions: 24 },
      this.scene,
    );
    water.position.set(0, -0.03, 20);
    water.isPickable = false;
    const m = new PBRMaterial("cold-moving-water", this.scene);
    m.albedoColor = new Color3(0.055, 0.19, 0.22);
    m.roughness = 0.14;
    m.metallic = 0.45;
    m.alpha = 0.88;
    const texture = new DynamicTexture("ripples", 256, this.scene, true),
      ctx = texture.getContext();
    ctx.fillStyle = "#203f43";
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 120; i++) {
      ctx.strokeStyle = `rgba(160,202,206,${Math.random() * 0.25})`;
      ctx.beginPath();
      const y = Math.random() * 256;
      ctx.arc(Math.random() * 256, y, Math.random() * 24 + 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    texture.update();
    texture.uScale = 8;
    texture.vScale = 2;
    m.albedoTexture = texture;
    water.material = m;
    this.scene.onBeforeRenderObservable.add(
      () => (texture.uOffset = (performance.now() * 0.000006) % 1),
    );
  }
  private makeMotes() {
    const material = this.material("firefly", "#e8d5a1", 1.8);
    const base = MeshBuilder.CreateSphere(
      "mote",
      { diameter: 0.035, segments: 3 },
      this.scene,
    );
    base.material = material;
    base.isVisible = false;
    base.isPickable = false;
    for (let i = 0; i < 45; i++) {
      const mote = base.createInstance(`mote-${i}`);
      const x = Math.sin(i * 19.7) * 18,
        z = Math.cos(i * 9.2) * 44 + 10;
      mote.position.set(x, 0.5 + (i % 7) * 0.3, z);
      mote.isPickable = false;
      this.scene.onBeforeRenderObservable.add(() => {
        mote.position.y =
          0.8 + (i % 7) * 0.25 + Math.sin(this.time * 0.5 + i) * 0.22;
      });
    }
  }
  project(
    pos: Vec2,
    height = 2.25,
  ): { x: number; y: number; visible: boolean } {
    const p = Vector3.Project(
      new Vector3(pos.x, height, pos.z),
      Matrix.Identity(),
      this.scene.getTransformMatrix(),
      this.camera.viewport.toGlobal(
        this.engine.getRenderWidth(),
        this.engine.getRenderHeight(),
      ),
    );
    return {
      x: (p.x * this.canvas.clientWidth) / this.engine.getRenderWidth(),
      y: (p.y * this.canvas.clientHeight) / this.engine.getRenderHeight(),
      visible:
        p.z >= 0 &&
        p.z <= 1 &&
        p.x >= 0 &&
        p.x <= this.engine.getRenderWidth() &&
        p.y >= 0 &&
        p.y <= this.engine.getRenderHeight(),
    };
  }
  direction(x: number, z: number): Vec2 {
    const forward = new Vector3(
      -Math.cos(this.camera.alpha),
      0,
      -Math.sin(this.camera.alpha),
    );
    return {
      x: forward.x * z - forward.z * x,
      z: forward.z * z + forward.x * x,
    };
  }
  get aim(): Vec2 {
    const ray = this.scene.createPickingRay(
      this.scene.pointerX,
      this.scene.pointerY,
      Matrix.Identity(),
      this.camera,
    );
    const t = ray.intersectsPlane(new Plane(0, 1, 0, 0));
    const p = t ? ray.origin.add(ray.direction.scale(t)) : Vector3.Zero();
    return { x: p.x, z: p.z };
  }
  metrics(): RenderMetrics {
    return {
      fps: this.engine.getFps(),
      draws: this.instrumentation.drawCallsCounter.current,
      triangles: this.scene.meshes.reduce(
        (n, m) => n + m.getTotalIndices() / 3,
        0,
      ),
      activeTriangles: [
        ...new Set(
          this.scene
            .getActiveMeshes()
            .data.slice(0, this.scene.getActiveMeshes().length),
        ),
      ].reduce((n, m) => n + m.getTotalIndices() / 3, 0),
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
      combatEffects: this.combatFx.metrics(),
      camera: {
        alpha: this.camera.alpha,
        beta: this.camera.beta,
        radius: this.camera.radius,
      },
      studyMotion: this.houndStudy
        ? `${this.houndStudy.clip} · ${
            this.houndStudy.groups
              .filter((g) => g.isPlaying)
              .map((g) => `${g.name} frame ${g.getCurrentFrame().toFixed(1)}`)
              .join(", ") || "held final pose"
          }`
        : null,
      actorAudit: [...this.actors.values()].map((v) => ({
        model: v.model,
        clip: v.clip,
        position: v.root.position.asArray(),
        meshes: v.meshRoot.getChildMeshes().map((m) => ({
          name: m.name,
          enabled: m.isEnabled(),
          visible: m.isVisible,
          bounds: [
            ...m.getBoundingInfo().boundingBox.minimumWorld.asArray(),
            ...m.getBoundingInfo().boundingBox.maximumWorld.asArray(),
          ],
          scale: m.scaling.asArray(),
          skeleton: Boolean(m.skeleton),
        })),
      })),
    };
  }
  /** Synthetic renderer fixture only. No fake players or AI are sent to the server. */
  stress(enabled: boolean) {
    this.stressActors.forEach((v) => this.disposeActor(v));
    this.stressActors = [];
    this.stressSummons.forEach((m) => m.dispose());
    this.stressSummons = [];
    this.summonSource?.dispose(false, true);
    this.summonSource = null;
    if (!enabled || !this.snapshot) return;
    const template = this.snapshot.actors.find((a) => a.id === this.selfId)!;
    for (let i = 0; i < 60; i++) {
      const actor = {
        ...template,
        id: `render-fixture-${i}`,
        kind: i < 15 ? ("player" as const) : ("wolf" as const),
        guild: i % 2 ? ("knight" as const) : ("cyborg" as const),
        cast: null,
      };
      const v = this.makeActor(actor);
      v.ring.isVisible = false;
      this.clip(
        v,
        i % 3 ? "run" : v.model === "knight" ? "cut" : "attack",
        0.9 + (i % 3) * 0.1,
      );
      this.stressActors.push(v);
    }
    this.summonSource = MeshBuilder.CreatePolyhedron(
      "summon-source",
      { type: 1, size: 0.28 },
      this.scene,
    );
    this.summonSource.material = this.material(
      "summon-fixture",
      "#97d1c5",
      1.5,
    );
    this.summonSource.isVisible = false;
    for (let i = 0; i < 32; i++) {
      const m = this.summonSource.createInstance(`summon-fixture-${i}`);
      m.isPickable = false;
      this.stressSummons.push(m);
    }
  }
  /** Local asset inspection, with no server actor or playable transformation implied. */
  previewHound(enabled: boolean) {
    if (this.houndStudy) this.disposeActor(this.houndStudy);
    this.houndStudy = null;
    if (!enabled || !this.snapshot) {
      if (this.studyCamera) {
        Object.assign(this.camera, this.studyCamera);
        this.camera.lowerRadiusLimit = 18;
        this.studyCamera = null;
      }
      return;
    }
    this.studyCamera ??= {
      alpha: this.camera.alpha,
      beta: this.camera.beta,
      radius: this.camera.radius,
    };
    this.camera.lowerRadiusLimit = 6;
    this.camera.alpha = -0.4;
    this.camera.beta = 1.1;
    this.camera.radius = 7;
    const template = this.snapshot.actors.find((a) => a.id === this.selfId)!;
    this.houndStudy = this.makeActor({
      ...template,
      id: "hound-rig-study",
      kind: "wolf",
      cast: null,
    });
    this.houndStudy.ring.isVisible = false;
    this.houndStudyStarted = this.time;
  }
  /** Four deliberately different surface modes, independent of the future playable kit. */
  previewElemental(enabled: boolean) {
    if (this.elemental) {
      for (const m of this.elemental.getChildMeshes()) m.material?.dispose();
      this.elemental.dispose();
      this.elemental = null;
    }
    if (!enabled) return;
    this.elemental = new TransformNode("Elemental material study", this.scene);
    const colors = ["#db702f", "#69adb8", "#b2d6db", "#74795a"];
    colors.forEach((color, i) => {
      const root = new TransformNode(`element-${i}`, this.scene);
      root.parent = this.elemental;
      root.position.x = (i - 1.5) * 1.4;
      const mat = new PBRMaterial(`elemental-${i}`, this.scene);
      mat.albedoColor = Color3.FromHexString(color);
      mat.metallic = i === 1 ? 0.4 : 0;
      mat.roughness = i === 1 ? 0.15 : 0.8;
      if (i === 0) mat.emissiveColor = Color3.FromHexString(color).scale(1.2);
      if (i === 1 || i === 2) {
        mat.alpha = i === 1 ? 0.68 : 0.32;
        mat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
        mat.backFaceCulling = false;
      }
      const parts = [
        { p: [0, 0.95, 0], s: [0.5, 0.7, 0.3] },
        { p: [0, 1.5, 0], s: [0.28, 0.32, 0.28] },
        { p: [-0.39, 0.94, 0], s: [0.22, 0.65, 0.24] },
        { p: [0.39, 0.94, 0], s: [0.22, 0.65, 0.24] },
        { p: [-0.15, 0.35, 0], s: [0.24, 0.64, 0.25] },
        { p: [0.15, 0.35, 0], s: [0.24, 0.64, 0.25] },
      ];
      for (const part of parts) {
        const m = MeshBuilder.CreatePolyhedron(
          "elemental silhouette",
          { type: 1, size: 1 },
          this.scene,
        );
        m.parent = root;
        m.position.fromArray(part.p);
        m.scaling.fromArray(part.s).scaleInPlace(0.6);
        m.material = mat;
        m.isPickable = false;
      }
    });
  }
  dispose() {
    this.stopResize();
    this.engine.stopRenderLoop();
    this.combatFx.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
