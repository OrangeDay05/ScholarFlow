import type { M3Actor } from "@/app/lib/m3-server-identity";
import { buildMaterialObjectKey } from "@/app/lib/material-upload-security";
import type { StorageAdapter } from "@/app/lib/storage/storage-adapter";
import { getD1 } from "../index";

export type M5MaterialKind =
  | "requirement"
  | "manuscript"
  | "literature"
  | "data"
  | "image"
  | "note";

export type M5MaterialObjectSnapshot = {
  id: string;
  materialId: string;
  projectId: string;
  originalFilename: string;
  normalizedFilename: string;
  detectedExtension: string;
  clientContentType: string | null;
  detectedContentType: string;
  sizeBytes: number;
  contentHash: string | null;
  etag: string | null;
  objectStatus:
    | "PENDING_UPLOAD"
    | "STORED"
    | "UPLOAD_FAILED"
    | "QUARANTINED"
    | "SOFT_DELETED";
  materialStatus: string;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
};

export type PreparedMaterialUpload = {
  kind: M5MaterialKind;
  originalFilename: string;
  normalizedFilename: string;
  detectedExtension: string;
  clientContentType: string;
  detectedContentType: string;
  sizeBytes: number;
  contentHash: string;
  body: ArrayBuffer;
  idempotencyKey: string;
};

export type M5MaterialUploadErrorCode =
  | "PROJECT_NOT_FOUND"
  | "STORAGE_UNAVAILABLE"
  | "STORAGE_WRITE_FAILED"
  | "DATABASE_WRITE_FAILED";

export class M5MaterialUploadRepositoryError extends Error {
  constructor(
    readonly code: M5MaterialUploadErrorCode,
    message: string,
  ) {
    super(message);
  }
}

type OwnedProjectRow = { id: string };
type ObjectRow = {
  id: string;
  material_id: string;
  project_id: string;
  original_filename: string;
  normalized_filename: string;
  detected_extension: string;
  client_content_type: string | null;
  detected_content_type: string;
  size_bytes: number;
  content_hash: string | null;
  etag: string | null;
  object_status: M5MaterialObjectSnapshot["objectStatus"];
  material_status: string;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
};

