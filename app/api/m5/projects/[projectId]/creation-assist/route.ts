import { DeepSeekProviderAdapter } from "@/app/lib/m5-deepseek-provider";
import { activeM5DeepSeekCapabilities } from "@/app/lib/m5-model-capabilities";
import { requireDeepSeekPlatformCredential } from "@/app/lib/m5-platform-credentials";
import { M5ProviderError } from "@/app/lib/m5-provider-error";
import { runWithProviderTimeout } from "@/app/lib/m5-provider-adapter";
import { getD1 } from "@/db";
import { apiError, apiSuccess, isRecord } from "@/app/api/m3/_shared";
import { requireM4Actor } from "@/app/api/m4/_shared";

const creationMethods = new Set(["idea", "existing_draft", "requirements", "literature", "data"]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await requireM4Actor(request);
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => null);
  if (!isRecord(body) || body.confirmed !== true) {
    return apiError(409, "USER_CONFIRMATION_REQUIRED", "请先确认允许 AI 读取本次已解析材料。");
  }
  const creationMethod = text(body.creationMethod);
  const materialIds = stringArray(body.materialIds);
  if (!creationMethods.has(creationMethod) || materialIds.length === 0) {
    return apiError(400, "INVALID_CREATION_ASSIST", "创建方式或授权材料列表无效。");
  }
  const projectId = (await params).projectId;
  const db = getD1();
  const project = await db.prepare(
    "SELECT id FROM projects WHERE id = ? AND owner_user_id = ? AND status = 'active'",
  ).bind(projectId, auth.actor.userId).first<{ id: string }>();
  if (!project) return apiError(404, "PROJECT_NOT_FOUND", "项目不存在或不属于当前用户。");

  const placeholders = materialIds.map(() => "?").join(",");
  const chunks = await db.prepare(`SELECT mc.material_id, mc.ordinal, mc.text
    FROM material_chunks mc
    JOIN materials m ON m.id = mc.material_id AND m.owner_user_id = mc.owner_user_id AND m.project_id = mc.project_id
    WHERE mc.owner_user_id = ? AND mc.project_id = ? AND mc.material_id IN (${placeholders})
      AND m.status = 'success'
      AND mc.parse_run_id = (
        SELECT pr.id FROM material_parse_runs pr
        WHERE pr.owner_user_id = mc.owner_user_id AND pr.project_id = mc.project_id
          AND pr.material_id = mc.material_id AND pr.status = 'SUCCEEDED'
        ORDER BY pr.created_at DESC LIMIT 1
      )
    ORDER BY mc.material_id, mc.ordinal LIMIT 80`)
    .bind(auth.actor.userId, projectId, ...materialIds)
    .all<{ material_id: string; ordinal: number; text: string }>();
  const excerpt = (chunks.results ?? [])
    .map((chunk) => `[material=${chunk.material_id} chunk=${chunk.ordinal}]\n${chunk.text}`)
    .join("\n\n")
    .slice(0, 60_000);
  if (!excerpt.trim()) return apiError(409, "NO_PARSED_CONTENT", "授权材料尚无可供 AI 读取的解析正文。");

  let credential: string;
  try {
    credential = requireDeepSeekPlatformCredential();
  } catch {
    return apiError(409, "PLATFORM_CREDENTIAL_UNAVAILABLE", "服务器尚未配置默认 DeepSeek 平台凭据。");
  }
  const capability = activeM5DeepSeekCapabilities().find((item) => item.modelId === "deepseek-v4-flash")
    ?? activeM5DeepSeekCapabilities()[0];
  if (!capability) return apiError(409, "MODEL_NOT_FOUND", "默认 DeepSeek 模型不可用。");

  try {
    const adapter = new DeepSeekProviderAdapter();
    const result = await runWithProviderTimeout(120, (signal) => adapter.createCompletion({
      requestId: crypto.randomUUID(),
      modelKey: capability.modelId,
      modelVersion: capability.capabilityVersion,
      taskRole: "GENERATOR",
      messages: [
        {
          role: "system",
          content: "你只从用户授权的材料中提取项目创建信息。不得把文件名当作题目，不得编造研究结果、来源或事实。只返回 JSON。",
        },
        {
          role: "user",
          content: `创建方式：${creationMethod}\n当前填写：${JSON.stringify(body.currentValues ?? {})}\n\n请返回 projectTitle、materialsSummary、firstAiHelp 三个字符串字段。projectTitle 应来自正文主题；materialsSummary 概括已有材料；firstAiHelp 说明最合理的首个 AI 协助任务。每项不超过 300 字。\n\n授权材料正文：\n${excerpt}`,
        },
      ],
      maxOutputTokens: 800,
      timeoutSeconds: 120,
      inference: {
        thinkingMode: "DISABLED",
        reasoningEffort: null,
        maxOutputTokens: 800,
        responseFormat: "JSON",
        timeoutMs: 120_000,
        streaming: false,
        tools: [],
      },
      metadata: { purpose: "creation-material-candidate", projectId, materialIds },
    }, credential, signal));
    const candidate = candidateValue(result.outputText);
    if (!candidate) return apiError(502, "INVALID_PROVIDER_RESPONSE", "AI 没有返回有效的创建信息候选。");
    return apiSuccess({
      candidate,
      status: "PENDING_USER_CONFIRMATION",
      sourceMaterialIds: materialIds,
      model: capability.modelId,
    });
  } catch (error) {
    if (error instanceof M5ProviderError) return apiError(error.retryable ? 503 : 400, error.code, error.safeMessage);
    return apiError(500, "CREATION_ASSIST_FAILED", "AI 创建信息候选生成失败。");
  }
}

function candidateValue(raw: string) {
  const normalized = raw.trim().replace(/^```(?:json)?\s*/u, "").replace(/\s*```$/u, "");
  let value: unknown;
  try {
    value = JSON.parse(normalized) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  const projectTitle = text(value.projectTitle).slice(0, 300);
  const materialsSummary = text(value.materialsSummary).slice(0, 600);
  const firstAiHelp = text(value.firstAiHelp).slice(0, 600);
  return projectTitle && materialsSummary && firstAiHelp
    ? { projectTitle, materialsSummary, firstAiHelp }
    : null;
}

function stringArray(value: unknown) {
  if (!Array.isArray(value) || value.length > 20) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && /^[a-zA-Z0-9-]{8,128}$/u.test(item)))];
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
