import type { M3Actor } from "@/app/lib/m3-server-identity";
import { getD1 } from "../index";
import { evaluateM6ExportReadiness } from "./m6-evidence";

type Context = { userId: string; projectId: string };
export type M6ReviewPerspective = "METHOD" | "EVIDENCE" | "LOGIC" | "REPORTING" | "LANGUAGE";

export class M6ReviewSubmissionError extends Error {
  readonly code: "PROJECT_NOT_FOUND" | "VERSION_NOT_FOUND" | "EVIDENCE_NOT_FOUND" | "INVALID_INPUT";
  constructor(code: M6ReviewSubmissionError["code"], message: string) { super(message); this.code = code; }
}

export async function createM6AdvancedReview(actor: M3Actor, requestedProjectId: string, input: {
  versionIds: string[];
  findings: Array<{ perspective: M6ReviewPerspective; severity: "major" | "minor" | "note"; sectionId?: string; summary: string; evidenceBindingIds: string[] }>;
}) {
  const db = getD1(); const context = await resolveContext(db, actor, requestedProjectId);
  const versionIds = [...new Set(input.versionIds)];
  if (!versionIds.length || versionIds.length > 100 || input.findings.length > 500) throw new M6ReviewSubmissionError("INVALID_INPUT", "审阅版本或问题数量超出范围。");
  for (const id of versionIds) await requireVersion(db, context, id);
  const runId = crypto.randomUUID(); const statements: D1PreparedStatement[] = [db.prepare(
    `INSERT INTO review_runs (id, owner_user_id, project_id, scope_json, status) VALUES (?, ?, ?, ?, 'succeeded')`,
  ).bind(runId, context.userId, context.projectId, JSON.stringify({ versionIds, perspectives: [...new Set(input.findings.map((item) => item.perspective))] }))];
  for (const finding of input.findings) {
    if (!finding.summary.trim()) throw new M6ReviewSubmissionError("INVALID_INPUT", "审阅问题摘要不能为空。");
    for (const evidenceId of finding.evidenceBindingIds) {
      const evidence = await db.prepare("SELECT id FROM evidence_bindings WHERE id = ? AND owner_user_id = ? AND project_id = ?").bind(evidenceId, context.userId, context.projectId).first<{ id: string }>();
      if (!evidence) throw new M6ReviewSubmissionError("EVIDENCE_NOT_FOUND", "审阅引用了不可访问的证据绑定。");
    }
    if (finding.sectionId) {
      const section = await db.prepare("SELECT id FROM sections WHERE id = ? AND owner_user_id = ? AND project_id = ?").bind(finding.sectionId, context.userId, context.projectId).first<{ id: string }>();
      if (!section) throw new M6ReviewSubmissionError("VERSION_NOT_FOUND", "审阅章节不存在或不属于当前用户。");
    }
    statements.push(db.prepare(
      `INSERT INTO review_findings (id, owner_user_id, project_id, review_run_id, perspective, severity, section_id, summary, evidence_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(crypto.randomUUID(), context.userId, context.projectId, runId, finding.perspective, finding.severity, finding.sectionId ?? null, finding.summary.trim(), JSON.stringify(finding.evidenceBindingIds)));
  }
  await db.batch(statements);
  return { id: runId, status: "succeeded" as const, versionIds, findingCount: input.findings.length };
}

export async function prepareM6Submission(actor: M3Actor, requestedProjectId: string, input: {
  versionIds: string[];
  dataAvailabilityStatement: string;
  checklist: Record<string, boolean>;
}) {
  const db = getD1(); const context = await resolveContext(db, actor, requestedProjectId);
  const readiness = await evaluateM6ExportReadiness(actor, context.projectId, input.versionIds);
  const blockers = [...readiness.blockers];
  const hasData = await db.prepare("SELECT id FROM materials WHERE owner_user_id = ? AND project_id = ? AND kind = 'data' AND status <> 'deleted' LIMIT 1").bind(context.userId, context.projectId).first<{ id: string }>();
  if (hasData && !input.dataAvailabilityStatement.trim()) blockers.push({ code: "DATA_AVAILABILITY_MISSING", message: "项目包含数据材料，投稿前必须填写数据可用性说明。" });
  const incomplete = Object.entries(input.checklist).filter(([, value]) => value !== true).map(([key]) => key);
  if (incomplete.length) blockers.push({ code: "CHECKLIST_INCOMPLETE", message: `投稿检查项未完成：${incomplete.join(", ")}` });
  const status = blockers.length ? "blocked" : "ready";
  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO submission_preparations (id, owner_user_id, project_id, status, checklist_json, data_availability_statement)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(id, context.userId, context.projectId, status, JSON.stringify({ versionIds: readiness.checkedVersionIds, items: input.checklist, blockers, warnings: readiness.warnings }), input.dataAvailabilityStatement.trim()).run();
  return { id, status, blockers, warnings: readiness.warnings };
}

async function resolveContext(db: D1Database, actor: M3Actor, requestedProjectId: string): Promise<Context> {
  const project = requestedProjectId === "demo" ? await db.prepare("SELECT id FROM projects WHERE owner_user_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1").bind(actor.userId).first<{ id: string }>() : await db.prepare("SELECT id FROM projects WHERE id = ? AND owner_user_id = ? AND status = 'active'").bind(requestedProjectId, actor.userId).first<{ id: string }>();
  if (!project) throw new M6ReviewSubmissionError("PROJECT_NOT_FOUND", "项目不存在或不属于当前用户。"); return { userId: actor.userId, projectId: project.id };
}
async function requireVersion(db: D1Database, context: Context, id: string) { const row = await db.prepare("SELECT id FROM section_versions WHERE id = ? AND owner_user_id = ? AND project_id = ?").bind(id, context.userId, context.projectId).first<{ id: string }>(); if (!row) throw new M6ReviewSubmissionError("VERSION_NOT_FOUND", "章节版本不存在或不属于当前用户。"); }
