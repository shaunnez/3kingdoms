import { useEffect, useRef } from "react";
import type { ActorView, Snapshot } from "../../../packages/contracts/game";
import { NPCS, REFUGE } from "../../../packages/simulation/map";
import { getWorld } from "./voxel/world-gen";

const SIZE = 400,
  SPAN = 34,
  SCALE = SIZE / SPAN,
  INK = "#2b2140";

type Terrain = {
  image: HTMLCanvasElement;
  originX: number;
  /** World z of the image's top (north) edge. */
  northZ: number;
  metersPerPixel: number;
};
let terrain: Terrain | null | undefined;

/** The voxel world's top-down colours, painted once into an offscreen canvas. */
function loadTerrain(): Terrain | null {
  if (terrain !== undefined) return terrain;
  try {
    const map = getWorld().minimap;
    const image = document.createElement("canvas");
    image.width = map.width;
    image.height = map.height;
    image
      .getContext("2d")!
      .putImageData(
        new ImageData(new Uint8ClampedArray(map.rgba), map.width, map.height),
        0,
        0,
      );
    // Row 0 is the north edge; (originX, originZ) is pixel (0, 0)'s minimum corner.
    terrain = {
      image,
      originX: map.originX,
      northZ: map.originZ + map.metersPerPixel,
      metersPerPixel: map.metersPerPixel,
    };
  } catch (error) {
    console.warn("Minimap terrain unavailable", error);
    terrain = null;
  }
  return terrain;
}

/**
 * Pixelated survey of the voxel world with authoritative live markers. Mirrored
 * horizontally (+x to the left) so it matches the default north-facing camera.
 */
export function Minimap({
  me,
  snapshot,
}: {
  me: ActorView;
  snapshot: Snapshot;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const point = (x: number, z: number) =>
      [SIZE / 2 - (x - me.x) * SCALE, SIZE / 2 - (z - me.z) * SCALE] as const;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#8fd36f";
    ctx.fillRect(0, 0, SIZE, SIZE);
    const land = loadTerrain();
    if (land) {
      const step = land.metersPerPixel * SCALE;
      const [left, top] = point(land.originX, land.northZ);
      ctx.imageSmoothingEnabled = false;
      // Negative x scale mirrors the image to keep +x on the left.
      ctx.setTransform(-step, 0, 0, step, left, top);
      ctx.drawImage(land.image, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    // Safety is a rule, so its exact edge is drawn over the terrain colours.
    ctx.lineCap = "round";
    ctx.setLineDash([10, 9]);
    for (const [color, width] of [
      [INK, 7],
      ["#b9ffe0", 3.5],
    ] as const) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(...point(-20, 0));
      ctx.lineTo(...point(20, 0));
      ctx.stroke();
    }
    for (const [color, width] of [
      [INK, 7],
      ["#ffd45e", 3.5],
    ] as const) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.arc(
        ...point(REFUGE.x, REFUGE.z),
        REFUGE.radius * SCALE,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
    ctx.setLineDash([]);
    for (const actor of snapshot.actors) {
      if (actor.id === me.id || actor.life === "dead" || actor.returning)
        continue;
      const [x, y] = point(actor.x, actor.z);
      ctx.beginPath();
      ctx.arc(x, y, actor.kind === "wolf" ? 8 : 9, 0, Math.PI * 2);
      ctx.fillStyle =
        actor.red > 0 || actor.kind === "wolf" ? "#ff9f43" : "#8ff0c8";
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4;
      ctx.fill();
      ctx.stroke();
    }
    const objective =
      snapshot.self.quest === "accepted"
        ? NPCS.inscription
        : snapshot.self.quest === "complete"
          ? null
          : NPCS.mara;
    if (objective) {
      const [rawX, rawY] = point(objective.x, objective.z);
      const dx = rawX - SIZE / 2,
        dy = rawY - SIZE / 2;
      // Square clamp: the frame is a rounded square.
      const clamp = Math.min(
        1,
        (SIZE / 2 - 30) / Math.max(1, Math.abs(dx), Math.abs(dy)),
      );
      const x = SIZE / 2 + dx * clamp,
        y = SIZE / 2 + dy * clamp;
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(x, y - 15);
      ctx.lineTo(x + 11, y);
      ctx.lineTo(x, y + 15);
      ctx.lineTo(x - 11, y);
      ctx.closePath();
      ctx.fillStyle = "#ffd45e";
      ctx.strokeStyle = INK;
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.fill();
      ctx.fillStyle = "#fff4b0";
      ctx.fillRect(x - 3, y - 7, 4, 6);
    }
    ctx.save();
    ctx.translate(SIZE / 2, SIZE / 2);
    ctx.rotate(-me.heading);
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.lineTo(14, 14);
    ctx.lineTo(0, 6);
    ctx.lineTo(-14, 14);
    ctx.closePath();
    ctx.lineJoin = "round";
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = INK;
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }, [me, snapshot]);
  return (
    <canvas
      ref={canvas}
      width={SIZE}
      height={SIZE}
      role="img"
      aria-label="Nearby terrain and live characters. North is up. Gold marker: current quest. Dashed line: safe boundary."
    />
  );
}
