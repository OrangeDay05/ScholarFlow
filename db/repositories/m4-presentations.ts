import type {
  M4PresentationReadiness,
  M4PresentationScene,
  M4PresentationWorkspace,
} from "@/app/lib/m4-presentation-contracts";
import type { M3Actor } from "@/app/lib/m3-server-identity";
import { getD1 } from "../index";

type Context = { userId: string; projectId: string };

export class M4PresentationRepositoryError extends Error {
  constructor(
    readonly code:
      | "PROJECT_NOT_FOUND"
      | "PRESENTATION_NOT_FOUND"
      | "PRESENTATION_VERSION_NOT_FOUND"
      | "SOURCE_VERSION_NOT_FOUND",
    message: string,
  ) {
    super(message);
  }
}

export async function createM4PresentationProject(
  actor: M3Actor,
  requestedProjectId: string,
  input: {
    title: string;
    scene: M4PresentationScene;
    audience: string;
    durationMinutes?: number;
    readinessStatus: M4PresentationReadiness;
    truthStatus: "UNVERIFIED" | "PARTIALLY_VERIFIED" | "VERIFIED";
    sourceSectionVersionId?: string;
    sourceMaterialSnapshot: string[];
  },
): Promise<M4PresentationWorkspace> {
  const db = getD1();
  const context = await resolveContext(db, actor, requestedProjectId);
  if (input.sourceSectionVersionId) {
    await requireSectionVersion(db, context, input.sourceSectionVersionId);
  }
  await requireMaterials(db, context, input.sourceMaterialSnapshot);
  const presentationProjectId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  await db.batch([
    db
      .prepare(
        `INSERT INTO presentation_projects (
          id, owner_user_id, project_id, title, presentation_type, scene,
          readiness_status, truth_status, source_section_version_id,
          source_material_snapshot_json, audience, duration_minutes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        presentationProjectId,
        context.userId,
        context.projectId,
        input.title,
        input.scene,
        input.scene,
        input.readinessStatus,
        input.truthStatus,
        input.sourceSectionVersionId ?? null,
        JSON.stringify(input.sourceMaterialSnapshot),
        input.audience,
        input.durationMinutes ?? null,
      ),
    db
      .prepare(
        `INSERT INTO presentation_versions (
          id, owner_user_id, project_id, presentation_project_id,
          version_number, status, source_section_version_id,
          source_paper_version_ids_json, material_snapshot_json,
          narrative_json, verification_status
        ) VALUES (?, ?, ?, ?, 1, 'DRAFT', ?, ?, ?, '{}', 'UNVERIFIED')`,
      )
      .bind(
        versionId,
        context.userId,
        context.projectId,
        presentationProjectId,
        input.sourceSectionVersionId ?? null,
        JSON.stringify(
          input.sourceSectionVersionId ? [input.sourceSectionVersionId] : [],
        ),
        JSON.stringify(input.sourceMaterialSnapshot),
      ),
  ]);
  return loadM4PresentationWorkspace(actor, context.projectId);
}

export async function appendM4PresentationVersion(
  actor: M3Actor,
  requestedProjectId: string,
  input: {
    presentationProjectId: string;
    sourcePresentationVersionId?: string;
    sourceSectionVersionId?: string;
    materialSnapshot: string[];
    narrative: Record<string, unknown>;
  },
): Promise<M4PresentationWorkspace> {
  const db = getD1();
  const context = await resolveContext(db, actor, requestedProjectId);
  await requirePresentationProject(db, context, input.presentationProjectId);
  if (input.sourcePresentationVersionId) {
    await requirePresentationVersion(
      db,
      context,
      input.sourcePresentationVersionId,
      input.presentationProjectId,
    );
  }
  if (input.sourceSectionVersionId) {
    await requireSectionVersion(db, context, input.sourceSectionVersionId);
  }
  await requireMaterials(db, context, input.materialSnapshot);
  const latest = await db
    .prepare(
      `SELECT MAX(version_number) AS value FROM presentation_versions
       WHERE presentation_project_id = ? AND owner_user_id = ? AND project_id = ?`,
    )
    .bind(input.presentationProjectId, context.userId, context.projectId)
    .first<{ value: number | null }>();
  await db
    .prepare(
      `INSERT INTO presentation_versions (
        id, owner_user_id, project_id, presentation_project_id,
        version_number, status, source_presentation_version_id,
        source_section_version_id, source_paper_version_ids_json,
        material_snapshot_json, narrative_json, verification_status
      ) VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, 'UNVERIFIED')`,
    )
    .bind(
      crypto.randomUUID(),
      context.userId,
      context.projectId,
      input.presentationProjectId,
      (latest?.value ?? 0) + 1,
      input.sourcePresentationVersionId ?? null,
      input.sourceSectionVersionId ?? null,
      JSON.stringify(
        input.sourceSectionVersionId ? [input.sourceSectionVersionId] : [],
      ),
      JSON.stringify(input.materialSnapshot),
      JSON.stringify(input.narrative),
    )
    .run();
  return loadM4PresentationWorkspace(actor, context.projectId);
}

export async function saveM4Slide(
  actor: M3Actor,
  requestedProjectId: string,
  input: {
    presentationVersionId: string;
    position: number;
    title: string;
    content: Record<string, unknown>;
    speakerNotes: string;
    assetBindings?: string[];
    sourceBindings: string[];
    verificationStatus: "UNVERIFIED" | "VERIFIED_WITH_WARNINGS" | "VERIFIED";
  },
): Promise<M4PresentationWorkspace> {
  const db = getD1();
  const context = await resolveContext(db, actor, requestedProjectId);
  await requirePresentationVersion(db, context, input.presentationVersionId);
  await db
    .prepare(
      `INSERT INTO slides (
        id, owner_user_id, project_id, presentation_version_id, position,
        title, content_json, speaker_notes, asset_bindings_json,
        source_bindings_json, verification_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(presentation_version_id, position) DO UPDATE SET
        title = excluded.title,
        content_json = excluded.content_json,
        speaker_notes = excluded.speaker_notes,
        source_bindings_json = excluded.source_bindings_json,
        verification_status = excluded.verification_status`,
    )
    .bind(
      crypto.randomUUID(),
      context.userId,
      context.projectId,
      input.presentationVersionId,
      input.position,
      input.title,
      JSON.stringify(input.content),
      input.speakerNotes,
      JSON.stringify(input.assetBindings ?? []),
      JSON.stringify(input.sourceBindings),
      input.verificationStatus,
    )
    .run();
  return loadM4PresentationWorkspace(actor, context.projectId);
}

export async function adoptM4PresentationVersion(
  actor: M3Actor,
  requestedProjectId: string,
  presentationVersionId: string,
): Promise<M4PresentationWorkspace> {
  const db = getD1();
  const context = await resolveContext(db, actor, requestedProjectId);
  const version = await requirePresentationVersion(
    db,
    context,
    presentationVersionId,
  );
  await db.batch([
    db
      .prepare(
        `UPDATE presentation_versions SET status = 'SUPERSEDED'
         WHERE presentation_project_id = ? AND owner_user_id = ?
           AND project_id = ? AND status = 'ADOPTED'`,
      )
      .bind(version.presentation_project_id, context.userId, context.projectId),
    db
      .prepare(
        `UPDATE presentation_versions SET status = 'ADOPTED'
         WHERE id = ? AND owner_user_id = ? AND project_id = ?`,
      )
      .bind(presentationVersionId, context.userId, context.projectId),
  ]);
  return loadM4PresentationWorkspace(actor, context.projectId);
}

export async function loadM4PresentationWorkspace(
  actor: M3Actor,
  requestedProjectId: string,
): Promise<M4PresentationWorkspace> {
  const db = getD1();
  const context = await resolveContext(db, actor, requestedProjectId);
  const projects = await db
    .prepare(
      `SELECT id, title, scene, readiness_status, truth_status,
              source_section_version_id, source_material_snapshot_json
       FROM presentation_projects
       WHERE owner_user_id = ? AND project_id = ? ORDER BY created_at DESC`,
    )
    .bind(context.userId, context.projectId)
    .all<{
      id: string;
      title: string;
      scene: M4PresentationScene;
      readiness_status: M4PresentationReadiness;
      truth_status: M4PresentationWorkspace["projects"][number]["truthStatus"];
      source_section_version_id: string | null;
      source_material_snapshot_json: string;
    }>();
  const versions = await db
    .prepare(
      `SELECT id, presentation_project_id, version_number, status,
              source_presentation_version_id, source_section_version_id,
              material_snapshot_json, verification_status
       FROM presentation_versions
       WHERE owner_user_id = ? AND project_id = ?
       ORDER BY presentation_project_id, version_number DESC`,
    )
    .bind(context.userId, context.projectId)
    .all<{
      id: string;
      presentation_project_id: string;
      version_number: number;
      status: M4PresentationWorkspace["versions"][number]["status"];
      source_presentation_version_id: string | null;
      source_section_version_id: string | null;
      material_snapshot_json: string;
      verification_status: M4PresentationWorkspace["versions"][number]["verificationStatus"];
    }>();
  const slides = await db
    .prepare(
      `SELECT id, presentation_version_id, position, title, content_json,
              speaker_notes, source_bindings_json, verification_status
       FROM slides
       WHERE owner_user_id = ? AND project_id = ?
       ORDER BY presentation_version_id, position`,
    )
    .bind(context.userId, context.projectId)
    .all<{
      id: string;
      presentation_version_id: string;
      position: number;
      title: string;
      content_json: string;
      speaker_notes: string;
      source_bindings_json: string;
      verification_status: M4PresentationWorkspace["slides"][number]["verificationStatus"];
    }>();
  return {
    projects: (projects.results ?? []).map((item) => ({
      id: item.id,
      title: item.title,
      scene: item.scene,
      readinessStatus: item.readiness_status,
      truthStatus: item.truth_status,
      sourceSectionVersionId: item.source_section_version_id,
      sourceMaterialSnapshot: jsonArray(item.source_material_snapshot_json),
    })),
    versions: (versions.results ?? []).map((item) => ({
      id: item.id,
      presentationProjectId: item.presentation_project_id,
      versionNumber: item.version_number,
      status: item.status,
      sourcePresentationVersionId: item.source_presentation_version_id,
      sourceSectionVersionId: item.source_section_version_id,
      materialSnapshot: jsonArray(item.material_snapshot_json),
      verificationStatus: item.verification_status,
    })),
    slides: (slides.results ?? []).map((item) => ({
      id: item.id,
      presentationVersionId: item.presentation_version_id,
      position: item.position,
      title: item.title,
      content: jsonObject(item.content_json),
      speakerNotes: item.speaker_notes,
      sourceBindings: jsonArray(item.source_bindings_json),
      verificationStatus: item.verification_status,
    })),
  };
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

async function requirePresentationProject(
  db: D1Database,
  context: Context,
  id: string,
) {
  const row = await db
    .prepare(
      `SELECT id FROM presentation_projects
       WHERE id = ? AND owner_user_id = ? AND project_id = ?`,
    )
    .bind(id, context.userId, context.projectId)
    .first<{ id: string }>();
  if (!row) throw notFound("PRESENTATION_NOT_FOUND", "PPT 项目不存在。");
}

async function requirePresentationVersion(
  db: D1Database,
  context: Context,
  id: string,
  presentationProjectId?: string,
) {
  const row = await db
    .prepare(
      `SELECT id, presentation_project_id FROM presentation_versions
       WHERE id = ? AND owner_user_id = ? AND project_id = ?`,
    )
    .bind(id, context.userId, context.projectId)
    .first<{ id: string; presentation_project_id: string }>();
  if (!row || (presentationProjectId && row.presentation_project_id !== presentationProjectId)) {
    throw notFound("PRESENTATION_VERSION_NOT_FOUND", "PPT 版本不存在。");
  }
  return row;
}

async function requireSectionVersion(
  db: D1Database,
  context: Context,
  id: string,
) {
  const row = await db
    .prepare(
      `SELECT id FROM section_versions
       WHERE id = ? AND owner_user_id = ? AND project_id = ?`,
    )
    .bind(id, context.userId, context.projectId)
    .first<{ id: string }>();
  if (!row) throw notFound("SOURCE_VERSION_NOT_FOUND", "来源章节版本不存在。");
}

async function requireMaterials(
  db: D1Database,
  context: Context,
  ids: string[],
) {
  for (const id of ids) {
    const row = await db
      .prepare(
        "SELECT id FROM materials WHERE id = ? AND owner_user_id = ? AND project_id = ?",
      )
      .bind(id, context.userId, context.projectId)
      .first<{ id: string }>();
    if (!row) throw notFound("SOURCE_VERSION_NOT_FOUND", "来源材料不存在。");
  }
}

function notFound(
  code: M4PresentationRepositoryError["code"],
  message: string,
) {
  return new M4PresentationRepositoryError(code, message);
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

function jsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}
