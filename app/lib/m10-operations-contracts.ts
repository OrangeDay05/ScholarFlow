export const M10_EVENT_CATEGORIES = [
  "NAVIGATION",
  "TASK",
  "PARSER",
  "EXPORT",
  "SECURITY",
  "FRONTEND",
] as const;

export type M10EventCategory = (typeof M10_EVENT_CATEGORIES)[number];
export type M10ExperimentStatus = "DRAFT" | "RUNNING" | "PAUSED" | "COMPLETED";

export interface M10OperationalEventInput {
  projectId?: string | null;
  category: M10EventCategory;
  eventName: string;
  success: boolean;
  durationMs?: number | null;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface M10FeatureFlagView {
  key: string;
  description: string;
  enabled: boolean;
  rolloutPercentage: number;
  updatedAt: string;
}

export interface M10ExperimentView {
  id: string;
  key: string;
  name: string;
  status: M10ExperimentStatus;
  treatmentPercentage: number;
  updatedAt: string;
}

export interface M10Dashboard {
  generatedAt: string;
  metrics: Record<string, number>;
  users: Array<{
    id: string;
    displayName: string;
    email: string;
    status: string;
    role: string;
    lastLoginAt: string | null;
    failedLogins: number;
  }>;
  projects: Array<{
    id: string;
    title: string;
    ownerDisplayName: string;
    status: string;
    currentStage: string;
    materialCount: number;
    updatedAt: string;
  }>;
  materials: Array<{
    id: string;
    filename: string;
    projectTitle: string;
    status: string;
    contentType: string;
    sizeBytes: number;
    errorCode: string | null;
    updatedAt: string;
  }>;
  parseRuns: Array<{
    id: string;
    filename: string;
    format: string;
    parser: string;
    status: string;
    errorCode: string | null;
    startedAt: string;
  }>;
  tasks: Array<{
    id: string;
    taskType: string;
    productSkill: string;
    role: string | null;
    status: string;
    callsUsed: number;
    maxCalls: number;
    errorCode: string | null;
    createdAt: string;
  }>;
  providers: Array<{
    id: string;
    name: string;
    key: string;
    status: string;
    modelCount: number;
    activeCapabilityCount: number;
  }>;
  agentRoles: Array<{
    id: string;
    role: string;
    provider: string;
    model: string;
    thinkingMode: string;
    reasoningEffort: string | null;
    credentialType: string;
    status: string;
  }>;
  skills: Array<{
    id: string;
    key: string;
    name: string;
    enabled: boolean;
    latestVersion: string | null;
    auditStatus: string | null;
  }>;
  usage: {
    promptTokens: number;
    completionTokens: number;
    reasoningTokens: number;
    estimatedCost: number;
    finalCost: number;
    currency: string | null;
    budgetPaused: number;
  };
  jobs: Array<{
    kind: "DOCX" | "FIGURE" | "PPTX";
    id: string;
    status: string;
    projectTitle: string;
    error: string | null;
    createdAt: string;
  }>;
  auditLogs: Array<{
    id: string;
    actor: string;
    action: string;
    reason: string | null;
    createdAt: string;
  }>;
  health: {
    database: "HEALTHY" | "DEGRADED";
    tableCount: number;
    migrationCount: number;
    latestMigration: string | null;
    storedObjects: number;
    failedObjects: number;
  };
  featureFlags: M10FeatureFlagView[];
  experiments: M10ExperimentView[];
  recentFailures: Array<{
    source: string;
    code: string | null;
    message: string | null;
    occurredAt: string;
  }>;
}

export function validateOperationalEvent(input: M10OperationalEventInput): string[] {
  const errors: string[] = [];
  if (!M10_EVENT_CATEGORIES.includes(input.category)) errors.push("事件分类无效。");
  if (!/^[a-z][a-z0-9_.-]{2,79}$/u.test(input.eventName)) errors.push("事件名称必须是 3—80 位稳定标识。");
  if (input.durationMs != null && (!Number.isInteger(input.durationMs) || input.durationMs < 0 || input.durationMs > 3_600_000)) errors.push("耗时必须在 0—3600000 毫秒之间。");
  if (JSON.stringify(input.metadata ?? {}).length > 4_096) errors.push("事件元数据不得超过 4 KB。");
  return errors;
}

export function validateRolloutPercentage(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 100;
}

export function deterministicBucket(subject: string, key: string): number {
  let hash = 2166136261;
  for (const char of `${key}:${subject}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
}
