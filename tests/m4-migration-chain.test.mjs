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
  const [m0, m1, m2] = await Promise.all([
    migration("0000_swift_blue_shield.sql"),
    migration("0001_vengeful_tigra.sql"),
    migration("0002_petite_sir_ram.sql"),
  ]);
  db.exec(executableSql(m0));
  db.exec(executableSql(m1));
  db.exec(executableSql(m2));
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
  assert.equal(tables.length, 48);
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

test("0001 is additive and does not contain destructive DDL", async () => {
  const sql = await migration("0001_vengeful_tigra.sql");
  assert.doesNotMatch(
    executableSql(sql),
    /(?:^|;)\s*(?:DROP|DELETE|TRUNCATE)\b/im,
  );
  assert.doesNotMatch(sql, /\bALTER\s+TABLE\b/i);
  assert.equal((sql.match(/CREATE TABLE `/g) ?? []).length, 5);
});
