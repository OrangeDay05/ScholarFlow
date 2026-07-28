import {
  M4_FIDELITY_CHECKS,
  M4_PRIVACY_MODES,
  type M4FidelityCheckInput,
  type M4PrivacyProfileInput,
  type M4ProcessingCopyInput,
} from "@/app/lib/m4-privacy-contracts";
import {
  createM4ProcessingCopy,
  loadM4PrivacyWorkspace,
  planM4MaterialTransmission,
  saveM4PrivacyProfile,
  saveM4PseudonymMapReference,
} from "@/db/repositories/m4-privacy";
import { apiError, apiSuccess, isRecord } from "../../../../m3/_shared";
import { m4RepositoryError, requireM4Actor } from "../../../_shared";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await requireM4Actor(request);
  if ("response" in auth) return auth.response;
  try {
    return apiSuccess(
      await loadM4PrivacyWorkspace(auth.actor, (await params).projectId),
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
    return apiError(400, "INVALID_ACTION", "缺少隐私操作类型。");
  }
  const projectId = (await params).projectId;
  try {
    switch (body.action) {
      case "profile": {
        const input = parseProfile(body);
        return input
          ? apiSuccess(
              await saveM4PrivacyProfile(auth.actor, projectId, input),
              201,
            )
          : apiError(400, "INVALID_PROFILE", "材料隐私画像参数无效。");
      }
      case "copy": {
        const input = parseCopy(body);
        return input
          ? apiSuccess(
              await createM4ProcessingCopy(auth.actor, projectId, input),
              201,
            )
          : apiError(400, "INVALID_COPY", "处理副本或保真检查参数无效。");
      }
      case "pseudonym_map": {
        if ("mappings" in body || "mapping_values" in body || "raw_values" in body) {
          return apiError(
            400,
            "PLAINTEXT_MAPPING_REJECTED",
            "M4 不接收或保存明文伪匿名映射。",
          );
        }
        const processingCopyId = text(body.processing_copy_id);
        const secretReference = text(body.secret_reference);
        const mappingCount = integer(body.mapping_count, 0, 1_000_000);
        const accessScope = text(body.access_scope);
        if (
          !processingCopyId ||
          !secretReference.startsWith("vault-ref://") ||
          mappingCount === null ||
          !["OWNER_ONLY", "PROJECT_SERVICE"].includes(accessScope) ||
          typeof body.reversible !== "boolean"
        ) {
          return apiError(
            400,
            "INVALID_PSEUDONYM_MAP",
            "伪匿名映射只能保存受控密文引用和计数。",
          );
        }
        return apiSuccess(
          await saveM4PseudonymMapReference(auth.actor, projectId, {
            processingCopyId,
            secretReference,
            mappingCount,
            reversible: body.reversible,
            accessScope: accessScope as "OWNER_ONLY" | "PROJECT_SERVICE",
          }),
          201,
        );
      }
      case "transmission": {
        const taskId = text(body.task_id);
        const materialId = text(body.material_id);
        const processingCopyId = text(body.processing_copy_id);
        const providerKey = text(body.provider_key);
        const purpose = text(body.purpose);
        if (
          !taskId ||
          !materialId ||
          !processingCopyId ||
          !providerKey ||
          !purpose
        ) {
          return apiError(400, "INVALID_TRANSMISSION", "外传计划参数无效。");
        }
        return apiSuccess(
          await planM4MaterialTransmission(auth.actor, projectId, {
            taskId,
            materialId,
            processingCopyId,
            providerKey,
            purpose,
          }),
          201,
        );
      }
      default:
        return apiError(400, "INVALID_ACTION", "不支持的隐私操作。");
    }
  } catch (error) {
    return m4RepositoryError(error);
  }
}

function parseProfile(
  body: Record<string, unknown>,
): M4PrivacyProfileInput | null {
  const materialId = text(body.material_id);
  const mode = text(body.recommended_mode);
  const lists = [
    stringArray(body.direct_identifiers),
    stringArray(body.indirect_identifiers),
    stringArray(body.sensitive_attributes),
    stringArray(body.research_necessary_variables),
    stringArray(body.ordinary_research_content),
    stringArray(body.confidentiality_restrictions),
    stringArray(body.copyright_restrictions),
  ];
  if (
    !materialId ||
    !M4_PRIVACY_MODES.includes(mode as (typeof M4_PRIVACY_MODES)[number]) ||
    lists.some((list) => list === null) ||
    typeof body.confirm !== "boolean"
  ) {
    return null;
  }
  return {
    materialId,
    directIdentifiers: lists[0]!,
    indirectIdentifiers: lists[1]!,
    sensitiveAttributes: lists[2]!,
    researchNecessaryVariables: lists[3]!,
    ordinaryResearchContent: lists[4]!,
    confidentialityRestrictions: lists[5]!,
    copyrightRestrictions: lists[6]!,
    recommendedMode: mode as M4PrivacyProfileInput["recommendedMode"],
    confirm: body.confirm,
  };
}

function parseCopy(
  body: Record<string, unknown>,
): M4ProcessingCopyInput | null {
  const materialId = text(body.material_id);
  const profileId = text(body.profile_id);
  const mode = text(body.mode);
  const transformations = stringArray(body.transformations);
  const checks = parseChecks(body.fidelity_checks);
  if (
    !materialId ||
    !profileId ||
    !M4_PRIVACY_MODES.includes(mode as (typeof M4_PRIVACY_MODES)[number]) ||
    !transformations ||
    !checks ||
    typeof body.approved_by_user !== "boolean"
  ) {
    return null;
  }
  return {
    materialId,
    profileId,
    mode: mode as M4ProcessingCopyInput["mode"],
    storageReference: text(body.storage_reference) || undefined,
    contentHash: text(body.content_hash) || undefined,
    transformations,
    approvedByUser: body.approved_by_user,
    fidelityChecks: checks,
  };
}

function parseChecks(value: unknown): M4FidelityCheckInput[] | null {
  if (!Array.isArray(value) || value.length !== M4_FIDELITY_CHECKS.length) {
    return null;
  }
  const checks: M4FidelityCheckInput[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const type = text(item.type);
    const status = text(item.status);
    const detail = text(item.detail);
    if (
      !M4_FIDELITY_CHECKS.includes(
        type as (typeof M4_FIDELITY_CHECKS)[number],
      ) ||
      !["PASSED", "WARNING", "FAILED"].includes(status) ||
      !detail ||
      typeof item.blocking !== "boolean"
    ) {
      return null;
    }
    checks.push({
      type: type as M4FidelityCheckInput["type"],
      status: status as M4FidelityCheckInput["status"],
      detail,
      blocking: item.blocking,
    });
  }
  return new Set(checks.map((check) => check.type)).size === checks.length
    ? checks
    : null;
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

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 200) return null;
  const result = value.map(text);
  return result.every(Boolean) ? result : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
