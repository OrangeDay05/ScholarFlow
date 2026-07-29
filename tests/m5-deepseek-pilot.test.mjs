import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DeepSeekProviderAdapter, validateM5ToolArguments } from "../app/lib/m5-deepseek-provider.ts";
import { activeM5DeepSeekCapabilities, requireM5ModelCapability, validateM5ModelConfiguration } from "../app/lib/m5-model-capabilities.ts";
import { M5ProviderError } from "../app/lib/m5-provider-error.ts";
import { createDefaultProviderAdapters } from "../app/lib/m5-openai-compatible-provider.ts";
import { resolveM5TaskModelSelection } from "../app/lib/m5-model-resolution.ts";

const baseInference = { thinkingMode: "DISABLED", reasoningEffort: null, maxOutputTokens: 96, temperature: 0.3, topP: 0.8, presencePenalty: 0.1, frequencyPenalty: 0.2, responseFormat: "TEXT", timeoutMs: 30_000, streaming: false, tools: [] };
const request = (overrides = {}) => ({ requestId: "run-1", modelKey: "deepseek-v4-flash", modelVersion: "deepseek-v4-2026-07-24", taskRole: "GENERATOR", messages: [{ role: "user", content: "safe prompt" }], maxOutputTokens: 96, timeoutSeconds: 30, inference: baseInference, ...overrides });

test("catalog exposes v4 models and retires legacy aliases", () => {
  assert.deepEqual(activeM5DeepSeekCapabilities().map((item) => item.modelId), ["deepseek-v4-flash", "deepseek-v4-pro"]);
  assert.equal(requireM5ModelCapability("DEEPSEEK", "deepseek-chat").lifecycleStatus, "RETIRED");
  assert.equal(requireM5ModelCapability("DEEPSEEK", "deepseek-chat").deprecatedAt, "2026-07-24T00:00:00.000Z");
  assert.equal(validateM5ModelConfiguration(requireM5ModelCapability("DEEPSEEK", "deepseek-reasoner"), baseInference).code, "MODEL_RETIRED");
});

test("disabled thinking sends sampling parameters and no effort", async () => {
  let sent;
  const adapter = adapterWith(async (_url, init) => { sent = JSON.parse(init.body); return completion({ content: "ok" }); });
  await adapter.createCompletion(request(), "secret", AbortSignal.timeout(1000));
  assert.deepEqual(sent.thinking, { type: "disabled" });
  assert.equal(sent.reasoning_effort, undefined);
  assert.equal(sent.temperature, 0.3);
  assert.equal(sent.top_p, 0.8);
});

test("thinking HIGH and MAX are explicit and strip sampling parameters", async () => {
  for (const effort of ["HIGH", "MAX"]) {
    let sent;
    const adapter = adapterWith(async (_url, init) => { sent = JSON.parse(init.body); return completion({ content: "ok", reasoning_content: "private" }); });
    const result = await adapter.createCompletion(request({ inference: { ...baseInference, thinkingMode: "ENABLED", reasoningEffort: effort } }), "secret", AbortSignal.timeout(1000));
    assert.deepEqual(sent.thinking, { type: "enabled" });
    assert.equal(sent.reasoning_effort, effort.toLowerCase());
    for (const key of ["temperature", "top_p", "presence_penalty", "frequency_penalty"]) assert.equal(sent[key], undefined);
    assert.equal(result.outputText, "ok");
    assert.deepEqual(result.reasoningAudit, { produced: true, characters: 7, toolCallNames: [] });
    assert.equal(JSON.stringify(result).includes("private"), false);
  }
});

test("unsupported effort is rejected without calling provider", async () => {
  let calls = 0;
  const adapter = adapterWith(async () => { calls += 1; return completion({ content: "bad" }); });
  await assert.rejects(() => adapter.createCompletion(request({ inference: { ...baseInference, thinkingMode: "ENABLED", reasoningEffort: "MEDIUM" } }), "secret", AbortSignal.timeout(1000)), (error) => error instanceof M5ProviderError && error.code === "MODEL_CONFIGURATION_UNSUPPORTED");
  assert.equal(calls, 0);
});

test("JSON output and tools are mapped through the adapter", async () => {
  let sent;
  const toolCall = { id: "call-1", type: "function", function: { name: "lookup", arguments: '{"id":"a"}' } };
  const adapter = adapterWith(async (_url, init) => { sent = JSON.parse(init.body); return completion({ content: null, tool_calls: [toolCall] }, "tool_calls"); });
  const result = await adapter.createCompletion(request({ inference: { ...baseInference, responseFormat: "JSON", tools: [{ name: "lookup", description: "lookup", inputSchema: { type: "object" } }] }, tools: [{ type: "function", function: { name: "lookup", description: "lookup", parameters: { type: "object" } } }], toolChoice: "auto" }), "secret", AbortSignal.timeout(1000));
  assert.deepEqual(sent.response_format, { type: "json_object" });
  assert.equal(sent.tools.length, 1);
  assert.equal(result.toolCalls[0].function.name, "lookup");
});

