import type { M3Actor } from "@/app/lib/m3-server-identity";
import { createM6Docx, type M6DocxReference, type M6DocxSection } from "@/app/lib/m6-docx";
import { sha256Hex } from "@/app/lib/material-upload-security";
import { getMaterialStorageAdapter, type StorageAdapter } from "@/app/lib/storage/storage-adapter";
import { getD1 } from "../index";
import { evaluateM6ExportReadiness, M6EvidenceError } from "./m6-evidence";

export class M6ExportError extends Error {
  readonly code: "PROJECT_NOT_FOUND" | "EXPORT_BLOCKED" | "VERSION_NOT_FOUND" | "STORAGE_FAILED";
  constructor(code: M6ExportError["code"], message: string) { super(message); this.code = code; }
}

export type M6ExportWorkspace = {
  project: { id: string; title: string };
  sections: Array<{
    id: string;
    slug: string;
    title: string;
    position: number;
    status: string;
    versionId: string | null;
    versionNumber: number | null;
    wordCount: number;
  }>;
  exports: Array<{
    id: string;
    status: string;
    sourceVersionIds: string[];
    errorMessage: string | null;
    createdAt: string;
  }>;
};

export async function loadM6ExportWorkspace(
  actor: M3Actor,
  requestedProjectId: string,
): Promise<M6ExportWorkspace> {
  const db = getD1();
  const project = await resolveProject(db, actor, requestedProjectId);
  const sections = await db.prepare(
    `SELECT s.id, s.slug, s.title, s.position, s.status, s.word_count,
            v.id AS version_id, v.version_number
       FROM sections s
       LEFT JOIN section_versions v ON v.id = (
         SELECT latest.id FROM section_versions latest
          WHERE latest.section_id = s.id
            AND latest.owner_user_id = s.owner_user_id
            AND latest.project_id = s.project_id
            AND NOT EXISTS (
              SELECT 1 FROM section_version_adoptions candidate
               WHERE candidate.version_id = latest.id
            )
          ORDER BY latest.version_number DESC, latest.created_at DESC
          LIMIT 1
       )
      WHERE s.owner_user_id = ? AND s.project_id = ?
      ORDER BY s.position, s.created_at`,
  ).bind(actor.userId, project.id).all<{
    id: string; slug: string; title: string; position: number; status: string;
    word_count: number; version_id: string | null; version_number: number | null;
  }>();
  const exports = await db.prepare(
    `SELECT id, status, source_version_ids_json, error_message, created_at
       FROM export_records
      WHERE owner_user_id = ? AND project_id = ? AND format = 'docx'
      ORDER BY created_at DESC, id DESC LIMIT 20`,
  ).bind(actor.userId, project.id).all<{
    id: string; status: string; source_version_ids_json: string;
    error_message: string | null; created_at: string;
  }>();
  return {
    project,
    sections: (sections.results ?? []).map((section) => ({
      id: section.id,
      slug: section.slug,
      title: section.title,
      position: section.position,
      status: section.status,
      versionId: section.version_id,
      versionNumber: section.version_number,
      wordCount: section.word_count,
    })),
    exports: (exports.results ?? []).map((item) => ({
      id: item.id,
      status: item.status,
      sourceVersionIds: stringArray(item.source_version_ids_json),
      errorMessage: item.error_message,
      createdAt: item.created_at,
    })),
  };
}

export async function getM6DocxExport(
  actor: M3Actor,
  requestedProjectId: string,
  exportId: string,
  storage: StorageAdapter = getMaterialStorageAdapter(),
): Promise<ArrayBuffer> {
  const db = getD1();
  const project = await resolveProject(db, actor, requestedProjectId);
  const record = await db.prepare(
    `SELECT object_key FROM export_records
      WHERE id = ? AND owner_user_id = ? AND project_id = ?
        AND format = 'docx' AND status = 'ready'`,
  ).bind(exportId, actor.userId, project.id).first<{ object_key: string | null }>();
  if (!record?.object_key) {
    throw new M6ExportError("VERSION_NOT_FOUND", "DOCX 导出记录不存在或尚未就绪。");
  }
  const body = await storage.get(record.object_key);
  if (!body) throw new M6ExportError("STORAGE_FAILED", "DOCX 文件不存在或存储暂时不可用。");
  return body;
}

