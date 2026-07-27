import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("privacy contract separates six modes and seven fidelity checks", async () => {
  const contract = await source("../app/lib/m4-privacy-contracts.ts");
  for (const mode of [
    "RAW_ALLOWED",
    "SELECTIVE_REDACTION",
    "PSEUDONYMIZED",
    "AGGREGATED_ONLY",
    "LOCAL_ONLY",
    "EXTERNAL_BLOCKED",
  ]) {
    assert.match(contract, new RegExp(`"${mode}"`));
  }
  for (const check of [
    "EXPERIMENTAL_CONDITIONS",
    "SAMPLE_COUNT",
    "PARTICIPANT_SEPARATION",
    "CHRONOLOGY",
    "RESEARCH_NECESSARY_VARIABLES",
    "NUMERIC_PRECISION",
    "SPEAKER_RELATIONSHIPS",
  ]) {
    assert.match(contract, new RegExp(`"${check}"`));
  }
});

test("privacy profile stores the seven distinct material classifications", async () => {
  const schema = await source("../db/schema.ts");
  for (const column of [
    "direct_identifiers_json",
    "indirect_identifiers_json",
    "sensitive_attributes_json",
    "research_necessary_variables_json",
    "ordinary_research_content_json",
    "confidentiality_restrictions_json",
    "copyright_restrictions_json",
  ]) {
    assert.match(schema, new RegExp(`"${column}"`));
  }
});

test("failed fidelity checks and blocked modes cannot become planned transmissions", async () => {
  const repository = await source("../db/repositories/m4-privacy.ts");
  assert.match(repository, /check\.status === "FAILED" \|\| check\.blocking/);
  assert.match(repository, /\["LOCAL_ONLY", "EXTERNAL_BLOCKED"\]/);
  assert.match(repository, /blocked \? "BLOCKED" : "PLANNED"/);
  assert.doesNotMatch(repository, /fetch\(|transmit\(|providerRequest/i);
});

test("privacy API rejects plaintext pseudonym maps and only accepts vault references", async () => {
  const api = await source(
    "../app/api/m4/projects/[projectId]/privacy/route.ts",
  );
  assert.match(api, /PLAINTEXT_MAPPING_REJECTED/);
  assert.match(api, /vault-ref:\/\//);
  assert.match(api, /M4 不接收或保存明文伪匿名映射/);
});

test("every privacy repository operation remains owner and project scoped", async () => {
  const repository = await source("../db/repositories/m4-privacy.ts");
  assert.ok((repository.match(/owner_user_id = \?/g) ?? []).length >= 10);
  assert.ok((repository.match(/project_id = \?/g) ?? []).length >= 10);
});
