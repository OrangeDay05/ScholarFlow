import { getMaterialStorageAdapter } from "@/app/lib/storage/storage-adapter";
import {
  listM5ChunksForActor,
  listM5ParseRunsForActor,
  M5MaterialParseRepositoryError,
  parseM5MaterialForActor,
} from "@/db/repositories/m5-material-parsing";
import { apiError, apiSuccess } from "../../../../../../m3/_shared";
import { requireM4Actor } from "../../../../../../m4/_shared";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string; materialId: string }> },
) {
  const auth = await requireM4Actor(request);
  if ("response" in auth) return auth.response;
  const { projectId, materialId } = await params;
  try {
    const parseRunId = new URL(request.url).searchParams.get("parseRunId");
    return apiSuccess(
      parseRunId
        ? await listM5ChunksForActor(auth.actor, projectId, materialId, parseRunId)
        : await listM5ParseRunsForActor(auth.actor, projectId, materialId),
    );
  } catch (error) {
    return parseError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; materialId: string }> },
) {
  const auth = await requireM4Actor(request);
  if ("response" in auth) return auth.response;
  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() ?? "";
  if (!/^[a-zA-Z0-9:_-]{8,128}$/u.test(idempotencyKey)) {
    return apiError(400, "INVALID_IDEMPOTENCY_KEY", "Idempotency-Key 必须为 8—128 位字母、数字、冒号、下划线或连字符。" );
  }
  const { projectId, materialId } = await params;
  let storage;
  try { storage = getMaterialStorageAdapter(); }
  catch { return apiError(503, "STORAGE_UNAVAILABLE", "本地对象存储未启用或暂不可用。" ); }
  try {
    const result = await parseM5MaterialForActor(auth.actor, projectId, materialId, idempotencyKey, storage);
    return apiSuccess(result, result.replayed ? 200 : 201);
  } catch (error) {
    return parseError(error);
  }
}

function parseError(error: unknown): Response {
  if (error instanceof M5MaterialParseRepositoryError) {
    const status = error.code === "PROJECT_NOT_FOUND" || error.code === "MATERIAL_NOT_FOUND" ? 404 : error.code === "UNSUPPORTED_FORMAT" ? 415 : error.code === "OBJECT_MISSING" || error.code === "OBJECT_NOT_READY" ? 409 : 422;
    return apiError(status, error.code, error.message);
  }
  return apiError(500, "INTERNAL_ERROR", "材料解析失败。" );
}
