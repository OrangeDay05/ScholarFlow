import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const migration = (name) =>
  readFile(new URL(`../drizzle/${name}`, import.meta.url), "utf8");

function executableSql(sql) {
  return sql.replaceAll("--> statement-breakpoint", "");
}

test("M4 migrations apply in order to a fresh isolated SQLite database", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const [m0, m1, m2, m3, m4] = await Promise.all([
    migration("0000_swift_blue_shield.sql"),
    migration("0001_vengeful_tigra.sql"),
    migration("0002_petite_sir_ram.sql"),
    migration("0003_condemned_magik.sql"),
    migration("0004_nervous_maddog.sql"),
  ]);
  db.exec(executableSql(m0));
  db.exec(executableSql(m1));
  db.exec(executableSql(m2));
  db.exec(executableSql(m3));
  db.exec(executableSql(m4));
  const tables = db
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name`,
    )
    .all()
    .map((row) => row.name);
  for (const table of [
    "diagnosis_sessions",
    "diagnosis_session_questions",
    "diagnosis_field_values",
    "diagnosis_task_readiness",
    "diagnosis_audit_events",
  ]) {
    assert.ok(tables.includes(table), `${table} should exist after 0001`);
  }
  for (const table of [
    "ai_task_events",
    "ai_task_model_assignments",
    "review_reports",
    "review_issues",
    "review_issue_decisions",
    "section_version_adoptions",
  ]) {
    assert.ok(tables.includes(table), `${table} should exist after 0002`);
  }
  for (const table of [
    "material_privacy_profiles",
    "material_processing_copies",
    "analysis_fidelity_checks",
    "pseudonymization_maps",
    "task_material_transmissions",
  ]) {
    assert.ok(tables.includes(table), `${table} should exist after 0003`);
  }
  for (const table of [
    "model_providers",
    "provider_models",
    "credential_metadata",
    "execution_profiles",
    "execution_profile_models",
  ]) {
    assert.ok(tables.includes(table), `${table} should exist after 0004`);
  }
  assert.equal(tables.length, 58);
  db.close();
});

test("0002 only adds tables, columns, and indexes", async () => {
  const sql = await migration("0002_petite_sir_ram.sql");
  assert.doesNotMatch(
    executableSql(sql),
    /(?:^|;)\s*(?:DROP|DELETE|TRUNCATE)\b/im,
  );
  assert.doesNotMatch(sql, /ALTER\s+TABLE[^;]+\b(?:DROP|RENAME)\b/i);
});

test("0003 only adds privacy tables and indexes", async () => {
  const sql = await migration("0003_condemned_magik.sql");
  assert.doesNotMatch(
    executableSql(sql),
    /(?:^|;)\s*(?:DROP|DELETE|TRUNCATE|ALTER)\b/im,
  );
});

test("0004 only adds model tables, PPT columns, and indexes", async () => {
  const sql = await migration("0004_nervous_maddog.sql");
  assert.doesNotMatch(
    executableSql(sql),
    /(?:^|;)\s*(?:DROP|DELETE|TRUNCATE)\b/im,
  );
  assert.doesNotMatch(sql, /ALTER\s+TABLE[^;]+\b(?:DROP|RENAME)\b/i);
});

test("0001 is additive and does not contain destructive DDL", async () => {
  const sql = await migration("0001_vengeful_tigra.sql");
  assert.doesNotMatch(
    executableSql(sql),
    /(?:^|;)\s*(?:DROP|DELETE|TRUNCATE)\b/im,
  );
  assert.doesNotMatch(sql, /\bALTER\s+TABLE\b/i);
  assert.equal((sql.match(/CREATE TABLE `/g) ?? []).length, 5);
});
