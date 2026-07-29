import { getM8FigureAsset, M8FigureError } from "@/db/repositories/m8-figures";
import { apiError } from "../../../../../../m3/_shared";
import { requireM4Actor } from "../../../../../../m4/_shared";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string; assetId: string }> },
) {
  const auth = await requireM4Actor(request);
  if ("response" in auth) return auth.response;
  const { projectId, assetId } = await params;
  try {
    const asset = await getM8FigureAsset(auth.actor, projectId, assetId);
    return new Response(asset.body, {
      headers: {
        "content-type": asset.contentType,
        "cache-control": "private, no-store",
        "content-disposition": `inline; filename="figure-${assetId}.${asset.format}"`,
      },
    });
  } catch (error) {
    if (error instanceof M8FigureError) return apiError(404, error.code, error.message);
    return apiError(500, "FIGURE_ASSET_FAILED", "读取图件资产失败。");
  }
}
