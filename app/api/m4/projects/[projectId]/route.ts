import { deleteM4ProjectForActor, updateM4ProjectIntakeForActor } from "@/db/repositories/m4-projects";
import { apiError, apiSuccess, isRecord } from "../../../m3/_shared";
import { m4RepositoryError, requireM4Actor } from "../../_shared";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await requireM4Actor(request);
  if ("response" in auth) return auth.response;
  const { projectId } = await params;
  try {
    await deleteM4ProjectForActor(auth.actor, projectId);
    return apiSuccess({ deleted: true, projectId });
  } catch (error) {
    return m4RepositoryError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await requireM4Actor(request);
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => null);
  if (!isRecord(body)) return apiError(400, "INVALID_PROJECT", "创建信息参数不完整。");
  const goal = text(body.goal);
  const materialsSummary = text(body.materialsSummary);
  const firstAiHelp = text(body.firstAiHelp);
  if (!goal || !materialsSummary || !firstAiHelp) {
    return apiError(400, "INVALID_PROJECT", "三个最低创建问题均为必填项。");
  }
  try {
    return apiSuccess(await updateM4ProjectIntakeForActor(auth.actor, (await params).projectId, {
      goal,
      materialsSummary,
      firstAiHelp,
    }));
  } catch (error) {
    return m4RepositoryError(error);
  }
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
