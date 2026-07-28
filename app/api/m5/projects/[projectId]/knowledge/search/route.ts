import {
  M5ProjectKnowledgeError,
  searchM5ProjectKnowledge,
} from "@/db/repositories/m5-project-knowledge";
import { apiError, apiSuccess } from "../../../../../m3/_shared";
import { requireM4Actor } from "../../../../../m4/_shared";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await requireM4Actor(request);
  if ("response" in auth) return auth.response;
  const url = new URL(request.url);
  try {
    return apiSuccess(await searchM5ProjectKnowledge(
      auth.actor,
      (await params).projectId,
      url.searchParams.get("q") ?? "",
      Number(url.searchParams.get("limit") ?? 10),
    ));
  } catch (error) {
    if (error instanceof M5ProjectKnowledgeError) {
      return apiError(error.code === "PROJECT_NOT_FOUND" ? 404 : 400, error.code, error.message);
    }
    return apiError(500, "INTERNAL_ERROR", "项目知识库检索失败。" );
  }
}
