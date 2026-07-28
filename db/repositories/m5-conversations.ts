import type {
  M5ConversationMessageRecord,
  M5ConversationSessionRecord,
  M5ConversationSummaryRecord,
  M5ConversationWorkspace,
} from "@/app/lib/m5-conversation-agent";
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
    return { sessions, selectedSession: null, messages: [], summaries: [] };
  }
  const [messageRows, summaryRows] = await Promise.all([
    db
      .prepare(
        `${messageSelect} WHERE owner_user_id = ? AND project_id = ?
         AND conversation_session_id = ? ORDER BY ordinal ASC`,
      )
      .bind(actor.userId, projectId, selectedSession.id)
      .all<MessageRow>(),
    db
      .prepare(
        `${summarySelect} WHERE owner_user_id = ? AND project_id = ?
         AND conversation_session_id = ? ORDER BY created_at ASC`,
      )
      .bind(actor.userId, projectId, selectedSession.id)
      .all<SummaryRow>(),
  ]);
  return {
    sessions,
    selectedSession,
    messages: (messageRows.results ?? []).map(toMessage),
    summaries: (summaryRows.results ?? []).map(toSummary),
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
  const ordinals = sources.map((source) => source.ordinal);
  const id = crypto.randomUUID();
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO conversation_summaries (
            id, owner_user_id, project_id, conversation_session_id,
            client_summary_id, text, source_from_ordinal, source_to_ordinal,
            source_message_ids_json, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'DERIVED_NOT_USER_CONFIRMED')`,
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
          JSON.stringify(sourceIds),
        ),
      db
        .prepare(
          `UPDATE conversation_sessions
           SET summary_count = summary_count + 1, status = 'SUMMARIZED',
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND owner_user_id = ? AND project_id = ? AND status != 'ARCHIVED'`,
        )
        .bind(conversationSessionId, actor.userId, projectId),
    ]);
  } catch {
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
  const row =
    requestedProjectId === "demo"
      ? await db
          .prepare(
            `SELECT id FROM projects WHERE owner_user_id = ? AND status = 'active'
             ORDER BY updated_at DESC, created_at DESC LIMIT 1`,
          )
          .bind(ownerUserId)
          .first<{ id: string }>()
      : await db
          .prepare(
            "SELECT id FROM projects WHERE id = ? AND owner_user_id = ? AND status = 'active'",
          )
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
