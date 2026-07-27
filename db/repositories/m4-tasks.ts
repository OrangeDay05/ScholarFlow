import type {
  CreateM4ReviewInput,
  CreateM4TaskInput,
  M4ReviewDecision,
  M4TaskRecord,
  M4TaskStatus,
  M4TaskWorkspace,
} from "@/app/lib/m4-task-contracts";
import type { M3Actor } from "@/app/lib/m3-server-identity";
import { getD1 } from "../index";

type Context = { userId: string; projectId: string };
type TaskRow = {
  id: string;
  parent_task_id: string | null;
  task_role: M4TaskRecord["taskRole"];
  status: M4TaskStatus;
  product_skill: string;
  task_type: string;
  review_mode: M4TaskRecord["reviewMode"];
  max_calls: number;
  calls_used: number;
  timeout_seconds: number;
  stop_reason: string | null;
  reviewed_version_id: string | null;
  result_version_id: string | null;
};
type ModelRow = {
  role: M4TaskRecord["taskRole"];
  provider_key: string;
  model_key: string;
  model_version: string;
  skill_key: string;
  skill_version: string;
};

export class M4TaskRepositoryError extends Error {
  constructor(
    readonly code:
      | "PROJECT_NOT_FOUND"
      | "TASK_NOT_FOUND"
      | "VERSION_NOT_FOUND"
      | "REPORT_NOT_FOUND"
      | "ISSUE_NOT_FOUND"
      | "INVALID_TRANSITION"
      | "CALL_LIMIT_REACHED",
    message: string,
  ) {
    super(message);
  }
}

const transitions: Record<M4TaskStatus, M4TaskStatus[]> = {
  QUEUED: ["PREPARING_CONTEXT", "CANCELLED", "BLOCKED", "BUDGET_PAUSED", "FAILED"],
  PREPARING_CONTEXT: [
    "PARSING",
    "RETRIEVING",
    "WAITING_FOR_USER_CONFIRMATION",
    "CALLING_MODEL",
    "FAILED",
    "CANCELLED",
    "BLOCKED",
  ],
  PARSING: ["RETRIEVING", "WAITING_FOR_USER_CONFIRMATION", "CALLING_MODEL", "FAILED", "CANCELLED"],
  RETRIEVING: ["WAITING_FOR_USER_CONFIRMATION", "CALLING_MODEL", "FAILED", "CANCELLED"],
  WAITING_FOR_USER_CONFIRMATION: ["CALLING_MODEL", "CANCELLED", "BLOCKED"],
  CALLING_MODEL: [
    "GENERATING",
    "REVIEWING",
    "VERIFYING",
    "REVISING",
    "AGGREGATING",
    "RETRYING",
    "FAILED",
    "PARTIALLY_COMPLETED",
  ],
  GENERATING: ["REVIEWING", "SUCCEEDED", "PARTIALLY_COMPLETED", "FAILED", "CANCELLED"],
  REVIEWING: ["REVISING", "VERIFYING", "SUCCEEDED", "PARTIALLY_COMPLETED", "FAILED", "CANCELLED"],
  VERIFYING: ["SUCCEEDED", "PARTIALLY_COMPLETED", "FAILED", "CANCELLED"],
  REVISING: ["VERIFYING", "SUCCEEDED", "PARTIALLY_COMPLETED", "FAILED", "CANCELLED"],
  AGGREGATING: ["REVIEWING", "VERIFYING", "SUCCEEDED", "PARTIALLY_COMPLETED", "FAILED"],
  RETRYING: ["CALLING_MODEL", "FAILED", "CANCELLED", "BUDGET_PAUSED"],
  PARTIALLY_COMPLETED: ["RETRYING", "SUCCEEDED", "FAILED", "CANCELLED"],
  SUCCEEDED: [],
  FAILED: ["RETRYING"],
  CANCELLED: [],
  BLOCKED: ["QUEUED", "CANCELLED"],
  BUDGET_PAUSED: ["QUEUED", "CANCELLED"],
};

