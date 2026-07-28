import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { createM6AdvancedReview, prepareM6Submission } from "../db/repositories/m6-review-submission.ts";
import { env as workerEnv } from "./cloudflare-workers-shim.mjs";

test("advanced review is scoped to exact versions and stores evidence-bound findings", async () => {
  const database = await databaseWithProject(); workerEnv.DB = new D1DatabaseAdapter(database);
  const result = await createM6AdvancedReview(actor, "project-a", { versionIds: ["version-a"], findings: [{ perspective: "LOGIC", severity: "minor", sectionId: "section-a", summary: "Clarify the inference boundary.", evidenceBindingIds: [] }] });
  assert.equal(result.status, "succeeded"); assert.equal(result.findingCount, 1);
  assert.deepEqual(JSON.parse(database.prepare("SELECT scope_json FROM review_runs WHERE id = ?").get(result.id).scope_json).versionIds, ["version-a"]);
});

test("submission readiness requires data availability and a complete checklist", async () => {
  const database = await databaseWithProject(); workerEnv.DB = new D1DatabaseAdapter(database);
  database.prepare("INSERT INTO materials (id,owner_user_id,project_id,kind,filename,content_type,size_bytes,status) VALUES (?,?,?,?,?,?,?,?)").run("data-a", "user-a", "project-a", "data", "data.csv", "text/csv", 20, "success");
  const blocked = await prepareM6Submission(actor, "project-a", { versionIds: ["version-a"], dataAvailabilityStatement: "", checklist: { authors: true, ethics: false } });
  assert.equal(blocked.status, "blocked"); assert.deepEqual(blocked.blockers.map((item) => item.code).sort(), ["CHECKLIST_INCOMPLETE", "DATA_AVAILABILITY_MISSING"]);
  const ready = await prepareM6Submission(actor, "project-a", { versionIds: ["version-a"], dataAvailabilityStatement: "Data are available on reasonable request.", checklist: { authors: true, ethics: true } });
  assert.equal(ready.status, "ready");
});

const actor = { userId: "user-a", displayName: "A", role: "user" };
async function databaseWithProject() { const database = new DatabaseSync(":memory:"); database.exec("PRAGMA foreign_keys = ON"); const directory = new URL("../drizzle/", import.meta.url); for (const file of (await readdir(directory)).filter((name) => /^\d{4}_.+\.sql$/u.test(name)).sort()) database.exec((await readFile(new URL(file, directory), "utf8")).replaceAll("--> statement-breakpoint", "")); database.prepare("INSERT INTO users (id,email,display_name) VALUES (?,?,?)").run("user-a", "a@example.test", "A"); database.prepare("INSERT INTO projects (id,owner_user_id,title,paper_type,language,primary_creation_method,status) VALUES (?,?,?,?,?,?,?)").run("project-a", "user-a", "P", "course_paper", "zh-CN", "idea", "active"); database.prepare("INSERT INTO diagnosis_cards (id,owner_user_id,project_id,version_number,status,title,paper_type,language) VALUES (?,?,?,?,?,?,?,?)").run("diagnosis-a", "user-a", "project-a", 1, "confirmed", "P", "course_paper", "zh-CN"); database.prepare("INSERT INTO outlines (id,owner_user_id,project_id,diagnosis_card_id,version_number,status) VALUES (?,?,?,?,?,?)").run("outline-a", "user-a", "project-a", "diagnosis-a", 1, "confirmed"); database.prepare("INSERT INTO sections (id,owner_user_id,project_id,outline_id,slug,title,position) VALUES (?,?,?,?,?,?,?)").run("section-a", "user-a", "project-a", "outline-a", "intro", "Intro", 1); database.prepare("INSERT INTO section_versions (id,owner_user_id,project_id,section_id,version_number,source,content,content_hash) VALUES (?,?,?,?,?,?,?,?)").run("version-a", "user-a", "project-a", "section-a", 1, "manual", "Draft", "hash"); return database; }
class PreparedStatement { constructor(database, sql, values = []) { this.database = database; this.sql = sql; this.values = values; } bind(...values) { return new PreparedStatement(this.database, this.sql, values); } async first(column) { const row = this.database.prepare(this.sql).get(...this.values); return row ? (column ? row[column] ?? null : row) : null; } async all() { return { success: true, results: this.database.prepare(this.sql).all(...this.values), meta: { changes: 0 } }; } async run() { const result = this.database.prepare(this.sql).run(...this.values); return { success: true, meta: { changes: Number(result.changes) } }; } }
class D1DatabaseAdapter { constructor(database) { this.database = database; } prepare(sql) { return new PreparedStatement(this.database, sql); } async batch(statements) { for (const statement of statements) await statement.run(); return []; } }
