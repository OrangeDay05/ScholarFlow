import type {
  CreateM3ProjectInput,
  M3ApiEnvelope,
  M3DiagnosisSnapshot,
  M3OutlineSection,
  M3OutlineSnapshot,
  M3ProjectSummary,
  M3SectionVersion,
  M3WorkspaceSnapshot,
} from "./m3-contracts";

export async function loadM3Workspace(
  projectId: string,
  sectionSlug = "introduction",
): Promise<M3WorkspaceSnapshot> {
  return request<M3WorkspaceSnapshot>(
    `/api/m3/projects/${encodeURIComponent(projectId)}/workspace?section=${encodeURIComponent(sectionSlug)}`,
  );
}

export async function createM3Project(
  input: CreateM3ProjectInput,
): Promise<M3ProjectSummary> {
  return request<M3ProjectSummary>("/api/m3/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function saveM3Diagnosis(
  projectId: string,
  diagnosis: Omit<
    M3DiagnosisSnapshot,
    "id" | "versionNumber" | "status" | "confirmedAt"
  >,
  confirm: boolean,
): Promise<M3DiagnosisSnapshot> {
  return request<M3DiagnosisSnapshot>(
    `/api/m3/projects/${encodeURIComponent(projectId)}/diagnosis`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ diagnosis, confirm }),
    },
  );
}

export async function saveM3Outline(
  projectId: string,
  sections: Array<Omit<M3OutlineSection, "id">>,
  confirm: boolean,
): Promise<M3OutlineSnapshot> {
  return request<M3OutlineSnapshot>(
    `/api/m3/projects/${encodeURIComponent(projectId)}/outline`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sections, confirm }),
    },
  );
}

export async function saveM3SectionVersion(
  projectId: string,
  sectionSlug: string,
  input:
    | { source: "manual"; content: string; contentJson?: string | null; summary?: string }
    | { source: "restore"; sourceVersionId: string; summary?: string },
): Promise<M3SectionVersion> {
  return request<M3SectionVersion>(
    `/api/m3/projects/${encodeURIComponent(projectId)}/sections/${encodeURIComponent(sectionSlug)}/versions`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const envelope = (await response.json()) as M3ApiEnvelope<T>;
  if (!response.ok || !envelope.ok) {
    const message = envelope.ok
      ? `请求失败（${response.status}）`
      : envelope.error.message;
    throw new Error(message);
  }
  return envelope.data;
}
