import type {
  M4DiagnosisAuditEvent,
  M4DiagnosisField,
  M4DiagnosisQuestion,
  M4DiagnosisSession,
  M4DiagnosisVersion,
  M4DiagnosisWorkspace,
  M4TaskReadiness,
} from "@/app/lib/m4-diagnosis-contracts";
import type { M3Actor } from "@/app/lib/m3-server-identity";
import {
  createProjectDiagnosisQuestions,
  type DiagnosisEntryMode,
  type DiagnosisFieldStatus,
  type DiagnosisSourceType,
  type GuidanceDepth,
  type GuidanceQuestion,
} from "@/app/lib/progressive-diagnosis-mock";
import { getD1 } from "../index";

export class M4DiagnosisRepositoryError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type UserRow = { id: string };
type ProjectRow = {
  id: string;
  title: string;
  paper_type: string;
  language: string;
};
type SessionRow = {
  id: string;
  mode: DiagnosisEntryMode;
  depth: GuidanceDepth;
  status: "active" | "completed" | "cancelled";
  current_question_id: string | null;
  answered_count: number;
  consecutive_unknown_count: number;
  max_questions: number;
  stop_reason: string | null;
  output_diagnosis_card_id: string | null;
  completed_at: string | null;
};
type QuestionRow = {
  id: string;
  question_key: string;
  position: number;
  topic: string;
  field_key: string;
  parent_question_key: string | null;
  depends_on_answer: string | null;
  question: string;
  why_this_matters: string;
  decision_impact: string;
  recommended_answer: string;
  recommendation_reason: string;
  options_json: string;
  allow_custom_answer: number;
  allow_unknown: number;
  allow_skip: number;
  allow_ai_inference: number;
  blocking_level: GuidanceQuestion["blocking_level"];
  source_material_ids_json: string;
  source_locations_json: string;
  answer: string | null;
  answer_status: DiagnosisFieldStatus | null;
  answer_source_type: DiagnosisSourceType | null;
  confidence: "LOW" | "MEDIUM" | "HIGH" | null;
  asked_at: string | null;
  answered_at: string | null;
};
type FieldRow = {
  id: string;
  field_key: string;
  label: string;
  value: string;
  status: DiagnosisFieldStatus;
  source_type: DiagnosisSourceType;
  source_material_ids_json: string;
  source_locations_json: string;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  requires_confirmation: number;
  rationale: string;
  confirmed_at: string | null;
};
type VersionRow = {
  id: string;
  version_number: number;
  status: M4DiagnosisVersion["status"];
  confirmed_at: string | null;
  created_at: string;
};
type ReadinessRow = {
  id: string;
  task_key: string;
  task_name: string;
  status: M4TaskReadiness["status"];
  reason: string;
  missing_field_keys_json: string;
  checked_at: string;
};
type AuditRow = {
  id: string;
  action: string;
  actor_type: "USER" | "SYSTEM" | "AI";
  question_key: string | null;
  field_key: string | null;
  detail_json: string;
  created_at: string;
};

export async function loadM4DiagnosisWorkspace(
  actor: M3Actor,
  requestedProjectId: string,
): Promise<M4DiagnosisWorkspace> {
  const db = getD1();
  const { userId, project } = await resolveContext(db, actor, requestedProjectId);
  return readWorkspace(db, userId, project.id);
}