test("thinking tool continuity keeps reasoning only in transient adapter state", async () => {
  const bodies = [];
  let turn = 0;
  const adapter = adapterWith(async (_url, init) => {
    bodies.push(JSON.parse(init.body)); turn += 1;
    return turn === 1
      ? completion({ content: null, reasoning_content: "hidden-chain", tool_calls: [{ id: "call-1", type: "function", function: { name: "lookup", arguments: '{"id":"a"}' } }] }, "tool_calls")
      : completion({ content: "final" });
  });
  const thinking = request({ inference: { ...baseInference, thinkingMode: "ENABLED", reasoningEffort: "HIGH" } });
  const first = await adapter.createCompletion(thinking, "secret", AbortSignal.timeout(1000));
  assert.equal(JSON.stringify(first).includes("hidden-chain"), false);
  const final = await adapter.continueToolRun(thinking, [{ toolCallId: "call-1", content: "safe result" }], "secret", AbortSignal.timeout(1000));
  assert.equal(final.outputText, "final");
  assert.equal(bodies[1].messages.at(-2).reasoning_content, "hidden-chain");
  await assert.rejects(() => adapter.continueToolRun(thinking, [{ toolCallId: "call-1", content: "again" }], "secret", AbortSignal.timeout(1000)), /临时上下文/u);
});

test("streaming exposes content deltas but not reasoning deltas", async () => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({ start(controller) { controller.enqueue(encoder.encode('data: {"id":"r","choices":[{"delta":{"reasoning_content":"hidden"}}]}\n\ndata: {"choices":[{"delta":{"content":"visible"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n')); controller.close(); } });
  const adapter = adapterWith(async () => new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } }));
  const deltas = [];
  const result = await adapter.streamCompletion(request({ inference: { ...baseInference, streaming: true } }), "secret", AbortSignal.timeout(1000), (delta) => deltas.push(delta));
  assert.deepEqual(deltas, ["visible"]);
  assert.equal(result.outputText, "visible");
  assert.equal(result.reasoningAudit.characters, 6);
  assert.equal(JSON.stringify(result).includes("hidden"), false);
});

test("tool arguments must be valid JSON and contain required fields", () => {
  const tool = { inputSchema: { required: ["id"] } };
  assert.deepEqual(validateM5ToolArguments(tool, '{"id":"a"}'), { id: "a" });
  assert.throws(() => validateM5ToolArguments(tool, "no"), /有效 JSON/u);
  assert.throws(() => validateM5ToolArguments(tool, "{}"), /必需字段/u);
});

test("provider errors are normalized without raw body or credential", async () => {
  const adapter = adapterWith(async () => new Response('{"error":"upstream secret key-value"}', { status: 401, headers: { "x-request-id": "req-safe" } }));
  await assert.rejects(() => adapter.createCompletion(request(), "key-value", AbortSignal.timeout(1000)), (error) => error instanceof M5ProviderError && error.code === "AUTHENTICATION_FAILED" && error.requestId === "req-safe" && !JSON.stringify(error).includes("key-value") && !error.message.includes("upstream secret"));
});

test("formal task selection requires confirmation and freezes resolved capability", () => {
  const selection = { provider: "DEEPSEEK", providerModelId: "model-v4-flash", modelId: "deepseek-v4-flash", agentRole: "REVIEWER", credentialType: "PLATFORM_CREDENTIAL", credentialReference: "env://DEEPSEEK_API_KEY", inference: { ...baseInference, thinkingMode: "ENABLED", reasoningEffort: "HIGH" }, pricingVersion: null, confirmedByUser: false };
  assert.throws(() => resolveM5TaskModelSelection(selection), /用户确认/u);
  const resolved = resolveM5TaskModelSelection({ ...selection, confirmedByUser: true });
  assert.equal(resolved.capabilityVersion, "deepseek-v4-2026-07-24");
  assert.equal(resolved.reasoningEffort, "HIGH");
});

test("default registry uses dedicated DeepSeek adapter", () => {
  const adapters = createDefaultProviderAdapters(async () => Response.json({ data: [] }));
  assert.equal(adapters.find((item) => item.providerKey === "deepseek") instanceof DeepSeekProviderAdapter, true);
});

test("0015 migration is additive and secrets stay server-only", async () => {
  const migration = await readFile(new URL("../drizzle/0015_talented_justice.sql", import.meta.url), "utf8");
  for (const table of ["model_capability_versions", "provider_catalog_syncs", "agent_role_model_configs", "resolved_model_config_snapshots", "model_pricing_versions", "provider_run_records"]) assert.ok(migration.includes(`CREATE TABLE \`${table}\``));
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM/iu);
  const route = await readFile(new URL("../app/api/m5/providers/deepseek/pilot/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(route, /localStorage|sessionStorage|api_key|console\./iu);
  assert.match(route, /USER_CONFIRMATION_REQUIRED/u);
});

test("orchestration API is authenticated, owner-scoped and only accepts secret references", async () => {
  const route = await readFile(new URL("../app/api/m5/projects/[projectId]/model-orchestration/route.ts", import.meta.url), "utf8");
  const repository = await readFile(new URL("../db/repositories/m5-model-orchestration.ts", import.meta.url), "utf8");
  assert.match(route, /requireM4Actor/u);
  assert.match(route, /PLAINTEXT_KEY_REJECTED/u);
  assert.match(repository, /owner_user_id = \? AND project_id = \?/u);
  assert.match(repository, /vault-ref\|db-secret/u);
  assert.doesNotMatch(`${route}\n${repository}`, /localStorage|sessionStorage|Authorization:/u);
});

function adapterWith(fetcher) { return new DeepSeekProviderAdapter({ fetcher }); }
function completion(message, finishReason = "stop") { return Response.json({ id: "req-1", choices: [{ message, finish_reason: finishReason }], usage: { prompt_tokens: 4, completion_tokens: 3, completion_tokens_details: { reasoning_tokens: 2 } } }); }
