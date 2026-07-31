import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { env as workerEnv } from "./cloudflare-workers-shim.mjs";
import { buildM5TextDiff } from "../app/lib/m5-action-execution.ts";
import {
  createAndClaimM5ActionTask,
  decideM5Candidate,
  loadM5ActionExecutionContext,
  loadM5ActionExecutionWorkspace,
} from "../db/repositories/m5-action-executions.ts";

test("action execution migration is additive and candidate decisions are idempotent", async () => {
  const migration = await readFile(new URL("../drizzle/0018_plain_paibok.sql", import.meta.url), "utf8");
  assert.match(migration, /CREATE TABLE `section_candidate_decisions`/u);
  assert.match(migration, /candidate_version_id`,`decision`/u);
  assert.match(migration, /owner_user_id`,`project_id`,`idempotency_key`/u);
  assert.match(migration, /ALTER TABLE `conversation_tool_intents` ADD `base_version_id`/u);
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM/iu);
});

test("paragraph diff keeps unchanged, modified, added and removed content visible", () => {
  assert.deepEqual(buildM5TextDiff("甲。\n\n乙。", "甲。\n\n乙已修改。\n\n丙。"), [
    { kind: "UNCHANGED", before: "甲。", after: "甲。" },
    { kind: "MODIFIED", before: "乙。", after: "乙已修改。" },
    { kind: "ADDED", before: null, after: "丙。" },
  ]);
  assert.deepEqual(buildM5TextDiff("甲。\n\n乙。", "甲。"), [
    { kind: "UNCHANGED", before: "甲。", after: "甲。" },
    { kind: "REMOVED", before: "乙。", after: null },
  ]);
});

