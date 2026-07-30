import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { strToU8, zipSync } from "fflate";
import { InMemoryStorageAdapter } from "../app/lib/storage/storage-adapter.ts";
import { exportM9Presentation, getM9PresentationExport, markM9PresentationOpenVerified } from "../db/repositories/m9-presentations.ts";
import { env as workerEnv } from "./cloudflare-workers-shim.mjs";

const actor = { userId: "user-a", displayName: "A", role: "user" };
test("M9 export binds one immutable presentation version and owner-scoped PPTX", async () => {
  const database = await migratedDatabase(); workerEnv.DB = new D1DatabaseAdapter(database); seed(database);
  const storage = new InMemoryStorageAdapter(); const runner = fakeRunner(3);
  const result = await exportM9Presentation(actor, "project-a", "pv-a", runner, storage);
  assert.equal(result.slideCount, 3); assert.equal(result.status, "GENERATED"); assert.ok(result.fileSize > 100);
  const body = await getM9PresentationExport(actor, "project-a", result.id, storage); assert.equal(new Uint8Array(body)[0], 0x50);
  await markM9PresentationOpenVerified(actor, "project-a", result.id);
  assert.equal(database.prepare("SELECT status FROM presentation_exports WHERE id = ?").get(result.id).status, "OPEN_VERIFIED");
  await assert.rejects(() => getM9PresentationExport({ userId: "user-b", displayName: "B", role: "user" }, "project-b", result.id, storage), /不存在/u);
});

test("M9 blocks export when readiness says material is missing", async () => {
  const database = await migratedDatabase(); workerEnv.DB = new D1DatabaseAdapter(database); seed(database); database.prepare("UPDATE presentation_projects SET readiness_status = 'NEEDS_MATERIAL'").run();
  await assert.rejects(() => exportM9Presentation(actor, "project-a", "pv-a", fakeRunner(3), new InMemoryStorageAdapter()), /缺少必要内容/u);
});

function fakeRunner(slideCount) { const files = { "[Content_Types].xml": strToU8("<Types/>"), "ppt/presentation.xml": strToU8("<p:presentation/>") }; for (let index = 1; index <= slideCount; index += 1) files[`ppt/slides/slide${index}.xml`] = strToU8(`<p:sld id="${index}"/>`); const bytes = zipSync(files); return { runnerId: "test-artifact-tool", async render() { return { status: "succeeded", runnerId: "test-artifact-tool", runnerVersion: "test", artifactToolVersion: "test", errorType: null, errorMessage: null, stdout: "", stderr: "", pptxBase64: Buffer.from(bytes).toString("base64"), slideCount }; } }; }
async function migratedDatabase() { const database = new DatabaseSync(":memory:"); database.exec("PRAGMA foreign_keys = ON"); const directory = new URL("../drizzle/", import.meta.url); const files = (await readdir(directory)).filter((name) => /^\d{4}_.+\.sql$/u.test(name)).sort(); for (const file of files) database.exec((await readFile(new URL(file, directory), "utf8")).replaceAll("--> statement-breakpoint", "")); return database; }
function seed(database) { database.prepare("INSERT INTO users (id,email,display_name) VALUES (?,?,?)").run("user-a", "a@example.test", "A"); database.prepare("INSERT INTO users (id,email,display_name) VALUES (?,?,?)").run("user-b", "b@example.test", "B"); database.prepare("INSERT INTO projects (id,owner_user_id,title,paper_type,language,primary_creation_method,status) VALUES (?,?,?,?,?,?,?)").run("project-a", "user-a", "Research", "course_paper", "zh-CN", "idea", "active"); database.prepare("INSERT INTO projects (id,owner_user_id,title,paper_type,language,primary_creation_method,status) VALUES (?,?,?,?,?,?,?)").run("project-b", "user-b", "Other", "course_paper", "zh-CN", "idea", "active"); database.prepare("INSERT INTO presentation_projects (id,owner_user_id,project_id,title,presentation_type,scene,readiness_status,truth_status,source_material_snapshot_json,audience,duration_minutes) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run("pp-a", "user-a", "project-a", "Research", "COURSE_PRESENTATION", "COURSE_PRESENTATION", "READY_WITH_WARNINGS", "PARTIALLY_VERIFIED", "[]", "Class", 15); database.prepare("INSERT INTO presentation_versions (id,owner_user_id,project_id,presentation_project_id,version_number,status,material_snapshot_json,narrative_json,verification_status) VALUES (?,?,?,?,?,'DRAFT','[]',?,'VERIFIED_WITH_WARNINGS')").run("pv-a", "user-a", "project-a", "pp-a", 1, JSON.stringify({ qaPreparation: [{ question: "Q", answer: "A" }] })); for (let position = 1; position <= 3; position += 1) database.prepare("INSERT INTO slides (id,owner_user_id,project_id,presentation_version_id,position,title,content_json,speaker_notes,asset_bindings_json,source_bindings_json,verification_status) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(`slide-${position}`, "user-a", "project-a", "pv-a", position, `Slide ${position}`, JSON.stringify({ body: ["Evidence", "Boundary"] }), "Presenter note", "[]", JSON.stringify([`source-${position}`]), "VERIFIED_WITH_WARNINGS"); }
class PreparedStatement { constructor(database, sql, values = []) { this.database = database; this.sql = sql; this.values = values; } bind(...values) { return new PreparedStatement(this.database, this.sql, values); } async first(column) { const row = this.database.prepare(this.sql).get(...this.values); return row ? (column ? row[column] ?? null : row) : null; } async all() { return { success: true, results: this.database.prepare(this.sql).all(...this.values), meta: { changes: 0 } }; } async run() { const result = this.database.prepare(this.sql).run(...this.values); return { success: true, meta: { changes: Number(result.changes) } }; } }
class D1DatabaseAdapter { constructor(database) { this.database = database; } prepare(sql) { return new PreparedStatement(this.database, sql); } async batch(statements) { for (const statement of statements) await statement.run(); return []; } }
