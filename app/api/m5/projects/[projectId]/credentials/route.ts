import { M4_TASK_ROLES, type M4TaskRole } from "@/app/lib/m4-task-contracts";
import { isRecord, apiError, apiSuccess } from "../../../../m3/_shared";
import { requireM4Actor } from "../../../../m4/_shared";
import { M5CredentialRepositoryError, saveM5UserCredential, setM5UserCredentialStatus, testM5UserCredential } from "@/db/repositories/m5-credentials";

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const auth = await requireM4Actor(request);
  if ("response" in auth) return auth.response;
  let body: unknown;
  try { body = await request.json(); } catch { return apiError(400, "INVALID_JSON", "请求正文必须是有效 JSON。" ); }
  if (!isRecord(body) || typeof body.action !== "string") return apiError(400, "INVALID_ACTION", "缺少凭据操作。" );
  const projectId = (await params).projectId;
  try {
    if (body.action === "save") {
      const apiKey = text(body.api_key);
      const providerId = text(body.provider_id);
      const label = text(body.label);
      const allowedModelIds = strings(body.allowed_model_ids);
      const allowedRoles = roles(body.allowed_roles);
      if (!apiKey || !providerId || !label || !allowedModelIds || !allowedRoles) return apiError(400, "INVALID_CREDENTIAL", "凭据、供应商、模型和角色范围不能为空。" );
      return apiSuccess(await saveM5UserCredential(auth.actor, projectId, { providerId, label, apiKey, allowedModelIds, allowedRoles }), 201);
    }
    if (body.action === "test") return apiSuccess(await testM5UserCredential(auth.actor, projectId, text(body.credential_id), text(body.model_id)));
    if (body.action === "disable" || body.action === "delete") {
      await setM5UserCredentialStatus(auth.actor, projectId, text(body.credential_id), body.action === "disable" ? "DISABLED" : "DELETED");
      return apiSuccess({ status: body.action === "disable" ? "DISABLED" : "DELETED" });
    }
    return apiError(400, "INVALID_ACTION", "不支持的凭据操作。" );
  } catch (error) {
    if (error instanceof M5CredentialRepositoryError) return apiError(error.code === "PROJECT_NOT_FOUND" || error.code === "CREDENTIAL_NOT_FOUND" ? 404 : error.code === "MASTER_KEY_UNAVAILABLE" ? 503 : 400, error.code, error.message);
    return apiError(500, "CREDENTIAL_OPERATION_FAILED", "凭据操作失败；Key 未写入响应或日志。" );
  }
}

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function strings(value: unknown): string[] | null { return Array.isArray(value) && value.length > 0 && value.length <= 100 && value.every((item) => typeof item === "string" && item.trim()) ? value.map((item) => item.trim()) : null; }
function roles(value: unknown): M4TaskRole[] | null { const list = strings(value); return list?.every((item) => M4_TASK_ROLES.includes(item as M4TaskRole)) ? list as M4TaskRole[] : null; }
