import { env } from "cloudflare:workers";
import type { M3Actor } from "@/app/lib/m3-server-identity";
import { decryptCredential, encryptCredential, maskCredential } from "@/app/lib/credential-vault";
import { createDefaultProviderAdapters } from "@/app/lib/m5-openai-compatible-provider";
import { runWithProviderTimeout } from "@/app/lib/m5-provider-adapter";
import type { M4TaskRole } from "@/app/lib/m4-task-contracts";
import { getD1 } from "../index";

export class M5CredentialRepositoryError extends Error {
  readonly code: "PROJECT_NOT_FOUND" | "MODEL_NOT_FOUND" | "CREDENTIAL_NOT_FOUND" | "INVALID_SCOPE" | "MASTER_KEY_UNAVAILABLE";
  constructor(code: M5CredentialRepositoryError["code"], message: string) { super(message); this.code = code; }
}

export type M5CredentialSnapshot = {
  id: string;
  providerKey: string;
  modelIds: string[];
  allowedProjectIds: string[];
  allowedRoles: M4TaskRole[];
  label: string;
  maskedKey: string;
  status: string;
  lastTestStatus: string;
};

const allowedRoles = new Set<M4TaskRole>(["ROUTER", "GENERATOR", "REVIEWER", "VERIFIER", "REVISER", "AGGREGATOR"]);

