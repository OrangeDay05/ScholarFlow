import type { M3Actor } from "@/app/lib/m3-server-identity";
import { parseM7DecisionLetter } from "@/app/lib/m7-review-revision";
import { getD1 } from "../index";

type Context = { userId: string; projectId: string };
export class M7RevisionError extends Error { readonly code: "PROJECT_NOT_FOUND" | "COMMENT_NOT_FOUND" | "TASK_NOT_FOUND" | "VERSION_NOT_FOUND" | "INVALID_INPUT" | "CONFIRMATION_REQUIRED"; constructor(code: M7RevisionError["code"], message: string) { super(message); this.code = code; } }

export async function importM7DecisionLetter(actor: M3Actor, requestedProjectId: string, input: { text: string; sourceMaterialId?: string }) {
  const db = getD1(); const context = await resolveContext(db, actor, requestedProjectId);
  const comments = parseM7DecisionLetter(input.text);
  if (!comments.length) throw new M7RevisionError("INVALID_INPUT", "决定信没有可识别的审稿意见。");
  if (input.sourceMaterialId) { const material = await db.prepare("SELECT id FROM materials WHERE id = ? AND owner_user_id = ? AND project_id = ?").bind(input.sourceMaterialId, context.userId, context.projectId).first<{ id: string }>(); if (!material) throw new M7RevisionError("COMMENT_NOT_FOUND", "来源材料不存在或不属于当前用户。"); }
  const ids: string[] = [];
  for (const comment of comments) {
    const existing = await db.prepare("SELECT id FROM reviewer_comments WHERE owner_user_id = ? AND project_id = ? AND reviewer_label = ? AND comment_number = ?").bind(context.userId, context.projectId, comment.reviewerLabel, comment.commentNumber).first<{ id: string }>();
    if (existing) { ids.push(existing.id); continue; }
    const id = crypto.randomUUID(); ids.push(id);
    await db.prepare("INSERT INTO reviewer_comments (id, owner_user_id, project_id, reviewer_label, comment_number, content, source_material_id) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, context.userId, context.projectId, comment.reviewerLabel, comment.commentNumber, comment.content, input.sourceMaterialId ?? null).run();
  }
  return { commentIds: ids, count: ids.length };
}

export async function createM7RevisionTask(actor: M3Actor, requestedProjectId: string, input: { reviewerCommentId: string; sectionId: string; baseVersionId: string; plannedAction: string }) {
  const db = getD1(); const context = await resolveContext(db, actor, requestedProjectId);
  const comment = await db.prepare("SELECT id FROM reviewer_comments WHERE id = ? AND owner_user_id = ? AND project_id = ?").bind(input.reviewerCommentId, context.userId, context.projectId).first<{ id: string }>(); if (!comment) throw new M7RevisionError("COMMENT_NOT_FOUND", "审稿意见不存在或不属于当前用户。");
  const version = await requireVersion(db, context, input.baseVersionId); if (version.section_id !== input.sectionId) throw new M7RevisionError("VERSION_NOT_FOUND", "基础版本不属于目标章节。");
  if (!input.plannedAction.trim()) throw new M7RevisionError("INVALID_INPUT", "返修计划不能为空。");
  const id = crypto.randomUUID(); await db.prepare("INSERT INTO revision_tasks (id, owner_user_id, project_id, reviewer_comment_id, section_id, base_version_id, status, planned_action) VALUES (?, ?, ?, ?, ?, ?, 'open', ?)").bind(id, context.userId, context.projectId, input.reviewerCommentId, input.sectionId, input.baseVersionId, input.plannedAction.trim()).run(); return { id, status: "open" as const };
}

export async function appendM7ResponseDraft(actor: M3Actor, requestedProjectId: string, revisionTaskId: string, content: string) {
  const db = getD1(); const context = await resolveContext(db, actor, requestedProjectId); await requireTask(db, context, revisionTaskId);
  if (!content.trim()) throw new M7RevisionError("INVALID_INPUT", "回复草稿不能为空。");
  const row = await db.prepare("SELECT COALESCE(MAX(version_number),0) AS value FROM response_drafts WHERE revision_task_id = ? AND owner_user_id = ? AND project_id = ?").bind(revisionTaskId, context.userId, context.projectId).first<{ value: number }>();
  const id = crypto.randomUUID(); const versionNumber = (row?.value ?? 0) + 1; await db.prepare("INSERT INTO response_drafts (id, owner_user_id, project_id, revision_task_id, version_number, content, user_confirmed) VALUES (?, ?, ?, ?, ?, ?, 0)").bind(id, context.userId, context.projectId, revisionTaskId, versionNumber, content.trim()).run(); return { id, versionNumber, userConfirmed: false };
}

export async function confirmM7ResponseDraft(actor: M3Actor, requestedProjectId: string, revisionTaskId: string, responseDraftId: string) {
  const db = getD1(); const context = await resolveContext(db, actor, requestedProjectId); await requireTask(db, context, revisionTaskId);
  const draft = await db.prepare("SELECT id FROM response_drafts WHERE id = ? AND revision_task_id = ? AND owner_user_id = ? AND project_id = ?").bind(responseDraftId, revisionTaskId, context.userId, context.projectId).first<{ id: string }>(); if (!draft) throw new M7RevisionError("TASK_NOT_FOUND", "回复草稿不存在或不属于当前用户。");
  await db.batch([db.prepare("UPDATE response_drafts SET user_confirmed = 0 WHERE revision_task_id = ? AND owner_user_id = ? AND project_id = ?").bind(revisionTaskId, context.userId, context.projectId), db.prepare("UPDATE response_drafts SET user_confirmed = 1 WHERE id = ? AND owner_user_id = ? AND project_id = ?").bind(responseDraftId, context.userId, context.projectId)]); return { id: responseDraftId, userConfirmed: true };
}

export async function createM7RevisionVersion(actor: M3Actor, requestedProjectId: string, revisionTaskId: string, content: string) {
  const db = getD1(); const context = await resolveContext(db, actor, requestedProjectId); const task = await requireTask(db, context, revisionTaskId); if (!task.section_id) throw new M7RevisionError("VERSION_NOT_FOUND", "返修任务没有目标章节。"); if (!content.trim()) throw new M7RevisionError("INVALID_INPUT", "返修正文不能为空。");
  const next = await db.prepare("SELECT COALESCE(MAX(version_number),0) AS value FROM section_versions WHERE section_id = ? AND owner_user_id = ? AND project_id = ?").bind(task.section_id, context.userId, context.projectId).first<{ value: number }>(); const id = crypto.randomUUID();
  await db.batch([db.prepare("INSERT INTO section_versions (id, owner_user_id, project_id, section_id, version_number, source, source_version_id, content, content_hash, summary) VALUES (?, ?, ?, ?, ?, 'ai', ?, ?, ?, ?)").bind(id, context.userId, context.projectId, task.section_id, (next?.value ?? 0) + 1, task.base_version_id, content.trim(), await hashText(content.trim()), `Revision task ${revisionTaskId}`), db.prepare("UPDATE revision_tasks SET result_version_id = ?, status = 'ready_for_review', verification_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_user_id = ? AND project_id = ?").bind(id, revisionTaskId, context.userId, context.projectId)]); return { id, status: "ready_for_review" as const };
}

export async function verifyM7RevisionTask(actor: M3Actor, requestedProjectId: string, revisionTaskId: string) {
  const db = getD1(); const context = await resolveContext(db, actor, requestedProjectId); const task = await requireTask(db, context, revisionTaskId); if (!task.base_version_id || !task.result_version_id) throw new M7RevisionError("VERSION_NOT_FOUND", "返修任务缺少基础版本或结果版本。");
  const base = await requireVersion(db, context, task.base_version_id); const result = await requireVersion(db, context, task.result_version_id); const response = await db.prepare("SELECT id FROM response_drafts WHERE revision_task_id = ? AND owner_user_id = ? AND project_id = ? AND user_confirmed = 1 ORDER BY version_number DESC LIMIT 1").bind(revisionTaskId, context.userId, context.projectId).first<{ id: string }>();
  const verified = base.section_id === result.section_id && base.content_hash !== result.content_hash && Boolean(response); const note = !response ? "用户尚未确认回复草稿。" : base.content_hash === result.content_hash ? "返修版本与基础版本内容相同。" : base.section_id !== result.section_id ? "返修版本不属于同一章节。" : "返修版本、基础版本和用户确认回复已建立对应关系。";
  await db.prepare("UPDATE revision_tasks SET verification_status = ?, verification_note = ?, verified_at = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_user_id = ? AND project_id = ?").bind(verified ? "VERIFIED" : "FAILED", note, new Date().toISOString(), verified ? "resolved" : "ready_for_review", revisionTaskId, context.userId, context.projectId).run(); return { verified, status: verified ? "resolved" as const : "ready_for_review" as const, note };
}

async function resolveContext(db: D1Database, actor: M3Actor, requestedProjectId: string): Promise<Context> { const project = requestedProjectId === "demo" ? await db.prepare("SELECT id FROM projects WHERE owner_user_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1").bind(actor.userId).first<{ id: string }>() : await db.prepare("SELECT id FROM projects WHERE id = ? AND owner_user_id = ? AND status = 'active'").bind(requestedProjectId, actor.userId).first<{ id: string }>(); if (!project) throw new M7RevisionError("PROJECT_NOT_FOUND", "项目不存在或不属于当前用户。"); return { userId: actor.userId, projectId: project.id }; }
async function requireVersion(db: D1Database, context: Context, id: string) { const row = await db.prepare("SELECT id, section_id, content_hash FROM section_versions WHERE id = ? AND owner_user_id = ? AND project_id = ?").bind(id, context.userId, context.projectId).first<{ id: string; section_id: string; content_hash: string }>(); if (!row) throw new M7RevisionError("VERSION_NOT_FOUND", "章节版本不存在或不属于当前用户。"); return row; }
async function requireTask(db: D1Database, context: Context, id: string) { const row = await db.prepare("SELECT id, section_id, base_version_id, result_version_id FROM revision_tasks WHERE id = ? AND owner_user_id = ? AND project_id = ?").bind(id, context.userId, context.projectId).first<{ id: string; section_id: string | null; base_version_id: string | null; result_version_id: string | null }>(); if (!row) throw new M7RevisionError("TASK_NOT_FOUND", "返修任务不存在或不属于当前用户。"); return row; }
async function hashText(value: string) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(""); }
