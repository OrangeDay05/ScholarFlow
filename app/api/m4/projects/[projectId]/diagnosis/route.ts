import type { M4DiagnosisMutation } from "@/app/lib/m4-diagnosis-contracts";
import {
  answerM4DiagnosisQuestion,
  archiveM4DiagnosisCard,
  confirmM4DiagnosisCard,
  finishM4DiagnosisSession,
  loadM4DiagnosisWorkspace,
  saveM4DiagnosisFields,
  startM4DiagnosisSession,
} from "@/db/repositories/m4-diagnosis";
import { apiError, apiSuccess, isRecord } from "../../../../m3/_shared";
import { m4RepositoryError, requireM4Actor } from "../../../_shared";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = requireM4Actor(request, "diagnosis");
  if ("response" in auth) return auth.response;
  try {
    return apiSuccess(
      await loadM4DiagnosisWorkspace(auth.actor, (await params).projectId),
    );
  } catch (error) {
    return m4RepositoryError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = requireM4Actor(request, "diagnosis");
  if ("response" in auth) return auth.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_JSON", "请求正文必须是有效 JSON。");
  }
  if (!isRecord(body) || typeof body.action !== "string") {
    return apiError(400, "INVALID_ACTION", "缺少诊断操作类型。");
  }
  const projectId = (await params).projectId;
  try {
    switch (body.action as M4DiagnosisMutation["action"]) {
      case "start":
        if (
          !["quick", "guided", "material", "professional"].includes(
            String(body.mode),
          ) ||
          !["standard", "deep"].includes(String(body.depth))
        ) {
          return apiError(400, "INVALID_SESSION", "诊断模式或深度无效。");
        }
        return apiSuccess(
          await startM4DiagnosisSession(
            auth.actor,
            projectId,
            body.mode as "quick" | "guided" | "material" | "professional",
            body.depth as "standard" | "deep",
          ),
          201,
        );
      case "answer":
        if (
          !string(body.session_id) ||
          !string(body.question_id) ||
          typeof body.answer !== "string" ||
          !fieldStatus(body.answer_status) ||
          !sourceType(body.answer_source_type) ||
          !["LOW", "MEDIUM", "HIGH"].includes(String(body.confidence))
        ) {
          return apiError(400, "INVALID_ANSWER", "问题答案参数不完整。");
        }
        return apiSuccess(
          await answerM4DiagnosisQuestion(auth.actor, projectId, {
            sessionId: body.session_id,
            questionId: body.question_id,
            answer: body.answer,
            status: body.answer_status,
            sourceType: body.answer_source_type,
            confidence: body.confidence as "LOW" | "MEDIUM" | "HIGH",
          }),
        );
      case "save_fields":
        if (!string(body.session_id) || !Array.isArray(body.fields)) {
          return apiError(400, "INVALID_FIELDS", "字段快照参数不完整。");
        }
        const fields = parseFields(body.fields);
        if (!fields) {
          return apiError(400, "INVALID_FIELDS", "诊断字段格式无效。");
        }
        return apiSuccess(
          await saveM4DiagnosisFields(
            auth.actor,
            projectId,
            body.session_id,
            fields,
          ),
        );
      case "finish":
        if (!string(body.session_id) || !string(body.stop_reason)) {
          return apiError(400, "INVALID_FINISH", "结束会话参数不完整。");
        }
        return apiSuccess(
          await finishM4DiagnosisSession(
            auth.actor,
            projectId,
            body.session_id,
            body.stop_reason,
          ),
          201,
        );
      case "confirm":
        if (!string(body.diagnosis_card_id)) {
          return apiError(400, "INVALID_CONFIRMATION", "缺少诊断卡版本。");
        }
        return apiSuccess(
          await confirmM4DiagnosisCard(
            auth.actor,
            projectId,
            body.diagnosis_card_id,
          ),
          201,
        );
      case "archive":
        if (!string(body.diagnosis_card_id)) {
          return apiError(400, "INVALID_ARCHIVE", "缺少诊断卡版本。");
        }
        return apiSuccess(
          await archiveM4DiagnosisCard(
            auth.actor,
            projectId,
            body.diagnosis_card_id,
          ),
        );
      default:
        return apiError(400, "INVALID_ACTION", "不支持的诊断操作。");
    }
  } catch (error) {
    return m4RepositoryError(error);
  }
}

function string(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim());
}

function fieldStatus(
  value: unknown,
): value is
  | "USER_CONFIRMED"
  | "AI_INFERRED"
  | "PENDING_CONFIRMATION"
  | "UNKNOWN"
  | "SKIPPED"
  | "MISSING_MATERIAL"
  | "NOT_APPLICABLE" {
  return [
    "USER_CONFIRMED",
    "AI_INFERRED",
    "PENDING_CONFIRMATION",
    "UNKNOWN",
    "SKIPPED",
    "MISSING_MATERIAL",
    "NOT_APPLICABLE",
  ].includes(String(value));
}

function sourceType(
  value: unknown,
): value is
  | "USER_INPUT"
  | "MATERIAL_EXTRACTED"
  | "AI_RECOMMENDED"
  | "SYSTEM_DERIVED"
  | "IMPORTED" {
  return [
    "USER_INPUT",
    "MATERIAL_EXTRACTED",
    "AI_RECOMMENDED",
    "SYSTEM_DERIVED",
    "IMPORTED",
  ].includes(String(value));
}

function parseFields(
  value: unknown[],
): Parameters<typeof saveM4DiagnosisFields>[3] | null {
  if (value.length > 100) return null;
  const fields: Parameters<typeof saveM4DiagnosisFields>[3] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const field = trimmed(item.field);
    const label = trimmed(item.label);
    const rawValue = typeof item.value === "string" ? item.value : null;
    const rationale =
      typeof item.rationale === "string" ? item.rationale.trim() : null;
    const sourceMaterialIds = stringArray(item.source_material_ids);
    const sourceLocations = stringArray(item.source_locations);
    if (
      !field ||
      !label ||
      rawValue === null ||
      rationale === null ||
      !fieldStatus(item.status) ||
      !sourceType(item.source_type) ||
      !["LOW", "MEDIUM", "HIGH"].includes(String(item.confidence)) ||
      typeof item.requires_confirmation !== "boolean" ||
      !sourceMaterialIds ||
      !sourceLocations
    ) {
      return null;
    }
    fields.push({
      field,
      label,
      value: rawValue,
      status: item.status,
      source_type: item.source_type,
      source_material_ids: sourceMaterialIds,
      source_locations: sourceLocations,
      confidence: item.confidence as "LOW" | "MEDIUM" | "HIGH",
      requires_confirmation: item.requires_confirmation,
      rationale,
    });
  }
  return fields;
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 100) return null;
  const values = value.map(trimmed);
  return values.every(Boolean) ? values : null;
}

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
