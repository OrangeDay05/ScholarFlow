export const MAX_MATERIAL_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_MATERIAL_FILENAME_LENGTH = 180;

export type MaterialFileType = {
  extension: string;
  detectedContentType: string;
  container: "binary" | "text" | "zip";
};

export type MaterialUploadErrorCode =
  | "FILE_REQUIRED"
  | "FILE_EMPTY"
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_FILE_TYPE"
  | "FILE_TYPE_MISMATCH"
  | "INVALID_FILENAME";

export class MaterialUploadValidationError extends Error {
  readonly code: MaterialUploadErrorCode;

  constructor(code: MaterialUploadErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const allowedMimes: Record<string, Set<string>> = {
  pdf: new Set(["application/pdf", "application/octet-stream"]),
  docx: new Set([
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/zip",
    "application/octet-stream",
  ]),
  txt: new Set(["text/plain", "application/octet-stream"]),
  csv: new Set(["text/csv", "application/vnd.ms-excel", "text/plain", "application/octet-stream"]),
  xlsx: new Set([
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/zip",
    "application/octet-stream",
  ]),
  jpg: new Set(["image/jpeg", "application/octet-stream"]),
  jpeg: new Set(["image/jpeg", "application/octet-stream"]),
  png: new Set(["image/png", "application/octet-stream"]),
  bib: new Set(["application/x-bibtex", "text/plain", "application/octet-stream"]),
  bibtex: new Set(["application/x-bibtex", "text/plain", "application/octet-stream"]),
  ris: new Set(["application/x-research-info-systems", "text/plain", "application/octet-stream"]),
};

export function validateAndNormalizeFilename(filename: string): {
  original: string;
  normalized: string;
  extension: string;
} {
  const original = filename.normalize("NFC").trim();
  if (
    !original ||
    original.length > MAX_MATERIAL_FILENAME_LENGTH ||
    /[\u0000-\u001f\u007f]/u.test(original) ||
    /[\\/]/u.test(original) ||
    original === "." ||
    original === ".."
  ) {
    throw new MaterialUploadValidationError(
      "INVALID_FILENAME",
      "文件名为空、过长或包含路径与控制字符。",
    );
  }
  const dot = original.lastIndexOf(".");
  const extension = dot > 0 ? original.slice(dot + 1).toLowerCase() : "";
  if (!allowedMimes[extension]) {
    throw new MaterialUploadValidationError(
      "UNSUPPORTED_FILE_TYPE",
      "仅支持 PDF、DOCX、TXT、CSV、XLSX、JPG/JPEG、PNG、BibTeX 和 RIS。",
    );
  }
  const stem = original.slice(0, dot).replace(/[^\p{L}\p{N}._ -]/gu, "_").trim();
  return {
    original,
    normalized: `${stem || "material"}.${extension}`,
    extension,
  };
}

export function inspectMaterialFile(input: {
  filename: string;
  clientContentType: string;
  bytes: Uint8Array;
}): MaterialFileType & { originalFilename: string; normalizedFilename: string } {
  const name = validateAndNormalizeFilename(input.filename);
  if (input.bytes.byteLength === 0) {
    throw new MaterialUploadValidationError("FILE_EMPTY", "文件内容为空。");
  }
  if (input.bytes.byteLength > MAX_MATERIAL_UPLOAD_BYTES) {
    throw new MaterialUploadValidationError(
      "FILE_TOO_LARGE",
      `单个文件不得超过 ${MAX_MATERIAL_UPLOAD_BYTES / 1024 / 1024} MB。`,
    );
  }
  const clientType = input.clientContentType.trim().toLowerCase();
  if (clientType && !allowedMimes[name.extension].has(clientType)) {
    throw new MaterialUploadValidationError(
      "FILE_TYPE_MISMATCH",
      "浏览器声明的文件类型与扩展名不一致。",
    );
  }
  if (isExecutable(input.bytes)) {
    throw new MaterialUploadValidationError(
      "UNSUPPORTED_FILE_TYPE",
      "检测到可执行文件特征，上传已拒绝。",
    );
  }
  const detected = detectByContent(name.extension, input.bytes);
  return {
    ...detected,
    originalFilename: name.original,
    normalizedFilename: name.normalized,
  };
}

export function buildMaterialObjectKey(input: {
  ownerUserId: string;
  projectId: string;
  materialId: string;
  objectId: string;
}): string {
  for (const value of Object.values(input)) {
    if (!/^[a-zA-Z0-9-]+$/u.test(value)) {
      throw new Error("Storage key components must be opaque identifiers.");
    }
  }
  return `users/${input.ownerUserId}/projects/${input.projectId}/materials/${input.materialId}/original/${input.objectId}`;
}

export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

function detectByContent(extension: string, bytes: Uint8Array): MaterialFileType {
  if (extension === "pdf" && startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return { extension, detectedContentType: "application/pdf", container: "binary" };
  }
  if (["docx", "xlsx"].includes(extension) && startsWith(bytes, [0x50, 0x4b])) {
    return {
      extension,
      detectedContentType:
        extension === "docx"
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      container: "zip",
    };
  }
  if (["jpg", "jpeg"].includes(extension) && startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return { extension, detectedContentType: "image/jpeg", container: "binary" };
  }
  if (
    extension === "png" &&
    startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  ) {
    return { extension, detectedContentType: "image/png", container: "binary" };
  }
  if (["txt", "csv", "bib", "bibtex", "ris"].includes(extension) && isText(bytes)) {
    const sample = new TextDecoder().decode(bytes.slice(0, 8192));
    if (["bib", "bibtex"].includes(extension) && !/^\s*@\w+\s*[({]/mu.test(sample)) {
      return mismatch();
    }
    if (extension === "ris" && !/^TY  - /mu.test(sample)) return mismatch();
    return {
      extension,
      detectedContentType:
        extension === "csv"
          ? "text/csv"
          : ["bib", "bibtex"].includes(extension)
            ? "application/x-bibtex"
            : extension === "ris"
              ? "application/x-research-info-systems"
              : "text/plain",
      container: "text",
    };
  }
  return mismatch();
}

function mismatch(): never {
  throw new MaterialUploadValidationError(
    "FILE_TYPE_MISMATCH",
    "文件内容特征与扩展名不一致。",
  );
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function isExecutable(bytes: Uint8Array): boolean {
  return (
    startsWith(bytes, [0x4d, 0x5a]) ||
    startsWith(bytes, [0x7f, 0x45, 0x4c, 0x46]) ||
    startsWith(bytes, [0xca, 0xfe, 0xba, 0xbe])
  );
}

function isText(bytes: Uint8Array): boolean {
  const sample = bytes.slice(0, 8192);
  if (sample.some((value) => value === 0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(sample);
    return true;
  } catch {
    return false;
  }
}