export async function storeM5MaterialForActor(
  actor: M3Actor,
  requestedProjectId: string,
  input: PreparedMaterialUpload,
  storage: StorageAdapter,
): Promise<{ snapshot: M5MaterialObjectSnapshot; replayed: boolean }> {
  const db = getD1();
  const project = await ownedProject(db, actor.userId, requestedProjectId);
  const replay = await findIdempotentObject(
    db,
    actor.userId,
    project.id,
    input.idempotencyKey,
  );
  if (replay) return { snapshot: toSnapshot(replay), replayed: true };

  const materialId = crypto.randomUUID();
  const objectId = crypto.randomUUID();
  const objectKey = buildMaterialObjectKey({
    ownerUserId: actor.userId,
    projectId: project.id,
    materialId,
    objectId,
  });
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO materials (
            id, owner_user_id, project_id, kind, filename, object_key,
            content_type, size_bytes, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'uploaded')`,
        )
        .bind(
          materialId,
          actor.userId,
          project.id,
          input.kind,
          input.originalFilename,
          objectKey,
          input.detectedContentType,
          input.sizeBytes,
        ),
      db
        .prepare(
          `INSERT INTO material_objects (
            id, owner_user_id, project_id, material_id, object_key,
            storage_provider, original_filename, normalized_filename,
            detected_extension, client_content_type, detected_content_type,
            size_bytes, status, idempotency_key
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_UPLOAD', ?)`,
        )
        .bind(
          objectId,
          actor.userId,
          project.id,
          materialId,
          objectKey,
          storage.provider,
          input.originalFilename,
          input.normalizedFilename,
          input.detectedExtension,
          input.clientContentType || null,
          input.detectedContentType,
          input.sizeBytes,
          input.idempotencyKey,
        ),
      storageEvent(
        db,
        actor.userId,
        project.id,
        materialId,
        objectId,
        "UPLOAD_STARTED",
        { sizeBytes: input.sizeBytes },
      ),
    ]);
  } catch {
    const raced = await findIdempotentObject(
      db,
      actor.userId,
      project.id,
      input.idempotencyKey,
    ).catch(() => null);
    if (raced) return { snapshot: toSnapshot(raced), replayed: true };
    throw new M5MaterialUploadRepositoryError(
      "DATABASE_WRITE_FAILED",
      "无法建立上传记录。",
    );
  }

  let stored = false;
  try {
    const metadata = await storage.put(objectKey, input.body, {
      contentType: input.detectedContentType,
      contentHash: input.contentHash,
    });
    const verified = await storage.head(objectKey);
    if (!verified || verified.size !== input.sizeBytes) {
      throw new Error("Stored object metadata verification failed.");
    }
    stored = true;
    try {
      await db.batch([
        db
          .prepare(
            `UPDATE material_objects
             SET status = 'STORED', content_hash = ?, etag = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND owner_user_id = ? AND status = 'PENDING_UPLOAD'`,
          )
          .bind(input.contentHash, metadata.etag, objectId, actor.userId),
        db
          .prepare(
            `UPDATE materials
             SET status = 'awaiting_parse', updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND owner_user_id = ?`,
          )
          .bind(materialId, actor.userId),
        storageEvent(
          db,
          actor.userId,
          project.id,
          materialId,
          objectId,
          "OBJECT_STORED",
          { etag: metadata.etag, contentHash: input.contentHash },
        ),
      ]);
    } catch {
      await compensateDatabaseFailure(
        db,
        storage,
        actor.userId,
        project.id,
        materialId,
        objectId,
        objectKey,
      );
      throw new M5MaterialUploadRepositoryError(
        "DATABASE_WRITE_FAILED",
        "对象已写入但数据库确认失败，系统已执行补偿。",
      );
    }
  } catch (error) {
    if (error instanceof M5MaterialUploadRepositoryError) throw error;
    if (stored) {
      throw new M5MaterialUploadRepositoryError(
        "DATABASE_WRITE_FAILED",
        "上传状态确认失败。",
      );
    }
    await recordUploadFailure(
      db,
      actor.userId,
      project.id,
      materialId,
      objectId,
      "STORAGE_WRITE_FAILED",
      "本地对象存储写入或校验失败。",
    );
    throw new M5MaterialUploadRepositoryError(
      "STORAGE_WRITE_FAILED",
      "本地对象存储写入或校验失败。",
    );
  }

  const row = await loadObject(db, actor.userId, project.id, objectId);
  if (!row) {
    throw new M5MaterialUploadRepositoryError(
      "DATABASE_WRITE_FAILED",
      "上传成功但无法读取状态记录。",
    );
  }
  return { snapshot: toSnapshot(row), replayed: false };
}

export async function listM5MaterialObjectsForActor(
  actor: M3Actor,
  requestedProjectId: string,
): Promise<M5MaterialObjectSnapshot[]> {
  const db = getD1();
  const project = await ownedProject(db, actor.userId, requestedProjectId);
  const rows = await db
    .prepare(
      objectSelect(
        "WHERE mo.owner_user_id = ? AND mo.project_id = ? AND mo.status != 'SOFT_DELETED'",
      ),
    )
    .bind(actor.userId, project.id)
    .all<ObjectRow>();
  return (rows.results ?? []).map(toSnapshot);
}

async function ownedProject(
  db: D1Database,
  ownerUserId: string,
  requestedProjectId: string,
): Promise<OwnedProjectRow> {
  if (!requestedProjectId || requestedProjectId === "demo") {
    throw new M5MaterialUploadRepositoryError(
      "PROJECT_NOT_FOUND",
      "缺少明确的项目上下文，请先选择项目。",
    );
  }
  const row = await db
    .prepare(
      "SELECT id FROM projects WHERE id = ? AND owner_user_id = ? AND status = 'active'",
    )
    .bind(requestedProjectId, ownerUserId)
    .first<OwnedProjectRow>();
  if (!row) {
    throw new M5MaterialUploadRepositoryError(
      "PROJECT_NOT_FOUND",
      "项目不存在或不属于当前用户。",
    );
  }
  return row;
}

async function findIdempotentObject(
  db: D1Database,
  ownerUserId: string,
  projectId: string,
  idempotencyKey: string,
): Promise<ObjectRow | null> {
  return db
    .prepare(
      objectSelect(
        "WHERE mo.owner_user_id = ? AND mo.project_id = ? AND mo.idempotency_key = ?",
      ),
    )
    .bind(ownerUserId, projectId, idempotencyKey)
    .first<ObjectRow>();
}

