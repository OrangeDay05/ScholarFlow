import type { M5ProductSkill } from "./m5-execution-contracts";

export const M5_CONVERSATION_SKILL_PROMPTS = [
  {
    uiSkillId: "project-diagnosis",
    productSkill: "project_diagnosis_outline",
    title: "项目诊断与提纲",
    prompt: "先梳理我的目标和现有材料，找出当前最关键的缺口。",
  },
  {
    uiSkillId: "literature-matrix",
    productSkill: "literature_summary_matrix",
    title: "文献总结与文献矩阵",
    prompt: "整理已授权文献的核心观点、方法和可核验来源位置。",
  },
  {
    uiSkillId: "chapter-writing",
    productSkill: "chapter_writing",
    title: "通用章节写作",
    prompt: "根据已确认诊断卡和授权材料，为当前章节准备写作方案。",
  },
  {
    uiSkillId: "revision",
    productSkill: "general_revision",
    title: "通用修改",
    prompt: "分析当前章节可以怎样修改，并先列出修改范围。",
  },
  {
    uiSkillId: "consistency",
    productSkill: "consistency_check",
    title: "一致性检查",
    prompt: "检查研究问题、方法、结果和结论之间是否一致。",
  },
  {
    uiSkillId: "evidence",
    productSkill: "citation_evidence_check",
    title: "引用与证据检查",
    prompt: "检查当前章节的重要论断是否有已授权材料支持。",
  },
] as const satisfies ReadonlyArray<{
  uiSkillId: string;
  productSkill: M5ProductSkill;
  title: string;
  prompt: string;
}>;

export type M5ConversationMessage = {
  id: string;
  role: "USER" | "AGENT";
  content: string;
  createdAt: string;
};

export type M5ConversationSummary = {
  text: string;
  sourceMessageIds: string[];
  generatedAt: string;
  status: "DERIVED_NOT_USER_CONFIRMED";
};

export type M5ConversationSessionStatus =
  | "ACTIVE"
  | "SUMMARIZED"
  | "ARCHIVED";

export type M5ConversationSessionRecord = {
  id: string;
  projectId: string;
  title: string;
  status: M5ConversationSessionStatus;
  activeProductSkill: M5ProductSkill | null;
  messageCount: number;
  summaryCount: number;
  lastMessageAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type M5ConversationMessageRecord = M5ConversationMessage & {
  conversationSessionId: string;
  projectId: string;
  clientMessageId: string;
  ordinal: number;
};

export type M5ConversationSummaryRecord = M5ConversationSummary & {
  id: string;
  conversationSessionId: string;
  projectId: string;
  clientSummaryId: string;
  sourceFromOrdinal: number;
  sourceToOrdinal: number;
};

export type M5ConversationWorkspace = {
  sessions: M5ConversationSessionRecord[];
  selectedSession: M5ConversationSessionRecord | null;
  messages: M5ConversationMessageRecord[];
  summaries: M5ConversationSummaryRecord[];
};

export type M5ToolIntent = {
  id: string;
  conversationId: string;
  productSkill: M5ProductSkill;
  operation: string;
  rationale: string;
  authorizedMaterialIds: string[];
  state: "PROPOSED";
  createdAt: string;
};

export type M5ActionProposalStatus =
  | "AWAITING_USER_CONFIRMATION"
  | "CONFIRMED"
  | "REJECTED";

export type M5ActionProposal = {
  id: string;
  toolIntentId: string;
  title: string;
  effect: string;
  warnings: string[];
  status: M5ActionProposalStatus;
  createdAt: string;
  decidedAt: string | null;
};

export function createToolIntent(input: {
  conversationId: string;
  productSkill: M5ProductSkill;
  operation: string;
  rationale: string;
  authorizedMaterialIds: string[];
  now: string;
}): M5ToolIntent {
  return {
    id: `intent-${input.now}`,
    conversationId: input.conversationId,
    productSkill: input.productSkill,
    operation: input.operation,
    rationale: input.rationale,
    authorizedMaterialIds: [...new Set(input.authorizedMaterialIds)],
    state: "PROPOSED",
    createdAt: input.now,
  };
}

export function createActionProposal(
  intent: M5ToolIntent,
  title: string,
): M5ActionProposal {
  return {
    id: `proposal-${intent.id}`,
    toolIntentId: intent.id,
    title,
    effect: "确认后仅进入待执行队列；本批次不会调用真实模型或覆盖正文。",
    warnings:
      intent.authorizedMaterialIds.length > 0
        ? []
        : ["当前未授权可读材料，后续执行可能需要补充材料。"],
    status: "AWAITING_USER_CONFIRMATION",
    createdAt: intent.createdAt,
    decidedAt: null,
  };
}

export function decideActionProposal(
  proposal: M5ActionProposal,
  decision: "CONFIRM" | "REJECT",
  now: string,
): M5ActionProposal {
  if (proposal.status !== "AWAITING_USER_CONFIRMATION") return proposal;
  return {
    ...proposal,
    status: decision === "CONFIRM" ? "CONFIRMED" : "REJECTED",
    decidedAt: now,
  };
}

export function summarizeConversation(
  messages: M5ConversationMessage[],
  now: string,
): M5ConversationSummary {
  const sourceMessages = messages.slice(-6);
  const text = sourceMessages
    .map((message) => `${message.role === "USER" ? "用户" : "Agent"}：${message.content}`)
    .join(" ")
    .slice(0, 240);
  return {
    text: text || "当前会话尚无可总结内容。",
    sourceMessageIds: sourceMessages.map((message) => message.id),
    generatedAt: now,
    status: "DERIVED_NOT_USER_CONFIRMED",
  };
}
