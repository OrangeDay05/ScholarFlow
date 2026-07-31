import { buildM5TextDiff, type M5ActionExecutionWorkspace } from "@/app/lib/m5-action-execution";
import type { M3Actor } from "@/app/lib/m3-server-identity";
import { createM4Task } from "./m4-tasks";
import { getD1 } from "../index";

export type M5ActionExecutionContext = {
  projectId: string;
  conversationSessionId: string;
  proposalId: string;
  productSkill: string;
  operation: string;
  sectionId: string;
  sectionTitle: string;
  baseVersionId: string;
  baseContent: string;
  excludedScope: string | null;
  authorizedMaterialIds: string[];
};

export class M5ActionExecutionError extends Error {
  readonly code:
    | "PROJECT_NOT_FOUND"
    | "PROPOSAL_NOT_FOUND"
    | "PROPOSAL_CONFIRMATION_REQUIRED"
    | "EXECUTION_SCOPE_REQUIRED"
    | "BASE_VERSION_CONFLICT"
    | "TASK_ALREADY_STARTED"
    | "CANDIDATE_NOT_FOUND"
    | "DATABASE_WRITE_FAILED";

  constructor(
    code:
      | "PROJECT_NOT_FOUND"
      | "PROPOSAL_NOT_FOUND"
      | "PROPOSAL_CONFIRMATION_REQUIRED"
      | "EXECUTION_SCOPE_REQUIRED"
      | "BASE_VERSION_CONFLICT"
      | "TASK_ALREADY_STARTED"
      | "CANDIDATE_NOT_FOUND"
      | "DATABASE_WRITE_FAILED",
    message: string,
  ) {
    super(message);
    this.code = code;
  }
}

export async function loadM5ActionExecutionContext(
  actor: M3Actor,
  requestedProjectId: string,
  conversationSessionId: string,
  proposalId: string,
): Promise<M5ActionExecutionContext> {
  const db = getD1();
  const projectId = await ownedProjectId(db, actor.userId, requestedProjectId);
  const row = await db.prepare(`
    SELECT p.id AS proposal_id, p.status AS proposal_status,
      p.conversation_session_id, i.product_skill, i.operation,
      i.authorized_material_ids_json, i.section_id, i.base_version_id,
      i.excluded_scope, s.title AS section_title, v.content AS base_content
    FROM conversation_action_proposals p
    JOIN conversation_tool_intents i ON i.id = p.tool_intent_id
    LEFT JOIN sections s ON s.id = i.section_id
    LEFT JOIN section_versions v ON v.id = i.base_version_id
    WHERE p.id = ? AND p.conversation_session_id = ?
      AND p.owner_user_id = ? AND p.project_id = ?
      AND i.owner_user_id = p.owner_user_id AND i.project_id = p.project_id
  `).bind(proposalId, conversationSessionId, actor.userId, projectId).first<{
    proposal_id: string;
    proposal_status: string;
    conversation_session_id: string;
    product_skill: string;
    operation: string;
    authorized_material_ids_json: string;
    section_id: string | null;
    base_version_id: string | null;
    excluded_scope: string | null;
    section_title: string | null;
    base_content: string | null;
  }>();
  if (!row) throw new M5ActionExecutionError("PROPOSAL_NOT_FOUND", "操作提案不存在或不属于当前用户与项目。");
  if (row.proposal_status !== "CONFIRMED") {
    throw new M5ActionExecutionError("PROPOSAL_CONFIRMATION_REQUIRED", "只有用户明确确认的操作提案才能执行。");
  }
  if (!row.section_id || !row.base_version_id || row.base_content === null || !row.section_title) {
    throw new M5ActionExecutionError("EXECUTION_SCOPE_REQUIRED", "操作提案缺少章节或基础版本，不能执行。");
  }
  const current = await currentFormalVersionId(db, actor.userId, projectId, row.section_id);
  if (current !== row.base_version_id) {
    throw new M5ActionExecutionError("BASE_VERSION_CONFLICT", "提案确认后基础正式版本已经变化，请重新整理操作提案。");
  }
  return {
    projectId,
    conversationSessionId: row.conversation_session_id,
    proposalId: row.proposal_id,
    productSkill: row.product_skill,
    operation: row.operation,
    sectionId: row.section_id,
    sectionTitle: row.section_title,
    baseVersionId: row.base_version_id,
    baseContent: row.base_content,
    excludedScope: row.excluded_scope,
    authorizedMaterialIds: JSON.parse(row.authorized_material_ids_json) as string[],
  };
}

