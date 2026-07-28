import { spawn } from "node:child_process";
import { resolve } from "node:path";

const port = process.argv[2] ?? "3000";
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => key.toLowerCase() !== "path"),
);
const pathEntries = Object.entries(process.env)
  .filter(([key]) => key.toLowerCase() === "path")
  .flatMap(([, value]) => value.split(";"))
  .filter(Boolean);

env.Path = [...new Set(pathEntries)].join(";");
env.NEXT_PUBLIC_M3_PERSISTENCE_ENABLED = "true";
env.NEXT_PUBLIC_M4_PERSISTENCE_ENABLED = "true";
env.NEXT_PUBLIC_M4_DIAGNOSIS_PERSISTENCE_ENABLED = "true";
env.WRANGLER_WRITE_LOGS = "false";
env.WRANGLER_LOG_PATH = resolve(".wrangler", "logs");
env.XDG_CONFIG_HOME = resolve(".wrangler");

const child = spawn(
  process.execPath,
  [
    resolve("node_modules", "vinext", "dist", "cli.js"),
    "dev",
    "--port",
    port,
    "--strictPort",
  ],
  {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
    windowsHide: true,
  },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.once("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
