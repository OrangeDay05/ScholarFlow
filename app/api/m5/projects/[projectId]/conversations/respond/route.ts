import { DeepSeekProviderAdapter } from "@/app/lib/m5-deepseek-provider";
import { requireDeepSeekPlatformCredential } from "@/app/lib/m5-platform-credentials";
import { M5ProviderError } from "@/app/lib/m5-provider-error";
import { assembleAgentContext } from "@/app/lib/context-engine/context-engine";
import { ContextRetrievalError } from "@/app/lib/context-engine/retrieval";
import type { AgentRole } from "@/app/lib/context-engine/types";
import { buildProjectConversationSystemPrompt } from "@/app/lib/project-conversation-context";
import { conversationSkillInstruction } from "@/app/lib/m5-conversation-skill-instructions";
import type { M5ProductSkill } from "@/app/lib/m5-execution-contracts";
import {
  appendM5ConversationMessage,
  M5ConversationRepositoryError,
} from "@/db/repositories/m5-conversations";
import {
  attachM5ProviderRunContextSnapshot,
  confirmM5TaskModelSelection,
  finishM5ProviderRun,
  loadM5ActiveAgentRoleConfig,
  M5ModelOrchestrationError,
  startM5ProviderRun,
} from "@/db/repositories/m5-model-orchestration";
import { loadProjectAccessContext } from "@/db/repositories/m10-project-context";
import { createAgentHandoff } from "@/db/repositories/context-engine";
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
  const authorizedMaterialIds = stringArray(body.authorizedMaterialIds);
  const productSkill = productSkillValue(body.productSkill);
  const contextRole = roleForProductSkill(productSkill);
  const currentSectionSlug = currentSectionSlugValue(body.workspaceContext);
  if (!sessionId || !clientMessageId || !clientAgentMessageId || !content) {
    return invalidRequest();
  }

  const projectId = (await params).projectId;
  let providerRunId: string | null = null;
  try {
    const projectContext = await loadProjectAccessContext(auth.actor, projectId);
    if (!projectContext.canEdit) {
      return apiError(403, "PROJECT_EDIT_FORBIDDEN", "当前身份仅可审核，不能创建作者修改对话任务。");
    }
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
    if (contextRole !== "CONVERSATION_AGENT") {
      await createAgentHandoff(auth.actor, projectId, {
        conversationSessionId: sessionId,
        fromAgentRole: "CONVERSATION_AGENT",
        toAgentRole: contextRole,
        goal: content,
        confirmedInputs: [{ type: "USER_REQUEST", content }],
        relevantDecisions: [{ type: "TASK_INTENT", value: productSkill }],
        recommendedMaterialIds: authorizedMaterialIds,
      });
    }
    const assembledContext = await assembleAgentContext({
      actor: auth.actor,
      projectId,
      conversationSessionId: sessionId,
      providerRunId,
      agentRole: contextRole,
      taskIntent: productSkill ?? "PROJECT_CONVERSATION",
      query: content,
      currentSectionSlug,
      authorizedMaterialIds,
      provider: config.providerKey,
      model: config.modelKey,
      baseSystemPrompt: [
        buildProjectConversationSystemPrompt({
          projectId: projectContext.projectId,
          projectTitle: projectContext.projectTitle,
          role: projectContext.role,
        }),
        conversationSkillInstruction(productSkill),
      ].filter(Boolean).join("\n\n"),
    });
    await attachM5ProviderRunContextSnapshot(auth.actor, projectId, {
      runId: providerRunId,
      contextSnapshotId: assembledContext.snapshot.id,
    });

    const adapter = new DeepSeekProviderAdapter();
    const inactivitySeconds = Math.max(30, Math.min(600, Math.ceil(config.inference.timeoutMs / 1_000)));
    const result = await runWithProviderActivityTimeout(inactivitySeconds, request.signal, (signal, onActivity) =>
      adapter.streamCompletion(
        {
          requestId: crypto.randomUUID(),
          modelKey: config.modelKey,
          modelVersion: config.capabilityVersion,
          taskRole: "CONVERSATION_AGENT",
          messages: assembledContext.messages,
          maxOutputTokens: config.inference.maxOutputTokens,
          timeoutSeconds: inactivitySeconds,
          inference: config.inference,
          metadata: {
            purpose: "project-conversation",
            projectId: projectContext.projectId,
            projectTitle: projectContext.projectTitle,
            conversationSessionId: sessionId,
          },
        },
        credential,
        signal,
        onActivity,
        onActivity,
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
    if (contextRole !== "CONVERSATION_AGENT") {
      await createAgentHandoff(auth.actor, projectId, {
        conversationSessionId: sessionId,
        fromAgentRole: contextRole,
        toAgentRole: "CONVERSATION_AGENT",
        goal: `继续与用户讨论 ${productSkill} 的专业 Agent 结果。`,
        relevantDecisions: [{
          type: "AI_SUGGESTED_RESULT",
          conversationMessageId: agentMessage.message.id,
          status: "TENTATIVE_REQUIRES_USER_CONFIRMATION",
        }],
        artifactRefs: [{ type: "CONVERSATION_MESSAGE", id: agentMessage.message.id }],
        warnings: ["专业 Agent 结果不是 Project Truth；用户确认前不得写入正式事实。"],
        recommendedMaterialIds: assembledContext.snapshot.authorizedMaterialIds,
      });
    }
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
      contextSnapshot: assembledContext.snapshot,
      materialScope: assembledContext.snapshot.items
        .filter((item) => item.itemType === "RETRIEVED_CHUNK" && item.included)
        .map((item) => ({
          materialId: item.materialId,
          filename: item.filename,
          chunkId: item.materialChunkId,
          location: item.location,
        })),
    });
  } catch (error) {
    console.error("M5 conversation response failure", error);
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
    if (error instanceof ContextRetrievalError) {
      const status = error.code === "MATERIAL_SELECTION_REQUIRED" ? 409 : 422;
      return apiError(status, error.code, error.message);
    }
    return apiError(500, "CONVERSATION_RESPONSE_FAILED", "对话生成失败，用户消息已安全保留。 ");
  }
}

