import {
  inspectMaterialFile,
  MaterialUploadValidationError,
  MAX_MATERIAL_UPLOAD_BYTES,
  sha256Hex,
} from "@/app/lib/material-upload-security";
import { getMaterialStorageAdapter } from "@/app/lib/storage/storage-adapter";
import {
  listM5MaterialObjectsForActor,
  M5MaterialUploadRepositoryError,
  storeM5MaterialForActor,
  type M5MaterialKind,
} from "@/db/repositories/m5-material-uploads";
import { apiError, apiSuccess } from "../../../../m3/_shared";
import { requireM4Actor } from "../../../../m4/_shared";

const MAX_MULTIPART_OVERHEAD_BYTES = 1024 * 1024;
const allowedKinds = new Set<M5MaterialKind>([
  "requirement",
  "manuscript",
  "literature",
  "data",
  "image",
  "note",
]);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await requireM4Actor(request);
  if ("response" in auth) return auth.response;
  try {
    return apiSuccess(
      await listM5MaterialObjectsForActor(auth.actor, (await params).projectId),
    );
  } catch (error) {
    return uploadError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await requireM4Actor(request);
  if ("response" in auth) return auth.response;

  const declaredLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_MATERIAL_UPLOAD_BYTES + MAX_MULTIPART_OVERHEAD_BYTES
  ) {
    return apiError(413, "FILE_TOO_LARGE", "上传请求超过 25 MB 文件上限。");
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) {
    return apiError(400, "FILE_REQUIRED", "请使用 multipart/form-data 上传文件。");
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError(400, "FILE_REQUIRED", "无法读取上传文件。");
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return apiError(400, "FILE_REQUIRED", "请选择需要上传的文件。");
  }
  if (file.size === 0) return apiError(400, "FILE_EMPTY", "文件内容为空。");
  if (file.size > MAX_MATERIAL_UPLOAD_BYTES) {
    return apiError(413, "FILE_TOO_LARGE", "单个文件不得超过 25 MB。");
  }
  const kindValue = stringValue(form.get("kind"));
  const kind = allowedKinds.has(kindValue as M5MaterialKind)
    ? (kindValue as M5MaterialKind)
    : inferKind(file.name);
  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() ?? "";
  if (!/^[a-zA-Z0-9:_-]{8,128}$/u.test(idempotencyKey)) {
    return apiError(
      400,
      "INVALID_IDEMPOTENCY_KEY",
      "Idempotency-Key 必须为 8—128 位字母、数字、冒号、下划线或连字符。",
    );
  }

  let body: ArrayBuffer;
  try {
    body = await file.arrayBuffer();
  } catch {
    return apiError(400, "UPLOAD_CANCELLED", "上传已取消或文件读取失败。");
  }
  if (request.signal.aborted) {
    return apiError(400, "UPLOAD_CANCELLED", "上传已取消。");
  }

  try {
    const inspected = inspectMaterialFile({
      filename: file.name,
      clientContentType: file.type,
      bytes: new Uint8Array(body),
    });
    const contentHash = await sha256Hex(new Uint8Array(body));
    let storage;
    try {
      storage = getMaterialStorageAdapter();
    } catch {
      return apiError(
        503,
        "STORAGE_UNAVAILABLE",
        "本地对象存储未启用或暂不可用。",
      );
    }
    const result = await storeM5MaterialForActor(
      auth.actor,
      (await params).projectId,
      {
        kind,
        originalFilename: inspected.originalFilename,
        normalizedFilename: inspected.normalizedFilename,
        detectedExtension: inspected.extension,
        clientContentType: file.type,
        detectedContentType: inspected.detectedContentType,
        sizeBytes: file.size,
        contentHash,
        body,
        idempotencyKey,
      },
      storage,
    );
    return apiSuccess(result, result.replayed ? 200 : 201);
  } catch (error) {
    return uploadError(error);
  }
}

function uploadError(error: unknown): Response {
  if (error instanceof MaterialUploadValidationError) {
    return apiError(
      error.code === "FILE_TOO_LARGE" ? 413 : 400,
      error.code,
      error.message,
    );
  }
  if (error instanceof M5MaterialUploadRepositoryError) {
    const status =
      error.code === "PROJECT_NOT_FOUND"
        ? 404
        : error.code === "STORAGE_UNAVAILABLE"
          ? 503
          : 500;
    return apiError(status, error.code, error.message);
  }
  return apiError(500, "INTERNAL_ERROR", "上传处理失败。");
}

function inferKind(filename: string): M5MaterialKind {
  const extension = filename.split(".").pop()?.toLowerCase();
  if (["jpg", "jpeg", "png"].includes(extension ?? "")) return "image";
  if (["csv", "xlsx"].includes(extension ?? "")) return "data";
  if (["bib", "bibtex", "ris", "pdf"].includes(extension ?? "")) {
    return "literature";
  }
  if (extension === "docx") return "manuscript";
  return "note";
}

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}
