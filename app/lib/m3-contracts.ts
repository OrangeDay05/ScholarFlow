export type M3CreationMethod =
  | "idea"
  | "existing_draft"
  | "requirements"
  | "literature"
  | "data";

export type M3OnboardingMode = "direct" | "guided";

export type M3ProjectSummary = {
  id: string;
  title: string;
  paperType: string;
  language: string;
  primaryCreationMethod: M3CreationMethod;
  onboardingMode?: M3OnboardingMode;
  status: "active" | "archived";
  currentStage: string;
  updatedAt: string;
};

export type M3DiagnosisSnapshot = {
  id: string;
  versionNumber: number;
  status: "draft" | "confirmed" | "superseded";
  title: string;
  paperType: string;
  language: string;
  researchObject: string;
  researchQuestion: string;
  method: string;
  requirements: string;
  confirmedAt: string | null;
};

export type M3OutlineSection = {
  id: string;
  slug: string;
  title: string;
  position: number;
  status:
    | "not_started"
    | "editing"
    | "checking"
    | "confirmed"
    | "missing_material";
  wordCount: number;
};

export type M3OutlineSnapshot = {
  id: string;
  versionNumber: number;
  status: "draft" | "confirmed" | "superseded";
  confirmedAt: string | null;
  sections: M3OutlineSection[];
};

export type M3SectionVersion = {
  id: string;
  sectionId: string;
  versionNumber: number;
  source: "original" | "manual" | "ai" | "restore" | "fallback_model";
  sourceVersionId: string | null;
  content: string;
  contentJson: string | null;
  summary: string;
  createdAt: string;
};

export type M3MaterialSummary = {
  id: string;
  kind: "requirement" | "manuscript" | "literature" | "data" | "image" | "note";
  filename: string;
  contentType: string;
  sizeBytes: number;
  status: "queued" | "parsing" | "success" | "failed" | "cancelled";
  errorMessage: string | null;
};

export type M3WorkspaceSnapshot = {
  source: "d1";
  project: M3ProjectSummary;
  diagnosis: M3DiagnosisSnapshot | null;
  outline: M3OutlineSnapshot | null;
  selectedSectionSlug: string;
  versions: M3SectionVersion[];
  materials: M3MaterialSummary[];
};

export type CreateM3ProjectInput = {
  title: string;
  paperType: string;
  language: string;
  primaryCreationMethod: M3CreationMethod;
  researchObject?: string;
  researchQuestion?: string;
  method?: string;
  requirements?: string;
};

export type M3ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };
