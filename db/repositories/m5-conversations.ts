import type {
  M5ConversationCompressionPlan,
  M5ConversationMessageRecord,
  M5ConversationSessionRecord,
  M5ConversationSummaryRecord,
  M5ConversationWorkspace,
} from "@/app/lib/m5-conversation-agent";
import { M5_CONVERSATION_CONTEXT_LIMITS } from "@/app/lib/m5-conversation-agent";
import type { M5ProductSkill } from "@/app/lib/m5-execution-contracts";
import type { M3Actor } from "@/app/lib/m3-server-identity";
import { getD1 } from "../index";

export type M5ConversationRepositoryErrorCode =
  | "PROJECT_NOT_FOUND"
  | "CONVERSATION_NOT_FOUND"
  | "CONVERSATION_ARCHIVED"
  | "INVALID_SUMMARY_SOURCE"
  | "DATABASE_WRITE_FAILED";

export class M5ConversationRepositoryError extends Error {
  readonly code: M5ConversationRepositoryErrorCode;

  constructor(
    code: M5ConversationRepositoryErrorCode,
    message: string,
  ) {
    super(message);
    this.code = code;
  }
}

type SessionRow = {
  id: string;
  project_id: string;
  title: string;
  status: M5ConversationSessionRecord["status"];
  active_product_skill: M5ProductSkill | null;
  message_count: number;
  summary_count: number;
  last_message_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  project_id: string;
  conversation_session_id: string;
  client_message_id: string;
  ordinal: number;
  role: M5ConversationMessageRecord["role"];
  content: string;
  created_at: string;
};

type SummaryRow = {
  id: string;
  project_id: string;
  conversation_session_id: string;
  client_summary_id: string;
  text: string;
  source_from_ordinal: number;
  source_to_ordinal: number;
  source_message_ids_json: string;
  status: "DERIVED_NOT_USER_CONFIRMED";
  created_at: string;
};

