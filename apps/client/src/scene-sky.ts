/**
 * Sky, sun, moon, stars, voxel clouds and the day/night palette for the
 * voxel GameScene. Presentation only: the day phase is a local, cosmetic clock.
 */
import {
  Color3,
  Effect,
  Mesh,
  MeshBuilder,
  ShaderMaterial,
  StandardMaterial,
  TransformNode,
  Vector3,
  VertexData,
  type Scene,
} from "@babylonjs/core";
import { VoxelGrid } from "./voxel/grid";
import { meshColors } from "./voxel/mesher";

/** Everything the scene needs from the day phase, recomputed every frame. */
export type SkyState = {
  /** 0 midnight · 0.25 sunrise · 0.5 noon · 0.75 sunset. */
  phase: number;
  /** Sine of the sun's elevation (−1 midnight … 1 noon). */
  elevation: number;
  /** 0 full day … 1 deep night. */
  night: number;
  /** 0..1, peaks while the sun crosses the horizon. */
  twilight: number;
  /** Unit vectors from the scene toward the sun and the moon. */
  sunDir: Vector3;
  moonDir: Vector3;
  zenith: Color3;
  horizon: Color3;
  /** Sunrise/sunset glow on the sun's side of the horizon. */
  glow: Color3;
  /** Fog and clear colour (the horizon, slightly hazier). */
  fog: Color3;
  hemiSky: Color3;
  hemiGround: Color3;
  hemiIntensity: number;
  /** Direction the shadow-casting light travels (sun by day, moon by night). */
  lightDir: Vector3;
  lightColor: Color3;
  lightIntensity: number;
  /** ShadowGenerator darkness: 0 black … 1 no shadow. */
  shadowDarkness: number;
  cloud: Color3;
  stars: number;
};

type Key = {
  e: number;
  zenith: string;
  horizon: string;
  glow: string;
  hemiSky: string;
  hemiGround: string;
  hemi: number;
  light: string;
  lightI: number;
  cloud: string;
};
// Keyframes by sun elevation. Night stays readable: lavender-blue ambient.
const KEYS: Key[] = [
  {
    e: -1,
    zenith: "#0b1233",
    horizon: "#28356b",
    glow: "#28356b",
    hemiSky: "#8a96e0",
    hemiGround: "#353a62",
    hemi: 0.62,
    light: "#b4c2ff",
    lightI: 0.42,
    cloud: "#4a5590",
  },
  {
    e: -0.3,
    zenith: "#0f1638",
    horizon: "#2e3a72",
    glow: "#3a3c7a",
    hemiSky: "#8a96e0",
    hemiGround: "#353a62",
    hemi: 0.62,
    light: "#b4c2ff",
    lightI: 0.42,
    cloud: "#4f5a96",
  },
  {
    e: -0.08,
    zenith: "#2b3274",
    horizon: "#8a6fb4",
    glow: "#d27aa8",
    hemiSky: "#a49ae0",
    hemiGround: "#40395c",
    hemi: 0.6,
    light: "#d7b4ff",
    lightI: 0.22,
    cloud: "#a08ac8",
  },
  {
    e: 0.04,
    zenith: "#5778cc",
    horizon: "#ffaa86",
    glow: "#ff8a7a",
    hemiSky: "#ffc8b0",
    hemiGround: "#6a5a58",
    hemi: 0.64,
    light: "#ffb27a",
    lightI: 0.62,
    cloud: "#ffc6b8",
  },
  {
    e: 0.28,
    zenith: "#56aaf0",
    horizon: "#c6e6ff",
    glow: "#ffe2bc",
    hemiSky: "#c8e6ff",
    hemiGround: "#6b8a5a",
    hemi: 0.7,
    light: "#ffecc8",
    lightI: 0.98,
    cloud: "#ffffff",
  },
  {
    e: 1,
    zenith: "#46a2ee",
    horizon: "#cfeaff",
    glow: "#fff4dc",
    hemiSky: "#bfe3ff",
    hemiGround: "#6b8a5a",
    hemi: 0.72,
    light: "#fff1d6",
    lightI: 1.05,
    cloud: "#ffffff",
  },
];
const hex = new Map<string, Color3>();
const col = (h: string) => {
  let c = hex.get(h);
  if (!c) hex.set(h, (c = Color3.FromHexString(h)));
  return c;
};
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerpInto = (out: Color3, a: string, b: string, t: number) =>
  Color3.LerpToRef(col(a), col(b), t, out);

