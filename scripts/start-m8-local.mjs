import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const sitePort = process.argv[2] ?? "3000";
const runnerPort = process.env.M8_RUNNER_PORT ?? "4318";
const python = process.platform === "win32"
  ? resolve(".venv-m8", "Scripts", "python.exe")
  : resolve(".venv-m8", "bin", "python");
if (!existsSync(python)) {
  throw new Error("M8 project Python environment is missing. Create .venv-m8 and install runner/requirements-m8.txt.");
}

const runner = spawn(python, [resolve("scripts", "m8-figure-runner.py"), "--port", runnerPort], {
  cwd: process.cwd(), stdio: "inherit", windowsHide: true,
});
await waitForRunner(`http://127.0.0.1:${runnerPort}/health`, 15_000);

const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toLowerCase() !== "path"));
const pathEntries = Object.entries(process.env).filter(([key]) => key.toLowerCase() === "path").flatMap(([, value]) => value.split(";")).filter(Boolean);
env.Path = [...new Set(pathEntries)].join(";");
env.NEXT_PUBLIC_M3_PERSISTENCE_ENABLED = "true";
env.NEXT_PUBLIC_M4_PERSISTENCE_ENABLED = "true";
env.NEXT_PUBLIC_M4_DIAGNOSIS_PERSISTENCE_ENABLED = "true";
env.M5_LOCAL_OBJECT_STORAGE = "true";
env.M8_FIGURE_RUNNER_URL = `http://127.0.0.1:${runnerPort}`;
env.WRANGLER_WRITE_LOGS = "false";
env.WRANGLER_LOG_PATH = resolve(".wrangler", "logs");
env.XDG_CONFIG_HOME = resolve(".wrangler");

const web = spawn(process.execPath, [resolve("node_modules", "vinext", "dist", "cli.js"), "dev", "--port", sitePort, "--strictPort"], {
  cwd: process.cwd(), env, stdio: "inherit", windowsHide: true,
});

function stop() { if (!web.killed) web.kill(); if (!runner.killed) runner.kill(); }
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, stop);
runner.once("exit", (code) => { if (code && !web.killed) { web.kill(); process.exitCode = code; } });
web.once("exit", (code, signal) => { if (!runner.killed) runner.kill(); process.exitCode = code ?? (signal ? 1 : 0); });

async function waitForRunner(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (runner.exitCode !== null) throw new Error(`M8 figure runner exited with code ${runner.exitCode}.`);
    try { const response = await fetch(url); if (response.ok) return; } catch { /* bounded retry */ }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 150));
  }
  runner.kill();
  throw new Error(`M8 figure runner did not become healthy within ${timeoutMs}ms.`);
}
