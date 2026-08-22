import type { M6HeadingPrefixStyle } from "@/app/lib/m6-docx";
import { createM6DocxExport, deleteM6SectionVersion, loadM6ExportWorkspace, M6ExportError } from "@/db/repositories/m6-exports";
import { apiError, apiSuccess, isRecord } from "../../../../m3/_shared";
import { requireM4Actor } from "../../../../m4/_shared";

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const auth = await requireM4Actor(request); if ("response" in auth) return auth.response;
  try { return apiSuccess(await loadM6ExportWorkspace(auth.actor, (await params).projectId)); }
  catch (error) { if (error instanceof M6ExportError) return apiError(404, error.code, error.message); return apiError(500, "EXPORT_WORKSPACE_FAILED", "DOCX 导出信息读取失败。"); }
}

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const auth = await requireM4Actor(request); if ("response" in auth) return auth.response;
  let body: unknown; try { body = await request.json(); } catch { return apiError(400, "INVALID_JSON", "请求正文必须是有效 JSON。"); }
  if (!isRecord(body) || body.format !== "docx" || !Array.isArray(body.version_ids) || !body.version_ids.every((item) => typeof item === "string")) return apiError(400, "INVALID_EXPORT", "当前仅支持选择章节版本导出 DOCX。");
  const headingPrefixStyle = body.heading_prefix_style ?? "none";
  if (!isHeadingPrefixStyle(headingPrefixStyle)) return apiError(400, "INVALID_HEADING_PREFIX", "章节标题编号方式无效。");
  try { return apiSuccess(await createM6DocxExport(auth.actor, (await params).projectId, body.version_ids, undefined, headingPrefixStyle), 201); }
  catch (error) { if (error instanceof M6ExportError) return apiError(error.code.endsWith("NOT_FOUND") ? 404 : error.code === "STORAGE_FAILED" ? 503 : 409, error.code, error.message); return apiError(500, "EXPORT_FAILED", "DOCX 导出失败。"); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const auth = await requireM4Actor(request); if ("response" in auth) return auth.response;
  let body: unknown; try { body = await request.json(); } catch { return apiError(400, "INVALID_JSON", "请求正文必须是有效 JSON。"); }
  if (!isRecord(body) || typeof body.version_id !== "string" || !body.version_id) return apiError(400, "INVALID_VERSION", "请指定要删除的历史章节版本。");
  try { return apiSuccess(await deleteM6SectionVersion(auth.actor, (await params).projectId, body.version_id)); }
  catch (error) { if (error instanceof M6ExportError) return apiError(error.code.endsWith("NOT_FOUND") ? 404 : 409, error.code, error.message); return apiError(500, "VERSION_DELETE_FAILED", "历史章节版本删除失败。"); }
}

function isHeadingPrefixStyle(value: unknown): value is M6HeadingPrefixStyle {
  return value === "none" || value === "chinese_dunhao" || value === "arabic_dunhao" || value === "arabic_dot";
}
