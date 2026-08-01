import type { M3Actor } from "@/app/lib/m3-server-identity";
import type { M6EvidenceBindingInput, M6ExportReadiness } from "@/app/lib/m6-evidence-contracts";
import { verifyEvidenceText } from "@/app/lib/m6-evidence-contracts";
import { getD1 } from "../index";

type Context = { userId: string; projectId: string };

export class M6EvidenceError extends Error {
  readonly code: "PROJECT_NOT_FOUND" | "VERSION_NOT_FOUND" | "CLAIM_NOT_FOUND" | "SOURCE_NOT_FOUND" | "INVALID_INPUT";
  constructor(code: M6EvidenceError["code"], message: string) { super(message); this.code = code; }
}

export async function createM6Claim(actor: M3Actor, requestedProjectId: string, input: {
  sectionVersionId: string;
  text: string;
  startOffset?: number;
  endOffset?: number;
}): Promise<{ id: string }> {
  const db = getD1();
  const context = await resolveContext(db, actor, requestedProjectId);
  if (!input.text.trim()) throw new M6EvidenceError("INVALID_INPUT", "论断不能为空。");
  await requireVersion(db, context, input.sectionVersionId);
  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO claims (id, owner_user_id, project_id, section_version_id, text, start_offset, end_offset)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, context.userId, context.projectId, input.sectionVersionId, input.text.trim(), input.startOffset ?? null, input.endOffset ?? null).run();
  return { id };
}

export async function bindM6Evidence(actor: M3Actor, requestedProjectId: string, input: M6EvidenceBindingInput): Promise<{
  id: string; verificationStatus: "VERIFIED" | "UNVERIFIED" | "CONFLICTING"; verificationNote: string;
}> {
  const db = getD1();
  const context = await resolveContext(db, actor, requestedProjectId);
  const claim = await db.prepare(
    `SELECT id FROM claims WHERE id = ? AND owner_user_id = ? AND project_id = ?`,
  ).bind(input.claimId, context.userId, context.projectId).first<{ id: string }>();
  if (!claim) throw new M6EvidenceError("CLAIM_NOT_FOUND", "论断不存在或不属于当前用户。");
  const chunk = await db.prepare(
    `SELECT c.id, c.text, c.location_json
     FROM material_chunks c
     JOIN material_parse_runs r ON r.id = c.parse_run_id
     JOIN materials m ON m.id = c.material_id
     WHERE c.id = ? AND c.material_id = ? AND c.owner_user_id = ? AND c.project_id = ?
       AND r.status = 'SUCCEEDED' AND m.status = 'success'
       AND r.id = (
         SELECT latest.id FROM material_parse_runs latest
         WHERE latest.material_id = c.material_id AND latest.owner_user_id = c.owner_user_id
           AND latest.project_id = c.project_id AND latest.status = 'SUCCEEDED'
         ORDER BY latest.created_at DESC, latest.id DESC LIMIT 1
       )`,
  ).bind(input.materialChunkId, input.materialId, context.userId, context.projectId).first<{
    id: string; text: string; location_json: string;
  }>();
  if (!chunk) throw new M6EvidenceError("SOURCE_NOT_FOUND", "来源片段不存在、解析未成功或不是最新成功版本。");
  const verification = verifyEvidenceText({ chunkText: chunk.text, quote: input.quote, supportLevel: input.supportLevel });
  const location = safeObject(chunk.location_json);
  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO evidence_bindings (
       id, owner_user_id, project_id, claim_id, material_id, material_chunk_id,
       page, paragraph, quote, support_level, verification_status, risk_level,
       verification_note, verified_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, context.userId, context.projectId, input.claimId, input.materialId, input.materialChunkId,
    numberOrNull(location.page), stringOrNull(location.paragraph ?? location.paragraphIndex ?? location.lineStart),
    input.quote.trim(), input.supportLevel, verification.status, input.riskLevel,
    input.verificationNote?.trim() || verification.note,
    verification.status === "VERIFIED" ? new Date().toISOString() : null,
  ).run();
  return { id, verificationStatus: verification.status, verificationNote: input.verificationNote?.trim() || verification.note };
}

