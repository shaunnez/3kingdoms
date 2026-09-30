/** Loopback-only production preview with actual compressed transfer measurements. */
import { createServer, request } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { gzipSync } from "node:zlib";
const root = resolve("dist/client"),
  cache = new Map();
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".webp": "image/webp",
  ".png": "image/png",
  ".json": "application/json",
};
createServer(async (req, res) => {
  if (req.url?.startsWith("/evidence/")) {
    const upstream = request(
      {
        hostname: "127.0.0.1",
        port: 2567,
        path: req.url,
        method: req.method,
        headers: req.headers,
      },
      (reply) => {
        res.writeHead(reply.statusCode ?? 502, reply.headers);
        reply.pipe(res);
      },
    );
    upstream.on("error", () => {
      res.writeHead(502);
      res.end("Evidence server unavailable");
    });
    req.pipe(upstream);
    return;
  }
  try {
    const pathname = decodeURIComponent(
      new URL(req.url ?? "/", "http://localhost").pathname,
    );
    const path = resolve(
      root,
      "." + (pathname === "/" ? "/index.html" : pathname),
    );
    if (!path.startsWith(root + sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    const info = await stat(path);
    if (!info.isFile()) throw new Error("Not a file");
    const compressed =
      /gzip/.test(req.headers["accept-encoding"] ?? "") &&
      [".html", ".css", ".js", ".glb", ".json"].includes(extname(path));
    const key = path + (compressed ? ".gzip" : "");
    let data = cache.get(key);
    if (!data) {
      const raw = await readFile(path);
      data = compressed ? gzipSync(raw, { level: 6 }) : raw;
      cache.set(key, data);
    }
    res.writeHead(200, {
      "Content-Type": mime[extname(path)] ?? "application/octet-stream",
      "Content-Length": data.length,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      Vary: "Accept-Encoding",
      ...(compressed ? { "Content-Encoding": "gzip" } : {}),
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}).listen(4181, "127.0.0.1", () =>
  console.log("THREEFOLD production preview http://127.0.0.1:4181/"),
);
