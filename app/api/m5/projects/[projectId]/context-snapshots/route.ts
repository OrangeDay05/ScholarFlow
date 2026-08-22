import { loadContextSnapshot, loadLatestConversationContextSnapshot } from "@/db/repositories/context-engine";
import { apiError, apiSuccess } from "../../../../m3/_shared";
import { requireM4Actor } from "../../../../m4/_shared";

const safeId = /^[a-zA-Z0-9:_-]{8,128}$/u;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await requireM4Actor(request);
  if ("response" in auth) return auth.response;
  const projectId = (await params).projectId;
  const url = new URL(request.url);
  const snapshotId = safeValue(url.searchParams.get("snapshotId"));
  const conversationSessionId = safeValue(url.searchParams.get("conversationSessionId"));
  if (!snapshotId && !conversationSessionId) {
    return apiError(400, "CONTEXT_SCOPE_REQUIRED", "请指定上下文快照或会话。");
  }
  try {
    const snapshot = snapshotId
      ? await loadContextSnapshot(auth.actor, projectId, snapshotId)
      : await loadLatestConversationContextSnapshot(auth.actor, projectId, conversationSessionId!);
    return apiSuccess({ snapshot });
  } catch (error) {
    const code = error instanceof Error ? error.message : "CONTEXT_SNAPSHOT_LOAD_FAILED";
    return apiError(code.endsWith("NOT_FOUND") ? 404 : 500, code, "无法读取本轮上下文快照。");
  }
}

function safeValue(value: string | null): string | null {
  return value && safeId.test(value) ? value : null;
}
