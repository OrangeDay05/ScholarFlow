import { getM6DocxExport, M6ExportError } from "@/db/repositories/m6-exports";
import { apiError } from "../../../../../m3/_shared";
import { requireM4Actor } from "../../../../../m4/_shared";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string; exportId: string }> },
) {
  const auth = await requireM4Actor(request);
  if ("response" in auth) return auth.response;
  const { projectId, exportId } = await params;
  try {
    const body = await getM6DocxExport(auth.actor, projectId, exportId);
    return new Response(body, {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "content-disposition": `attachment; filename="manuscript-${exportId}.docx"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof M6ExportError) {
      const status = error.code === "STORAGE_FAILED" ? 503 : 404;
      return apiError(status, error.code, error.message);
    }
    return apiError(500, "EXPORT_DOWNLOAD_FAILED", "DOCX 下载失败。");
  }
}
