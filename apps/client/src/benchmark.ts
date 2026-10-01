import type { GameScene } from "./scene";
import { BUILD } from "../../../packages/contracts/game";

type Sample = {
  elapsed: number;
  phase: "baseline" | "loaded" | "unloaded";
  hidden: boolean;
  fps: number;
  draws: number;
  activeTriangles: number;
  meshes: number;
  textures: number;
  materials: number;
  skeletons: number;
  animationGroups: number;
  heapBytes: number | null;
  frameP95: number;
};
const percentile = (values: number[], p: number) => {
  const a = [...values].sort((a, b) => a - b);
  return a[Math.floor((a.length - 1) * p)] ?? 0;
};
/** Wall-clock sampling of actual browser rendering. Synthetic population, not a network load test. */
export async function benchmark(
  scene: GameScene,
  mode: "stress" | "memory",
  status: (s: string) => void,
  signal: AbortSignal,
) {
  const duration = mode === "stress" ? 600 : 1800,
    started = performance.now(),
    samples: Sample[] = [];
  const viewport = () => ({
    width: innerWidth,
    height: innerHeight,
    pixelRatio: devicePixelRatio,
  });
  const initialViewport = viewport();
  let previousViewport = JSON.stringify(initialViewport);
  const viewportChanges: {
    elapsed: number;
    width: number;
    height: number;
    pixelRatio: number;
  }[] = [];
  let loaded = false;
  scene.stress(false);
  const baseline = scene.metrics();
  let previousFrame = baseline.frameCount;
  const loadedFrames: number[] = [];
  if (mode === "stress") {
    scene.stress(true);
    loaded = true;
  }
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setInterval(() => {
        const elapsed = (performance.now() - started) / 1000;
        const currentViewport = viewport();
        if (JSON.stringify(currentViewport) !== previousViewport) {
          viewportChanges.push({ elapsed, ...currentViewport });
          previousViewport = JSON.stringify(currentViewport);
        }
        const wantLoaded =
          mode === "stress" ||
          (elapsed >= 60 && Math.floor((elapsed - 60) / 60) % 2 === 0);
        const m = scene.metrics(),
          newFrames = m.frameCount - previousFrame,
          frames = newFrames ? m.frameSamples.slice(-newFrames) : [];
        previousFrame = m.frameCount;
        if (loaded && !document.hidden) loadedFrames.push(...frames);
        samples.push({
          elapsed,
          phase:
            elapsed < 60 && mode === "memory"
              ? "baseline"
              : loaded
                ? "loaded"
                : "unloaded",
          hidden: document.hidden,
          fps: m.fps,
          draws: m.draws,
          activeTriangles: m.activeTriangles,
          meshes: m.meshes,
          textures: m.textures,
          materials: m.materials,
          skeletons: m.skeletons,
          animationGroups: m.animationGroups,
          heapBytes: m.heapBytes,
          frameP95: percentile(frames, 0.95),
        });
        status(
          `${mode === "stress" ? "10 minute rendering stress" : "30 minute load/unload trace"} · ${Math.floor(elapsed)}/${duration}s · ${loaded ? "16 player bodies / 48 hounds / 32 low-poly summons" : "baseline scene"} · ${m.fps.toFixed(0)} fps · ${m.draws} draws`,
        );
        if (wantLoaded !== loaded) {
          scene.stress(wantLoaded);
          loaded = wantLoaded;
        }
        if (signal.aborted) {
          clearInterval(timer);
          reject(new Error("Benchmark cancelled; partial run is not a pass."));
        } else if (elapsed >= duration) {
          clearInterval(timer);
          resolve();
        }
      }, 1000);
    });
  } finally {
    scene.stress(false);
  }
  const loadedSamples = samples.filter((s) => s.phase === "loaded");
  const report = {
    build: BUILD,
    mode,
    startedAt: new Date(
      Date.now() - (performance.now() - started),
    ).toISOString(),
    durationSeconds: (performance.now() - started) / 1000,
    fixture:
      "Synthetic animation and draw stress: 15 extra player bodies, 45 extra hounds, 32 low-poly summon bodies. Existing scene has one player and three hounds. No network or full summon AI claim.",
    viewport: viewport(),
    initialViewport,
    viewportChanges,
    fixedViewport: viewportChanges.length === 0,
    gpu: baseline.gpu,
    baseline: {
      meshes: baseline.meshes,
      textures: baseline.textures,
      materials: baseline.materials,
      skeletons: baseline.skeletons,
      animationGroups: baseline.animationGroups,
      heapBytes: baseline.heapBytes,
    },
    summary: {
      hiddenSamples: samples.filter((s) => s.hidden).length,
      fpsMedian: percentile(
        loadedSamples.map((s) => s.fps),
        0.5,
      ),
      frameMeasurement:
        "Uncapped animation-frame intervals collected while loaded and visible; simulation dt is independently clamped.",
      frameCount: loadedFrames.length,
      frameP95Ms: percentile(loadedFrames, 0.95),
      frameP99Ms: percentile(loadedFrames, 0.99),
      largestFrameMs: loadedFrames.reduce(
        (largest, frame) => Math.max(largest, frame),
        0,
      ),
      drawsP95: percentile(
        loadedSamples.map((s) => s.draws),
        0.95,
      ),
      activeTrianglesMax: Math.max(
        ...loadedSamples.map((s) => s.activeTriangles),
      ),
    },
    samples,
  };
  const response = await fetch("/evidence/metrics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(report, null, 2),
  });
  if (!response.ok)
    throw new Error(`Benchmark save failed (${response.status})`);
  return ((await response.json()) as { path: string }).path;
}