export function createSkyState(): SkyState {
  return {
    phase: 0.32,
    elevation: 0,
    night: 0,
    twilight: 0,
    sunDir: new Vector3(0, 1, 0),
    moonDir: new Vector3(0, -1, 0),
    zenith: new Color3(),
    horizon: new Color3(),
    glow: new Color3(),
    fog: new Color3(),
    hemiSky: new Color3(),
    hemiGround: new Color3(),
    hemiIntensity: 0.7,
    lightDir: new Vector3(0, -1, 0),
    lightColor: new Color3(),
    lightIntensity: 1,
    shadowDarkness: 0.35,
    cloud: new Color3(),
    stars: 0,
  };
}

/**
 * Fill `out` for a day phase. The sun rises in the east (−x: the default
 * camera looks north with +x on the left), crosses the southern sky and sets
 * in the west; the moon is opposite.
 */
export function computeSky(phase: number, out: SkyState): SkyState {
  const p = ((phase % 1) + 1) % 1;
  out.phase = p;
  const theta = (p - 0.25) * Math.PI * 2;
  const e = Math.sin(theta);
  out.elevation = e;
  out.sunDir.set(-Math.cos(theta), e * 1.15, -0.5).normalize();
  out.moonDir.set(Math.cos(theta) * 0.9, -e * 1.1, -0.35).normalize();
  out.night = 1 - smooth(-0.14, 0.1, e);
  out.twilight = Math.exp(-((e / 0.16) ** 2));
  out.stars = 1 - smooth(-0.22, 0.02, e);

  let i = 0;
  while (i < KEYS.length - 2 && e > KEYS[i + 1].e) i++;
  const a = KEYS[i],
    b = KEYS[i + 1];
  const t = smooth(0, 1, (e - a.e) / (b.e - a.e));
  lerpInto(out.zenith, a.zenith, b.zenith, t);
  lerpInto(out.horizon, a.horizon, b.horizon, t);
  lerpInto(out.glow, a.glow, b.glow, t);
  lerpInto(out.hemiSky, a.hemiSky, b.hemiSky, t);
  lerpInto(out.hemiGround, a.hemiGround, b.hemiGround, t);
  lerpInto(out.lightColor, a.light, b.light, t);
  lerpInto(out.cloud, a.cloud, b.cloud, t);
  out.hemiIntensity = a.hemi + (b.hemi - a.hemi) * t;
  out.lightIntensity = a.lightI + (b.lightI - a.lightI) * t;
  Color3.LerpToRef(out.horizon, out.zenith, 0.12, out.fog);

  // The shadow light follows the sun by day and the moon by night. It keeps a
  // minimum elevation so shadows stay short and readable, and the swap
  // happens while both are dim and the shadows are faded out.
  const useSun = e > -0.02;
  const src = useSun ? out.sunDir : out.moonDir;
  const flat = Math.hypot(src.x, src.z) || 1;
  const minY = 0.62;
  const y = Math.max(src.y, minY);
  const k = Math.sqrt(Math.max(0, 1 - y * y)) / flat;
  out.lightDir.set(-src.x * k, -y, -src.z * k).normalize();
  const horizonFade = smooth(0.0, 0.14, Math.abs(e + 0.02));
  out.shadowDarkness = 1 - (useSun ? 0.62 : 0.4) * horizonFade;
  return out;
}

// ───────────────────────────── sky dome ─────────────────────────────

Effect.ShadersStore["voxelSkyVertexShader"] = `
precision highp float;
attribute vec3 position;
uniform mat4 worldViewProjection;
varying vec3 vDir;
void main(void) {
  vDir = position;
  vec4 p = worldViewProjection * vec4(position, 1.0);
  // Pin the dome to the far plane so it never hides the world.
  gl_Position = vec4(p.xy, p.w * 0.99995, p.w);
}`;