export async function createAndClaimM5ActionTask(
  actor: M3Actor,
  requestedProjectId: string,
  context: M5ActionExecutionContext,
  model: { providerKey: string; providerModelId: string; modelKey: string; modelVersion: string; timeoutSeconds: number },
): Promise<string> {
  const task = await createM4Task(actor, requestedProjectId, {
    sectionId: context.sectionId,
    taskRole: "REVISER",
    productSkill: context.productSkill,
    taskType: "ACTION_PROPOSAL_REVISION",
    reviewMode: "none",
    selectedMaterialIds: context.authorizedMaterialIds,
    reviewedVersionId: context.baseVersionId,
    maxCalls: 1,
    timeoutSeconds: model.timeoutSeconds,
    idempotencyKey: taskIdempotencyKey(context.proposalId),
    models: [{
      role: "REVISER",
      providerKey: model.providerKey,
      modelKey: model.modelKey,
      modelVersion: model.modelVersion,
      skillKey: "writing-core/prompts-collection",
      skillVersion: "m10-production",
    }],
  });
  const db = getD1();
  const storedTask = await db.prepare(`SELECT execution_profile_id FROM ai_tasks
    WHERE id = ? AND owner_user_id = ? AND project_id = ?`)
    .bind(task.id, actor.userId, context.projectId)
    .first<{ execution_profile_id: string | null }>();
  if (!storedTask?.execution_profile_id) {
    const profileId = crypto.randomUUID();
    await db.batch([
      db.prepare(`INSERT INTO execution_profiles (
        id, owner_user_id, project_id, name, mode, max_models, max_calls,
        timeout_seconds, fallback_plan
      ) VALUES (?, ?, ?, ?, 'STANDARD', 1, 1, ?, 'NONE')`)
        .bind(profileId, actor.userId, context.projectId, "Action Proposal 单次修订", model.timeoutSeconds),
      db.prepare(`INSERT INTO execution_profile_models (
        id, execution_profile_id, provider_model_id, credential_metadata_id, role, priority
      ) VALUES (?, ?, ?, NULL, 'REVISER', 1)`)
        .bind(crypto.randomUUID(), profileId, model.providerModelId),
      db.prepare(`UPDATE ai_tasks SET execution_profile_id = ? WHERE id = ?
        AND owner_user_id = ? AND project_id = ?`)
        .bind(profileId, task.id, actor.userId, context.projectId),
    ]);
  }
  const result = await db.prepare(`
    UPDATE ai_tasks SET status = 'CALLING_MODEL', started_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND owner_user_id = ? AND project_id = ?
      AND status = 'QUEUED' AND calls_used = 0 AND max_calls = 1
  `).bind(new Date().toISOString(), task.id, actor.userId, context.projectId).run();
  if (Number(result.meta?.changes ?? 0) !== 1) {
    throw new M5ActionExecutionError("TASK_ALREADY_STARTED", "该操作提案已经开始或完成，系统不会再次调用模型。");
  }
  await db.prepare(`
    INSERT INTO ai_task_events (
      id, owner_user_id, project_id, task_id, from_status, to_status,
      actor_type, reason, detail_json
    ) VALUES (?, ?, ?, ?, 'QUEUED', 'CALLING_MODEL', 'USER', ?, '{}')
  `).bind(crypto.randomUUID(), actor.userId, context.projectId, task.id, "用户在正式确认门后启动单次模型调用。").run();
  return task.id;
}

