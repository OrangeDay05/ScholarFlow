import type { M5ProductSkill } from "./m5-execution-contracts";

export const M5_CONVERSATION_SKILL_PROMPTS = [
  {
    uiSkillId: "project-diagnosis",
    productSkill: "project_diagnosis_outline",
    title: "项目诊断与提纲重构",
    sourceSkills: "rw-research-router → brainstorming-research",
    description: "调用科研任务路由与研究构思流程，核对正式事实、材料缺口和提纲结构，输出待确认的诊断与提纲候选。",
    activationMessage: "请调用“项目诊断与提纲重构”Skill，基于当前项目上下文开始工作。",
    prompt: "请基于当前正式诊断卡、已确认提纲和本轮授权材料，重新梳理项目目标、关键缺口与提纲调整建议。只生成候选并与我讨论，不要直接修改正式诊断卡或提纲。",
  },
  {
    uiSkillId: "literature-matrix",
    productSkill: "literature_summary_matrix",
    title: "文献精读与证据矩阵",
    sourceSkills: "rw-paper-extractor → literature-review",
    description: "调用论文提取与文献综述流程，逐篇提取可回溯证据，输出文献总结、证据矩阵和研究缺口。",
    activationMessage: "请调用“文献精读与证据矩阵”Skill，处理本轮已授权文献。",
    prompt: "整理已授权文献的核心观点、方法和可核验来源位置。",
  },
  {
    uiSkillId: "chapter-writing",
    productSkill: "chapter_writing",
    title: "章节完整写作",
    sourceSkills: "rw-phd-write → writing-chapters + evidence-driven-writing",
    description: "调用科研章节写作流程，结合正式诊断卡、当前章节与本轮授权证据，输出完整章节候选、写作总结和证据边界。",
    activationMessage: "请调用“章节完整写作”Skill，为当前章节生成完整、可用的章节候选，并附写作总结。",
    prompt: "根据已确认诊断卡、当前章节、已有正文与授权材料，生成完整、可用的当前章节候选，并附写作总结。",
  },
  {
    uiSkillId: "revision",
    productSkill: "general_revision",
    title: "章节完整修订",
    sourceSkills: "writing-core → prompts-collection",
    description: "调用学术修订流程，在保留事实与引用边界的前提下，输出完整修订稿、修改摘要、逐项变化和候选版本。",
    activationMessage: "请调用“章节完整修订”Skill，生成当前章节的完整修订稿，并附修改总结。",
    prompt: "请先分析当前章节并与我讨论，不要直接覆盖正文。请明确需要保留的事实、数据、术语和引用；总结具体修改项，逐项说明修改位置和理由；列出不会修改的内容。讨论完成后，请询问我是否生成候选版本。",
  },
  {
    uiSkillId: "consistency",
    productSkill: "consistency_check",
    title: "论证与一致性审查",
    sourceSkills: "rw-research-referee → peer-review",
    description: "调用严格审稿流程，检查研究设计、证据、逻辑、术语及跨章节一致性，输出问题清单、风险等级和修正建议。",
    activationMessage: "请调用“论证与一致性审查”Skill，检查当前项目和章节并给出完整报告。",
    prompt: "检查研究问题、方法、结果和结论之间是否一致。",
  },
  {
    uiSkillId: "evidence",
    productSkill: "citation_evidence_check",
    title: "引用与证据核验",
    sourceSkills: "rw-paper-extractor → evidence-driven-writing + verification",
    description: "调用论文提取、证据驱动写作与核验流程，逐项核对论断、正文引用、参考文献和原文位置，输出可追溯结果与未核实项。",
    activationMessage: "请调用“引用与证据核验”Skill，核对当前章节的引用与证据链。",
    prompt: "检查当前章节的重要论断是否有已授权材料支持。",
  },
] as const satisfies ReadonlyArray<{
  uiSkillId: string;
  productSkill: M5ProductSkill;
  title: string;
  sourceSkills: string;
  description: string;
  activationMessage: string;
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
  messagePage: M5ConversationMessagePage;
  compressionPlan: M5ConversationCompressionPlan;
};

export const M5_CONVERSATION_CONTEXT_LIMITS = {
  compressionThreshold: 24,
  retainedRecentMessages: 8,
  maxSummarySourceMessages: 16,
  defaultMessagePageSize: 50,
  maxMessagePageSize: 100,
  maxLoadedSummaries: 20,
} as const;