export async function createM5ConversationForActor(
  actor: M3Actor,
  requestedProjectId: string,
  input: {
    title: string;
    activeProductSkill: M5ProductSkill | null;
    idempotencyKey: string;
  },
): Promise<{ session: M5ConversationSessionRecord; replayed: boolean }> {
  const db = getD1();
  const projectId = await ownedProjectId(db, actor.userId, requestedProjectId);
  const replay = await findSessionByIdempotency(
    db,
    actor.userId,
    projectId,
    input.idempotencyKey,
  );
  if (replay) return { session: toSession(replay), replayed: true };

  const id = crypto.randomUUID();
  try {
    await db
      .prepare(
        `INSERT INTO conversation_sessions (
          id, owner_user_id, project_id, title, active_product_skill, idempotency_key
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        actor.userId,
        projectId,
        input.title,
        input.activeProductSkill,
        input.idempotencyKey,
      )
      .run();
  } catch {
    const raced = await findSessionByIdempotency(
      db,
      actor.userId,
      projectId,
      input.idempotencyKey,
    ).catch(() => null);
    if (raced) return { session: toSession(raced), replayed: true };
    throw databaseFailure("无法创建长期会话。");
  }
  const session = await loadSession(db, actor.userId, projectId, id);
  if (!session) throw databaseFailure("会话创建成功，但无法读取会话记录。");
  return { session: toSession(session), replayed: false };
}

export async function loadM5ConversationWorkspace(
  actor: M3Actor,
  requestedProjectId: string,
  selectedSessionId?: string,
  options: { messageLimit?: number; beforeOrdinal?: number } = {},
): Promise<M5ConversationWorkspace> {
  const db = getD1();
  const projectId = await ownedProjectId(db, actor.userId, requestedProjectId);
  const sessionRows = await db
    .prepare(
      `${sessionSelect} WHERE owner_user_id = ? AND project_id = ?
       ORDER BY updated_at DESC, created_at DESC`,
    )
    .bind(actor.userId, projectId)
    .all<SessionRow>();
  const sessions = (sessionRows.results ?? []).map(toSession);
  const selectedSession = selectedSessionId
    ? sessions.find((session) => session.id === selectedSessionId) ?? null
    : sessions[0] ?? null;
  if (selectedSessionId && !selectedSession) {
    throw new M5ConversationRepositoryError(
      "CONVERSATION_NOT_FOUND",
      "会话不存在或不属于当前用户与项目。",
    );
  }
  if (!selectedSession) {
    return {
      sessions,
      selectedSession: null,
      messages: [],
      summaries: [],
      messagePage: {
        limit: normalizedMessageLimit(options.messageLimit),
        hasEarlierMessages: false,
        oldestLoadedOrdinal: null,
        newestLoadedOrdinal: null,
      },
      compressionPlan: emptyCompressionPlan(),
    };
  }
  const messageLimit = normalizedMessageLimit(options.messageLimit);
  const beforeOrdinal = options.beforeOrdinal ?? null;
  const [messageRows, summaryRows, compressionPlan] = await Promise.all([
    db
      .prepare(
        `${messageSelect} WHERE owner_user_id = ? AND project_id = ?
         AND conversation_session_id = ? AND (? IS NULL OR ordinal < ?)
         ORDER BY ordinal DESC LIMIT ?`,
      )
      .bind(
        actor.userId,
        projectId,
        selectedSession.id,
        beforeOrdinal,
        beforeOrdinal,
        messageLimit,
      )
      .all<MessageRow>(),
    db
      .prepare(
        `${summarySelect} WHERE owner_user_id = ? AND project_id = ?
         AND conversation_session_id = ? ORDER BY created_at DESC LIMIT ?`,
      )
      .bind(
        actor.userId,
        projectId,
        selectedSession.id,
        M5_CONVERSATION_CONTEXT_LIMITS.maxLoadedSummaries,
      )
      .all<SummaryRow>(),
    loadCompressionPlan(db, actor.userId, projectId, selectedSession.id),
  ]);
  const messages = (messageRows.results ?? []).map(toMessage).reverse();
  const summaries = (summaryRows.results ?? []).map(toSummary).reverse();
  const oldestLoadedOrdinal = messages[0]?.ordinal ?? null;
  const hasEarlierMessages = oldestLoadedOrdinal
    ? Boolean(
        await db
          .prepare(
            `SELECT 1 AS found FROM conversation_messages
             WHERE owner_user_id = ? AND project_id = ?
               AND conversation_session_id = ? AND ordinal < ? LIMIT 1`,
          )
          .bind(actor.userId, projectId, selectedSession.id, oldestLoadedOrdinal)
          .first<{ found: number }>(),
      )
    : false;
  return {
    sessions,
    selectedSession,
    messages,
    summaries,
    messagePage: {
      limit: messageLimit,
      hasEarlierMessages,
      oldestLoadedOrdinal,
      newestLoadedOrdinal: messages.at(-1)?.ordinal ?? null,
    },
    compressionPlan,
  };
}

export async function appendM5ConversationMessage(
  actor: M3Actor,
  requestedProjectId: string,
  conversationSessionId: string,
  input: {
    clientMessageId: string;
    role: "USER" | "AGENT";
    content: string;
  },
): Promise<{ message: M5ConversationMessageRecord; replayed: boolean }> {
  const db = getD1();
  const projectId = await ownedProjectId(db, actor.userId, requestedProjectId);
  const session = await requiredSession(
    db,
    actor.userId,
    projectId,
    conversationSessionId,
  );
  if (session.status === "ARCHIVED") {
    throw new M5ConversationRepositoryError(
      "CONVERSATION_ARCHIVED",
      "已归档会话不能继续写入消息。",
    );
  }
  const replay = await findMessageByClientId(
    db,
    actor.userId,
    projectId,
    conversationSessionId,
    input.clientMessageId,
  );
  if (replay) return { message: toMessage(replay), replayed: true };

  const id = crypto.randomUUID();
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO conversation_messages (
            id, owner_user_id, project_id, conversation_session_id,
            client_message_id, ordinal, role, content
          ) SELECT ?, ?, ?, ?, ?, COALESCE(MAX(ordinal), 0) + 1, ?, ?
            FROM conversation_messages
            WHERE owner_user_id = ? AND project_id = ? AND conversation_session_id = ?`,
        )
        .bind(
          id,
          actor.userId,
          projectId,
          conversationSessionId,
          input.clientMessageId,
          input.role,
          input.content,
          actor.userId,
          projectId,
          conversationSessionId,
        ),
      db
        .prepare(
          `UPDATE conversation_sessions
           SET message_count = message_count + 1,
               last_message_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND owner_user_id = ? AND project_id = ? AND status != 'ARCHIVED'`,
        )
        .bind(conversationSessionId, actor.userId, projectId),
    ]);
  } catch {
    const raced = await findMessageByClientId(
      db,
      actor.userId,
      projectId,
      conversationSessionId,
      input.clientMessageId,
    ).catch(() => null);
    if (raced) return { message: toMessage(raced), replayed: true };
    throw databaseFailure("无法保存会话消息。");
  }
  const message = await loadMessage(db, actor.userId, projectId, id);
  if (!message) throw databaseFailure("消息保存成功，但无法读取消息记录。");
  return { message: toMessage(message), replayed: false };
}

