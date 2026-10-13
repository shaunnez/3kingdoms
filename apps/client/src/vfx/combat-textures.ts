/**
 * Combat-only sprite textures painted in code. "Tint" textures are white
 * shapes that a material colours; "sticker" textures carry their own cartoon
 * colours and ink outline so they stay readable over bright grass. Owned by
 * CombatVfx and disposed with it (unlike the shared fxTexture cache).
 */
import { DynamicTexture, Texture, type Scene } from "@babylonjs/core";

export type CombatTextureName =
  | "rune"
  | "heal"
  | "kite"
  | "hex"
  | "bang"
  | "dizzy"
  | "claw"
  | "crack"
  | "ghost"
  | "lane"
  | "coin"
  | "vein"
  | "plusS"
  | "heartS"
  | "orb";

type Ctx = CanvasRenderingContext2D;
const INK = "#2b2140";

function kitePath(ctx: Ctx, cx: number, cy: number, w: number, h: number) {
  // Rounded-top kite shield, point at the bottom.
  ctx.beginPath();
  ctx.moveTo(cx - w / 2, cy - h * 0.38);
  ctx.quadraticCurveTo(cx - w / 2, cy - h / 2, cx - w * 0.3, cy - h / 2);
  ctx.lineTo(cx + w * 0.3, cy - h / 2);
  ctx.quadraticCurveTo(cx + w / 2, cy - h / 2, cx + w / 2, cy - h * 0.38);
  ctx.quadraticCurveTo(cx + w * 0.48, cy + h * 0.12, cx, cy + h / 2);
  ctx.quadraticCurveTo(cx - w * 0.48, cy + h * 0.12, cx - w / 2, cy - h * 0.38);
  ctx.closePath();
}

function starPath(
  ctx: Ctx,
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  points = 5,
) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = (i * Math.PI) / points - Math.PI / 2;
    const x = cx + Math.cos(a) * r,
      y = cy + Math.sin(a) * r;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

const painters: Record<
  CombatTextureName,
  { w: number; h: number; paint: (ctx: Ctx, w: number, h: number) => void }
