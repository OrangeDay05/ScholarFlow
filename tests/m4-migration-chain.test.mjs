import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const migration = (name) =>
  readFile(new URL(`../drizzle/${name}`, import.meta.url), "utf8");

function executableSql(sql) {
  return sql.replaceAll("--> statement-breakpoint", "");
}

test("0000 and 0001 apply in order to a fresh isolated SQLite database", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const [m0, m1] = await Promise.all([
    migration("0000_swift_blue_shield.sql"),
    migration("0001_vengeful_tigra.sql"),
  ]);
  db.exec(executableSql(m0));
  db.exec(executableSql(m1));
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
  assert.equal(tables.length, 42);
  db.close();
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