export async function createM5ConversationSummary(
  actor: M3Actor,
  requestedProjectId: string,
  conversationSessionId: string,
  input: {
    clientSummaryId: string;
    text: string;
    sourceMessageIds: string[];
  },
): Promise<{ summary: M5ConversationSummaryRecord; replayed: boolean }> {
  const db = getD1();
  const projectId = await ownedProjectId(db, actor.userId, requestedProjectId);
  const session = await requiredSession(
    db,
    actor.userId,
    projectId,
    conversationSessionId,
  );
  if (session.status === "ARCHIVED") {
    throw new M5ConversationRepositoryError(
      "CONVERSATION_ARCHIVED",
      "已归档会话不能创建新摘要。",
    );
  }
  const replay = await findSummaryByClientId(
    db,
    actor.userId,
    projectId,
    conversationSessionId,
    input.clientSummaryId,
  );
  if (replay) return { summary: toSummary(replay), replayed: true };

  const sourceIds = [...new Set(input.sourceMessageIds)];
  const placeholders = sourceIds.map(() => "?").join(", ");
  const sourceRows = await db
    .prepare(
      `SELECT id, ordinal FROM conversation_messages
       WHERE owner_user_id = ? AND project_id = ? AND conversation_session_id = ?
       AND id IN (${placeholders})`,
    )
    .bind(actor.userId, projectId, conversationSessionId, ...sourceIds)
    .all<{ id: string; ordinal: number }>();
  const sources = sourceRows.results ?? [];
  if (sources.length !== sourceIds.length) {
    throw new M5ConversationRepositoryError(
      "INVALID_SUMMARY_SOURCE",
      "摘要来源消息必须全部属于当前会话。",
    );
  }
  const orderedSources = [...sources].sort(
    (left, right) => left.ordinal - right.ordinal,
  );
  const ordinals = orderedSources.map((source) => source.ordinal);
  if (Math.max(...ordinals) - Math.min(...ordinals) + 1 !== ordinals.length) {
    throw new M5ConversationRepositoryError(
      "INVALID_SUMMARY_SOURCE",
      "摘要来源消息必须构成连续范围，不能跳过中间消息。",
    );
  }
  const orderedSourceIds = orderedSources.map((source) => source.id);
  const coverage = await db
    .prepare(
      `SELECT COALESCE(MAX(source_to_ordinal), 0) AS covered_ordinal
       FROM conversation_summaries
       WHERE owner_user_id = ? AND project_id = ? AND conversation_session_id = ?`,
    )
    .bind(actor.userId, projectId, conversationSessionId)
    .first<{ covered_ordinal: number }>();
  const expectedCoveredOrdinal = coverage?.covered_ordinal ?? 0;
  if (Math.min(...ordinals) !== expectedCoveredOrdinal + 1) {
    throw new M5ConversationRepositoryError(
      "INVALID_SUMMARY_SOURCE",
      "新摘要必须紧接已有摘要覆盖位置，不能跳过未摘要消息。",
    );
  }
  const id = crypto.randomUUID();
  try {
    const results = await db.batch([
      db
        .prepare(
          `INSERT INTO conversation_summaries (
            id, owner_user_id, project_id, conversation_session_id,
            client_summary_id, text, source_from_ordinal, source_to_ordinal,
            source_message_ids_json, status
          ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DERIVED_NOT_USER_CONFIRMED'
            WHERE COALESCE((
              SELECT MAX(source_to_ordinal) FROM conversation_summaries
              WHERE owner_user_id = ? AND project_id = ?
                AND conversation_session_id = ?
            ), 0) = ?`,
        )
        .bind(
          id,
          actor.userId,
          projectId,
          conversationSessionId,
          input.clientSummaryId,
          input.text,
          Math.min(...ordinals),
          Math.max(...ordinals),
          JSON.stringify(orderedSourceIds),
          actor.userId,
          projectId,
          conversationSessionId,
          expectedCoveredOrdinal,
        ),
      db
        .prepare(
          `UPDATE conversation_sessions
           SET summary_count = summary_count + 1, status = 'SUMMARIZED',
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND owner_user_id = ? AND project_id = ?
             AND status != 'ARCHIVED'
             AND EXISTS (SELECT 1 FROM conversation_summaries WHERE id = ?)`,
        )
        .bind(conversationSessionId, actor.userId, projectId, id),
    ]);
    if (!results.at(0)?.meta?.changes) {
      throw new M5ConversationRepositoryError(
        "INVALID_SUMMARY_SOURCE",
        "摘要覆盖位置已变化，请重新读取压缩计划后重试。",
      );
    }
  } catch (error) {
    if (error instanceof M5ConversationRepositoryError) throw error;
    const raced = await findSummaryByClientId(
      db,
      actor.userId,
      projectId,
      conversationSessionId,
      input.clientSummaryId,
    ).catch(() => null);
    if (raced) return { summary: toSummary(raced), replayed: true };
    throw databaseFailure("无法保存会话摘要。");
  }
  const summary = await loadSummary(db, actor.userId, projectId, id);
  if (!summary) throw databaseFailure("摘要保存成功，但无法读取摘要记录。");
  return { summary: toSummary(summary), replayed: false };
}