export async function createM4Task(
  actor: M3Actor,
  requestedProjectId: string,
  input: CreateM4TaskInput,
): Promise<M4TaskRecord> {
  const db = getD1();
  const context = await resolveContext(db, actor, requestedProjectId);
  const existing = await db
    .prepare(
      `SELECT id FROM ai_tasks
       WHERE owner_user_id = ? AND project_id = ? AND idempotency_key = ?`,
    )
    .bind(context.userId, context.projectId, input.idempotencyKey)
    .first<{ id: string }>();
  if (existing) return readTask(db, context, existing.id);
  if (input.parentTaskId) await requireTask(db, context, input.parentTaskId);
  if (input.reviewedVersionId) {
    await requireVersion(db, context, input.reviewedVersionId);
  }
  const id = crypto.randomUUID();
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO ai_tasks (
          id, owner_user_id, project_id, section_id, parent_task_id, task_role,
          product_skill, task_type, status, review_mode, idempotency_key,
          reviewed_version_id, selected_material_ids_json, max_calls,
          timeout_seconds
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'QUEUED', ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        context.userId,
        context.projectId,
        input.sectionId ?? null,
        input.parentTaskId ?? null,
        input.taskRole,
        input.productSkill,
        input.taskType,
        input.reviewMode,
        input.idempotencyKey,
        input.reviewedVersionId ?? null,
        JSON.stringify(input.selectedMaterialIds),
        input.maxCalls,
        input.timeoutSeconds,
      ),
    taskEvent(db, context, id, null, "QUEUED", "USER", "任务已创建。"),
  ];
  for (const model of input.models) {
    statements.push(
      db
        .prepare(
          `INSERT INTO ai_task_model_assignments (
            id, owner_user_id, project_id, task_id, role, provider_key,
            model_key, model_version, skill_key, skill_version
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          context.userId,
          context.projectId,
          id,
          model.role,
          model.providerKey,
          model.modelKey,
          model.modelVersion,
          model.skillKey,
          model.skillVersion,
        ),
    );
  }
  await db.batch(statements);
  return readTask(db, context, id);
}

export async function transitionM4Task(
  actor: M3Actor,
  requestedProjectId: string,
  taskId: string,
  toStatus: M4TaskStatus,
  input: {
    reason?: string;
    callsDelta?: number;
    resultVersionId?: string;
  },
): Promise<M4TaskRecord> {
  const db = getD1();
  const context = await resolveContext(db, actor, requestedProjectId);
  const current = await requireTask(db, context, taskId);
  if (!transitions[current.status].includes(toStatus)) {
    throw new M4TaskRepositoryError(
      "INVALID_TRANSITION",
      `任务不能从 ${current.status} 转换到 ${toStatus}。`,
    );
  }
  const callsDelta = input.callsDelta ?? 0;
  if (callsDelta < 0 || current.calls_used + callsDelta > current.max_calls) {
    throw new M4TaskRepositoryError(
      "CALL_LIMIT_REACHED",
      "本次转换会超过任务最大模型调用次数。",
    );
  }
  if (input.resultVersionId) {
    await requireVersion(db, context, input.resultVersionId);
  }
  const now = new Date().toISOString();
  const terminal = ["SUCCEEDED", "FAILED", "CANCELLED", "BLOCKED"].includes(toStatus);
  await db.batch([
    db
      .prepare(
        `UPDATE ai_tasks
         SET status = ?, calls_used = calls_used + ?, stop_reason = ?,
             result_version_id = COALESCE(?, result_version_id),
             started_at = CASE WHEN started_at IS NULL THEN ? ELSE started_at END,
             finished_at = CASE WHEN ? THEN ? ELSE NULL END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND owner_user_id = ? AND project_id = ?`,
      )
      .bind(
        toStatus,
        callsDelta,
        input.reason ?? null,
        input.resultVersionId ?? null,
        now,
        terminal ? 1 : 0,
        terminal ? now : null,
        taskId,
        context.userId,
        context.projectId,
      ),
    taskEvent(
      db,
      context,
      taskId,
      current.status,
      toStatus,
      "SYSTEM",
      input.reason,
    ),
  ]);
  return readTask(db, context, taskId);
}

export async function createM4ReviewReport(
  actor: M3Actor,
  requestedProjectId: string,
  input: CreateM4ReviewInput,
): Promise<M4TaskWorkspace> {
  const db = getD1();
  const context = await resolveContext(db, actor, requestedProjectId);
  const task = await requireTask(db, context, input.taskId);
  if (task.task_role !== "REVIEWER") {
    throw new M4TaskRepositoryError(
      "TASK_NOT_FOUND",
      "只有 REVIEWER 角色任务可以创建独立审阅报告。",
    );
  }
  await requireVersion(db, context, input.reviewedVersionId);
  const reportId = crypto.randomUUID();
  const counts = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  input.issues.forEach((issue) => counts[issue.severity]++);
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO review_reports (
          id, owner_user_id, project_id, task_id, reviewed_version_id,
          conclusion, summary, high_count, medium_count, low_count,
          context_snapshot_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        reportId,
        context.userId,
        context.projectId,
        input.taskId,
        input.reviewedVersionId,
        input.conclusion,
        input.summary,
        counts.HIGH,
        counts.MEDIUM,
        counts.LOW,
        JSON.stringify(input.contextSnapshot),
      ),
  ];
  for (const issue of input.issues) {
    statements.push(
      db
        .prepare(
          `INSERT INTO review_issues (
            id, owner_user_id, project_id, report_id, category, severity,
            title, detail, suggestion, model_sources_json,
            evidence_binding_ids_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          context.userId,
          context.projectId,
          reportId,
          issue.category,
          issue.severity,
          issue.title,
          issue.detail,
          issue.suggestion,
          JSON.stringify(issue.modelSources),
          JSON.stringify(issue.evidenceBindingIds),
        ),
    );
  }
  await db.batch(statements);
  return loadM4TaskWorkspace(actor, context.projectId);
}

