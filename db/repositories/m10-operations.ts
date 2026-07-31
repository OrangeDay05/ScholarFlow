import { getD1 } from "../index";
import type { M3Actor } from "@/app/lib/m3-server-identity";
import {
  deterministicBucket,
  type M10Dashboard,
  type M10ExperimentStatus,
  type M10OperationalEventInput,
  validateOperationalEvent,
  validateRolloutPercentage,
} from "@/app/lib/m10-operations-contracts";

export class M10OperationsError extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

export async function recordOperationalEvent(actor: M3Actor, input: M10OperationalEventInput) {
  const errors = validateOperationalEvent(input);
  if (errors.length) throw new M10OperationsError("INVALID_EVENT", errors.join("；"));
  const db = getD1();
  if (input.projectId) {
    const owned = await db.prepare("SELECT id FROM projects WHERE id = ? AND owner_user_id = ?").bind(input.projectId, actor.userId).first("id");
    if (!owned) throw new M10OperationsError("PROJECT_NOT_FOUND", "项目不存在。");
  }
  const id = crypto.randomUUID();
  await db.prepare(`INSERT INTO operational_events
    (id, actor_user_id, project_id, category, event_name, success, duration_ms, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      id, actor.userId, input.projectId ?? null, input.category, input.eventName,
      input.success ? 1 : 0, input.durationMs ?? null, JSON.stringify(input.metadata ?? {}),
    ).run();
  return { id };
}

export async function getOperationsDashboard(): Promise<M10Dashboard> {
  const db = getD1();
  await seedOperationalControls(db);
  const metricQueries: Array<[string, string]> = [
    ["users", "SELECT COUNT(*) AS value FROM users"],
    ["projects", "SELECT COUNT(*) AS value FROM projects"],
    ["materials", "SELECT COUNT(*) AS value FROM materials"],
    ["aiTasks", "SELECT COUNT(*) AS value FROM ai_tasks"],
    ["failedAiTasks", "SELECT COUNT(*) AS value FROM ai_tasks WHERE status IN ('FAILED','REVIEW_FAILED','BLOCKED')"],
    ["docxExports", "SELECT COUNT(*) AS value FROM export_records WHERE status = 'ready'"],
    ["figureRuns", "SELECT COUNT(*) AS value FROM figure_run_records"],
    ["presentationExports", "SELECT COUNT(*) AS value FROM presentation_exports WHERE status IN ('GENERATED','OPEN_VERIFIED')"],
    ["operationalFailures", "SELECT COUNT(*) AS value FROM operational_events WHERE success = 0"],
    ["platformCredentials", "SELECT COUNT(*) AS value FROM credential_metadata WHERE credential_type = 'PLATFORM_CREDENTIAL' AND status = 'ACTIVE'"],
    ["userCredentials", "SELECT COUNT(*) AS value FROM credential_metadata WHERE credential_type = 'USER_CREDENTIAL' AND status = 'ACTIVE'"],
    ["activeSessions", "SELECT COUNT(*) AS value FROM sessions WHERE revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP"],
  ];
  const metrics: Record<string, number> = {};
  for (const [key, sql] of metricQueries) {
    const row = await db.prepare(sql).first<{ value: number }>();
    metrics[key] = Number(row?.value ?? 0);
  }
  const [
    flags,
    experiments,
    failures,
    userRows,
    projectRows,
    materialRows,
    parseRows,
    taskRows,
    providerRows,
    agentRoleRows,
    skillRows,
    usageRow,
    jobRows,
    auditRows,
  ] = await Promise.all([
    db.prepare("SELECT key, description, enabled, rollout_percentage, updated_at FROM feature_flags ORDER BY key").all(),
    db.prepare("SELECT id, key, name, status, treatment_percentage, updated_at FROM experiments ORDER BY key").all(),
    db.prepare(`SELECT source, code, message, occurred_at FROM (
      SELECT 'operational_event' AS source, event_name AS code, NULL AS message, occurred_at FROM operational_events WHERE success = 0
      UNION ALL SELECT 'provider', error_code, NULL, created_at FROM provider_run_records WHERE status = 'FAILED'
      UNION ALL SELECT 'ai_task', error_code, error_message, created_at FROM ai_tasks WHERE status IN ('FAILED','failed','BLOCKED')
      UNION ALL SELECT 'parser', error_code, error_message, created_at FROM material_parse_runs WHERE status = 'FAILED'
    ) ORDER BY occurred_at DESC LIMIT 20`).all(),
    db.prepare(`SELECT u.id, u.display_name, u.email, u.status, u.role, u.last_login_at,
      (SELECT COUNT(*) FROM login_records lr WHERE lr.user_id = u.id AND lr.status = 'failed') AS failed_logins
      FROM users u ORDER BY u.created_at DESC LIMIT 100`).all(),
    db.prepare(`SELECT p.id, p.title, u.display_name AS owner_display_name, p.status, p.current_stage, p.updated_at,
      (SELECT COUNT(*) FROM materials m WHERE m.project_id = p.id AND m.status <> 'soft_deleted') AS material_count
      FROM projects p JOIN users u ON u.id = p.owner_user_id ORDER BY p.updated_at DESC LIMIT 100`).all(),
    db.prepare(`SELECT m.id, m.filename, p.title AS project_title, m.status, m.content_type, m.size_bytes, m.error_code, m.updated_at
      FROM materials m JOIN projects p ON p.id = m.project_id ORDER BY m.updated_at DESC LIMIT 100`).all(),
    db.prepare(`SELECT r.id, m.filename, r.format, r.parser_key, r.parser_version, r.status, r.error_code, r.started_at
      FROM material_parse_runs r JOIN materials m ON m.id = r.material_id ORDER BY r.created_at DESC LIMIT 100`).all(),
    db.prepare(`SELECT id, task_type, product_skill, task_role, status, calls_used, max_calls, error_code, created_at
      FROM ai_tasks ORDER BY created_at DESC LIMIT 100`).all(),
    db.prepare(`SELECT p.id, p.display_name, p.provider_key, p.status,
      (SELECT COUNT(*) FROM provider_models m WHERE m.provider_id = p.id) AS model_count,
      (SELECT COUNT(*) FROM model_capability_versions c WHERE c.provider_id = p.id AND c.lifecycle_status = 'ACTIVE') AS active_capability_count
      FROM model_providers p ORDER BY p.provider_key`).all(),
    db.prepare(`SELECT c.id, c.agent_role, p.display_name AS provider, m.display_name AS model,
      c.thinking_mode, c.reasoning_effort, c.credential_type, c.status
      FROM agent_role_model_configs c
      JOIN model_providers p ON p.id = c.provider_id
      JOIN provider_models m ON m.id = c.model_id
      ORDER BY c.updated_at DESC LIMIT 100`).all(),
    db.prepare(`SELECT s.id, s.product_key, s.display_name, s.enabled,
      (SELECT version FROM skill_versions v WHERE v.skill_id = s.id ORDER BY v.created_at DESC LIMIT 1) AS latest_version,
      (SELECT audit_status FROM skill_versions v WHERE v.skill_id = s.id ORDER BY v.created_at DESC LIMIT 1) AS audit_status
      FROM skills s ORDER BY s.product_key`).all(),
    db.prepare(`SELECT COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
      COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
      COALESCE(SUM(reasoning_tokens), 0) AS reasoning_tokens,
      COALESCE(SUM(CAST(estimated_cost AS REAL)), 0) AS estimated_cost,
      COALESCE(SUM(CAST(final_cost AS REAL)), 0) AS final_cost,
      MAX(currency) AS currency,
      SUM(CASE WHEN status = 'BUDGET_PAUSED' THEN 1 ELSE 0 END) AS budget_paused
      FROM provider_run_records`).first<Record<string, unknown>>(),
    db.prepare(`SELECT kind, id, status, project_title, error, created_at FROM (
      SELECT 'DOCX' AS kind, e.id, e.status, p.title AS project_title, e.error_message AS error, e.created_at
        FROM export_records e JOIN projects p ON p.id = e.project_id
      UNION ALL SELECT 'FIGURE', f.id, f.status, p.title, f.error_message, f.created_at
        FROM figure_run_records f JOIN projects p ON p.id = f.project_id
      UNION ALL SELECT 'PPTX', x.id, x.status, p.title, NULL, x.created_at
        FROM presentation_exports x JOIN projects p ON p.id = x.project_id
    ) ORDER BY created_at DESC LIMIT 100`).all(),
    db.prepare(`SELECT a.id, u.display_name AS actor, a.action, a.metadata_json, a.created_at
      FROM admin_audit_logs a JOIN users u ON u.id = a.actor_user_id ORDER BY a.created_at DESC LIMIT 100`).all(),
  ]);
  const [tableCount, migrationState, storedObjects, failedObjects] = await Promise.all([
    safeCount(db, "SELECT COUNT(*) AS value FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"),
    readMigrationState(db),
    safeCount(db, "SELECT COUNT(*) AS value FROM material_objects WHERE status = 'STORED'"),
    safeCount(db, "SELECT COUNT(*) AS value FROM material_objects WHERE status IN ('UPLOAD_FAILED','QUARANTINED')"),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    metrics,
    users: (userRows.results ?? []).map((row) => ({ id: String(row.id), displayName: String(row.display_name), email: maskEmail(String(row.email)), status: String(row.status), role: String(row.role), lastLoginAt: row.last_login_at == null ? null : String(row.last_login_at), failedLogins: Number(row.failed_logins ?? 0) })),
    projects: (projectRows.results ?? []).map((row) => ({ id: String(row.id), title: String(row.title), ownerDisplayName: String(row.owner_display_name), status: String(row.status), currentStage: String(row.current_stage), materialCount: Number(row.material_count ?? 0), updatedAt: String(row.updated_at) })),
    materials: (materialRows.results ?? []).map((row) => ({ id: String(row.id), filename: String(row.filename), projectTitle: String(row.project_title), status: String(row.status), contentType: String(row.content_type), sizeBytes: Number(row.size_bytes ?? 0), errorCode: row.error_code == null ? null : String(row.error_code), updatedAt: String(row.updated_at) })),
    parseRuns: (parseRows.results ?? []).map((row) => ({ id: String(row.id), filename: String(row.filename), format: String(row.format), parser: `${String(row.parser_key)} · ${String(row.parser_version)}`, status: String(row.status), errorCode: row.error_code == null ? null : String(row.error_code), startedAt: String(row.started_at) })),
    tasks: (taskRows.results ?? []).map((row) => ({ id: String(row.id), taskType: String(row.task_type), productSkill: String(row.product_skill), role: row.task_role == null ? null : String(row.task_role), status: String(row.status), callsUsed: Number(row.calls_used ?? 0), maxCalls: Number(row.max_calls ?? 0), errorCode: row.error_code == null ? null : String(row.error_code), createdAt: String(row.created_at) })),
    providers: (providerRows.results ?? []).map((row) => ({ id: String(row.id), name: String(row.display_name), key: String(row.provider_key), status: String(row.status), modelCount: Number(row.model_count ?? 0), activeCapabilityCount: Number(row.active_capability_count ?? 0) })),
    agentRoles: (agentRoleRows.results ?? []).map((row) => ({ id: String(row.id), role: String(row.agent_role), provider: String(row.provider), model: String(row.model), thinkingMode: String(row.thinking_mode), reasoningEffort: row.reasoning_effort == null ? null : String(row.reasoning_effort), credentialType: String(row.credential_type), status: String(row.status) })),
    skills: (skillRows.results ?? []).map((row) => ({ id: String(row.id), key: String(row.product_key), name: String(row.display_name), enabled: Boolean(row.enabled), latestVersion: row.latest_version == null ? null : String(row.latest_version), auditStatus: row.audit_status == null ? null : String(row.audit_status) })),
    usage: { promptTokens: Number(usageRow?.prompt_tokens ?? 0), completionTokens: Number(usageRow?.completion_tokens ?? 0), reasoningTokens: Number(usageRow?.reasoning_tokens ?? 0), estimatedCost: Number(usageRow?.estimated_cost ?? 0), finalCost: Number(usageRow?.final_cost ?? 0), currency: usageRow?.currency == null ? null : String(usageRow.currency), budgetPaused: Number(usageRow?.budget_paused ?? 0) },
    jobs: (jobRows.results ?? []).map((row) => ({ kind: String(row.kind) as "DOCX" | "FIGURE" | "PPTX", id: String(row.id), status: String(row.status), projectTitle: String(row.project_title), error: row.error == null ? null : String(row.error), createdAt: String(row.created_at) })),
    auditLogs: (auditRows.results ?? []).map((row) => ({ id: String(row.id), actor: String(row.actor), action: String(row.action), reason: auditReason(row.metadata_json), createdAt: String(row.created_at) })),
    health: { database: tableCount > 0 ? "HEALTHY" : "DEGRADED", tableCount, migrationCount: migrationState.count, latestMigration: migrationState.latest, storedObjects, failedObjects },
    featureFlags: (flags.results ?? []).map((row) => ({ key: String(row.key), description: String(row.description), enabled: Boolean(row.enabled), rolloutPercentage: Number(row.rollout_percentage), updatedAt: String(row.updated_at) })),
    experiments: (experiments.results ?? []).map((row) => ({ id: String(row.id), key: String(row.key), name: String(row.name), status: row.status as M10ExperimentStatus, treatmentPercentage: Number(row.treatment_percentage), updatedAt: String(row.updated_at) })),
    recentFailures: (failures.results ?? []).map((row) => ({ source: String(row.source), code: row.code == null ? null : String(row.code), message: row.message == null ? null : String(row.message), occurredAt: String(row.occurred_at) })),
  };
}

export async function updateUserStatus(actor: M3Actor, targetUserId: string, status: "active" | "frozen", reason: string) {
  validateReason(reason);
  if (actor.userId === targetUserId && status === "frozen") throw new M10OperationsError("SELF_FREEZE_FORBIDDEN", "管理员不能冻结自己的当前账号。");
  const db = getD1();
  const current = await db.prepare("SELECT status FROM users WHERE id = ?").bind(targetUserId).first<{ status: string }>();
  if (!current) throw new M10OperationsError("USER_NOT_FOUND", "用户不存在。");
  await db.batch([
    db.prepare("UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(status, targetUserId),
    ...(status === "frozen" ? [db.prepare("UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL").bind(targetUserId)] : []),
  ]);
  await audit(db, actor.userId, "USER_STATUS_UPDATED", { previousStatus: current.status, status, reason }, targetUserId);
  return { userId: targetUserId, status };
}

export async function updateFeatureFlag(actor: M3Actor, key: string, enabled: boolean, rolloutPercentage: number, reason: string) {
  validateReason(reason);
  if (!/^[a-z][a-z0-9_.-]{2,79}$/u.test(key) || !validateRolloutPercentage(rolloutPercentage)) throw new M10OperationsError("INVALID_FLAG", "功能开关参数无效。");
  const db = getD1();
  const result = await db.prepare(`UPDATE feature_flags SET enabled = ?, rollout_percentage = ?, updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?`).bind(enabled ? 1 : 0, rolloutPercentage, actor.userId, key).run();
  if (!result.meta?.changes) throw new M10OperationsError("FLAG_NOT_FOUND", "功能开关不存在。");
  await audit(db, actor.userId, "FEATURE_FLAG_UPDATED", { key, enabled, rolloutPercentage, reason });
  return { key, enabled, rolloutPercentage };
}

export async function updateExperiment(actor: M3Actor, key: string, status: M10ExperimentStatus, treatmentPercentage: number, reason: string) {
  validateReason(reason);
  if (!validateRolloutPercentage(treatmentPercentage) || !["DRAFT", "RUNNING", "PAUSED", "COMPLETED"].includes(status)) throw new M10OperationsError("INVALID_EXPERIMENT", "实验参数无效。");
  const db = getD1();
  const result = await db.prepare(`UPDATE experiments SET status = ?, treatment_percentage = ?, updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP,
    started_at = CASE WHEN ? = 'RUNNING' AND started_at IS NULL THEN CURRENT_TIMESTAMP ELSE started_at END,
    ended_at = CASE WHEN ? = 'COMPLETED' THEN CURRENT_TIMESTAMP ELSE ended_at END WHERE key = ?`).bind(status, treatmentPercentage, actor.userId, status, status, key).run();
  if (!result.meta?.changes) throw new M10OperationsError("EXPERIMENT_NOT_FOUND", "实验不存在。");
  await audit(db, actor.userId, "EXPERIMENT_UPDATED", { key, status, treatmentPercentage, reason });
  return { key, status, treatmentPercentage };
}

export async function resolveOperationalControls(actor: M3Actor) {
  const db = getD1();
  await seedOperationalControls(db);
  const [flags, experiments] = await Promise.all([
    db.prepare("SELECT key, enabled, rollout_percentage FROM feature_flags").all(),
    db.prepare("SELECT id, key, status, control_variant, treatment_variant, treatment_percentage FROM experiments WHERE status = 'RUNNING'").all(),
  ]);
  return {
    featureFlags: Object.fromEntries((flags.results ?? []).map((row) => [String(row.key), Boolean(row.enabled) && deterministicBucket(actor.userId, String(row.key)) < Number(row.rollout_percentage)])),
    experiments: Object.fromEntries((experiments.results ?? []).map((row) => [String(row.key), deterministicBucket(actor.userId, String(row.key)) < Number(row.treatment_percentage) ? String(row.treatment_variant) : String(row.control_variant)])),
  };
}

async function seedOperationalControls(db: D1Database) {
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO feature_flags (key, description, enabled, rollout_percentage) VALUES ('m10.release_candidate', 'M10 发布候选灰度入口', 0, 0)"),
    db.prepare("INSERT OR IGNORE INTO feature_flags (key, description, enabled, rollout_percentage) VALUES ('m8.remote_sandbox', '科研图件远程沙箱', 0, 0)"),
    db.prepare("INSERT OR IGNORE INTO experiments (id, key, name, status, treatment_percentage) VALUES ('exp-ai-workspace-density', 'ai_workspace_density', 'AI 工作台信息密度', 'DRAFT', 50)"),
  ]);
}

function validateReason(reason: string) {
  const length = reason.trim().length;
  if (length < 5 || length > 500) throw new M10OperationsError("INVALID_REASON", "管理操作原因必须为 5—500 个字符。");
}

async function safeCount(db: D1Database, sql: string): Promise<number> {
  try { return Number((await db.prepare(sql).first<{ value: number }>())?.value ?? 0); } catch { return 0; }
}

async function readMigrationState(db: D1Database): Promise<{ count: number; latest: string | null }> {
  try {
    const row = await db.prepare("SELECT COUNT(*) AS value, MAX(name) AS latest FROM d1_migrations").first<{ value: number; latest: string | null }>();
    return { count: Number(row?.value ?? 0), latest: row?.latest ?? null };
  } catch { return { count: 0, latest: null }; }
}

function auditReason(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try { const parsed = JSON.parse(value) as { reason?: unknown }; return typeof parsed.reason === "string" ? parsed.reason : null; } catch { return null; }
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local.slice(0, 1)}***@${domain}`;
}

async function audit(db: D1Database, actorUserId: string, action: string, metadata: Record<string, unknown>, targetUserId: string | null = null) {
  await db.prepare("INSERT INTO admin_audit_logs (id, actor_user_id, target_user_id, action, metadata_json) VALUES (?, ?, ?, ?, ?)").bind(crypto.randomUUID(), actorUserId, targetUserId, action, JSON.stringify(metadata)).run();
}
