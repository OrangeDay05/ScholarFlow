import { DeepSeekProviderAdapter } from "@/app/lib/m5-deepseek-provider";
import { requireDeepSeekPlatformCredential } from "@/app/lib/m5-platform-credentials";
import { M5ProviderError } from "@/app/lib/m5-provider-error";
import { runWithProviderTimeout } from "@/app/lib/m5-provider-adapter";
import {
  appendM5ConversationMessage,
  loadM5ConversationWorkspace,
  M5ConversationRepositoryError,
} from "@/db/repositories/m5-conversations";
import {
  confirmM5TaskModelSelection,
  finishM5ProviderRun,
  loadM5ActiveAgentRoleConfig,
  M5ModelOrchestrationError,
  startM5ProviderRun,
} from "@/db/repositories/m5-model-orchestration";
import { apiError, apiSuccess, isRecord } from "../../../../../m3/_shared";
import { requireM4Actor } from "../../../../../m4/_shared";

const safeId = /^[a-zA-Z0-9:_-]{8,128}$/u;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await requireM4Actor(request);
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => null);
  if (!isRecord(body)) return invalidRequest();
  const sessionId = idValue(body.sessionId);
  const clientMessageId = idValue(body.clientMessageId);
  const clientAgentMessageId = idValue(body.clientAgentMessageId);
  const content = textValue(body.content, 1, 12_000);
  if (!sessionId || !clientMessageId || !clientAgentMessageId || !content) {
    return invalidRequest();
  }

  const projectId = (await params).projectId;
  let providerRunId: string | null = null;
  try {
    const config = await loadM5ActiveAgentRoleConfig(
      auth.actor,
      projectId,
      "CONVERSATION_AGENT",
    );
    if (!config) {
      return apiError(
        409,
        "CONVERSATION_MODEL_NOT_CONFIGURED",
        "请先在“模型与 API”中配置当前项目的对话 Agent。",
      );
    }
    if (
      config.providerKey !== "deepseek" ||
      config.credentialType !== "PLATFORM_CREDENTIAL" ||
      config.credentialReference !== "env://DEEPSEEK_API_KEY"
    ) {
      return apiError(
        409,
        "CREDENTIAL_RESOLVER_UNAVAILABLE",
        "当前对话配置尚无可用的服务器凭据解析器。",
      );
    }
    if (config.perTurnBudget <= 0) {
      return apiError(409, "BUDGET_PAUSED", "当前对话 Agent 的单轮预算为零，未调用模型。");
    }

    let credential: string;
    try {
      credential = requireDeepSeekPlatformCredential();
    } catch {
      return apiError(
        409,
        "PLATFORM_CREDENTIAL_UNAVAILABLE",
        "服务器尚未配置 DeepSeek 平台凭据。",
      );
    }

    await appendM5ConversationMessage(auth.actor, projectId, sessionId, {
      clientMessageId,
      role: "USER",
      content,
    });
    const workspace = await loadM5ConversationWorkspace(
      auth.actor,
      projectId,
      sessionId,
      { messageLimit: 24 },
    );
    const snapshot = await confirmM5TaskModelSelection(auth.actor, projectId, {
      taskId: null,
      conversationSessionId: sessionId,
      selection: {
        provider: "DEEPSEEK",
        providerModelId: config.providerModelId,
        modelId: config.modelKey,
        agentRole: "CONVERSATION_AGENT",
        credentialType: config.credentialType,
        credentialReference: config.credentialReference,
        inference: config.inference,
        pricingVersion: "deepseek-2026-07-24-usd-1m",
        confirmedByUser: true,
      },
    });
    const providerRun = await startM5ProviderRun(auth.actor, projectId, {
      snapshotId: snapshot.id,
      usageCategory: "CONVERSATION_AGENT",
    });
    providerRunId = providerRun.id;

    const adapter = new DeepSeekProviderAdapter();
    const timeoutSeconds = Math.max(
      1,
      Math.min(600, Math.ceil(config.inference.timeoutMs / 1_000)),
    );
    const result = await runWithProviderTimeout(timeoutSeconds, (signal) =>
      adapter.createCompletion(
        {
          requestId: crypto.randomUUID(),
          modelKey: config.modelKey,
          modelVersion: config.capabilityVersion,
          taskRole: "CONVERSATION_AGENT",
          messages: [
            {
              role: "system",
              content:
                "你是科研项目对话 Agent。只依据用户在当前会话中明确提供的内容回答；不得编造材料、数据、引用或研究结果。需要修改项目或运行 Skill 时，只提出操作建议并等待用户确认。不要输出隐藏推理过程。",
            },
            ...workspace.messages.slice(-16).map((message) => ({
              role: message.role === "USER" ? ("user" as const) : ("assistant" as const),
              content: message.content,
            })),
          ],
          maxOutputTokens: config.inference.maxOutputTokens,
          timeoutSeconds,
          inference: config.inference,
          metadata: {
            purpose: "project-conversation",
            projectId: config.projectId,
            conversationSessionId: sessionId,
          },
        },
        credential,
        signal,
      ),
    );

    const agentMessage = await appendM5ConversationMessage(
      auth.actor,
      projectId,
      sessionId,
      {
        clientMessageId: clientAgentMessageId,
        role: "AGENT",
        content: result.outputText,
      },
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
      toolCallNames: result.reasoningAudit?.toolCallNames,
      finishReason: result.finishReason,
      providerRequestId: result.providerRequestId,
      retryable: result.retryable,
    });
    return apiSuccess({
      message: agentMessage.message,
      model: {
        provider: result.providerKey,
        model: result.modelKey,
        finishReason: result.finishReason,
      },
      materialScope: [],
    });
  } catch (error) {
    if (providerRunId) {
      await finishM5ProviderRun(auth.actor, projectId, {
        runId: providerRunId,
        status: "FAILED",
        errorCode:
          error instanceof M5ProviderError ? error.code : "CONVERSATION_RESPONSE_FAILED",
        retryable: error instanceof M5ProviderError ? error.retryable : false,
      }).catch(() => undefined);
    }
    if (error instanceof M5ProviderError) {
      return apiError(error.retryable ? 503 : 400, error.code, error.safeMessage);
    }
    if (error instanceof M5ConversationRepositoryError) {
      const status = error.code.endsWith("NOT_FOUND") ? 404 : 409;
      return apiError(status, error.code, error.message);
    }
    if (error instanceof M5ModelOrchestrationError) {
      return apiError(error.code.endsWith("NOT_FOUND") ? 404 : 409, error.code, error.message);
    }
    return apiError(500, "CONVERSATION_RESPONSE_FAILED", "对话生成失败，用户消息已安全保留。 ");
  }
}

function idValue(value: unknown): string | null {
  return typeof value === "string" && safeId.test(value.trim()) ? value.trim() : null;
}

function textValue(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length >= min && text.length <= max ? text : null;
}

function invalidRequest() {
  return apiError(400, "INVALID_REQUEST", "对话请求字段无效或超出长度限制。 ");
}
