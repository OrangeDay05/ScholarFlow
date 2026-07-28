import type {
  M4CredentialType,
  M4ExecutionMode,
  M4ModelWorkspace,
} from "@/app/lib/m4-model-contracts";
import type { M4TaskRole } from "@/app/lib/m4-task-contracts";
import type { M3Actor } from "@/app/lib/m3-server-identity";
import { getD1 } from "../index";

type Context = { userId: string; projectId: string };

export class M4ModelRepositoryError extends Error {
  constructor(
    readonly code:
      | "PROJECT_NOT_FOUND"
      | "PROVIDER_NOT_FOUND"
      | "MODEL_NOT_FOUND"
      | "CREDENTIAL_NOT_FOUND"
      | "PROFILE_NOT_FOUND"
      | "INVALID_MODEL_CONFIGURATION",
    message: string,
  ) {
    super(message);
  }
}

const roles: M4TaskRole[] = [
  "ROUTER",
  "GENERATOR",
  "REVIEWER",
  "VERIFIER",
  "REVISER",
  "AGGREGATOR",
];
const modeLimits: Record<
  M4ExecutionMode,
  { models: number; calls: number }
> = {
  STANDARD: { models: 2, calls: 2 },
  STRICT: { models: 3, calls: 4 },
  CUSTOM: { models: 4, calls: 5 },
};

export async function saveM4CredentialMetadata(
  actor: M3Actor,
  requestedProjectId: string,
  input: {
    providerId: string;
    label: string;
    maskedKey: string;
    secretReference?: string;
    allowedModelIds: string[];
    allowedProjectIds: string[];
    allowedRoles: M4TaskRole[];
  },
): Promise<M4ModelWorkspace> {
  const db = getD1();
  const context = await resolveContext(db, actor, requestedProjectId);
  await ensureMockCatalog(db);
  await requireProvider(db, input.providerId);
  if (
    input.allowedProjectIds.some((id) => id !== context.projectId) ||
    !input.allowedRoles.every((role) => roles.includes(role))
  ) {
    throw invalid("凭据范围不能跨项目，角色必须属于 M4 任务角色。");
  }
  for (const modelId of input.allowedModelIds) {
    await requireModel(db, input.providerId, modelId);
  }
  await db
    .prepare(
      `INSERT INTO credential_metadata (
        id, owner_user_id, provider_id, credential_type, label, masked_key,
        secret_reference, allowed_model_ids_json, allowed_project_ids_json,
        allowed_roles_json, status, last_test_status
      ) VALUES (?, ?, ?, 'USER_CREDENTIAL', ?, ?, ?, ?, ?, ?, 'MOCK_ONLY',
                'MOCK_NOT_EXECUTED')`,
    )
    .bind(
      crypto.randomUUID(),
      context.userId,
      input.providerId,
      input.label,
      input.maskedKey,
      input.secretReference ?? null,
      JSON.stringify(input.allowedModelIds),
      JSON.stringify(input.allowedProjectIds),
      JSON.stringify(input.allowedRoles),
    )
    .run();
  return loadM4ModelWorkspace(actor, context.projectId);
}

