import type { M6ReviewPerspective } from "@/db/repositories/m6-review-submission";
import { createM6AdvancedReview, M6ReviewSubmissionError, prepareM6Submission } from "@/db/repositories/m6-review-submission";
import { apiError, apiSuccess, isRecord } from "../../../../m3/_shared";
import { requireM4Actor } from "../../../../m4/_shared";

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const auth = await requireM4Actor(request); if ("response" in auth) return auth.response;
  let body: unknown; try { body = await request.json(); } catch { return apiError(400, "INVALID_JSON", "请求正文必须是有效 JSON。"); }
  if (!isRecord(body) || typeof body.action !== "string") return apiError(400, "INVALID_ACTION", "缺少操作。");
  const projectId = (await params).projectId;
  try {
    if (body.action === "advanced_review") {
      const versionIds = strings(body.version_ids); if (!versionIds || !Array.isArray(body.findings)) return apiError(400, "INVALID_INPUT", "审阅范围或问题无效。");
      const findings = body.findings.map(parseFinding); if (findings.some((item) => !item)) return apiError(400, "INVALID_INPUT", "审阅问题格式无效。");
      return apiSuccess(await createM6AdvancedReview(auth.actor, projectId, { versionIds, findings: findings.filter(isFinding) }), 201);
    }
    if (body.action === "prepare_submission") {
      const versionIds = strings(body.version_ids); if (!versionIds || !isRecord(body.checklist)) return apiError(400, "INVALID_INPUT", "投稿版本或检查表无效。");
      const checklist = Object.fromEntries(Object.entries(body.checklist).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"));
      return apiSuccess(await prepareM6Submission(auth.actor, projectId, { versionIds, dataAvailabilityStatement: text(body.data_availability_statement), checklist }), 201);
    }
    return apiError(400, "INVALID_ACTION", "不支持的操作。");
  } catch (error) { if (error instanceof M6ReviewSubmissionError) return apiError(error.code.endsWith("NOT_FOUND") ? 404 : 400, error.code, error.message); return apiError(500, "M6_REVIEW_SUBMISSION_FAILED", "审阅或投稿准备失败。"); }
}
function parseFinding(value: unknown) { if (!isRecord(value)) return null; const perspective = text(value.perspective); const severity = text(value.severity); const evidenceBindingIds = stringsOrEmpty(value.evidence_binding_ids); if (!["METHOD", "EVIDENCE", "LOGIC", "REPORTING", "LANGUAGE"].includes(perspective) || !["major", "minor", "note"].includes(severity) || !evidenceBindingIds) return null; return { perspective: perspective as M6ReviewPerspective, severity: severity as "major" | "minor" | "note", sectionId: text(value.section_id) || undefined, summary: text(value.summary), evidenceBindingIds }; }
type Finding = NonNullable<ReturnType<typeof parseFinding>>;
function isFinding(value: ReturnType<typeof parseFinding>): value is Finding { return value !== null; }
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function strings(value: unknown): string[] | null { return Array.isArray(value) && value.length > 0 && value.length <= 100 && value.every((item) => typeof item === "string" && item.trim()) ? value.map((item) => item.trim()) : null; }
function stringsOrEmpty(value: unknown): string[] | null { return Array.isArray(value) && value.length <= 100 && value.every((item) => typeof item === "string" && item.trim()) ? value.map((item) => item.trim()) : null; }
