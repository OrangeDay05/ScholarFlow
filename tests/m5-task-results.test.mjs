import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { env as workerEnv } from "./cloudflare-workers-shim.mjs";
import { persistM5TaskOutcome } from "../db/repositories/m5-task-results.ts";

test("task outcome appends candidates and reports without adopting or overwriting", async () => {
  const database = await migratedDatabase();
  workerEnv.DB = new D1DatabaseAdapter(database);
  seed(database);
  const outcome = {
    status: "SUCCEEDED", callsUsed: 2, stopReason: "done", errorCode: null,
    artifacts: [artifact("GENERATOR", "GENERATED_CANDIDATE", "new draft"), artifact("REVIEWER", "REVIEW_REPORT", "review only")],
  };
  const saved = await persistM5TaskOutcome(actorA, "project-a", "task-a", outcome);
  assert.equal(saved.createdVersionIds.length, 1);
  assert.equal(database.prepare("SELECT count(*) total FROM section_versions WHERE section_id = 'section-a'").get().total, 2);
  assert.equal(database.prepare("SELECT content FROM section_versions WHERE version_number = 1").get().content, "old draft");
  assert.equal(database.prepare("SELECT adopted FROM section_version_adoptions").get().adopted, 0);
  assert.equal(database.prepare("SELECT count(*) total FROM ai_task_results").get().total, 2);
  assert.equal(database.prepare("SELECT status FROM ai_tasks WHERE id = 'task-a'").get().status, "SUCCEEDED");
});

test("partial failure preserves artifacts and owner isolation", async () => {
  const database = await migratedDatabase();
  workerEnv.DB = new D1DatabaseAdapter(database);
  seed(database);
  await assert.rejects(() => persistM5TaskOutcome(actorB, "project-a", "task-a", {
    status: "FAILED", callsUsed: 1, stopReason: "x", errorCode: "x", artifacts: [],
  }), /不属于/u);
  await persistM5TaskOutcome(actorA, "project-a", "task-a", {
    status: "PARTIALLY_COMPLETED", callsUsed: 2, stopReason: "review failed", errorCode: "PROVIDER_FAILED",
    artifacts: [artifact("GENERATOR", "GENERATED_CANDIDATE", "kept draft")],
  });
  assert.equal(database.prepare("SELECT status FROM ai_tasks WHERE id = 'task-a'").get().status, "PARTIALLY_COMPLETED");
  assert.equal(database.prepare("SELECT content FROM section_versions WHERE version_number = 2").get().content, "kept draft");
});

function artifact(role, artifactType, outputText) {
  return { role, artifactType, result: { outputText, providerKey: "mock", modelKey: "m", modelVersion: "1", finishReason: "STOP", inputTokens: 1, outputTokens: 1, providerRequestId: "request-1" } };
}
const actorA = { userId: "user-a", displayName: "A", role: "user" };
const actorB = { userId: "user-b", displayName: "B", role: "user" };

async function migratedDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  const files = ["0000_swift_blue_shield.sql", "0001_vengeful_tigra.sql", "0002_petite_sir_ram.sql", "0003_condemned_magik.sql", "0004_nervous_maddog.sql", "0005_freezing_nextwave.sql", "0006_hot_professor_monster.sql", "0007_silky_power_man.sql", "0008_common_swordsman.sql", "0009_greedy_jazinda.sql", "0010_curved_leo.sql"];
  for (const file of files) database.exec((await readFile(new URL(`../drizzle/${file}`, import.meta.url), "utf8")).replaceAll("--> statement-breakpoint", ""));
  return database;
}

function seed(database) {
  database.prepare("INSERT INTO users (id,email,display_name) VALUES (?,?,?)").run("user-a", "a@example.test", "A");
  database.prepare("INSERT INTO users (id,email,display_name) VALUES (?,?,?)").run("user-b", "b@example.test", "B");
  database.prepare("INSERT INTO projects (id,owner_user_id,title,paper_type,language,primary_creation_method,status) VALUES (?,?,?,?,?,?,?)").run("project-a", "user-a", "P", "course_paper", "zh-CN", "idea", "active");
  database.prepare("INSERT INTO diagnosis_cards (id,owner_user_id,project_id,version_number,status,title,paper_type,language) VALUES (?,?,?,?,?,?,?,?)").run("diagnosis-a", "user-a", "project-a", 1, "confirmed", "P", "course_paper", "zh-CN");
  database.prepare("INSERT INTO outlines (id,owner_user_id,project_id,diagnosis_card_id,version_number,status) VALUES (?,?,?,?,?,?)").run("outline-a", "user-a", "project-a", "diagnosis-a", 1, "confirmed");
  database.prepare("INSERT INTO sections (id,owner_user_id,project_id,outline_id,slug,title,position) VALUES (?,?,?,?,?,?,?)").run("section-a", "user-a", "project-a", "outline-a", "intro", "Intro", 1);
  database.prepare("INSERT INTO section_versions (id,owner_user_id,project_id,section_id,version_number,source,content,content_hash) VALUES (?,?,?,?,?,?,?,?)").run("version-old", "user-a", "project-a", "section-a", 1, "manual", "old draft", "old");
  database.prepare("INSERT INTO ai_tasks (id,owner_user_id,project_id,section_id,task_role,product_skill,task_type,status,review_mode,max_calls,calls_used,timeout_seconds) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run("task-a", "user-a", "project-a", "section-a", "GENERATOR", "chapter_writing", "write", "CALLING_MODEL", "standard", 2, 0, 120);
}

class PreparedStatement {
  constructor(database, sql, values = []) { this.database = database; this.sql = sql; this.values = values; }
  bind(...values) { return new PreparedStatement(this.database, this.sql, values); }
  async first(column) { const row = this.database.prepare(this.sql).get(...this.values); return row ? (column ? row[column] ?? null : row) : null; }
  async all() { return { success: true, results: this.database.prepare(this.sql).all(...this.values), meta: { changes: 0 } }; }
  async run() { const result = this.database.prepare(this.sql).run(...this.values); return { success: true, meta: { changes: Number(result.changes) } }; }
}
class D1DatabaseAdapter {
  constructor(database) { this.database = database; }
  prepare(sql) { return new PreparedStatement(this.database, sql); }
  async batch(statements) { for (const statement of statements) await statement.run(); return []; }
}
