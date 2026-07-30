import { exportM9Presentation, M9PresentationError, markM9PresentationOpenVerified } from "@/db/repositories/m9-presentations";
import { apiError, apiSuccess, isRecord } from "../../../../m3/_shared";
import { requireM4Actor } from "../../../../m4/_shared";

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const auth = await requireM4Actor(request); if ("response" in auth) return auth.response;
  let body: unknown; try { body = await request.json(); } catch { return apiError(400, "INVALID_JSON", "请求正文必须是有效 JSON。"); }
  if (!isRecord(body) || typeof body.action !== "string") return apiError(400, "INVALID_ACTION", "PPTX 操作无效。");
  const projectId = (await params).projectId;
  try {
    if (body.action === "export") { const versionId = text(body.presentation_version_id); return versionId ? apiSuccess(await exportM9Presentation(auth.actor, projectId, versionId), 201) : apiError(400, "INVALID_INPUT", "缺少 PPT 版本。"); }
    if (body.action === "mark_open_verified") { const exportId = text(body.export_id); if (!exportId) return apiError(400, "INVALID_INPUT", "缺少导出 ID。"); await markM9PresentationOpenVerified(auth.actor, projectId, exportId); return apiSuccess({ exportId, status: "OPEN_VERIFIED" }); }
    return apiError(400, "INVALID_ACTION", "不支持的 PPTX 操作。");
  } catch (error) { return handle(error); }
}
function text(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function handle(error: unknown) { if (error instanceof M9PresentationError) { const status = error.code.endsWith("NOT_FOUND") ? 404 : error.code === "RUNNER_UNAVAILABLE" ? 503 : 400; return apiError(status, error.code, error.message); } return apiError(500, "PRESENTATION_EXPORT_FAILED", "PPTX 导出失败。"); }
