import type { M3DiagnosisSnapshot } from "@/app/lib/m3-contracts";
import { appendDiagnosisVersion } from "@/db/repositories/m3-projects";
import {
  apiError,
  apiSuccess,
  isRecord,
  repositoryError,
  requireM3ApiActor,
} from "../../../_shared";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await requireM3ApiActor(request);
  if ("response" in auth) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_JSON", "请求正文必须是有效 JSON。");
  }
  if (!isRecord(body) || !isRecord(body.diagnosis)) {
    return apiError(400, "INVALID_DIAGNOSIS", "诊断卡参数不完整。");
  }

  const diagnosis = body.diagnosis;
  const required = ["title", "paperType", "language"] as const;
  if (required.some((key) => typeof diagnosis[key] !== "string" || !diagnosis[key].trim())) {
    return apiError(
      400,
      "INVALID_DIAGNOSIS",
      "诊断卡至少需要题目、论文类型和语言。",
    );
  }
  const input: Omit<
    M3DiagnosisSnapshot,
    "id" | "versionNumber" | "status" | "confirmedAt"
  > = {
    title: stringValue(diagnosis.title),
    paperType: stringValue(diagnosis.paperType),
    language: stringValue(diagnosis.language),
    researchObject: stringValue(diagnosis.researchObject),
    researchQuestion: stringValue(diagnosis.researchQuestion),
    method: stringValue(diagnosis.method),
    requirements: stringValue(diagnosis.requirements),
  };
  const { projectId } = await params;

  try {
    return apiSuccess(
      await appendDiagnosisVersion(
        auth.actor,
        projectId,
        input,
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
