import { createM6DocxExport, M6ExportError } from "@/db/repositories/m6-exports";
import { apiError, apiSuccess, isRecord } from "../../../../m3/_shared";
import { requireM4Actor } from "../../../../m4/_shared";

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const auth = await requireM4Actor(request); if ("response" in auth) return auth.response;
  let body: unknown; try { body = await request.json(); } catch { return apiError(400, "INVALID_JSON", "请求正文必须是有效 JSON。"); }
  if (!isRecord(body) || body.format !== "docx" || !Array.isArray(body.version_ids) || !body.version_ids.every((item) => typeof item === "string")) return apiError(400, "INVALID_EXPORT", "当前仅支持选择章节版本导出 DOCX。");
  try { return apiSuccess(await createM6DocxExport(auth.actor, (await params).projectId, body.version_ids), 201); }
  catch (error) { if (error instanceof M6ExportError) return apiError(error.code.endsWith("NOT_FOUND") ? 404 : error.code === "STORAGE_FAILED" ? 503 : 409, error.code, error.message); return apiError(500, "EXPORT_FAILED", "DOCX 导出失败。"); }
}
