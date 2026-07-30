import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { buildM8DiagramMermaid, renderM8DiagramSvg, validateM8DiagramSpec } from "../app/lib/m8-diagram-renderer.ts";
import { M8_PUBLICATION_PRESETS } from "../app/lib/m8-figure-contracts.ts";
import { InMemoryStorageAdapter } from "../app/lib/storage/storage-adapter.ts";
import { runM8Diagram } from "../db/repositories/m8-diagrams.ts";
import { getM8FigureAsset } from "../db/repositories/m8-figures.ts";
import { env as workerEnv } from "./cloudflare-workers-shim.mjs";

const actor = { userId: "user-a", displayName: "A", role: "user" };
const spec = { kind: "diagram", diagramType: "theoretical_framework", title: "理论与证据", caption: "受控概念图", nodes: [{ id: "question", label: "研究问题 <边界>" }, { id: "evidence", label: "证据" }, { id: "claim", label: "结论" }], edges: [{ source: "question", target: "evidence", label: "指导" }, { source: "evidence", target: "claim", label: "支持" }], renderer: "controlled_svg", publication: M8_PUBLICATION_PRESETS.paper_double_column };

test("M8.4 controlled renderer escapes labels and emits viewable SVG plus inspectable code", () => {
  assert.deepEqual(validateM8DiagramSpec(spec), []);
  const svg = new TextDecoder().decode(renderM8DiagramSvg(spec));
  assert.match(svg, /<svg/u); assert.match(svg, /研究问题 &lt;边界&gt;/u); assert.doesNotMatch(svg, /<script|href=["']https?:\/\//u);
  const code = buildM8DiagramMermaid(spec); assert.match(code, /flowchart LR/u); assert.match(code, /question -->\|指导\| evidence/u);
});

test("M8.4 creates immutable diagram version, run, SVG asset and owner-scoped download", async () => {
  const database = await migratedDatabase(); workerEnv.DB = new D1DatabaseAdapter(database); seed(database);
  const storage = new InMemoryStorageAdapter();
  const first = await runM8Diagram(actor, "project-a", { specification: spec }, storage);
  const second = await runM8Diagram(actor, "project-a", { figureProjectId: first.figureProjectId, specification: { ...spec, title: "理论与证据 V2" } }, storage);
  assert.equal(first.figureVersionNumber, 1); assert.equal(second.figureVersionNumber, 2);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM figure_versions WHERE spec_kind = 'diagram'").get().count, 2);
  assert.equal(database.prepare("SELECT language FROM figure_code_versions LIMIT 1").get().language, "mermaid");
  assert.equal(database.prepare("SELECT execution_mode FROM figure_run_records LIMIT 1").get().execution_mode, "disabled");
  const asset = await getM8FigureAsset(actor, "project-a", first.asset.id, storage);
  assert.equal(asset.contentType, "image/svg+xml"); assert.match(new TextDecoder().decode(asset.body), /<svg/u);
  await assert.rejects(() => getM8FigureAsset({ userId: "user-b", displayName: "B", role: "user" }, "project-b", first.asset.id, storage), /不存在/u);
});

async function migratedDatabase() { const database = new DatabaseSync(":memory:"); database.exec("PRAGMA foreign_keys = ON"); const directory = new URL("../drizzle/", import.meta.url); const files = (await readdir(directory)).filter((name) => /^\d{4}_.+\.sql$/u.test(name)).sort(); for (const file of files) database.exec((await readFile(new URL(file, directory), "utf8")).replaceAll("--> statement-breakpoint", "")); return database; }
function seed(database) { database.prepare("INSERT INTO users (id,email,display_name) VALUES (?,?,?)").run("user-a", "a@example.test", "A"); database.prepare("INSERT INTO users (id,email,display_name) VALUES (?,?,?)").run("user-b", "b@example.test", "B"); database.prepare("INSERT INTO projects (id,owner_user_id,title,paper_type,language,primary_creation_method,status) VALUES (?,?,?,?,?,?,?)").run("project-a", "user-a", "Research", "course_paper", "zh-CN", "idea", "active"); database.prepare("INSERT INTO projects (id,owner_user_id,title,paper_type,language,primary_creation_method,status) VALUES (?,?,?,?,?,?,?)").run("project-b", "user-b", "Other", "course_paper", "zh-CN", "idea", "active"); }
class PreparedStatement { constructor(database, sql, values = []) { this.database = database; this.sql = sql; this.values = values; } bind(...values) { return new PreparedStatement(this.database, this.sql, values); } async first(column) { const row = this.database.prepare(this.sql).get(...this.values); return row ? (column ? row[column] ?? null : row) : null; } async all() { return { success: true, results: this.database.prepare(this.sql).all(...this.values), meta: { changes: 0 } }; } async run() { const result = this.database.prepare(this.sql).run(...this.values); return { success: true, meta: { changes: Number(result.changes) } }; } }
class D1DatabaseAdapter { constructor(database) { this.database = database; } prepare(sql) { return new PreparedStatement(this.database, sql); } async batch(statements) { for (const statement of statements) await statement.run(); return []; } }
