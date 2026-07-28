import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { strFromU8, unzipSync } from "fflate";
import { parseM7DecisionLetter } from "../app/lib/m7-review-revision.ts";
import { InMemoryStorageAdapter } from "../app/lib/storage/storage-adapter.ts";
import { createM7ResponseLetterDocx } from "../db/repositories/m7-response-letter.ts";
import { appendM7ResponseDraft, confirmM7ResponseDraft, createM7RevisionTask, createM7RevisionVersion, importM7DecisionLetter, verifyM7RevisionTask } from "../db/repositories/m7-revisions.ts";
import { env as workerEnv } from "./cloudflare-workers-shim.mjs";

test("decision letter parser keeps reviewer and comment boundaries", () => {
  const comments = parseM7DecisionLetter("Reviewer 1\nComment 1: Clarify the method.\nMore detail.\nComment 2: Add evidence.\nReviewer 2\nComment 1: Fix wording.");
  assert.equal(comments.length, 3); assert.equal(comments[0].reviewerLabel, "Reviewer 1"); assert.match(comments[0].content, /More detail/u); assert.equal(comments[2].reviewerLabel, "Reviewer 2");
});

test("M7 preserves versions, requires user response confirmation, verifies change, and exports Response Letter DOCX", async () => {
  const database = await migratedDatabase(); workerEnv.DB = new D1DatabaseAdapter(database); seed(database);
  const imported = await importM7DecisionLetter(actor, "project-a", { text: "Reviewer 1\nComment 1: Clarify the method." });
  const task = await createM7RevisionTask(actor, "project-a", { reviewerCommentId: imported.commentIds[0], sectionId: "section-a", baseVersionId: "version-a", plannedAction: "Explain sampling." });
  const response = await appendM7ResponseDraft(actor, "project-a", task.id, "We clarified the sampling procedure.");
  const version = await createM7RevisionVersion(actor, "project-a", task.id, "Original draft. Added sampling details.");
  const beforeConfirmation = await verifyM7RevisionTask(actor, "project-a", task.id); assert.equal(beforeConfirmation.verified, false);
  await confirmM7ResponseDraft(actor, "project-a", task.id, response.id);
  const verified = await verifyM7RevisionTask(actor, "project-a", task.id); assert.equal(verified.verified, true); assert.equal(verified.status, "resolved");
  assert.equal(database.prepare("SELECT content FROM section_versions WHERE id = 'version-a'").get().content, "Original draft.");
  assert.equal(database.prepare("SELECT source_version_id FROM section_versions WHERE id = ?").get(version.id).source_version_id, "version-a");
  const storage = new InMemoryStorageAdapter(); const exported = await createM7ResponseLetterDocx(actor, "project-a", [task.id], storage);
  const body = strFromU8(unzipSync(new Uint8Array(await storage.get(exported.objectKey)))["word/document.xml"]);
  assert.match(body, /Clarify the method/u); assert.match(body, /We clarified/u); assert.match(body, new RegExp(version.id, "u"));
  const record = database.prepare("SELECT artifact_type,source_revision_task_ids_json FROM export_records WHERE id = ?").get(exported.id); assert.equal(record.artifact_type, "RESPONSE_LETTER"); assert.deepEqual(JSON.parse(record.source_revision_task_ids_json), [task.id]);
});

const actor = { userId: "user-a", displayName: "A", role: "user" };
async function migratedDatabase() { const database = new DatabaseSync(":memory:"); database.exec("PRAGMA foreign_keys = ON"); const directory = new URL("../drizzle/", import.meta.url); for (const file of (await readdir(directory)).filter((name) => /^\d{4}_.+\.sql$/u.test(name)).sort()) database.exec((await readFile(new URL(file, directory), "utf8")).replaceAll("--> statement-breakpoint", "")); return database; }
function seed(database) { database.prepare("INSERT INTO users (id,email,display_name) VALUES (?,?,?)").run("user-a", "a@example.test", "A"); database.prepare("INSERT INTO projects (id,owner_user_id,title,paper_type,language,primary_creation_method,status) VALUES (?,?,?,?,?,?,?)").run("project-a", "user-a", "Research", "journal_article", "en", "existing_draft", "active"); database.prepare("INSERT INTO diagnosis_cards (id,owner_user_id,project_id,version_number,status,title,paper_type,language) VALUES (?,?,?,?,?,?,?,?)").run("diagnosis-a", "user-a", "project-a", 1, "confirmed", "P", "journal_article", "en"); database.prepare("INSERT INTO outlines (id,owner_user_id,project_id,diagnosis_card_id,version_number,status) VALUES (?,?,?,?,?,?)").run("outline-a", "user-a", "project-a", "diagnosis-a", 1, "confirmed"); database.prepare("INSERT INTO sections (id,owner_user_id,project_id,outline_id,slug,title,position) VALUES (?,?,?,?,?,?,?)").run("section-a", "user-a", "project-a", "outline-a", "method", "Method", 1); database.prepare("INSERT INTO section_versions (id,owner_user_id,project_id,section_id,version_number,source,content,content_hash) VALUES (?,?,?,?,?,?,?,?)").run("version-a", "user-a", "project-a", "section-a", 1, "manual", "Original draft.", "base-hash"); }
class PreparedStatement { constructor(database, sql, values = []) { this.database = database; this.sql = sql; this.values = values; } bind(...values) { return new PreparedStatement(this.database, this.sql, values); } async first(column) { const row = this.database.prepare(this.sql).get(...this.values); return row ? (column ? row[column] ?? null : row) : null; } async all() { return { success: true, results: this.database.prepare(this.sql).all(...this.values), meta: { changes: 0 } }; } async run() { const result = this.database.prepare(this.sql).run(...this.values); return { success: true, meta: { changes: Number(result.changes) } }; } }
class D1DatabaseAdapter { constructor(database) { this.database = database; } prepare(sql) { return new PreparedStatement(this.database, sql); } async batch(statements) { for (const statement of statements) await statement.run(); return []; } }