export async function startM4DiagnosisSession(
  actor: M3Actor,
  requestedProjectId: string,
  mode: DiagnosisEntryMode,
  depth: GuidanceDepth,
): Promise<M4DiagnosisWorkspace> {
  const db = getD1();
  const { userId, project } = await resolveContext(db, actor, requestedProjectId);
  const now = new Date().toISOString();
  const sessionId = crypto.randomUUID();
  const questions = selectQuestions(mode, depth, project);
  const baseCard = await db
    .prepare(
      `SELECT id, title, paper_type, language, research_object,
              research_question, method, requirements
       FROM diagnosis_cards
       WHERE project_id = ? AND owner_user_id = ?
       ORDER BY version_number DESC
       LIMIT 1`,
    )
    .bind(project.id, userId)
    .first<{
      id: string;
      title: string;
      paper_type: string;
      language: string;
      research_object: string;
      research_question: string;
      method: string;
      requirements: string;
    }>();

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE diagnosis_sessions
         SET status = 'cancelled', stop_reason = '用户启动了新的诊断会话',
             completed_at = ?, updated_at = CURRENT_TIMESTAMP
         WHERE project_id = ? AND owner_user_id = ? AND status = 'active'`,
      )
      .bind(now, project.id, userId),
    db
      .prepare(
        `INSERT INTO diagnosis_sessions (
          id, owner_user_id, project_id, mode, depth, status,
          current_question_id, max_questions, base_diagnosis_card_id
        ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
      )
      .bind(
        sessionId,
        userId,
        project.id,
        mode,
        depth,
        questions[0]?.question_id ?? null,
        questions.length,
        baseCard?.id ?? null,
      ),
  ];

  questions.forEach((question, position) => {
    statements.push(
      db
        .prepare(
          `INSERT INTO diagnosis_session_questions (
            id, owner_user_id, project_id, session_id, question_key, position,
            topic, field_key, parent_question_key, depends_on_answer, question,
            why_this_matters, decision_impact, recommended_answer,
            recommendation_reason, options_json, allow_custom_answer,
            allow_unknown, allow_skip, allow_ai_inference, blocking_level,
            source_material_ids_json, source_locations_json, confidence,
            asked_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          userId,
          project.id,
          sessionId,
          question.question_id,
          position,
          question.topic,
          question.field_key,
          question.parent_question_id,
          question.depends_on_answer,
          question.question,
          question.why_this_matters,
          question.decision_impact,
          question.recommended_answer,
          question.recommendation_reason,
          JSON.stringify(question.options),
          question.allow_custom_answer ? 1 : 0,
          question.allow_unknown ? 1 : 0,
          question.allow_skip ? 1 : 0,
          question.allow_ai_inference ? 1 : 0,
          question.blocking_level,
          JSON.stringify(question.source_material_ids),
          JSON.stringify(question.source_locations),
          question.confidence,
          position === 0 ? now : null,
        ),
    );
  });

  const seededFields = fieldsFromCard(baseCard, project);
  seededFields.forEach((field) => {
    statements.push(insertFieldStatement(db, userId, project.id, sessionId, null, field));
  });
  statements.push(
    auditStatement(db, {
      userId,
      projectId: project.id,
      sessionId,
      action: "SESSION_STARTED",
      actorType: "USER",
      detail: { mode, depth, max_questions: questions.length },
    }),
  );
  await db.batch(statements);
  await replaceReadiness(db, userId, project.id, sessionId, null);
  return readWorkspace(db, userId, project.id);
}

export async function answerM4DiagnosisQuestion(
  actor: M3Actor,
  requestedProjectId: string,
  input: {
    sessionId: string;
    questionId: string;
    answer: string;
    status: DiagnosisFieldStatus;
    sourceType: DiagnosisSourceType;
    confidence: "LOW" | "MEDIUM" | "HIGH";
  },
): Promise<M4DiagnosisWorkspace> {
  const db = getD1();
  const { userId, project } = await resolveContext(db, actor, requestedProjectId);
  const session = await requireActiveSession(db, userId, project.id, input.sessionId);
  const question = await db
    .prepare(
      `SELECT id, question_key, position, topic, field_key,
              recommendation_reason, source_material_ids_json,
              source_locations_json, answer
       FROM diagnosis_session_questions
       WHERE session_id = ? AND question_key = ?
         AND owner_user_id = ? AND project_id = ?`,
    )
    .bind(input.sessionId, input.questionId, userId, project.id)
    .first<{
      id: string;
      question_key: string;
      position: number;
      topic: string;
      field_key: string;
      recommendation_reason: string;
      source_material_ids_json: string;
      source_locations_json: string;
      answer: string | null;
    }>();
  if (!question) throw notFound("QUESTION_NOT_FOUND", "当前问题不存在。");

  const now = new Date().toISOString();
  const unknownCount =
    input.status === "UNKNOWN" ? session.consecutive_unknown_count + 1 : 0;
  const answeredCount = session.answered_count + (question.answer === null ? 1 : 0);
  const nextQuestion = await db
    .prepare(
      `SELECT question_key
       FROM diagnosis_session_questions
       WHERE session_id = ? AND owner_user_id = ? AND project_id = ?
         AND position > ? AND answer IS NULL
       ORDER BY position ASC
       LIMIT 1`,
    )
    .bind(input.sessionId, userId, project.id, question.position)
    .first<{ question_key: string }>();
  const shouldStop =
    unknownCount >= 2 || answeredCount >= session.max_questions || !nextQuestion;
  const stopReason =
    unknownCount >= 2
      ? "用户连续两次选择不知道"
      : shouldStop
        ? "达到当前模式的问题上限或问题树已完成"
        : null;

  const existingField = await db
    .prepare(
      `SELECT id FROM diagnosis_field_values
       WHERE session_id = ? AND field_key = ? AND owner_user_id = ? AND project_id = ?
       ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(input.sessionId, question.field_key, userId, project.id)
    .first<{ id: string }>();
  const requiresConfirmation =
    input.status === "AI_INFERRED" || input.status === "PENDING_CONFIRMATION";
  const field: Omit<M4DiagnosisField, "id" | "confirmed_at"> = {
    field: question.field_key,
    label: question.topic,
    value: input.answer,
    status: input.status,
    source_type: input.sourceType,
    source_material_ids: parseStringArray(question.source_material_ids_json),
    source_locations: parseStringArray(question.source_locations_json),
    confidence: input.confidence,
    requires_confirmation: requiresConfirmation,
    rationale:
      input.sourceType === "AI_RECOMMENDED"
        ? question.recommendation_reason
        : "由用户在本次引导会话中回答。",
  };

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE diagnosis_session_questions
         SET answer = ?, answer_status = ?, answer_source_type = ?,
             confidence = ?, answered_at = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND owner_user_id = ?`,
      )
      .bind(
        input.answer,
        input.status,
        input.sourceType,
        input.confidence,
        now,
        question.id,
        userId,
      ),
    db
      .prepare(
        `UPDATE diagnosis_sessions
         SET answered_count = ?, consecutive_unknown_count = ?,
             current_question_id = ?, stop_reason = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND owner_user_id = ? AND project_id = ?`,
      )
      .bind(
        answeredCount,
        unknownCount,
        shouldStop ? null : (nextQuestion?.question_key ?? null),
        stopReason,
        input.sessionId,
        userId,
        project.id,
      ),
  ];
  if (existingField) {
    statements.push(
      db
        .prepare(
          `UPDATE diagnosis_field_values
           SET label = ?, value = ?, status = ?, source_type = ?,
               source_material_ids_json = ?, source_locations_json = ?,
               confidence = ?, requires_confirmation = ?, rationale = ?,
               confirmed_at = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND owner_user_id = ?`,
        )
        .bind(
          field.label,
          field.value,
          field.status,
          field.source_type,
          JSON.stringify(field.source_material_ids),
          JSON.stringify(field.source_locations),
          field.confidence,
          field.requires_confirmation ? 1 : 0,
          field.rationale,
          field.status === "USER_CONFIRMED" ? now : null,
          existingField.id,
          userId,
        ),
    );
  } else {
    statements.push(insertFieldStatement(db, userId, project.id, input.sessionId, null, field));
  }
  statements.push(
    auditStatement(db, {
      userId,
      projectId: project.id,
      sessionId: input.sessionId,
      questionKey: question.question_key,
      fieldKey: question.field_key,
      action: "QUESTION_ANSWERED",
      actorType: input.sourceType === "AI_RECOMMENDED" ? "AI" : "USER",
      detail: {
        status: input.status,
        source_type: input.sourceType,
        stopped: shouldStop,
      },
    }),
  );
  if (nextQuestion && !shouldStop) {
    statements.push(
      db
        .prepare(
          `UPDATE diagnosis_session_questions
           SET asked_at = COALESCE(asked_at, ?), updated_at = CURRENT_TIMESTAMP
           WHERE session_id = ? AND question_key = ? AND owner_user_id = ?`,
        )
        .bind(now, input.sessionId, nextQuestion.question_key, userId),
    );
  }
  await db.batch(statements);
  await replaceReadiness(db, userId, project.id, input.sessionId, null);
  return readWorkspace(db, userId, project.id);
}

export async function saveM4DiagnosisFields(
  actor: M3Actor,
  requestedProjectId: string,
  sessionId: string,
  fields: Array<Omit<M4DiagnosisField, "id" | "confirmed_at">>,
): Promise<M4DiagnosisWorkspace> {
  const db = getD1();
  const { userId, project } = await resolveContext(db, actor, requestedProjectId);
  await requireActiveSession(db, userId, project.id, sessionId);
  const statements: D1PreparedStatement[] = [];
  for (const field of fields) {
    const existing = await db
      .prepare(
        `SELECT id FROM diagnosis_field_values
         WHERE session_id = ? AND field_key = ? AND owner_user_id = ? AND project_id = ?
         ORDER BY created_at DESC LIMIT 1`,
      )
      .bind(sessionId, field.field, userId, project.id)
      .first<{ id: string }>();
    if (existing) {
      statements.push(
        db
          .prepare(
            `UPDATE diagnosis_field_values
             SET label = ?, value = ?, status = ?, source_type = ?,
                 source_material_ids_json = ?, source_locations_json = ?,
                 confidence = ?, requires_confirmation = ?, rationale = ?,
                 confirmed_at = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND owner_user_id = ?`,
          )
          .bind(
            field.label,
            field.value,
            field.status,
            field.source_type,
            JSON.stringify(field.source_material_ids),
            JSON.stringify(field.source_locations),
            field.confidence,
            field.requires_confirmation ? 1 : 0,
            field.rationale,
            field.status === "USER_CONFIRMED" ? new Date().toISOString() : null,
            existing.id,
            userId,
          ),
      );
    } else {
      statements.push(insertFieldStatement(db, userId, project.id, sessionId, null, field));
    }
  }
  statements.push(
    auditStatement(db, {
      userId,
      projectId: project.id,
      sessionId,
      action: "FIELDS_SAVED",
      actorType: "USER",
      detail: { field_count: fields.length },
    }),
  );
  await db.batch(statements);
  await replaceReadiness(db, userId, project.id, sessionId, null);
  return readWorkspace(db, userId, project.id);
}

export async function finishM4DiagnosisSession(
  actor: M3Actor,
  requestedProjectId: string,
  sessionId: string,
  stopReason: string,
): Promise<M4DiagnosisWorkspace> {
  const db = getD1();
  const { userId, project } = await resolveContext(db, actor, requestedProjectId);
  const session = await requireOwnedSession(db, userId, project.id, sessionId);
  if (session.status === "completed") {
    return readWorkspace(db, userId, project.id);
  }
  const fields = await readFields(db, userId, project.id, sessionId, null);
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE diagnosis_sessions
         SET status = 'completed', stop_reason = ?, output_diagnosis_card_id = NULL,
             completed_at = ?, current_question_id = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND owner_user_id = ? AND project_id = ?`,
      )
      .bind(stopReason, now, sessionId, userId, project.id),
    auditStatement(db, {
      userId,
      projectId: project.id,
      sessionId,
      action: "CANDIDATE_COMPLETED",
      actorType: "SYSTEM",
      detail: { stop_reason: stopReason, field_count: fields.length },
    }),
  ];
  await db.batch(statements);
  await replaceReadiness(db, userId, project.id, sessionId, null);
  return readWorkspace(db, userId, project.id);
}

export async function confirmM4DiagnosisCard(
  actor: M3Actor,
  requestedProjectId: string,
  sessionId: string,
): Promise<M4DiagnosisWorkspace> {
  const db = getD1();
  const { userId, project } = await resolveContext(db, actor, requestedProjectId);
  const session = await requireOwnedSession(db, userId, project.id, sessionId);
  if (session.status !== "completed") {
    throw new M4DiagnosisRepositoryError(
      "CANDIDATE_NOT_COMPLETED",
      "诊断候选尚未完成，不能确认成正式诊断卡。",
    );
  }
  if (session.output_diagnosis_card_id) {
    return readWorkspace(db, userId, project.id);
  }
  const latest = await db
    .prepare(
      `SELECT MAX(version_number) AS value FROM diagnosis_cards
       WHERE project_id = ? AND owner_user_id = ?`,
    )
    .bind(project.id, userId)
    .first<{ value: number | null }>();
  const sourceFields = await readFields(db, userId, project.id, sessionId, null);
  const fieldMap = new Map(sourceFields.map((field) => [field.field, field.value]));
  const confirmedCardId = crypto.randomUUID();
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE diagnosis_cards
         SET status = 'superseded', updated_at = CURRENT_TIMESTAMP
         WHERE project_id = ? AND owner_user_id = ? AND status = 'confirmed'`,
      )
      .bind(project.id, userId),
    db
      .prepare(
        `INSERT INTO diagnosis_cards (
          id, owner_user_id, project_id, version_number, status,
          title, paper_type, language, research_object, research_question,
          method, requirements, confirmed_at
        ) VALUES (?, ?, ?, ?, 'confirmed', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        confirmedCardId,
        userId,
        project.id,
        (latest?.value ?? 0) + 1,
        fieldMap.get("formal_title") || fieldMap.get("project_goal") || project.title,
        project.paper_type,
        project.language,
        fieldMap.get("research_focus") || fieldMap.get("data_source") || "",
        fieldMap.get("research_question") || "",
        fieldMap.get("research_method") || "",
        fieldMap.get("delivery_requirements") || "",
        now,
      ),
    db
      .prepare(
        `UPDATE diagnosis_sessions
         SET output_diagnosis_card_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND owner_user_id = ? AND project_id = ?`,
      )
      .bind(confirmedCardId, sessionId, userId, project.id),
    db
      .prepare(
        `UPDATE projects
         SET title = COALESCE(NULLIF(?, ''), title), current_stage = 'outline', updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND owner_user_id = ?`,
      )
      .bind(fieldMap.get("formal_title") ?? "", project.id, userId),
  ];
  sourceFields.forEach((field) => {
    statements.push(
      insertFieldStatement(
        db,
        userId,
        project.id,
        null,
        confirmedCardId,
        {
          ...field,
          status: "USER_CONFIRMED",
          requires_confirmation: false,
          confirmed_at: now,
        },
      ),
    );
  });
  statements.push(
    auditStatement(db, {
      userId,
      projectId: project.id,
      sessionId,
      diagnosisCardId: confirmedCardId,
      action: "DIAGNOSIS_CONFIRMED",
      actorType: "USER",
      detail: {
        source_session_id: sessionId,
        confirmed_field_count: sourceFields.length,
      },
    }),
  );
  await db.batch(statements);
  await copyReadinessToCard(db, userId, project.id, sessionId, confirmedCardId);
  return readWorkspace(db, userId, project.id);
}

