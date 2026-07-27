import type {
  M4DiagnosisMutation,
  M4DiagnosisWorkspace,
} from "./m4-diagnosis-contracts";
import type { M3ApiEnvelope } from "./m3-contracts";

export function loadM4Diagnosis(projectId: string): Promise<M4DiagnosisWorkspace> {
  return request(projectId);
}

export function mutateM4Diagnosis(
  projectId: string,
  input: M4DiagnosisMutation,
): Promise<M4DiagnosisWorkspace> {
  return request(projectId, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

async function request(
  projectId: string,
  init?: RequestInit,
): Promise<M4DiagnosisWorkspace> {
  const response = await fetch(
    `/api/m4/projects/${encodeURIComponent(projectId)}/diagnosis`,
    init,
  );
  const envelope = (await response.json()) as M3ApiEnvelope<M4DiagnosisWorkspace>;
  if (!response.ok || !envelope.ok) {
    throw new Error(
      envelope.ok ? `请求失败（${response.status}）` : envelope.error.message,
    );
  }
  return envelope.data;
}
