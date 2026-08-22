import type { M3Actor } from "@/app/lib/m3-server-identity";
import { getD1 } from "../index";

export async function createEvidenceCandidateFromSnapshot(
  actor: M3Actor,
  requestedProjectId: string,
  input: {
    contextSnapshotItemId: string;
    answerMessageId?: string | null;
    claimText: string;
    quote: string;
  },
): Promise<string> {
  const db = getD1();
  const projectId = await ownedProjectId(actor.userId, requestedProjectId);
  const item = await db.prepare(`SELECT i.id FROM context_snapshot_items i
    JOIN agent_context_snapshots s ON s.id = i.snapshot_id
    WHERE i.id = ? AND i.owner_user_id = ? AND i.project_id = ?
      AND s.owner_user_id = ? AND s.project_id = ?
      AND i.item_type = 'RETRIEVED_CHUNK' AND i.included = 1`)
    .bind(input.contextSnapshotItemId, actor.userId, projectId, actor.userId, projectId)
    .first<{ id: string }>();
  if (!item) throw new Error("SNAPSHOT_EVIDENCE_SOURCE_NOT_FOUND");
  const id = crypto.randomUUID();
  await db.prepare(`INSERT INTO evidence_candidates (
    id, owner_user_id, project_id, context_snapshot_item_id, answer_message_id,
    claim_text, quote, status
  ) VALUES (?, ?, ?, ?, ?, ?, ?, 'CANDIDATE')`)
    .bind(id, actor.userId, projectId, item.id, input.answerMessageId ?? null,
      input.claimText.trim(), input.quote.trim())
    .run();
  return id;
}

export async function decideEvidenceCandidate(
  actor: M3Actor,
  requestedProjectId: string,
  input: {
    candidateId: string;
    decision: "CONFIRM" | "REJECT";
    claimId?: string | null;
  },
): Promise<{ candidateId: string; evidenceBindingId: string | null }> {
  const db = getD1();
  const projectId = await ownedProjectId(actor.userId, requestedProjectId);
  const candidate = await db.prepare(`SELECT ec.id, ec.quote, csi.material_id,
      csi.material_chunk_id, csi.parse_run_id, csi.source_location_json
    FROM evidence_candidates ec
    JOIN context_snapshot_items csi ON csi.id = ec.context_snapshot_item_id
    WHERE ec.id = ? AND ec.owner_user_id = ? AND ec.project_id = ? AND ec.status = 'CANDIDATE'
      AND csi.owner_user_id = ? AND csi.project_id = ?`)
    .bind(input.candidateId, actor.userId, projectId, actor.userId, projectId)
    .first<Record<string, unknown>>();
  if (!candidate) throw new Error("EVIDENCE_CANDIDATE_NOT_FOUND");
  if (input.decision === "REJECT") {
    await db.prepare(`UPDATE evidence_candidates SET status = 'REJECTED', decided_at = CURRENT_TIMESTAMP
      WHERE id = ? AND owner_user_id = ? AND project_id = ? AND status = 'CANDIDATE'`)
      .bind(input.candidateId, actor.userId, projectId)
      .run();
    return { candidateId: input.candidateId, evidenceBindingId: null };
  }
  if (!input.claimId) throw new Error("CLAIM_REQUIRED_FOR_EVIDENCE_CONFIRMATION");
  const claim = await db.prepare(`SELECT id FROM claims
    WHERE id = ? AND owner_user_id = ? AND project_id = ?`)
    .bind(input.claimId, actor.userId, projectId)
    .first<{ id: string }>();
  if (!claim || !candidate.material_id || !candidate.material_chunk_id) {
    throw new Error("EVIDENCE_CONFIRMATION_SOURCE_INVALID");
  }
  const location = safeJson(String(candidate.source_location_json ?? "{}"));
  const bindingId = crypto.randomUUID();
  await db.batch([
    db.prepare(`INSERT INTO evidence_bindings (
      id, owner_user_id, project_id, claim_id, material_id, material_chunk_id,
      page, paragraph, quote, support_level, verification_status, risk_level
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'unverified', 'UNVERIFIED', 'NORMAL')`)
      .bind(bindingId, actor.userId, projectId, claim.id, String(candidate.material_id),
        String(candidate.material_chunk_id), numberOrNull(location.page),
        location.paragraph === undefined ? null : String(location.paragraph), String(candidate.quote)),
    db.prepare(`UPDATE evidence_candidates SET status = 'ACCEPTED', decided_at = CURRENT_TIMESTAMP
      WHERE id = ? AND owner_user_id = ? AND project_id = ? AND status = 'CANDIDATE'`)
      .bind(input.candidateId, actor.userId, projectId),
  ]);
  return { candidateId: input.candidateId, evidenceBindingId: bindingId };
}

async function ownedProjectId(ownerUserId: string, requestedProjectId: string): Promise<string> {
  const row = await getD1().prepare(
    "SELECT id FROM projects WHERE id = ? AND owner_user_id = ? AND status = 'active'",
  ).bind(requestedProjectId, ownerUserId).first<{ id: string }>();
  if (!row) throw new Error("PROJECT_NOT_FOUND");
  return row.id;
}

function safeJson(value: string): Record<string, unknown> {
  try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
}

function numberOrNull(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