export async function decideM4ReviewIssue(
  actor: M3Actor,
  requestedProjectId: string,
  input: {
    reportId: string;
    issueId?: string;
    decision: M4ReviewDecision;
    reason?: string;
    resolvedVersionId?: string;
  },
): Promise<M4TaskWorkspace> {
  const db = getD1();
  const context = await resolveContext(db, actor, requestedProjectId);
  await requireReport(db, context, input.reportId);
  if (input.issueId) await requireIssue(db, context, input.reportId, input.issueId);
  if (input.decision === "IGNORED" && !input.reason?.trim()) {
    throw new M4TaskRepositoryError(
      "ISSUE_NOT_FOUND",
      "忽略审阅问题时必须填写理由。",
    );
  }
  if (input.resolvedVersionId) {
    await requireVersion(db, context, input.resolvedVersionId);
  }
  await db
    .prepare(
      `INSERT INTO review_issue_decisions (
        id, owner_user_id, project_id, report_id, issue_id, decision,
        reason, resolved_version_id, decided_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      context.userId,
      context.projectId,
      input.reportId,
      input.issueId ?? null,
      input.decision,
      input.reason?.trim() || null,
      input.resolvedVersionId ?? null,
      new Date().toISOString(),
    )
    .run();
  return loadM4TaskWorkspace(actor, context.projectId);
}

export async function adoptM4SectionVersion(
  actor: M3Actor,
  requestedProjectId: string,
  input: {
    sectionId: string;
    versionId: string;
    sourceTaskId?: string;
    candidateType: "GENERATED" | "AGGREGATED" | "REVISED" | "RESTORED";
  },
): Promise<M4TaskWorkspace> {
  const db = getD1();
  const context = await resolveContext(db, actor, requestedProjectId);
  const version = await requireVersion(db, context, input.versionId);
  if (version.section_id !== input.sectionId) {
    throw new M4TaskRepositoryError(
      "VERSION_NOT_FOUND",
      "候选版本不属于目标章节。",
    );
  }
  if (input.sourceTaskId) await requireTask(db, context, input.sourceTaskId);
  const existing = await db
    .prepare(
      `SELECT id FROM section_version_adoptions
       WHERE version_id = ? AND owner_user_id = ? AND project_id = ?`,
    )
    .bind(input.versionId, context.userId, context.projectId)
    .first<{ id: string }>();
  await db.batch([
    db
      .prepare(
        `UPDATE section_version_adoptions
         SET adopted = 0, adopted_at = NULL
         WHERE section_id = ? AND owner_user_id = ? AND project_id = ?`,
      )
      .bind(input.sectionId, context.userId, context.projectId),
    existing
      ? db
          .prepare(
            `UPDATE section_version_adoptions
             SET adopted = 1, adopted_at = ?
             WHERE id = ? AND owner_user_id = ? AND project_id = ?`,
          )
          .bind(
            new Date().toISOString(),
            existing.id,
            context.userId,
            context.projectId,
          )
      : db
          .prepare(
            `INSERT INTO section_version_adoptions (
              id, owner_user_id, project_id, section_id, version_id,
              source_task_id, candidate_type, adopted, adopted_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            context.userId,
            context.projectId,
            input.sectionId,
            input.versionId,
            input.sourceTaskId ?? null,
            input.candidateType,
            new Date().toISOString(),
          ),
  ]);
  return loadM4TaskWorkspace(actor, context.projectId);
}

