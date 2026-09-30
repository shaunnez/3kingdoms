import type { GameScene } from "./scene";
import { BUILD } from "../../../packages/contracts/game";

async function upload(kind: "frame" | "video" | "metrics", body: Blob) {
  const response = await fetch(`/evidence/${kind}`, {
    method: "POST",
    headers: { "Content-Type": body.type },
    body,
  });
  if (!response.ok) throw new Error(`Capture save failed (${response.status})`);
  return ((await response.json()) as { path: string }).path;
}

async function hudFrame(includeWorld: boolean) {
  const { default: html2canvas } = await import("html2canvas");
  return html2canvas(document.body, {
    backgroundColor: includeWorld ? "#0c171b" : null,
    scale: 1,
    logging: false,
    ignoreElements: (element) =>
      element.hasAttribute("data-capture-ignore") ||
      (!includeWorld && element.id === "world"),
    onclone: (doc) => {
      doc.body.style.background = "transparent";
      doc.documentElement.style.background = "transparent";
      doc.body.style.height = `${innerHeight}px`;
    },
  });
}

export async function saveFrame() {
  const canvas = await hudFrame(true);
  try {
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Empty screenshot"))),
        "image/png",
      ),
    );
    return await upload("frame", blob);
  } finally {
    canvas.width = canvas.height = 0;
  }
}

/** Records the live WebGL canvas and actual DOM HUD; no reconstructed gameplay. */
export async function recordPlay(
  scene: GameScene,
  seconds: number,
  status: (text: string) => void,
  audioTracks: MediaStreamTrack[] = [],
) {
  if (!MediaRecorder.isTypeSupported("video/webm;codecs=vp9"))
    throw new Error("This browser does not support WebM recording.");
  const canvas = document.createElement("canvas");
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  const context = canvas.getContext("2d")!;
  let hud = await hudFrame(false),
    running = true,
    refreshing = false,
    lastHud = performance.now(),
    frameRequest = 0;
  const stream = canvas.captureStream(30);
  audioTracks.forEach((track) => stream.addTrack(track));
  const recorder = new MediaRecorder(stream, {
    mimeType: "video/webm;codecs=vp9",
    videoBitsPerSecond: 5_000_000,
  });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  const started = performance.now();
  const draw = () => {
    if (!running) return;
    context.drawImage(scene.canvas, 0, 0, canvas.width, canvas.height);
    context.drawImage(hud, 0, 0);
    if (!refreshing && performance.now() - lastHud > 500) {
      refreshing = true;
      lastHud = performance.now();
      void hudFrame(false)
        .then((c) => {
          if (running) {
            hud.width = hud.height = 0;
            hud = c;
          } else c.width = c.height = 0;
        })
        .catch((error) => console.warn("HUD recording sample failed", error))
        .finally(() => {
          refreshing = false;
        });
    }
    frameRequest = requestAnimationFrame(draw);
  };
  draw();
  recorder.start(1000);
  const interval = setInterval(
    () =>
      status(
        `Recording ${Math.floor((performance.now() - started) / 1000)} / ${seconds}s · live canvas, HUD sampled at 2Hz`,
      ),
    1000,
  );
  let stopTimer = 0;
  try {
    await new Promise<void>((resolve, reject) => {
      recorder.onstop = () => resolve();
      recorder.onerror = () => reject(new Error("Browser recording failed"));
      stopTimer = window.setTimeout(() => recorder.stop(), seconds * 1000);
    });
    running = false;
    return await upload("video", new Blob(chunks, { type: "video/webm" }));
  } finally {
    running = false;
    cancelAnimationFrame(frameRequest);
    clearInterval(interval);
    clearTimeout(stopTimer);
    if (recorder.state !== "inactive") recorder.stop();
    recorder.onstop = recorder.ondataavailable = recorder.onerror = null;
    stream.getTracks().forEach((track) => track.stop());
    chunks.length = 0;
    hud.width = hud.height = canvas.width = canvas.height = 0;
  }
}

export async function saveMetrics(scene: GameScene) {
  const data = {
    build: BUILD,
    capturedAt: new Date().toISOString(),
    viewport: {
      width: innerWidth,
      height: innerHeight,
      pixelRatio: devicePixelRatio,
    },
    userAgent: navigator.userAgent,
    ...scene.metrics(),
    resources: (
      performance.getEntriesByType("resource") as PerformanceResourceTiming[]
    )
      .filter((r) => !r.name.includes("/evidence/"))
      .map((r) => ({
        path: new URL(r.name).pathname,
        transferBytes: r.transferSize,
        encodedBytes: r.encodedBodySize,
        decodedBytes: r.decodedBodySize,
        durationMs: r.duration,
      })),
  };
  return upload(
    "metrics",
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
}