Effect.ShadersStore["voxelSkyFragmentShader"] = `
precision highp float;
varying vec3 vDir;
uniform vec3 zenith;
uniform vec3 horizon;
uniform vec3 glowColor;
uniform vec3 sunDir;
uniform vec3 moonDir;
uniform vec3 sunColor;
uniform float stars;
uniform float twilight;
uniform float time;
uniform float sunVisible;
uniform float moonVisible;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main(void) {
  vec3 d = normalize(vDir);
  float h = d.y;
  float up = clamp(h, 0.0, 1.0);
  vec3 col = mix(horizon, zenith, pow(up, 0.6));
  // Warm sunrise/sunset band, strongest on the sun's side of the sky.
  vec2 sd2 = normalize(sunDir.xz + vec2(1e-4));
  float side = dot(normalize(d.xz + vec2(1e-4)), sd2) * 0.5 + 0.5;
  float band = exp(-abs(h) * 7.0) * twilight * (0.35 + 0.65 * side * side);
  col = mix(col, glowColor, clamp(band, 0.0, 1.0));
  // Below the horizon: a soft haze of the horizon colour.
  col = mix(col, horizon * 0.92, smoothstep(0.0, -0.3, h));

  // Sun: soft halo plus a crisp, slightly squarish disc (voxel world, cute sun).
  float s = max(dot(d, sunDir), 0.0);
  col += sunColor * (pow(s, 12.0) * 0.32 + pow(s, 160.0) * 0.6) * sunVisible;
  vec3 sAxisX = normalize(cross(sunDir, vec3(0.0, 1.0, 0.0)) + vec3(1e-4, 0.0, 0.0));
  vec3 sAxisY = cross(sAxisX, sunDir);
  vec2 sq = vec2(dot(d, sAxisX), dot(d, sAxisY));
  float sunBox = max(abs(sq.x), abs(sq.y));
  float disc = (1.0 - smoothstep(0.034, 0.037, sunBox)) * step(0.0, dot(d, sunDir));
  col = mix(col, vec3(1.0, 0.96, 0.82) * 1.35, disc * sunVisible);

  // Moon: pale disc with a darker crescent bite and a cool halo.
  float m = max(dot(d, moonDir), 0.0);
  col += vec3(0.55, 0.62, 1.0) * pow(m, 40.0) * 0.28 * moonVisible;
  vec3 mAxisX = normalize(cross(moonDir, vec3(0.0, 1.0, 0.0)) + vec3(1e-4, 0.0, 0.0));
  vec3 mAxisY = cross(mAxisX, moonDir);
  vec2 mq = vec2(dot(d, mAxisX), dot(d, mAxisY));
  float moon = (1.0 - smoothstep(0.028, 0.031, length(mq))) * step(0.0, dot(d, moonDir));
  float bite = 1.0 - smoothstep(0.024, 0.027, length(mq - vec2(0.014, 0.008)));
  col = mix(col, vec3(0.94, 0.95, 1.0) * 1.15, moon * (1.0 - bite * 0.85) * moonVisible);

  // Twinkling stars on an azimuth/elevation grid; a few get a 4-point sparkle.
  if (stars > 0.01 && h > -0.02) {
    vec2 uv = vec2(atan(d.z, d.x) * 25.0, asin(clamp(h, -1.0, 1.0)) * 25.0);
    vec2 cell = floor(uv);
    float r = hash(cell);
    if (r > 0.9) {
      vec2 off = vec2(hash(cell + 7.1), hash(cell + 3.7)) * 0.6 + 0.2;
      vec2 f = fract(uv) - off;
      float size = 0.05 + 0.07 * hash(cell + 1.3);
      float tw = 0.55 + 0.45 * sin(time * (1.2 + 2.5 * hash(cell + 9.2)) + r * 60.0);
      float core = 1.0 - smoothstep(size * 0.4, size, length(f));
      float spark = r > 0.985 ? (1.0 - smoothstep(0.0, 0.035, min(abs(f.x), abs(f.y)))) * (1.0 - smoothstep(0.0, 0.32, length(f))) : 0.0;
      vec3 tint = mix(vec3(1.0, 0.95, 0.8), vec3(0.75, 0.85, 1.0), hash(cell + 5.5));
      col += tint * (core + spark * 0.8) * tw * stars * smoothstep(-0.02, 0.15, h) * 1.4;
    }
  }
  gl_FragColor = vec4(col, 1.0);
}`;

/** A blocky cloud made of 1.6 m voxels, shaded by the colour mesher's AO. */
function cloudData(seed: number) {
  let s = seed * 9301 + 49297;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const w = 9 + Math.floor(rand() * 6),
    d = 5 + Math.floor(rand() * 3);
  const grid = new VoxelGrid(w + 2, 5, d + 2, { x: 0, y: 0, z: 0 }, 1.6);
  for (let x = 1; x <= w; x++)
    for (let z = 1; z <= d; z++) {
      const dx = (x - (w + 1) / 2) / (w / 2),
        dz = (z - (d + 1) / 2) / (d / 2);
      const r = dx * dx + dz * dz;
      if (r > 1.05 + rand() * 0.2) continue;
      const height = 1 + Math.floor((1 - r) * 2.2 + rand() * 0.9);
      for (let y = 0; y < Math.min(4, height); y++)
        grid.set(x, y, z, y ? 1 : 2);
    }
  return meshColors(grid, {
    palette: [
      [0, 0, 0],
      [1, 1, 1],
      [0.86, 0.9, 0.98],
    ],
    aoStrength: 0.35,
    pivot: { x: ((w + 2) * 1.6) / 2, y: 0, z: ((d + 2) * 1.6) / 2 },
  });
}