export async function loadM4TaskWorkspace(
  actor: M3Actor,
  requestedProjectId: string,
): Promise<M4TaskWorkspace> {
  const db = getD1();
  const context = await resolveContext(db, actor, requestedProjectId);
  const taskRows = await db
    .prepare(
      `SELECT id, parent_task_id, task_role, status, product_skill, task_type,
              review_mode, max_calls, calls_used, timeout_seconds, stop_reason,
              reviewed_version_id, result_version_id
       FROM ai_tasks
       WHERE owner_user_id = ? AND project_id = ? AND task_role IS NOT NULL
       ORDER BY created_at DESC`,
    )
    .bind(context.userId, context.projectId)
    .all<TaskRow>();
  const tasks: M4TaskRecord[] = [];
  for (const row of taskRows.results ?? []) {
    tasks.push(await toTask(db, context, row));
  }
  const reportRows = await db
    .prepare(
      `SELECT id, task_id, reviewed_version_id, conclusion, summary
       FROM review_reports
       WHERE owner_user_id = ? AND project_id = ? ORDER BY created_at DESC`,
    )
    .bind(context.userId, context.projectId)
    .all<{
      id: string;
      task_id: string;
      reviewed_version_id: string;
      conclusion: M4TaskWorkspace["reports"][number]["conclusion"];
      summary: string;
    }>();
  const reports: M4TaskWorkspace["reports"] = [];
  for (const report of reportRows.results ?? []) {
    const issues = await db
      .prepare(
        `SELECT id, category, severity, title, detail, suggestion,
                model_sources_json, evidence_binding_ids_json
         FROM review_issues
         WHERE report_id = ? AND owner_user_id = ? AND project_id = ?
         ORDER BY created_at ASC`,
      )
      .bind(report.id, context.userId, context.projectId)
      .all<{
        id: string;
        category: string;
        severity: "HIGH" | "MEDIUM" | "LOW";
        title: string;
        detail: string;
        suggestion: string;
        model_sources_json: string;
        evidence_binding_ids_json: string;
      }>();
    reports.push({
      id: report.id,
      taskId: report.task_id,
      reviewedVersionId: report.reviewed_version_id,
      conclusion: report.conclusion,
      summary: report.summary,
      issues: (issues.results ?? []).map((issue) => ({
        id: issue.id,
        category: issue.category,
        severity: issue.severity,
        title: issue.title,
        detail: issue.detail,
        suggestion: issue.suggestion,
        modelSources: jsonArray(issue.model_sources_json),
        evidenceBindingIds: jsonArray(issue.evidence_binding_ids_json),
      })),
    });
  }
  const decisions = await db
    .prepare(
      `SELECT id, report_id, issue_id, decision, reason, resolved_version_id
       FROM review_issue_decisions
       WHERE owner_user_id = ? AND project_id = ? ORDER BY created_at ASC`,
    )
    .bind(context.userId, context.projectId)
    .all<{
      id: string;
      report_id: string;
      issue_id: string | null;
      decision: M4ReviewDecision;
      reason: string | null;
      resolved_version_id: string | null;
    }>();
  const adoptions = await db
    .prepare(
      `SELECT id, section_id, version_id, candidate_type, adopted
       FROM section_version_adoptions
       WHERE owner_user_id = ? AND project_id = ? ORDER BY created_at DESC`,
    )
    .bind(context.userId, context.projectId)
    .all<{
      id: string;
      section_id: string;
      version_id: string;
      candidate_type: M4TaskWorkspace["adoptions"][number]["candidateType"];
      adopted: number;
    }>();
  return {
    tasks,
    reports,
    decisions: (decisions.results ?? []).map((row) => ({
      id: row.id,
      reportId: row.report_id,
      issueId: row.issue_id,
      decision: row.decision,
      reason: row.reason,
      resolvedVersionId: row.resolved_version_id,
    })),
    adoptions: (adoptions.results ?? []).map((row) => ({
      id: row.id,
      sectionId: row.section_id,
      versionId: row.version_id,
      candidateType: row.candidate_type,
      adopted: Boolean(row.adopted),
    })),
  };
}

async function readTask(
  db: D1Database,
  context: Context,
  taskId: string,
): Promise<M4TaskRecord> {
  const row = await requireTask(db, context, taskId);
  return toTask(db, context, row);
}

async function toTask(
  db: D1Database,
  context: Context,
  row: TaskRow,
): Promise<M4TaskRecord> {
  const models = await db
    .prepare(
      `SELECT role, provider_key, model_key, model_version, skill_key, skill_version
       FROM ai_task_model_assignments
       WHERE task_id = ? AND owner_user_id = ? AND project_id = ?
       ORDER BY created_at ASC`,
    )
    .bind(row.id, context.userId, context.projectId)
    .all<ModelRow>();
  return {
    id: row.id,
    parentTaskId: row.parent_task_id,
    taskRole: row.task_role,
    status: row.status,
    productSkill: row.product_skill,
    taskType: row.task_type,
    reviewMode: row.review_mode,
    maxCalls: row.max_calls,
    callsUsed: row.calls_used,
    timeoutSeconds: row.timeout_seconds,
    stopReason: row.stop_reason,
    reviewedVersionId: row.reviewed_version_id,
    resultVersionId: row.result_version_id,
    models: (models.results ?? []).map((model) => ({
      role: model.role,
      providerKey: model.provider_key,
      modelKey: model.model_key,
      modelVersion: model.model_version,
      skillKey: model.skill_key,
      skillVersion: model.skill_version,
    })),
  };
}

