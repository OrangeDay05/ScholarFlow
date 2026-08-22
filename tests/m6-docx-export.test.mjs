import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { strFromU8, unzipSync } from "fflate";
import { createM6Docx } from "../app/lib/m6-docx.ts";
import { InMemoryStorageAdapter } from "../app/lib/storage/storage-adapter.ts";
import {
  createM6DocxExport,
  deleteM6SectionVersion,
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

test("DOCX preserves structured runs, lists, tables, and images", () => {
  const document = {
    version: 1,
    blocks: [
      { id: "heading", type: "heading", level: 2, runs: [{ text: "结构化标题", bold: true, fontFamily: "黑体", fontSizePt: 16 }], sourceLocator: { part: "test", blockIndex: 0 } },
      { id: "paragraph", type: "paragraph", alignment: "justify", runs: [{ text: "加粗", bold: true }, { text: "斜体", italic: true }, { text: "下划线", underline: true }], sourceLocator: { part: "test", blockIndex: 1 } },
      { id: "list", type: "list_item", ordered: true, level: 0, runs: [{ text: "列表项目" }], sourceLocator: { part: "test", blockIndex: 2 } },
      { id: "table", type: "table", rows: [{ cells: [{ blocks: [{ id: "cell-a", type: "paragraph", runs: [{ text: "表头" }], sourceLocator: { part: "test", blockIndex: 3 } }] }, { blocks: [{ id: "cell-b", type: "paragraph", runs: [{ text: "数据" }], sourceLocator: { part: "test", blockIndex: 3 } }] }] }], sourceLocator: { part: "test", blockIndex: 3 } },
      { id: "image", type: "image", assetId: "asset-a", altText: "示意图", width: 80, height: 40, caption: "图 1 示例", sourceLocator: { part: "test", blockIndex: 4 } },
    ],
  };
  const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7j8AAAAASUVORK5CYII=", "base64"));
  const bytes = createM6Docx({ title: "论文题目", sections: [{ title: "章节", slug: "chapter", content: "", document }], references: [], assets: [{ id: "asset-a", filename: "figure.png", contentType: "image/png", bytes: png }] });
  const archive = unzipSync(bytes);
  const xml = strFromU8(archive["word/document.xml"]);
  assert.match(xml, /<w:pStyle w:val="Heading2"/u);
  assert.match(xml, /<w:b\/>/u);
  assert.match(xml, /<w:i\/>/u);
  assert.match(xml, /<w:u w:val="single"\/>/u);
  assert.match(xml, /<w:numPr>/u);
  assert.match(strFromU8(archive["word/numbering.xml"]), /<w:startOverride w:val="1"\/>/u);
  assert.match(xml, /<w:tbl>/u);
  assert.match(xml, /<w:drawing>/u);
  assert.match(strFromU8(archive["word/_rels/document.xml.rels"]), /relationships\/image/u);
  assert.ok(archive["word/media/image1.png"]);
});

test("DOCX applies the chosen prefix only to numbered body sections", () => {
  const bytes = createM6Docx({
    title: "论文题目",
    sections: [
      { title: "摘要", slug: "abstract", content: "摘要正文" },
      { title: "引言", slug: "introduction", content: "引言正文" },
      { title: "2. 材料与方法", slug: "methods", content: "2. 材料与方法\n\n方法正文" },
      { title: "参考文献", slug: "references", content: "参考文献正文" },
    ],
    references: [],
    headingPrefixStyle: "chinese_dunhao",
  });
  const document = strFromU8(unzipSync(bytes)["word/document.xml"]);
  assert.match(document, /摘要/u);
  assert.doesNotMatch(document, /一、摘要/u);
  assert.match(document, /一、引言/u);
  assert.match(document, /二、材料与方法/u);
  assert.doesNotMatch(document, /三、参考文献/u);
  assert.equal((document.match(/材料与方法/gu) ?? []).length, 1);
});

test("export stores one immutable DOCX and records exact source versions", async () => {
  const database = await migratedDatabase(); workerEnv.DB = new D1DatabaseAdapter(database); seed(database);
  const storage = new InMemoryStorageAdapter();
  const result = await createM6DocxExport(actor, "project-a", ["version-a"], storage);
  assert.equal(result.status, "ready"); assert.equal(result.format, "docx");
  const bytes = await storage.get(result.objectKey); assert.ok(bytes);
  const exportedDocument = strFromU8(unzipSync(new Uint8Array(bytes))["word/document.xml"]);
  assert.match(exportedDocument, /Draft content/u);
  assert.match(exportedDocument, /<w:b\/>/u);
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

test("export workspace exposes only the latest outline and its formal version history", async () => {
  const database = await migratedDatabase(); workerEnv.DB = new D1DatabaseAdapter(database); seed(database);
  database.prepare("INSERT INTO outlines (id,owner_user_id,project_id,diagnosis_card_id,version_number,status) VALUES (?,?,?,?,?,?)").run("outline-b", "user-a", "project-a", "diagnosis-a", 2, "confirmed");
  database.prepare("INSERT INTO sections (id,owner_user_id,project_id,outline_id,slug,title,position) VALUES (?,?,?,?,?,?,?)").run("section-b", "user-a", "project-a", "outline-b", "methods", "Methods", 1);
  database.prepare("INSERT INTO section_versions (id,owner_user_id,project_id,section_id,version_number,source,content,content_hash) VALUES (?,?,?,?,?,?,?,?)").run("version-b1", "user-a", "project-a", "section-b", 1, "manual", "First methods", "hash-b1");
  database.prepare("INSERT INTO section_versions (id,owner_user_id,project_id,section_id,version_number,source,content,content_hash) VALUES (?,?,?,?,?,?,?,?)").run("version-b2", "user-a", "project-a", "section-b", 2, "manual", "Second methods", "hash-b2");

  const workspace = await loadM6ExportWorkspace(actor, "project-a");
  assert.deepEqual(workspace.sections.map((section) => section.id), ["section-b"]);
  assert.equal(workspace.sections[0].versionId, "version-b2");
  assert.deepEqual(workspace.sections[0].versions.map((version) => version.id), ["version-b2", "version-b1"]);
  assert.equal(workspace.sections[0].versions[0].isLatest, true);
  assert.match(workspace.sections[0].versions[1].preview, /First methods/u);
});

test("only an unreferenced past section version can be deleted", async () => {
  const database = await migratedDatabase(); workerEnv.DB = new D1DatabaseAdapter(database); seed(database);
  database.prepare("INSERT INTO section_versions (id,owner_user_id,project_id,section_id,version_number,source,content,content_hash) VALUES (?,?,?,?,?,?,?,?)").run("version-a2", "user-a", "project-a", "section-a", 2, "manual", "Latest draft", "hash-a2");

  assert.deepEqual(await deleteM6SectionVersion(actor, "project-a", "version-a"), { versionId: "version-a", deleted: true });
  assert.equal(database.prepare("SELECT id FROM section_versions WHERE id = ?").get("version-a"), undefined);
  await assert.rejects(
    deleteM6SectionVersion(actor, "project-a", "version-a2"),
    /每章最新版本必须保留/u,
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
  database.prepare("UPDATE section_versions SET content_json = ? WHERE id = 'version-a'").run(JSON.stringify({ version: 1, blocks: [{ id: "paragraph-a", type: "paragraph", runs: [{ text: "Draft content", bold: true }], sourceLocator: { part: "test", blockIndex: 0 } }] }));
}
class PreparedStatement { constructor(database, sql, values = []) { this.database = database; this.sql = sql; this.values = values; } bind(...values) { return new PreparedStatement(this.database, this.sql, values); } async first(column) { const row = this.database.prepare(this.sql).get(...this.values); return row ? (column ? row[column] ?? null : row) : null; } async all() { return { success: true, results: this.database.prepare(this.sql).all(...this.values), meta: { changes: 0 } }; } async run() { const result = this.database.prepare(this.sql).run(...this.values); return { success: true, meta: { changes: Number(result.changes) } }; } }
class D1DatabaseAdapter { constructor(database) { this.database = database; } prepare(sql) { return new PreparedStatement(this.database, sql); } async batch(statements) { for (const statement of statements) await statement.run(); return []; } }
