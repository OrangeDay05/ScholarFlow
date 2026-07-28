import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { env as workerEnv } from "./cloudflare-workers-shim.mjs";
import { searchM5ProjectKnowledge } from "../db/repositories/m5-project-knowledge.ts";

test("project knowledge search is owner-scoped and only returns the latest successful parse", async () => {
  const database = await migratedDatabase();
  workerEnv.DB = new D1DatabaseAdapter(database);
  seed(database);
  const owner = { userId: "user-a", displayName: "A", role: "user" };
  const hits = await searchM5ProjectKnowledge(owner, "project-a", "target", 10);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].parseRunId, "run-new");
  assert.equal(hits[0].location.page, 2);
  assert.equal("objectKey" in hits[0], false);
  await assert.rejects(
    () => searchM5ProjectKnowledge({ userId: "user-b", displayName: "B", role: "user" }, "project-a", "target"),
    /不属于/u,
  );
});

test("project knowledge rejects unbounded or wildcard-only queries", async () => {
  const database = await migratedDatabase();
  workerEnv.DB = new D1DatabaseAdapter(database);
  seed(database);
  const owner = { userId: "user-a", displayName: "A", role: "user" };
  await assert.rejects(() => searchM5ProjectKnowledge(owner, "project-a", "%_"), /2—200/u);
  await assert.rejects(() => searchM5ProjectKnowledge(owner, "project-a", "x"), /2—200/u);
});

test("knowledge API is authenticated and does not claim vector or external search", async () => {
  const source = await readFile(new URL("../app/api/m5/projects/[projectId]/knowledge/search/route.ts", import.meta.url), "utf8");
  assert.match(source, /requireM4Actor/u);
  assert.doesNotMatch(source, /embedding|vector|provider|openai|deepseek/iu);
});

async function migratedDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  const files = ["0000_swift_blue_shield.sql", "0001_vengeful_tigra.sql", "0002_petite_sir_ram.sql", "0003_condemned_magik.sql", "0004_nervous_maddog.sql", "0005_freezing_nextwave.sql", "0006_hot_professor_monster.sql", "0007_silky_power_man.sql", "0008_common_swordsman.sql", "0009_greedy_jazinda.sql"];
  for (const file of files) database.exec((await readFile(new URL(`../drizzle/${file}`, import.meta.url), "utf8")).replaceAll("--> statement-breakpoint", ""));
  return database;
}

function seed(database) {
  database.prepare("INSERT INTO users (id,email,display_name) VALUES (?,?,?)").run("user-a", "a@example.test", "A");
  database.prepare("INSERT INTO users (id,email,display_name) VALUES (?,?,?)").run("user-b", "b@example.test", "B");
  database.prepare("INSERT INTO projects (id,owner_user_id,title,paper_type,language,primary_creation_method,status) VALUES (?,?,?,?,?,?,?)").run("project-a", "user-a", "P", "course_paper", "zh-CN", "data", "active");
  database.prepare("INSERT INTO materials (id,owner_user_id,project_id,kind,filename,content_type,size_bytes,status) VALUES (?,?,?,?,?,?,?,?)").run("material-a", "user-a", "project-a", "literature", "paper.pdf", "application/pdf", 100, "success");
  database.prepare("INSERT INTO material_objects (id,owner_user_id,project_id,material_id,object_key,storage_provider,original_filename,normalized_filename,detected_extension,detected_content_type,size_bytes,content_hash,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").run("object-a", "user-a", "project-a", "material-a", "private-key", "IN_MEMORY", "paper.pdf", "paper.pdf", "pdf", "application/pdf", 100, "hash", "STORED");
  const insertRun = database.prepare("INSERT INTO material_parse_runs (id,owner_user_id,project_id,material_id,material_object_id,parser_key,parser_version,format,content_hash,status,idempotency_key,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
  insertRun.run("run-old", "user-a", "project-a", "material-a", "object-a", "unpdf", "1", "PDF", "hash", "SUCCEEDED", "parse-old", "2026-01-01T00:00:00Z");
  insertRun.run("run-new", "user-a", "project-a", "material-a", "object-a", "unpdf", "1", "PDF", "hash", "SUCCEEDED", "parse-new", "2026-01-02T00:00:00Z");
  insertRun.run("run-failed", "user-a", "project-a", "material-a", "object-a", "unpdf", "1", "PDF", "hash", "FAILED", "parse-failed", "2026-01-03T00:00:00Z");
  const insertChunk = database.prepare("INSERT INTO material_chunks (id,owner_user_id,project_id,material_id,parse_run_id,ordinal,text,location_json,metadata_json,content_hash) VALUES (?,?,?,?,?,?,?,?,?,?)");
  insertChunk.run("chunk-old", "user-a", "project-a", "material-a", "run-old", 0, "old target", '{"page":1}', "{}", "a");
  insertChunk.run("chunk-new", "user-a", "project-a", "material-a", "run-new", 0, "new target", '{"page":2}', "{}", "b");
  insertChunk.run("chunk-failed", "user-a", "project-a", "material-a", "run-failed", 0, "failed target", '{"page":3}', "{}", "c");
}

class PreparedStatement {
  constructor(database, sql, values = []) { this.database = database; this.sql = sql; this.values = values; }
  bind(...values) { return new PreparedStatement(this.database, this.sql, values); }
  async first(column) { const row = this.database.prepare(this.sql).get(...this.values); return row ? (column ? row[column] ?? null : row) : null; }
  async all() { return { success: true, results: this.database.prepare(this.sql).all(...this.values), meta: { changes: 0 } }; }
}
class D1DatabaseAdapter { constructor(database) { this.database = database; } prepare(sql) { return new PreparedStatement(this.database, sql); } }
