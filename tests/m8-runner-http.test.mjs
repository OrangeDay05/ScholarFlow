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
  { condition: "A", cohort: "一", score: 21, time: 1, size: 8, error: 2, lower: 19, upper: 23 }, { condition: "A", cohort: "二", score: 25, time: 2, size: 12, error: 2, lower: 23, upper: 27 }, { condition: "A", cohort: "一", score: 29, time: 3, size: 16, error: 3, lower: 26, upper: 32 },
  { condition: "B", cohort: "一", score: 27, time: 1, size: 10, error: 2, lower: 25, upper: 29 }, { condition: "B", cohort: "二", score: 31, time: 2, size: 14, error: 3, lower: 28, upper: 34 }, { condition: "B", cohort: "二", score: 36, time: 3, size: 20, error: 3, lower: 33, upper: 39 },
];

for (const item of [
  { type: "scatter", mapping: { x: "time", y: "score" }, required: ["time", "score"] },
  { type: "line", mapping: { x: "time", y: "score", group: "condition" }, required: ["time", "score", "condition"] },
  { type: "bar", mapping: { category: "condition", value: "score" }, required: ["condition", "score"] },
  { type: "boxplot", mapping: { category: "condition", value: "score" }, required: ["condition", "score"] },
  { type: "violin", mapping: { category: "condition", value: "score" }, required: ["condition", "score"] },
  { type: "histogram", mapping: { value: "score" }, required: ["score"] },
  { type: "density", mapping: { value: "score" }, required: ["score"] },
  { type: "point", mapping: { category: "condition", value: "score" }, required: ["condition", "score"] },
  { type: "errorbar", mapping: { category: "condition", estimate: "score", error: "error" }, required: ["condition", "score"] },
  { type: "forest", mapping: { label: "condition", estimate: "score", lowerCI: "lower", upperCI: "upper" }, required: ["condition", "score", "lower", "upper"] },
  { type: "bubble", mapping: { x: "time", y: "score", size: "size" }, required: ["time", "score", "size"] },
  { type: "regression", mapping: { x: "time", y: "score", model: "linear", showConfidenceInterval: true }, required: ["time", "score"] },
  { type: "area", mapping: { x: "time", y: "score" }, required: ["time", "score"] },
  { type: "heatmap", mapping: { x: "condition", y: "cohort", value: "score" }, required: ["condition", "cohort", "score"] },
  { type: "correlation_heatmap", mapping: { variables: ["time", "score", "size"] }, required: ["time", "score", "size"] },
  { type: "facet", mapping: { x: "time", y: "score", facetColumn: "condition", geometry: "point" }, required: ["time", "score", "condition"] },
  { type: "multi_panel", mapping: { panelSpecs: [{ figureType: "bar", mapping: { category: "condition", value: "score" } }, { figureType: "scatter", mapping: { x: "time", y: "score" } }] }, required: ["condition", "score", "time"] },
]) {
  test(`real local runner generates ${item.type} PNG from managed code`, async () => {
    const spec = { kind: "statistical", chartType: item.type, title: item.type, xLabel: "X", yLabel: "Y", caption: "", mapping: item.mapping, publication: M8_PUBLICATION_PRESETS.screen_preview };
    const adapter = new HttpM8FigureRunnerAdapter(endpoint);
    const result = await adapter.execute({ runId: crypto.randomUUID(), code: buildM8PythonFigureCode(spec), data: rows, requiredColumns: item.required, timeoutSeconds: 30, formats: ["png"] });
    assert.equal(result.status, "succeeded", JSON.stringify({ errorType: result.errorType, errorMessage: result.errorMessage, stderr: result.stderr }));
    assert.equal(result.outputs.length, 1); assert.ok(result.outputs[0].width > 100); assert.ok(result.outputs[0].height > 100);
  });
}

test("M8.3 runner creates validated PNG, SVG, PDF and TIFF assets", async () => {
  const publication = { ...M8_PUBLICATION_PRESETS.paper_single_column, outputFormats: ["png", "svg", "pdf", "tiff"] };
  const multiFormatSpec = { kind: "statistical", chartType: "bar", title: "multi-format", xLabel: "X", yLabel: "Y", caption: "", mapping: { category: "condition", value: "score" }, publication };
  const adapter = new HttpM8FigureRunnerAdapter(endpoint);
  const result = await adapter.execute({ runId: crypto.randomUUID(), code: buildM8PythonFigureCode(multiFormatSpec), data: rows, requiredColumns: ["condition", "score"], timeoutSeconds: 30, formats: publication.outputFormats });
  assert.equal(result.status, "succeeded", JSON.stringify({ errorType: result.errorType, errorMessage: result.errorMessage, stderr: result.stderr }));
  assert.deepEqual(result.outputs.map((output) => output.format).sort(), ["pdf", "png", "svg", "tiff"]);
});