export async function saveM5UserCredential(actor: M3Actor, requestedProjectId: string, input: { providerId: string; label: string; apiKey: string; allowedModelIds: string[]; allowedRoles: M4TaskRole[] }): Promise<M5CredentialSnapshot> {
  const db = getD1();
  const projectId = await ownedProjectId(db, actor.userId, requestedProjectId);
  if (!input.allowedRoles.length || !input.allowedRoles.every((role) => allowedRoles.has(role))) throw new M5CredentialRepositoryError("INVALID_SCOPE", "凭据角色范围无效。" );
  const provider = await db.prepare("SELECT provider_key FROM model_providers WHERE id = ? AND status != 'DISABLED'").bind(input.providerId).first<{ provider_key: string }>();
  if (!provider) throw new M5CredentialRepositoryError("MODEL_NOT_FOUND", "供应商不可用。" );
  for (const modelId of input.allowedModelIds) {
    const model = await db.prepare("SELECT id FROM provider_models WHERE id = ? AND provider_id = ? AND status != 'DISABLED'").bind(modelId, input.providerId).first<{ id: string }>();
    if (!model) throw new M5CredentialRepositoryError("MODEL_NOT_FOUND", "模型不属于目标供应商或不可用。" );
  }
  const credentialId = crypto.randomUUID();
  const secretId = crypto.randomUUID();
  const encrypted = await encryptCredential(input.apiKey, masterKey(), actor.userId, credentialId);
  await db.batch([
    db.prepare(`INSERT INTO credential_metadata (id, owner_user_id, provider_id, credential_type,
      label, masked_key, secret_reference, allowed_model_ids_json, allowed_project_ids_json,
      allowed_roles_json, status, last_test_status) VALUES (?, ?, ?, 'USER_CREDENTIAL', ?, ?, ?, ?, ?, ?, 'ACTIVE', 'NOT_TESTED')`).bind(
      credentialId, actor.userId, input.providerId, input.label.trim(), maskCredential(input.apiKey), `db-secret://${secretId}`,
      JSON.stringify(input.allowedModelIds), JSON.stringify([projectId]), JSON.stringify(input.allowedRoles),
    ),
    db.prepare(`INSERT INTO credential_secrets (id, owner_user_id, credential_metadata_id,
      ciphertext, initialization_vector, key_version, algorithm) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(
      secretId, actor.userId, credentialId, encrypted.ciphertext, encrypted.initializationVector, encrypted.keyVersion, encrypted.algorithm,
    ),
  ]);
  return loadSnapshot(db, actor.userId, credentialId);
}

export async function testM5UserCredential(actor: M3Actor, requestedProjectId: string, credentialId: string, modelId: string): Promise<M5CredentialSnapshot> {
  const db = getD1();
  const projectId = await ownedProjectId(db, actor.userId, requestedProjectId);
  const row = await credentialSecret(db, actor.userId, projectId, credentialId, modelId);
  if (!row) throw new M5CredentialRepositoryError("CREDENTIAL_NOT_FOUND", "凭据不存在、已禁用或超出项目/模型范围。" );
  const apiKey = await decryptCredential({ ciphertext: row.ciphertext, initializationVector: row.initialization_vector, keyVersion: row.key_version, algorithm: "AES-GCM-256" }, masterKey(), actor.userId, credentialId);
  const adapter = createDefaultProviderAdapters().find((item) => item.providerKey === row.provider_key);
  if (!adapter) throw new M5CredentialRepositoryError("MODEL_NOT_FOUND", "供应商 Adapter 不可用。" );
  const result = await runWithProviderTimeout(20, (signal) => adapter.testConnection(row.model_key, apiKey, signal));
  await db.prepare("UPDATE credential_metadata SET last_test_status = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_user_id = ?").bind(result.ok ? "PASSED" : "FAILED", result.ok ? "ACTIVE" : "INVALID", credentialId, actor.userId).run();
  return loadSnapshot(db, actor.userId, credentialId);
}

export async function setM5UserCredentialStatus(actor: M3Actor, requestedProjectId: string, credentialId: string, status: "DISABLED" | "DELETED"): Promise<void> {
  const db = getD1();
  await ownedProjectId(db, actor.userId, requestedProjectId);
  const result = await db.prepare(`UPDATE credential_metadata SET status = ?, disabled_at = CASE WHEN ? = 'DISABLED' THEN CURRENT_TIMESTAMP ELSE disabled_at END,
    deleted_at = CASE WHEN ? = 'DELETED' THEN CURRENT_TIMESTAMP ELSE deleted_at END, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND owner_user_id = ? AND credential_type = 'USER_CREDENTIAL'`).bind(status, status, status, credentialId, actor.userId).run();
  if (!result.meta?.changes) throw new M5CredentialRepositoryError("CREDENTIAL_NOT_FOUND", "凭据不存在或不属于当前用户。" );
  if (status === "DELETED") await db.prepare("DELETE FROM credential_secrets WHERE credential_metadata_id = ? AND owner_user_id = ?").bind(credentialId, actor.userId).run();
}

function masterKey(): string {
  const value = (env as unknown as Record<string, unknown>).M5_CREDENTIAL_MASTER_KEY;
  if (typeof value !== "string" || !value) throw new M5CredentialRepositoryError("MASTER_KEY_UNAVAILABLE", "服务端凭据主密钥未配置。" );
  return value;
}

async function ownedProjectId(db: D1Database, owner: string, requested: string): Promise<string> {
  const row = requested === "demo" ? await db.prepare("SELECT id FROM projects WHERE owner_user_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1").bind(owner).first<{ id: string }>() : await db.prepare("SELECT id FROM projects WHERE id = ? AND owner_user_id = ? AND status = 'active'").bind(requested, owner).first<{ id: string }>();
  if (!row) throw new M5CredentialRepositoryError("PROJECT_NOT_FOUND", "项目不存在或不属于当前用户。" );
  return row.id;
}

async function credentialSecret(db: D1Database, owner: string, project: string, credentialId: string, modelId: string) {
  return db.prepare(`SELECT cs.ciphertext, cs.initialization_vector, cs.key_version, mp.provider_key, pm.model_key
    FROM credential_metadata cm JOIN credential_secrets cs ON cs.credential_metadata_id = cm.id
    JOIN model_providers mp ON mp.id = cm.provider_id JOIN provider_models pm ON pm.id = ? AND pm.provider_id = cm.provider_id
    WHERE cm.id = ? AND cm.owner_user_id = ? AND cm.status = 'ACTIVE'
      AND cm.allowed_project_ids_json LIKE ? AND cm.allowed_model_ids_json LIKE ?`).bind(modelId, credentialId, owner, `%"${project}"%`, `%"${modelId}"%`).first<{ ciphertext: string; initialization_vector: string; key_version: string; provider_key: string; model_key: string }>();
}

async function loadSnapshot(db: D1Database, owner: string, id: string): Promise<M5CredentialSnapshot> {
  const row = await db.prepare(`SELECT cm.id, mp.provider_key, cm.label, cm.masked_key,
    cm.allowed_model_ids_json, cm.allowed_project_ids_json, cm.allowed_roles_json, cm.status, cm.last_test_status
    FROM credential_metadata cm JOIN model_providers mp ON mp.id = cm.provider_id WHERE cm.id = ? AND cm.owner_user_id = ?`).bind(id, owner).first<{ id: string; provider_key: string; label: string; masked_key: string; allowed_model_ids_json: string; allowed_project_ids_json: string; allowed_roles_json: string; status: string; last_test_status: string }>();
  if (!row) throw new M5CredentialRepositoryError("CREDENTIAL_NOT_FOUND", "凭据不存在或不属于当前用户。" );
  return { id: row.id, providerKey: row.provider_key, label: row.label, maskedKey: row.masked_key, modelIds: JSON.parse(row.allowed_model_ids_json), allowedProjectIds: JSON.parse(row.allowed_project_ids_json), allowedRoles: JSON.parse(row.allowed_roles_json), status: row.status, lastTestStatus: row.last_test_status };
}
