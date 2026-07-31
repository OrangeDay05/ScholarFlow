import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { strFromU8, unzipSync } from "fflate";
import { createM6Docx } from "../app/lib/m6-docx.ts";
import { InMemoryStorageAdapter } from "../app/lib/storage/storage-adapter.ts";
import {
  createM6DocxExport,
  getM6DocxExport,
  loadM6ExportWorkspace,
} from "../db/repositories/m6-exports.ts";
import { env as workerEnv } from "./cloudflare-workers-shim.mjs";

test("DOCX is a valid OOXML package with sections and references", () => {
  const bytes = createM6Docx({ title: "论文题目", sections: [{ title: "引言", content: "第一段。\n\n第二段。" }], references: [{ citationKey: "ref-1", title: "Paper", authors: ["Li"], year: 2025, source: "Journal", doi: "10.1/test" }] });
  const archive = unzipSync(bytes);
  assert.ok(archive["[Content_Types].xml"]);
  assert.ok(archive["word/document.xml"]);
  const document = strFromU8(archive["word/document.xml"]);
  assert.match(document, /论文题目/u); assert.match(document, /第一段/u); assert.match(document, /参考文献/u); assert.match(document, /10\.1\/test/u);
});

test("export stores one immutable DOCX and records exact source versions", async () => {
  const database = await migratedDatabase(); workerEnv.DB = new D1DatabaseAdapter(database); seed(database);
  const storage = new InMemoryStorageAdapter();
  const result = await createM6DocxExport(actor, "project-a", ["version-a"], storage);
  assert.equal(result.status, "ready"); assert.equal(result.format, "docx");
  const bytes = await storage.get(result.objectKey); assert.ok(bytes);
  assert.match(strFromU8(unzipSync(new Uint8Array(bytes))["word/document.xml"]), /Draft content/u);
  const record = database.prepare("SELECT format,status,source_version_ids_json FROM export_records WHERE id = ?").get(result.id);
  assert.equal(record.format, "docx"); assert.equal(record.status, "ready"); assert.deepEqual(JSON.parse(record.source_version_ids_json), ["version-a"]);

  const workspace = await loadM6ExportWorkspace(actor, "project-a");
  assert.equal(workspace.sections[0].versionId, "version-a");
  assert.equal(workspace.exports[0].id, result.id);
  assert.ok(await getM6DocxExport(actor, "project-a", result.id, storage));
  await assert.rejects(
    getM6DocxExport({ userId: "user-b", displayName: "B", role: "user" }, "project-a", result.id, storage),
    /项目不存在或不属于当前用户/u,
  );
});

const actor = { userId: "user-a", displayName: "A", role: "user" };
async function migratedDatabase() { const database = new DatabaseSync(":memory:"); database.exec("PRAGMA foreign_keys = ON"); const directory = new URL("../drizzle/", import.meta.url); const files = (await readdir(directory)).filter((name) => /^\d{4}_.+\.sql$/u.test(name)).sort(); for (const file of files) database.exec((await readFile(new URL(file, directory), "utf8")).replaceAll("--> statement-breakpoint", "")); return database; }
function seed(database) {
  database.prepare("INSERT INTO users (id,email,display_name) VALUES (?,?,?)").run("user-a", "a@example.test", "A");
  database.prepare("INSERT INTO users (id,email,display_name) VALUES (?,?,?)").run("user-b", "b@example.test", "B");
  database.prepare("INSERT INTO projects (id,owner_user_id,title,paper_type,language,primary_creation_method,status) VALUES (?,?,?,?,?,?,?)").run("project-a", "user-a", "Research", "course_paper", "zh-CN", "idea", "active");
  database.prepare("INSERT INTO diagnosis_cards (id,owner_user_id,project_id,version_number,status,title,paper_type,language) VALUES (?,?,?,?,?,?,?,?)").run("diagnosis-a", "user-a", "project-a", 1, "confirmed", "P", "course_paper", "zh-CN");
  database.prepare("INSERT INTO outlines (id,owner_user_id,project_id,diagnosis_card_id,version_number,status) VALUES (?,?,?,?,?,?)").run("outline-a", "user-a", "project-a", "diagnosis-a", 1, "confirmed");
  database.prepare("INSERT INTO sections (id,owner_user_id,project_id,outline_id,slug,title,position) VALUES (?,?,?,?,?,?,?)").run("section-a", "user-a", "project-a", "outline-a", "intro", "Introduction", 1);
  database.prepare("INSERT INTO section_versions (id,owner_user_id,project_id,section_id,version_number,source,content,content_hash) VALUES (?,?,?,?,?,?,?,?)").run("version-a", "user-a", "project-a", "section-a", 1, "manual", "Draft content", "hash");
}
class PreparedStatement { constructor(database, sql, values = []) { this.database = database; this.sql = sql; this.values = values; } bind(...values) { return new PreparedStatement(this.database, this.sql, values); } async first(column) { const row = this.database.prepare(this.sql).get(...this.values); return row ? (column ? row[column] ?? null : row) : null; } async all() { return { success: true, results: this.database.prepare(this.sql).all(...this.values), meta: { changes: 0 } }; } async run() { const result = this.database.prepare(this.sql).run(...this.values); return { success: true, meta: { changes: Number(result.changes) } }; } }
class D1DatabaseAdapter { constructor(database) { this.database = database; } prepare(sql) { return new PreparedStatement(this.database, sql); } async batch(statements) { for (const statement of statements) await statement.run(); return []; } }
