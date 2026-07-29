import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { buildM8PythonFigureCode } from "../app/lib/m8-figure-code.ts";
import { inferM8Columns, M8_PUBLICATION_PRESETS, recommendM8FigureTypes, validateM8StatisticalSpec } from "../app/lib/m8-figure-contracts.ts";
import { InMemoryStorageAdapter } from "../app/lib/storage/storage-adapter.ts";
import { runM8Figure } from "../db/repositories/m8-figures.ts";
import { env as workerEnv } from "./cloudflare-workers-shim.mjs";

const actor = { userId: "user-a", displayName: "A", role: "user" };
const rows = [
  { condition: "A", score: 21, time: 1 }, { condition: "A", score: 25, time: 2 }, { condition: "A", score: 29, time: 3 },
  { condition: "B", score: 27, time: 1 }, { condition: "B", score: 31, time: 2 }, { condition: "B", score: 36, time: 3 },
];
const spec = { kind: "statistical", chartType: "violin", title: "分布比较", xLabel: "条件", yLabel: "得分", caption: "测试图", mapping: { category: "condition", value: "score" }, publication: M8_PUBLICATION_PRESETS.paper_double_column };

test("M8.1 contracts infer columns, recommend charts and reject missing mappings", () => {
  const columns = inferM8Columns(rows);
  assert.equal(columns.find((column) => column.name === "score")?.type, "number");
  assert.ok(recommendM8FigureTypes(columns).includes("scatter"));
  assert.deepEqual(validateM8StatisticalSpec(spec, columns), []);
  const invalid = { ...spec, mapping: { category: "condition", value: "missing" } };
  assert.match(validateM8StatisticalSpec(invalid, columns).join(" "), /不存在的数据列：missing/u);
});

test("M8.1 generator emits standalone reproducible violin Python", () => {
  const code = buildM8PythonFigureCode(spec);
  assert.match(code, /matplotlib\.use\('Agg'\)/u);
  assert.match(code, /violinplot/u);
  assert.match(code, /--data/u);
  assert.match(code, /--output-dir/u);
  assert.match(code, /RANDOM_SEED = 42/u);
  assert.match(code, /plt\.close\(fig\)/u);
});

test("M8.1 reuses equal snapshots and code but creates a RunRecord and asset per run", async () => {
  const database = await migratedDatabase(); workerEnv.DB = new D1DatabaseAdapter(database); seed(database);
  const storage = new InMemoryStorageAdapter(); const runner = successRunner();
  const first = await runM8Figure(actor, "project-a", { specification: spec, data: rows }, runner, storage);
  const second = await runM8Figure(actor, "project-a", { figureProjectId: first.figureProjectId, specification: spec, data: rows }, runner, storage);
  assert.equal(first.status, "succeeded"); assert.equal(second.status, "succeeded");
  assert.equal(second.dataSnapshotReused, true); assert.equal(second.codeVersionReused, true);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM figure_data_snapshots").get().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM figure_code_versions").get().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM figure_run_records").get().count, 2);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM figure_assets").get().count, 2);
  assert.notEqual(first.assets[0].id, second.assets[0].id);

  const customized = await runM8Figure(actor, "project-a", { figureProjectId: first.figureProjectId, specification: spec, data: rows, code: `${first.code}\n# user customization` }, runner, storage);
  assert.equal(customized.dataSnapshotReused, true); assert.equal(customized.codeVersionReused, false); assert.equal(customized.codeMode, "forked");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM figure_code_versions").get().count, 2);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM figure_run_records").get().count, 3);
});

test("M8.1 failed execution keeps RunRecord and creates no FigureAsset", async () => {
  const database = await migratedDatabase(); workerEnv.DB = new D1DatabaseAdapter(database); seed(database);
  const result = await runM8Figure(actor, "project-a", { specification: spec, data: rows }, failedRunner(), new InMemoryStorageAdapter());
  assert.equal(result.status, "failed"); assert.equal(result.assets.length, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM figure_run_records").get().count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM figure_assets").get().count, 0);
  assert.equal(database.prepare("SELECT error_type FROM figure_run_records").get().error_type, "PYTHON_EXECUTION_FAILED");
});

function successRunner() { return { mode: "local_trusted", runnerId: "test-runner", async execute() { return { status: "succeeded", runnerId: "test-runner", runnerVersion: "test", pythonVersion: "3.12", dependencies: { matplotlib: "3.11.1", pandas: "3.0.5", numpy: "2.5.1" }, stdout: "", stderr: "", errorType: null, errorMessage: null, exitCode: 0, outputs: [{ format: "png", base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XvFeAAAAAElFTkSuQmCC", width: 1, height: 1, dpi: 300 }] }; } }; }
function failedRunner() { return { mode: "local_trusted", runnerId: "test-runner", async execute() { return { status: "failed", runnerId: "test-runner", runnerVersion: "test", pythonVersion: "3.12", dependencies: {}, stdout: "", stderr: "trace", errorType: "PYTHON_EXECUTION_FAILED", errorMessage: "代码执行失败", exitCode: 1, outputs: [] }; } }; }
async function migratedDatabase() { const database = new DatabaseSync(":memory:"); database.exec("PRAGMA foreign_keys = ON"); const directory = new URL("../drizzle/", import.meta.url); const files = (await readdir(directory)).filter((name) => /^\d{4}_.+\.sql$/u.test(name)).sort(); for (const file of files) database.exec((await readFile(new URL(file, directory), "utf8")).replaceAll("--> statement-breakpoint", "")); return database; }
function seed(database) { database.prepare("INSERT INTO users (id,email,display_name) VALUES (?,?,?)").run("user-a", "a@example.test", "A"); database.prepare("INSERT INTO projects (id,owner_user_id,title,paper_type,language,primary_creation_method,status) VALUES (?,?,?,?,?,?,?)").run("project-a", "user-a", "Research", "course_paper", "zh-CN", "idea", "active"); }
class PreparedStatement { constructor(database, sql, values = []) { this.database = database; this.sql = sql; this.values = values; } bind(...values) { return new PreparedStatement(this.database, this.sql, values); } async first(column) { const row = this.database.prepare(this.sql).get(...this.values); return row ? (column ? row[column] ?? null : row) : null; } async all() { return { success: true, results: this.database.prepare(this.sql).all(...this.values), meta: { changes: 0 } }; } async run() { const result = this.database.prepare(this.sql).run(...this.values); return { success: true, meta: { changes: Number(result.changes) } }; } }
class D1DatabaseAdapter { constructor(database) { this.database = database; } prepare(sql) { return new PreparedStatement(this.database, sql); } async batch(statements) { for (const statement of statements) await statement.run(); return []; } }