export async function setM4CredentialStatus(
  actor: M3Actor,
  requestedProjectId: string,
  credentialId: string,
  status: "DISABLED" | "DELETED",
): Promise<M4ModelWorkspace> {
  const db = getD1();
  const context = await resolveContext(db, actor, requestedProjectId);
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE credential_metadata
       SET status = ?, disabled_at = CASE WHEN ? = 'DISABLED' THEN ? ELSE disabled_at END,
           deleted_at = CASE WHEN ? = 'DELETED' THEN ? ELSE deleted_at END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND owner_user_id = ? AND credential_type = 'USER_CREDENTIAL'`,
    )
    .bind(
      status,
      status,
      now,
      status,
      now,
      credentialId,
      context.userId,
    )
    .run();
  if (!result.meta?.changes) {
    throw new M4ModelRepositoryError(
      "CREDENTIAL_NOT_FOUND",
      "凭据元数据不存在或不属于当前用户。",
    );
  }
  return loadM4ModelWorkspace(actor, context.projectId);
}

export async function saveM4ExecutionProfile(
  actor: M3Actor,
  requestedProjectId: string,
  input: {
    name: string;
    mode: M4ExecutionMode;
    maxModels: number;
    maxCalls: number;
    timeoutSeconds: number;
    fallbackPlan: string;
    assignments: Array<{
      providerModelId: string;
      credentialMetadataId?: string;
      role: M4TaskRole;
      priority: number;
    }>;
  },
): Promise<M4ModelWorkspace> {
  const db = getD1();
  const context = await resolveContext(db, actor, requestedProjectId);
  await ensureMockCatalog(db);
  const limits = modeLimits[input.mode];
  if (
    input.maxModels > limits.models ||
    input.maxCalls > limits.calls ||
    input.assignments.length > input.maxModels ||
    new Set(input.assignments.map((item) => item.role)).size !==
      input.assignments.length
  ) {
    throw invalid("执行配置超过当前模式的模型或调用上限。");
  }
  for (const assignment of input.assignments) {
    const model = await db
      .prepare(
        "SELECT allowed_roles_json FROM provider_models WHERE id = ?",
      )
      .bind(assignment.providerModelId)
      .first<{ allowed_roles_json: string }>();
    if (!model || !jsonArray(model.allowed_roles_json).includes(assignment.role)) {
      throw new M4ModelRepositoryError(
        "MODEL_NOT_FOUND",
        "模型不存在或不允许承担该任务角色。",
      );
    }
    if (assignment.credentialMetadataId) {
      await requireCredential(
        db,
        context,
        assignment.credentialMetadataId,
      );
    }
  }
  const profileId = crypto.randomUUID();
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO execution_profiles (
          id, owner_user_id, project_id, name, mode, max_models, max_calls,
          timeout_seconds, fallback_plan
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        profileId,
        context.userId,
        context.projectId,
        input.name,
        input.mode,
        input.maxModels,
        input.maxCalls,
        input.timeoutSeconds,
        input.fallbackPlan,
      ),
  ];
  for (const assignment of input.assignments) {
    statements.push(
      db
        .prepare(
          `INSERT INTO execution_profile_models (
            id, execution_profile_id, provider_model_id,
            credential_metadata_id, role, priority
          ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          profileId,
          assignment.providerModelId,
          assignment.credentialMetadataId ?? null,
          assignment.role,
          assignment.priority,
        ),
    );
  }
  await db.batch(statements);
  return loadM4ModelWorkspace(actor, context.projectId);
}

