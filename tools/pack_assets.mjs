import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const names = process.argv.slice(2);
if (!names.length) throw new Error("Pass the model names to optimize.");
for (const name of names) {
  if (
    !["briar-gate", "knight", "cyborg", "wolf", "mara", "nemi"].includes(name)
  )
    throw new Error("Unknown pilot model");
  const source = `assets/source/private/runtime-unoptimized/${name}.glb`,
    output = `assets/runtime/models/${name}.glb`;
  const document = await io.read(source);
  let repairedTangents = 0;
  for (const mesh of document.getRoot().listMeshes())
    for (const primitive of mesh.listPrimitives()) {
      const tangent = primitive.getAttribute("TANGENT"),
        normal = primitive.getAttribute("NORMAL");
      if (!tangent || !normal) continue;
      for (let i = 0; i < tangent.getCount(); i++) {
        const t = tangent.getElement(i, []),
          length = Math.hypot(t[0], t[1], t[2]);
        if (length > 0.00001) continue;
        const n = normal.getElement(i, []),
          axis = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
        const v = [
            n[1] * axis[2] - n[2] * axis[1],
            n[2] * axis[0] - n[0] * axis[2],
            n[0] * axis[1] - n[1] * axis[0],
          ],
          len = Math.hypot(...v);
        if (len < 0.00001) throw new Error(`Invalid normal in ${name}`);
        tangent.setElement(i, [
          v[0] / len,
          v[1] / len,
          v[2] / len,
          t[3] === -1 ? -1 : 1,
        ]);
        repairedTangents++;
      }
    }
  const validatedSource = source.replace(".glb", "-validated.glb");
  await io.write(validatedSource, document);
  const result = spawnSync(
    "node_modules/.bin/gltf-transform",
    [
      "optimize",
      validatedSource,
      output,
      "--compress",
      "quantize",
      "--texture-compress",
      "webp",
      "--texture-size",
      name === "briar-gate" ? "512" : "1024",
      "--simplify",
      "false",
      "--palette",
      "false",
      "--flatten",
      "false",
      "--join",
      "false",
      "--instance",
      "false",
    ],
    { encoding: "utf8" },
  );
  writeFileSync(
    `artifacts/checkpoint/${name}-optimization.log`,
    result.stdout + result.stderr,
  );
  if (result.status !== 0) throw new Error(`Optimization failed for ${name}`);
  const bytes = readFileSync(output);
  const summary = {
    name,
    sourceBytes: statSync(source).size,
    repairedTangents,
    runtimeBytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    compression: "KHR_mesh_quantization and WebP; no remote decoder",
  };
  writeFileSync(
    `artifacts/checkpoint/${name}-runtime.json`,
    JSON.stringify(summary, null, 2) + "\n",
  );
  console.log(summary);
}
