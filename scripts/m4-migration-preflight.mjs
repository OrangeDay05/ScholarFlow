import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const migrationNames = [
  "0000_swift_blue_shield.sql",
  "0001_vengeful_tigra.sql",
  "0002_petite_sir_ram.sql",
  "0003_condemned_magik.sql",
  "0004_nervous_maddog.sql",
];

function migrationSql(name) {
  return readFileSync(resolve("drizzle", name), "utf8").replaceAll(
    "--> statement-breakpoint",
    "",
  );
}

function tableNames(db) {
  return db
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name`,
    )
    .all()
    .map((row) => row.name);
}

function columnsByTable(db, tables) {
  return Object.fromEntries(
    tables.map((table) => [
      table,
      db
        .prepare(`PRAGMA table_info("${table.replaceAll('"', '""')}")`)
        .all()
        .map((column) => column.name)
        .sort(),
    ]),
  );
}

function isInfrastructureTable(table) {
  return table === "d1_migrations" || table === "_cf_METADATA";
}

function defaultDatabasePath() {
  const directory = resolve(
    ".wrangler",
    "state",
    "v3",
    "d1",
    "miniflare-D1DatabaseObject",
  );
  if (!existsSync(directory)) return null;
  const candidates = readdirSync(directory)
    .filter((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite")
    .map((name) => resolve(directory, name))
    .sort((left, right) => statSync(right).size - statSync(left).size);
  return candidates[0] ?? null;
}

const requestedDatabasePath = process.argv[2] ?? defaultDatabasePath();
const databasePath = requestedDatabasePath
  ? resolve(requestedDatabasePath)
  : null;
if (!databasePath || !existsSync(databasePath)) {
  console.error("M4 migration preflight: local D1 SQLite file was not found.");
  process.exitCode = 2;
} else {
  const expected = new DatabaseSync(":memory:");
  expected.exec("PRAGMA foreign_keys = ON");
  for (const name of migrationNames) expected.exec(migrationSql(name));

  const actual = new DatabaseSync(databasePath, { readOnly: true });
  const expectedTables = tableNames(expected);
  const actualTables = tableNames(actual);
  const expectedColumns = columnsByTable(expected, expectedTables);
  const actualColumns = columnsByTable(actual, actualTables);
  const missingTables = expectedTables.filter(
    (table) => !actualTables.includes(table),
  );
  const unexpectedTables = actualTables.filter(
    (table) => !expectedTables.includes(table) && !isInfrastructureTable(table),
  );
  const columnDrift = expectedTables
    .filter((table) => actualTables.includes(table))
    .flatMap((table) => {
      const missing = expectedColumns[table].filter(
        (column) => !actualColumns[table].includes(column),
      );
      const unexpected = actualColumns[table].filter(
        (column) => !expectedColumns[table].includes(column),
      );
      return missing.length || unexpected.length
        ? [{ table, missing, unexpected }]
        : [];
    });
  const ledger = actualTables.includes("d1_migrations")
    ? actual.prepare("SELECT * FROM d1_migrations ORDER BY id").all()
    : [];
  const ready =
    missingTables.length === 0 &&
    unexpectedTables.length === 0 &&
    columnDrift.length === 0 &&
    ledger.length === migrationNames.length;

  console.log(
    JSON.stringify(
      {
        mode: "READ_ONLY",
        databasePath,
        expectedMigrationCount: migrationNames.length,
        recordedMigrationCount: ledger.length,
        expectedBusinessTableCount: expectedTables.length,
        actualBusinessTableCount: actualTables.filter(
          (table) => !isInfrastructureTable(table),
        ).length,
        missingTables,
        unexpectedTables,
        columnDrift,
        readyForNormalMigrationFlow: ready,
        action: ready
          ? "No reconciliation is required."
          : "Do not run migrations blindly. Reconcile the existing schema and migration ledger explicitly.",
      },
      null,
      2,
    ),
  );

  actual.close();
  expected.close();
  if (!ready) process.exitCode = 2;
}
