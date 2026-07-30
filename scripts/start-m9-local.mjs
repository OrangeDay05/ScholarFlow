import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const sitePort = process.argv[2] ?? "3000";
const figurePort = process.env.M8_RUNNER_PORT ?? "4318";
const pptxPort = process.env.M9_RUNNER_PORT ?? "4320";
const python = process.platform === "win32" ? resolve(".venv-m8", "Scripts", "python.exe") : resolve(".venv-m8", "bin", "python");
const defaultArtifactEntry = join(homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "node_modules", "@oai", "artifact-tool", "dist", "artifact_tool.mjs");
const artifactEntry = process.env.ARTIFACT_TOOL_ENTRY ?? defaultArtifactEntry;
if (!existsSync(python)) throw new Error("M8 Python 环境不存在，请先创建 .venv-m8。");
if (!existsSync(artifactEntry)) throw new Error("Artifact Tool 不存在，请通过 ARTIFACT_TOOL_ENTRY 指定其入口。");

const figures = spawn(python, [resolve("scripts", "m8-figure-runner.py"), "--port", figurePort], { cwd: process.cwd(), stdio: "inherit", windowsHide: true });
const pptx = spawn(process.execPath, [resolve("scripts", "m9-pptx-runner.mjs"), pptxPort], { cwd: process.cwd(), env: { ...process.env, ARTIFACT_TOOL_ENTRY: artifactEntry }, stdio: "inherit", windowsHide: true });
await Promise.all([waitFor(figures, `http://127.0.0.1:${figurePort}/health`, 20_000, "M8"), waitFor(pptx, `http://127.0.0.1:${pptxPort}/health`, 60_000, "M9")]);

const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toLowerCase() !== "path"));
const pathEntries = Object.entries(process.env).filter(([key]) => key.toLowerCase() === "path").flatMap(([, value]) => value.split(";")).filter(Boolean);
env.Path = [...new Set(pathEntries)].join(";"); env.NEXT_PUBLIC_M3_PERSISTENCE_ENABLED = "true"; env.NEXT_PUBLIC_M4_PERSISTENCE_ENABLED = "true"; env.NEXT_PUBLIC_M4_DIAGNOSIS_PERSISTENCE_ENABLED = "true"; env.M5_LOCAL_OBJECT_STORAGE = "true"; env.M8_FIGURE_RUNNER_URL = `http://127.0.0.1:${figurePort}`; env.M9_PPTX_RUNNER_URL = `http://127.0.0.1:${pptxPort}`; env.WRANGLER_WRITE_LOGS = "false"; env.WRANGLER_LOG_PATH = resolve(".wrangler", "logs"); env.XDG_CONFIG_HOME = resolve(".wrangler");
const web = spawn(process.execPath, [resolve("node_modules", "vinext", "dist", "cli.js"), "dev", "--port", sitePort, "--strictPort"], { cwd: process.cwd(), env, stdio: "inherit", windowsHide: true });
function stop() { for (const child of [web, figures, pptx]) if (!child.killed) child.kill(); }
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, stop);
for (const child of [figures, pptx]) child.once("exit", (code) => { if (code && !web.killed) { web.kill(); process.exitCode = code; } });
web.once("exit", (code, signal) => { if (!figures.killed) figures.kill(); if (!pptx.killed) pptx.kill(); process.exitCode = code ?? (signal ? 1 : 0); });

async function waitFor(child, url, timeoutMs, label) { const deadline = Date.now() + timeoutMs; while (Date.now() < deadline) { if (child.exitCode !== null) throw new Error(`${label} Runner 已退出，代码 ${child.exitCode}。`); try { if ((await fetch(url)).ok) return; } catch {} await new Promise((resolveWait) => setTimeout(resolveWait, 200)); } child.kill(); throw new Error(`${label} Runner 未在 ${timeoutMs}ms 内就绪。`); }
