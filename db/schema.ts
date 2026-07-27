import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamps = () => ({
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    phone: text("phone"),
    displayName: text("display_name").notNull(),
    status: text("status", { enum: ["active", "frozen"] }).notNull().default("active"),
    role: text("role", { enum: ["user", "admin"] }).notNull().default("user"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("users_email_uq").on(table.email),
    uniqueIndex("users_phone_uq").on(table.phone),
  ],
);

export const loginRecords = sqliteTable(
  "login_records",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    status: text("status", { enum: ["succeeded", "failed"] }).notNull(),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    errorCode: text("error_code"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("login_records_user_created_idx").on(table.userId, table.createdAt)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_uq").on(table.tokenHash),
    index("sessions_user_expires_idx").on(table.userId, table.expiresAt),
  ],
);

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    paperType: text("paper_type").notNull(),
    language: text("language").notNull(),
    primaryCreationMethod: text("primary_creation_method", {
      enum: ["idea", "existing_draft", "requirements", "literature", "data"],
    }).notNull(),
    status: text("status", { enum: ["active", "archived"] }).notNull().default("active"),
    currentStage: text("current_stage").notNull().default("diagnosis"),
    ...timestamps(),
  },
  (table) => [
    index("projects_owner_updated_idx").on(table.ownerUserId, table.updatedAt),
    index("projects_owner_status_idx").on(table.ownerUserId, table.status),
  ],
);

export const projectRequirements = sqliteTable(
  "project_requirements",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    content: text("content").notNull(),
    sourceMaterialId: text("source_material_id"),
    isConfirmed: integer("is_confirmed", { mode: "boolean" }).notNull().default(false),
    ...timestamps(),
  },
  (table) => [index("project_requirements_owner_project_idx").on(table.ownerUserId, table.projectId)],
);

export const diagnosisCards = sqliteTable(
  "diagnosis_cards",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    status: text("status", {
      enum: [
        "draft",
        "pending_confirmation",
        "confirmed",
        "superseded",
        "archived",
      ],
    })
      .notNull()
      .default("draft"),
    title: text("title").notNull(),
    paperType: text("paper_type").notNull(),
    language: text("language").notNull(),
    researchObject: text("research_object").notNull().default(""),
    researchQuestion: text("research_question").notNull().default(""),
    method: text("method").notNull().default(""),
    requirements: text("requirements").notNull().default(""),
    confirmedAt: text("confirmed_at"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("diagnosis_project_version_uq").on(table.projectId, table.versionNumber),
    index("diagnosis_owner_project_status_idx").on(
      table.ownerUserId,
      table.projectId,
      table.status,
    ),
  ],
);

export const diagnosisSessions = sqliteTable(
  "diagnosis_sessions",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    mode: text("mode", {
      enum: ["quick", "guided", "material", "professional"],
    }).notNull(),
    depth: text("depth", { enum: ["standard", "deep"] }).notNull().default("standard"),
    status: text("status", {
      enum: ["active", "completed", "cancelled"],
    })
      .notNull()
      .default("active"),
    currentQuestionId: text("current_question_id"),
    answeredCount: integer("answered_count").notNull().default(0),
    consecutiveUnknownCount: integer("consecutive_unknown_count").notNull().default(0),
    maxQuestions: integer("max_questions").notNull(),
    stopReason: text("stop_reason"),
    baseDiagnosisCardId: text("base_diagnosis_card_id").references(
      () => diagnosisCards.id,
      { onDelete: "set null" },
    ),
    outputDiagnosisCardId: text("output_diagnosis_card_id").references(
      () => diagnosisCards.id,
      { onDelete: "set null" },
    ),
    completedAt: text("completed_at"),
    ...timestamps(),
  },
  (table) => [
    index("diagnosis_sessions_owner_project_status_idx").on(
      table.ownerUserId,
      table.projectId,
      table.status,
    ),
  ],
);