async function runWithProviderActivityTimeout<T>(
  inactivitySeconds: number,
  requestSignal: AbortSignal,
  operation: (signal: AbortSignal, onActivity: () => void) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onActivity = () => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(), inactivitySeconds * 1_000);
  };
  const onRequestAbort = () => controller.abort();
  requestSignal.addEventListener("abort", onRequestAbort, { once: true });
  onActivity();
  try {
    return await operation(controller.signal, onActivity);
  } finally {
    clearTimeout(timer);
    requestSignal.removeEventListener("abort", onRequestAbort);
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

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === "string" && safeId.test(item)))]
    : [];
}

function currentSectionSlugValue(value: unknown): string | null {
  return isRecord(value) ? textValue(value.sectionSlug, 1, 300) : null;
}

function productSkillValue(value: unknown): M5ProductSkill | null {
  return typeof value === "string" && [
    "project_diagnosis_outline", "literature_summary_matrix", "chapter_writing",
    "general_revision", "consistency_check", "citation_evidence_check",
  ].includes(value) ? value as M5ProductSkill : null;
}

function roleForProductSkill(productSkill: M5ProductSkill | null): AgentRole {
  switch (productSkill) {
    case "project_diagnosis_outline": return "RESEARCH_PLANNER";
    case "literature_summary_matrix": return "RETRIEVER_EVIDENCE";
    case "chapter_writing":
    case "general_revision": return "WRITER";
    case "consistency_check": return "REVIEWER";
    case "citation_evidence_check": return "VERIFIER";
    default: return "CONVERSATION_AGENT";
  }
}

function invalidRequest() {
  return apiError(400, "INVALID_REQUEST", "对话请求字段无效或超出长度限制。 ");
}
