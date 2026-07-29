import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { buildM8PythonFigureCode } from "../app/lib/m8-figure-code.ts";
import { M8_PUBLICATION_PRESETS } from "../app/lib/m8-figure-contracts.ts";
import { HttpM8FigureRunnerAdapter } from "../app/lib/m8-figure-runner.ts";

const port = 4319;
const endpoint = `http://127.0.0.1:${port}`;
const python = fileURLToPath(new URL("../.venv-m8/Scripts/python.exe", import.meta.url));
const script = fileURLToPath(new URL("../scripts/m8-figure-runner.py", import.meta.url));
let runner;

before(async () => {
  runner = spawn(python, [script, "--port", String(port)], { cwd: fileURLToPath(new URL("../", import.meta.url)), stdio: "ignore", windowsHide: true });
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try { const response = await fetch(`${endpoint}/health`); if (response.ok) return; } catch { /* retry until bounded deadline */ }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("M8 runner did not become healthy within 15 seconds.");
});

after(() => { runner?.kill(); });

const rows = [
  { condition: "A", score: 21, time: 1 }, { condition: "A", score: 25, time: 2 }, { condition: "A", score: 29, time: 3 },
  { condition: "B", score: 27, time: 1 }, { condition: "B", score: 31, time: 2 }, { condition: "B", score: 36, time: 3 },
];

for (const item of [
  { type: "scatter", mapping: { x: "time", y: "score" }, required: ["time", "score"] },
  { type: "line", mapping: { x: "time", y: "score", group: "condition" }, required: ["time", "score", "condition"] },
  { type: "bar", mapping: { category: "condition", value: "score" }, required: ["condition", "score"] },
  { type: "boxplot", mapping: { category: "condition", value: "score" }, required: ["condition", "score"] },
  { type: "violin", mapping: { category: "condition", value: "score" }, required: ["condition", "score"] },
]) {
  test(`real local runner generates ${item.type} PNG from managed code`, async () => {
    const spec = { kind: "statistical", chartType: item.type, title: item.type, xLabel: "X", yLabel: "Y", caption: "", mapping: item.mapping, publication: M8_PUBLICATION_PRESETS.screen_preview };
    const adapter = new HttpM8FigureRunnerAdapter(endpoint);
    const result = await adapter.execute({ runId: crypto.randomUUID(), code: buildM8PythonFigureCode(spec), data: rows, requiredColumns: item.required, timeoutSeconds: 30, formats: ["png"] });
    assert.equal(result.status, "succeeded", JSON.stringify({ errorType: result.errorType, errorMessage: result.errorMessage, stderr: result.stderr }));
    assert.equal(result.outputs.length, 1); assert.ok(result.outputs[0].width > 100); assert.ok(result.outputs[0].height > 100);
  });
}
