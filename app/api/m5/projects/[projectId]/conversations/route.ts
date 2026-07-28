import {
  M5_PRODUCT_SKILLS,
  type M5ProductSkill,
} from "@/app/lib/m5-execution-contracts";
import {
  appendM5ConversationMessage,
  archiveM5Conversation,
  createM5ConversationForActor,
  createM5ConversationSummary,
  loadM5ConversationWorkspace,
  M5ConversationRepositoryError,
} from "@/db/repositories/m5-conversations";
import { apiError, apiSuccess, isRecord } from "../../../../m3/_shared";
import { requireM4Actor } from "../../../../m4/_shared";

const safeId = /^[a-zA-Z0-9:_-]{8,128}$/u;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await requireM4Actor(request);
  if ("response" in auth) return auth.response;
  try {
    const sessionId = new URL(request.url).searchParams.get("session_id")?.trim();
    return apiSuccess(
      await loadM5ConversationWorkspace(
        auth.actor,
        (await params).projectId,
        sessionId || undefined,
      ),
    );
  } catch (error) {
    return conversationError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await requireM4Actor(request);
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => null);
  if (!isRecord(body) || typeof body.action !== "string") {
    return apiError(400, "INVALID_REQUEST", "请求必须包含有效的 action。");
  }
  const projectId = (await params).projectId;
  try {
    switch (body.action) {
      case "create_session": {
        const title = limitedText(body.title, 1, 120);
        const idempotencyKey = idValue(body.idempotencyKey);
        const activeProductSkill = optionalSkill(body.activeProductSkill);
        if (!title || !idempotencyKey || activeProductSkill === undefined) {
          return invalidInput();
        }
        const result = await createM5ConversationForActor(auth.actor, projectId, {
          title,
          activeProductSkill,
          idempotencyKey,
        });
        return apiSuccess(result, result.replayed ? 200 : 201);
      }
      case "append_message": {
        const sessionId = idValue(body.sessionId);
        const clientMessageId = idValue(body.clientMessageId);
        const content = limitedText(body.content, 1, 20_000);
        const role = body.role === "USER" || body.role === "AGENT" ? body.role : null;
        if (!sessionId || !clientMessageId || !content || !role) return invalidInput();
        const result = await appendM5ConversationMessage(
          auth.actor,
          projectId,
          sessionId,
          { clientMessageId, role, content },
        );
        return apiSuccess(result, result.replayed ? 200 : 201);
      }
      case "create_summary": {
        const sessionId = idValue(body.sessionId);
        const clientSummaryId = idValue(body.clientSummaryId);
        const text = limitedText(body.text, 1, 8_000);
        const rawSourceMessageIds = Array.isArray(body.sourceMessageIds)
          ? body.sourceMessageIds
          : [];
        const sourceMessageIds = rawSourceMessageIds
          .map(idValue)
          .filter((id): id is string => Boolean(id));
        if (
          !sessionId ||
          !clientSummaryId ||
          !text ||
          sourceMessageIds.length !== rawSourceMessageIds.length ||
          sourceMessageIds.length === 0 ||
          sourceMessageIds.length > 100
        ) {
          return invalidInput();
        }
        const result = await createM5ConversationSummary(
          auth.actor,
          projectId,
          sessionId,
          { clientSummaryId, text, sourceMessageIds },
        );
        return apiSuccess(result, result.replayed ? 200 : 201);
      }
      case "archive_session": {
        const sessionId = idValue(body.sessionId);
        if (!sessionId) return invalidInput();
        return apiSuccess(
          await archiveM5Conversation(auth.actor, projectId, sessionId),
        );
      }
      default:
        return apiError(400, "INVALID_ACTION", "不支持的会话操作。");
    }
  } catch (error) {
    return conversationError(error);
  }
}

function optionalSkill(value: unknown): M5ProductSkill | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "string" &&
    M5_PRODUCT_SKILLS.includes(value as M5ProductSkill)
    ? (value as M5ProductSkill)
    : undefined;
}

function idValue(value: unknown): string | null {
  return typeof value === "string" && safeId.test(value.trim())
    ? value.trim()
    : null;
}

function limitedText(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length >= min && text.length <= max ? text : null;
}

function invalidInput(): Response {
  return apiError(400, "INVALID_REQUEST", "会话请求字段无效或超出长度限制。");
}

function conversationError(error: unknown): Response {
  if (error instanceof M5ConversationRepositoryError) {
    const status =
      error.code === "PROJECT_NOT_FOUND" || error.code === "CONVERSATION_NOT_FOUND"
        ? 404
        : error.code === "CONVERSATION_ARCHIVED" ||
            error.code === "INVALID_SUMMARY_SOURCE"
          ? 409
          : 500;
    return apiError(status, error.code, error.message);
  }
  console.error("M5 conversation persistence failure", error);
  return apiError(500, "M5_CONVERSATION_FAILURE", "会话持久化操作失败。");
}
