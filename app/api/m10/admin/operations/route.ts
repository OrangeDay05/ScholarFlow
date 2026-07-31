import { apiError, apiSuccess, isRecord } from "@/app/api/m3/_shared";
import { requireM10Admin } from "@/app/api/m10/_shared";
import { type M10ExperimentStatus } from "@/app/lib/m10-operations-contracts";
import { getOperationsDashboard, M10OperationsError, updateExperiment, updateFeatureFlag, updateUserStatus } from "@/db/repositories/m10-operations";

export async function GET(request: Request) {
  const auth = await requireM10Admin(request);
  if ("response" in auth) return auth.response;
  return apiSuccess(await getOperationsDashboard());
}

export async function POST(request: Request) {
  const auth = await requireM10Admin(request);
  if ("response" in auth) return auth.response;
  let body: unknown;
  try { body = await request.json(); } catch { return apiError(400, "INVALID_JSON", "请求正文必须是有效 JSON。"); }
  if (!isRecord(body) || typeof body.action !== "string") return apiError(400, "INVALID_ACTION", "管理操作无效。");
  try {
    if (body.action === "update_user_status" && typeof body.user_id === "string" && (body.status === "active" || body.status === "frozen") && typeof body.reason === "string") return apiSuccess(await updateUserStatus(auth.actor, body.user_id, body.status, body.reason));
    if (body.action === "update_flag" && typeof body.key === "string" && typeof body.enabled === "boolean" && typeof body.rollout_percentage === "number" && typeof body.reason === "string") return apiSuccess(await updateFeatureFlag(auth.actor, body.key, body.enabled, body.rollout_percentage, body.reason));
    if (body.action === "update_experiment" && typeof body.key === "string" && typeof body.status === "string" && typeof body.treatment_percentage === "number" && typeof body.reason === "string") return apiSuccess(await updateExperiment(auth.actor, body.key, body.status as M10ExperimentStatus, body.treatment_percentage, body.reason));
    return apiError(400, "INVALID_ACTION", "管理操作参数无效。");
  } catch (error) {
    if (error instanceof M10OperationsError) return apiError(error.code.endsWith("NOT_FOUND") ? 404 : 400, error.code, error.message);
    return apiError(500, "OPERATIONS_UPDATE_FAILED", "运营设置保存失败。");
  }
}