async function loadObject(
  db: D1Database,
  ownerUserId: string,
  projectId: string,
  objectId: string,
): Promise<ObjectRow | null> {
  return db
    .prepare(
      objectSelect(
        "WHERE mo.owner_user_id = ? AND mo.project_id = ? AND mo.id = ?",
      ),
    )
    .bind(ownerUserId, projectId, objectId)
    .first<ObjectRow>();
}

function objectSelect(where: string): string {
  return `SELECT mo.id, mo.material_id, mo.project_id, mo.original_filename,
                 mo.normalized_filename, mo.detected_extension,
                 mo.client_content_type, mo.detected_content_type, mo.size_bytes,
                 mo.content_hash, mo.etag, mo.status AS object_status,
                 m.status AS material_status, mo.error_code, mo.error_message,
                 mo.created_at
          FROM material_objects mo
          JOIN materials m ON m.id = mo.material_id
          ${where}
          ORDER BY mo.created_at DESC`;
}

function storageEvent(
  db: D1Database,
  ownerUserId: string,
  projectId: string,
  materialId: string,
  materialObjectId: string,
  eventType: string,
  detail: Record<string, unknown>,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO material_storage_events (
        id, owner_user_id, project_id, material_id, material_object_id,
        event_type, detail_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      ownerUserId,
      projectId,
      materialId,
      materialObjectId,
      eventType,
      JSON.stringify(detail),
    );
}

async function recordUploadFailure(
  db: D1Database,
  ownerUserId: string,
  projectId: string,
  materialId: string,
  objectId: string,
  code: string,
  message: string,
): Promise<void> {
  await db
    .batch([
      db
        .prepare(
          `UPDATE material_objects
           SET status = 'UPLOAD_FAILED', error_code = ?, error_message = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND owner_user_id = ?`,
        )
        .bind(code, message, objectId, ownerUserId),
      db
        .prepare(
          `UPDATE materials
           SET status = 'failed', error_code = ?, error_message = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND owner_user_id = ?`,
        )
        .bind(code, message, materialId, ownerUserId),
      storageEvent(
        db,
        ownerUserId,
        projectId,
        materialId,
        objectId,
        "UPLOAD_FAILED",
        { code },
      ),
    ])
    .catch(() => undefined);
}

async function compensateDatabaseFailure(
  db: D1Database,
  storage: StorageAdapter,
  ownerUserId: string,
  projectId: string,
  materialId: string,
  objectId: string,
  objectKey: string,
): Promise<void> {
  let eventType = "COMPENSATION_SUCCEEDED";
  try {
    await storage.delete(objectKey);
  } catch {
    eventType = "COMPENSATION_REQUIRED";
  }
  await db
    .batch([
      db
        .prepare(
          `UPDATE material_objects
           SET status = 'UPLOAD_FAILED', error_code = 'DATABASE_WRITE_FAILED',
               error_message = '对象状态确认失败，已进入补偿流程。',
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND owner_user_id = ?`,
        )
        .bind(objectId, ownerUserId),
      db
        .prepare(
          `UPDATE materials
           SET status = 'failed', error_code = 'DATABASE_WRITE_FAILED',
               error_message = '对象状态确认失败，已进入补偿流程。',
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND owner_user_id = ?`,
        )
        .bind(materialId, ownerUserId),
      storageEvent(
        db,
        ownerUserId,
        projectId,
        materialId,
        objectId,
        eventType,
        { objectKey },
      ),
    ])
    .catch(() => undefined);
}

function toSnapshot(row: ObjectRow): M5MaterialObjectSnapshot {
  return {
    id: row.id,
    materialId: row.material_id,
    projectId: row.project_id,
    originalFilename: row.original_filename,
    normalizedFilename: row.normalized_filename,
    detectedExtension: row.detected_extension,
    clientContentType: row.client_content_type,
    detectedContentType: row.detected_content_type,
    sizeBytes: row.size_bytes,
    contentHash: row.content_hash,
    etag: row.etag,
    objectStatus: row.object_status,
    materialStatus: row.material_status,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  };
}
