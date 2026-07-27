import type {
  M3CreationMethod,
  M3MaterialSummary,
  M3ProjectSummary,
} from "./m3-contracts";

export type M4ProjectIntakeInput = {
  primaryCreationMethod: M3CreationMethod;
  goal: string;
  materialsSummary: string;
  firstAiHelp: string;
  title?: string;
  paperType?: string;
  language?: string;
  materials?: Array<
    Pick<
      M3MaterialSummary,
      "kind" | "filename" | "contentType" | "sizeBytes"
    >
  >;
  idempotencyKey?: string;
};

export type M4ProjectIntakeSnapshot = {
  project: M3ProjectSummary;
  intake: {
    goal: string;
    materialsSummary: string;
    firstAiHelp: string;
    titleWasDerived: boolean;
    paperTypePending: boolean;
    languagePending: boolean;
  };
  materials: M3MaterialSummary[];
};

export type M4MaterialRegistrationInput = Pick<
  M3MaterialSummary,
  "kind" | "filename" | "contentType" | "sizeBytes"
>;