export async function archiveM4DiagnosisCard(
  actor: M3Actor,
  requestedProjectId: string,
  diagnosisCardId: string,
): Promise<M4DiagnosisWorkspace> {
  const db = getD1();
  const { userId, project } = await resolveContext(db, actor, requestedProjectId);
  const result = await db
    .prepare(
      `UPDATE diagnosis_cards
       SET status = 'archived', updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND project_id = ? AND owner_user_id = ?
         AND status IN ('draft', 'pending_confirmation', 'superseded')`,
    )
    .bind(diagnosisCardId, project.id, userId)
    .run();
  if (!result.meta?.changes) {
    throw notFound(
      "DIAGNOSIS_NOT_FOUND",
      "诊断卡版本不存在、已归档或当前确认版本不能直接归档。",
    );
  }
  await db
    .prepare(
      `INSERT INTO diagnosis_audit_events (
        id, owner_user_id, project_id, diagnosis_card_id,
        action, actor_type, detail_json
      ) VALUES (?, ?, ?, ?, 'DIAGNOSIS_ARCHIVED', 'USER', ?)`,
    )
    .bind(
      crypto.randomUUID(),
      userId,
      project.id,
      diagnosisCardId,
      JSON.stringify({ diagnosis_card_id: diagnosisCardId }),
    )
    .run();
  return readWorkspace(db, userId, project.id);
}

