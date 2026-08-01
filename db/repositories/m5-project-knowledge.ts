import type { M3Actor } from "@/app/lib/m3-server-identity";
import { getD1 } from "../index";

export type M5KnowledgeHit = {
  materialId: string;
  filename: string;
  parseRunId: string;
  chunkId: string;
  ordinal: number;
  text: string;
  location: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

export class M5ProjectKnowledgeError extends Error {
  readonly code: "PROJECT_NOT_FOUND" | "INVALID_QUERY";
  constructor(code: M5ProjectKnowledgeError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

export async function searchM5ProjectKnowledge(
  actor: M3Actor,
  requestedProjectId: string,
  query: string,
  requestedLimit = 10,
): Promise<M5KnowledgeHit[]> {
  const normalized = query.trim().replace(/[%_]/gu, "");
  if (normalized.length < 2 || normalized.length > 200) {
    throw new M5ProjectKnowledgeError("INVALID_QUERY", "检索词长度必须为 2—200 个字符。" );
  }
  const limit = Math.min(Math.max(Math.trunc(requestedLimit) || 10, 1), 20);
  const db = getD1();
  const projectId = await ownedProjectId(db, actor.userId, requestedProjectId);
  const rows = await db.prepare(`SELECT mc.id AS chunk_id, mc.material_id, m.filename,
      mc.parse_run_id, mc.ordinal, mc.text, mc.location_json, mc.metadata_json
    FROM material_chunks mc
    JOIN material_parse_runs pr ON pr.id = mc.parse_run_id
    JOIN materials m ON m.id = mc.material_id
    WHERE mc.owner_user_id = ? AND mc.project_id = ? AND pr.status = 'SUCCEEDED'
      AND m.status = 'success' AND mc.text LIKE ? ESCAPE '\\'
      AND NOT EXISTS (
        SELECT 1 FROM material_parse_runs newer
        WHERE newer.material_id = pr.material_id AND newer.owner_user_id = pr.owner_user_id
          AND newer.project_id = pr.project_id AND newer.status = 'SUCCEEDED'
          AND (newer.created_at > pr.created_at OR (newer.created_at = pr.created_at AND newer.id > pr.id))
      )
    ORDER BY instr(lower(mc.text), lower(?)), mc.material_id, mc.ordinal
    LIMIT ?`).bind(actor.userId, projectId, `%${normalized}%`, normalized, limit).all<{
      chunk_id: string;
      material_id: string;
      filename: string;
      parse_run_id: string;
      ordinal: number;
      text: string;
      location_json: string;
      metadata_json: string;
    }>();
  return (rows.results ?? []).map((row) => ({
    materialId: row.material_id,
    filename: row.filename,
    parseRunId: row.parse_run_id,
    chunkId: row.chunk_id,
    ordinal: row.ordinal,
    text: row.text,
    location: JSON.parse(row.location_json),
    metadata: JSON.parse(row.metadata_json),
  }));
}

async function ownedProjectId(db: D1Database, ownerUserId: string, requestedProjectId: string): Promise<string> {
  if (!requestedProjectId || requestedProjectId === "demo") throw new M5ProjectKnowledgeError("PROJECT_NOT_FOUND", "缺少明确的项目上下文，请先选择项目。");
  const row = await db.prepare("SELECT id FROM projects WHERE id = ? AND owner_user_id = ? AND status = 'active'").bind(requestedProjectId, ownerUserId).first<{ id: string }>();
  if (!row) throw new M5ProjectKnowledgeError("PROJECT_NOT_FOUND", "项目不存在或不属于当前用户。" );
  return row.id;
}