export async function archiveM5Conversation(
  actor: M3Actor,
  requestedProjectId: string,
  conversationSessionId: string,
): Promise<M5ConversationSessionRecord> {
  const db = getD1();
  const projectId = await ownedProjectId(db, actor.userId, requestedProjectId);
  await requiredSession(db, actor.userId, projectId, conversationSessionId);
  try {
    await db
      .prepare(
        `UPDATE conversation_sessions
         SET status = 'ARCHIVED', archived_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND owner_user_id = ? AND project_id = ?`,
      )
      .bind(conversationSessionId, actor.userId, projectId)
      .run();
  } catch {
    throw databaseFailure("无法归档会话。");
  }
  return toSession(
    await requiredSession(db, actor.userId, projectId, conversationSessionId),
  );
}

async function ownedProjectId(
  db: D1Database,
  ownerUserId: string,
  requestedProjectId: string,
): Promise<string> {
  if (!requestedProjectId || requestedProjectId === "demo") {
    throw new M5ConversationRepositoryError(
      "PROJECT_NOT_FOUND",
      "缺少明确的项目上下文，请先选择项目。",
    );
  }
  const row = await db
    .prepare("SELECT id FROM projects WHERE id = ? AND owner_user_id = ? AND status = 'active'")
    .bind(requestedProjectId, ownerUserId)
    .first<{ id: string }>();
  if (!row) {
    throw new M5ConversationRepositoryError(
      "PROJECT_NOT_FOUND",
      "项目不存在或不属于当前用户。",
    );
  }
  return row.id;
}

