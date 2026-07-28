import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  recoveryDecision,
  validateM5ExecutionRequest,
} from "../app/lib/m5-execution-contracts.ts";

const contracts = await readFile(
  new URL("../app/lib/m5-execution-contracts.ts", import.meta.url),
  "utf8",
);
const provider = await readFile(
  new URL("../app/lib/m5-provider-adapter.ts", import.meta.url),
  "utf8",
);

test("freezes exactly six product skills and bounded execution modes", () => {
  for (const skill of [
    "project_diagnosis_outline",
    "literature_summary_matrix",
    "chapter_writing",
    "general_revision",
    "consistency_check",
    "citation_evidence_check",
  ]) {
    assert.match(contracts, new RegExp(`"${skill}"`));
  }
  assert.match(contracts, /STANDARD: \{ maxModels: 2, maxCalls: 2 \}/);
  assert.match(contracts, /STRICT: \{ maxModels: 3, maxCalls: 4 \}/);
  assert.match(contracts, /CUSTOM: \{ maxModels: 4, maxCalls: 5 \}/);
});

test("keeps diagnosis, material authorization and recovery gates explicit", () => {
  assert.match(contracts, /DIAGNOSIS_CONFIRMATION_REQUIRED/);
  assert.match(contracts, /authorizedMaterialIds/);
  assert.match(contracts, /WAITING_FOR_USER_CONFIRMATION/);
  assert.match(contracts, /BUDGET_PAUSED/);
  assert.match(contracts, /CALL_BUDGET_EXCEEDED/);

  const base = {
    context: {
      runId: "run-1",
      ownerUserId: "user-1",
      projectId: "project-1",
      productSkill: "chapter_writing",
      language: "zh",
      paperType: "期刊论文",
      requestedOperation: "撰写引言",
      confirmedDiagnosisCardId: null,
      projectRequirementIds: [],
      authorizedMaterialIds: ["material-1"],
      chapterId: "chapter-1",
      modelConfigId: "profile-1",
      externalSearchEnabled: false,
    },
    mode: "STANDARD",
    roles: ["GENERATOR", "REVIEWER"],
    maxCalls: 2,
    timeoutSeconds: 120,
  };
  assert.deepEqual(validateM5ExecutionRequest(base), {
    ok: false,
    code: "DIAGNOSIS_CONFIRMATION_REQUIRED",
    message: "正式章节写作需要已确认诊断卡。",
  });
  assert.equal(recoveryDecision("CALLING_MODEL"), "RESUME");
  assert.equal(recoveryDecision("BUDGET_PAUSED"), "WAIT_FOR_USER");
  assert.equal(
    recoveryDecision("WAITING_FOR_USER_CONFIRMATION"),
    "WAIT_FOR_USER",
  );
  assert.equal(recoveryDecision("SUCCEEDED"), "TERMINAL");
});

test("defines provider and credential boundaries without embedding secrets", () => {
  assert.match(provider, /interface M5ProviderAdapter/);
  assert.match(provider, /interface M5CredentialResolver/);
  assert.match(provider, /AbortSignal/);
  assert.match(provider, /M5ProviderRegistry/);
  assert.doesNotMatch(provider, /["']sk-[^"']{8,}["']/);
  assert.doesNotMatch(
    provider,
    /(api[_-]?key|secret)\s*[:=]\s*["'][^"']+["']/i,
  );
  assert.doesNotMatch(provider, /OpenAI|DeepSeek|Anthropic/);
});