export const diagnosisSessionQuestions = sqliteTable(
  "diagnosis_session_questions",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => diagnosisSessions.id, { onDelete: "cascade" }),
    questionKey: text("question_key").notNull(),
    position: integer("position").notNull(),
    topic: text("topic").notNull(),
    fieldKey: text("field_key").notNull(),
    parentQuestionKey: text("parent_question_key"),
    dependsOnAnswer: text("depends_on_answer"),
    question: text("question").notNull(),
    whyThisMatters: text("why_this_matters").notNull(),
    decisionImpact: text("decision_impact").notNull(),
    recommendedAnswer: text("recommended_answer").notNull(),
    recommendationReason: text("recommendation_reason").notNull(),
    optionsJson: text("options_json").notNull().default("[]"),
    allowCustomAnswer: integer("allow_custom_answer", { mode: "boolean" })
      .notNull()
      .default(true),
    allowUnknown: integer("allow_unknown", { mode: "boolean" }).notNull().default(true),
    allowSkip: integer("allow_skip", { mode: "boolean" }).notNull().default(true),
    allowAiInference: integer("allow_ai_inference", { mode: "boolean" })
      .notNull()
      .default(true),
    blockingLevel: text("blocking_level", {
      enum: ["NONE", "CURRENT_TASK", "PROJECT_STAGE", "HIGH_RISK_TASK", "GLOBAL"],
    })
      .notNull()
      .default("NONE"),
    sourceMaterialIdsJson: text("source_material_ids_json").notNull().default("[]"),
    sourceLocationsJson: text("source_locations_json").notNull().default("[]"),
    answer: text("answer"),
    answerStatus: text("answer_status", {
      enum: [
        "USER_CONFIRMED",
        "AI_INFERRED",
        "PENDING_CONFIRMATION",
        "UNKNOWN",
        "SKIPPED",
        "MISSING_MATERIAL",
        "NOT_APPLICABLE",
      ],
    }),
    answerSourceType: text("answer_source_type", {
      enum: [
        "USER_INPUT",
        "MATERIAL_EXTRACTED",
        "AI_RECOMMENDED",
        "SYSTEM_DERIVED",
        "IMPORTED",
      ],
    }),
    confidence: text("confidence", { enum: ["LOW", "MEDIUM", "HIGH"] }),
    askedAt: text("asked_at"),
    answeredAt: text("answered_at"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("diagnosis_session_question_uq").on(table.sessionId, table.questionKey),
    index("diagnosis_questions_owner_project_idx").on(
      table.ownerUserId,
      table.projectId,
      table.sessionId,
    ),
  ],
);

export const diagnosisFieldValues = sqliteTable(
  "diagnosis_field_values",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => diagnosisSessions.id, {
      onDelete: "set null",
    }),
    diagnosisCardId: text("diagnosis_card_id").references(() => diagnosisCards.id, {
      onDelete: "cascade",
    }),
    fieldKey: text("field_key").notNull(),
    label: text("label").notNull(),
    value: text("value").notNull().default(""),
    status: text("status", {
      enum: [
        "USER_CONFIRMED",
        "AI_INFERRED",
        "PENDING_CONFIRMATION",
        "UNKNOWN",
        "SKIPPED",
        "MISSING_MATERIAL",
        "NOT_APPLICABLE",
      ],
    }).notNull(),
    sourceType: text("source_type", {
      enum: [
        "USER_INPUT",
        "MATERIAL_EXTRACTED",
        "AI_RECOMMENDED",
        "SYSTEM_DERIVED",
        "IMPORTED",
      ],
    }).notNull(),
    sourceMaterialIdsJson: text("source_material_ids_json").notNull().default("[]"),
    sourceLocationsJson: text("source_locations_json").notNull().default("[]"),
    confidence: text("confidence", { enum: ["LOW", "MEDIUM", "HIGH"] })
      .notNull()
      .default("MEDIUM"),
    requiresConfirmation: integer("requires_confirmation", { mode: "boolean" })
      .notNull()
      .default(false),
    rationale: text("rationale").notNull().default(""),
    confirmedAt: text("confirmed_at"),
    ...timestamps(),
  },
  (table) => [
    index("diagnosis_fields_owner_project_idx").on(
      table.ownerUserId,
      table.projectId,
      table.sessionId,
    ),
    index("diagnosis_fields_card_idx").on(table.diagnosisCardId, table.fieldKey),
  ],
);

