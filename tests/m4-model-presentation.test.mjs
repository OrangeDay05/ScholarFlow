import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("PPT contract covers all 13 scenes without degree gating", async () => {
  const [contract, api, repository] = await Promise.all([
    source("../app/lib/m4-presentation-contracts.ts"),
    source("../app/api/m4/projects/[projectId]/presentations/route.ts"),
    source("../db/repositories/m4-presentations.ts"),
  ]);
  const scenes = [
    "COURSE_PRESENTATION",
    "CLASSROOM_PRESENTATION",
    "LITERATURE_REVIEW_PRESENTATION",
    "GROUP_PRESENTATION",
    "FINAL_COURSE_PRESENTATION",
    "RESEARCH_PROPOSAL",
    "PROPOSAL_DEFENSE",
    "MIDTERM_DEFENSE",
    "THESIS_DEFENSE",
    "LAB_MEETING",
    "CONFERENCE_PRESENTATION",
    "PAPER_SHARING",
    "SUBMISSION_PRESENTATION",
  ];
  for (const scene of scenes) assert.match(contract, new RegExp(`"${scene}"`));
  assert.doesNotMatch(`${contract}\n${api}\n${repository}`, /degree|学历|硕士|博士/i);
});

test("PPT versions and slides bind source snapshots and never generate PPTX", async () => {
  const [schema, repository] = await Promise.all([
    source("../db/schema.ts"),
    source("../db/repositories/m4-presentations.ts"),
  ]);
  for (const column of [
    "source_material_snapshot_json",
    "source_presentation_version_id",
    "material_snapshot_json",
    "source_bindings_json",
    "verification_status",
  ]) {
    assert.match(schema, new RegExp(`"${column}"`));
  }
  assert.doesNotMatch(repository, /pptx|powerpoint|generateFile/i);
});

test("model contract distinguishes platform and user credentials and defers secrets", async () => {
  const contract = await source("../app/lib/m4-model-contracts.ts");
  assert.match(contract, /"PLATFORM_CREDENTIAL"/);
  assert.match(contract, /"USER_CREDENTIAL"/);
  assert.match(contract, /M4_SECRET_STORAGE_DEFERRED/);
  assert.match(contract, /M4 不接收明文密钥/);
});

test("model API rejects plaintext keys and performs no provider connection", async () => {
  const api = await source(
    "../app/api/m4/projects/[projectId]/model-configs/route.ts",
  );
  assert.match(api, /PLAINTEXT_KEY_REJECTED/);
  assert.match(api, /MOCK_CONNECTION_ONLY/);
  assert.match(api, /masked_key/);
  assert.match(api, /vault-ref:\/\//);
  assert.doesNotMatch(api, /fetch\(|axios|openai\.|anthropic\./i);
});

test("execution profiles enforce 2/3/4 model limits", async () => {
  const [api, repository] = await Promise.all([
    source("../app/api/m4/projects/[projectId]/model-configs/route.ts"),
    source("../db/repositories/m4-models.ts"),
  ]);
  assert.match(api, /STANDARD: \{ models: 2, calls: 2 \}/);
  assert.match(api, /STRICT: \{ models: 3, calls: 4 \}/);
  assert.match(api, /CUSTOM: \{ models: 4, calls: 5 \}/);
  assert.ok((repository.match(/owner_user_id = \?/g) ?? []).length >= 5);
});
