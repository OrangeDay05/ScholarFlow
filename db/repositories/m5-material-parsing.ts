import type { M3Actor } from "@/app/lib/m3-server-identity";
import {
  formatFromExtension,
  MaterialParseError,
  parseTextReferenceMaterial,
} from "@/app/lib/material-parsers/text-reference-parsers";
import {
  DocumentParseError,
  parseDocx,
  parseTextPdf,
} from "@/app/lib/material-parsers/document-parsers";
import type { StorageAdapter } from "@/app/lib/storage/storage-adapter";
import { getD1 } from "../index";

export type M5ParseRunSnapshot = {
  id: string;
  materialId: string;
  materialObjectId: string;
  format: string;
  parserKey: string;
  parserVersion: string;
  status: "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  recordCount: number;
  chunkCount: number;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  finishedAt: string | null;
};

export type M5MaterialChunkSnapshot = {
  id: string;
  parseRunId: string;
  ordinal: number;
  text: string;
  location: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

export class M5MaterialParseRepositoryError extends Error {
  readonly code:
    | "PROJECT_NOT_FOUND"
    | "MATERIAL_NOT_FOUND"
    | "OBJECT_NOT_READY"
    | "OBJECT_MISSING"
    | "UNSUPPORTED_FORMAT"
    | "PARSE_FAILED"
    | "DATABASE_WRITE_FAILED";

  constructor(
    code:
      | "PROJECT_NOT_FOUND"
      | "MATERIAL_NOT_FOUND"
      | "OBJECT_NOT_READY"
      | "OBJECT_MISSING"
      | "UNSUPPORTED_FORMAT"
      | "PARSE_FAILED"
      | "DATABASE_WRITE_FAILED",
    message: string,
  ) {
    super(message);
    this.code = code;
  }
}

type SourceRow = {
  material_id: string;
  material_object_id: string;
  object_key: string;
  detected_extension: string;
  content_hash: string;
};

type RunRow = {
  id: string;
  material_id: string;
  material_object_id: string;
  format: string;
  parser_key: string;
  parser_version: string;
  status: M5ParseRunSnapshot["status"];
  record_count: number;
  chunk_count: number;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  finished_at: string | null;
};

export async function parseM5MaterialForActor(
  actor: M3Actor,
  requestedProjectId: string,
  materialId: string,
  idempotencyKey: string,
  storage: StorageAdapter,
): Promise<{ run: M5ParseRunSnapshot; replayed: boolean }> {
  const db = getD1();
  const projectId = await ownedProjectId(db, actor.userId, requestedProjectId);
  const replay = await findRun(db, actor.userId, projectId, idempotencyKey);
  if (replay) return { run: toRunSnapshot(replay), replayed: true };
  const source = await sourceObject(db, actor.userId, projectId, materialId);
  if (!source) throw new M5MaterialParseRepositoryError("MATERIAL_NOT_FOUND", "材料不存在或不属于当前用户。" );
  const format = (() => {
    try { return formatFromExtension(source.detected_extension); }
    catch { throw new M5MaterialParseRepositoryError("UNSUPPORTED_FORMAT", "当前批次仅支持 TXT、CSV、BibTeX 和 RIS。" ); }
  })();
  const runId = crypto.randomUUID();
  const parserKey = format === "PDF" ? "unpdf-text" : `builtin-${format.toLowerCase()}`;
  const parserVersion = "1.0.0";
  try {
    await db.batch([
      db.prepare(`INSERT INTO material_parse_runs (
        id, owner_user_id, project_id, material_id, material_object_id,
        parser_key, parser_version, format, content_hash, status, idempotency_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'RUNNING', ?)`).bind(
        runId, actor.userId, projectId, materialId, source.material_object_id,
        parserKey, parserVersion, format, source.content_hash, idempotencyKey,
      ),
      db.prepare(`UPDATE materials SET status = 'parsing', error_code = NULL,
        error_message = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND owner_user_id = ? AND project_id = ?`).bind(materialId, actor.userId, projectId),
    ]);
  } catch {
    const raced = await findRun(db, actor.userId, projectId, idempotencyKey).catch(() => null);
    if (raced) return { run: toRunSnapshot(raced), replayed: true };
    throw new M5MaterialParseRepositoryError("DATABASE_WRITE_FAILED", "无法建立解析运行记录。" );
  }

  try {
    const body = await storage.get(source.object_key);
    if (!body) throw new M5MaterialParseRepositoryError("OBJECT_MISSING", "原始文件对象不存在。" );
    const parsed = format === "DOCX"
      ? parseDocx(body)
      : format === "PDF"
        ? await parseTextPdf(body)
        : parseTextReferenceMaterial(body, format);
    const chunkStatements: D1PreparedStatement[] = [];
    for (const chunk of parsed.chunks) {
      chunkStatements.push(db.prepare(`INSERT INTO material_chunks (
        id, owner_user_id, project_id, material_id, parse_run_id, ordinal,
        text, location_json, metadata_json, content_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        crypto.randomUUID(), actor.userId, projectId, materialId, runId, chunk.ordinal,
        chunk.text, JSON.stringify(chunk.location), JSON.stringify(chunk.metadata), await sha256(chunk.text),
      ));
    }
    await db.batch([
      ...chunkStatements,
      db.prepare(`UPDATE material_parse_runs SET status = 'SUCCEEDED', record_count = ?,
        chunk_count = ?, finished_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND owner_user_id = ?`).bind(parsed.recordCount, parsed.chunks.length, runId, actor.userId),
      db.prepare(`UPDATE materials SET status = 'success', error_code = NULL,
        error_message = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND owner_user_id = ? AND project_id = ?`).bind(materialId, actor.userId, projectId),
    ]);
  } catch (error) {
    const code = error instanceof MaterialParseError || error instanceof DocumentParseError
      ? error.code
      : error instanceof M5MaterialParseRepositoryError
        ? error.code
        : "PARSE_FAILED";
    const message = error instanceof Error ? error.message : "材料解析失败。";
    await db.batch([
      db.prepare(`DELETE FROM material_chunks WHERE parse_run_id = ? AND owner_user_id = ?`).bind(runId, actor.userId),
      db.prepare(`UPDATE material_parse_runs SET status = 'FAILED', error_code = ?, error_message = ?,
        finished_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_user_id = ?`).bind(code, message, runId, actor.userId),
      db.prepare(`UPDATE materials SET status = 'failed', error_code = ?, error_message = ?,
        updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_user_id = ? AND project_id = ?`).bind(code, message, materialId, actor.userId, projectId),
    ]).catch(() => undefined);
    throw new M5MaterialParseRepositoryError("PARSE_FAILED", message);
  }
  const completed = await loadRun(db, actor.userId, projectId, runId);
  if (!completed) throw new M5MaterialParseRepositoryError("DATABASE_WRITE_FAILED", "解析完成但无法读取运行记录。" );
  return { run: toRunSnapshot(completed), replayed: false };
}

export async function listM5ParseRunsForActor(actor: M3Actor, requestedProjectId: string, materialId: string) {
  const db = getD1();
  const projectId = await ownedProjectId(db, actor.userId, requestedProjectId);
  const rows = await db.prepare(`${runSelect()} WHERE owner_user_id = ? AND project_id = ? AND material_id = ? ORDER BY created_at DESC`).bind(actor.userId, projectId, materialId).all<RunRow>();
  return (rows.results ?? []).map(toRunSnapshot);
}

export async function listM5ChunksForActor(actor: M3Actor, requestedProjectId: string, materialId: string, parseRunId: string): Promise<M5MaterialChunkSnapshot[]> {
  const db = getD1();
  const projectId = await ownedProjectId(db, actor.userId, requestedProjectId);
  const rows = await db.prepare(`SELECT id, parse_run_id, ordinal, text, location_json, metadata_json
    FROM material_chunks WHERE owner_user_id = ? AND project_id = ? AND material_id = ? AND parse_run_id = ? ORDER BY ordinal`).bind(actor.userId, projectId, materialId, parseRunId).all<{ id: string; parse_run_id: string; ordinal: number; text: string; location_json: string; metadata_json: string }>();
  return (rows.results ?? []).map((row) => ({ id: row.id, parseRunId: row.parse_run_id, ordinal: row.ordinal, text: row.text, location: JSON.parse(row.location_json), metadata: JSON.parse(row.metadata_json) }));
}

async function ownedProjectId(db: D1Database, ownerUserId: string, requestedProjectId: string): Promise<string> {
  const row = requestedProjectId === "demo"
    ? await db.prepare("SELECT id FROM projects WHERE owner_user_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1").bind(ownerUserId).first<{ id: string }>()
    : await db.prepare("SELECT id FROM projects WHERE id = ? AND owner_user_id = ? AND status = 'active'").bind(requestedProjectId, ownerUserId).first<{ id: string }>();
  if (!row) throw new M5MaterialParseRepositoryError("PROJECT_NOT_FOUND", "项目不存在或不属于当前用户。" );
  return row.id;
}

async function sourceObject(db: D1Database, ownerUserId: string, projectId: string, materialId: string): Promise<SourceRow | null> {
  return db.prepare(`SELECT m.id AS material_id, mo.id AS material_object_id, mo.object_key,
    mo.detected_extension, mo.content_hash FROM materials m JOIN material_objects mo ON mo.material_id = m.id
    WHERE m.id = ? AND m.owner_user_id = ? AND m.project_id = ? AND mo.status = 'STORED'
    ORDER BY mo.created_at DESC LIMIT 1`).bind(materialId, ownerUserId, projectId).first<SourceRow>();
}

function runSelect() { return `SELECT id, material_id, material_object_id, format, parser_key, parser_version,
  status, record_count, chunk_count, error_code, error_message, created_at, finished_at FROM material_parse_runs`; }
async function findRun(db: D1Database, owner: string, project: string, key: string) { return db.prepare(`${runSelect()} WHERE owner_user_id = ? AND project_id = ? AND idempotency_key = ?`).bind(owner, project, key).first<RunRow>(); }
async function loadRun(db: D1Database, owner: string, project: string, id: string) { return db.prepare(`${runSelect()} WHERE owner_user_id = ? AND project_id = ? AND id = ?`).bind(owner, project, id).first<RunRow>(); }
function toRunSnapshot(row: RunRow): M5ParseRunSnapshot { return { id: row.id, materialId: row.material_id, materialObjectId: row.material_object_id, format: row.format, parserKey: row.parser_key, parserVersion: row.parser_version, status: row.status, recordCount: row.record_count, chunkCount: row.chunk_count, errorCode: row.error_code, errorMessage: row.error_message, createdAt: row.created_at, finishedAt: row.finished_at }; }
async function sha256(value: string): Promise<string> { const bytes = new TextEncoder().encode(value); const digest = await crypto.subtle.digest("SHA-256", bytes); return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(""); }
