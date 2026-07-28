import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { verifyEvidenceText } from "../app/lib/m6-evidence-contracts.ts";
import { bindM6Evidence, createM6Claim, evaluateM6ExportReadiness } from "../db/repositories/m6-evidence.ts";
import { env as workerEnv } from "./cloudflare-workers-shim.mjs";

test("evidence verification requires the quote to exist in the source chunk", () => {
  assert.equal(verifyEvidenceText({ chunkText: "The result was 42 percent.", quote: "42 percent", supportLevel: "direct" }).status, "VERIFIED");
  assert.equal(verifyEvidenceText({ chunkText: "The result was 42 percent.", quote: "35 percent", supportLevel: "direct" }).status, "CONFLICTING");
  assert.equal(verifyEvidenceText({ chunkText: "The result was 42 percent.", quote: "", supportLevel: "unverified" }).status, "UNVERIFIED");
});

test("M6 binds only the latest successful owned chunk and blocks conflicting high-risk evidence", async () => {
  const database = await migratedDatabase(); workerEnv.DB = new D1DatabaseAdapter(database); seed(database);
  const claim = await createM6Claim(actorA, "project-a", { sectionVersionId: "version-a", text: "The effect is 35 percent." });
  const binding = await bindM6Evidence(actorA, "project-a", { claimId: claim.id, materialId: "material-a", materialChunkId: "chunk-new", quote: "35 percent", supportLevel: "direct", riskLevel: "HIGH_RISK" });
  assert.equal(binding.verificationStatus, "CONFLICTING");
  const readiness = await evaluateM6ExportReadiness(actorA, "project-a", ["version-a"]);
  assert.equal(readiness.ready, false);
  assert.equal(readiness.blockers[0].code, "CONFLICTING_EVIDENCE");
  await assert.rejects(() => bindM6Evidence(actorA, "project-a", { claimId: claim.id, materialId: "material-a", materialChunkId: "chunk-old", quote: "35 percent", supportLevel: "direct", riskLevel: "HIGH_RISK" }), /最新成功/u);
  await assert.rejects(() => evaluateM6ExportReadiness(actorB, "project-a", ["version-a"]), /不属于/u);
});

test("verified high-risk evidence permits export readiness", async () => {
  const database = await migratedDatabase(); workerEnv.DB = new D1DatabaseAdapter(database); seed(database);
  const claim = await createM6Claim(actorA, "project-a", { sectionVersionId: "version-a", text: "The effect is 42 percent." });
  await bindM6Evidence(actorA, "project-a", { claimId: claim.id, materialId: "material-a", materialChunkId: "chunk-new", quote: "42 percent", supportLevel: "direct", riskLevel: "HIGH_RISK" });
  const readiness = await evaluateM6ExportReadiness(actorA, "project-a", ["version-a"]);
  assert.equal(readiness.ready, true);
  assert.deepEqual(readiness.blockers, []);
});

const actorA = { userId: "user-a", displayName: "A", role: "user" };
const actorB = { userId: "user-b", displayName: "B", role: "user" };
async function migratedDatabase() {
  const database = new DatabaseSync(":memory:"); database.exec("PRAGMA foreign_keys = ON");
  const directory = new URL("../drizzle/", import.meta.url);
  const files = (await readdir(directory)).filter((name) => /^\d{4}_.+\.sql$/u.test(name)).sort();
  for (const file of files) database.exec((await readFile(new URL(file, directory), "utf8")).replaceAll("--> statement-breakpoint", ""));
  return database;
}
function seed(database) {
  database.prepare("INSERT INTO users (id,email,display_name) VALUES (?,?,?)").run("user-a", "a@example.test", "A");
  database.prepare("INSERT INTO users (id,email,display_name) VALUES (?,?,?)").run("user-b", "b@example.test", "B");
  database.prepare("INSERT INTO projects (id,owner_user_id,title,paper_type,language,primary_creation_method,status) VALUES (?,?,?,?,?,?,?)").run("project-a", "user-a", "P", "course_paper", "zh-CN", "idea", "active");
  database.prepare("INSERT INTO diagnosis_cards (id,owner_user_id,project_id,version_number,status,title,paper_type,language) VALUES (?,?,?,?,?,?,?,?)").run("diagnosis-a", "user-a", "project-a", 1, "confirmed", "P", "course_paper", "zh-CN");
  database.prepare("INSERT INTO outlines (id,owner_user_id,project_id,diagnosis_card_id,version_number,status) VALUES (?,?,?,?,?,?)").run("outline-a", "user-a", "project-a", "diagnosis-a", 1, "confirmed");
  database.prepare("INSERT INTO sections (id,owner_user_id,project_id,outline_id,slug,title,position) VALUES (?,?,?,?,?,?,?)").run("section-a", "user-a", "project-a", "outline-a", "intro", "Intro", 1);
  database.prepare("INSERT INTO section_versions (id,owner_user_id,project_id,section_id,version_number,source,content,content_hash) VALUES (?,?,?,?,?,?,?,?)").run("version-a", "user-a", "project-a", "section-a", 1, "manual", "draft", "hash");
  database.prepare("INSERT INTO materials (id,owner_user_id,project_id,kind,filename,content_type,size_bytes,status) VALUES (?,?,?,?,?,?,?,?)").run("material-a", "user-a", "project-a", "literature", "paper.txt", "text/plain", 100, "success");
  database.prepare("INSERT INTO material_objects (id,owner_user_id,project_id,material_id,object_key,storage_provider,original_filename,normalized_filename,detected_extension,detected_content_type,size_bytes,content_hash,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").run("object-a", "user-a", "project-a", "material-a", "private", "IN_MEMORY", "paper.txt", "paper.txt", "txt", "text/plain", 100, "hash", "STORED");
  const run = database.prepare("INSERT INTO material_parse_runs (id,owner_user_id,project_id,material_id,material_object_id,parser_key,parser_version,format,content_hash,status,idempotency_key,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
  run.run("run-old", "user-a", "project-a", "material-a", "object-a", "txt", "1", "TXT", "hash", "SUCCEEDED", "old", "2026-01-01");
  run.run("run-new", "user-a", "project-a", "material-a", "object-a", "txt", "1", "TXT", "hash", "SUCCEEDED", "new", "2026-01-02");
  const chunk = database.prepare("INSERT INTO material_chunks (id,owner_user_id,project_id,material_id,parse_run_id,ordinal,text,location_json,metadata_json,content_hash) VALUES (?,?,?,?,?,?,?,?,?,?)");
  chunk.run("chunk-old", "user-a", "project-a", "material-a", "run-old", 0, "35 percent", '{"lineStart":1}', "{}", "old");
  chunk.run("chunk-new", "user-a", "project-a", "material-a", "run-new", 0, "The result was 42 percent.", '{"lineStart":2}', "{}", "new");
}
class PreparedStatement { constructor(database, sql, values = []) { this.database = database; this.sql = sql; this.values = values; } bind(...values) { return new PreparedStatement(this.database, this.sql, values); } async first(column) { const row = this.database.prepare(this.sql).get(...this.values); return row ? (column ? row[column] ?? null : row) : null; } async all() { return { success: true, results: this.database.prepare(this.sql).all(...this.values), meta: { changes: 0 } }; } async run() { const result = this.database.prepare(this.sql).run(...this.values); return { success: true, meta: { changes: Number(result.changes) } }; } }
class D1DatabaseAdapter { constructor(database) { this.database = database; } prepare(sql) { return new PreparedStatement(this.database, sql); } async batch(statements) { for (const statement of statements) await statement.run(); return []; } }