export const diagnosisTaskReadiness = sqliteTable(
  "diagnosis_task_readiness",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => diagnosisSessions.id, {
      onDelete: "set null",
    }),
    diagnosisCardId: text("diagnosis_card_id").references(() => diagnosisCards.id, {
      onDelete: "cascade",
    }),
    taskKey: text("task_key").notNull(),
    taskName: text("task_name").notNull(),
    status: text("status", {
      enum: [
        "READY",
        "READY_WITH_WARNINGS",
        "NEEDS_CONFIRMATION",
        "NEEDS_MATERIAL",
        "BLOCKED",
      ],
    }).notNull(),
    reason: text("reason").notNull(),
    missingFieldKeysJson: text("missing_field_keys_json").notNull().default("[]"),
    checkedAt: text("checked_at").notNull(),
    ...timestamps(),
  },
  (table) => [
    index("diagnosis_readiness_owner_project_idx").on(
      table.ownerUserId,
      table.projectId,
      table.sessionId,
    ),
    index("diagnosis_readiness_card_idx").on(table.diagnosisCardId, table.taskKey),
  ],
);

export const diagnosisAuditEvents = sqliteTable(
  "diagnosis_audit_events",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => diagnosisSessions.id, {
      onDelete: "set null",
    }),
    diagnosisCardId: text("diagnosis_card_id").references(() => diagnosisCards.id, {
      onDelete: "set null",
    }),
    questionKey: text("question_key"),
    fieldKey: text("field_key"),
    action: text("action").notNull(),
    actorType: text("actor_type", { enum: ["USER", "SYSTEM", "AI"] }).notNull(),
    modelProvider: text("model_provider"),
    modelName: text("model_name"),
    modelVersion: text("model_version"),
    detailJson: text("detail_json").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("diagnosis_audit_owner_project_created_idx").on(
      table.ownerUserId,
      table.projectId,
      table.createdAt,
    ),
  ],
);

export const materials = sqliteTable(
  "materials",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: text("kind", {
      enum: ["requirement", "manuscript", "literature", "data", "image", "note"],
    }).notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    objectKey: text("object_key"),
    status: text("status", {
      enum: ["queued", "parsing", "success", "failed", "cancelled"],
    })
      .notNull()
      .default("queued"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    ...timestamps(),
  },
  (table) => [
    index("materials_owner_project_idx").on(table.ownerUserId, table.projectId),
    index("materials_project_status_idx").on(table.projectId, table.status),
  ],
);

export const materialParseResults = sqliteTable(
  "material_parse_results",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    materialId: text("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "cascade" }),
    parserVersion: text("parser_version").notNull(),
    contentHash: text("content_hash").notNull(),
    parsedTextRef: text("parsed_text_ref"),
    pageCount: integer("page_count"),
    payloadJson: text("payload_json").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("material_parse_material_hash_uq").on(table.materialId, table.contentHash),
    index("material_parse_owner_project_idx").on(table.ownerUserId, table.projectId),
  ],
);

export const literatureRecords = sqliteTable(
  "literature_records",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    materialId: text("material_id").references(() => materials.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    authorsJson: text("authors_json").notNull().default("[]"),
    year: integer("year"),
    source: text("source"),
    doi: text("doi"),
    metadataStatus: text("metadata_status", {
      enum: ["unverified", "verified", "failed"],
    })
      .notNull()
      .default("unverified"),
    fullTextStatus: text("full_text_status", {
      enum: ["unavailable", "available", "parsed"],
    })
      .notNull()
      .default("unavailable"),
    ...timestamps(),
  },
  (table) => [
    index("literature_owner_project_idx").on(table.ownerUserId, table.projectId),
    uniqueIndex("literature_project_doi_uq").on(table.projectId, table.doi),
  ],
);

export const outlines = sqliteTable(
  "outlines",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    diagnosisCardId: text("diagnosis_card_id")
      .notNull()
      .references(() => diagnosisCards.id, { onDelete: "restrict" }),
    versionNumber: integer("version_number").notNull(),
    status: text("status", { enum: ["draft", "confirmed", "superseded"] })
      .notNull()
      .default("draft"),
    confirmedAt: text("confirmed_at"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("outlines_project_version_uq").on(table.projectId, table.versionNumber),
    index("outlines_owner_project_status_idx").on(table.ownerUserId, table.projectId, table.status),
  ],
);

