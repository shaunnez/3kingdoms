import { useEffect, useRef } from "react";
import type { ActorView, Snapshot } from "../../../packages/contracts/game";
import { NPCS, REFUGE } from "../../../packages/simulation/map";

/** A survey render of the real environment with authoritative live markers. */
export function Minimap({
  me,
  snapshot,
}: {
  me: ActorView;
  snapshot: Snapshot;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    const asset = new Image();
    asset.src = "/ui/briar-map.webp";
    image.current = asset;
    return () => {
      image.current = null;
    };
  }, []);
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const size = 400,
      scale = size / 34;
    const point = (x: number, z: number) =>
      [size / 2 - (x - me.x) * scale, size / 2 - (z - me.z) * scale] as const;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "#192323";
    ctx.fillRect(0, 0, size, size);
    if (image.current?.complete && image.current.naturalWidth) {
      const [left, top] = point(20.8, 62);
      ctx.drawImage(image.current, left, top, 41.6 * scale, 104 * scale);
      ctx.fillStyle = "#12191b35";
      ctx.fillRect(0, 0, size, size);
    }
    // Safety is a rule, so its exact edge is drawn over the survey's decorative art.
    ctx.strokeStyle = "#9dcbbb";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(...point(-20, 0));
    ctx.lineTo(...point(20, 0));
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(
      ...point(REFUGE.x, REFUGE.z),
      REFUGE.radius * scale,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
    ctx.setLineDash([]);
    for (const actor of snapshot.actors) {
      if (actor.id === me.id || actor.life === "dead" || actor.returning)
        continue;
      const [x, y] = point(actor.x, actor.z);
      ctx.beginPath();
      ctx.arc(x, y, actor.kind === "wolf" ? 4 : 5, 0, Math.PI * 2);
      ctx.fillStyle =
        actor.red > 0 || actor.kind === "wolf" ? "#ed8a63" : "#a5d5c7";
      ctx.strokeStyle = "#111815";
      ctx.lineWidth = 2;
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
      const dx = rawX - size / 2,
        dy = rawY - size / 2;
      const clamp = Math.min(1, (size / 2 - 23) / Math.hypot(dx, dy));
      const x = size / 2 + dx * clamp,
        y = size / 2 + dy * clamp;
      ctx.strokeStyle = "#ffe2a2";
      ctx.fillStyle = "#796030";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x, y - 8);
      ctx.lineTo(x + 6, y);
      ctx.lineTo(x, y + 8);
      ctx.lineTo(x - 6, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(-me.heading);
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(7, 8);
    ctx.lineTo(0, 4);
    ctx.lineTo(-7, 8);
    ctx.closePath();
    ctx.fillStyle = "#e2f9ff";
    ctx.strokeStyle = "#172d39";
    ctx.lineWidth = 3;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }, [me, snapshot]);
  return (
    <canvas
      ref={canvas}
      width={400}
      height={400}
      role="img"
      aria-label="Nearby terrain and live characters. North is up. Gold marker: current quest. Dashed line: safe boundary."
    />
  );
}
