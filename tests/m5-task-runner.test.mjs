import assert from "node:assert/strict";
import test from "node:test";
import { runM5BoundedTask } from "../app/lib/m5-task-runner.ts";

const context = { runId: "run", ownerUserId: "user", projectId: "project", productSkill: "chapter_writing", language: "zh", paperType: "course", requestedOperation: "write", confirmedDiagnosisCardId: "diagnosis", projectRequirementIds: [], authorizedMaterialIds: ["material"], chapterId: "section", modelConfigId: "profile", externalSearchEnabled: false };

test("standard runner generates then independently reviews without overwriting", async () => {
  const calls = [];
  const outcome = await runM5BoundedTask({ context, mode: "STANDARD", assignments: [assignment("GENERATOR", "draft", calls), assignment("REVIEWER", "report", calls)], userInstruction: "write", materialContext: "verified source", maxCalls: 2, timeoutSeconds: 20, maxOutputTokens: 100, budgetAllowsCall: async () => true });
  assert.equal(outcome.status, "SUCCEEDED");
  assert.deepEqual(outcome.artifacts.map((item) => item.artifactType), ["GENERATED_CANDIDATE", "REVIEW_REPORT"]);
  assert.equal(outcome.artifacts[0].result.outputText, "draft");
  assert.match(calls[1].messages[1].content, /draft/u);
});

test("review failure preserves generation and is never marked passed", async () => {
  const outcome = await runM5BoundedTask({ context, mode: "STANDARD", assignments: [assignment("GENERATOR", "draft", []), failingAssignment("REVIEWER")], userInstruction: "write", materialContext: "source", maxCalls: 2, timeoutSeconds: 20, maxOutputTokens: 100, budgetAllowsCall: async () => true });
  assert.equal(outcome.status, "PARTIALLY_COMPLETED");
  assert.equal(outcome.artifacts.length, 1);
  assert.equal(outcome.artifacts[0].result.outputText, "draft");
});

test("budget pause and cancellation stop without extra provider calls", async () => {
  const calls = [];
  const paused = await runM5BoundedTask({ context, mode: "STANDARD", assignments: [assignment("GENERATOR", "draft", calls), assignment("REVIEWER", "report", calls)], userInstruction: "write", materialContext: "source", maxCalls: 2, timeoutSeconds: 20, maxOutputTokens: 100, budgetAllowsCall: async (next) => next === 1 });
  assert.equal(paused.status, "BUDGET_PAUSED");
  assert.equal(paused.callsUsed, 1);
  assert.equal(calls.length, 1);
  const controller = new AbortController(); controller.abort();
  const cancelled = await runM5BoundedTask({ context, mode: "STANDARD", assignments: [assignment("GENERATOR", "draft", calls)], userInstruction: "write", materialContext: "source", maxCalls: 1, timeoutSeconds: 20, maxOutputTokens: 100, budgetAllowsCall: async () => true, signal: controller.signal });
  assert.equal(cancelled.status, "CANCELLED");
});

test("runner rejects mode overflow and missing confirmed diagnosis", async () => {
  const overflow = await runM5BoundedTask({ context, mode: "STANDARD", assignments: [assignment("GENERATOR", "a", []), assignment("REVIEWER", "b", []), assignment("VERIFIER", "c", [])], userInstruction: "write", materialContext: "source", maxCalls: 3, timeoutSeconds: 20, maxOutputTokens: 100, budgetAllowsCall: async () => true });
  assert.equal(overflow.status, "FAILED");
  const missing = await runM5BoundedTask({ context: { ...context, confirmedDiagnosisCardId: null }, mode: "STANDARD", assignments: [assignment("GENERATOR", "a", [])], userInstruction: "write", materialContext: "source", maxCalls: 1, timeoutSeconds: 20, maxOutputTokens: 100, budgetAllowsCall: async () => true });
  assert.equal(missing.errorCode, "DIAGNOSIS_CONFIRMATION_REQUIRED");
});

function assignment(role, output, calls) { return { role, credential: "secret", modelKey: `model-${role}`, modelVersion: "v1", provider: { providerKey: `provider-${role}`, async testConnection() { return { ok: true }; }, async execute(request) { calls.push(request); return { providerKey: `provider-${role}`, modelKey: request.modelKey, modelVersion: request.modelVersion, outputText: output, finishReason: "STOP", inputTokens: 1, outputTokens: 1, providerRequestId: null }; } } }; }
function failingAssignment(role) { return { role, credential: "secret", modelKey: "failed", modelVersion: "v1", provider: { providerKey: "failed", async testConnection() { return { ok: false }; }, async execute() { const error = new Error("failed"); error.code = "RATE_LIMITED"; throw error; } } }; }
