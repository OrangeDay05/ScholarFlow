import { buildM5SkillProviderRequest } from "@/app/lib/m5-skill-adapters";
import { DeepSeekProviderAdapter } from "@/app/lib/m5-deepseek-provider";
import { deepSeekPlatformBaseUrl, requireDeepSeekPlatformCredential } from "@/app/lib/m5-platform-credentials";
import { runWithProviderTimeout } from "@/app/lib/m5-provider-adapter";
import { M5ProviderError } from "@/app/lib/m5-provider-error";
import {
  createAndClaimM5ActionTask,
  decideM5Candidate,
  loadM5ActionExecutionContext,
  loadM5ActionExecutionWorkspace,
  loadM5AuthorizedMaterialContext,
  M5ActionExecutionError,
} from "@/db/repositories/m5-action-executions";
import {
  confirmM5TaskModelSelection,
  finishM5ProviderRun,
  loadM5ActiveAgentRoleConfig,
  M5ModelOrchestrationError,
  startM5ProviderRun,
} from "@/db/repositories/m5-model-orchestration";
import { persistM5TaskOutcome } from "@/db/repositories/m5-task-results";
import { apiError, apiSuccess, isRecord } from "../../../../../../m3/_shared";
import { requireM4Actor } from "../../../../../../m4/_shared";

const safeId = /^[a-zA-Z0-9:_-]{8,128}$/u;

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const auth = await requireM4Actor(request);
  if ("response" in auth) return auth.response;
  const url = new URL(request.url);
  const sessionId = idValue(url.searchParams.get("session_id"));
  const proposalId = idValue(url.searchParams.get("proposal_id"));
  if (!sessionId || !proposalId) return invalidRequest();
  try {
    return apiSuccess(await loadM5ActionExecutionWorkspace(auth.actor, (await params).projectId, sessionId, proposalId));
  } catch (error) {
    return handledError(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const auth = await requireM4Actor(request);
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => null);
  if (!isRecord(body)) return invalidRequest();
  const action = body.action;
  const sessionId = idValue(body.conversationSessionId);
  const proposalId = idValue(body.proposalId);
  if (!sessionId || !proposalId) return invalidRequest();
  const projectId = (await params).projectId;
  if (action === "reject_candidate" || action === "adopt_candidate") {
    const idempotencyKey = idValue(body.idempotencyKey);
    if (!idempotencyKey) return invalidRequest();
    try {
      return apiSuccess(await decideM5Candidate(auth.actor, projectId, sessionId, proposalId, action === "adopt_candidate" ? "ADOPT" : "REJECT", idempotencyKey));
    } catch (error) {
      return handledError(error);
    }
  }
  if (action !== "execute" || body.confirmedExecution !== true) {
    return apiError(409, "EXECUTION_CONFIRMATION_REQUIRED", "必须在页面明确确认本次配置后才能调用模型。");
  }

  let taskId: string | null = null;
  let providerRunId: string | null = null;
  let callStarted = false;
  try {
    const context = await loadM5ActionExecutionContext(auth.actor, projectId, sessionId, proposalId);
    if (context.productSkill !== "general_revision") {
      return apiError(409, "UNSUPPORTED_EXECUTION_SKILL", "本验收闭环只允许执行“通用改稿”。");
    }
    const config = await loadM5ActiveAgentRoleConfig(auth.actor, projectId, "REVISER");
    if (!config) return apiError(409, "REVISER_MODEL_NOT_CONFIGURED", "请先配置当前项目的 Reviser 模型。");
    if (config.providerKey !== "deepseek" || config.credentialType !== "PLATFORM_CREDENTIAL" || config.credentialReference !== "env://DEEPSEEK_API_KEY") {
      return apiError(409, "CREDENTIAL_RESOLVER_UNAVAILABLE", "本验收闭环只接受服务器 DeepSeek 平台凭据。");
    }
    if (config.perTurnBudget <= 0) return apiError(409, "BUDGET_PAUSED", "当前 Reviser 单次预算为零，未调用模型。");
    if (!matchesConfirmedConfig(body, config)) {
      return apiError(409, "MODEL_CONFIGURATION_CHANGED", "页面确认的配置与服务器当前配置不一致，请刷新后重新确认。");
    }
    const credential = requireDeepSeekPlatformCredential();
    const timeoutSeconds = Math.max(10, Math.min(600, Math.ceil(config.inference.timeoutMs / 1_000)));
    taskId = await createAndClaimM5ActionTask(auth.actor, projectId, context, {
      providerKey: config.providerKey,
      providerModelId: config.providerModelId,
      modelKey: config.modelKey,
      modelVersion: config.capabilityVersion,
      timeoutSeconds,
    });
    const snapshot = await confirmM5TaskModelSelection(auth.actor, projectId, {
      taskId,
      conversationSessionId: sessionId,
      selection: {
        provider: "DEEPSEEK",
        providerModelId: config.providerModelId,
        modelId: config.modelKey,
        agentRole: "REVISER",
        credentialType: config.credentialType,
        credentialReference: config.credentialReference,
        inference: config.inference,
        pricingVersion: "deepseek-2026-07-24-usd-1m",
        confirmedByUser: true,
      },
    });
    providerRunId = (await startM5ProviderRun(auth.actor, projectId, { snapshotId: snapshot.id, usageCategory: "ACTION_PROPOSAL_REVISION" })).id;
    const materialContext = await loadM5AuthorizedMaterialContext(auth.actor, context);
    const requestPayload = buildM5SkillProviderRequest({
      context: {
        runId: providerRunId,
        ownerUserId: auth.actor.userId,
        projectId: context.projectId,
        productSkill: "general_revision",
        language: "zh",
        paperType: "academic",
        requestedOperation: context.operation,
        confirmedDiagnosisCardId: null,
        projectRequirementIds: [],
        authorizedMaterialIds: context.authorizedMaterialIds,
        chapterId: context.sectionId,
        modelConfigId: config.id,
        externalSearchEnabled: false,
      },
      modelKey: config.modelKey,
      modelVersion: config.capabilityVersion,
      taskRole: "REVISER",
      userInstruction: `${context.operation}\n\n基础章节（只读）：\n${context.baseContent}\n\n不得修改：${context.excludedScope ?? "未明确要求修改的事实、数据、术语和引用"}`,
      materialContext,
      timeoutSeconds,
      maxOutputTokens: config.inference.maxOutputTokens,
    });
    callStarted = true;
    const result = await runWithProviderTimeout(timeoutSeconds, (signal) =>
      new DeepSeekProviderAdapter({ baseUrl: deepSeekPlatformBaseUrl() }).createCompletion({ ...requestPayload, inference: config.inference }, credential, signal),
    );
    await finishM5ProviderRun(auth.actor, projectId, {
      runId: providerRunId,
      status: "SUCCEEDED",
      promptTokens: result.usage?.promptTokens,
      cacheHitTokens: result.usage?.cacheHitTokens,
      cacheMissTokens: result.usage?.cacheMissTokens,
      completionTokens: result.usage?.completionTokens,
      reasoningTokens: result.usage?.reasoningTokens,
      reasoningContentProduced: result.reasoningAudit?.produced,
      reasoningContentCharacters: result.reasoningAudit?.characters,
      finishReason: result.finishReason,
      providerRequestId: result.providerRequestId,
      retryable: false,
    });
    await persistM5TaskOutcome(auth.actor, projectId, taskId, {
      status: "SUCCEEDED",
      callsUsed: 1,
      artifacts: [{ role: "REVISER", result, artifactType: "REVISION_CANDIDATE" }],
      stopReason: "单次 Reviser 调用完成；候选版本等待用户采用或拒绝。",
      errorCode: null,
    });
    return apiSuccess(await loadM5ActionExecutionWorkspace(auth.actor, projectId, sessionId, proposalId));
  } catch (error) {
    if (providerRunId) {
      await finishM5ProviderRun(auth.actor, projectId, {
        runId: providerRunId,
        status: "FAILED",
        errorCode: error instanceof M5ProviderError ? error.code : "ACTION_EXECUTION_FAILED",
        retryable: error instanceof M5ProviderError ? error.retryable : false,
      }).catch(() => undefined);
    }
    if (taskId) {
      await persistM5TaskOutcome(auth.actor, projectId, taskId, {
        status: "FAILED",
        callsUsed: callStarted ? 1 : 0,
        artifacts: [],
        stopReason: "候选版本生成失败；基础版本未修改。",
        errorCode: error instanceof M5ProviderError ? error.code : "ACTION_EXECUTION_FAILED",
      }).catch(() => undefined);
    }
    return handledError(error);
  }
}