async function readWorkspace(
  db: D1Database,
  userId: string,
  projectId: string,
): Promise<M4DiagnosisWorkspace> {
  const session = await db
    .prepare(
      `SELECT id, mode, depth, status, current_question_id, answered_count,
              consecutive_unknown_count, max_questions, stop_reason,
              output_diagnosis_card_id, completed_at
       FROM diagnosis_sessions
       WHERE project_id = ? AND owner_user_id = ?
       ORDER BY created_at DESC, rowid DESC LIMIT 1`,
    )
    .bind(projectId, userId)
    .first<SessionRow>();
  const latestCard = await db
    .prepare(
      `SELECT id FROM diagnosis_cards
       WHERE project_id = ? AND owner_user_id = ?
       ORDER BY version_number DESC LIMIT 1`,
    )
    .bind(projectId, userId)
    .first<{ id: string }>();
  const project = await db
    .prepare("SELECT title FROM projects WHERE id = ? AND owner_user_id = ?")
    .bind(projectId, userId)
    .first<{ title: string }>();
  const [questions, fields, versions, readiness, audit] = await Promise.all([
    session ? readQuestions(db, userId, projectId, session.id) : Promise.resolve([]),
    session
      ? readFields(db, userId, projectId, session.id, null)
      : latestCard
        ? readFields(db, userId, projectId, null, latestCard.id)
        : Promise.resolve([]),
    readVersions(db, userId, projectId),
    readReadiness(db, userId, projectId, session?.id ?? null, latestCard?.id ?? null),
    readAudit(db, userId, projectId),
  ]);
  const contextualQuestions = session && project
    ? contextualizeStoredQuestions(questions, session.mode, session.depth, project.title)
    : questions;
  return {
    source: "d1-m4",
    session: session ? toSession(session, contextualQuestions, fields) : null,
    latest_diagnosis_card_id: latestCard?.id ?? null,
    versions,
    readiness,
    audit,
  };
}