export const sections = sqliteTable(
  "sections",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    outlineId: text("outline_id")
      .notNull()
      .references(() => outlines.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    position: integer("position").notNull(),
    status: text("status", {
      enum: ["not_started", "editing", "checking", "confirmed", "missing_material"],
    })
      .notNull()
      .default("not_started"),
    wordCount: integer("word_count").notNull().default(0),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("sections_outline_position_uq").on(table.outlineId, table.position),
    uniqueIndex("sections_outline_slug_uq").on(table.outlineId, table.slug),
    index("sections_owner_project_idx").on(table.ownerUserId, table.projectId),
  ],
);

export const sectionVersions = sqliteTable(
  "section_versions",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sectionId: text("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    source: text("source", {
      enum: ["original", "manual", "ai", "restore", "fallback_model"],
    }).notNull(),
    sourceVersionId: text("source_version_id"),
    content: text("content").notNull(),
    contentHash: text("content_hash").notNull(),
    summary: text("summary").notNull().default(""),
    createdByTaskId: text("created_by_task_id"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("section_versions_section_number_uq").on(table.sectionId, table.versionNumber),
    index("section_versions_section_hash_idx").on(table.sectionId, table.contentHash),
    index("section_versions_owner_project_idx").on(table.ownerUserId, table.projectId),
  ],
);

export const skills = sqliteTable(
  "skills",
  {
    id: text("id").primaryKey(),
    productKey: text("product_key").notNull(),
    displayName: text("display_name").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("skills_product_key_uq").on(table.productKey)],
);

export const skillVersions = sqliteTable(
  "skill_versions",
  {
    id: text("id").primaryKey(),
    skillId: text("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    version: text("version").notNull(),
    sourceName: text("source_name").notNull(),
    sourceCommit: text("source_commit"),
    license: text("license"),
    auditStatus: text("audit_status", {
      enum: ["pending", "approved", "rejected"],
    })
      .notNull()
      .default("pending"),
    configJson: text("config_json").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("skill_versions_skill_version_uq").on(table.skillId, table.version)],
);

export const aiTasks = sqliteTable(
  "ai_tasks",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sectionId: text("section_id").references(() => sections.id, { onDelete: "set null" }),
    parentTaskId: text("parent_task_id"),
    taskRole: text("task_role", {
      enum: [
        "ROUTER",
        "GENERATOR",
        "REVIEWER",
        "VERIFIER",
        "REVISER",
        "AGGREGATOR",
      ],
    }),
    productSkill: text("product_skill").notNull(),
    taskType: text("task_type").notNull(),
    status: text("status", {
      enum: [
        "queued",
        "running",
        "succeeded",
        "needs_input",
        "failed",
        "cancelled",
        "QUEUED",
        "PREPARING_CONTEXT",
        "PARSING",
        "RETRIEVING",
        "WAITING_FOR_USER_CONFIRMATION",
        "CALLING_MODEL",
        "GENERATING",
        "REVIEWING",
        "VERIFYING",
        "REVISING",
        "AGGREGATING",
        "RETRYING",
        "PARTIALLY_COMPLETED",
        "SUCCEEDED",
        "FAILED",
        "CANCELLED",
        "BLOCKED",
        "BUDGET_PAUSED",
      ],
    })
      .notNull()
      .default("queued"),
    reviewMode: text("review_mode", {
      enum: ["none", "standard", "strict", "custom"],
    })
      .notNull()
      .default("none"),
    idempotencyKey: text("idempotency_key"),
    executionProfileId: text("execution_profile_id"),
    reviewedVersionId: text("reviewed_version_id").references(
      () => sectionVersions.id,
      { onDelete: "set null" },
    ),
    resultVersionId: text("result_version_id").references(
      () => sectionVersions.id,
      { onDelete: "set null" },
    ),
    maxCalls: integer("max_calls").notNull().default(1),
    callsUsed: integer("calls_used").notNull().default(0),
    timeoutSeconds: integer("timeout_seconds").notNull().default(120),
    stopReason: text("stop_reason"),
    selectedMaterialIdsJson: text("selected_material_ids_json").notNull().default("[]"),
    modelConfigId: text("model_config_id"),
    skillVersionId: text("skill_version_id").references(() => skillVersions.id, {
      onDelete: "set null",
    }),
    errorStage: text("error_stage"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
    ...timestamps(),
  },
  (table) => [
    index("ai_tasks_owner_project_idx").on(table.ownerUserId, table.projectId),
    index("ai_tasks_status_created_idx").on(table.status, table.createdAt),
    index("ai_tasks_parent_idx").on(table.parentTaskId),
    uniqueIndex("ai_tasks_owner_project_idempotency_uq").on(
      table.ownerUserId,
      table.projectId,
      table.idempotencyKey,
    ),
  ],
);

export const aiTaskModelAssignments = sqliteTable(
  "ai_task_model_assignments",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    taskId: text("task_id")
      .notNull()
      .references(() => aiTasks.id, { onDelete: "cascade" }),
    role: text("role", {
      enum: [
        "ROUTER",
        "GENERATOR",
        "REVIEWER",
        "VERIFIER",
        "REVISER",
        "AGGREGATOR",
      ],
    }).notNull(),
    providerKey: text("provider_key").notNull(),
    modelKey: text("model_key").notNull(),
    modelVersion: text("model_version").notNull(),
    skillKey: text("skill_key").notNull(),
    skillVersion: text("skill_version").notNull(),
    modelId: text("model_id"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("ai_task_model_assignment_role_uq").on(table.taskId, table.role),
    index("ai_task_model_assignment_owner_project_idx").on(
      table.ownerUserId,
      table.projectId,
    ),
  ],
);

export const aiTaskEvents = sqliteTable(
  "ai_task_events",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    taskId: text("task_id")
      .notNull()
      .references(() => aiTasks.id, { onDelete: "cascade" }),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    actorType: text("actor_type", {
      enum: ["USER", "SYSTEM", "MODEL"],
    }).notNull(),
    reason: text("reason"),
    detailJson: text("detail_json").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("ai_task_events_owner_task_created_idx").on(
      table.ownerUserId,
      table.taskId,
      table.createdAt,
    ),
  ],
);

export const reviewReports = sqliteTable(
  "review_reports",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    taskId: text("task_id")
      .notNull()
      .references(() => aiTasks.id, { onDelete: "cascade" }),
    reviewedVersionId: text("reviewed_version_id")
      .notNull()
      .references(() => sectionVersions.id, { onDelete: "restrict" }),
    conclusion: text("conclusion", {
      enum: [
        "PASSED",
        "PASSED_WITH_WARNINGS",
        "REVISION_REQUIRED",
        "BLOCKED",
        "REVIEW_FAILED",
      ],
    }).notNull(),
    summary: text("summary").notNull(),
    highCount: integer("high_count").notNull().default(0),
    mediumCount: integer("medium_count").notNull().default(0),
    lowCount: integer("low_count").notNull().default(0),
    contextSnapshotJson: text("context_snapshot_json").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("review_reports_task_uq").on(table.taskId),
    index("review_reports_owner_project_idx").on(
      table.ownerUserId,
      table.projectId,
    ),
  ],
);

export const reviewIssues = sqliteTable(
  "review_issues",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    reportId: text("report_id")
      .notNull()
      .references(() => reviewReports.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    severity: text("severity", { enum: ["HIGH", "MEDIUM", "LOW"] }).notNull(),
    title: text("title").notNull(),
    detail: text("detail").notNull(),
    suggestion: text("suggestion").notNull(),
    modelSourcesJson: text("model_sources_json").notNull().default("[]"),
    evidenceBindingIdsJson: text("evidence_binding_ids_json").notNull().default("[]"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("review_issues_owner_report_idx").on(table.ownerUserId, table.reportId),
  ],
);

export const reviewIssueDecisions = sqliteTable(
  "review_issue_decisions",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    reportId: text("report_id")
      .notNull()
      .references(() => reviewReports.id, { onDelete: "cascade" }),
    issueId: text("issue_id").references(() => reviewIssues.id, {
      onDelete: "cascade",
    }),
    decision: text("decision", {
      enum: [
        "ACCEPTED_ORIGINAL",
        "SELECTED_FOR_REVISION",
        "IGNORED",
        "REVIEW_AGAIN",
      ],
    }).notNull(),
    reason: text("reason"),
    resolvedVersionId: text("resolved_version_id").references(
      () => sectionVersions.id,
      { onDelete: "set null" },
    ),
    decidedAt: text("decided_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("review_decisions_owner_report_idx").on(
      table.ownerUserId,
      table.reportId,
    ),
  ],
);

export const sectionVersionAdoptions = sqliteTable(
  "section_version_adoptions",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sectionId: text("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    versionId: text("version_id")
      .notNull()
      .references(() => sectionVersions.id, { onDelete: "cascade" }),
    sourceTaskId: text("source_task_id").references(() => aiTasks.id, {
      onDelete: "set null",
    }),
    candidateType: text("candidate_type", {
      enum: ["GENERATED", "AGGREGATED", "REVISED", "RESTORED"],
    }).notNull(),
    adopted: integer("adopted", { mode: "boolean" }).notNull().default(false),
    adoptedAt: text("adopted_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("section_version_adoption_version_uq").on(table.versionId),
    index("section_version_adoption_owner_section_idx").on(
      table.ownerUserId,
      table.sectionId,
    ),
  ],
);

export const aiTaskResults = sqliteTable(
  "ai_task_results",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    taskId: text("task_id")
      .notNull()
      .references(() => aiTasks.id, { onDelete: "cascade" }),
    resultType: text("result_type").notNull(),
    contentJson: text("content_json").notNull().default("{}"),
    warningsJson: text("warnings_json").notNull().default("[]"),
    missingInputsJson: text("missing_inputs_json").notNull().default("[]"),
    createdVersionId: text("created_version_id"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("ai_task_results_owner_task_idx").on(table.ownerUserId, table.taskId)],
);

export const citations = sqliteTable(
  "citations",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sectionVersionId: text("section_version_id")
      .notNull()
      .references(() => sectionVersions.id, { onDelete: "cascade" }),
    literatureId: text("literature_id")
      .notNull()
      .references(() => literatureRecords.id, { onDelete: "restrict" }),
    citationKey: text("citation_key").notNull(),
    locator: text("locator"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("citations_owner_version_idx").on(table.ownerUserId, table.sectionVersionId)],
);

export const claims = sqliteTable(
  "claims",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sectionVersionId: text("section_version_id")
      .notNull()
      .references(() => sectionVersions.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    startOffset: integer("start_offset"),
    endOffset: integer("end_offset"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("claims_owner_version_idx").on(table.ownerUserId, table.sectionVersionId)],
);

export const evidenceBindings = sqliteTable(
  "evidence_bindings",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    claimId: text("claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade" }),
    materialId: text("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "restrict" }),
    parseResultId: text("parse_result_id").references(() => materialParseResults.id, {
      onDelete: "restrict",
    }),
    page: integer("page"),
    paragraph: text("paragraph"),
    quote: text("quote").notNull().default(""),
    supportLevel: text("support_level", {
      enum: ["direct", "indirect", "unverified"],
    }).notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("evidence_claim_material_locator_uq").on(
      table.claimId,
      table.materialId,
      table.page,
      table.paragraph,
    ),
    index("evidence_owner_project_idx").on(table.ownerUserId, table.projectId),
  ],
);

export const exportRecords = sqliteTable(
  "export_records",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    taskId: text("task_id").references(() => aiTasks.id, { onDelete: "set null" }),
    format: text("format", { enum: ["docx"] }).notNull().default("docx"),
    sourceVersionIdsJson: text("source_version_ids_json").notNull().default("[]"),
    objectKey: text("object_key"),
    status: text("status", { enum: ["queued", "ready", "failed"] })
      .notNull()
      .default("queued"),
    errorMessage: text("error_message"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("export_records_owner_project_idx").on(table.ownerUserId, table.projectId)],
);

export const adminAuditLogs = sqliteTable(
  "admin_audit_logs",
  {
    id: text("id").primaryKey(),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    targetUserId: text("target_user_id").references(() => users.id, { onDelete: "set null" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    metadataJson: text("metadata_json").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("admin_audit_actor_created_idx").on(table.actorUserId, table.createdAt)],
);

export const ideaExplorationSessions = sqliteTable(
  "idea_exploration_sessions",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["draft", "active", "confirmed", "cancelled"] })
      .notNull()
      .default("draft"),
    constraintsJson: text("constraints_json").notNull().default("{}"),
    confirmedCandidateId: text("confirmed_candidate_id"),
    ...timestamps(),
  },
  (table) => [index("idea_sessions_owner_project_idx").on(table.ownerUserId, table.projectId)],
);