export async function loadM5AuthorizedMaterialContext(
  actor: M3Actor,
  context: M5ActionExecutionContext,
): Promise<string> {
  if (!context.authorizedMaterialIds.length) return "未授权项目材料；仅使用绑定的基础章节。";
  const db = getD1();
  const placeholders = context.authorizedMaterialIds.map(() => "?").join(", ");
  const rows = await db.prepare(`
    SELECT m.filename, mc.ordinal, mc.text
    FROM material_chunks mc
    JOIN materials m ON m.id = mc.material_id
    JOIN material_parse_runs pr ON pr.id = mc.parse_run_id
    WHERE mc.owner_user_id = ? AND mc.project_id = ?
      AND mc.material_id IN (${placeholders})
      AND m.status = 'success' AND pr.status = 'SUCCEEDED'
      AND NOT EXISTS (
        SELECT 1 FROM material_parse_runs newer
        WHERE newer.material_id = pr.material_id
          AND newer.owner_user_id = pr.owner_user_id
          AND newer.project_id = pr.project_id
          AND newer.status = 'SUCCEEDED'
          AND (newer.created_at > pr.created_at OR
            (newer.created_at = pr.created_at AND newer.id > pr.id))
      )
    ORDER BY mc.material_id, mc.ordinal
    LIMIT 20
  `).bind(actor.userId, context.projectId, ...context.authorizedMaterialIds).all<{
    filename: string;
    ordinal: number;
    text: string;
  }>();
  const excerpts = (rows.results ?? []).map((row) => `[${row.filename} #${row.ordinal}]\n${row.text}`);
  if (!excerpts.length) return "授权材料尚无可用解析片段；仅使用绑定的基础章节。";
  return excerpts.join("\n\n").slice(0, 12_000);
}

export async function loadM5ActionExecutionWorkspace(
  actor: M3Actor,
  requestedProjectId: string,
  conversationSessionId: string,
  proposalId: string,
): Promise<M5ActionExecutionWorkspace> {
  const db = getD1();
  const projectId = await ownedProjectId(db, actor.userId, requestedProjectId);
  const row = await db.prepare(`
    SELECT p.id AS proposal_id, p.conversation_session_id,
      i.product_skill, i.operation, i.section_id, i.base_version_id,
      i.excluded_scope, i.authorized_material_ids_json,
      s.title AS section_title, base.content AS base_content,
      t.id AS task_id, t.status AS task_status, t.calls_used, t.max_calls,
      t.result_version_id, candidate.content AS candidate_content,
      candidate.summary AS candidate_summary,
      sva.adopted AS candidate_adopted,
      (SELECT r.id FROM provider_run_records r
       JOIN resolved_model_config_snapshots snap ON snap.id = r.snapshot_id
       WHERE snap.task_id = t.id ORDER BY r.started_at DESC LIMIT 1) AS provider_run_id,
      (SELECT COUNT(*) FROM section_candidate_decisions d
       WHERE d.candidate_version_id = t.result_version_id AND d.decision = 'REJECT') AS rejected_count,
      (SELECT d.result_version_id FROM section_candidate_decisions d
       WHERE d.candidate_version_id = t.result_version_id AND d.decision = 'ADOPT'
       ORDER BY d.decided_at DESC LIMIT 1) AS formal_version_id
    FROM conversation_action_proposals p
    JOIN conversation_tool_intents i ON i.id = p.tool_intent_id
    LEFT JOIN sections s ON s.id = i.section_id
    LEFT JOIN section_versions base ON base.id = i.base_version_id
    LEFT JOIN ai_tasks t ON t.owner_user_id = p.owner_user_id
      AND t.project_id = p.project_id AND t.idempotency_key = ?
    LEFT JOIN section_versions candidate ON candidate.id = t.result_version_id
    LEFT JOIN section_version_adoptions sva ON sva.version_id = candidate.id
    WHERE p.id = ? AND p.conversation_session_id = ?
      AND p.owner_user_id = ? AND p.project_id = ?
  `).bind(taskIdempotencyKey(proposalId), proposalId, conversationSessionId, actor.userId, projectId).first<{
    proposal_id: string;
    conversation_session_id: string;
    product_skill: string;
    operation: string;
    section_id: string | null;
    base_version_id: string | null;
    excluded_scope: string | null;
    authorized_material_ids_json: string;
    section_title: string | null;
    base_content: string | null;
    task_id: string | null;
    task_status: string | null;
    calls_used: number | null;
    max_calls: number | null;
    result_version_id: string | null;
    candidate_content: string | null;
    candidate_summary: string | null;
    candidate_adopted: number | null;
    provider_run_id: string | null;
    rejected_count: number | null;
    formal_version_id: string | null;
  }>();
  if (!row) throw new M5ActionExecutionError("PROPOSAL_NOT_FOUND", "操作提案不存在或不属于当前用户与项目。");
  return {
    proposalId: row.proposal_id,
    conversationSessionId: row.conversation_session_id,
    intent: {
      productSkill: row.product_skill,
      operation: row.operation,
      sectionId: row.section_id,
      sectionTitle: row.section_title,
      baseVersionId: row.base_version_id,
      excludedScope: row.excluded_scope,
      authorizedMaterialIds: JSON.parse(row.authorized_material_ids_json) as string[],
    },
    task: row.task_id ? {
      id: row.task_id,
      status: row.task_status ?? "UNKNOWN",
      callsUsed: row.calls_used ?? 0,
      maxCalls: row.max_calls ?? 1,
      providerRunId: row.provider_run_id,
    } : null,
    candidate: row.result_version_id && row.candidate_content !== null ? {
      id: row.result_version_id,
      content: row.candidate_content,
      summary: row.candidate_summary ?? "",
      adopted: Boolean(row.candidate_adopted),
      rejected: Boolean(row.rejected_count),
      formalVersionId: row.formal_version_id,
    } : null,
    baseContent: row.base_content,
    diff: row.base_content !== null && row.candidate_content !== null
      ? buildM5TextDiff(row.base_content, row.candidate_content)
      : [],
  };
}

