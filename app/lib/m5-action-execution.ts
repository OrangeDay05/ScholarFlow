export type M5TextDiffItem = {
  kind: "UNCHANGED" | "MODIFIED" | "ADDED" | "REMOVED";
  before: string | null;
  after: string | null;
};

export type M5ActionExecutionWorkspace = {
  proposalId: string;
  conversationSessionId: string;
  intent: {
    productSkill: string;
    operation: string;
    sectionId: string | null;
    sectionTitle: string | null;
    baseVersionId: string | null;
    excludedScope: string | null;
    authorizedMaterialIds: string[];
  };
  task: {
    id: string;
    status: string;
    callsUsed: number;
    maxCalls: number;
    providerRunId: string | null;
  } | null;
  candidate: {
    id: string;
    content: string;
    summary: string;
    adopted: boolean;
    rejected: boolean;
    formalVersionId: string | null;
  } | null;
  baseContent: string | null;
  diff: M5TextDiffItem[];
};

export function buildM5TextDiff(before: string, after: string): M5TextDiffItem[] {
  const beforeParts = paragraphs(before);
  const afterParts = paragraphs(after);
  const count = Math.max(beforeParts.length, afterParts.length);
  const result: M5TextDiffItem[] = [];
  for (let index = 0; index < count; index += 1) {
    const left = beforeParts[index] ?? null;
    const right = afterParts[index] ?? null;
    result.push({
      kind: left === null ? "ADDED" : right === null ? "REMOVED" : left === right ? "UNCHANGED" : "MODIFIED",
      before: left,
      after: right,
    });
  }
  return result;
}

function paragraphs(value: string): string[] {
  const normalized = value.replace(/\r\n?/gu, "\n").trim();
  return normalized ? normalized.split(/\n\s*\n/gu).map((item) => item.trim()) : [];
}
