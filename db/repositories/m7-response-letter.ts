import type { M3Actor } from "@/app/lib/m3-server-identity";
import { createM6Docx } from "@/app/lib/m6-docx";
import { sha256Hex } from "@/app/lib/material-upload-security";
import { getMaterialStorageAdapter, type StorageAdapter } from "@/app/lib/storage/storage-adapter";
import { getD1 } from "../index";
import { M7RevisionError } from "./m7-revisions";

export async function createM7ResponseLetterDocx(actor: M3Actor, requestedProjectId: string, revisionTaskIds: string[], storage: StorageAdapter = getMaterialStorageAdapter()) {
  const db = getD1();
  const project = requestedProjectId === "demo" ? await db.prepare("SELECT id, title FROM projects WHERE owner_user_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1").bind(actor.userId).first<{ id: string; title: string }>() : await db.prepare("SELECT id, title FROM projects WHERE id = ? AND owner_user_id = ? AND status = 'active'").bind(requestedProjectId, actor.userId).first<{ id: string; title: string }>();
  if (!project) throw new M7RevisionError("PROJECT_NOT_FOUND", "项目不存在或不属于当前用户。");
  const ids = [...new Set(revisionTaskIds.filter(Boolean))]; if (!ids.length || ids.length > 200) throw new M7RevisionError("INVALID_INPUT", "回复信必须选择 1—200 个返修任务。");
  const sections: Array<{ title: string; content: string }> = []; const versionIds: string[] = [];
  for (const id of ids) {
    const row = await db.prepare(
      `SELECT t.result_version_id, t.verification_note, c.reviewer_label, c.comment_number, c.content,
         (SELECT d.content FROM response_drafts d WHERE d.revision_task_id = t.id AND d.user_confirmed = 1 ORDER BY d.version_number DESC LIMIT 1) AS response
       FROM revision_tasks t JOIN reviewer_comments c ON c.id = t.reviewer_comment_id
       WHERE t.id = ? AND t.owner_user_id = ? AND t.project_id = ? AND t.status = 'resolved' AND t.verification_status = 'VERIFIED'`,
    ).bind(id, actor.userId, project.id).first<{ result_version_id: string | null; verification_note: string | null; reviewer_label: string; comment_number: string; content: string; response: string | null }>();
    if (!row?.response || !row.result_version_id) throw new M7RevisionError("CONFIRMATION_REQUIRED", "回复信仅能包含已验证返修和用户确认的回复。");
    versionIds.push(row.result_version_id); sections.push({ title: `${row.reviewer_label} — Comment ${row.comment_number}`, content: `审稿意见：\n${row.content}\n\n回复：\n${row.response}\n\n修改验证：\n${row.verification_note ?? "已验证"}\n\n采用版本：${row.result_version_id}` });
  }
  const bytes = createM6Docx({ title: `${project.title} — Response Letter`, sections, references: [] }); const exportId = crypto.randomUUID(); const objectKey = `users/${actor.userId}/projects/${project.id}/exports/${exportId}.docx`;
  try {
    await storage.put(objectKey, bytes.buffer as ArrayBuffer, { contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", contentHash: await sha256Hex(bytes) });
    await db.prepare(
      `INSERT INTO export_records (id, owner_user_id, project_id, format, artifact_type, source_version_ids_json, source_revision_task_ids_json, object_key, status, readiness_report_json)
       VALUES (?, ?, ?, 'docx', 'RESPONSE_LETTER', ?, ?, ?, 'ready', ?)`,
    ).bind(exportId, actor.userId, project.id, JSON.stringify(versionIds), JSON.stringify(ids), objectKey, JSON.stringify({ verifiedRevisionTasks: ids.length, userConfirmedResponses: ids.length })).run();
  } catch { await storage.delete(objectKey).catch(() => undefined); throw new M7RevisionError("INVALID_INPUT", "回复信 DOCX 存储失败，未创建可下载记录。"); }
  return { id: exportId, artifactType: "RESPONSE_LETTER" as const, format: "docx" as const, status: "ready" as const, objectKey, revisionTaskIds: ids, sourceVersionIds: versionIds };
}