export async function decideM5Candidate(
  actor: M3Actor,
  requestedProjectId: string,
  conversationSessionId: string,
  proposalId: string,
  decision: "REJECT" | "ADOPT",
  idempotencyKey: string,
): Promise<M5ActionExecutionWorkspace> {
  const db = getD1();
  const context = await loadM5ActionExecutionContext(actor, requestedProjectId, conversationSessionId, proposalId);
  const task = await db.prepare(`
    SELECT id, result_version_id FROM ai_tasks
    WHERE owner_user_id = ? AND project_id = ? AND idempotency_key = ? AND status = 'SUCCEEDED'
  `).bind(actor.userId, context.projectId, taskIdempotencyKey(proposalId)).first<{
    id: string;
    result_version_id: string | null;
  }>();
  if (!task?.result_version_id) throw new M5ActionExecutionError("CANDIDATE_NOT_FOUND", "当前提案尚无可决定的候选版本。");
  const existing = await db.prepare(`
    SELECT result_version_id FROM section_candidate_decisions
    WHERE owner_user_id = ? AND project_id = ? AND candidate_version_id = ? AND decision = ?
  `).bind(actor.userId, context.projectId, task.result_version_id, decision).first<{ result_version_id: string | null }>();
  if (existing) return loadM5ActionExecutionWorkspace(actor, requestedProjectId, conversationSessionId, proposalId);

  const decidedAt = new Date().toISOString();
  if (decision === "REJECT") {
    await db.prepare(`
      INSERT INTO section_candidate_decisions (
        id, owner_user_id, project_id, section_id, candidate_version_id,
        base_version_id, decision, result_version_id, idempotency_key, decided_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'REJECT', NULL, ?, ?)
    `).bind(crypto.randomUUID(), actor.userId, context.projectId, context.sectionId,
      task.result_version_id, context.baseVersionId, idempotencyKey, decidedAt).run();
    return loadM5ActionExecutionWorkspace(actor, requestedProjectId, conversationSessionId, proposalId);
  }

  const current = await currentFormalVersionId(db, actor.userId, context.projectId, context.sectionId);
  if (current !== context.baseVersionId) {
    throw new M5ActionExecutionError("BASE_VERSION_CONFLICT", "基础正式版本已经变化，候选版本不能静默覆盖新版本。");
  }
  const candidate = await db.prepare(`
    SELECT content FROM section_versions
    WHERE id = ? AND owner_user_id = ? AND project_id = ? AND section_id = ?
  `).bind(task.result_version_id, actor.userId, context.projectId, context.sectionId).first<{ content: string }>();
  if (!candidate) throw new M5ActionExecutionError("CANDIDATE_NOT_FOUND", "候选版本不存在或不属于当前章节。");
  const next = await db.prepare(`
    SELECT COALESCE(MAX(version_number), 0) + 1 AS value FROM section_versions
    WHERE owner_user_id = ? AND project_id = ? AND section_id = ?
  `).bind(actor.userId, context.projectId, context.sectionId).first<{ value: number }>();
  const formalVersionId = crypto.randomUUID();
  await db.batch([
    db.prepare(`
      INSERT INTO section_versions (
        id, owner_user_id, project_id, section_id, version_number, source,
        source_version_id, content, content_hash, summary, created_by_task_id
      ) VALUES (?, ?, ?, ?, ?, 'ai', ?, ?, ?, ?, ?)
    `).bind(formalVersionId, actor.userId, context.projectId, context.sectionId,
      next?.value ?? 1, task.result_version_id, candidate.content,
      await hashText(candidate.content), "用户采用 AI 候选后创建的正式不可变版本", task.id),
    db.prepare(`
      UPDATE section_version_adoptions SET adopted = 1, adopted_at = ?
      WHERE version_id = ? AND owner_user_id = ? AND project_id = ?
    `).bind(decidedAt, task.result_version_id, actor.userId, context.projectId),
    db.prepare(`
      INSERT INTO section_candidate_decisions (
        id, owner_user_id, project_id, section_id, candidate_version_id,
        base_version_id, decision, result_version_id, idempotency_key, decided_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'ADOPT', ?, ?, ?)
    `).bind(crypto.randomUUID(), actor.userId, context.projectId, context.sectionId,
      task.result_version_id, context.baseVersionId, formalVersionId, idempotencyKey, decidedAt),
  ]);
  return loadM5ActionExecutionWorkspace(actor, requestedProjectId, conversationSessionId, proposalId);
}

