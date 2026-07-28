import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { decryptCredential, encryptCredential, maskCredential } from "../app/lib/credential-vault.ts";
import { OpenAiCompatibleProviderAdapter, M5ProviderError } from "../app/lib/m5-openai-compatible-provider.ts";
import { buildM5SkillProviderRequest } from "../app/lib/m5-skill-adapters.ts";

const masterKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));

test("credential vault encrypts with owner-bound AES-GCM and never returns plaintext metadata", async () => {
  const encrypted = await encryptCredential("sk-secret-example", masterKey, "user-a", "credential-a");
  assert.equal(encrypted.algorithm, "AES-GCM-256");
  assert.doesNotMatch(JSON.stringify(encrypted), /sk-secret-example/u);
  assert.equal(await decryptCredential(encrypted, masterKey, "user-a", "credential-a"), "sk-secret-example");
  await assert.rejects(() => decryptCredential(encrypted, masterKey, "user-b", "credential-a"), /归属/u);
  assert.equal(maskCredential("sk-secret-example"), "sk-****mple");
});

test("OpenAI-compatible adapter normalizes success and does not leak credentials", async () => {
  const requests = [];
  const adapter = new OpenAiCompatibleProviderAdapter({ providerKey: "openai", baseUrl: "https://provider.test/v1", fetcher: async (url, init) => {
    requests.push({ url, init });
    if (String(url).endsWith("/models")) return Response.json({ data: [{ id: "gpt-test" }] });
    return Response.json({ id: "req-1", choices: [{ message: { content: "result" }, finish_reason: "stop" }], usage: { prompt_tokens: 3, completion_tokens: 2 } });
  } });
  const connection = await adapter.testConnection("gpt-test", "secret-value", AbortSignal.timeout(1000));
  assert.equal(connection.ok, true);
  const result = await adapter.execute({ requestId: "run-1", modelKey: "gpt-test", modelVersion: "v1", taskRole: "GENERATOR", messages: [{ role: "user", content: "write" }], maxOutputTokens: 20, timeoutSeconds: 20 }, "secret-value", AbortSignal.timeout(1000));
  assert.equal(result.outputText, "result");
  assert.equal(result.finishReason, "STOP");
  assert.equal(JSON.stringify(result).includes("secret-value"), false);
  assert.equal(requests.length, 2);
});

test("Provider errors are unified and do not include provider response bodies", async () => {
  const adapter = new OpenAiCompatibleProviderAdapter({ providerKey: "deepseek", baseUrl: "https://provider.test", fetcher: async () => new Response('{"message":"secret upstream detail"}', { status: 401 }) });
  await assert.rejects(
    () => adapter.execute({ requestId: "r", modelKey: "m", modelVersion: "v", taskRole: "GENERATOR", messages: [], maxOutputTokens: 1, timeoutSeconds: 10 }, "key-value", AbortSignal.timeout(1000)),
    (error) => error instanceof M5ProviderError && error.code === "AUTHENTICATION_FAILED" && !error.message.includes("secret upstream detail"),
  );
});

test("all six skills share one provider request contract and evidence boundary", () => {
  const skills = ["project_diagnosis_outline", "literature_summary_matrix", "chapter_writing", "general_revision", "consistency_check", "citation_evidence_check"];
  for (const productSkill of skills) {
    const request = buildM5SkillProviderRequest({ context: { runId: `run-${productSkill}`, ownerUserId: "user", projectId: "project", productSkill, language: "zh", paperType: "course", requestedOperation: "test", confirmedDiagnosisCardId: "diagnosis", projectRequirementIds: [], authorizedMaterialIds: ["material"], chapterId: null, modelConfigId: "config", externalSearchEnabled: false }, modelKey: "model", modelVersion: "v1", taskRole: "GENERATOR", userInstruction: "instruction", materialContext: "source", timeoutSeconds: 30, maxOutputTokens: 100 });
    assert.equal(request.messages.length, 2);
    assert.match(request.messages[0].content, /来源|事实/u);
  }
});

test("0010 is additive and creates a separate encrypted secret table", async () => {
  const migration = await readFile(new URL("../drizzle/0010_curved_leo.sql", import.meta.url), "utf8");
  assert.match(migration, /CREATE TABLE `credential_secrets`/u);
  assert.match(migration, /`ciphertext` text NOT NULL/u);
  assert.match(migration, /`initialization_vector` text NOT NULL/u);
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM|ALTER TABLE/iu);
  const route = await readFile(new URL("../app/api/m5/projects/[projectId]/credentials/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(route, /console\.|logger|localStorage|sessionStorage/iu);
});