export async function evaluateM6ExportReadiness(actor: M3Actor, requestedProjectId: string, versionIds: string[]): Promise<M6ExportReadiness> {
  const db = getD1();
  const context = await resolveContext(db, actor, requestedProjectId);
  const uniqueIds = [...new Set(versionIds.filter(Boolean))];
  if (!uniqueIds.length || uniqueIds.length > 100) throw new M6EvidenceError("INVALID_INPUT", "导出必须选择 1—100 个章节版本。");
  for (const versionId of uniqueIds) await requireVersion(db, context, versionId);
  const blockers: M6ExportReadiness["blockers"] = [];
  const warnings: M6ExportReadiness["warnings"] = [];
  for (const versionId of uniqueIds) {
    const claims = await db.prepare(
      `SELECT c.id, c.text,
         SUM(CASE WHEN e.verification_status = 'VERIFIED' THEN 1 ELSE 0 END) AS verified_count,
         SUM(CASE WHEN e.risk_level = 'HIGH_RISK' THEN 1 ELSE 0 END) AS high_risk_count,
         SUM(CASE WHEN e.verification_status = 'CONFLICTING' THEN 1 ELSE 0 END) AS conflicting_count
       FROM claims c LEFT JOIN evidence_bindings e
         ON e.claim_id = c.id AND e.owner_user_id = c.owner_user_id AND e.project_id = c.project_id
       WHERE c.section_version_id = ? AND c.owner_user_id = ? AND c.project_id = ?
       GROUP BY c.id, c.text`,
    ).bind(versionId, context.userId, context.projectId).all<{
      id: string; text: string; verified_count: number; high_risk_count: number; conflicting_count: number;
    }>();
    for (const claim of claims.results ?? []) {
      if (claim.conflicting_count > 0) blockers.push({ code: "CONFLICTING_EVIDENCE", message: "论断存在与来源片段冲突的证据绑定。", claimId: claim.id });
      else if (claim.high_risk_count > 0 && claim.verified_count === 0) blockers.push({ code: "HIGH_RISK_UNVERIFIED", message: "高风险论断缺少已核验来源，不能导出。", claimId: claim.id });
      else if (claim.verified_count === 0) warnings.push({ code: "CLAIM_UNVERIFIED", message: "普通论断尚无已核验证据。", claimId: claim.id });
    }
    const unverifiedCitations = await db.prepare(
      `SELECT c.id FROM citations c JOIN literature_records l ON l.id = c.literature_id
       WHERE c.section_version_id = ? AND c.owner_user_id = ? AND c.project_id = ?
         AND l.metadata_status <> 'verified'`,
    ).bind(versionId, context.userId, context.projectId).all<{ id: string }>();
    if ((unverifiedCitations.results ?? []).length) blockers.push({ code: "CITATION_METADATA_UNVERIFIED", message: "存在元数据未核验的正式引用。" });
  }
  return { ready: blockers.length === 0, checkedVersionIds: uniqueIds, blockers, warnings };
}

async function resolveContext(db: D1Database, actor: M3Actor, requestedProjectId: string): Promise<Context> {
  if (!requestedProjectId || requestedProjectId === "demo") throw new M6EvidenceError("PROJECT_NOT_FOUND", "缺少明确的项目上下文，请先选择项目。");
  const project = await db.prepare("SELECT id FROM projects WHERE id = ? AND owner_user_id = ? AND status = 'active'").bind(requestedProjectId, actor.userId).first<{ id: string }>();
  if (!project) throw new M6EvidenceError("PROJECT_NOT_FOUND", "项目不存在或不属于当前用户。");
  return { userId: actor.userId, projectId: project.id };
}

async function requireVersion(db: D1Database, context: Context, versionId: string) {
  const version = await db.prepare("SELECT id FROM section_versions WHERE id = ? AND owner_user_id = ? AND project_id = ?").bind(versionId, context.userId, context.projectId).first<{ id: string }>();
  if (!version) throw new M6EvidenceError("VERSION_NOT_FOUND", "章节版本不存在或不属于当前用户。");
}

function safeObject(value: string): Record<string, unknown> { try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; } }
function numberOrNull(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function stringOrNull(value: unknown): string | null { return typeof value === "string" || typeof value === "number" ? String(value) : null; }
