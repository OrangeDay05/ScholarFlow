import { appendSectionVersion } from "@/db/repositories/m3-projects";
import {
  apiError,
  apiSuccess,
  isRecord,
  repositoryError,
  requireM3ApiActor,
} from "../../../../../_shared";

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ projectId: string; sectionSlug: string }>;
  },
) {
  const auth = await requireM3ApiActor(request);
  if ("response" in auth) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_JSON", "请求正文必须是有效 JSON。");
  }
  if (!isRecord(body) || (body.source !== "manual" && body.source !== "restore")) {
    return apiError(
      400,
      "INVALID_VERSION",
      "章节版本只接受人工保存或历史恢复。",
    );
  }
  if (body.source === "manual" && typeof body.content !== "string") {
    return apiError(400, "INVALID_VERSION", "人工保存必须包含正文内容。");
  }
  if (body.source === "restore" && typeof body.sourceVersionId !== "string") {
    return apiError(400, "INVALID_VERSION", "恢复操作必须指定历史版本。");
  }
  const { projectId, sectionSlug } = await params;

  try {
    return apiSuccess(
      await appendSectionVersion(auth.actor, projectId, sectionSlug, {
        source: body.source,
        content: typeof body.content === "string" ? body.content : undefined,
        contentJson: typeof body.contentJson === "string" ? body.contentJson : null,
        sourceVersionId:
          typeof body.sourceVersionId === "string"
            ? body.sourceVersionId
            : undefined,
        summary: typeof body.summary === "string" ? body.summary : undefined,
      }),
      201,
    );
  } catch (error) {
    return repositoryError(error);
  }
}
