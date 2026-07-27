import type { M3OutlineSection } from "@/app/lib/m3-contracts";
import { appendOutlineVersion } from "@/db/repositories/m3-projects";
import {
  apiError,
  apiSuccess,
  isRecord,
  repositoryError,
  requireM3ApiActor,
} from "../../../_shared";

const sectionStatuses = new Set<M3OutlineSection["status"]>([
  "not_started",
  "editing",
  "checking",
  "confirmed",
  "missing_material",
]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = requireM3ApiActor(request);
  if ("response" in auth) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_JSON", "请求正文必须是有效 JSON。");
  }
  if (!isRecord(body) || !Array.isArray(body.sections)) {
    return apiError(400, "INVALID_OUTLINE", "提纲章节参数不完整。");
  }

  const sections: Array<Omit<M3OutlineSection, "id">> = [];
  for (const [index, raw] of body.sections.entries()) {
    if (!isRecord(raw)) {
      return apiError(400, "INVALID_OUTLINE", "提纲章节格式无效。");
    }
    const slug = stringValue(raw.slug);
    const title = stringValue(raw.title);
    const status = stringValue(raw.status) as M3OutlineSection["status"];
    if (!slug || !title || !sectionStatuses.has(status)) {
      return apiError(
        400,
        "INVALID_OUTLINE",
        "每个章节都需要合法的标识、标题和状态。",
      );
    }
    sections.push({
      slug,
      title,
      position:
        typeof raw.position === "number" && Number.isInteger(raw.position)
          ? raw.position
          : index + 1,
      status,
      wordCount:
        typeof raw.wordCount === "number" && raw.wordCount >= 0
          ? Math.floor(raw.wordCount)
          : 0,
    });
  }
  if (!sections.length || new Set(sections.map((section) => section.slug)).size !== sections.length) {
    return apiError(
      400,
      "INVALID_OUTLINE",
      "提纲必须至少包含一个章节，且章节标识不能重复。",
    );
  }
  const { projectId } = await params;

  try {
    return apiSuccess(
      await appendOutlineVersion(
        auth.actor,
        projectId,
        sections,
        body.confirm === true,
      ),
      201,
    );
  } catch (error) {
    return repositoryError(error);
  }
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
