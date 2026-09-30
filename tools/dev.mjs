import { spawn } from "node:child_process";
const children = ["dev:server", "dev:client"].map((script) =>
  spawn("npm", ["run", script], { stdio: "inherit" }),
);
let closing = false;
const close = () => {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill("SIGTERM");
};
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, close);
for (const child of children)
  child.on("exit", (code) => {
    close();
    process.exitCode = code ?? 0;
  });