export async function loadM4ModelWorkspace(
  actor: M3Actor,
  requestedProjectId: string,
): Promise<M4ModelWorkspace> {
  const db = getD1();
  const context = await resolveContext(db, actor, requestedProjectId);
  await ensureMockCatalog(db);
  const providers = await db
    .prepare(
      `SELECT id, provider_key, display_name, data_processor_name, status
       FROM model_providers ORDER BY display_name`,
    )
    .all<{
      id: string;
      provider_key: string;
      display_name: string;
      data_processor_name: string;
      status: M4ModelWorkspace["providers"][number]["status"];
    }>();
  const models = await db
    .prepare(
      `SELECT id, provider_id, model_key, display_name, model_version,
              allowed_roles_json, status
       FROM provider_models ORDER BY display_name`,
    )
    .all<{
      id: string;
      provider_id: string;
      model_key: string;
      display_name: string;
      model_version: string;
      allowed_roles_json: string;
      status: M4ModelWorkspace["models"][number]["status"];
    }>();
  const credentials = await db
    .prepare(
      `SELECT id, provider_id, credential_type, label, masked_key,
              secret_reference, allowed_model_ids_json,
              allowed_project_ids_json, allowed_roles_json, status,
              last_test_status
       FROM credential_metadata
       WHERE owner_user_id IS NULL OR owner_user_id = ?
       ORDER BY created_at`,
    )
    .bind(context.userId)
    .all<{
      id: string;
      provider_id: string;
      credential_type: M4CredentialType;
      label: string;
      masked_key: string;
      secret_reference: string | null;
      allowed_model_ids_json: string;
      allowed_project_ids_json: string;
      allowed_roles_json: string;
      status: M4ModelWorkspace["credentials"][number]["status"];
      last_test_status: M4ModelWorkspace["credentials"][number]["lastTestStatus"];
    }>();
  const profileRows = await db
    .prepare(
      `SELECT id, name, mode, max_models, max_calls, timeout_seconds, fallback_plan
       FROM execution_profiles
       WHERE owner_user_id = ? AND project_id = ? ORDER BY created_at DESC`,
    )
    .bind(context.userId, context.projectId)
    .all<{
      id: string;
      name: string;
      mode: M4ExecutionMode;
      max_models: number;
      max_calls: number;
      timeout_seconds: number;
      fallback_plan: string;
    }>();
  const profiles: M4ModelWorkspace["profiles"] = [];
  for (const profile of profileRows.results ?? []) {
    const assignments = await db
      .prepare(
        `SELECT provider_model_id, credential_metadata_id, role, priority
         FROM execution_profile_models
         WHERE execution_profile_id = ? ORDER BY priority`,
      )
      .bind(profile.id)
      .all<{
        provider_model_id: string;
        credential_metadata_id: string | null;
        role: M4TaskRole;
        priority: number;
      }>();
    profiles.push({
      id: profile.id,
      name: profile.name,
      mode: profile.mode,
      maxModels: profile.max_models,
      maxCalls: profile.max_calls,
      timeoutSeconds: profile.timeout_seconds,
      fallbackPlan: profile.fallback_plan,
      assignments: (assignments.results ?? []).map((item) => ({
        providerModelId: item.provider_model_id,
        credentialMetadataId: item.credential_metadata_id,
        role: item.role,
        priority: item.priority,
      })),
    });
  }
  return {
    providers: (providers.results ?? []).map((item) => ({
      id: item.id,
      providerKey: item.provider_key,
      displayName: item.display_name,
      dataProcessorName: item.data_processor_name,
      status: item.status,
    })),
    models: (models.results ?? []).map((item) => ({
      id: item.id,
      providerId: item.provider_id,
      modelKey: item.model_key,
      displayName: item.display_name,
      modelVersion: item.model_version,
      allowedRoles: jsonArray(item.allowed_roles_json) as M4TaskRole[],
      status: item.status,
    })),
    credentials: (credentials.results ?? []).map((item) => ({
      id: item.id,
      providerId: item.provider_id,
      credentialType: item.credential_type,
      label: item.label,
      maskedKey: item.masked_key,
      secretReference: item.secret_reference,
      allowedModelIds: jsonArray(item.allowed_model_ids_json),
      allowedProjectIds: jsonArray(item.allowed_project_ids_json),
      allowedRoles: jsonArray(item.allowed_roles_json) as M4TaskRole[],
      status: item.status,
      lastTestStatus: item.last_test_status,
    })),
    profiles,
  };
}

