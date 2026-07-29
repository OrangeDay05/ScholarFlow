import type { M3Actor } from "@/app/lib/m3-server-identity";
import type { M5AgentRole, M5InferenceConfiguration } from "@/app/lib/m5-model-capabilities";
import { M5_DEEPSEEK_CAPABILITIES } from "@/app/lib/m5-model-capabilities";
import { resolveM5TaskModelSelection } from "@/app/lib/m5-model-resolution";
import { getD1 } from "../index";

export class M5ModelOrchestrationError extends Error {
  constructor(readonly code: "PROJECT_NOT_FOUND" | "MODEL_NOT_FOUND" | "CONFIG_NOT_FOUND" | "INVALID_CONFIGURATION" | "CONFIRMATION_REQUIRED", message: string) { super(message); }
}

const roleSet = new Set<M5AgentRole>(["CONVERSATION_AGENT", "ROUTER", "GENERATOR", "REVIEWER", "VERIFIER", "REVISER", "AGGREGATOR"]);
const pricing = {
  "deepseek-v4-flash": { hit: "0.0028", miss: "0.14", output: "0.28" },
  "deepseek-v4-pro": { hit: "0.003625", miss: "0.435", output: "0.87" },
} as const;

export async function ensureM5DeepSeekCatalog(db = getD1()) {
  const provider = await db.prepare("SELECT id FROM model_providers WHERE provider_key = 'deepseek'").first<{ id: string }>();
  const providerId = provider?.id ?? "provider-deepseek";
  if (!provider) await db.prepare("INSERT INTO model_providers (id, provider_key, display_name, data_processor_name, status) VALUES (?, 'deepseek', 'DeepSeek', 'DeepSeek', 'AVAILABLE')").bind(providerId).run();
  else await db.prepare("UPDATE model_providers SET display_name = 'DeepSeek', data_processor_name = 'DeepSeek', status = 'AVAILABLE', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(providerId).run();
  const modelIds: Record<string, string> = {};
  for (const capability of M5_DEEPSEEK_CAPABILITIES) {
    const existing = await db.prepare("SELECT id FROM provider_models WHERE provider_id = ? AND model_key = ? ORDER BY created_at DESC LIMIT 1").bind(providerId, capability.modelId).first<{ id: string }>();
    const modelId = existing?.id ?? `model-${capability.modelId}`;
    modelIds[capability.modelId] = modelId;
    const selectable = capability.lifecycleStatus === "ACTIVE";
    if (!existing) await db.prepare("INSERT INTO provider_models (id, provider_id, model_key, display_name, model_version, allowed_roles_json, status) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(modelId, providerId, capability.modelId, capability.modelId, capability.capabilityVersion, JSON.stringify([...roleSet]), selectable ? "AVAILABLE" : "DISABLED").run();
    else await db.prepare("UPDATE provider_models SET model_version = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(capability.capabilityVersion, selectable ? "AVAILABLE" : "DISABLED", modelId).run();
    await db.prepare(`INSERT OR IGNORE INTO model_capability_versions (id, provider_id, model_id, capability_version, supports_thinking, supported_thinking_modes_json, supported_reasoning_efforts_json, supports_streaming, supports_tool_calls, supports_thinking_tool_calls, supports_json_output, supports_vision, context_window, max_output_tokens, supported_parameters_json, ignored_parameters_json, lifecycle_status, deprecated_at, source_updated_at, effective_from) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      `cap-${capability.modelId}-${capability.capabilityVersion}`, providerId, modelId, capability.capabilityVersion, capability.thinking.supported ? 1 : 0, JSON.stringify(capability.thinking.modes), JSON.stringify(capability.thinking.efforts), capability.supportsStreaming ? 1 : 0, capability.supportsToolCalls ? 1 : 0, capability.supportsThinkingToolCalls ? 1 : 0, capability.supportsJsonOutput ? 1 : 0, capability.supportsVision ? 1 : 0, capability.contextWindow, capability.maxOutputTokens, JSON.stringify(capability.supportedParameters), JSON.stringify(capability.ignoredParameters), capability.lifecycleStatus, capability.deprecatedAt, capability.sourceUpdatedAt, capability.sourceUpdatedAt,
    ).run();
    if (selectable) {
      const price = pricing[capability.modelId as keyof typeof pricing];
      await db.prepare(`INSERT OR IGNORE INTO model_pricing_versions (id, provider_id, model_id, pricing_version, input_cache_hit_price, input_cache_miss_price, output_price, currency, unit, effective_from, source_updated_at, status) VALUES (?, ?, ?, 'deepseek-2026-07-24-usd-1m', ?, ?, ?, 'USD', '1M_TOKENS', '2026-07-24T00:00:00.000Z', '2026-07-24T00:00:00.000Z', 'ACTIVE')`).bind(`price-${capability.modelId}-2026-07-24`, providerId, modelId, price.hit, price.miss, price.output).run();
    }
  }
  return { providerId, modelIds };
}

export async function recordM5DeepSeekCatalogSync(modelIds: string[], errorCode: string | null) {
  const db = getD1(); const catalog = await ensureM5DeepSeekCatalog(db); const syncedAt = new Date().toISOString();
  await db.prepare("INSERT INTO provider_catalog_syncs (id, provider_id, status, discovered_model_ids_json, error_code, synced_at) VALUES (?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), catalog.providerId, errorCode ? "FAILED" : "SUCCEEDED", JSON.stringify(modelIds), errorCode, syncedAt).run();
  return syncedAt;
}

export async function loadM5ModelOrchestration(actor: M3Actor, requestedProjectId: string) {
  const db = getD1(); const projectId = await ownedProject(db, actor.userId, requestedProjectId); await ensureM5DeepSeekCatalog(db);
  const [configs, capabilities, prices, lastSync] = await Promise.all([
    db.prepare("SELECT * FROM agent_role_model_configs WHERE owner_user_id = ? AND project_id = ? ORDER BY agent_role, updated_at DESC").bind(actor.userId, projectId).all(),
    db.prepare(`SELECT mc.*, pm.model_key FROM model_capability_versions mc JOIN provider_models pm ON pm.id = mc.model_id ORDER BY pm.model_key`).all(),
    db.prepare(`SELECT mp.*, pm.model_key FROM model_pricing_versions mp JOIN provider_models pm ON pm.id = mp.model_id WHERE mp.status = 'ACTIVE' ORDER BY pm.model_key`).all(),
    db.prepare(`SELECT pcs.status, pcs.discovered_model_ids_json, pcs.error_code, pcs.synced_at FROM provider_catalog_syncs pcs JOIN model_providers p ON p.id = pcs.provider_id WHERE p.provider_key = 'deepseek' ORDER BY pcs.synced_at DESC LIMIT 1`).first(),
  ]);
  return { projectId, configs: configs.results ?? [], capabilities: capabilities.results ?? [], pricing: prices.results ?? [], lastSync: lastSync ?? null };
}

export async function saveM5AgentRoleConfig(actor: M3Actor, requestedProjectId: string, input: { agentRole: M5AgentRole; modelId: string; credentialType: "PLATFORM_CREDENTIAL" | "USER_CREDENTIAL"; credentialReference: string; inference: M5InferenceConfiguration; perTurnBudget: number; toolsAllowed: boolean; fallbackConfigId: string | null }) {
  if (!roleSet.has(input.agentRole) || input.perTurnBudget < 0) throw invalid("Agent 角色或预算无效。");
  const db = getD1(); const projectId = await ownedProject(db, actor.userId, requestedProjectId); const catalog = await ensureM5DeepSeekCatalog(db); const providerModelId = catalog.modelIds[input.modelId];
  if (!providerModelId) throw new M5ModelOrchestrationError("MODEL_NOT_FOUND", "模型不在受控目录中。");
  if (input.credentialType === "PLATFORM_CREDENTIAL" && input.credentialReference !== "env://DEEPSEEK_API_KEY") throw invalid("平台凭据必须引用服务器 Secret。");
  if (input.credentialType === "USER_CREDENTIAL" && !/^(vault-ref|db-secret):\/\/[a-zA-Z0-9._-]+$/u.test(input.credentialReference)) throw invalid("用户凭据只能保存受控 Secret Vault 引用。");
  resolveM5TaskModelSelection({ provider: "DEEPSEEK", providerModelId, modelId: input.modelId, agentRole: input.agentRole, credentialType: input.credentialType, credentialReference: input.credentialReference, inference: input.inference, pricingVersion: "deepseek-2026-07-24-usd-1m", confirmedByUser: true });
  const id = crypto.randomUUID();
  await db.prepare(`INSERT INTO agent_role_model_configs (id, owner_user_id, project_id, agent_role, provider_id, model_id, credential_type, credential_reference, thinking_mode, reasoning_effort, max_output_tokens, timeout_ms, per_turn_budget, tools_allowed, fallback_config_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`).bind(id, actor.userId, projectId, input.agentRole, catalog.providerId, providerModelId, input.credentialType, input.credentialReference, input.inference.thinkingMode, input.inference.reasoningEffort, input.inference.maxOutputTokens, input.inference.timeoutMs, input.perTurnBudget, input.toolsAllowed ? 1 : 0, input.fallbackConfigId).run();
  return { id, projectId };
}

export async function confirmM5TaskModelSelection(actor: M3Actor, requestedProjectId: string, input: { taskId: string | null; conversationSessionId: string | null; selection: Parameters<typeof resolveM5TaskModelSelection>[0] }) {
  if (!input.selection.confirmedByUser) throw new M5ModelOrchestrationError("CONFIRMATION_REQUIRED", "用户确认后才能冻结正式任务配置。");
  const db = getD1(); const projectId = await ownedProject(db, actor.userId, requestedProjectId);
  if (input.taskId) await requireOwnedRecord(db, "ai_tasks", input.taskId, actor.userId, projectId);
  if (input.conversationSessionId) await requireOwnedRecord(db, "conversation_sessions", input.conversationSessionId, actor.userId, projectId);
  const resolved = resolveM5TaskModelSelection(input.selection); const id = crypto.randomUUID(); const confirmedAt = new Date().toISOString();
  await db.prepare(`INSERT INTO resolved_model_config_snapshots (id, owner_user_id, project_id, task_id, conversation_session_id, agent_role, provider, provider_model_id, capability_version, thinking_mode, reasoning_effort, effective_parameters_json, ignored_parameters_json, credential_type, credential_reference, pricing_version, confirmed_by_user, confirmed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`).bind(id, actor.userId, projectId, input.taskId, input.conversationSessionId, resolved.agentRole, resolved.provider, resolved.providerModelId, resolved.capabilityVersion, resolved.thinkingMode, resolved.reasoningEffort, JSON.stringify(resolved.effectiveParameters), JSON.stringify(resolved.ignoredParameters), resolved.credentialType, resolved.credentialReference, resolved.pricingVersion, confirmedAt).run();
  return { id, confirmedAt, resolved };
}

async function ownedProject(db: D1Database, owner: string, requested: string) { const row = requested === "demo" ? await db.prepare("SELECT id FROM projects WHERE owner_user_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1").bind(owner).first<{ id: string }>() : await db.prepare("SELECT id FROM projects WHERE id = ? AND owner_user_id = ? AND status = 'active'").bind(requested, owner).first<{ id: string }>(); if (!row) throw new M5ModelOrchestrationError("PROJECT_NOT_FOUND", "项目不存在或不属于当前用户。"); return row.id; }
async function requireOwnedRecord(db: D1Database, table: "ai_tasks" | "conversation_sessions", id: string, owner: string, project: string) { const row = await db.prepare(`SELECT id FROM ${table} WHERE id = ? AND owner_user_id = ? AND project_id = ?`).bind(id, owner, project).first(); if (!row) throw new M5ModelOrchestrationError("CONFIG_NOT_FOUND", "任务或会话不存在或不属于当前用户。"); }
function invalid(message: string) { return new M5ModelOrchestrationError("INVALID_CONFIGURATION", message); }
