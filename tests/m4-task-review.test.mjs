import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("M4 task contract contains all states and six separate roles", async () => {
  const contract = await source("../app/lib/m4-task-contracts.ts");
  for (const role of [
    "ROUTER",
    "GENERATOR",
    "REVIEWER",
    "VERIFIER",
    "REVISER",
    "AGGREGATOR",
  ]) {
    assert.match(contract, new RegExp(`"${role}"`));
  }
  for (const status of [
    "QUEUED",
    "PREPARING_CONTEXT",
    "PARSING",
    "RETRIEVING",
    "WAITING_FOR_USER_CONFIRMATION",
    "CALLING_MODEL",
    "GENERATING",
    "REVIEWING",
    "VERIFYING",
    "REVISING",
    "AGGREGATING",
    "RETRYING",
    "PARTIALLY_COMPLETED",
    "SUCCEEDED",
    "FAILED",
    "CANCELLED",
    "BLOCKED",
    "BUDGET_PAUSED",
  ]) {
    assert.match(contract, new RegExp(`"${status}"`));
  }
});

test("M4 task repository enforces transitions, call limits, idempotency and ownership", async () => {
  const repository = await source("../db/repositories/m4-tasks.ts");
  assert.match(repository, /transitions: Record<M4TaskStatus/);
  assert.match(repository, /CALL_LIMIT_REACHED/);
  assert.match(repository, /idempotency_key = \?/);
  assert.ok((repository.match(/owner_user_id = \?/g) ?? []).length >= 15);
  assert.match(repository, /project_id = \?/);
});

test("review report is independent from content and records user decisions", async () => {
  const [schema, repository] = await Promise.all([
    source("../db/schema.ts"),
    source("../db/repositories/m4-tasks.ts"),
  ]);
  for (const table of [
    "review_reports",
    "review_issues",
    "review_issue_decisions",
    "section_version_adoptions",
  ]) {
    assert.match(schema, new RegExp(`"${table}"`));
  }
  assert.match(repository, /只有 REVIEWER 角色任务可以创建独立审阅报告/);
  assert.match(repository, /忽略审阅问题时必须填写理由/);
  assert.doesNotMatch(
    repository,
    /UPDATE section_versions\s+SET\s+content/i,
  );
});

test("task API caps models by mode and validates the full review context", async () => {
  const api = await source(
    "../app/api/m4/projects/[projectId]/tasks/route.ts",
  );
  assert.match(api, /modelLimits = \{ none: 1, standard: 2, strict: 3, custom: 4 \}/);
  for (const field of [
    "user_requirement",
    "diagnosis_card_id",
    "material_ids",
    "generated_version_id",
    "evidence_binding_ids",
  ]) {
    assert.match(api, new RegExp(field));
  }
});