type Cloud = { mesh: Mesh; speed: number; x: number };

/** Sky dome, sun/moon/stars and a handful of drifting voxel clouds. */
export class Sky {
  readonly dome: Mesh;
  private material: ShaderMaterial;
  private cloudMaterial: StandardMaterial;
  private clouds: Cloud[] = [];
  private root: TransformNode;

  constructor(private scene: Scene) {
    this.root = new TransformNode("sky", scene);
    this.dome = MeshBuilder.CreateSphere(
      "sky-dome",
      { diameter: 300, segments: 12, sideOrientation: Mesh.BACKSIDE },
      scene,
    );
    this.dome.parent = this.root;
    this.dome.infiniteDistance = true;
    this.dome.isPickable = false;
    this.dome.applyFog = false;
    this.dome.alwaysSelectAsActiveMesh = true;
    this.dome.doNotSyncBoundingInfo = true;
    this.material = new ShaderMaterial(
      "sky",
      scene,
      { vertex: "voxelSky", fragment: "voxelSky" },
      {
        attributes: ["position"],
        uniforms: [
          "worldViewProjection",
          "zenith",
          "horizon",
          "glowColor",
          "sunDir",
          "moonDir",
          "sunColor",
          "stars",
          "twilight",
          "time",
          "sunVisible",
          "moonVisible",
        ],
      },
    );
    this.material.backFaceCulling = false;
    this.material.disableDepthWrite = true;
    this.dome.material = this.material;

    this.cloudMaterial = new StandardMaterial("sky-clouds", scene);
    this.cloudMaterial.disableLighting = true;
    this.cloudMaterial.specularColor = Color3.Black();
    this.cloudMaterial.emissiveColor = Color3.Black();
    const layout: [number, number, number, number][] = [
      [-70, 34, 30, 0.9],
      [-15, 38, 70, 0.6],
      [40, 31, 45, 0.75],
      [95, 36, 10, 0.5],
      [-110, 33, -20, 0.7],
      [10, 40, -60, 0.55],
      [70, 35, -40, 0.8],
      [-40, 37, 110, 0.65],
    ];
    layout.forEach(([x, y, z, speed], i) => {
      const data = cloudData(i + 3);
      const mesh = new Mesh(`sky-cloud-${i}`, scene);
      const vd = new VertexData();
      vd.positions = data.positions;
      vd.normals = data.normals;
      vd.colors = data.colors;
      vd.indices = data.indices;
      vd.applyToMesh(mesh, false);
      mesh.hasVertexAlpha = false;
      mesh.material = this.cloudMaterial;
      mesh.isPickable = false;
      mesh.parent = this.root;
      mesh.position.set(x, y, z);
      mesh.rotation.y = (i * 0.7) % Math.PI;
      this.clouds.push({ mesh, speed: 1.2 + speed * 1.6, x });
    });
  }

  update(state: SkyState, time: number, dt: number) {
    const m = this.material;
    m.setColor3("zenith", state.zenith);
    m.setColor3("horizon", state.horizon);
    m.setColor3("glowColor", state.glow);
    m.setVector3("sunDir", state.sunDir);
    m.setVector3("moonDir", state.moonDir);
    m.setColor3("sunColor", state.lightColor);
    m.setFloat("stars", state.stars);
    m.setFloat("twilight", state.twilight);
    m.setFloat("time", time);
    m.setFloat("sunVisible", smooth(-0.12, 0.05, state.sunDir.y));
    m.setFloat("moonVisible", smooth(-0.1, 0.08, state.moonDir.y));
    // Lighting is disabled on clouds, so their colour comes from emission alone.
    this.cloudMaterial.emissiveColor.copyFrom(state.cloud);
    // Clouds drift toward +x (east to west: +x is west) and wrap around the diorama.
    for (const c of this.clouds) {
      c.x += c.speed * dt;
      if (c.x > 150) c.x -= 300;
      c.mesh.position.x = c.x;
    }
  }

  dispose() {
    this.material.dispose();
    this.cloudMaterial.dispose();
    this.root.dispose(false, false);
    this.clouds.length = 0;
  }
}