function taskIdempotencyKey(proposalId: string): string {
  return `m5-proposal:${proposalId}`;
}

async function currentFormalVersionId(db: D1Database, ownerUserId: string, projectId: string, sectionId: string): Promise<string | null> {
  const row = await db.prepare(`
    SELECT v.id FROM section_versions v
    WHERE v.owner_user_id = ? AND v.project_id = ? AND v.section_id = ?
      AND NOT EXISTS (SELECT 1 FROM section_version_adoptions a WHERE a.version_id = v.id)
    ORDER BY v.version_number DESC LIMIT 1
  `).bind(ownerUserId, projectId, sectionId).first<{ id: string }>();
  return row?.id ?? null;
}

async function ownedProjectId(db: D1Database, ownerUserId: string, requestedProjectId: string): Promise<string> {
  const row = requestedProjectId === "demo"
    ? await db.prepare(`SELECT id FROM projects WHERE owner_user_id = ? AND status = 'active'
        ORDER BY updated_at DESC, created_at DESC LIMIT 1`).bind(ownerUserId).first<{ id: string }>()
    : await db.prepare(`SELECT id FROM projects WHERE id = ? AND owner_user_id = ? AND status = 'active'`)
        .bind(requestedProjectId, ownerUserId).first<{ id: string }>();
  if (!row) throw new M5ActionExecutionError("PROJECT_NOT_FOUND", "项目不存在或不属于当前用户。");
  return row.id;
}

async function hashText(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
