import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { deterministicBucket, validateOperationalEvent } from "../app/lib/m10-operations-contracts.ts";
import { getOperationsDashboard, recordOperationalEvent, resolveOperationalControls, updateExperiment, updateFeatureFlag, updateUserStatus } from "../db/repositories/m10-operations.ts";
import { env as workerEnv } from "./cloudflare-workers-shim.mjs";

const admin = { userId: "admin-a", displayName: "Admin", role: "admin" };
const owner = { userId: "user-a", displayName: "Owner", role: "user" };

test("M10 operational events validate size and preserve project ownership", async () => {
  const database = await setup();
  assert.deepEqual(validateOperationalEvent({ category: "TASK", eventName: "task.completed", success: true, durationMs: 120 }), []);
  await recordOperationalEvent(owner, { projectId: "project-a", category: "TASK", eventName: "task.completed", success: true, durationMs: 120, metadata: { role: "GENERATOR" } });
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM operational_events").get().total, 1);
  await assert.rejects(() => recordOperationalEvent(owner, { projectId: "project-b", category: "TASK", eventName: "task.failed", success: false }), /项目不存在/u);
});

test("M10 dashboard, feature flags and experiments are audited and deterministic", async () => {
  const database = await setup();
  const initial = await getOperationsDashboard();
  assert.equal(initial.featureFlags.length, 2);
  assert.equal(initial.experiments.length, 1);
  await updateFeatureFlag(admin, "m10.release_candidate", true, 25, "验证发布候选灰度");
  await updateExperiment(admin, "ai_workspace_density", "RUNNING", 40, "验证实验分桶行为");
  await updateUserStatus(admin, "user-b", "frozen", "验证账号冻结和会话撤销");
  assert.equal(database.prepare("SELECT status FROM users WHERE id = ?").get("user-b").status, "frozen");
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM admin_audit_logs").get().total, 3);
  assert.match(database.prepare("SELECT metadata_json FROM admin_audit_logs WHERE target_user_id = ?").get("user-b").metadata_json, /账号冻结/u);
  assert.equal(deterministicBucket("user-a", "m10.release_candidate"), deterministicBucket("user-a", "m10.release_candidate"));
  const controls = await resolveOperationalControls(owner);
  assert.equal(typeof controls.featureFlags["m10.release_candidate"], "boolean");
  assert.match(controls.experiments.ai_workspace_density, /^(control|treatment)$/u);
});

async function setup() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  const files = (await readdir(new URL("../drizzle/", import.meta.url))).filter((name) => /^\d{4}_.+\.sql$/u.test(name)).sort();
  for (const file of files) database.exec((await readFile(new URL(`../drizzle/${file}`, import.meta.url), "utf8")).replaceAll("--> statement-breakpoint", ""));
  database.prepare("INSERT INTO users (id,email,display_name,role) VALUES (?,?,?,?)").run("admin-a", "admin@example.test", "Admin", "admin");
  database.prepare("INSERT INTO users (id,email,display_name) VALUES (?,?,?)").run("user-a", "a@example.test", "Owner");
  database.prepare("INSERT INTO users (id,email,display_name) VALUES (?,?,?)").run("user-b", "b@example.test", "Other");
  database.prepare("INSERT INTO projects (id,owner_user_id,title,paper_type,language,primary_creation_method,status) VALUES (?,?,?,?,?,?,?)").run("project-a", "user-a", "Research", "course_paper", "zh-CN", "idea", "active");
  database.prepare("INSERT INTO projects (id,owner_user_id,title,paper_type,language,primary_creation_method,status) VALUES (?,?,?,?,?,?,?)").run("project-b", "user-b", "Other", "course_paper", "zh-CN", "idea", "active");
  workerEnv.DB = new D1DatabaseAdapter(database);
  return database;
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
  async batch(statements) { const results = []; for (const statement of statements) results.push(await statement.run()); return results; }
}
