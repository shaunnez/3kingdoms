/**
 * Post-processing for the voxel GameScene: the HDR default pipeline (FXAA,
 * bloom, ACES, colour curves, vignette) plus a screen-space tilt-shift pass
 * that also carries the chromatic-aberration pulse, and the screen feedback
 * (hurt flashes, low-health heartbeat, downed/dead desaturation).
 */
import {
  Color3,
  Color4,
  ColorCurves,
  DefaultRenderingPipeline,
  Effect,
  ImageProcessingConfiguration,
  PostProcess,
  Texture,
  type Camera,
  type Scene,
} from "@babylonjs/core";

export type QualityLevel = "low" | "medium" | "high";

Effect.ShadersStore["voxelTiltShiftFragmentShader"] = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform vec2 texel;
uniform float focusY;
uniform float band;
uniform float blur;
uniform float aberration;

void main(void) {
  // Tilt-shift: a sharp horizontal band around the player, blur growing
  // toward the top and bottom of the screen like a photographed toy model.
  float d = abs(vUV.y - focusY);
  float k = smoothstep(band, band + 0.38, d);
  float r = blur * k * k;
  vec3 col;
  if (r < 0.35) {
    col = texture2D(textureSampler, vUV).rgb;
  } else {
    col = vec3(0.0);
    for (int i = 0; i < 12; i++) {
      float fi = float(i);
      float a = fi * 2.39996;
      float rr = sqrt((fi + 0.5) / 12.0) * r;
      col += texture2D(textureSampler, vUV + vec2(cos(a), sin(a)) * rr * texel).rgb;
    }
    col /= 12.0;
  }
  // Chromatic aberration pulse for heavy impacts only.
  if (aberration > 0.05) {
    vec2 dir = (vUV - vec2(0.5)) * aberration * texel * 2.0;
    col.r = mix(col.r, texture2D(textureSampler, vUV + dir).r, 0.85);
    col.b = mix(col.b, texture2D(textureSampler, vUV - dir).b, 0.85);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const TILT: Record<QualityLevel, { blur: number; band: number }> = {
  low: { blur: 0, band: 0.2 },
  medium: { blur: 2.2, band: 0.17 },
  high: { blur: 3.6, band: 0.15 },
};
const BASE_VIGNETTE = new Color3(0.34, 0.27, 0.46);
const BASE_SATURATION = 14;

/** Pipeline, tilt-shift and screen feedback for one camera. */
export class ScreenPost {
  readonly pipeline: DefaultRenderingPipeline;
  /** Screen v (0 bottom … 1 top) of the sharp band. */
  focusY = 0.5;
  /** Extra band width (attract mode keeps more of the frame sharp). */
  bandBoost = 0;
  private tilt: PostProcess | null = null;
  private level: QualityLevel = "medium";
  private curves = new ColorCurves();
  private flashColor = new Color3(1, 0.25, 0.35);
  private flash = 0;
  private flashPeak = 0;
  private aberration = 0;
  private desat = 0;
  private beat = 0;
  private vignette = new Color4(0, 0, 0, 0);
  private tint = new Color3();

  constructor(
    private scene: Scene,
    private camera: Camera,
  ) {
    const p = new DefaultRenderingPipeline("voxel-finish", true, scene, [
      camera,
    ]);
    this.pipeline = p;
    p.samples = 1;
    p.fxaaEnabled = true;
    p.bloomEnabled = true;
    p.bloomThreshold = 0.8;
    p.bloomWeight = 0.3;
    p.bloomKernel = 48;
    p.bloomScale = 0.5;
    p.depthOfFieldEnabled = false;
    p.chromaticAberrationEnabled = false;
    p.imageProcessingEnabled = true;
    const ip = p.imageProcessing;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = 1.08;
    ip.contrast = 1.06;
    this.curves.globalSaturation = BASE_SATURATION;
    this.curves.globalExposure = 0;
    ip.colorCurvesEnabled = true;
    ip.colorCurves = this.curves;
    ip.vignetteEnabled = true;
    ip.vignetteBlendMode = ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;
    ip.vignetteCameraFov = 0.52;
    ip.vignetteStretch = 0.35;
    ip.vignetteWeight = 1.1;
    ip.vignetteColor = this.vignette;
    this.setQuality("medium");
  }

  setQuality(level: QualityLevel) {
    this.level = level;
    const p = this.pipeline;
    const samples = level === "high" ? 4 : 1;
    if (p.samples !== samples) p.samples = samples;
    p.bloomKernel = level === "low" ? 32 : 48;
    if (level === "low") {
      if (this.tilt) {
        this.camera.detachPostProcess(this.tilt);
        this.tilt.dispose(this.camera);
        this.tilt = null;
      }
      return;
    }
    if (!this.tilt) this.tilt = this.createTilt();
    else {
      // Pipeline rebuilds append their passes; keep the tilt-shift last.
      this.camera.detachPostProcess(this.tilt);
      this.camera.attachPostProcess(this.tilt);
    }
  }

  private createTilt(): PostProcess {
    const pp = new PostProcess(
      "voxel-tilt-shift",
      "voxelTiltShift",
      ["texel", "focusY", "band", "blur", "aberration"],
      null,
      1,
      this.camera,
      Texture.BILINEAR_SAMPLINGMODE,
      this.scene.getEngine(),
    );
    pp.onApply = (effect) => {
      const t = TILT[this.level];
      effect.setFloat2("texel", 1 / pp.width, 1 / pp.height);
      effect.setFloat("focusY", this.focusY);
      effect.setFloat("band", t.band + this.bandBoost);
      // Blur is authored for 1080p; scale with the render height.
      effect.setFloat("blur", (t.blur * pp.height) / 1080);
      effect.setFloat("aberration", this.aberration * (pp.height / 1080));
    };
    return pp;
  }

  /**
   * Reduced motion (a player setting, off by default): no colour-split
   * pulses, softer flashes at most twice a second, and a steady low-health
   * tint instead of a beating one.
   */
  reducedMotion = false;
  private lastFlash = -Infinity;

  /** Full-screen colour pulse (CSS hex), e.g. red when the player is hurt. */
  flashScreen(color: string, strength: number) {
    let s = Math.min(1, Math.max(0, strength));
    if (this.reducedMotion) {
      const now = performance.now();
      if (now - this.lastFlash < 500) return;
      this.lastFlash = now;
      s = Math.min(s, 0.3);
    }
    if (s < this.flash * 0.6) return;
    Color3.FromHexString(color).toLinearSpaceToRef(this.tint);
    this.flashColor.copyFrom(Color3.FromHexString(color));
    this.flash = Math.max(this.flash, s);
    this.flashPeak = this.flash;
    if (s >= 0.6) this.pulseAberration(s);
  }

  /** Brief RGB split for big impacts (pixels at 1080p). */
  pulseAberration(strength: number) {
    if (this.level === "low" || this.reducedMotion) return;
    this.aberration = Math.max(this.aberration, 6 * Math.min(1, strength));
  }

  /**
   * Per frame. `hp` is the local player's health fraction (null outside the
   * world); `life` drives the downed/dead desaturation.
   */
  update(
    dt: number,
    time: number,
    hp: number | null,
    life: "alive" | "downed" | "dead" | null,
  ) {
    this.flash = Math.max(0, this.flash - dt * (1.6 + this.flashPeak));
    this.aberration = Math.max(0, this.aberration - dt * 22);
    const desatTarget = life === "dead" ? 1 : life === "downed" ? 0.6 : 0;
    this.desat += (desatTarget - this.desat) * Math.min(1, dt * 2.2);
    // Double-thump heartbeat while health is low (matches the HUD pulse).
    const low = hp !== null && life === "alive" && hp < 0.3;
    const phase = (time % 1.05) / 1.05;
    const thump = this.reducedMotion
      ? 0.5
      : Math.exp(-((phase - 0.08) ** 2) / 0.0015) +
        0.7 * Math.exp(-((phase - 0.3) ** 2) / 0.0015);
    const beatTarget = low ? (0.35 + 0.65 * thump) * (1 - hp / 0.3) * 0.7 : 0;
    this.beat += (beatTarget - this.beat) * Math.min(1, dt * 14);

    const ip = this.pipeline.imageProcessing;
    const red = Math.min(1, this.flash + this.beat);
    const c = this.flash >= this.beat ? this.flashColor : HEART;
    this.vignette.r = BASE_VIGNETTE.r + (c.r - BASE_VIGNETTE.r) * red;
    this.vignette.g = BASE_VIGNETTE.g + (c.g * 0.35 - BASE_VIGNETTE.g) * red;
    this.vignette.b = BASE_VIGNETTE.b + (c.b * 0.45 - BASE_VIGNETTE.b) * red;
    ip.vignetteColor = this.vignette;
    ip.vignetteWeight = 1.1 + red * 2.6 + this.desat * 0.8;
    this.curves.globalSaturation = BASE_SATURATION - this.desat * 86;
    this.curves.globalExposure = -this.desat * 12;
  }

  dispose() {
    if (this.tilt) {
      this.camera.detachPostProcess(this.tilt);
      this.tilt.dispose(this.camera);
      this.tilt = null;
    }
    this.pipeline.dispose();
  }
}
const HEART = new Color3(1, 0.22, 0.32);
