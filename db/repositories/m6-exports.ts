import type { M3Actor } from "@/app/lib/m3-server-identity";
import { parseDocumentContent } from "@/app/lib/document-model/projection";
import type { ImageBlock } from "@/app/lib/document-model/types";
import { createM6Docx, type M6DocxAsset, type M6DocxReference, type M6DocxSection, type M6HeadingPrefixStyle } from "@/app/lib/m6-docx";
import { sha256Hex } from "@/app/lib/material-upload-security";
import { getMaterialStorageAdapter, type StorageAdapter } from "@/app/lib/storage/storage-adapter";
import { getD1 } from "../index";
import { evaluateM6ExportReadiness, M6EvidenceError } from "./m6-evidence";

export class M6ExportError extends Error {
  readonly code: "PROJECT_NOT_FOUND" | "EXPORT_BLOCKED" | "VERSION_NOT_FOUND" | "VERSION_NOT_DELETABLE" | "VERSION_IN_USE" | "STORAGE_FAILED";
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
    versions: Array<{
      id: string;
      versionNumber: number;
      source: string;
      summary: string;
      wordCount: number;
      preview: string;
      createdAt: string;
      isLatest: boolean;
    }>;
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
       JOIN outlines o ON o.id = s.outline_id
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
        AND o.id = (
          SELECT current_outline.id FROM outlines current_outline
           WHERE current_outline.owner_user_id = s.owner_user_id
             AND current_outline.project_id = s.project_id
           ORDER BY current_outline.version_number DESC, current_outline.created_at DESC
           LIMIT 1
        )
      ORDER BY s.position, s.created_at`,
  ).bind(actor.userId, project.id).all<{
    id: string; slug: string; title: string; position: number; status: string;
    word_count: number; version_id: string | null; version_number: number | null;
  }>();
  const versionRows = await db.prepare(
    `SELECT v.id, v.section_id, v.version_number, v.source, v.summary, v.content, v.created_at
       FROM section_versions v
       JOIN sections s ON s.id = v.section_id
       JOIN outlines o ON o.id = s.outline_id
      WHERE v.owner_user_id = ? AND v.project_id = ?
        AND NOT EXISTS (
          SELECT 1 FROM section_version_adoptions candidate
           WHERE candidate.version_id = v.id
        )
        AND o.id = (
          SELECT current_outline.id FROM outlines current_outline
           WHERE current_outline.owner_user_id = v.owner_user_id
             AND current_outline.project_id = v.project_id
           ORDER BY current_outline.version_number DESC, current_outline.created_at DESC
           LIMIT 1
        )
      ORDER BY s.position, v.version_number DESC, v.created_at DESC`,
  ).bind(actor.userId, project.id).all<{
    id: string; section_id: string; version_number: number; source: string;
    summary: string; content: string; created_at: string;
  }>();
  const versionsBySection = new Map<string, typeof versionRows.results>();
  for (const version of versionRows.results ?? []) {
    const current = versionsBySection.get(version.section_id) ?? [];
    current.push(version);
    versionsBySection.set(version.section_id, current);
  }
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
    sections: (sections.results ?? []).map((section) => {
      const versions = versionsBySection.get(section.id) ?? [];
      return {
        id: section.id,
        slug: section.slug,
        title: section.title,
        position: section.position,
        status: section.status,
        versionId: section.version_id,
        versionNumber: section.version_number,
        wordCount: section.word_count,
        versions: versions.map((version, index) => ({
          id: version.id,
          versionNumber: version.version_number,
          source: version.source,
          summary: version.summary,
          wordCount: countWords(version.content),
          preview: compactPreview(version.content),
          createdAt: version.created_at,
          isLatest: index === 0,
        })),
      };
    }),
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

export async function createM6DocxExport(
  actor: M3Actor,
  requestedProjectId: string,
  versionIds: string[],
  storage: StorageAdapter = getMaterialStorageAdapter(),
  headingPrefixStyle: M6HeadingPrefixStyle = "none",
) {
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
      `SELECT v.content, v.content_json, s.title, s.slug FROM section_versions v JOIN sections s ON s.id = v.section_id
       WHERE v.id = ? AND v.owner_user_id = ? AND v.project_id = ?`,
    ).bind(versionId, actor.userId, project.id).first<{ content: string; content_json: string | null; title: string; slug: string }>();
    if (!version) throw new M6ExportError("VERSION_NOT_FOUND", "章节版本不存在或不属于当前用户。");
    sections.push({
      title: version.title,
      slug: version.slug,
      content: version.content,
      document: parseDocumentContent(version.content_json, version.content),
    });
    const rows = await db.prepare(
      `SELECT c.citation_key, l.title, l.authors_json, l.year, l.source, l.doi
       FROM citations c JOIN literature_records l ON l.id = c.literature_id
       WHERE c.section_version_id = ? AND c.owner_user_id = ? AND c.project_id = ?
       ORDER BY c.created_at`,
    ).bind(versionId, actor.userId, project.id).all<{ citation_key: string; title: string; authors_json: string; year: number | null; source: string | null; doi: string | null }>();
    for (const row of rows.results ?? []) references.set(row.citation_key, { citationKey: row.citation_key, title: row.title, authors: stringArray(row.authors_json), year: row.year, source: row.source, doi: row.doi });
  }
  const assets = await loadExportAssets(db, storage, actor, project.id, sections);
  const bytes = createM6Docx({ title: project.title, sections, references: [...references.values()], assets, headingPrefixStyle });
  const objectKey = `users/${actor.userId}/projects/${project.id}/exports/${exportId}.docx`;
  try {
    await storage.put(objectKey, bytes.buffer as ArrayBuffer, { contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", contentHash: await sha256Hex(bytes) });
    await db.prepare(
      `INSERT INTO export_records (id, owner_user_id, project_id, format, source_version_ids_json, object_key, status, readiness_report_json)
       VALUES (?, ?, ?, 'docx', ?, ?, 'ready', ?)`,
    ).bind(exportId, actor.userId, project.id, JSON.stringify(readiness.checkedVersionIds), objectKey, JSON.stringify({ ...readiness, headingPrefixStyle })).run();
  } catch {
    await storage.delete(objectKey).catch(() => undefined);
    throw new M6ExportError("STORAGE_FAILED", "DOCX 存储失败，未创建可下载记录。");
  }
  return { id: exportId, format: "docx" as const, status: "ready" as const, objectKey, sourceVersionIds: readiness.checkedVersionIds, readiness };
}

export async function deleteM6SectionVersion(
  actor: M3Actor,
  requestedProjectId: string,
  versionId: string,
): Promise<{ versionId: string; deleted: true }> {
  const db = getD1();
  const project = await resolveProject(db, actor, requestedProjectId);
  const version = await db.prepare(
    `SELECT v.id, v.section_id, v.version_number,
            (SELECT MAX(latest.version_number) FROM section_versions latest
              WHERE latest.section_id = v.section_id
                AND latest.owner_user_id = v.owner_user_id
                AND latest.project_id = v.project_id
                AND NOT EXISTS (
                  SELECT 1 FROM section_version_adoptions candidate
                   WHERE candidate.version_id = latest.id
                )) AS latest_number
       FROM section_versions v
      WHERE v.id = ? AND v.owner_user_id = ? AND v.project_id = ?`,
  ).bind(versionId, actor.userId, project.id).first<{
    id: string; section_id: string; version_number: number; latest_number: number;
  }>();
  if (!version) throw new M6ExportError("VERSION_NOT_FOUND", "章节版本不存在或不属于当前用户。");
  if (version.version_number === version.latest_number) {
    throw new M6ExportError("VERSION_NOT_DELETABLE", "每章最新版本必须保留；请先创建或恢复一个新版本，再删除旧版本。");
  }
  const exports = await db.prepare(
    `SELECT source_version_ids_json FROM export_records
      WHERE owner_user_id = ? AND project_id = ?`,
  ).bind(actor.userId, project.id).all<{ source_version_ids_json: string }>();
  if ((exports.results ?? []).some((item) => stringArray(item.source_version_ids_json).includes(version.id))) {
    throw new M6ExportError("VERSION_IN_USE", "该版本已用于历史 DOCX 导出，必须保留以维持导出来源可追溯。");
  }
  const reference = await db.prepare(
    `SELECT 1 AS used FROM section_versions WHERE source_version_id = ?
     UNION ALL SELECT 1 FROM section_version_adoptions WHERE version_id = ?
     UNION ALL SELECT 1 FROM ai_tasks WHERE reviewed_version_id = ? OR result_version_id = ?
     UNION ALL SELECT 1 FROM ai_task_results WHERE created_version_id = ?
     UNION ALL SELECT 1 FROM review_reports WHERE reviewed_version_id = ?
     UNION ALL SELECT 1 FROM review_issue_decisions WHERE resolved_version_id = ?
     UNION ALL SELECT 1 FROM citations WHERE section_version_id = ?
     UNION ALL SELECT 1 FROM claims WHERE section_version_id = ?
     UNION ALL SELECT 1 FROM revision_tasks WHERE base_version_id = ? OR result_version_id = ?
     UNION ALL SELECT 1 FROM presentation_projects WHERE source_section_version_id = ?
     UNION ALL SELECT 1 FROM presentation_versions WHERE source_section_version_id = ?
     UNION ALL SELECT 1 FROM section_candidate_decisions
       WHERE candidate_version_id = ? OR base_version_id = ? OR result_version_id = ?
     UNION ALL SELECT 1 FROM agent_context_snapshots WHERE section_version_id = ?
     LIMIT 1`,
  ).bind(
    version.id,
    version.id,
    version.id, version.id,
    version.id,
    version.id,
    version.id,
    version.id,
    version.id,
    version.id, version.id,
    version.id,
    version.id,
    version.id, version.id, version.id,
    version.id,
  ).first<{ used: number }>();
  if (reference) {
    throw new M6ExportError("VERSION_IN_USE", "该版本仍被任务、证据、审阅、恢复链或上下文快照引用，不能删除。");
  }
  try {
    await db.prepare(
      `DELETE FROM section_versions
        WHERE id = ? AND owner_user_id = ? AND project_id = ? AND section_id = ?`,
    ).bind(version.id, actor.userId, project.id, version.section_id).run();
  } catch {
    throw new M6ExportError("VERSION_IN_USE", "该版本仍被系统记录引用，不能删除。");
  }
  return { versionId: version.id, deleted: true };
}

async function loadExportAssets(
  db: D1Database,
  storage: StorageAdapter,
  actor: M3Actor,
  projectId: string,
  sections: M6DocxSection[],
): Promise<M6DocxAsset[]> {
  const assetIds = [...new Set(sections.flatMap((section) => section.document?.blocks
    .filter((block): block is ImageBlock => block.type === "image")
    .map((block) => block.assetId) ?? []))];
  const assets: M6DocxAsset[] = [];
  for (const assetId of assetIds) {
    const row = await db.prepare(
      `SELECT filename, content_type, object_key FROM parsed_document_assets
       WHERE id = ? AND owner_user_id = ? AND project_id = ? LIMIT 1`,
    ).bind(assetId, actor.userId, projectId).first<{
      filename: string;
      content_type: string;
      object_key: string;
    }>();
    if (!row) continue;
    const body = await storage.get(row.object_key);
    if (!body) continue;
    assets.push({
      id: assetId,
      filename: row.filename,
      contentType: row.content_type,
      bytes: new Uint8Array(body),
    });
  }
  return assets;
}

function stringArray(value: string): string[] { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []; } catch { return []; } }
function compactPreview(value: string): string { return value.replace(/\s+/gu, " ").trim().slice(0, 520); }
function countWords(value: string): number { return [...value.trim()].filter((character) => !/\s/u.test(character)).length; }

async function resolveProject(db: D1Database, actor: M3Actor, requestedProjectId: string) {
  if (!requestedProjectId || requestedProjectId === "demo") throw new M6ExportError("PROJECT_NOT_FOUND", "缺少明确的项目上下文，请先选择项目。");
  const project = await db.prepare("SELECT id, title FROM projects WHERE id = ? AND owner_user_id = ? AND status = 'active'").bind(requestedProjectId, actor.userId).first<{ id: string; title: string }>();
  if (!project) throw new M6ExportError("PROJECT_NOT_FOUND", "项目不存在或不属于当前用户。");
  return project;
}
