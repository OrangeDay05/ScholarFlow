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

  assert.equal(migrationNames.length, 18);

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

  assert.equal(tables.length, 83);
  for (const table of [
    "agent_role_model_configs",
    "model_capability_versions",
    "presentation_exports",
    "operational_events",
    "feature_flags",
    "experiments",
    "experiment_assignments",
  ]) {
    assert.ok(tables.includes(table), `${table} should exist after the full migration chain`);
  }

  database.close();
});

test("M10 migration is additive", async () => {
  const sql = await readFile(new URL("0017_third_chimera.sql", migrationsDirectory), "utf8");

  assert.doesNotMatch(
    executableSql(sql),
    /(?:^|;)\s*(?:DROP|DELETE|TRUNCATE|ALTER)\b/imu,
  );
  assert.equal((sql.match(/CREATE TABLE `/gu) ?? []).length, 4);
});
