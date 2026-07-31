import type {
  CreateM3ProjectInput,
  M3CreationMethod,
  M3DiagnosisSnapshot,
  M3MaterialSummary,
  M3OutlineSection,
  M3OutlineSnapshot,
  M3ProjectSummary,
  M3SectionVersion,
  M3WorkspaceSnapshot,
} from "@/app/lib/m3-contracts";
import type { M3Actor } from "@/app/lib/m3-server-identity";
import { getD1 } from "../index";

type UserRow = {
  id: string;
  email: string;
  display_name: string;
};

type ProjectRow = {
  id: string;
  title: string;
  paper_type: string;
  language: string;
  primary_creation_method: M3CreationMethod;
  status: "active" | "archived";
  current_stage: string;
  updated_at: string;
};

type DiagnosisRow = {
  id: string;
  version_number: number;
  status: "draft" | "confirmed" | "superseded";
  title: string;
  paper_type: string;
  language: string;
  research_object: string;
  research_question: string;
  method: string;
  requirements: string;
  confirmed_at: string | null;
};

type OutlineRow = {
  id: string;
  version_number: number;
  status: "draft" | "confirmed" | "superseded";
  confirmed_at: string | null;
};

type SectionRow = {
  id: string;
  slug: string;
  title: string;
  position: number;
  status: M3OutlineSection["status"];
  word_count: number;
};

type SectionVersionRow = {
  id: string;
  section_id: string;
  version_number: number;
  source: M3SectionVersion["source"];
  source_version_id: string | null;
  content: string;
  summary: string;
  created_at: string;
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

export class M3RepositoryError extends Error {
  constructor(
    readonly code: "PROJECT_NOT_FOUND" | "DIAGNOSIS_REQUIRED" | "SECTION_NOT_FOUND",
    message: string,
  ) {
    super(message);
  }
}

const defaultSections: Array<
  Omit<M3OutlineSection, "id"> & { initialContent?: string }
> = [
  {
    slug: "abstract",
    title: "摘要",
    position: 1,
    status: "checking",
    wordCount: 0,
  },
  {
    slug: "introduction",
    title: "引言",
    position: 2,
    status: "editing",
    wordCount: 78,
    initialContent:
      "数字平台正在重塑知识生产与组织协作的基本方式。本版本来自 M3 基础持久化初始化，后续人工保存只会追加新版本。",
  },
  {
    slug: "literature",
    title: "文献综述",
    position: 3,
    status: "checking",
    wordCount: 0,
  },
  {
    slug: "method",
    title: "研究方法",
    position: 4,
    status: "missing_material",
    wordCount: 0,
  },
  {
    slug: "results",
    title: "结果与讨论",
    position: 5,
    status: "missing_material",
    wordCount: 0,
  },
  {
    slug: "conclusion",
    title: "结论",
    position: 6,
    status: "not_started",
    wordCount: 0,
  },
];

export async function listProjectsForActor(
  actor: M3Actor,
): Promise<M3ProjectSummary[]> {
  const db = getD1();
  const user = await ensureUser(db, actor);
  const result = await db
    .prepare(
      `SELECT id, title, paper_type, language, primary_creation_method,
              status, current_stage, updated_at
       FROM projects
       WHERE owner_user_id = ?
       ORDER BY updated_at DESC, created_at DESC`,
    )
    .bind(user.id)
    .all<ProjectRow>();

  return (result.results ?? []).map(toProjectSummary);
}

export async function createProjectForActor(
  actor: M3Actor,
  input: CreateM3ProjectInput,
): Promise<M3ProjectSummary> {
  const db = getD1();
  const user = await ensureUser(db, actor);
  const projectId = crypto.randomUUID();
  const diagnosisId = crypto.randomUUID();
  const outlineId = crypto.randomUUID();
  const now = new Date().toISOString();
  const sectionIds = new Map(
    defaultSections.map((section) => [section.slug, crypto.randomUUID()]),
  );

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO projects (
          id, owner_user_id, title, paper_type, language,
          primary_creation_method, status, current_stage
        ) VALUES (?, ?, ?, ?, ?, ?, 'active', 'diagnosis')`,
      )
      .bind(
        projectId,
        user.id,
        input.title,
        input.paperType,
        input.language,
        input.primaryCreationMethod,
      ),
    db
      .prepare(
        `INSERT INTO diagnosis_cards (
          id, owner_user_id, project_id, version_number, status,
          title, paper_type, language, research_object, research_question,
          method, requirements
        ) VALUES (?, ?, ?, 1, 'draft', ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        diagnosisId,
        user.id,
        projectId,
        input.title,
        input.paperType,
        input.language,
        input.researchObject ?? "",
        input.researchQuestion ?? "",
        input.method ?? "",
        input.requirements ?? "",
      ),
    db
      .prepare(
        `INSERT INTO outlines (
          id, owner_user_id, project_id, diagnosis_card_id,
          version_number, status
        ) VALUES (?, ?, ?, ?, 1, 'draft')`,
      )
      .bind(outlineId, user.id, projectId, diagnosisId),
  ];

  if (input.requirements?.trim()) {
    statements.push(
      db
        .prepare(
          `INSERT INTO project_requirements (
            id, owner_user_id, project_id, category, content, is_confirmed
          ) VALUES (?, ?, ?, 'writing', ?, 0)`,
        )
        .bind(
          crypto.randomUUID(),
          user.id,
          projectId,
          input.requirements.trim(),
        ),
    );
  }

  for (const section of defaultSections) {
    const sectionId = sectionIds.get(section.slug)!;
    statements.push(
      db
        .prepare(
          `INSERT INTO sections (
            id, owner_user_id, project_id, outline_id, slug, title,
            position, status, word_count
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          sectionId,
          user.id,
          projectId,
          outlineId,
          section.slug,
          section.title,
          section.position,
          section.status,
          section.wordCount,
        ),
    );

    if (section.initialContent) {
      statements.push(
        db
          .prepare(
            `INSERT INTO section_versions (
              id, owner_user_id, project_id, section_id, version_number,
              source, content, content_hash, summary
            ) VALUES (?, ?, ?, ?, 1, 'original', ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            user.id,
            projectId,
            sectionId,
            section.initialContent,
            await hashText(section.initialContent),
            "M3 基础持久化初始化版本",
          ),
      );
    }
  }

  await db.batch(statements);

  return {
    id: projectId,
    title: input.title,
    paperType: input.paperType,
    language: input.language,
    primaryCreationMethod: input.primaryCreationMethod,
    status: "active",
    currentStage: "diagnosis",
    updatedAt: now,
  };
}

