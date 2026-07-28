export type M6EvidenceVerification = "VERIFIED" | "UNVERIFIED" | "CONFLICTING";
export type M6EvidenceRisk = "NORMAL" | "HIGH_RISK";

export type M6EvidenceBindingInput = {
  claimId: string;
  materialId: string;
  materialChunkId: string;
  quote: string;
  supportLevel: "direct" | "indirect" | "unverified";
  riskLevel: M6EvidenceRisk;
  verificationNote?: string;
};

export type M6ExportReadiness = {
  ready: boolean;
  checkedVersionIds: string[];
  blockers: Array<{ code: string; message: string; claimId?: string }>;
  warnings: Array<{ code: string; message: string; claimId?: string }>;
};

export function verifyEvidenceText(input: {
  chunkText: string;
  quote: string;
  supportLevel: M6EvidenceBindingInput["supportLevel"];
}): { status: M6EvidenceVerification; note: string } {
  const chunk = normalize(input.chunkText);
  const quote = normalize(input.quote);
  if (input.supportLevel === "unverified" || !quote) {
    return { status: "UNVERIFIED", note: "未提供可核验原文，不能确认支持关系。" };
  }
  if (!chunk.includes(quote)) {
    return { status: "CONFLICTING", note: "所选原文不在该来源片段中。" };
  }
  return input.supportLevel === "direct"
    ? { status: "VERIFIED", note: "直接引文已在来源片段中定位。" }
    : { status: "VERIFIED", note: "间接支持的依据文本已在来源片段中定位；语义判断仍需人工复核。" };
}

function normalize(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}
