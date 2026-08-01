import type {
  M4MaterialRegistrationInput,
  M4ProjectIntakeInput,
  M4ProjectIntakeSnapshot,
} from "@/app/lib/m4-project-contracts";
import type {
  M3MaterialSummary,
  M3ProjectSummary,
} from "@/app/lib/m3-contracts";
import type { M3Actor } from "@/app/lib/m3-server-identity";
import { getD1 } from "../index";

type UserRow = { id: string };
type ProjectRow = {
  id: string;
  title: string;
  paper_type: string;
  language: string;
  primary_creation_method: M3ProjectSummary["primaryCreationMethod"];
  status: M3ProjectSummary["status"];
  current_stage: string;
  updated_at: string;
};
type MaterialRow = {
  id: string;
  kind: M3MaterialSummary["kind"];
  filename: string;
  content_type: string;
  size_bytes: number;
  status: M3MaterialSummary["status"];
  error_message: string | null;
};

export class M4ProjectRepositoryError extends Error {
  constructor(
    readonly code: "PROJECT_NOT_FOUND",
    message: string,
  ) {
    super(message);
  }
}

export async function createM4ProjectForActor(
  actor: M3Actor,
  input: M4ProjectIntakeInput,
): Promise<M4ProjectIntakeSnapshot> {
  const db = getD1();
  const ownerUserId = await ensureUser(db, actor);
  if (input.idempotencyKey) {
    const existing = await findIdempotentProject(
      db,
      ownerUserId,
      input.idempotencyKey,
    );
    if (existing) return loadM4ProjectIntake(actor, existing);
  }

  const projectId = crypto.randomUUID();
  const workspace = await db
    .prepare(
      `SELECT id FROM workspaces
       WHERE owner_user_id = ? AND status = 'active'
       ORDER BY created_at ASC LIMIT 1`,
    )
    .bind(ownerUserId)
    .first<{ id: string }>();
  if (!workspace) throw new Error("当前用户工作区不存在，请先完成数据库迁移。");
  const diagnosisId = crypto.randomUUID();
  const outlineId = crypto.randomUUID();
  const title = input.title?.trim() || deriveTitle(input.goal);
  const paperType = input.paperType?.trim() || "待确认";
  const language = input.language?.trim() || "待确认";
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO projects (
          id, owner_user_id, workspace_id, title, paper_type, language,
          primary_creation_method, status, current_stage
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 'diagnosis')`,
      )
      .bind(
        projectId,
        ownerUserId,
        workspace.id,
        title,
        paperType,
        language,
        input.primaryCreationMethod,
      ),
    db
      .prepare(
        `INSERT INTO project_memberships (
           id, workspace_id, project_id, user_id, role, can_edit, status
         ) VALUES (?, ?, ?, ?, 'AUTHOR', 1, 'active')`,
      )
      .bind(crypto.randomUUID(), workspace.id, projectId, ownerUserId),
    db
      .prepare(
        `INSERT INTO diagnosis_cards (
          id, owner_user_id, project_id, version_number, status,
          title, paper_type, language, requirements
        ) VALUES (?, ?, ?, 1, 'draft', ?, ?, ?, ?)`,
      )
      .bind(
        diagnosisId,
        ownerUserId,
        projectId,
        title,
        paperType,
        language,
        input.goal,
      ),
    db
      .prepare(
        `INSERT INTO outlines (
          id, owner_user_id, project_id, diagnosis_card_id, version_number, status
        ) VALUES (?, ?, ?, ?, 1, 'draft')`,
      )
      .bind(outlineId, ownerUserId, projectId, diagnosisId),
  ];

  for (const [category, content] of [
    ["intake_goal", input.goal],
    ["intake_materials", input.materialsSummary],
    ["intake_first_ai_help", input.firstAiHelp],
  ] as const) {
    statements.push(
      db
        .prepare(
          `INSERT INTO project_requirements (
            id, owner_user_id, project_id, category, content, is_confirmed
          ) VALUES (?, ?, ?, ?, ?, 1)`,
        )
        .bind(crypto.randomUUID(), ownerUserId, projectId, category, content),
    );
  }
  if (input.idempotencyKey) {
    statements.push(
      db
        .prepare(
          `INSERT INTO project_requirements (
            id, owner_user_id, project_id, category, content, is_confirmed
          ) VALUES (?, ?, ?, 'creation_idempotency_key', ?, 1)`,
        )
        .bind(
          crypto.randomUUID(),
          ownerUserId,
          projectId,
          input.idempotencyKey,
        ),
    );
  }
  for (const material of input.materials ?? []) {
    statements.push(materialInsert(db, ownerUserId, projectId, material));
  }
  await db.batch(statements);
  return loadM4ProjectIntake(actor, projectId);
}

export async function listM4ProjectsForActor(
  actor: M3Actor,
): Promise<M3ProjectSummary[]> {
  const db = getD1();
  const ownerUserId = await ensureUser(db, actor);
  const rows = await db
    .prepare(
      `SELECT id, title, paper_type, language, primary_creation_method,
              status, current_stage, updated_at
       FROM projects
       WHERE owner_user_id = ?
       ORDER BY updated_at DESC, created_at DESC`,
    )
    .bind(ownerUserId)
    .all<ProjectRow>();
  return (rows.results ?? []).map(toProject);
}

export async function loadM4ProjectIntake(
  actor: M3Actor,
  requestedProjectId: string,
): Promise<M4ProjectIntakeSnapshot> {
  const db = getD1();
  const ownerUserId = await ensureUser(db, actor);
  const project = await ownedProject(db, ownerUserId, requestedProjectId);
  const requirements = await db
    .prepare(
      `SELECT category, content
       FROM project_requirements
       WHERE owner_user_id = ? AND project_id = ?
         AND category IN ('intake_goal', 'intake_materials', 'intake_first_ai_help')`,
    )
    .bind(ownerUserId, project.id)
    .all<{ category: string; content: string }>();
  const values = new Map(
    (requirements.results ?? []).map((row) => [row.category, row.content]),
  );
  const materials = await listM4MaterialsForActor(actor, project.id);
  return {
    project: toProject(project),
    intake: {
      goal: values.get("intake_goal") ?? "",
      materialsSummary: values.get("intake_materials") ?? "",
      firstAiHelp: values.get("intake_first_ai_help") ?? "",
      titleWasDerived: project.title === deriveTitle(values.get("intake_goal") ?? ""),
      paperTypePending: project.paper_type === "待确认",
      languagePending: project.language === "待确认",
    },
    materials,
  };
}

export async function registerM4MaterialForActor(
  actor: M3Actor,
  requestedProjectId: string,
  input: M4MaterialRegistrationInput,
): Promise<M3MaterialSummary> {
  const db = getD1();
  const ownerUserId = await ensureUser(db, actor);
  const project = await ownedProject(db, ownerUserId, requestedProjectId);
  const id = crypto.randomUUID();
  await materialInsert(db, ownerUserId, project.id, input, id).run();
  return {
    id,
    ...input,
    status: "queued",
    errorMessage: null,
  };
}

export async function listM4MaterialsForActor(
  actor: M3Actor,
  requestedProjectId: string,
): Promise<M3MaterialSummary[]> {
  const db = getD1();
  const ownerUserId = await ensureUser(db, actor);
  const project = await ownedProject(db, ownerUserId, requestedProjectId);
  const rows = await db
    .prepare(
      `SELECT id, kind, filename, content_type, size_bytes, status, error_message
       FROM materials
       WHERE owner_user_id = ? AND project_id = ? AND status != 'soft_deleted'
       ORDER BY created_at DESC`,
    )
    .bind(ownerUserId, project.id)
    .all<MaterialRow>();
  return (rows.results ?? []).map((row) => ({
    id: row.id,
    kind: row.kind,
    filename: row.filename,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    status: row.status,
    errorMessage: row.error_message,
  }));
}

function materialInsert(
  db: D1Database,
  ownerUserId: string,
  projectId: string,
  input: M4MaterialRegistrationInput,
  id = crypto.randomUUID(),
) {
  return db
    .prepare(
      `INSERT INTO materials (
        id, owner_user_id, project_id, kind, filename, object_key,
        content_type, size_bytes, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued')`,
    )
    .bind(
      id,
      ownerUserId,
      projectId,
      input.kind,
      input.filename,
      `m4-pending://${id}`,
      input.contentType,
      input.sizeBytes,
    );
}

