import type {
  M4PrivacyProfileInput,
  M4PrivacyWorkspace,
  M4ProcessingCopyInput,
} from "@/app/lib/m4-privacy-contracts";
import type { M3Actor } from "@/app/lib/m3-server-identity";
import { getD1 } from "../index";

type Context = { userId: string; projectId: string };

export class M4PrivacyRepositoryError extends Error {
  constructor(
    readonly code:
      | "PROJECT_NOT_FOUND"
      | "MATERIAL_NOT_FOUND"
      | "PROFILE_NOT_FOUND"
      | "COPY_NOT_FOUND"
      | "TASK_NOT_FOUND"
      | "INVALID_PRIVACY_OPERATION",
    message: string,
  ) {
    super(message);
  }
}

export async function saveM4PrivacyProfile(
  actor: M3Actor,
  requestedProjectId: string,
  input: M4PrivacyProfileInput,
): Promise<M4PrivacyWorkspace> {
  const db = getD1();
  const context = await resolveContext(db, actor, requestedProjectId);
  await requireMaterial(db, context, input.materialId);
  const existing = await db
    .prepare(
      `SELECT id FROM material_privacy_profiles
       WHERE material_id = ? AND owner_user_id = ? AND project_id = ?`,
    )
    .bind(input.materialId, context.userId, context.projectId)
    .first<{ id: string }>();
  const values = profileValues(input);
  if (existing) {
    await db
      .prepare(
        `UPDATE material_privacy_profiles
         SET direct_identifiers_json = ?, indirect_identifiers_json = ?,
             sensitive_attributes_json = ?, research_necessary_variables_json = ?,
             ordinary_research_content_json = ?,
             confidentiality_restrictions_json = ?,
             copyright_restrictions_json = ?, recommended_mode = ?,
             status = ?, confirmed_at = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND owner_user_id = ? AND project_id = ?`,
      )
      .bind(
        ...values,
        existing.id,
        context.userId,
        context.projectId,
      )
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO material_privacy_profiles (
          id, owner_user_id, project_id, material_id,
          direct_identifiers_json, indirect_identifiers_json,
          sensitive_attributes_json, research_necessary_variables_json,
          ordinary_research_content_json, confidentiality_restrictions_json,
          copyright_restrictions_json, recommended_mode, status, confirmed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        context.userId,
        context.projectId,
        input.materialId,
        ...values,
      )
      .run();
  }
  return loadM4PrivacyWorkspace(actor, context.projectId);
}

