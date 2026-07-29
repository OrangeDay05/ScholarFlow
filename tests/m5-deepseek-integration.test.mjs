import assert from "node:assert/strict";
import test from "node:test";
import { DeepSeekProviderAdapter } from "../app/lib/m5-deepseek-provider.ts";

const enabled = process.env.RUN_DEEPSEEK_INTEGRATION_TESTS === "true";

test("DeepSeek real pilot uses exactly one explicitly selected safe configuration", { skip: !enabled }, async () => {
  const credential = process.env.DEEPSEEK_API_KEY;
  const modelKey = process.env.DEEPSEEK_TEST_MODEL;
  const thinkingMode = process.env.DEEPSEEK_TEST_THINKING;
  const reasoningEffort = process.env.DEEPSEEK_TEST_EFFORT;
  assert.ok(credential, "DEEPSEEK_API_KEY is required when integration tests are enabled");
  assert.ok(["deepseek-v4-flash", "deepseek-v4-pro"].includes(modelKey), "choose one current model explicitly");
  assert.ok(["DISABLED", "ENABLED"].includes(thinkingMode), "choose one thinking mode explicitly");
  if (thinkingMode === "ENABLED") assert.ok(["HIGH", "MAX"].includes(reasoningEffort), "choose HIGH or MAX explicitly");
  const result = await new DeepSeekProviderAdapter().createCompletion({
    requestId: crypto.randomUUID(), modelKey, modelVersion: "deepseek-v4-2026-07-24", taskRole: "GENERATOR",
    messages: [{ role: "user", content: "请用三句话解释相关性不等于因果关系。" }], maxOutputTokens: 96, timeoutSeconds: 30,
    inference: { thinkingMode, reasoningEffort: thinkingMode === "ENABLED" ? reasoningEffort : null, maxOutputTokens: 96, responseFormat: "TEXT", timeoutMs: 30_000, streaming: false, tools: [] },
  }, credential, AbortSignal.timeout(30_000));
  assert.ok(result.outputText);
  assert.equal(JSON.stringify(result).includes(credential), false);
});
