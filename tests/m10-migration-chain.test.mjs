import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const migrationsDirectory = new URL("../drizzle/", import.meta.url);

function executableSql(sql) {
  return sql.replaceAll("--> statement-breakpoint", "");
}

test("M0 through M10 migrations replay into a fresh isolated database", async () => {
  const migrationNames = (await readdir(migrationsDirectory))
    .filter((name) => /^\d{4}_.+\.sql$/u.test(name))
    .sort();

  assert.equal(migrationNames.length, 23);

  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");

  for (const migrationName of migrationNames) {
    const sql = await readFile(new URL(migrationName, migrationsDirectory), "utf8");
    database.exec(executableSql(sql));
  }

  const tables = database
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map(({ name }) => name);

  assert.equal(tables.length, 96);
  for (const table of [
    "agent_role_model_configs",
    "model_capability_versions",
    "presentation_exports",
    "operational_events",
    "feature_flags",
    "experiments",
    "experiment_assignments",
    "section_candidate_decisions",
    "workspaces",
    "workspace_memberships",
    "project_memberships",
    "review_assignments",
    "agent_context_snapshots",
    "context_snapshot_items",
    "agent_working_memories",
    "agent_handoffs",
    "material_chunk_embeddings",
    "evidence_candidates",
    "parsed_documents",
    "parsed_document_assets",
  ]) {
    assert.ok(tables.includes(table), `${table} should exist after the full migration chain`);
  }

  database.close();
});

test("structured manuscript migration is additive", async () => {
  const sql = await readFile(new URL("0022_structured_manuscript.sql", migrationsDirectory), "utf8");
  assert.doesNotMatch(executableSql(sql), /(?:^|;)\s*(?:DROP|DELETE|TRUNCATE)\b/imu);
  assert.match(sql, /ALTER TABLE `section_versions` ADD `content_json`/iu);
  assert.match(sql, /CREATE TABLE `parsed_documents`/iu);
  assert.match(sql, /CREATE TABLE `parsed_document_assets`/iu);
});

test("context engine migration is additive and links provider runs", async () => {
  const sql = await readFile(new URL("0021_context_engine.sql", migrationsDirectory), "utf8");

  assert.doesNotMatch(executableSql(sql), /(?:^|;)\s*(?:DROP|DELETE|TRUNCATE)\b/imu);
  assert.equal((sql.match(/CREATE TABLE `/gu) ?? []).length, 6);
  assert.match(sql, /ALTER TABLE `provider_run_records` ADD `agent_context_snapshot_id`/iu);
});

test("M10 migration is additive", async () => {
  const sql = await readFile(new URL("0017_third_chimera.sql", migrationsDirectory), "utf8");

  assert.doesNotMatch(
    executableSql(sql),
    /(?:^|;)\s*(?:DROP|DELETE|TRUNCATE|ALTER)\b/imu,
  );
  assert.equal((sql.match(/CREATE TABLE `/gu) ?? []).length, 4);
});

test("M10 project context migration is additive", async () => {
  const sql = await readFile(new URL("0019_m10_project_context.sql", migrationsDirectory), "utf8");

  assert.doesNotMatch(executableSql(sql), /(?:^|;)\s*(?:DROP|DELETE|TRUNCATE)\b/imu);
  assert.equal((sql.match(/CREATE TABLE `/gu) ?? []).length, 4);
  assert.match(sql, /ALTER TABLE `projects` ADD `workspace_id`/iu);
});