export type M5ConversationMessagePage = {
  limit: number;
  hasEarlierMessages: boolean;
  oldestLoadedOrdinal: number | null;
  newestLoadedOrdinal: number | null;
};

export type M5ConversationCompressionPlan = {
  status: "NOT_NEEDED" | "NEEDS_SUMMARY";
  unsummarizedMessageCount: number;
  sourceMessageIds: string[];
  sourceFromOrdinal: number | null;
  sourceToOrdinal: number | null;
  retainedRecentMessageCount: number;
  appendOnly: true;
};

export type M5ToolIntent = {
  id: string;
  conversationId: string;
  productSkill: M5ProductSkill;
  operation: string;
  rationale: string;
  authorizedMaterialIds: string[];
  sectionId: string | null;
  baseVersionId: string | null;
  excludedScope: string | null;
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

export type M5ActionProposalRecoveryStatus =
  | "WAITING_FOR_USER"
  | "READY_TO_QUEUE"
  | "TERMINAL";

export type M5PersistedToolIntent = M5ToolIntent & {
  projectId: string;
  conversationSessionId: string;
  idempotencyKey: string;
};

export type M5PersistedActionProposal = M5ActionProposal & {
  projectId: string;
  conversationSessionId: string;
  idempotencyKey: string;
  recoveryStatus: M5ActionProposalRecoveryStatus;
  updatedAt: string;
};

export type M5PersistedActionDecision = {
  id: string;
  projectId: string;
  conversationSessionId: string;
  proposalId: string;
  decision: "CONFIRM" | "REJECT";
  reason: string | null;
  idempotencyKey: string;
  decidedAt: string;
};

export type M5ActionProposalWorkspace = {
  intents: M5PersistedToolIntent[];
  proposals: M5PersistedActionProposal[];
  decisions: M5PersistedActionDecision[];
  recovery: M5ActionProposalRecoverySnapshot;
};

export type M5ActionProposalRecoverySnapshot = {
  action:
    | "CONTINUE_CONVERSATION"
    | "WAIT_FOR_USER"
    | "READY_TO_QUEUE"
    | "TERMINAL";
  pendingProposalIds: string[];
  readyProposalIds: string[];
  terminalProposalIds: string[];
  retryPolicy: "REUSE_IDEMPOTENCY_KEY";
};

export function actionProposalRecoverySnapshot(
  proposals: M5PersistedActionProposal[],
): M5ActionProposalRecoverySnapshot {
  const pendingProposalIds = proposals
    .filter((proposal) => proposal.recoveryStatus === "WAITING_FOR_USER")
    .map((proposal) => proposal.id);
  const readyProposalIds = proposals
    .filter((proposal) => proposal.recoveryStatus === "READY_TO_QUEUE")
    .map((proposal) => proposal.id);
  const terminalProposalIds = proposals
    .filter((proposal) => proposal.recoveryStatus === "TERMINAL")
    .map((proposal) => proposal.id);
  const action = pendingProposalIds.length
    ? "WAIT_FOR_USER"
    : readyProposalIds.length
      ? "READY_TO_QUEUE"
      : proposals.length > 0 && terminalProposalIds.length === proposals.length
        ? "TERMINAL"
        : "CONTINUE_CONVERSATION";
  return {
    action,
    pendingProposalIds,
    readyProposalIds,
    terminalProposalIds,
    retryPolicy: "REUSE_IDEMPOTENCY_KEY",
  };
}

export function createToolIntent(input: {
  conversationId: string;
  productSkill: M5ProductSkill;
  operation: string;
  rationale: string;
  authorizedMaterialIds: string[];
  sectionId?: string | null;
  baseVersionId?: string | null;
  excludedScope?: string | null;
  now: string;
}): M5ToolIntent {
  return {
    id: `intent-${input.now}`,
    conversationId: input.conversationId,
    productSkill: input.productSkill,
    operation: input.operation,
    rationale: input.rationale,
    authorizedMaterialIds: [...new Set(input.authorizedMaterialIds)],
    sectionId: input.sectionId ?? null,
    baseVersionId: input.baseVersionId ?? null,
    excludedScope: input.excludedScope ?? null,
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