export const ideaCandidates = sqliteTable(
  "idea_candidates",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => ideaExplorationSessions.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    payloadJson: text("payload_json").notNull().default("{}"),
    decision: text("decision", { enum: ["pending", "kept", "rejected", "merged"] })
      .notNull()
      .default("pending"),
    decisionReason: text("decision_reason"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idea_candidates_owner_session_idx").on(table.ownerUserId, table.sessionId)],
);

export const externalSearchRuns = sqliteTable(
  "external_search_runs",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    queryText: text("query_text").notNull(),
    sourceKeysJson: text("source_keys_json").notNull().default("[]"),
    status: text("status", { enum: ["draft", "running", "succeeded", "failed"] })
      .notNull()
      .default("draft"),
    searchedAt: text("searched_at"),
    errorMessage: text("error_message"),
    ...timestamps(),
  },
  (table) => [index("external_search_owner_project_idx").on(table.ownerUserId, table.projectId)],
);

export const literatureCandidates = sqliteTable(
  "literature_candidates",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    searchRunId: text("search_run_id")
      .notNull()
      .references(() => externalSearchRuns.id, { onDelete: "cascade" }),
    sourceKey: text("source_key").notNull(),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    metadataJson: text("metadata_json").notNull().default("{}"),
    status: text("status", {
      enum: ["search_candidate", "metadata_verified", "fulltext_available", "evidence_verified"],
    })
      .notNull()
      .default("search_candidate"),
    importedLiteratureId: text("imported_literature_id").references(() => literatureRecords.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("literature_candidates_run_external_uq").on(
      table.searchRunId,
      table.sourceKey,
      table.externalId,
    ),
    index("literature_candidates_owner_project_idx").on(table.ownerUserId, table.projectId),
  ],
);

export const reviewRuns = sqliteTable(
  "review_runs",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    taskId: text("task_id").references(() => aiTasks.id, { onDelete: "set null" }),
    scopeJson: text("scope_json").notNull().default("{}"),
    status: text("status", { enum: ["draft", "running", "succeeded", "failed"] })
      .notNull()
      .default("draft"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("review_runs_owner_project_idx").on(table.ownerUserId, table.projectId)],
);

export const reviewFindings = sqliteTable(
  "review_findings",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    reviewRunId: text("review_run_id")
      .notNull()
      .references(() => reviewRuns.id, { onDelete: "cascade" }),
    perspective: text("perspective").notNull(),
    severity: text("severity", { enum: ["major", "minor", "note"] }).notNull(),
    sectionId: text("section_id").references(() => sections.id, { onDelete: "set null" }),
    summary: text("summary").notNull(),
    evidenceJson: text("evidence_json").notNull().default("[]"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("review_findings_owner_run_idx").on(table.ownerUserId, table.reviewRunId)],
);

export const submissionPreparations = sqliteTable(
  "submission_preparations",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["draft", "ready", "blocked"] })
      .notNull()
      .default("draft"),
    checklistJson: text("checklist_json").notNull().default("{}"),
    dataAvailabilityStatement: text("data_availability_statement").notNull().default(""),
    ...timestamps(),
  },
  (table) => [index("submission_owner_project_idx").on(table.ownerUserId, table.projectId)],
);

export const reviewerComments = sqliteTable(
  "reviewer_comments",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    reviewerLabel: text("reviewer_label").notNull(),
    commentNumber: text("comment_number").notNull(),
    content: text("content").notNull(),
    sourceMaterialId: text("source_material_id").references(() => materials.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("reviewer_comments_project_number_uq").on(
      table.projectId,
      table.reviewerLabel,
      table.commentNumber,
    ),
    index("reviewer_comments_owner_project_idx").on(table.ownerUserId, table.projectId),
  ],
);