async function requiredSession(
  db: D1Database,
  ownerUserId: string,
  projectId: string,
  sessionId: string,
): Promise<SessionRow> {
  const row = await loadSession(db, ownerUserId, projectId, sessionId);
  if (!row) {
    throw new M5ConversationRepositoryError(
      "CONVERSATION_NOT_FOUND",
      "会话不存在或不属于当前用户与项目。",
    );
  }
  return row;
}

function loadSession(
  db: D1Database,
  ownerUserId: string,
  projectId: string,
  id: string,
): Promise<SessionRow | null> {
  return db
    .prepare(`${sessionSelect} WHERE id = ? AND owner_user_id = ? AND project_id = ?`)
    .bind(id, ownerUserId, projectId)
    .first<SessionRow>();
}

function findSessionByIdempotency(
  db: D1Database,
  ownerUserId: string,
  projectId: string,
  key: string,
): Promise<SessionRow | null> {
  return db
    .prepare(
      `${sessionSelect} WHERE owner_user_id = ? AND project_id = ? AND idempotency_key = ?`,
    )
    .bind(ownerUserId, projectId, key)
    .first<SessionRow>();
}

function loadMessage(
  db: D1Database,
  ownerUserId: string,
  projectId: string,
  id: string,
): Promise<MessageRow | null> {
  return db
    .prepare(`${messageSelect} WHERE id = ? AND owner_user_id = ? AND project_id = ?`)
    .bind(id, ownerUserId, projectId)
    .first<MessageRow>();
}

function findMessageByClientId(
  db: D1Database,
  ownerUserId: string,
  projectId: string,
  sessionId: string,
  clientMessageId: string,
): Promise<MessageRow | null> {
  return db
    .prepare(
      `${messageSelect} WHERE owner_user_id = ? AND project_id = ?
       AND conversation_session_id = ? AND client_message_id = ?`,
    )
    .bind(ownerUserId, projectId, sessionId, clientMessageId)
    .first<MessageRow>();
}

function loadSummary(
  db: D1Database,
  ownerUserId: string,
  projectId: string,
  id: string,
): Promise<SummaryRow | null> {
  return db
    .prepare(`${summarySelect} WHERE id = ? AND owner_user_id = ? AND project_id = ?`)
    .bind(id, ownerUserId, projectId)
    .first<SummaryRow>();
}

function findSummaryByClientId(
  db: D1Database,
  ownerUserId: string,
  projectId: string,
  sessionId: string,
  clientSummaryId: string,
): Promise<SummaryRow | null> {
  return db
    .prepare(
      `${summarySelect} WHERE owner_user_id = ? AND project_id = ?
       AND conversation_session_id = ? AND client_summary_id = ?`,
    )
    .bind(ownerUserId, projectId, sessionId, clientSummaryId)
    .first<SummaryRow>();
}

const sessionSelect = `SELECT id, project_id, title, status, active_product_skill,
  message_count, summary_count, last_message_at, archived_at, created_at, updated_at
  FROM conversation_sessions`;
const messageSelect = `SELECT id, project_id, conversation_session_id,
  client_message_id, ordinal, role, content, created_at FROM conversation_messages`;
const summarySelect = `SELECT id, project_id, conversation_session_id,
  client_summary_id, text, source_from_ordinal, source_to_ordinal,
  source_message_ids_json, status, created_at FROM conversation_summaries`;

function toSession(row: SessionRow): M5ConversationSessionRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    status: row.status,
    activeProductSkill: row.active_product_skill,
    messageCount: row.message_count,
    summaryCount: row.summary_count,
    lastMessageAt: row.last_message_at,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toMessage(row: MessageRow): M5ConversationMessageRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    conversationSessionId: row.conversation_session_id,
    clientMessageId: row.client_message_id,
    ordinal: row.ordinal,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  };
}

