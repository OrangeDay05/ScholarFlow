export const M4_PRESENTATION_SCENES = [
  "COURSE_PRESENTATION",
  "CLASSROOM_PRESENTATION",
  "LITERATURE_REVIEW_PRESENTATION",
  "GROUP_PRESENTATION",
  "FINAL_COURSE_PRESENTATION",
  "RESEARCH_PROPOSAL",
  "PROPOSAL_DEFENSE",
  "MIDTERM_DEFENSE",
  "THESIS_DEFENSE",
  "LAB_MEETING",
  "CONFERENCE_PRESENTATION",
  "PAPER_SHARING",
  "SUBMISSION_PRESENTATION",
] as const;

export type M4PresentationScene = (typeof M4_PRESENTATION_SCENES)[number];
export type M4PresentationReadiness =
  | "READY"
  | "READY_WITH_WARNINGS"
  | "NEEDS_CONTENT"
  | "NEEDS_CONFIRMATION"
  | "NEEDS_MATERIAL"
  | "BLOCKED";

export type M4PresentationWorkspace = {
  projects: Array<{
    id: string;
    title: string;
    scene: M4PresentationScene;
    readinessStatus: M4PresentationReadiness;
    truthStatus: "UNVERIFIED" | "PARTIALLY_VERIFIED" | "VERIFIED";
    sourceSectionVersionId: string | null;
    sourceMaterialSnapshot: string[];
  }>;
  versions: Array<{
    id: string;
    presentationProjectId: string;
    versionNumber: number;
    status: "DRAFT" | "ADOPTED" | "SUPERSEDED" | "ARCHIVED";
    sourcePresentationVersionId: string | null;
    sourceSectionVersionId: string | null;
    materialSnapshot: string[];
    verificationStatus: "UNVERIFIED" | "VERIFIED_WITH_WARNINGS" | "VERIFIED";
  }>;
  slides: Array<{
    id: string;
    presentationVersionId: string;
    position: number;
    title: string;
    content: Record<string, unknown>;
    speakerNotes: string;
    sourceBindings: string[];
    verificationStatus: "UNVERIFIED" | "VERIFIED_WITH_WARNINGS" | "VERIFIED";
  }>;
};