function matchesConfirmedConfig(body: Record<string, unknown>, config: Awaited<ReturnType<typeof loadM5ActiveAgentRoleConfig>> & {}) {
  return body.configId === config.id && body.provider === "DEEPSEEK" && body.model === config.modelKey && body.agentRole === "REVISER" && body.thinkingMode === config.inference.thinkingMode && (body.reasoningEffort ?? null) === config.inference.reasoningEffort && body.maxOutputTokens === config.inference.maxOutputTokens && body.budget === config.perTurnBudget && body.expectedCalls === 1;
}

function idValue(value: unknown): string | null {
  return typeof value === "string" && safeId.test(value.trim()) ? value.trim() : null;
}

function handledError(error: unknown) {
  if (error instanceof M5ProviderError) return apiError(error.retryable ? 503 : 409, error.code, error.safeMessage);
  if (error instanceof M5ActionExecutionError || error instanceof M5ModelOrchestrationError) {
    return apiError(error.code.endsWith("NOT_FOUND") ? 404 : 409, error.code, error.message);
  }
  return apiError(500, "ACTION_EXECUTION_FAILED", "候选版本生成失败；基础版本和已完成步骤均已保留。");
}

function invalidRequest() {
  return apiError(400, "INVALID_REQUEST", "执行请求字段无效。");
}