export async function getWorkspaceForActor(
  actor: M3Actor,
  requestedProjectId: string,
  selectedSectionSlug = "introduction",
): Promise<M3WorkspaceSnapshot> {
  const db = getD1();
  const user = await ensureUser(db, actor);
  const projectId = await resolveOwnedProjectId(
    db,
    user.id,
    requestedProjectId,
  );
  const project = await db
    .prepare(
      `SELECT id, title, paper_type, language, primary_creation_method,
              status, current_stage, updated_at
       FROM projects
       WHERE id = ? AND owner_user_id = ?`,
    )
    .bind(projectId, user.id)
    .first<ProjectRow>();

  if (!project) throw projectNotFound();

  const diagnosis = await db
    .prepare(
      `SELECT id, version_number, status, title, paper_type, language,
              research_object, research_question, method, requirements,
              confirmed_at
       FROM diagnosis_cards
       WHERE project_id = ? AND owner_user_id = ?
       ORDER BY version_number DESC
       LIMIT 1`,
    )
    .bind(projectId, user.id)
    .first<DiagnosisRow>();

  const outlineRow = await db
    .prepare(
      `SELECT id, version_number, status, confirmed_at
       FROM outlines
       WHERE project_id = ? AND owner_user_id = ?
       ORDER BY version_number DESC
       LIMIT 1`,
    )
    .bind(projectId, user.id)
    .first<OutlineRow>();

  let sections: M3OutlineSection[] = [];
  if (outlineRow) {
    const result = await db
      .prepare(
        `SELECT id, slug, title, position, status, word_count
         FROM sections
         WHERE outline_id = ? AND project_id = ? AND owner_user_id = ?
         ORDER BY position ASC`,
      )
      .bind(outlineRow.id, projectId, user.id)
      .all<SectionRow>();
    sections = (result.results ?? []).map(toOutlineSection);
  }

  const selectedSection =
    sections.find((section) => section.slug === selectedSectionSlug) ??
    sections[0] ??
    null;
  let versions: M3SectionVersion[] = [];
  if (selectedSection) {
    const result = await db
      .prepare(
        `SELECT id, section_id, version_number, source, source_version_id,
                content, summary, created_at
         FROM section_versions
         WHERE section_id = ? AND project_id = ? AND owner_user_id = ?
           AND NOT EXISTS (
             SELECT 1 FROM section_version_adoptions adoption
             WHERE adoption.version_id = section_versions.id
           )
         ORDER BY version_number DESC`,
      )
      .bind(selectedSection.id, projectId, user.id)
      .all<SectionVersionRow>();
    versions = (result.results ?? []).map(toSectionVersion);
  }

  const materialResult = await db
    .prepare(
      `SELECT id, kind, filename, content_type, size_bytes, status, error_message
       FROM materials
       WHERE project_id = ? AND owner_user_id = ?
       ORDER BY created_at DESC`,
    )
    .bind(projectId, user.id)
    .all<MaterialRow>();

  return {
    source: "d1",
    project: toProjectSummary(project),
    diagnosis: diagnosis ? toDiagnosisSnapshot(diagnosis) : null,
    outline: outlineRow
      ? {
          id: outlineRow.id,
          versionNumber: outlineRow.version_number,
          status: outlineRow.status,
          confirmedAt: outlineRow.confirmed_at,
          sections,
        }
      : null,
    selectedSectionSlug: selectedSection?.slug ?? selectedSectionSlug,
    versions: versions,
    materials: (materialResult.results ?? []).map(toMaterialSummary),
  };
}

