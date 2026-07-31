import { DatabaseSync } from "node:sqlite";

const databasePath = process.argv[2];

if (!databasePath) {
  throw new Error("Usage: node scripts/m10-local-d1-audit.mjs <database-path>");
}

const database = new DatabaseSync(databasePath, { readOnly: true });
const tables = database
  .prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  )
  .all()
  .map(({ name }) => name);
const counts = {};

for (const table of [
  "users",
  "projects",
  "materials",
  "ai_tasks",
  "parse_runs",
  "output_jobs",
  "d1_migrations",
]) {
  if (tables.includes(table)) {
    counts[table] = database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
  }
}

const migrations = tables.includes("d1_migrations")
  ? database.prepare("SELECT * FROM d1_migrations ORDER BY id").all()
  : [];

console.log(
  JSON.stringify(
    {
      databasePath,
      tableCount: tables.length,
      tables,
      counts,
      migrations,
    },
    null,
    2,
  ),
);

database.close();