export async function createM6DocxExport(actor: M3Actor, requestedProjectId: string, versionIds: string[], storage: StorageAdapter = getMaterialStorageAdapter()) {
  const db = getD1();
  const project = await resolveProject(db, actor, requestedProjectId);
  let readiness;
  try { readiness = await evaluateM6ExportReadiness(actor, project.id, versionIds); }
  catch (error) { if (error instanceof M6EvidenceError) throw new M6ExportError(error.code === "VERSION_NOT_FOUND" ? "VERSION_NOT_FOUND" : "EXPORT_BLOCKED", error.message); throw error; }
  const exportId = crypto.randomUUID();
  if (!readiness.ready) {
    const reason = readiness.blockers.map((item) => item.message).join("；");
    await db.prepare(
      `INSERT INTO export_records (id, owner_user_id, project_id, format, source_version_ids_json, status, error_message, readiness_report_json, blocked_reason)
       VALUES (?, ?, ?, 'docx', ?, 'failed', ?, ?, ?)`,
    ).bind(exportId, actor.userId, project.id, JSON.stringify(readiness.checkedVersionIds), reason, JSON.stringify(readiness), reason).run();
    throw new M6ExportError("EXPORT_BLOCKED", reason);
  }
  const sections: M6DocxSection[] = [];
  const references = new Map<string, M6DocxReference>();
  for (const versionId of readiness.checkedVersionIds) {
    const version = await db.prepare(
      `SELECT v.content, s.title FROM section_versions v JOIN sections s ON s.id = v.section_id
       WHERE v.id = ? AND v.owner_user_id = ? AND v.project_id = ?`,
    ).bind(versionId, actor.userId, project.id).first<{ content: string; title: string }>();
    if (!version) throw new M6ExportError("VERSION_NOT_FOUND", "章节版本不存在或不属于当前用户。");
    sections.push(version);
    const rows = await db.prepare(
      `SELECT c.citation_key, l.title, l.authors_json, l.year, l.source, l.doi
       FROM citations c JOIN literature_records l ON l.id = c.literature_id
       WHERE c.section_version_id = ? AND c.owner_user_id = ? AND c.project_id = ?
       ORDER BY c.created_at`,
    ).bind(versionId, actor.userId, project.id).all<{ citation_key: string; title: string; authors_json: string; year: number | null; source: string | null; doi: string | null }>();
    for (const row of rows.results ?? []) references.set(row.citation_key, { citationKey: row.citation_key, title: row.title, authors: stringArray(row.authors_json), year: row.year, source: row.source, doi: row.doi });
  }
  const bytes = createM6Docx({ title: project.title, sections, references: [...references.values()] });
  const objectKey = `users/${actor.userId}/projects/${project.id}/exports/${exportId}.docx`;
  try {
    await storage.put(objectKey, bytes.buffer as ArrayBuffer, { contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", contentHash: await sha256Hex(bytes) });
    await db.prepare(
      `INSERT INTO export_records (id, owner_user_id, project_id, format, source_version_ids_json, object_key, status, readiness_report_json)
       VALUES (?, ?, ?, 'docx', ?, ?, 'ready', ?)`,
    ).bind(exportId, actor.userId, project.id, JSON.stringify(readiness.checkedVersionIds), objectKey, JSON.stringify(readiness)).run();
  } catch {
    await storage.delete(objectKey).catch(() => undefined);
    throw new M6ExportError("STORAGE_FAILED", "DOCX 存储失败，未创建可下载记录。");
  }
  return { id: exportId, format: "docx" as const, status: "ready" as const, objectKey, sourceVersionIds: readiness.checkedVersionIds, readiness };
}

function stringArray(value: string): string[] { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []; } catch { return []; } }

async function resolveProject(db: D1Database, actor: M3Actor, requestedProjectId: string) {
  const project = requestedProjectId === "demo"
    ? await db.prepare("SELECT id, title FROM projects WHERE owner_user_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1").bind(actor.userId).first<{ id: string; title: string }>()
    : await db.prepare("SELECT id, title FROM projects WHERE id = ? AND owner_user_id = ? AND status = 'active'").bind(requestedProjectId, actor.userId).first<{ id: string; title: string }>();
  if (!project) throw new M6ExportError("PROJECT_NOT_FOUND", "项目不存在或不属于当前用户。");
  return project;
}