async function resolveContext(
  db: D1Database,
  actor: M3Actor,
  requestedProjectId: string,
): Promise<Context> {
  const user = await db
    .prepare("SELECT id FROM users WHERE email = ?")
    .bind(actor.email)
    .first<{ id: string }>();
  if (!user) {
    throw new M4TaskRepositoryError(
      "PROJECT_NOT_FOUND",
      "当前用户尚未初始化。",
    );
  }
  const project =
    requestedProjectId === "demo"
      ? await db
          .prepare(
            `SELECT id FROM projects
             WHERE owner_user_id = ? AND status = 'active'
             ORDER BY updated_at DESC LIMIT 1`,
          )
          .bind(user.id)
          .first<{ id: string }>()
      : await db
          .prepare(
            "SELECT id FROM projects WHERE id = ? AND owner_user_id = ?",
          )
          .bind(requestedProjectId, user.id)
          .first<{ id: string }>();
  if (!project) {
    throw new M4TaskRepositoryError(
      "PROJECT_NOT_FOUND",
      "项目不存在或不属于当前用户。",
    );
  }
  return { userId: user.id, projectId: project.id };
}

async function requireTask(
  db: D1Database,
  context: Context,
  taskId: string,
): Promise<TaskRow> {
  const task = await db
    .prepare(
      `SELECT id, parent_task_id, task_role, status, product_skill, task_type,
              review_mode, max_calls, calls_used, timeout_seconds, stop_reason,
              reviewed_version_id, result_version_id
       FROM ai_tasks WHERE id = ? AND owner_user_id = ? AND project_id = ?`,
    )
    .bind(taskId, context.userId, context.projectId)
    .first<TaskRow>();
  if (!task?.task_role) {
    throw new M4TaskRepositoryError("TASK_NOT_FOUND", "AI 任务不存在。");
  }
  return task;
}

async function requireVersion(
  db: D1Database,
  context: Context,
  versionId: string,
): Promise<{ id: string; section_id: string }> {
  const version = await db
    .prepare(
      `SELECT id, section_id FROM section_versions
       WHERE id = ? AND owner_user_id = ? AND project_id = ?`,
    )
    .bind(versionId, context.userId, context.projectId)
    .first<{ id: string; section_id: string }>();
  if (!version) {
    throw new M4TaskRepositoryError(
      "VERSION_NOT_FOUND",
      "章节版本不存在或不属于当前用户。",
    );
  }
  return version;
}

async function requireReport(
  db: D1Database,
  context: Context,
  reportId: string,
) {
  const report = await db
    .prepare(
      `SELECT id FROM review_reports
       WHERE id = ? AND owner_user_id = ? AND project_id = ?`,
    )
    .bind(reportId, context.userId, context.projectId)
    .first<{ id: string }>();
  if (!report) throw new M4TaskRepositoryError("REPORT_NOT_FOUND", "审阅报告不存在。");
}

async function requireIssue(
  db: D1Database,
  context: Context,
  reportId: string,
  issueId: string,
) {
  const issue = await db
    .prepare(
      `SELECT id FROM review_issues
       WHERE id = ? AND report_id = ? AND owner_user_id = ? AND project_id = ?`,
    )
    .bind(issueId, reportId, context.userId, context.projectId)
    .first<{ id: string }>();
  if (!issue) throw new M4TaskRepositoryError("ISSUE_NOT_FOUND", "审阅问题不存在。");
}

function taskEvent(
  db: D1Database,
  context: Context,
  taskId: string,
  fromStatus: M4TaskStatus | null,
  toStatus: M4TaskStatus,
  actorType: "USER" | "SYSTEM" | "MODEL",
  reason?: string,
) {
  return db
    .prepare(
      `INSERT INTO ai_task_events (
        id, owner_user_id, project_id, task_id, from_status, to_status,
        actor_type, reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      context.userId,
      context.projectId,
      taskId,
      fromStatus,
      toStatus,
      actorType,
      reason ?? null,
    );
}

function jsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}