export async function createM4ProcessingCopy(
  actor: M3Actor,
  requestedProjectId: string,
  input: M4ProcessingCopyInput,
): Promise<M4PrivacyWorkspace> {
  const db = getD1();
  const context = await resolveContext(db, actor, requestedProjectId);
  await requireMaterial(db, context, input.materialId);
  const profile = await db
    .prepare(
      `SELECT id, material_id, status FROM material_privacy_profiles
       WHERE id = ? AND owner_user_id = ? AND project_id = ?`,
    )
    .bind(input.profileId, context.userId, context.projectId)
    .first<{ id: string; material_id: string; status: string }>();
  if (!profile || profile.material_id !== input.materialId) {
    throw new M4PrivacyRepositoryError(
      "PROFILE_NOT_FOUND",
      "隐私画像不存在或不属于当前材料。",
    );
  }
  const requiredChecks = new Set([
    "EXPERIMENTAL_CONDITIONS",
    "SAMPLE_COUNT",
    "PARTICIPANT_SEPARATION",
    "CHRONOLOGY",
    "RESEARCH_NECESSARY_VARIABLES",
    "NUMERIC_PRECISION",
    "SPEAKER_RELATIONSHIPS",
  ]);
  if (
    new Set(input.fidelityChecks.map((check) => check.type)).size !==
      requiredChecks.size ||
    input.fidelityChecks.some((check) => !requiredChecks.has(check.type))
  ) {
    throw new M4PrivacyRepositoryError(
      "INVALID_PRIVACY_OPERATION",
      "处理副本必须完成全部七项分析保真检查。",
    );
  }
  const failed = input.fidelityChecks.some(
    (check) => check.status === "FAILED" || check.blocking,
  );
  const warned = input.fidelityChecks.some((check) => check.status === "WARNING");
  const externallyBlocked = ["LOCAL_ONLY", "EXTERNAL_BLOCKED"].includes(input.mode);
  const status =
    failed || externallyBlocked
      ? "BLOCKED"
      : input.approvedByUser && profile.status === "CONFIRMED"
        ? "READY"
        : "DRAFT";
  const fidelityStatus = failed
    ? "FAILED"
    : warned
      ? "PASSED_WITH_WARNINGS"
      : "PASSED";
  const copyId = crypto.randomUUID();
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO material_processing_copies (
          id, owner_user_id, project_id, material_id, privacy_profile_id,
          mode, status, storage_reference, content_hash,
          transformation_summary_json, fidelity_status, approved_by_user
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        copyId,
        context.userId,
        context.projectId,
        input.materialId,
        input.profileId,
        input.mode,
        status,
        input.storageReference ?? null,
        input.contentHash ?? null,
        JSON.stringify(input.transformations),
        fidelityStatus,
        input.approvedByUser ? 1 : 0,
      ),
  ];
  for (const check of input.fidelityChecks) {
    statements.push(
      db
        .prepare(
          `INSERT INTO analysis_fidelity_checks (
            id, owner_user_id, project_id, processing_copy_id,
            check_type, status, detail, blocking
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          context.userId,
          context.projectId,
          copyId,
          check.type,
          check.status,
          check.detail,
          check.blocking ? 1 : 0,
        ),
    );
  }
  await db.batch(statements);
  return loadM4PrivacyWorkspace(actor, context.projectId);
}

export async function saveM4PseudonymMapReference(
  actor: M3Actor,
  requestedProjectId: string,
  input: {
    processingCopyId: string;
    secretReference: string;
    mappingCount: number;
    reversible: boolean;
    accessScope: "OWNER_ONLY" | "PROJECT_SERVICE";
  },
): Promise<M4PrivacyWorkspace> {
  const db = getD1();
  const context = await resolveContext(db, actor, requestedProjectId);
  const copy = await requireCopy(db, context, input.processingCopyId);
  if (copy.mode !== "PSEUDONYMIZED") {
    throw new M4PrivacyRepositoryError(
      "INVALID_PRIVACY_OPERATION",
      "只有 PSEUDONYMIZED 副本可以绑定伪匿名映射引用。",
    );
  }
  await db
    .prepare(
      `INSERT INTO pseudonymization_maps (
        id, owner_user_id, project_id, processing_copy_id, secret_reference,
        mapping_count, reversible, access_scope
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(processing_copy_id) DO UPDATE SET
        secret_reference = excluded.secret_reference,
        mapping_count = excluded.mapping_count,
        reversible = excluded.reversible,
        access_scope = excluded.access_scope,
        updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(
      crypto.randomUUID(),
      context.userId,
      context.projectId,
      input.processingCopyId,
      input.secretReference,
      input.mappingCount,
      input.reversible ? 1 : 0,
      input.accessScope,
    )
    .run();
  return loadM4PrivacyWorkspace(actor, context.projectId);
}

export async function planM4MaterialTransmission(
  actor: M3Actor,
  requestedProjectId: string,
  input: {
    taskId: string;
    materialId: string;
    processingCopyId: string;
    providerKey: string;
    purpose: string;
  },
): Promise<M4PrivacyWorkspace> {
  const db = getD1();
  const context = await resolveContext(db, actor, requestedProjectId);
  await requireTask(db, context, input.taskId);
  await requireMaterial(db, context, input.materialId);
  const copy = await requireCopy(db, context, input.processingCopyId);
  if (copy.material_id !== input.materialId) {
    throw new M4PrivacyRepositoryError(
      "COPY_NOT_FOUND",
      "处理副本不属于目标材料。",
    );
  }
  const blocked =
    copy.status !== "READY" ||
    ["LOCAL_ONLY", "EXTERNAL_BLOCKED"].includes(copy.mode);
  const blockReason = blocked
    ? copy.status !== "READY"
      ? "处理副本尚未通过确认和保真检查。"
      : `隐私模式 ${copy.mode} 禁止外传。`
    : null;
  await db
    .prepare(
      `INSERT INTO task_material_transmissions (
        id, owner_user_id, project_id, task_id, material_id,
        processing_copy_id, provider_key, purpose, status, block_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      context.userId,
      context.projectId,
      input.taskId,
      input.materialId,
      input.processingCopyId,
      input.providerKey,
      input.purpose,
      blocked ? "BLOCKED" : "PLANNED",
      blockReason,
    )
    .run();
  return loadM4PrivacyWorkspace(actor, context.projectId);
}

export async function loadM4PrivacyWorkspace(
  actor: M3Actor,
  requestedProjectId: string,
): Promise<M4PrivacyWorkspace> {
  const db = getD1();
  const context = await resolveContext(db, actor, requestedProjectId);
  const profiles = await db
    .prepare(
      `SELECT id, material_id, direct_identifiers_json,
              indirect_identifiers_json, sensitive_attributes_json,
              research_necessary_variables_json, ordinary_research_content_json,
              confidentiality_restrictions_json, copyright_restrictions_json,
              recommended_mode, status
       FROM material_privacy_profiles
       WHERE owner_user_id = ? AND project_id = ? ORDER BY created_at DESC`,
    )
    .bind(context.userId, context.projectId)
    .all<Record<string, unknown>>();
  const copyRows = await db
    .prepare(
      `SELECT id, material_id, privacy_profile_id, mode, status,
              fidelity_status, approved_by_user
       FROM material_processing_copies
       WHERE owner_user_id = ? AND project_id = ? ORDER BY created_at DESC`,
    )
    .bind(context.userId, context.projectId)
    .all<{
      id: string;
      material_id: string;
      privacy_profile_id: string;
      mode: M4PrivacyWorkspace["copies"][number]["mode"];
      status: M4PrivacyWorkspace["copies"][number]["status"];
      fidelity_status: M4PrivacyWorkspace["copies"][number]["fidelityStatus"];
      approved_by_user: number;
    }>();
  const copies: M4PrivacyWorkspace["copies"] = [];
  for (const copy of copyRows.results ?? []) {
    const checks = await db
      .prepare(
        `SELECT check_type, status, detail, blocking
         FROM analysis_fidelity_checks
         WHERE processing_copy_id = ? AND owner_user_id = ? AND project_id = ?
         ORDER BY created_at ASC`,
      )
      .bind(copy.id, context.userId, context.projectId)
      .all<{
        check_type: M4PrivacyWorkspace["copies"][number]["fidelityChecks"][number]["type"];
        status: M4PrivacyWorkspace["copies"][number]["fidelityChecks"][number]["status"];
        detail: string;
        blocking: number;
      }>();
    copies.push({
      id: copy.id,
      materialId: copy.material_id,
      profileId: copy.privacy_profile_id,
      mode: copy.mode,
      status: copy.status,
      fidelityStatus: copy.fidelity_status,
      approvedByUser: Boolean(copy.approved_by_user),
      fidelityChecks: (checks.results ?? []).map((check) => ({
        type: check.check_type,
        status: check.status,
        detail: check.detail,
        blocking: Boolean(check.blocking),
      })),
    });
  }
  const transmissions = await db
    .prepare(
      `SELECT id, task_id, material_id, processing_copy_id, provider_key,
              purpose, status, block_reason
       FROM task_material_transmissions
       WHERE owner_user_id = ? AND project_id = ? ORDER BY created_at DESC`,
    )
    .bind(context.userId, context.projectId)
    .all<{
      id: string;
      task_id: string;
      material_id: string;
      processing_copy_id: string;
      provider_key: string;
      purpose: string;
      status: M4PrivacyWorkspace["transmissions"][number]["status"];
      block_reason: string | null;
    }>();
  return {
    profiles: (profiles.results ?? []).map((row) => ({
      id: String(row.id),
      materialId: String(row.material_id),
      directIdentifiers: jsonArray(row.direct_identifiers_json),
      indirectIdentifiers: jsonArray(row.indirect_identifiers_json),
      sensitiveAttributes: jsonArray(row.sensitive_attributes_json),
      researchNecessaryVariables: jsonArray(row.research_necessary_variables_json),
      ordinaryResearchContent: jsonArray(row.ordinary_research_content_json),
      confidentialityRestrictions: jsonArray(row.confidentiality_restrictions_json),
      copyrightRestrictions: jsonArray(row.copyright_restrictions_json),
      recommendedMode: row.recommended_mode as M4PrivacyProfileInput["recommendedMode"],
      confirm: row.status === "CONFIRMED",
      status: row.status as M4PrivacyWorkspace["profiles"][number]["status"],
    })),
    copies,
    transmissions: (transmissions.results ?? []).map((row) => ({
      id: row.id,
      taskId: row.task_id,
      materialId: row.material_id,
      processingCopyId: row.processing_copy_id,
      providerKey: row.provider_key,
      purpose: row.purpose,
      status: row.status,
      blockReason: row.block_reason,
    })),
  };
}

function profileValues(input: M4PrivacyProfileInput) {
  return [
    JSON.stringify(input.directIdentifiers),
    JSON.stringify(input.indirectIdentifiers),
    JSON.stringify(input.sensitiveAttributes),
    JSON.stringify(input.researchNecessaryVariables),
    JSON.stringify(input.ordinaryResearchContent),
    JSON.stringify(input.confidentialityRestrictions),
    JSON.stringify(input.copyrightRestrictions),
    input.recommendedMode,
    input.confirm ? "CONFIRMED" : "DRAFT",
    input.confirm ? new Date().toISOString() : null,
  ] as const;
}

async function resolveContext(
  db: D1Database,
  actor: M3Actor,
  requestedProjectId: string,
): Promise<Context> {
  const user = await db
    .prepare("SELECT id FROM users WHERE id = ? AND status = 'active'")
    .bind(actor.userId)
    .first<{ id: string }>();
  if (!user) throw notFound("PROJECT_NOT_FOUND", "当前用户尚未初始化。");
  if (!requestedProjectId || requestedProjectId === "demo") {
    throw notFound("PROJECT_NOT_FOUND", "缺少明确的项目上下文，请先选择项目。");
  }
  const project = await db
    .prepare("SELECT id FROM projects WHERE id = ? AND owner_user_id = ?")
    .bind(requestedProjectId, user.id)
    .first<{ id: string }>();
  if (!project) throw notFound("PROJECT_NOT_FOUND", "项目不存在或不属于当前用户。");
  return { userId: user.id, projectId: project.id };
}

async function requireMaterial(db: D1Database, context: Context, id: string) {
  const row = await db
    .prepare(
      "SELECT id FROM materials WHERE id = ? AND owner_user_id = ? AND project_id = ?",
    )
    .bind(id, context.userId, context.projectId)
    .first<{ id: string }>();
  if (!row) throw notFound("MATERIAL_NOT_FOUND", "材料不存在。");
}

async function requireTask(db: D1Database, context: Context, id: string) {
  const row = await db
    .prepare(
      "SELECT id FROM ai_tasks WHERE id = ? AND owner_user_id = ? AND project_id = ?",
    )
    .bind(id, context.userId, context.projectId)
    .first<{ id: string }>();
  if (!row) throw notFound("TASK_NOT_FOUND", "AI 任务不存在。");
}

async function requireCopy(db: D1Database, context: Context, id: string) {
  const row = await db
    .prepare(
      `SELECT id, material_id, mode, status FROM material_processing_copies
       WHERE id = ? AND owner_user_id = ? AND project_id = ?`,
    )
    .bind(id, context.userId, context.projectId)
    .first<{
      id: string;
      material_id: string;
      mode: M4PrivacyProfileInput["recommendedMode"];
      status: string;
    }>();
  if (!row) throw notFound("COPY_NOT_FOUND", "处理副本不存在。");
  return row;
}

function notFound(
  code: M4PrivacyRepositoryError["code"],
  message: string,
) {
  return new M4PrivacyRepositoryError(code, message);
}

function jsonArray(value: unknown): string[] {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}
