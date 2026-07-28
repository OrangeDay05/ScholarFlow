import { createM7ResponseLetterDocx } from "@/db/repositories/m7-response-letter";
import { appendM7ResponseDraft, confirmM7ResponseDraft, createM7RevisionTask, createM7RevisionVersion, importM7DecisionLetter, M7RevisionError, verifyM7RevisionTask } from "@/db/repositories/m7-revisions";
import { apiError, apiSuccess, isRecord } from "../../../../m3/_shared";
import { requireM4Actor } from "../../../../m4/_shared";

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const auth = await requireM4Actor(request); if ("response" in auth) return auth.response;
  let body: unknown; try { body = await request.json(); } catch { return apiError(400, "INVALID_JSON", "请求正文必须是有效 JSON。"); }
  if (!isRecord(body) || typeof body.action !== "string") return apiError(400, "INVALID_ACTION", "缺少返修操作。"); const projectId = (await params).projectId;
  try {
    if (body.action === "import_decision_letter") return apiSuccess(await importM7DecisionLetter(auth.actor, projectId, { text: text(body.text), sourceMaterialId: text(body.source_material_id) || undefined }), 201);
    if (body.action === "create_task") { const strategy = text(body.response_strategy); if (!isStrategy(strategy)) return apiError(400, "INVALID_INPUT", "回应策略无效。"); return apiSuccess(await createM7RevisionTask(auth.actor, projectId, { reviewerCommentId: text(body.reviewer_comment_id), sectionId: text(body.section_id), baseVersionId: text(body.base_version_id), plannedAction: text(body.planned_action), responseStrategy: strategy, decisionReason: text(body.decision_reason) || undefined, incompleteExperimentWarning: text(body.incomplete_experiment_warning) || undefined }), 201); }
    if (body.action === "append_response") return apiSuccess(await appendM7ResponseDraft(auth.actor, projectId, text(body.revision_task_id), text(body.content)), 201);
    if (body.action === "confirm_response") return apiSuccess(await confirmM7ResponseDraft(auth.actor, projectId, text(body.revision_task_id), text(body.response_draft_id)));
    if (body.action === "create_revision") return apiSuccess(await createM7RevisionVersion(auth.actor, projectId, text(body.revision_task_id), text(body.content)), 201);
    if (body.action === "verify_revision") return apiSuccess(await verifyM7RevisionTask(auth.actor, projectId, text(body.revision_task_id)));
    if (body.action === "export_response_letter") { const ids = strings(body.revision_task_ids); if (!ids) return apiError(400, "INVALID_INPUT", "返修任务列表无效。"); return apiSuccess(await createM7ResponseLetterDocx(auth.actor, projectId, ids), 201); }
    return apiError(400, "INVALID_ACTION", "不支持的返修操作。");
  } catch (error) { if (error instanceof M7RevisionError) return apiError(error.code.endsWith("NOT_FOUND") ? 404 : error.code === "CONFIRMATION_REQUIRED" ? 409 : 400, error.code, error.message); return apiError(500, "REVISION_OPERATION_FAILED", "返修操作失败。"); }
}
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function strings(value: unknown): string[] | null { return Array.isArray(value) && value.length > 0 && value.length <= 200 && value.every((item) => typeof item === "string" && item.trim()) ? value.map((item) => item.trim()) : null; }
function isStrategy(value: string): value is "AGREE" | "PARTIALLY_AGREE" | "DISAGREE" { return ["AGREE", "PARTIALLY_AGREE", "DISAGREE"].includes(value); }
