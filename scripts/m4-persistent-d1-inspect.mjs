import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const directory = resolve(
  ".wrangler",
  "state",
  "v3",
  "d1",
  "miniflare-D1DatabaseObject",
);
const databasePath =
  process.argv[2] ??
  readdirSync(directory)
    .filter((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite")
    .map((name) => resolve(directory, name))
    .sort((left, right) => statSync(right).size - statSync(left).size)[0];
const marker = process.argv[3] ?? "";

if (!databasePath || !existsSync(databasePath)) {
  console.error("Persistent local D1 SQLite file was not found.");
  process.exit(2);
}

const db = new DatabaseSync(databasePath, { readOnly: true });
const first = (sql, ...values) => db.prepare(sql).get(...values);
const result = {
  mode: "READ_ONLY",
  databasePath,
  migrationCount: first("SELECT COUNT(*) AS count FROM d1_migrations").count,
  businessTableCount: first(
    `SELECT COUNT(*) AS count
     FROM sqlite_master
     WHERE type = 'table'
       AND name NOT LIKE 'sqlite_%'
       AND name NOT IN ('d1_migrations', '_cf_METADATA')`,
  ).count,
  markerProjectCount: marker
    ? first(
        "SELECT COUNT(*) AS count FROM projects WHERE title = ?",
        `${marker}-WORKFLOW`,
      ).count
    : null,
  pseudonymMapCount: first(
    "SELECT COUNT(*) AS count FROM pseudonymization_maps",
  ).count,
};
db.close();

console.log(JSON.stringify(result, null, 2));
if (
  result.migrationCount !== 5 ||
  result.businessTableCount !== 58 ||
  (marker && result.markerProjectCount !== 1)
) {
  process.exitCode = 1;
}
