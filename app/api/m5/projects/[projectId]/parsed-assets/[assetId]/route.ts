import { getParsedDocumentAsset } from "@/db/repositories/parsed-document-assets";
import { apiError, requireM3ApiActor } from "../../../../../m3/_shared";

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string; assetId: string }> }) {
  const auth = await requireM3ApiActor(request);
  if ("response" in auth) return auth.response;
  const { projectId, assetId } = await params;
  const asset = await getParsedDocumentAsset(auth.actor, projectId, assetId);
  if (!asset) return apiError(404, "ASSET_NOT_FOUND", "图片资产不存在或不属于当前项目。");
  return new Response(asset.body, { headers: { "content-type": asset.contentType, "content-disposition": `inline; filename="${asset.filename.replaceAll('"', '')}"` } });
}
