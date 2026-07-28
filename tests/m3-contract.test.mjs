import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("freezes the M3 D1 contract without adding collaboration", async () => {
  const [schema, migration, hosting] = await Promise.all([
    source("../db/schema.ts"),
    source("../drizzle/0000_swift_blue_shield.sql"),
    source("../.openai/hosting.json"),
  ]);

  assert.equal((migration.match(/CREATE TABLE `/g) ?? []).length, 37);
  for (const table of [
    "users",
    "projects",
    "diagnosis_cards",
    "outlines",
    "sections",
    "section_versions",
    "materials",
    "citations",
    "evidence_bindings",
    "export_records",
    "idea_exploration_sessions",
    "external_search_runs",
    "review_runs",
    "submission_preparations",
    "figure_projects",
    "presentation_projects",
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE \`${table}\``));
  }

  assert.doesNotMatch(`${schema}\n${migration}`, /project_members/i);
  assert.match(migration, /`format` text DEFAULT 'docx' NOT NULL/);
  assert.deepEqual(JSON.parse(hosting), { d1: "DB", r2: null });
});

test("keeps owner isolation and append-only section restoration", async () => {
  const repository = await source("../db/repositories/m3-projects.ts");

  assert.ok(
    (repository.match(/owner_user_id = \?/g) ?? []).length >= 12,
    "project-owned reads and writes should be scoped by owner_user_id",
  );
  assert.match(
    repository,
    /WHERE id = \? AND owner_user_id = \?/,
    "explicit project access must include the owner",
  );
  assert.match(repository, /INSERT INTO section_versions/);
  assert.doesNotMatch(repository, /UPDATE section_versions/i);
  assert.doesNotMatch(repository, /DELETE FROM section_versions/i);
  assert.match(repository, /source_version_id/);
});

test("keeps M3 persistence gated and requires server sessions", async () => {
  const [feature, identity, auth, viteConfig] = await Promise.all([
    source("../app/lib/m3-features.ts"),
    source("../app/lib/m3-server-identity.ts"),
    source("../app/lib/auth.ts"),
    source("../vite.config.ts"),
  ]);

  assert.match(
    feature,
    /NEXT_PUBLIC_M3_PERSISTENCE_ENABLED === "true"/,
  );
  assert.match(identity, /resolveRequestSession/);
  assert.match(auth, /SESSION_COOKIE_NAME/);
  assert.doesNotMatch(identity, /oai-authenticated-user-email/);
  assert.doesNotMatch(viteConfig, /M3_ALLOW_LOCAL_DEMO_IDENTITY/);
});