async function ensureUser(db: D1Database, actor: M3Actor): Promise<string> {
  const existing = await db
    .prepare("SELECT id FROM users WHERE id = ? AND status = 'active'")
    .bind(actor.userId)
    .first<UserRow>();
  if (existing) return existing.id;
  throw new Error("当前 Session 用户不存在或已停用。");
}

async function ownedProject(
  db: D1Database,
  ownerUserId: string,
  requestedProjectId: string,
): Promise<ProjectRow> {
  if (!requestedProjectId || requestedProjectId === "demo") {
    throw new M4ProjectRepositoryError("PROJECT_NOT_FOUND", "缺少明确的项目上下文，请先选择项目。");
  }
  const row = await db
    .prepare(
      `SELECT id, title, paper_type, language, primary_creation_method,
              status, current_stage, updated_at
       FROM projects WHERE id = ? AND owner_user_id = ?`,
    )
    .bind(requestedProjectId, ownerUserId)
    .first<ProjectRow>();
  if (!row) {
    throw new M4ProjectRepositoryError(
      "PROJECT_NOT_FOUND",
      "项目不存在或不属于当前用户。",
    );
  }
  return row;
}

async function findIdempotentProject(
  db: D1Database,
  ownerUserId: string,
  key: string,
): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT project_id
       FROM project_requirements
       WHERE owner_user_id = ? AND category = 'creation_idempotency_key'
         AND content = ?
       ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(ownerUserId, key)
    .first<{ project_id: string }>();
  return row?.project_id ?? null;
}

function deriveTitle(goal: string): string {
  const normalized = goal.trim().replace(/\s+/g, " ");
  return normalized.slice(0, 60) || "未命名研究项目";
}

function toProject(row: ProjectRow): M3ProjectSummary {
  return {
    id: row.id,
    title: row.title,
    paperType: row.paper_type,
    language: row.language,
    primaryCreationMethod: row.primary_creation_method,
    status: row.status,
    currentStage: row.current_stage,
    updatedAt: row.updated_at,
  };
}
