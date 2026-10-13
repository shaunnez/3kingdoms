/**
 * Procedural particle sprites. White shapes on transparent backgrounds so a
 * particle system's colours tint them. Generated once per scene, never fetched.
 */
import { DynamicTexture, type Scene } from "@babylonjs/core";

export type FxTextureName =
  | "soft"
  | "spark"
  | "star4"
  | "star5"
  | "ring"
  | "puff"
  | "plus"
  | "petal"
  | "leaf"
  | "flake"
  | "bolt"
  | "heart"
  | "note"
  | "pixel"
  | "smoke"
  | "shard"
  | "streak";

type Ctx = CanvasRenderingContext2D;
const SIZE = 64;

function star(ctx: Ctx, points: number, outer: number, inner: number) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = (i * Math.PI) / points - Math.PI / 2;
    const x = SIZE / 2 + Math.cos(a) * r,
      y = SIZE / 2 + Math.sin(a) * r;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

const painters: Record<FxTextureName, (ctx: Ctx) => void> = {
  soft(ctx) {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 31);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(255,255,255,0.75)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SIZE, SIZE);
  },
  spark(ctx) {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 16);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.4, "rgba(255,255,255,0.9)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SIZE, SIZE);
  },
  star4(ctx) {
    const glow = ctx.createRadialGradient(32, 32, 0, 32, 32, 20);
    glow.addColorStop(0, "rgba(255,255,255,0.8)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = "#fff";
    star(ctx, 4, 31, 5);
    ctx.fill();
  },
  star5(ctx) {
    ctx.fillStyle = "#fff";
    star(ctx, 5, 29, 13);
    ctx.lineJoin = "round";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(255,255,255,0.65)";
    ctx.stroke();
    ctx.fill();
  },
  ring(ctx) {
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(32, 32, 26, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 12;
    ctx.stroke();
  },
  puff(ctx) {
    // Cartoon cloud: overlapping discs with a soft rim.
    for (const [x, y, r] of [
      [22, 36, 15],
      [40, 36, 16],
      [31, 25, 16],
      [31, 40, 14],
    ]) {
      const g = ctx.createRadialGradient(x, y, r * 0.55, x, y, r);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  plus(ctx) {
    ctx.fillStyle = "#fff";
    const r = 6;
    const rounded = (x: number, y: number, w: number, h: number) => {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.fill();
    };
    rounded(24, 8, 16, 48);
    rounded(8, 24, 48, 16);
  },
  petal(ctx) {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(32, 32, 13, 24, 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.beginPath();
    ctx.ellipse(30, 30, 5, 14, 0.6, 0, Math.PI * 2);
    ctx.fill();
  },
  leaf(ctx) {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(32, 4);
    ctx.quadraticCurveTo(58, 30, 32, 60);
    ctx.quadraticCurveTo(6, 30, 32, 4);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(32, 8);
    ctx.lineTo(32, 56);
    ctx.stroke();
  },
  flake(ctx) {
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(32 - Math.cos(a) * 26, 32 - Math.sin(a) * 26);
      ctx.lineTo(32 + Math.cos(a) * 26, 32 + Math.sin(a) * 26);
      ctx.stroke();
    }
    ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3,
        x = 32 + Math.cos(a) * 16,
        y = 32 + Math.sin(a) * 16;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(
          x + Math.cos(a + s * 0.8) * 9,
          y + Math.sin(a + s * 0.8) * 9,
        );
        ctx.stroke();
      }
    }
  },
  bolt(ctx) {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(38, 2);
    ctx.lineTo(14, 36);
    ctx.lineTo(30, 36);
    ctx.lineTo(24, 62);
    ctx.lineTo(50, 24);
    ctx.lineTo(34, 24);
    ctx.closePath();
    ctx.fill();
  },
  heart(ctx) {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(32, 56);
    ctx.bezierCurveTo(4, 36, 6, 10, 24, 10);
    ctx.bezierCurveTo(30, 10, 32, 16, 32, 18);
    ctx.bezierCurveTo(32, 16, 34, 10, 40, 10);
    ctx.bezierCurveTo(58, 10, 60, 36, 32, 56);
    ctx.fill();
  },
  note(ctx) {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(22, 48, 11, 8, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(29, 10, 6, 40);
    ctx.beginPath();
    ctx.moveTo(29, 10);
    ctx.quadraticCurveTo(50, 14, 52, 30);
    ctx.quadraticCurveTo(44, 22, 35, 22);
    ctx.fill();
  },
  pixel(ctx) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(8, 8, 48, 48);
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(8, 44, 48, 12);
    ctx.fillRect(44, 8, 12, 48);
  },
  smoke(ctx) {
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 9; i++) {
      const x = 18 + rand() * 28,
        y = 18 + rand() * 28,
        r = 10 + rand() * 12;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(255,255,255,0.45)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, SIZE, SIZE);
    }
  },
  shard(ctx) {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(32, 2);
    ctx.lineTo(46, 32);
    ctx.lineTo(32, 62);
    ctx.lineTo(18, 32);
    ctx.closePath();
    ctx.fill();
  },
  streak(ctx) {
    const g = ctx.createLinearGradient(0, 32, 64, 32);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.7, "rgba(255,255,255,0.9)");
    g.addColorStop(1, "rgba(255,255,255,1)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(32, 32, 31, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  },
};

const caches = new WeakMap<Scene, Map<FxTextureName, DynamicTexture>>();

/** Shared, lazily created sprite texture. Do not dispose: the scene owns it. */
export function fxTexture(scene: Scene, name: FxTextureName): DynamicTexture {
  let cache = caches.get(scene);
  if (!cache) {
    cache = new Map();
    caches.set(scene, cache);
  }
  let texture = cache.get(name);
  if (!texture) {
    texture = new DynamicTexture(
      `fx-${name}`,
      { width: SIZE, height: SIZE },
      scene,
      true,
    );
    const ctx = texture.getContext() as unknown as Ctx;
    ctx.clearRect(0, 0, SIZE, SIZE);
    painters[name](ctx);
    texture.hasAlpha = true;
    texture.update();
    cache.set(name, texture);
  }
  return texture;
}
