import type { M4ExecutionMode } from "@/app/lib/m4-model-contracts";
import { M4_TASK_ROLES, type M4TaskRole } from "@/app/lib/m4-task-contracts";
import {
  loadM4ModelWorkspace,
  saveM4CredentialMetadata,
  saveM4ExecutionProfile,
  setM4CredentialStatus,
} from "@/db/repositories/m4-models";
import { apiError, apiSuccess, isRecord } from "../../../../m3/_shared";
import { m4RepositoryError, requireM4Actor } from "../../../_shared";

const modeLimits = {
  STANDARD: { models: 2, calls: 2 },
  STRICT: { models: 3, calls: 4 },
  CUSTOM: { models: 4, calls: 5 },
} as const;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await requireM4Actor(request);
  if ("response" in auth) return auth.response;
  try {
    return apiSuccess(
      await loadM4ModelWorkspace(auth.actor, (await params).projectId),
    );
  } catch (error) {
    return m4RepositoryError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await requireM4Actor(request);
  if ("response" in auth) return auth.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_JSON", "请求正文必须是有效 JSON。");
  }
  if (!isRecord(body) || typeof body.action !== "string") {
    return apiError(400, "INVALID_ACTION", "缺少模型配置操作。");
  }
  if (containsPlaintextSecret(body)) {
    return apiError(
      400,
      "PLAINTEXT_KEY_REJECTED",
      "M4 不接收、记录或测试真实 API Key。",
    );
  }
  const projectId = (await params).projectId;
  try {
    switch (body.action) {
      case "credential": {
        const providerId = text(body.provider_id);
        const label = text(body.label);
        const maskedKey = text(body.masked_key);
        const secretReference = text(body.secret_reference);
        const allowedModelIds = stringArray(body.allowed_model_ids);
        const allowedProjectIds = stringArray(body.allowed_project_ids);
        const allowedRoles = roleArray(body.allowed_roles);
        if (
          !providerId ||
          !label ||
          !maskedKey.includes("****") ||
          (secretReference &&
            !secretReference.startsWith("vault-ref://")) ||
          !allowedModelIds ||
          !allowedProjectIds ||
          !allowedRoles
        ) {
          return apiError(
            400,
            "INVALID_CREDENTIAL_METADATA",
            "凭据只能保存掩码、范围和可选密文引用。",
          );
        }
        return apiSuccess(
          await saveM4CredentialMetadata(auth.actor, projectId, {
            providerId,
            label,
            maskedKey,
            secretReference: secretReference || undefined,
            allowedModelIds,
            allowedProjectIds,
            allowedRoles,
          }),
          201,
        );
      }
      case "credential_status": {
        const credentialId = text(body.credential_id);
        const status = text(body.status);
        if (
          !credentialId ||
          !["DISABLED", "DELETED"].includes(status)
        ) {
          return apiError(400, "INVALID_CREDENTIAL_STATUS", "凭据状态无效。");
        }
        return apiSuccess(
          await setM4CredentialStatus(
            auth.actor,
            projectId,
            credentialId,
            status as "DISABLED" | "DELETED",
          ),
        );
      }
      case "profile": {
        const mode = text(body.mode) as M4ExecutionMode;
        const name = text(body.name);
        const maxModels = integer(body.max_models, 1, 4);
        const maxCalls = integer(body.max_calls, 1, 5);
        const timeoutSeconds = integer(body.timeout_seconds, 10, 600);
        const fallbackPlan = text(body.fallback_plan);
        const assignments = parseAssignments(body.assignments);
        if (
          !name ||
          !(mode in modeLimits) ||
          maxModels === null ||
          maxCalls === null ||
          timeoutSeconds === null ||
          !fallbackPlan ||
          !assignments ||
          maxModels > modeLimits[mode].models ||
          maxCalls > modeLimits[mode].calls
        ) {
          return apiError(400, "INVALID_PROFILE", "执行配置参数或上限无效。");
        }
        return apiSuccess(
          await saveM4ExecutionProfile(auth.actor, projectId, {
            name,
            mode,
            maxModels,
            maxCalls,
            timeoutSeconds,
            fallbackPlan,
            assignments,
          }),
          201,
        );
      }
      case "test_connection":
        return apiError(
          409,
          "MOCK_CONNECTION_ONLY",
          "M4 不执行真实供应商连接测试；状态保持 MOCK_NOT_EXECUTED。",
        );
      default:
        return apiError(400, "INVALID_ACTION", "不支持的模型配置操作。");
    }
  } catch (error) {
    return m4RepositoryError(error);
  }
}

function parseAssignments(value: unknown) {
  if (!Array.isArray(value) || value.length > 4) return null;
  const result: Array<{
    providerModelId: string;
    credentialMetadataId?: string;
    role: M4TaskRole;
    priority: number;
  }> = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const providerModelId = text(item.provider_model_id);
    const credentialMetadataId = text(item.credential_metadata_id);
    const role = text(item.role);
    const priority = integer(item.priority, 1, 10);
    if (
      !providerModelId ||
      !M4_TASK_ROLES.includes(role as M4TaskRole) ||
      priority === null
    ) {
      return null;
    }
    result.push({
      providerModelId,
      credentialMetadataId: credentialMetadataId || undefined,
      role: role as M4TaskRole,
      priority,
    });
  }
  return result;
}

function containsPlaintextSecret(body: Record<string, unknown>): boolean {
  return [
    "api_key",
    "apiKey",
    "key",
    "secret",
    "plaintext",
    "secret_value",
  ].some((field) => field in body);
}

function integer(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : null;
}

function roleArray(value: unknown): M4TaskRole[] | null {
  const values = stringArray(value);
  return values?.every((role) => M4_TASK_ROLES.includes(role as M4TaskRole))
    ? (values as M4TaskRole[])
    : null;
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 100) return null;
  const result = value.map(text);
  return result.every(Boolean) ? result : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