function contextualizeStoredQuestions(
  stored: M4DiagnosisQuestion[],
  mode: DiagnosisEntryMode,
  depth: GuidanceDepth,
  projectTitle: string,
): M4DiagnosisQuestion[] {
  const templates = new Map(
    createProjectDiagnosisQuestions(mode, depth, { title: projectTitle })
      .map((question) => [question.question_id, question]),
  );
  return stored.map((question) => {
    const template = templates.get(question.question_id);
    if (!template) return question;
    return {
      ...question,
      ...template,
      id: question.id,
      position: question.position,
      answer: question.answer,
      answer_status: question.answer_status,
      answer_source_type: question.answer_source_type,
      confidence: question.confidence,
      asked_at: question.asked_at,
      answered_at: question.answered_at,
    };
  });
}

async function resolveContext(
  db: D1Database,
  actor: M3Actor,
  requestedProjectId: string,
): Promise<{ userId: string; project: ProjectRow }> {
  const user = await db
    .prepare("SELECT id FROM users WHERE id = ? AND status = 'active'")
    .bind(actor.userId)
    .first<UserRow>();
  if (!user) throw new Error("当前 Session 用户不存在或已停用。");
  if (!requestedProjectId || requestedProjectId === "demo") {
    throw notFound("PROJECT_NOT_FOUND", "缺少明确的项目上下文，请先选择项目。");
  }
  const project = await db
    .prepare(
      `SELECT id, title, paper_type, language FROM projects
       WHERE id = ? AND owner_user_id = ?`,
    )
    .bind(requestedProjectId, user.id)
    .first<ProjectRow>();
  if (!project) throw notFound("PROJECT_NOT_FOUND", "项目不存在或不属于当前用户。");
  return { userId: user.id, project };
}

function selectQuestions(
  mode: DiagnosisEntryMode,
  depth: GuidanceDepth,
  project: ProjectRow,
) {
  return createProjectDiagnosisQuestions(mode, depth, { title: project.title });
}

function fieldsFromCard(
  card:
    | {
        title: string;
        research_object: string;
        research_question: string;
        method: string;
        requirements: string;
      }
    | null
    | undefined,
  project: ProjectRow,
): Array<Omit<M4DiagnosisField, "id" | "confirmed_at">> {
  const values = [
    ["project_goal", "项目目标", card?.title || project.title],
    ["research_focus", "研究焦点", card?.research_object || ""],
    ["research_question", "研究问题", card?.research_question || ""],
    ["research_method", "研究方法", card?.method || ""],
    ["delivery_requirements", "交付要求", card?.requirements || ""],
  ] as const;
  return values.map(([field, label, value]) => ({
    field,
    label,
    value,
    status: value ? "USER_CONFIRMED" : "UNKNOWN",
    source_type: "IMPORTED",
    source_material_ids: [],
    source_locations: [],
    confidence: value ? "HIGH" : "LOW",
    requires_confirmation: !value,
    rationale: value ? "从最近诊断版本导入。" : "当前尚未提供。",
  }));
}

