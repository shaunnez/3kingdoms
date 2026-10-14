/**
 * Writes .br and .gz next to each compressible file of at least 1 KB, so the
 * game server can serve precompressed assets without spending CPU per request.
 *
 * Usage: node tools/precompress.mjs [dir=dist/hosted]
 */
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const dir = resolve(process.argv[2] ?? "dist/hosted");
const COMPRESSIBLE = /\.(js|mjs|css|html|json|svg|txt|map|wasm)$/;

async function files(root) {
  const out = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) out.push(...(await files(path)));
    else out.push(path);
  }
  return out;
}

let written = 0,
  raw = 0,
  br = 0;
for (const path of await files(dir)) {
  if (!COMPRESSIBLE.test(path)) continue;
  const data = await readFile(path);
  if (data.length < 1024) continue;
  const started = Date.now();
  let brotli = brotliCompressSync(data, {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
  });
  // Quality 11 is slow on the multi-megabyte game bundle; 9 is close enough.
  if (Date.now() - started > 30_000)
    brotli = brotliCompressSync(data, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 9 },
    });
  await writeFile(`${path}.br`, brotli);
  await writeFile(`${path}.gz`, gzipSync(data, { level: 9 }));
  written++;
  raw += data.length;
  br += brotli.length;
}
console.log(
  JSON.stringify({ dir, files: written, rawBytes: raw, brotliBytes: br }),
);