test("production execution route has one explicit call gate and no retry or fallback", async () => {
  const route = await readFile(new URL("../app/api/m5/projects/[projectId]/conversations/proposals/execution/route.ts", import.meta.url), "utf8");
  const exportsRepository = await readFile(new URL("../db/repositories/m6-exports.ts", import.meta.url), "utf8");
  assert.match(route, /body\.confirmedExecution !== true/u);
  assert.match(route, /context\.productSkill !== "general_revision"/u);
  assert.match(route, /expectedCalls === 1/u);
  assert.equal((route.match(/\.createCompletion\(/gu) ?? []).length, 1);
  assert.doesNotMatch(route, /for\s*\(|while\s*\(|fallbackConfig|fallback_model/iu);
  assert.match(route, /persistM5TaskOutcome/u);
  assert.match(route, /loadM5ActionExecutionWorkspace/u);
  assert.match(exportsRepository, /NOT EXISTS[\s\S]+section_version_adoptions/u);
});

test("confirmed proposal creates one task and the same candidate can be rejected then adopted without a provider call", async () => {
  const database = await migratedDatabase();
  workerEnv.DB = new D1DatabaseAdapter(database);
  seed(database);
  const actor = { userId: "user-a", sessionId: "auth-session-a" };
  const context = await loadM5ActionExecutionContext(actor, "project-a", "conversation-a", "proposal-a");
  const taskId = await createAndClaimM5ActionTask(actor, "project-a", context, {
    providerKey: "deepseek",
    providerModelId: "provider-model-a",
    modelKey: "deepseek-v4-flash",
    modelVersion: "2026-07-24",
    timeoutSeconds: 60,
  });
  assert.equal(database.prepare("SELECT count(*) total FROM ai_tasks WHERE task_type = 'ACTION_PROPOSAL_REVISION'").get().total, 1);
  assert.equal(database.prepare("SELECT max_calls FROM ai_tasks WHERE id = ?").get(taskId).max_calls, 1);
  assert.equal(database.prepare("SELECT count(*) total FROM execution_profiles").get().total, 1);
  await assert.rejects(
    () => createAndClaimM5ActionTask(actor, "project-a", context, { providerKey: "deepseek", providerModelId: "provider-model-a", modelKey: "deepseek-v4-flash", modelVersion: "2026-07-24", timeoutSeconds: 60 }),
    (error) => error.code === "TASK_ALREADY_STARTED",
  );

  database.prepare("INSERT INTO section_versions (id, owner_user_id, project_id, section_id, version_number, source, content, content_hash, summary, created_by_task_id) VALUES ('candidate-a','user-a','project-a','section-a',2,'ai','修订后的第一段。','candidate-hash','候选',?)").run(taskId);
  database.prepare("INSERT INTO section_version_adoptions (id, owner_user_id, project_id, section_id, version_id, source_task_id, candidate_type, adopted) VALUES ('candidate-adoption-a','user-a','project-a','section-a','candidate-a',?,'REVISED',0)").run(taskId);
  database.prepare("UPDATE ai_tasks SET status='SUCCEEDED', calls_used=1, result_version_id='candidate-a' WHERE id=?").run(taskId);
  const workspace = await loadM5ActionExecutionWorkspace(actor, "project-a", "conversation-a", "proposal-a");
  assert.equal(workspace.candidate.id, "candidate-a");
  assert.equal(workspace.candidate.adopted, false);
  assert.equal(workspace.diff[0].kind, "MODIFIED");

  await decideM5Candidate(actor, "project-a", "conversation-a", "proposal-a", "REJECT", "reject-proposal-a");
  const rejected = await loadM5ActionExecutionWorkspace(actor, "project-a", "conversation-a", "proposal-a");
  assert.equal(rejected.candidate.rejected, true);
  assert.equal(database.prepare("SELECT content FROM section_versions WHERE id='version-a'").get().content, "原始第一段。");

  const adopted = await decideM5Candidate(actor, "project-a", "conversation-a", "proposal-a", "ADOPT", "adopt-proposal-a");
  assert.equal(adopted.candidate.adopted, true);
  const formal = database.prepare("SELECT source_version_id, content FROM section_versions WHERE id=?").get(adopted.candidate.formalVersionId);
  assert.equal(formal.source_version_id, "candidate-a");
  assert.equal(formal.content, "修订后的第一段。");
  assert.equal(database.prepare("SELECT count(*) total FROM provider_run_records").get().total, 0);
  database.close();
});

async function migratedDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  const migrations = (await readdir(new URL("../drizzle/", import.meta.url))).filter((name) => /^\d{4}_.+\.sql$/u.test(name)).sort();
  for (const name of migrations) database.exec((await readFile(new URL(`../drizzle/${name}`, import.meta.url), "utf8")).replaceAll("--> statement-breakpoint", ""));
  return database;
}

function seed(database) {
  database.prepare("INSERT INTO users (id,email,display_name) VALUES ('user-a','a@example.test','A')").run();
  database.prepare("INSERT INTO projects (id,owner_user_id,title,paper_type,language,primary_creation_method,status) VALUES ('project-a','user-a','验收项目','course_paper','zh','idea','active')").run();
  database.prepare("INSERT INTO diagnosis_cards (id,owner_user_id,project_id,version_number,status,title,paper_type,language) VALUES ('diagnosis-a','user-a','project-a',1,'confirmed','P','course_paper','zh')").run();
  database.prepare("INSERT INTO outlines (id,owner_user_id,project_id,diagnosis_card_id,version_number,status) VALUES ('outline-a','user-a','project-a','diagnosis-a',1,'confirmed')").run();
  database.prepare("INSERT INTO sections (id,owner_user_id,project_id,outline_id,slug,title,position) VALUES ('section-a','user-a','project-a','outline-a','introduction','引言',1)").run();
  database.prepare("INSERT INTO section_versions (id,owner_user_id,project_id,section_id,version_number,source,content,content_hash) VALUES ('version-a','user-a','project-a','section-a',1,'manual','原始第一段。','base-hash')").run();
  database.prepare("INSERT INTO conversation_sessions (id,owner_user_id,project_id,title,status,active_product_skill,idempotency_key) VALUES ('conversation-a','user-a','project-a','修改','ACTIVE','general_revision','conversation-key')").run();
  database.prepare("INSERT INTO conversation_tool_intents (id,owner_user_id,project_id,conversation_session_id,product_skill,operation,rationale,authorized_material_ids_json,section_id,base_version_id,excluded_scope,state,idempotency_key) VALUES ('intent-a','user-a','project-a','conversation-a','general_revision','只改第一段','用户要求','[]','section-a','version-a','第二段','PROPOSED','intent-key')").run();
  database.prepare("INSERT INTO conversation_action_proposals (id,owner_user_id,project_id,conversation_session_id,tool_intent_id,title,effect,warnings_json,status,idempotency_key,decided_at) VALUES ('proposal-a','user-a','project-a','conversation-a','intent-a','通用修改','候选版本','[]','CONFIRMED','proposal-key','2026-07-31T00:00:00Z')").run();
  database.prepare("INSERT INTO model_providers (id,provider_key,display_name,data_processor_name,status) VALUES ('provider-a','deepseek','DeepSeek','DeepSeek','AVAILABLE')").run();
  database.prepare("INSERT INTO provider_models (id,provider_id,model_key,display_name,model_version,allowed_roles_json,status) VALUES ('provider-model-a','provider-a','deepseek-v4-flash','Flash','2026-07-24','[\"REVISER\"]','AVAILABLE')").run();
}

class PreparedStatement {
  constructor(adapter, sql, values = []) { this.adapter = adapter; this.sql = sql; this.values = values; }
  bind(...values) { return new PreparedStatement(this.adapter, this.sql, values); }
  async first(column) { const row = this.adapter.database.prepare(this.sql).get(...this.values); return row ? column ? row[column] ?? null : row : null; }
  async all() { return { success: true, results: this.adapter.database.prepare(this.sql).all(...this.values), meta: { changes: 0 } }; }
  async run() { const result = this.adapter.database.prepare(this.sql).run(...this.values); return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } }; }
}

class D1DatabaseAdapter {
  constructor(database) { this.database = database; }
  prepare(sql) { return new PreparedStatement(this, sql); }
  async batch(statements) {
    const results = [];
    this.database.exec("BEGIN");
    try { for (const statement of statements) results.push(await statement.run()); this.database.exec("COMMIT"); return results; }
    catch (error) { this.database.exec("ROLLBACK"); throw error; }
  }
}