async function requireActiveSession(
  db: D1Database,
  userId: string,
  projectId: string,
  sessionId: string,
) {
  const session = await requireOwnedSession(db, userId, projectId, sessionId);
  if (session.status !== "active") {
    throw notFound("SESSION_NOT_ACTIVE", "该诊断会话已经结束。");
  }
  return session;
}

async function requireOwnedSession(
  db: D1Database,
  userId: string,
  projectId: string,
  sessionId: string,
) {
  const session = await db
    .prepare(
      `SELECT id, mode, depth, status, current_question_id, answered_count,
              consecutive_unknown_count, max_questions, stop_reason,
              output_diagnosis_card_id, completed_at
       FROM diagnosis_sessions
       WHERE id = ? AND owner_user_id = ? AND project_id = ?`,
    )
    .bind(sessionId, userId, projectId)
    .first<SessionRow>();
  if (!session) throw notFound("SESSION_NOT_FOUND", "诊断会话不存在。");
  return session;
}

async function replaceReadiness(
  db: D1Database,
  userId: string,
  projectId: string,
  sessionId: string,
  cardId: string | null,
) {
  const fields = await readFields(db, userId, projectId, sessionId, null);
  const items = calculateReadiness(fields);
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `DELETE FROM diagnosis_task_readiness
         WHERE session_id = ? AND owner_user_id = ? AND project_id = ?`,
      )
      .bind(sessionId, userId, projectId),
  ];
  items.forEach((item) => {
    statements.push(
      db
        .prepare(
          `INSERT INTO diagnosis_task_readiness (
            id, owner_user_id, project_id, session_id, diagnosis_card_id,
            task_key, task_name, status, reason, missing_field_keys_json, checked_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          userId,
          projectId,
          sessionId,
          cardId,
          item.task_key,
          item.task_name,
          item.status,
          item.reason,
          JSON.stringify(item.missing_field_keys),
          now,
        ),
    );
  });
  await db.batch(statements);
}

function calculateReadiness(
  fields: M4DiagnosisField[],
): Array<Omit<M4TaskReadiness, "id" | "checked_at">> {
  const confirmed = new Set(
    fields
      .filter((field) => field.status === "USER_CONFIRMED" && field.value.trim())
      .map((field) => field.field),
  );
  const hasTopic =
    confirmed.has("project_goal") ||
    fields.some(
      (field) =>
        field.field === "research_focus" &&
        Boolean(field.value.trim()) &&
        !["UNKNOWN", "SKIPPED", "MISSING_MATERIAL"].includes(field.status),
    );
  const missingMethod = ["research_focus", "data_source", "research_method"].filter(
    (key) => !confirmed.has(key),
  );
  const missingResults = [
    "data_source",
    "sample",
    "analysis_method",
    "analysis_results",
  ].filter((key) => !confirmed.has(key));
  return [
    {
      task_key: "literature",
      task_name: "文献探索",
      status: hasTopic ? "READY" : "NEEDS_CONFIRMATION",
      reason: hasTopic
        ? "已有可用于检索的研究主题。"
        : "需要先提供一个大致研究方向。",
      missing_field_keys: hasTopic ? [] : ["project_goal"],
    },
    {
      task_key: "narrow",
      task_name: "题目收窄与研究问题候选",
      status: hasTopic ? "READY_WITH_WARNINGS" : "NEEDS_CONFIRMATION",
      reason: hasTopic
        ? "可以生成候选，但未确认内容必须继续标为候选。"
        : "缺少可用于收窄的研究主题。",
      missing_field_keys: hasTopic ? [] : ["project_goal"],
    },
    {
      task_key: "method",
      task_name: "方法章节正式写作",
      status: missingMethod.length ? "NEEDS_CONFIRMATION" : "READY",
      reason: missingMethod.length
        ? "研究对象、数据来源和基本研究设计尚未共同确认。"
        : "方法章节最低输入已经确认。",
      missing_field_keys: missingMethod,
    },
    {
      task_key: "results",
      task_name: "结果章节写作",
      status: missingResults.length ? "NEEDS_MATERIAL" : "READY",
      reason: missingResults.length
        ? "缺少真实样本、分析方法或可核验结果。"
        : "结果写作所需真实输入已经确认。",
      missing_field_keys: missingResults,
    },
    {
      task_key: "citation",
      task_name: "正式引用与证据导出",
      status: "BLOCKED",
      reason: "M4 尚未接入可核验文献身份和论断—证据绑定。",
      missing_field_keys: ["verified_evidence"],
    },
  ];
}

async function copyReadinessToCard(
  db: D1Database,
  userId: string,
  projectId: string,
  sourceSessionId: string,
  targetCardId: string,
) {
  const source = await db
    .prepare(
      `SELECT task_key, task_name, status, reason, missing_field_keys_json, checked_at
       FROM diagnosis_task_readiness
       WHERE session_id = ? AND owner_user_id = ? AND project_id = ?`,
    )
    .bind(sourceSessionId, userId, projectId)
    .all<Omit<ReadinessRow, "id">>();
  if (!(source.results ?? []).length) return;
  await db.batch(
    (source.results ?? []).map((item) =>
      db
        .prepare(
          `INSERT INTO diagnosis_task_readiness (
            id, owner_user_id, project_id, diagnosis_card_id, task_key,
            task_name, status, reason, missing_field_keys_json, checked_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          userId,
          projectId,
          targetCardId,
          item.task_key,
          item.task_name,
          item.status,
          item.reason,
          item.missing_field_keys_json,
          item.checked_at,
        ),
    ),
  );
}

function insertFieldStatement(
  db: D1Database,
  userId: string,
  projectId: string,
  sessionId: string | null,
  cardId: string | null,
  field: Omit<M4DiagnosisField, "id" | "confirmed_at"> & {
    confirmed_at?: string | null;
  },
) {
  return db
    .prepare(
      `INSERT INTO diagnosis_field_values (
        id, owner_user_id, project_id, session_id, diagnosis_card_id,
        field_key, label, value, status, source_type,
        source_material_ids_json, source_locations_json, confidence,
        requires_confirmation, rationale, confirmed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      userId,
      projectId,
      sessionId,
      cardId,
      field.field,
      field.label,
      field.value,
      field.status,
      field.source_type,
      JSON.stringify(field.source_material_ids),
      JSON.stringify(field.source_locations),
      field.confidence,
      field.requires_confirmation ? 1 : 0,
      field.rationale,
      field.confirmed_at ??
        (field.status === "USER_CONFIRMED" ? new Date().toISOString() : null),
    );
}

function auditStatement(
  db: D1Database,
  input: {
    userId: string;
    projectId: string;
    sessionId?: string;
    diagnosisCardId?: string;
    questionKey?: string;
    fieldKey?: string;
    action: string;
    actorType: "USER" | "SYSTEM" | "AI";
    detail: Record<string, unknown>;
  },
) {
  return db
    .prepare(
      `INSERT INTO diagnosis_audit_events (
        id, owner_user_id, project_id, session_id, diagnosis_card_id,
        question_key, field_key, action, actor_type, detail_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      input.userId,
      input.projectId,
      input.sessionId ?? null,
      input.diagnosisCardId ?? null,
      input.questionKey ?? null,
      input.fieldKey ?? null,
      input.action,
      input.actorType,
      JSON.stringify(input.detail),
    );
}

async function readQuestions(
  db: D1Database,
  userId: string,
  projectId: string,
  sessionId: string,
): Promise<M4DiagnosisQuestion[]> {
  const result = await db
    .prepare(
      `SELECT id, question_key, position, topic, field_key, parent_question_key,
              depends_on_answer, question, why_this_matters, decision_impact,
              recommended_answer, recommendation_reason, options_json,
              allow_custom_answer, allow_unknown, allow_skip, allow_ai_inference,
              blocking_level, source_material_ids_json, source_locations_json,
              answer, answer_status, answer_source_type, confidence, asked_at,
              answered_at
       FROM diagnosis_session_questions
       WHERE session_id = ? AND owner_user_id = ? AND project_id = ?
       ORDER BY position ASC`,
    )
    .bind(sessionId, userId, projectId)
    .all<QuestionRow>();
  return (result.results ?? []).map(toQuestion);
}

async function readFields(
  db: D1Database,
  userId: string,
  projectId: string,
  sessionId: string | null,
  cardId: string | null,
): Promise<M4DiagnosisField[]> {
  const result = sessionId
    ? await db
        .prepare(
          `SELECT id, field_key, label, value, status, source_type,
                  source_material_ids_json, source_locations_json, confidence,
                  requires_confirmation, rationale, confirmed_at
           FROM diagnosis_field_values
           WHERE session_id = ? AND owner_user_id = ? AND project_id = ?
           ORDER BY created_at ASC`,
        )
        .bind(sessionId, userId, projectId)
        .all<FieldRow>()
    : cardId
      ? await db
          .prepare(
            `SELECT id, field_key, label, value, status, source_type,
                    source_material_ids_json, source_locations_json, confidence,
                    requires_confirmation, rationale, confirmed_at
             FROM diagnosis_field_values
             WHERE diagnosis_card_id = ? AND owner_user_id = ? AND project_id = ?
             ORDER BY created_at ASC`,
          )
          .bind(cardId, userId, projectId)
          .all<FieldRow>()
      : { results: [] as FieldRow[] };
  return (result.results ?? []).map(toField);
}

async function readVersions(
  db: D1Database,
  userId: string,
  projectId: string,
): Promise<M4DiagnosisVersion[]> {
  const result = await db
    .prepare(
      `SELECT id, version_number, status, confirmed_at, created_at
       FROM diagnosis_cards
       WHERE owner_user_id = ? AND project_id = ?
       ORDER BY version_number DESC`,
    )
    .bind(userId, projectId)
    .all<VersionRow>();
  return (result.results ?? []).map((row) => ({
    id: row.id,
    version_number: row.version_number,
    status: row.status,
    confirmed_at: row.confirmed_at,
    created_at: row.created_at,
  }));
}

async function readReadiness(
  db: D1Database,
  userId: string,
  projectId: string,
  sessionId: string | null,
  cardId: string | null,
): Promise<M4TaskReadiness[]> {
  const result = sessionId
    ? await db
        .prepare(
          `SELECT id, task_key, task_name, status, reason,
                  missing_field_keys_json, checked_at
           FROM diagnosis_task_readiness
           WHERE session_id = ? AND owner_user_id = ? AND project_id = ?
           ORDER BY created_at ASC`,
        )
        .bind(sessionId, userId, projectId)
        .all<ReadinessRow>()
    : cardId
      ? await db
          .prepare(
            `SELECT id, task_key, task_name, status, reason,
                    missing_field_keys_json, checked_at
             FROM diagnosis_task_readiness
             WHERE diagnosis_card_id = ? AND owner_user_id = ? AND project_id = ?
             ORDER BY created_at ASC`,
          )
          .bind(cardId, userId, projectId)
          .all<ReadinessRow>()
      : { results: [] as ReadinessRow[] };
  return (result.results ?? []).map((row) => ({
    id: row.id,
    task_key: row.task_key,
    task_name: row.task_name,
    status: row.status,
    reason: row.reason,
    missing_field_keys: parseStringArray(row.missing_field_keys_json),
    checked_at: row.checked_at,
  }));
}

async function readAudit(
  db: D1Database,
  userId: string,
  projectId: string,
): Promise<M4DiagnosisAuditEvent[]> {
  const result = await db
    .prepare(
      `SELECT id, action, actor_type, question_key, field_key,
              detail_json, created_at
       FROM diagnosis_audit_events
       WHERE owner_user_id = ? AND project_id = ?
       ORDER BY created_at DESC LIMIT 30`,
    )
    .bind(userId, projectId)
    .all<AuditRow>();
  return (result.results ?? []).map((row) => ({
    id: row.id,
    action: row.action,
    actor_type: row.actor_type,
    question_key: row.question_key,
    field_key: row.field_key,
    detail: parseObject(row.detail_json),
    created_at: row.created_at,
  }));
}

function toSession(
  row: SessionRow,
  questions: M4DiagnosisQuestion[],
  fields: M4DiagnosisField[],
): M4DiagnosisSession {
  return {
    id: row.id,
    mode: row.mode,
    depth: row.depth,
    status: row.status,
    current_question_id: row.current_question_id,
    answered_count: row.answered_count,
    consecutive_unknown_count: row.consecutive_unknown_count,
    max_questions: row.max_questions,
    stop_reason: row.stop_reason,
    output_diagnosis_card_id: row.output_diagnosis_card_id,
    completed_at: row.completed_at,
    questions,
    fields,
  };
}

function toQuestion(row: QuestionRow): M4DiagnosisQuestion {
  return {
    id: row.id,
    position: row.position,
    question_id: row.question_key,
    session_id: "",
    topic: row.topic,
    field_key: row.field_key,
    parent_question_id: row.parent_question_key,
    depends_on_answer: row.depends_on_answer,
    question: row.question,
    why_this_matters: row.why_this_matters,
    decision_impact: row.decision_impact,
    recommended_answer: row.recommended_answer,
    recommendation_reason: row.recommendation_reason,
    options: parseOptions(row.options_json),
    allow_custom_answer: Boolean(row.allow_custom_answer),
    allow_unknown: Boolean(row.allow_unknown),
    allow_skip: Boolean(row.allow_skip),
    allow_ai_inference: Boolean(row.allow_ai_inference),
    blocking_level: row.blocking_level,
    source_material_ids: parseStringArray(row.source_material_ids_json),
    source_locations: parseStringArray(row.source_locations_json),
    answer: row.answer,
    answer_status: row.answer_status,
    answer_source_type: row.answer_source_type,
    confidence: row.confidence ?? "MEDIUM",
    asked_at: row.asked_at,
    answered_at: row.answered_at,
  };
}

function toField(row: FieldRow): M4DiagnosisField {
  return {
    id: row.id,
    field: row.field_key,
    label: row.label,
    value: row.value,
    status: row.status,
    source_type: row.source_type,
    source_material_ids: parseStringArray(row.source_material_ids_json),
    source_locations: parseStringArray(row.source_locations_json),
    confidence: row.confidence,
    requires_confirmation: Boolean(row.requires_confirmation),
    rationale: row.rationale,
    confirmed_at: row.confirmed_at,
  };
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function parseOptions(value: string): Array<{ id: string; label: string }> {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is { id: string; label: string } =>
            Boolean(item) &&
            typeof item === "object" &&
            typeof item.id === "string" &&
            typeof item.label === "string",
        )
      : [];
  } catch {
    return [];
  }
}

function parseObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function notFound(code: string, message: string) {
  return new M4DiagnosisRepositoryError(code, message);
}