export const revisionTasks = sqliteTable(
  "revision_tasks",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    reviewerCommentId: text("reviewer_comment_id")
      .notNull()
      .references(() => reviewerComments.id, { onDelete: "cascade" }),
    sectionId: text("section_id").references(() => sections.id, { onDelete: "set null" }),
    baseVersionId: text("base_version_id").references(() => sectionVersions.id, {
      onDelete: "restrict",
    }),
    resultVersionId: text("result_version_id").references(() => sectionVersions.id, {
      onDelete: "restrict",
    }),
    status: text("status", { enum: ["open", "in_progress", "ready_for_review", "resolved"] })
      .notNull()
      .default("open"),
    plannedAction: text("planned_action").notNull().default(""),
    ...timestamps(),
  },
  (table) => [index("revision_tasks_owner_project_idx").on(table.ownerUserId, table.projectId)],
);

export const responseDrafts = sqliteTable(
  "response_drafts",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    revisionTaskId: text("revision_task_id")
      .notNull()
      .references(() => revisionTasks.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    content: text("content").notNull(),
    userConfirmed: integer("user_confirmed", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("response_drafts_task_version_uq").on(table.revisionTaskId, table.versionNumber),
    index("response_drafts_owner_project_idx").on(table.ownerUserId, table.projectId),
  ],
);

export const figureProjects = sqliteTable(
  "figure_projects",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    figureType: text("figure_type").notNull(),
    status: text("status", { enum: ["draft", "ready", "failed"] }).notNull().default("draft"),
    ...timestamps(),
  },
  (table) => [index("figure_projects_owner_project_idx").on(table.ownerUserId, table.projectId)],
);

export const figureVersions = sqliteTable(
  "figure_versions",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    figureProjectId: text("figure_project_id")
      .notNull()
      .references(() => figureProjects.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    sourceVersionId: text("source_version_id"),
    sourceDataRef: text("source_data_ref"),
    specificationJson: text("specification_json").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("figure_versions_project_number_uq").on(
      table.figureProjectId,
      table.versionNumber,
    ),
    index("figure_versions_owner_project_idx").on(table.ownerUserId, table.projectId),
  ],
);

export const figureAssets = sqliteTable(
  "figure_assets",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    figureVersionId: text("figure_version_id")
      .notNull()
      .references(() => figureVersions.id, { onDelete: "cascade" }),
    format: text("format", { enum: ["png", "svg"] }).notNull(),
    objectKey: text("object_key"),
    contentHash: text("content_hash").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("figure_assets_owner_version_idx").on(table.ownerUserId, table.figureVersionId)],
);

export const presentationProjects = sqliteTable(
  "presentation_projects",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    presentationType: text("presentation_type").notNull(),
    audience: text("audience").notNull().default(""),
    durationMinutes: integer("duration_minutes"),
    ...timestamps(),
  },
  (table) => [index("presentation_projects_owner_project_idx").on(table.ownerUserId, table.projectId)],
);

export const presentationVersions = sqliteTable(
  "presentation_versions",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    presentationProjectId: text("presentation_project_id")
      .notNull()
      .references(() => presentationProjects.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    sourcePaperVersionIdsJson: text("source_paper_version_ids_json").notNull().default("[]"),
    narrativeJson: text("narrative_json").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("presentation_versions_project_number_uq").on(
      table.presentationProjectId,
      table.versionNumber,
    ),
    index("presentation_versions_owner_project_idx").on(table.ownerUserId, table.projectId),
  ],
);

export const slides = sqliteTable(
  "slides",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    presentationVersionId: text("presentation_version_id")
      .notNull()
      .references(() => presentationVersions.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    contentJson: text("content_json").notNull().default("{}"),
    speakerNotes: text("speaker_notes").notNull().default(""),
    assetBindingsJson: text("asset_bindings_json").notNull().default("[]"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("slides_version_position_uq").on(table.presentationVersionId, table.position),
    index("slides_owner_project_idx").on(table.ownerUserId, table.projectId),
  ],
);
