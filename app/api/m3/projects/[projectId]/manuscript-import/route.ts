import { buildManuscriptImportCandidate, confirmManuscriptImport, ManuscriptImportError } from "@/db/repositories/m3-manuscript-import";
import { apiError, apiSuccess, isRecord, repositoryError, requireM3ApiActor } from "../../../_shared";

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const auth = await requireM3ApiActor(request);
  if ("response" in auth) return auth.response;
  const { projectId } = await params;
  const materialId = new URL(request.url).searchParams.get("materialId") ?? undefined;
  try {
    return apiSuccess(await buildManuscriptImportCandidate(auth.actor, projectId, materialId));
  } catch (error) {
    if (error instanceof ManuscriptImportError) return apiError(404, error.code, error.message);
    return repositoryError(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const auth = await requireM3ApiActor(request);
  if ("response" in auth) return auth.response;
  let body: unknown;
  try { body = await request.json(); } catch { return apiError(400, "INVALID_JSON", "请求正文必须是有效 JSON。"); }
  if (!isRecord(body) || typeof body.materialId !== "string" || typeof body.parseRunId !== "string" || !Array.isArray(body.sections)) {
    return apiError(400, "INVALID_IMPORT_CANDIDATE", "章节导入候选参数不完整。");
  }
  const sections: Array<{ sectionId: string; chunkIds: string[] }> = [];
  for (const item of body.sections) {
    if (!isRecord(item) || typeof item.sectionId !== "string" || !Array.isArray(item.chunkIds) || item.chunkIds.some((id) => typeof id !== "string")) {
      return apiError(400, "INVALID_IMPORT_CANDIDATE", "章节与原文片段映射格式无效。");
    }
    sections.push({ sectionId: item.sectionId, chunkIds: item.chunkIds as string[] });
  }
  const { projectId } = await params;
  try {
    return apiSuccess(await confirmManuscriptImport(auth.actor, projectId, { materialId: body.materialId, parseRunId: body.parseRunId, sections }), 201);
  } catch (error) {
    if (error instanceof ManuscriptImportError) return apiError(error.code.endsWith("CHANGED") ? 409 : 422, error.code, error.message);
    return repositoryError(error);
  }
}
