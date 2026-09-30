import { readFile, writeFile, mkdir } from "node:fs/promises";
import { validateBytes } from "gltf-validator";
const reports = [];
for (const name of ["briar-gate", "knight", "cyborg", "wolf", "mara", "nemi"]) {
  const path = `assets/runtime/models/${name}.glb`;
  const r = await validateBytes(new Uint8Array(await readFile(path)), {
    uri: path,
    maxIssues: 100,
  });
  reports.push({
    name,
    errors: r.issues.numErrors,
    warnings: r.issues.numWarnings,
    issues: r.issues.messages,
  });
}
await mkdir("artifacts/checkpoint", { recursive: true });
await writeFile(
  "artifacts/checkpoint/gltf-validation.json",
  JSON.stringify(reports, null, 2) + "\n",
);
console.log(
  reports.map((r) => ({
    name: r.name,
    errors: r.errors,
    warnings: r.warnings,
  })),
);
if (reports.some((r) => r.errors)) process.exitCode = 1;
