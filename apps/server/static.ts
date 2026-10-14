import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import { gzipSync } from "node:zlib";
import type { Application, Request, Response } from "express";

/** Sent on every Express response. */
export const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
};

/**
 * The page's policy. Scripts load only from this origin, with no inline code
 * and no eval. Styles allow inline because the page's first-paint style and
 * Babylon's injected style elements need it. Never add 'unsafe-eval' or a
 * remote script host here.
 */
export function contentSecurityPolicy(origins: Iterable<string>): string {
  const connect = ["'self'"];
  for (const origin of origins)
    connect.push(origin, origin.replace(/^http/, "ws"));
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connect.join(" ")}`,
    "media-src 'self' data: blob:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join("; ");
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".glb": "model/gltf-binary",
  ".ktx2": "image/ktx2",
  ".webm": "video/webm",
  ".ogg": "audio/ogg",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};
const COMPRESSIBLE = new Set([".js", ".mjs", ".css", ".html", ".json", ".svg"]);
// Vite names hashed output `name-<hash>.ext`; those never change.
const IMMUTABLE = /^\/assets\/.+-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/;

type Entry = {
  file: string;
  type: string;
  etag: string;
  immutable: boolean;
  br: boolean;
  gz: boolean;
  compressible: boolean;
  raw?: Buffer;
  brotli?: Buffer;
  gzip?: Buffer;
};

function walk(dir: string, files: string[] = []): string[] {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) walk(path, files);
    else if (item.isFile()) files.push(path);
  }
  return files;
}

/** Whether the client accepts a content coding (`q=0` refuses it). */
export function accepts(header: string | undefined, coding: string): boolean {
  for (const part of (header ?? "").split(",")) {
    const [name, ...params] = part.trim().toLowerCase().split(";");
    if (name !== coding) continue;
    const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
    return !q || Number(q.slice(2)) > 0;
  }
  return false;
}

/**
 * Serves the hosted client from memory: precompressed `.br`/`.gz` siblings
 * when present, otherwise gzip made once on demand. Hashed assets are cached
 * for a year; the page and everything else revalidate by ETag.
 */
export function serveClient(
  app: Application,
  options: { dir: string; csp: string },
) {
  const routes = new Map<string, Entry>();
  for (const file of walk(options.dir)) {
    if (file.endsWith(".br") || file.endsWith(".gz")) continue;
    const url = "/" + relative(options.dir, file).split(sep).join("/");
    const extension = extname(file).toLowerCase();
    routes.set(url, {
      file,
      type: TYPES[extension] ?? "application/octet-stream",
      etag: "",
      immutable: IMMUTABLE.test(url),
      br: existsSync(`${file}.br`),
      gz: existsSync(`${file}.gz`),
      compressible: COMPRESSIBLE.has(extension),
    });
  }
  const load = (entry: Entry) => {
    if (!entry.raw) {
      entry.raw = readFileSync(entry.file);
      entry.etag = createHash("sha256")
        .update(entry.raw)
        .digest("base64url")
        .slice(0, 22);
    }
    return entry.raw;
  };
  app.use((req: Request, res: Response, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    const entry = routes.get(req.path === "/" ? "/index.html" : req.path);
    if (!entry) return next();
    let body = load(entry),
      encoding = "",
      suffix = "";
    const accepted = req.headers["accept-encoding"];
    if (entry.br && accepts(accepted, "br")) {
      body = entry.brotli ??= readFileSync(`${entry.file}.br`);
      encoding = suffix = "br";
    } else if (accepts(accepted, "gzip") && (entry.gz || entry.compressible)) {
      body = entry.gzip ??= entry.gz
        ? readFileSync(`${entry.file}.gz`)
        : gzipSync(body, { level: 9 });
      encoding = suffix = "gzip";
    }
    const etag = `"${entry.etag}${suffix && `-${suffix}`}"`;
    res.setHeader("Content-Type", entry.type);
    res.setHeader("Vary", "Origin, Accept-Encoding");
    res.setHeader("ETag", etag);
    res.setHeader(
      "Cache-Control",
      entry.immutable ? "public, max-age=31536000, immutable" : "no-cache",
    );
    if (encoding) res.setHeader("Content-Encoding", encoding);
    if (entry.type.startsWith("text/html"))
      res.setHeader("Content-Security-Policy", options.csp);
    if (!entry.immutable && req.headers["if-none-match"] === etag) {
      res.status(304).end();
      return;
    }
    res.setHeader("Content-Length", body.length);
    if (req.method === "HEAD") res.end();
    else res.end(body);
  });
}
