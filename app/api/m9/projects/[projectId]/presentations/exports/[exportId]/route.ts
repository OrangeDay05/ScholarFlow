import { getM9PresentationExport, M9PresentationError } from "@/db/repositories/m9-presentations";
import { apiError } from "../../../../../../m3/_shared";
import { requireM4Actor } from "../../../../../../m4/_shared";

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string; exportId: string }> }) {
  const auth = await requireM4Actor(request); if ("response" in auth) return auth.response;
  const { projectId, exportId } = await params;
  try { const body = await getM9PresentationExport(auth.actor, projectId, exportId); return new Response(body, { headers: { "content-type": "application/vnd.openxmlformats-officedocument.presentationml.presentation", "content-disposition": `attachment; filename="presentation-${exportId}.pptx"`, "cache-control": "private, no-store" } }); }
  catch (error) { if (error instanceof M9PresentationError) return apiError(404, error.code, error.message); return apiError(500, "PRESENTATION_DOWNLOAD_FAILED", "PPTX 下载失败。"); }
}
