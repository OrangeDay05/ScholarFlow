import { M5_AGENT_ROLES, type M5AgentRole, type M5InferenceConfiguration } from "@/app/lib/m5-model-capabilities";
import { confirmM5TaskModelSelection, loadM5ModelOrchestration, M5ModelOrchestrationError, saveM5AgentRoleConfig } from "@/db/repositories/m5-model-orchestration";
import { apiError, apiSuccess, isRecord } from "../../../../m3/_shared";
import { requireM4Actor } from "../../../../m4/_shared";

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) { const auth = await requireM4Actor(request); if ("response" in auth) return auth.response; try { return apiSuccess(await loadM5ModelOrchestration(auth.actor, (await params).projectId)); } catch (error) { return handled(error); } }

export async function PUT(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const auth = await requireM4Actor(request); if ("response" in auth) return auth.response; let body: unknown; try { body = await request.json(); } catch { return apiError(400, "INVALID_JSON", "请求正文必须是有效 JSON。"); }
  if (!isRecord(body) || hasSecret(body)) return apiError(400, "PLAINTEXT_KEY_REJECTED", "模型配置不接收 API Key 或明文 Secret。");
  const projectId = (await params).projectId;
  try {
    if (body.action === "save_role_config") {
      const parsed = parseSelection(body); if (!parsed) return apiError(400, "INVALID_CONFIGURATION", "角色模型配置不完整或不受支持。");
      return apiSuccess(await saveM5AgentRoleConfig(auth.actor, projectId, parsed), 201);
    }
    if (body.action === "confirm_task_selection") {
      const parsed = parseSelection(body); if (!parsed || body.confirmed_by_user !== true) return apiError(409, "USER_CONFIRMATION_REQUIRED", "正式任务模型配置必须由用户明确确认。");
      const catalog = await loadM5ModelOrchestration(auth.actor, projectId); const model = catalog.capabilities.find((item) => item.model_key === parsed.modelId);
      if (!model) return apiError(400, "MODEL_NOT_FOUND", "模型不在受控目录中。");
      return apiSuccess(await confirmM5TaskModelSelection(auth.actor, projectId, { taskId: stringOrNull(body.task_id), conversationSessionId: stringOrNull(body.conversation_session_id), selection: { provider: "DEEPSEEK", providerModelId: String(model.model_id), modelId: parsed.modelId, agentRole: parsed.agentRole, credentialType: parsed.credentialType, credentialReference: parsed.credentialReference, inference: parsed.inference, pricingVersion: "deepseek-2026-07-24-usd-1m", confirmedByUser: true } }), 201);
    }
    return apiError(400, "INVALID_ACTION", "不支持的模型编排操作。");
  } catch (error) { return handled(error); }
}

function parseSelection(body: Record<string, unknown>): { agentRole: M5AgentRole; modelId: string; credentialType: "PLATFORM_CREDENTIAL" | "USER_CREDENTIAL"; credentialReference: string; inference: M5InferenceConfiguration; perTurnBudget: number; toolsAllowed: boolean; fallbackConfigId: string | null } | null {
  const role = body.agent_role; const modelId = body.model_id; const thinkingMode = body.thinking_mode; const effort = body.reasoning_effort; const max = body.max_output_tokens; const timeout = body.timeout_ms; const budget = body.per_turn_budget; const credentialType = body.credential_type; const credentialReference = body.credential_reference;
  if (typeof role !== "string" || !M5_AGENT_ROLES.includes(role as M5AgentRole) || typeof modelId !== "string" || !["DISABLED", "ENABLED"].includes(String(thinkingMode)) || thinkingMode === "DISABLED" && effort !== null || thinkingMode === "ENABLED" && !["HIGH", "MAX"].includes(String(effort)) || !Number.isSafeInteger(max) || !Number.isSafeInteger(timeout) || !Number.isSafeInteger(budget) || !["PLATFORM_CREDENTIAL", "USER_CREDENTIAL"].includes(String(credentialType)) || typeof credentialReference !== "string") return null;
  return { agentRole: role as M5AgentRole, modelId, credentialType: credentialType as "PLATFORM_CREDENTIAL" | "USER_CREDENTIAL", credentialReference, inference: { thinkingMode: thinkingMode as "DISABLED" | "ENABLED", reasoningEffort: effort as "HIGH" | "MAX" | null, maxOutputTokens: max as number, responseFormat: body.response_format === "JSON" ? "JSON" : "TEXT", timeoutMs: timeout as number, streaming: body.streaming === true, tools: [] }, perTurnBudget: budget as number, toolsAllowed: body.tools_allowed === true, fallbackConfigId: stringOrNull(body.fallback_config_id) };
}
function hasSecret(body: Record<string, unknown>) { return ["api_key", "apiKey", "key", "secret", "plaintext"].some((key) => key in body); }
function stringOrNull(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function handled(error: unknown) { return error instanceof M5ModelOrchestrationError ? apiError(error.code.endsWith("NOT_FOUND") ? 404 : 409, error.code, error.message) : apiError(500, "MODEL_ORCHESTRATION_FAILED", "模型编排操作失败。"); }