export async function appendDiagnosisVersion(
  actor: M3Actor,
  requestedProjectId: string,
  input: Omit<M3DiagnosisSnapshot, "id" | "versionNumber" | "status" | "confirmedAt">,
  confirm: boolean,
): Promise<M3DiagnosisSnapshot> {
  const db = getD1();
  const user = await ensureUser(db, actor);
  const projectId = await resolveOwnedProjectId(
    db,
    user.id,
    requestedProjectId,
  );
  const nextVersion =
    ((await db
      .prepare(
        `SELECT MAX(version_number) AS value
         FROM diagnosis_cards
         WHERE project_id = ? AND owner_user_id = ?`,
      )
      .bind(projectId, user.id)
      .first<{ value: number | null }>())?.value ?? 0) + 1;
  const id = crypto.randomUUID();
  const confirmedAt = confirm ? new Date().toISOString() : null;
  const statements: D1PreparedStatement[] = [];

  if (confirm) {
    statements.push(
      db
        .prepare(
          `UPDATE diagnosis_cards
           SET status = 'superseded', updated_at = CURRENT_TIMESTAMP
           WHERE project_id = ? AND owner_user_id = ? AND status = 'confirmed'`,
        )
        .bind(projectId, user.id),
    );
  }
  statements.push(
    db
      .prepare(
        `INSERT INTO diagnosis_cards (
          id, owner_user_id, project_id, version_number, status,
          title, paper_type, language, research_object, research_question,
          method, requirements, confirmed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        user.id,
        projectId,
        nextVersion,
        confirm ? "confirmed" : "draft",
        input.title,
        input.paperType,
        input.language,
        input.researchObject,
        input.researchQuestion,
        input.method,
        input.requirements,
        confirmedAt,
      ),
    db
      .prepare(
        `UPDATE projects
         SET current_stage = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND owner_user_id = ?`,
      )
      .bind(confirm ? "outline" : "diagnosis", projectId, user.id),
  );
  await db.batch(statements);

  return {
    id,
    versionNumber: nextVersion,
    status: confirm ? "confirmed" : "draft",
    ...input,
    confirmedAt,
  };
}

export async function appendOutlineVersion(
  actor: M3Actor,
  requestedProjectId: string,
  inputSections: Array<Omit<M3OutlineSection, "id">>,
  confirm: boolean,
): Promise<M3OutlineSnapshot> {
  const db = getD1();
  const user = await ensureUser(db, actor);
  const projectId = await resolveOwnedProjectId(
    db,
    user.id,
    requestedProjectId,
  );
  const diagnosis = await db
    .prepare(
      `SELECT id
       FROM diagnosis_cards
       WHERE project_id = ? AND owner_user_id = ?
       ORDER BY version_number DESC
       LIMIT 1`,
    )
    .bind(projectId, user.id)
    .first<{ id: string }>();
  if (!diagnosis) {
    throw new M3RepositoryError(
      "DIAGNOSIS_REQUIRED",
      "创建提纲版本前必须先有诊断卡。",
    );
  }

  const nextVersion =
    ((await db
      .prepare(
        `SELECT MAX(version_number) AS value
         FROM outlines
         WHERE project_id = ? AND owner_user_id = ?`,
      )
      .bind(projectId, user.id)
      .first<{ value: number | null }>())?.value ?? 0) + 1;
  const id = crypto.randomUUID();
  const confirmedAt = confirm ? new Date().toISOString() : null;
  const sections = inputSections.map((section) => ({
    ...section,
    id: crypto.randomUUID(),
  }));
  const statements: D1PreparedStatement[] = [];

  if (confirm) {
    statements.push(
      db
        .prepare(
          `UPDATE outlines
           SET status = 'superseded', updated_at = CURRENT_TIMESTAMP
           WHERE project_id = ? AND owner_user_id = ? AND status = 'confirmed'`,
        )
        .bind(projectId, user.id),
    );
  }
  statements.push(
    db
      .prepare(
        `INSERT INTO outlines (
          id, owner_user_id, project_id, diagnosis_card_id,
          version_number, status, confirmed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        user.id,
        projectId,
        diagnosis.id,
        nextVersion,
        confirm ? "confirmed" : "draft",
        confirmedAt,
      ),
  );
  for (const section of sections) {
    statements.push(
      db
        .prepare(
          `INSERT INTO sections (
            id, owner_user_id, project_id, outline_id, slug, title,
            position, status, word_count
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          section.id,
          user.id,
          projectId,
          id,
          section.slug,
          section.title,
          section.position,
          section.status,
          section.wordCount,
        ),
    );
  }
  statements.push(
    db
      .prepare(
        `UPDATE projects
         SET current_stage = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND owner_user_id = ?`,
      )
      .bind(confirm ? "writing" : "outline", projectId, user.id),
  );
  await db.batch(statements);

  return {
    id,
    versionNumber: nextVersion,
    status: confirm ? "confirmed" : "draft",
    confirmedAt,
    sections,
  };
}

export async function appendSectionVersion(
  actor: M3Actor,
  requestedProjectId: string,
  sectionSlug: string,
  input: {
    source: "manual" | "restore";
    content?: string;
    sourceVersionId?: string;
    summary?: string;
  },
): Promise<M3SectionVersion> {
  const db = getD1();
  const user = await ensureUser(db, actor);
  const projectId = await resolveOwnedProjectId(
    db,
    user.id,
    requestedProjectId,
  );
  const section = await db
    .prepare(
      `SELECT s.id
       FROM sections s
       INNER JOIN outlines o ON o.id = s.outline_id
       WHERE s.project_id = ? AND s.owner_user_id = ? AND s.slug = ?
       ORDER BY o.version_number DESC
       LIMIT 1`,
    )
    .bind(projectId, user.id, sectionSlug)
    .first<{ id: string }>();
  if (!section) {
    throw new M3RepositoryError(
      "SECTION_NOT_FOUND",
      "当前项目中没有可写入的目标章节。",
    );
  }

  let content = input.content ?? "";
  let sourceVersionId: string | null = null;
  if (input.source === "restore") {
    const source = input.sourceVersionId
      ? await db
          .prepare(
            `SELECT id, content
             FROM section_versions
             WHERE id = ? AND section_id = ? AND project_id = ? AND owner_user_id = ?`,
          )
          .bind(input.sourceVersionId, section.id, projectId, user.id)
          .first<{ id: string; content: string }>()
      : null;
    if (!source) {
      throw new M3RepositoryError(
        "SECTION_NOT_FOUND",
        "要恢复的章节版本不存在或不属于当前用户。",
      );
    }
    content = source.content;
    sourceVersionId = source.id;
  }

  const nextVersion =
    ((await db
      .prepare(
        `SELECT MAX(version_number) AS value
         FROM section_versions
         WHERE section_id = ? AND owner_user_id = ?`,
      )
      .bind(section.id, user.id)
      .first<{ value: number | null }>())?.value ?? 0) + 1;
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const summary =
    input.summary?.trim() ||
    (input.source === "restore" ? "从历史版本恢复并创建新版本" : "人工保存");
  const wordCount = countWords(content);

  await db.batch([
    db
      .prepare(
        `INSERT INTO section_versions (
          id, owner_user_id, project_id, section_id, version_number,
          source, source_version_id, content, content_hash, summary
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        user.id,
        projectId,
        section.id,
        nextVersion,
        input.source,
        sourceVersionId,
        content,
        await hashText(content),
        summary,
      ),
    db
      .prepare(
        `UPDATE sections
         SET status = 'editing', word_count = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND project_id = ? AND owner_user_id = ?`,
      )
      .bind(wordCount, section.id, projectId, user.id),
    db
      .prepare(
        `UPDATE projects
         SET current_stage = 'writing', updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND owner_user_id = ?`,
      )
      .bind(projectId, user.id),
  ]);

  return {
    id,
    sectionId: section.id,
    versionNumber: nextVersion,
    source: input.source,
    sourceVersionId,
    content,
    summary,
    createdAt,
  };
}

async function ensureUser(db: D1Database, actor: M3Actor): Promise<UserRow> {
  const existing = await db
    .prepare(
      `SELECT id, email, display_name
       FROM users
       WHERE id = ? AND status = 'active'`,
    )
    .bind(actor.userId)
    .first<UserRow>();
  if (existing) return existing;
  throw new Error("当前 Session 用户不存在或已停用。");
}

async function resolveOwnedProjectId(
  db: D1Database,
  ownerUserId: string,
  requestedProjectId: string,
): Promise<string> {
  const project =
    requestedProjectId === "demo"
      ? await db
          .prepare(
            `SELECT id
             FROM projects
             WHERE owner_user_id = ? AND status = 'active'
             ORDER BY updated_at DESC, created_at DESC
             LIMIT 1`,
          )
          .bind(ownerUserId)
          .first<{ id: string }>()
      : await db
          .prepare(
            `SELECT id
             FROM projects
             WHERE id = ? AND owner_user_id = ?`,
          )
          .bind(requestedProjectId, ownerUserId)
          .first<{ id: string }>();

  if (!project) throw projectNotFound();
  return project.id;
}

function projectNotFound() {
  return new M3RepositoryError(
    "PROJECT_NOT_FOUND",
    "项目不存在或不属于当前用户。",
  );
}

function toProjectSummary(row: ProjectRow): M3ProjectSummary {
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

function toDiagnosisSnapshot(row: DiagnosisRow): M3DiagnosisSnapshot {
  return {
    id: row.id,
    versionNumber: row.version_number,
    status: row.status,
    title: row.title,
    paperType: row.paper_type,
    language: row.language,
    researchObject: row.research_object,
    researchQuestion: row.research_question,
    method: row.method,
    requirements: row.requirements,
    confirmedAt: row.confirmed_at,
  };
}

function toOutlineSection(row: SectionRow): M3OutlineSection {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    position: row.position,
    status: row.status,
    wordCount: row.word_count,
  };
}

function toSectionVersion(row: SectionVersionRow): M3SectionVersion {
  return {
    id: row.id,
    sectionId: row.section_id,
    versionNumber: row.version_number,
    source: row.source,
    sourceVersionId: row.source_version_id,
    content: row.content,
    summary: row.summary,
    createdAt: row.created_at,
  };
}

function toMaterialSummary(row: MaterialRow): M3MaterialSummary {
  return {
    id: row.id,
    kind: row.kind,
    filename: row.filename,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    status: row.status,
    errorMessage: row.error_message,
  };
}

async function hashText(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function countWords(value: string): number {
  const latinWords = value.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) ?? [];
  const hanCharacters = value.match(/[\u3400-\u9fff]/g) ?? [];
  return latinWords.length + hanCharacters.length;
}
