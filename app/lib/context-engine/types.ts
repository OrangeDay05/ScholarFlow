export const AGENT_ROLES = [
  "CONVERSATION_AGENT",
  "RESEARCH_PLANNER",
  "RETRIEVER_EVIDENCE",
  "WRITER",
  "REVIEWER",
  "VERIFIER",
] as const;

export type AgentRole = (typeof AGENT_ROLES)[number];

export type ContextCapabilityStatus = "READY" | "PARTIAL" | "CONFIGURATION_REQUIRED" | "MISSING";

export type RetrievalIntent = "DOCUMENT_SUMMARY" | "DOCUMENT_READ" | "FACT_LOOKUP";

export type ContextPolicy = {
  name: string;
  version: "v1";
  agentRole: AgentRole;
  always: readonly string[];
  optional: readonly string[];
  rag: readonly string[];
  never: readonly string[];
  recentMessageLimit: number;
  conversationWindow: { recentMessages: number; rollingSummary: boolean };
  artifactSelection: readonly string[];
  totalTokenBudget: number;
  retrievalTokenBudget: number;
  defaultMaterialKinds: readonly string[];
  materialPriority: readonly string[];
};

export type RetrievalPlan = {
  intent: RetrievalIntent;
  targetMaterialId: string | null;
  originalQuery: string;
  rewrittenQueries: string[];
  materialKinds: string[];
  maxCandidates: number;
  maxIncluded: number;
  algorithm: "PROJECT_SCOPED_HYBRID_RRF";
  version: "v1";
};

export type RetrievalHit = {
  materialId: string;
  filename: string;
  materialKind: string;
  parseRunId: string;
  chunkId: string;
  ordinal: number;
  text: string;
  contentHash: string;
  location: Record<string, unknown>;
  metadata: Record<string, unknown>;
  retrievalMethod: "LEXICAL" | "VECTOR" | "HYBRID_RRF";
  lexicalScore: number | null;
  vectorScore: number | null;
  fusedScore: number;
  rank: number;
};

export type ContextSnapshotView = {
  id: string;
  projectId: string;
  conversationSessionId: string | null;
  agentRole: AgentRole;
  taskIntent: string;
  policyName: string;
  policyVersion: string;
  retrievalMode: string;
  originalQuery: string;
  rewrittenQueries: string[];
  authorizedMaterialIds: string[];
  tokenBudget: number;
  estimatedContextTokens: number;
  capabilityStatus: Record<string, ContextCapabilityStatus>;
  createdAt: string;
  items: ContextSnapshotItemView[];
};

export type ContextSnapshotItemView = {
  id: string;
  itemType: string;
  sourceType: string;
  sourceId: string | null;
  materialId: string | null;
  materialChunkId: string | null;
  filename: string | null;
  content: string;
  location: Record<string, unknown>;
  retrievalMethod: string | null;
  rank: number | null;
  included: boolean;
  estimatedTokens: number;
};

export function estimateTokens(text: string): number {
  const latin = (text.match(/[\x00-\xff]/gu) ?? []).length;
  const nonLatin = text.length - latin;
  return Math.max(1, Math.ceil(latin / 4 + nonLatin / 1.5));
}
