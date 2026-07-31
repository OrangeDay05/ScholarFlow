import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("adds exactly the five M4 diagnosis persistence tables", async () => {
  const [schema, migration] = await Promise.all([
    source("../db/schema.ts"),
    source("../drizzle/0001_vengeful_tigra.sql"),
  ]);
  const tables = [
    "diagnosis_sessions",
    "diagnosis_session_questions",
    "diagnosis_field_values",
    "diagnosis_task_readiness",
    "diagnosis_audit_events",
  ];
  assert.equal((migration.match(/CREATE TABLE `/g) ?? []).length, 5);
  for (const table of tables) {
    assert.match(schema, new RegExp(`"${table}"`));
    assert.match(migration, new RegExp(`CREATE TABLE \\\`${table}\\\``));
  }
});

test("persists field state and source separately without adding model credentials", async () => {
  const [schema, migration] = await Promise.all([
    source("../db/schema.ts"),
    source("../drizzle/0001_vengeful_tigra.sql"),
  ]);
  for (const value of [
    "USER_CONFIRMED",
    "AI_INFERRED",
    "PENDING_CONFIRMATION",
    "UNKNOWN",
    "SKIPPED",
    "MISSING_MATERIAL",
    "NOT_APPLICABLE",
    "MATERIAL_EXTRACTED",
    "AI_RECOMMENDED",
    "SYSTEM_DERIVED",
  ]) {
    assert.match(schema, new RegExp(value));
  }
  assert.doesNotMatch(migration, /api_key|credential_secret|encrypted_key/i);
});

test("keeps every M4 diagnosis read and write owner-scoped", async () => {
  const repository = await source("../db/repositories/m4-diagnosis.ts");
  assert.ok((repository.match(/owner_user_id = \?/g) ?? []).length >= 20);
  assert.match(repository, /WHERE id = \? AND owner_user_id = \?/);
  assert.match(repository, /INSERT INTO diagnosis_cards/);
  assert.doesNotMatch(
    repository,
    /UPDATE diagnosis_cards\s+SET\s+(title|research_object|research_question|method)/i,
  );
  assert.match(repository, /status = 'superseded'/);
});

test("stores bounded sessions, task readiness, and diagnosis audit events", async () => {
  const repository = await source("../db/repositories/m4-diagnosis.ts");
  assert.match(repository, /consecutive_unknown_count/);
  assert.match(repository, /unknownCount >= 2/);
  assert.match(repository, /max_questions/);
  assert.match(repository, /calculateReadiness/);
  assert.match(repository, /DRAFT_VERSION_CREATED/);
  assert.match(repository, /DIAGNOSIS_CONFIRMED/);
  assert.match(repository, /preserved_unconfirmed_fields/);
});

test("keeps the five diagnosis version states and validates field snapshots", async () => {
  const [schema, contracts, repository, api] = await Promise.all([
    source("../db/schema.ts"),
    source("../app/lib/m4-diagnosis-contracts.ts"),
    source("../db/repositories/m4-diagnosis.ts"),
    source("../app/api/m4/projects/[projectId]/diagnosis/route.ts"),
  ]);
  for (const status of [
    "draft",
    "pending_confirmation",
    "confirmed",
    "superseded",
    "archived",
  ]) {
    assert.match(schema, new RegExp(`"${status}"`));
    assert.match(contracts, new RegExp(`"${status}"`));
  }
  assert.match(repository, /'pending_confirmation'/);
  assert.match(repository, /DIAGNOSIS_ARCHIVED/);
  assert.match(api, /parseFields/);
  assert.match(api, /诊断字段格式无效/);
});

test("enables M4 persistence by default while preserving the explicit fallback", async () => {
  const [feature, page, client, api] = await Promise.all([
    source("../app/lib/m4-features.ts"),
    source("../app/projects/[projectId]/diagnosis/page.tsx"),
    source("../app/lib/m4-diagnosis-client.ts"),
    source("../app/api/m4/projects/[projectId]/diagnosis/route.ts"),
  ]);
  assert.match(feature, /NEXT_PUBLIC_M4_DIAGNOSIS_PERSISTENCE_ENABLED !== "false"/);
  assert.match(feature, /NEXT_PUBLIC_M4_DIAGNOSIS_PERSISTENCE_ENABLED !== "0"/);
  assert.match(page, /persistenceEnabled/);
  assert.match(page, /ProgressiveDiagnosisPage/);
  assert.doesNotMatch(page, /LegacyDiagnosisPage/);
  assert.match(client, /api\/m4\/projects/);
  assert.match(api, /requireM4Actor/);
});