async function ensureMockCatalog(db: D1Database) {
  const allRoles = JSON.stringify(roles);
  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO model_providers (
          id, provider_key, display_name, data_processor_name, status
        ) VALUES ('provider-openai-mock', 'openai', 'OpenAI', 'OpenAI · Mock',
                  'MOCK_ONLY')`,
      ),
    db
      .prepare(
        `INSERT OR IGNORE INTO model_providers (
          id, provider_key, display_name, data_processor_name, status
        ) VALUES ('provider-deepseek-mock', 'deepseek', 'DeepSeek',
                  'DeepSeek · Mock', 'MOCK_ONLY')`,
      ),
    db
      .prepare(
        `INSERT OR IGNORE INTO provider_models (
          id, provider_id, model_key, display_name, model_version,
          allowed_roles_json, status
        ) VALUES ('model-openai-mock', 'provider-openai-mock', 'gpt-mock',
                  'GPT Mock', 'm4-contract', ?, 'MOCK_ONLY')`,
      )
      .bind(allRoles),
    db
      .prepare(
        `INSERT OR IGNORE INTO provider_models (
          id, provider_id, model_key, display_name, model_version,
          allowed_roles_json, status
        ) VALUES ('model-deepseek-mock', 'provider-deepseek-mock',
                  'deepseek-mock', 'DeepSeek Mock', 'm4-contract', ?,
                  'MOCK_ONLY')`,
      )
      .bind(allRoles),
    platformCredential(
      db,
      "credential-platform-openai-mock",
      "provider-openai-mock",
      "model-openai-mock",
      allRoles,
    ),
    platformCredential(
      db,
      "credential-platform-deepseek-mock",
      "provider-deepseek-mock",
      "model-deepseek-mock",
      allRoles,
    ),
  ]);
}

function platformCredential(
  db: D1Database,
  id: string,
  providerId: string,
  modelId: string,
  allRoles: string,
) {
  return db
    .prepare(
      `INSERT OR IGNORE INTO credential_metadata (
        id, provider_id, credential_type, label, masked_key,
        allowed_model_ids_json, allowed_project_ids_json, allowed_roles_json,
        status, last_test_status
      ) VALUES (?, ?, 'PLATFORM_CREDENTIAL', '平台额度 · Mock',
                'PLATFORM-MOCK', ?, '[]', ?, 'MOCK_ONLY',
                'MOCK_NOT_EXECUTED')`,
    )
    .bind(id, providerId, JSON.stringify([modelId]), allRoles);
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
  const project =
    requestedProjectId === "demo"
      ? await db
          .prepare(
            `SELECT id FROM projects WHERE owner_user_id = ? AND status = 'active'
             ORDER BY updated_at DESC LIMIT 1`,
          )
          .bind(user.id)
          .first<{ id: string }>()
      : await db
          .prepare("SELECT id FROM projects WHERE id = ? AND owner_user_id = ?")
          .bind(requestedProjectId, user.id)
          .first<{ id: string }>();
  if (!project) throw notFound("PROJECT_NOT_FOUND", "项目不存在或不属于当前用户。");
  return { userId: user.id, projectId: project.id };
}

async function requireProvider(db: D1Database, id: string) {
  const row = await db
    .prepare("SELECT id FROM model_providers WHERE id = ?")
    .bind(id)
    .first<{ id: string }>();
  if (!row) throw notFound("PROVIDER_NOT_FOUND", "模型供应商不存在。");
}

async function requireModel(
  db: D1Database,
  providerId: string,
  modelId: string,
) {
  const row = await db
    .prepare("SELECT id FROM provider_models WHERE id = ? AND provider_id = ?")
    .bind(modelId, providerId)
    .first<{ id: string }>();
  if (!row) throw notFound("MODEL_NOT_FOUND", "模型不属于目标供应商。");
}

async function requireCredential(
  db: D1Database,
  context: Context,
  id: string,
) {
  const row = await db
    .prepare(
      `SELECT id FROM credential_metadata
       WHERE id = ? AND (owner_user_id IS NULL OR owner_user_id = ?)
         AND status NOT IN ('DISABLED', 'DELETED')`,
    )
    .bind(id, context.userId)
    .first<{ id: string }>();
  if (!row) {
    throw notFound("CREDENTIAL_NOT_FOUND", "凭据元数据不存在或不可用。");
  }
}

function invalid(message: string) {
  return new M4ModelRepositoryError("INVALID_MODEL_CONFIGURATION", message);
}

function notFound(
  code: M4ModelRepositoryError["code"],
  message: string,
) {
  return new M4ModelRepositoryError(code, message);
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
