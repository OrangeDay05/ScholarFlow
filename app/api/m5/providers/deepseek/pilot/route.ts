import { DeepSeekProviderAdapter } from "@/app/lib/m5-deepseek-provider";
import { activeM5DeepSeekCapabilities } from "@/app/lib/m5-model-capabilities";
import { deepSeekPlatformCredentialStatus, requireDeepSeekPlatformCredential } from "@/app/lib/m5-platform-credentials";
import { M5ProviderError } from "@/app/lib/m5-provider-error";
import { runWithProviderTimeout } from "@/app/lib/m5-provider-adapter";
import { getD1 } from "@/db";
import { recordM5DeepSeekCatalogSync } from "@/db/repositories/m5-model-orchestration";
import { apiError, apiSuccess, isRecord } from "@/app/api/m3/_shared";
import { requireM4Actor } from "@/app/api/m4/_shared";

const SAFE_PROMPT = "请用三句话解释相关性不等于因果关系。";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;
  return apiSuccess({ credential: await deepSeekPlatformCredentialStatus(), models: activeM5DeepSeekCapabilities() });
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;
  let body: unknown;
  try { body = await request.json(); } catch { return apiError(400, "INVALID_JSON", "请求正文必须是有效 JSON。"); }
  if (!isRecord(body) || body.confirmed !== true) return apiError(409, "USER_CONFIRMATION_REQUIRED", "每次 DeepSeek 外部测试都需要用户单独确认。");
  const action = body.action;
  const adapter = new DeepSeekProviderAdapter();
  let credential: string;
  try { credential = requireDeepSeekPlatformCredential(); } catch { return apiError(409, "PLATFORM_CREDENTIAL_UNAVAILABLE", "服务器尚未配置 DeepSeek 平台凭据。"); }
  try {
    if (action === "list_models") {
      const ids = await runWithProviderTimeout(20, (signal) => adapter.listModels(credential, signal));
      const controlled = new Set(activeM5DeepSeekCapabilities().map((item) => item.modelId));
      const syncedAt = await recordM5DeepSeekCatalogSync(ids, null);
      return apiSuccess({ provider: "DEEPSEEK", models: ids.map((modelId) => ({ modelId, lifecycleStatus: controlled.has(modelId) ? "ACTIVE" : "DISCOVERED" })), syncedAt });
    }
    if (action !== "completion") return apiError(400, "INVALID_ACTION", "仅支持模型目录或单次安全完成测试。");
    const modelId = typeof body.model_id === "string" ? body.model_id : "";
    const thinkingMode = body.thinking_mode === "ENABLED" ? "ENABLED" : body.thinking_mode === "DISABLED" ? "DISABLED" : null;
    const reasoningEffort = thinkingMode === "ENABLED" && (body.reasoning_effort === "HIGH" || body.reasoning_effort === "MAX") ? body.reasoning_effort : null;
    if (!modelId || !thinkingMode || thinkingMode === "ENABLED" && !reasoningEffort) return apiError(400, "INVALID_CONFIGURATION", "请选择明确模型、思考模式和受支持的推理强度。");
    const result = await runWithProviderTimeout(30, (signal) => adapter.createCompletion({
      requestId: crypto.randomUUID(), modelKey: modelId, modelVersion: "deepseek-v4-2026-07-24", taskRole: "GENERATOR",
      messages: [{ role: "user", content: SAFE_PROMPT }], maxOutputTokens: 96, timeoutSeconds: 30,
      inference: { thinkingMode, reasoningEffort, maxOutputTokens: 96, responseFormat: "TEXT", timeoutMs: 30_000, streaming: false, tools: [] },
      metadata: { purpose: "admin-safe-pilot" },
    }, credential, signal));
    return apiSuccess({ provider: result.providerKey, modelId: result.modelKey, content: result.outputText, finishReason: result.finishReason, usage: result.usage, reasoningAudit: result.reasoningAudit, providerRequestId: result.providerRequestId, estimatedCost: null, costNote: "价格目录未确认前不估算费用。" });
  } catch (error) {
    if (error instanceof M5ProviderError) return apiError(error.retryable ? 503 : 400, error.code, error.safeMessage);
    return apiError(500, "DEEPSEEK_PILOT_FAILED", "DeepSeek Pilot 测试失败。");
  }
}

async function requireAdmin(request: Request) {
  const auth = await requireM4Actor(request);
  if ("response" in auth) return auth;
  const row = await getD1().prepare("SELECT role FROM users WHERE id = ? AND status = 'active'").bind(auth.actor.userId).first<{ role: string }>();
  return row?.role === "admin" ? auth : { response: apiError(403, "ADMIN_REQUIRED", "该测试入口仅对管理员开放。") };
}
