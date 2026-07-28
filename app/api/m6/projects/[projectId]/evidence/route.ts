import type { M6EvidenceBindingInput, M6EvidenceRisk } from "@/app/lib/m6-evidence-contracts";
import { bindM6Evidence, createM6Claim, evaluateM6ExportReadiness, M6EvidenceError } from "@/db/repositories/m6-evidence";
import { apiError, apiSuccess, isRecord } from "../../../../m3/_shared";
import { requireM4Actor } from "../../../../m4/_shared";

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const auth = await requireM4Actor(request);
  if ("response" in auth) return auth.response;
  let body: unknown;
  try { body = await request.json(); } catch { return apiError(400, "INVALID_JSON", "请求正文必须是有效 JSON。"); }
  if (!isRecord(body) || typeof body.action !== "string") return apiError(400, "INVALID_ACTION", "缺少证据操作。");
  const projectId = (await params).projectId;
  try {
    if (body.action === "create_claim") {
      return apiSuccess(await createM6Claim(auth.actor, projectId, {
        sectionVersionId: text(body.section_version_id), text: text(body.text),
        startOffset: optionalInteger(body.start_offset), endOffset: optionalInteger(body.end_offset),
      }), 201);
    }
    if (body.action === "bind") {
      const supportLevel = text(body.support_level);
      const riskLevel = text(body.risk_level);
      if (!isSupportLevel(supportLevel) || !isRiskLevel(riskLevel)) return apiError(400, "INVALID_INPUT", "证据支持等级或风险等级无效。");
      const input: M6EvidenceBindingInput = {
        claimId: text(body.claim_id), materialId: text(body.material_id), materialChunkId: text(body.material_chunk_id),
        quote: text(body.quote), supportLevel, riskLevel, verificationNote: text(body.verification_note) || undefined,
      };
      return apiSuccess(await bindM6Evidence(auth.actor, projectId, input), 201);
    }
    if (body.action === "readiness") {
      const versionIds = strings(body.version_ids);
      if (!versionIds) return apiError(400, "INVALID_INPUT", "版本列表无效。");
      return apiSuccess(await evaluateM6ExportReadiness(auth.actor, projectId, versionIds));
    }
    return apiError(400, "INVALID_ACTION", "不支持的证据操作。");
  } catch (error) {
    if (error instanceof M6EvidenceError) return apiError(error.code.endsWith("NOT_FOUND") ? 404 : 400, error.code, error.message);
    return apiError(500, "EVIDENCE_OPERATION_FAILED", "证据操作失败。");
  }
}

function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function optionalInteger(value: unknown): number | undefined { return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : undefined; }
function strings(value: unknown): string[] | null { return Array.isArray(value) && value.length > 0 && value.length <= 100 && value.every((item) => typeof item === "string" && item.trim()) ? value.map((item) => item.trim()) : null; }
function isSupportLevel(value: string): value is M6EvidenceBindingInput["supportLevel"] { return ["direct", "indirect", "unverified"].includes(value); }
function isRiskLevel(value: string): value is M6EvidenceRisk { return ["NORMAL", "HIGH_RISK"].includes(value); }
