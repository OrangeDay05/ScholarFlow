import type { M3Actor } from "@/app/lib/m3-server-identity";
import type { M5RunnerArtifact, M5RunnerOutcome } from "@/app/lib/m5-task-runner";
import { getD1 } from "../index";

type Context = { userId: string; projectId: string };

export type PersistedM5TaskOutcome = {
  taskId: string;
  status: M5RunnerOutcome["status"];
  callsUsed: number;
  createdVersionIds: string[];
  resultIds: string[];
};

export class M5TaskResultError extends Error {
  readonly code: "PROJECT_NOT_FOUND" | "TASK_NOT_FOUND" | "SECTION_NOT_FOUND" | "CALL_LIMIT_REACHED";

  constructor(code: "PROJECT_NOT_FOUND" | "TASK_NOT_FOUND" | "SECTION_NOT_FOUND" | "CALL_LIMIT_REACHED", message: string) {
    super(message);
    this.code = code;
  }
}

export async function persistM5TaskOutcome(
  actor: M3Actor,
  requestedProjectId: string,
  taskId: string,
  outcome: M5RunnerOutcome,
): Promise<PersistedM5TaskOutcome> {
  const db = getD1();
  const context = await resolveContext(db, actor, requestedProjectId);
  const task = await db.prepare(
    `SELECT id, section_id, max_calls, calls_used, status
     FROM ai_tasks WHERE id = ? AND owner_user_id = ? AND project_id = ?`,
  ).bind(taskId, context.userId, context.projectId).first<{
    id: string; section_id: string | null; max_calls: number; calls_used: number; status: string;
  }>();
  if (!task) throw new M5TaskResultError("TASK_NOT_FOUND", "AI 任务不存在或不属于当前用户。");
  if (task.calls_used + outcome.callsUsed > task.max_calls) {
    throw new M5TaskResultError("CALL_LIMIT_REACHED", "持久化结果会超过任务调用上限。");
  }
  if (isTerminal(task.status)) {
    return loadPersistedOutcome(db, context, taskId, outcome.status);
  }

  const statements: D1PreparedStatement[] = [];
  const createdVersionIds: string[] = [];
  const resultIds: string[] = [];
  let nextVersion = task.section_id ? await nextSectionVersion(db, context, task.section_id) : 0;
  for (const artifact of outcome.artifacts) {
    let createdVersionId: string | null = null;
    if (task.section_id && isCandidate(artifact)) {
      createdVersionId = crypto.randomUUID();
      createdVersionIds.push(createdVersionId);
      statements.push(db.prepare(
        `INSERT INTO section_versions (
           id, owner_user_id, project_id, section_id, version_number, source,
           content, content_hash, summary, created_by_task_id
         ) VALUES (?, ?, ?, ?, ?, 'ai', ?, ?, ?, ?)`,
      ).bind(
        createdVersionId,
        context.userId,
        context.projectId,
        task.section_id,
        nextVersion++,
        artifact.result.outputText,
        await hashText(artifact.result.outputText),
        artifact.artifactType,
        taskId,
      ));
      statements.push(db.prepare(
        `INSERT INTO section_version_adoptions (
           id, owner_user_id, project_id, section_id, version_id, source_task_id,
           candidate_type, adopted
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      ).bind(
        crypto.randomUUID(), context.userId, context.projectId, task.section_id,
        createdVersionId, taskId, candidateType(artifact),
      ));
    }
    const resultId = crypto.randomUUID();
    resultIds.push(resultId);
    statements.push(db.prepare(
      `INSERT INTO ai_task_results (
         id, owner_user_id, project_id, task_id, result_type, content_json,
         warnings_json, missing_inputs_json, created_version_id
       ) VALUES (?, ?, ?, ?, ?, ?, '[]', '[]', ?)`,
    ).bind(
      resultId,
      context.userId,
      context.projectId,
      taskId,
      artifact.artifactType,
      JSON.stringify({
        text: artifact.result.outputText,
        provider: artifact.result.providerKey,
        model: artifact.result.modelKey,
        modelVersion: artifact.result.modelVersion,
        finishReason: artifact.result.finishReason,
        inputTokens: artifact.result.inputTokens,
        outputTokens: artifact.result.outputTokens,
        providerRequestId: artifact.result.providerRequestId,
      }),
      createdVersionId,
    ));
  }
  const resultVersionId = createdVersionIds.at(-1) ?? null;
  statements.push(db.prepare(
    `UPDATE ai_tasks SET status = ?, calls_used = calls_used + ?, stop_reason = ?,
       error_code = ?, result_version_id = COALESCE(?, result_version_id),
       started_at = COALESCE(started_at, ?), finished_at = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND owner_user_id = ? AND project_id = ?`,
  ).bind(
    outcome.status, outcome.callsUsed, outcome.stopReason, outcome.errorCode,
    resultVersionId, new Date().toISOString(), new Date().toISOString(),
    taskId, context.userId, context.projectId,
  ));
  statements.push(db.prepare(
    `INSERT INTO ai_task_events (
       id, owner_user_id, project_id, task_id, from_status, to_status,
       actor_type, reason, detail_json
     ) VALUES (?, ?, ?, ?, ?, ?, 'SYSTEM', ?, ?)`,
  ).bind(
    crypto.randomUUID(), context.userId, context.projectId, taskId, task.status,
    outcome.status, outcome.stopReason,
    JSON.stringify({ callsUsed: outcome.callsUsed, resultIds, createdVersionIds }),
  ));
  await db.batch(statements);
  return { taskId, status: outcome.status, callsUsed: outcome.callsUsed, createdVersionIds, resultIds };
}

async function loadPersistedOutcome(db: D1Database, context: Context, taskId: string, status: M5RunnerOutcome["status"]): Promise<PersistedM5TaskOutcome> {
  const rows = await db.prepare(
    `SELECT id, created_version_id FROM ai_task_results
     WHERE task_id = ? AND owner_user_id = ? AND project_id = ? ORDER BY created_at`,
  ).bind(taskId, context.userId, context.projectId).all<{ id: string; created_version_id: string | null }>();
  const task = await db.prepare(
    `SELECT calls_used FROM ai_tasks WHERE id = ? AND owner_user_id = ? AND project_id = ?`,
  ).bind(taskId, context.userId, context.projectId).first<{ calls_used: number }>();
  const records = rows.results ?? [];
  return {
    taskId,
    status,
    callsUsed: task?.calls_used ?? 0,
    createdVersionIds: records.flatMap((row) => row.created_version_id ? [row.created_version_id] : []),
    resultIds: records.map((row) => row.id),
  };
}

async function resolveContext(db: D1Database, actor: M3Actor, requestedProjectId: string): Promise<Context> {
  const project = requestedProjectId === "demo"
    ? await db.prepare(
      `SELECT id FROM projects WHERE owner_user_id = ? AND status = 'active'
       ORDER BY updated_at DESC LIMIT 1`,
    ).bind(actor.userId).first<{ id: string }>()
    : await db.prepare(
      "SELECT id FROM projects WHERE id = ? AND owner_user_id = ? AND status = 'active'",
    ).bind(requestedProjectId, actor.userId).first<{ id: string }>();
  if (!project) throw new M5TaskResultError("PROJECT_NOT_FOUND", "项目不存在或不属于当前用户。");
  return { userId: actor.userId, projectId: project.id };
}

async function nextSectionVersion(db: D1Database, context: Context, sectionId: string): Promise<number> {
  const section = await db.prepare(
    `SELECT id FROM sections WHERE id = ? AND owner_user_id = ? AND project_id = ?`,
  ).bind(sectionId, context.userId, context.projectId).first<{ id: string }>();
  if (!section) throw new M5TaskResultError("SECTION_NOT_FOUND", "目标章节不存在或不属于当前用户。");
  const row = await db.prepare(
    `SELECT COALESCE(MAX(version_number), 0) AS current FROM section_versions
     WHERE section_id = ? AND owner_user_id = ? AND project_id = ?`,
  ).bind(sectionId, context.userId, context.projectId).first<{ current: number }>();
  return (row?.current ?? 0) + 1;
}

function isCandidate(artifact: M5RunnerArtifact): boolean {
  return ["GENERATED_CANDIDATE", "REVISION_CANDIDATE", "AGGREGATED_CANDIDATE"].includes(artifact.artifactType);
}

function candidateType(artifact: M5RunnerArtifact): "GENERATED" | "REVISED" | "AGGREGATED" {
  if (artifact.artifactType === "REVISION_CANDIDATE") return "REVISED";
  if (artifact.artifactType === "AGGREGATED_CANDIDATE") return "AGGREGATED";
  return "GENERATED";
}

function isTerminal(status: string): boolean {
  return ["SUCCEEDED", "PARTIALLY_COMPLETED", "FAILED", "CANCELLED"].includes(status);
}

async function hashText(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
