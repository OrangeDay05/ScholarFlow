import type {
  DiagnosisEntryMode,
  DiagnosisFieldStatus,
  DiagnosisSourceType,
  GuidanceDepth,
  GuidanceQuestion,
  TaskReadinessStatus,
} from "./progressive-diagnosis-mock";

export type M4DiagnosisField = {
  id: string;
  field: string;
  label: string;
  value: string;
  status: DiagnosisFieldStatus;
  source_type: DiagnosisSourceType;
  source_material_ids: string[];
  source_locations: string[];
  confidence: "LOW" | "MEDIUM" | "HIGH";
  requires_confirmation: boolean;
  rationale: string;
  confirmed_at: string | null;
};

export type M4DiagnosisQuestion = GuidanceQuestion & {
  id: string;
  position: number;
};

export type M4DiagnosisSession = {
  id: string;
  mode: DiagnosisEntryMode;
  depth: GuidanceDepth;
  status: "active" | "completed" | "cancelled";
  current_question_id: string | null;
  answered_count: number;
  consecutive_unknown_count: number;
  max_questions: number;
  stop_reason: string | null;
  output_diagnosis_card_id: string | null;
  completed_at: string | null;
  questions: M4DiagnosisQuestion[];
  fields: M4DiagnosisField[];
};

export type M4TaskReadiness = {
  id: string;
  task_key: string;
  task_name: string;
  status: TaskReadinessStatus;
  reason: string;
  missing_field_keys: string[];
  checked_at: string;
};

export type M4DiagnosisVersion = {
  id: string;
  version_number: number;
  status:
    | "draft"
    | "pending_confirmation"
    | "confirmed"
    | "superseded"
    | "archived";
  confirmed_at: string | null;
  created_at: string;
};

export type M4DiagnosisAuditEvent = {
  id: string;
  action: string;
  actor_type: "USER" | "SYSTEM" | "AI";
  question_key: string | null;
  field_key: string | null;
  detail: Record<string, unknown>;
  created_at: string;
};

export type M4DiagnosisWorkspace = {
  source: "d1-m4";
  session: M4DiagnosisSession | null;
  latest_diagnosis_card_id: string | null;
  versions: M4DiagnosisVersion[];
  readiness: M4TaskReadiness[];
  audit: M4DiagnosisAuditEvent[];
};

export type StartM4DiagnosisInput = {
  action: "start";
  mode: DiagnosisEntryMode;
  depth: GuidanceDepth;
};

export type AnswerM4DiagnosisInput = {
  action: "answer";
  session_id: string;
  question_id: string;
  answer: string;
  answer_status: DiagnosisFieldStatus;
  answer_source_type: DiagnosisSourceType;
  confidence: "LOW" | "MEDIUM" | "HIGH";
};

export type SaveM4DiagnosisFieldsInput = {
  action: "save_fields";
  session_id: string;
  fields: Array<Omit<M4DiagnosisField, "id" | "confirmed_at">>;
};

export type FinishM4DiagnosisInput = {
  action: "finish";
  session_id: string;
  stop_reason: string;
};

export type ConfirmM4DiagnosisInput = {
  action: "confirm";
  session_id: string;
};

export type ArchiveM4DiagnosisInput = {
  action: "archive";
  diagnosis_card_id: string;
};

export type M4DiagnosisMutation =
  | StartM4DiagnosisInput
  | AnswerM4DiagnosisInput
  | SaveM4DiagnosisFieldsInput
  | FinishM4DiagnosisInput
  | ConfirmM4DiagnosisInput
  | ArchiveM4DiagnosisInput;