> = {
  rune: {
    w: 256,
    h: 256,
    paint(ctx) {
      const c = 128;
      ctx.strokeStyle = "#fff";
      ctx.fillStyle = "#fff";
      ctx.lineCap = "round";
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(c, c, 118, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(c, c, 102, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(c, c, 62, 0, Math.PI * 2);
      ctx.stroke();
      // Runic glyphs between the outer rings.
      let seed = 11;
      const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        ctx.save();
        ctx.translate(c + Math.cos(a) * 110, c + Math.sin(a) * 110);
        ctx.rotate(a + Math.PI / 2);
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        const strokes = 2 + Math.floor(rand() * 2);
        for (let s = 0; s < strokes; s++) {
          const x0 = (rand() - 0.5) * 9,
            y0 = (rand() - 0.5) * 7,
            x1 = (rand() - 0.5) * 9,
            y1 = (rand() - 0.5) * 7;
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
        }
        ctx.stroke();
        ctx.restore();
      }
      // Inner eight-point star and a soft core.
      ctx.lineWidth = 3.5;
      for (const off of [0, Math.PI / 4]) {
        ctx.beginPath();
        for (let i = 0; i <= 4; i++) {
          const a = off + (i / 4) * Math.PI * 2;
          const x = c + Math.cos(a) * 92,
            y = c + Math.sin(a) * 92;
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        ctx.beginPath();
        ctx.arc(c + Math.cos(a) * 62, c + Math.sin(a) * 62, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      const g = ctx.createRadialGradient(c, c, 0, c, c, 60);
      g.addColorStop(0, "rgba(255,255,255,0.45)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 256);
    },
  },
  heal: {
    w: 256,
    h: 256,
    paint(ctx) {
      const c = 128;
      const g = ctx.createRadialGradient(c, c, 40, c, c, 124);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.75, "rgba(255,255,255,0.22)");
      g.addColorStop(0.93, "rgba(255,255,255,0.65)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 256);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(c, c, 114, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([10, 12]);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(c, c, 92, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#fff";
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const x = c + Math.cos(a) * 103,
          y = c + Math.sin(a) * 103;
        ctx.beginPath();
        ctx.roundRect(x - 3.5, y - 10, 7, 20, 3);
        ctx.roundRect(x - 10, y - 3.5, 20, 7, 3);
        ctx.fill();
      }
    },
  },
  kite: {
    w: 128,
    h: 128,
    paint(ctx) {
      const g = ctx.createLinearGradient(0, 8, 0, 120);
      g.addColorStop(0, "rgba(255,255,255,0.32)");
      g.addColorStop(1, "rgba(255,255,255,0.08)");
      kitePath(ctx, 64, 64, 92, 112);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineJoin = "round";
      ctx.lineWidth = 7;
      ctx.strokeStyle = "#fff";
      ctx.stroke();
      kitePath(ctx, 64, 62, 66, 86);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.roundRect(58, 26, 12, 62, 4);
      ctx.roundRect(40, 42, 48, 11, 4);
      ctx.fill();
    },
  },
  hex: {
    w: 128,
    h: 128,
    paint(ctx) {
      // Tileable pointy hex grid: 2 columns x 2 rows of cells.
      const r = 18.5,
        w = Math.sqrt(3) * r;
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(0, 0, 128, 128);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 3;
      const sx = 128 / (2 * w),
        sy = 128 / (3 * r);
      ctx.save();
      ctx.scale(sx, sy);
      for (let row = -1; row < 4; row++)
        for (let col = -1; col < 4; col++) {
          const cx = col * w + (row % 2 ? w / 2 : 0),
            cy = row * 1.5 * r;
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
            const x = cx + Math.cos(a) * r * 0.9,
              y = cy + Math.sin(a) * r * 0.9;
            if (i) ctx.lineTo(x, y);
            else ctx.moveTo(x, y);
          }
          ctx.closePath();
          ctx.stroke();
        }
      ctx.restore();
    },
  },
  bang: {
    w: 128,
    h: 128,
    paint(ctx) {
      ctx.lineJoin = "round";
      // Tapered bar and dot, ink outline, gold fill, white shine.
      const bar = () => {
        ctx.beginPath();
        ctx.moveTo(46, 12);
        ctx.lineTo(82, 12);
        ctx.lineTo(72, 80);
        ctx.lineTo(56, 80);
        ctx.closePath();
      };
      const dot = () => {
        ctx.beginPath();
        ctx.arc(64, 103, 13, 0, Math.PI * 2);
      };
      ctx.strokeStyle = INK;
      ctx.lineWidth = 14;
      bar();
      ctx.stroke();
      dot();
      ctx.stroke();
      ctx.fillStyle = "#ffd45e";
      bar();
      ctx.fill();
      dot();
      ctx.fill();
      ctx.fillStyle = "#ff9f43";
      ctx.beginPath();
      ctx.moveTo(70, 18);
      ctx.lineTo(80, 18);
      ctx.lineTo(71, 76);
      ctx.lineTo(66, 76);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#fff7e8";
      ctx.beginPath();
      ctx.roundRect(53, 19, 8, 26, 4);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(59, 98, 4, 0, Math.PI * 2);
      ctx.fill();
    },
  },
  dizzy: {
    w: 64,
    h: 64,
    paint(ctx) {
      ctx.lineJoin = "round";
      starPath(ctx, 32, 34, 27, 12.5);
      ctx.lineWidth = 6;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.fillStyle = "#ffe066";
      ctx.fill();
      starPath(ctx, 30, 31, 12, 6);
      ctx.fillStyle = "#fff7c2";
      ctx.fill();
    },
  },
  claw: {
    w: 128,
    h: 128,
    paint(ctx) {
      ctx.lineCap = "round";
      for (let i = 0; i < 3; i++) {
        const o = (i - 1) * 26;
        const path = () => {
          ctx.beginPath();
          ctx.moveTo(30 + o, 14);
          ctx.quadraticCurveTo(72 + o, 52, 88 + o * 0.7, 116);
        };
        ctx.strokeStyle = "rgba(255,64,96,0.85)";
        ctx.lineWidth = 15;
        path();
        ctx.stroke();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 7;
        path();
        ctx.stroke();
      }
    },
  },
  crack: {
    w: 256,
    h: 256,
    paint(ctx) {
      let seed = 5;
      const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const c = 128;
      const branches: [number, number, number, number, number][] = [];
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + rand() * 0.4;
        branches.push([c, c, a, 40 + rand() * 70, 9]);
      }
      const segs: [number, number, number, number, number][] = [];
      while (branches.length) {
        const [x, y, a, len, w] = branches.pop()!;
        let px = x,
          py = y,
          ang = a;
        const steps = 4;
        for (let s = 0; s < steps; s++) {
          ang += (rand() - 0.5) * 0.9;
          const nx = px + Math.cos(ang) * (len / steps),
            ny = py + Math.sin(ang) * (len / steps);
          segs.push([px, py, nx, ny, w * (1 - s / (steps + 1))]);
          if (w > 4 && rand() < 0.35)
            branches.push([
              nx,
              ny,
              ang + (rand() - 0.5) * 1.6,
              len * 0.45,
              w * 0.55,
            ]);
          px = nx;
          py = ny;
        }
      }
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const g = ctx.createRadialGradient(c, c, 0, c, c, 70);
      g.addColorStop(0, "rgba(90,60,40,0.55)");
      g.addColorStop(1, "rgba(90,60,40,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 256);
      for (const [pass, color, scale] of [
        [0, "rgba(255,212,94,0.55)", 2.4],
        [1, "#3a2a24", 1],
        [2, "rgba(255,240,170,0.9)", 0.32],
      ] as const) {
        ctx.strokeStyle = color;
        for (const [x0, y0, x1, y1, w] of segs) {
          ctx.lineWidth = Math.max(pass === 2 ? 0.8 : 1.5, w * scale);
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
        }
      }
    },
  },
  ghost: {
    w: 128,
    h: 128,
    paint(ctx) {
      // Chibi silhouette: big head, short body, soft edge.
      ctx.filter = "blur(3px)";
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath();
      ctx.arc(64, 42, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(40, 62, 48, 44, 16);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(44, 98, 15, 24, 6);
      ctx.roundRect(69, 98, 15, 24, 6);
      ctx.fill();
      ctx.filter = "none";
    },
  },
  lane: {
    w: 64,
    h: 128,
    paint(ctx) {
      // u runs across the lane, v along it. Bright edges, chevrons, soft fill.
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      ctx.fillRect(0, 0, 64, 128);
      ctx.fillStyle = "#fff";
      ctx.fillRect(1, 0, 5, 128);
      ctx.fillRect(58, 0, 5, 128);
      ctx.strokeStyle = "rgba(255,255,255,0.75)";
      ctx.lineWidth = 7;
      ctx.lineJoin = "round";
      for (const y of [30, 94]) {
        ctx.beginPath();
        ctx.moveTo(16, y + 14);
        ctx.lineTo(32, y - 6);
        ctx.lineTo(48, y + 14);
        ctx.stroke();
      }
    },
  },
  coin: {
    w: 64,
    h: 64,
    paint(ctx) {
      ctx.beginPath();
      ctx.arc(32, 32, 25, 0, Math.PI * 2);
      ctx.fillStyle = INK;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(32, 32, 21, 0, Math.PI * 2);
      ctx.fillStyle = "#ffb43a";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(30, 30, 17, 0, Math.PI * 2);
      ctx.fillStyle = "#ffd45e";
      ctx.fill();
      ctx.strokeStyle = "#ffb43a";
      ctx.lineWidth = 3;
      starPath(ctx, 30, 31, 9, 4);
      ctx.stroke();
      ctx.fillStyle = "#fff7e8";
      ctx.beginPath();
      ctx.ellipse(23, 22, 4, 6, -0.6, 0, Math.PI * 2);
      ctx.fill();
    },
  },
  vein: {
    w: 64,
    h: 64,
    paint(ctx) {
      // Cartoon anger mark: four curved ticks around a centre.
      ctx.lineCap = "round";
      for (const [color, width] of [
        [INK, 13],
        ["#ff4060", 7],
      ] as const) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        for (let i = 0; i < 4; i++) {
          ctx.save();
          ctx.translate(32, 32);
          ctx.rotate((i * Math.PI) / 2 + Math.PI / 4);
          ctx.beginPath();
          ctx.moveTo(-9, -20);
          ctx.quadraticCurveTo(-4, -8, -18, -6);
          ctx.stroke();
          ctx.restore();
        }
      }
    },
  },
  plusS: {
    w: 64,
    h: 64,
    paint(ctx) {
      const plus = (inset: number) => {
        ctx.beginPath();
        ctx.roundRect(22 + inset, 6 + inset, 20 - inset * 2, 52 - inset * 2, 7);
        ctx.roundRect(6 + inset, 22 + inset, 52 - inset * 2, 20 - inset * 2, 7);
      };
      ctx.fillStyle = INK;
      plus(0);
      ctx.fill();
      ctx.fillStyle = "#58d86a";
      plus(4);
      ctx.fill();
      ctx.fillStyle = "#c8ffd0";
      ctx.beginPath();
      ctx.roundRect(27, 11, 6, 14, 3);
      ctx.fill();
    },
  },
  heartS: {
    w: 64,
    h: 64,
    paint(ctx) {
      const heart = (s: number) => {
        ctx.save();
        ctx.translate(32, 34);
        ctx.scale(s, s);
        ctx.beginPath();
        ctx.moveTo(0, 22);
        ctx.bezierCurveTo(-28, 2, -26, -24, -8, -24);
        ctx.bezierCurveTo(-2, -24, 0, -18, 0, -16);
        ctx.bezierCurveTo(0, -18, 2, -24, 8, -24);
        ctx.bezierCurveTo(26, -24, 28, 2, 0, 22);
        ctx.restore();
      };
      ctx.fillStyle = INK;
      heart(1.08);
      ctx.fill();
      ctx.fillStyle = "#ff7eb6";
      heart(0.88);
      ctx.fill();
      ctx.fillStyle = "#ffd6e8";
      ctx.beginPath();
      ctx.ellipse(21, 21, 4, 6, -0.6, 0, Math.PI * 2);
      ctx.fill();
    },
  },
  orb: {
    w: 64,
    h: 64,
    paint(ctx) {
      // Sparkly gold mark: ink rim, warm gradient, a star and a shine.
      ctx.beginPath();
      ctx.arc(32, 32, 27, 0, Math.PI * 2);
      ctx.fillStyle = INK;
      ctx.fill();
      const g = ctx.createRadialGradient(26, 24, 2, 32, 32, 23);
      g.addColorStop(0, "#fff7c2");
      g.addColorStop(0.45, "#ffd45e");
      g.addColorStop(1, "#ff9f43");
      ctx.beginPath();
      ctx.arc(32, 32, 23, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      starPath(ctx, 32, 34, 11, 5);
      ctx.fillStyle = "#fff7e8";
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(22, 19, 4, 6, -0.7, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    },
  },
};

export class CombatTextures {
  private textures = new Map<CombatTextureName, DynamicTexture>();
  constructor(private scene: Scene) {}
  get(name: CombatTextureName): DynamicTexture {
    let t = this.textures.get(name);
    if (!t) {
      const p = painters[name];
      t = new DynamicTexture(
        `combat-${name}`,
        { width: p.w, height: p.h },
        this.scene,
        true,
      );
      const ctx = t.getContext() as unknown as Ctx;
      ctx.clearRect(0, 0, p.w, p.h);
      p.paint(ctx, p.w, p.h);
      t.hasAlpha = true;
      if (name === "hex" || name === "lane") {
        t.wrapU = Texture.WRAP_ADDRESSMODE;
        t.wrapV = Texture.WRAP_ADDRESSMODE;
      } else {
        t.wrapU = Texture.CLAMP_ADDRESSMODE;
        t.wrapV = Texture.CLAMP_ADDRESSMODE;
      }
      t.update();
      this.textures.set(name, t);
    }
    return t;
  }
  get count(): number {
    return this.textures.size;
  }
  dispose(): void {
    for (const t of this.textures.values()) t.dispose();
    this.textures.clear();
  }
}