function toSummary(row: SummaryRow): M5ConversationSummaryRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    conversationSessionId: row.conversation_session_id,
    clientSummaryId: row.client_summary_id,
    text: row.text,
    sourceMessageIds: JSON.parse(row.source_message_ids_json) as string[],
    sourceFromOrdinal: row.source_from_ordinal,
    sourceToOrdinal: row.source_to_ordinal,
    generatedAt: row.created_at,
    status: row.status,
  };
}

function databaseFailure(message: string): M5ConversationRepositoryError {
  return new M5ConversationRepositoryError("DATABASE_WRITE_FAILED", message);
}

function normalizedMessageLimit(value?: number): number {
  if (!value || !Number.isInteger(value) || value < 1) {
    return M5_CONVERSATION_CONTEXT_LIMITS.defaultMessagePageSize;
  }
  return Math.min(value, M5_CONVERSATION_CONTEXT_LIMITS.maxMessagePageSize);
}

async function loadCompressionPlan(
  db: D1Database,
  ownerUserId: string,
  projectId: string,
  sessionId: string,
): Promise<M5ConversationCompressionPlan> {
  const coverage = await db
    .prepare(
      `SELECT COALESCE(MAX(source_to_ordinal), 0) AS covered_ordinal
       FROM conversation_summaries
       WHERE owner_user_id = ? AND project_id = ? AND conversation_session_id = ?`,
    )
    .bind(ownerUserId, projectId, sessionId)
    .first<{ covered_ordinal: number }>();
  const coveredOrdinal = coverage?.covered_ordinal ?? 0;
  const remaining = await db
    .prepare(
      `SELECT COUNT(*) AS total, COALESCE(MAX(ordinal), 0) AS max_ordinal
       FROM conversation_messages
       WHERE owner_user_id = ? AND project_id = ?
         AND conversation_session_id = ? AND ordinal > ?`,
    )
    .bind(ownerUserId, projectId, sessionId, coveredOrdinal)
    .first<{ total: number; max_ordinal: number }>();
  const unsummarizedMessageCount = remaining?.total ?? 0;
  if (
    unsummarizedMessageCount <=
    M5_CONVERSATION_CONTEXT_LIMITS.compressionThreshold
  ) {
    return {
      ...emptyCompressionPlan(),
      unsummarizedMessageCount,
      retainedRecentMessageCount: Math.min(
        unsummarizedMessageCount,
        M5_CONVERSATION_CONTEXT_LIMITS.retainedRecentMessages,
      ),
    };
  }
  const sourceRows = await db
    .prepare(
      `SELECT id, ordinal FROM conversation_messages
       WHERE owner_user_id = ? AND project_id = ?
         AND conversation_session_id = ? AND ordinal > ? AND ordinal <= ?
       ORDER BY ordinal ASC LIMIT ?`,
    )
    .bind(
      ownerUserId,
      projectId,
      sessionId,
      coveredOrdinal,
      (remaining?.max_ordinal ?? 0) -
        M5_CONVERSATION_CONTEXT_LIMITS.retainedRecentMessages,
      M5_CONVERSATION_CONTEXT_LIMITS.maxSummarySourceMessages,
    )
    .all<{ id: string; ordinal: number }>();
  const sources = sourceRows.results ?? [];
  return {
    status: "NEEDS_SUMMARY",
    unsummarizedMessageCount,
    sourceMessageIds: sources.map((source) => source.id),
    sourceFromOrdinal: sources[0]?.ordinal ?? null,
    sourceToOrdinal: sources.at(-1)?.ordinal ?? null,
    retainedRecentMessageCount:
      M5_CONVERSATION_CONTEXT_LIMITS.retainedRecentMessages,
    appendOnly: true,
  };
}

function emptyCompressionPlan(): M5ConversationCompressionPlan {
  return {
    status: "NOT_NEEDED",
    unsummarizedMessageCount: 0,
    sourceMessageIds: [],
    sourceFromOrdinal: null,
    sourceToOrdinal: null,
    retainedRecentMessageCount: 0,
    appendOnly: true,
  };
}
