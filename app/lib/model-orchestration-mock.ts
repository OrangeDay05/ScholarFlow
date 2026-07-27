export type ModelRole =
  | "GENERATOR"
  | "REVIEWER"
  | "VERIFIER"
  | "REVISER"
  | "ROUTER";

export type CredentialType = "PLATFORM_CREDENTIAL" | "USER_CREDENTIAL";

export type OrchestrationMode = "STANDARD" | "STRICT" | "CUSTOM";

export type CredentialStatus =
  | "NOT_CONFIGURED"
  | "READY"
  | "TESTING"
  | "INVALID"
  | "DISABLED"
  | "DELETED";

export type ModelFailureStatus =
  | "GENERATION_FAILED"
  | "REVIEW_FAILED"
  | "VERIFICATION_FAILED"
  | "PARTIAL_TIMEOUT"
  | "INVALID_KEY"
  | "INSUFFICIENT_QUOTA"
  | "PROVIDER_RATE_LIMITED"
  | "USER_CANCELLED";

export type ModelAssignment = {
  id: string;
  role: ModelRole;
  provider: string;
  model: string;
  credential_type: CredentialType;
  credential_id: string;
  skill: string;
  skill_version: string;
  timeout_seconds: number;
  max_calls: number;
  data_processor: string;
};

export type CredentialContract = {
  credential_id: string;
  owner_user_id: string;
  organization_id: string;
  credential_type: CredentialType;
  provider: string;
  masked_key: string;
  encrypted_secret_ref: string | null;
  allowed_model_ids: string[];
  allowed_project_ids: string[];
  allowed_roles: ModelRole[];
  status: CredentialStatus;
  last_tested_at: string | null;
  created_at: string;
  disabled_at: string | null;
};

export type ModelOpinion = {
  id: string;
  model_assignment_id: string;
  role: ModelRole;
  provider: string;
  model: string;
  issue_key: string;
  conclusion: string;
  evidence_basis: string;
  source_material_ids: string[];
  source_locations: string[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
};

export type OrchestrationPlan = {
  task_id: string;
  parent_task_id: string | null;
  mode: OrchestrationMode;
  max_models: number;
  max_total_calls: number;
  timeout_seconds: number;
  stop_conditions: string[];
  assignments: ModelAssignment[];
  credential_source: CredentialType;
  estimated_duration: string;
  authorized_material_ids: string[];
  fallback_plan: string;
};

export const modelRoles: Array<{
  id: ModelRole;
  label: string;
  responsibility: string;
  outputBoundary: string;
}> = [
  {
    id: "GENERATOR",
    label: "生成模型",
    responsibility: "根据用户要求、诊断和授权材料创建新版本。",
    outputBoundary: "只能追加生成版本，不能标记审阅或验证通过。",
  },
  {
    id: "REVIEWER",
    label: "审阅模型",
    responsibility: "独立检查要求、逻辑、事实、引用和证据边界。",
    outputBoundary: "只创建审阅报告，不直接覆盖生成版本。",
  },
  {
    id: "VERIFIER",
    label: "验证模型",
    responsibility: "核对修订是否解决已选问题，并复核高风险边界。",
    outputBoundary: "只创建验证报告，不能静默修改正文。",
  },
  {
    id: "REVISER",
    label: "修订模型",
    responsibility: "根据用户明确选择的问题创建新修订版本。",
    outputBoundary: "必须追加版本；不得覆盖原生成版本。",
  },
  {
    id: "ROUTER",
    label: "路由模型",
    responsibility: "在允许的模型和调用上限内选择下一执行角色。",
    outputBoundary: "不得扩大材料范围或突破最大调用次数。",
  },
];

export const orchestrationModes: Array<{
  id: OrchestrationMode;
  label: string;
  description: string;
  modelCount: string;
  maxModels: number;
  maxCalls: number;
  defaultRoles: ModelRole[];
}> = [
  {
    id: "STANDARD",
    label: "标准模式",
    description: "平台默认：一个模型生成，另一个独立审阅。",
    modelCount: "2 个模型",
    maxModels: 2,
    maxCalls: 2,
    defaultRoles: ["GENERATOR", "REVIEWER"],
  },
  {
    id: "STRICT",
    label: "严格模式",
    description: "增加独立验证模型；修订仍需用户选择后触发。",
    modelCount: "最多 3 个模型",
    maxModels: 3,
    maxCalls: 4,
    defaultRoles: ["GENERATOR", "REVIEWER", "VERIFIER"],
  },
  {
    id: "CUSTOM",
    label: "自定义模式",
    description: "高级用户配置角色组合，第一版最多四个模型。",
    modelCount: "最多 4 个模型",
    maxModels: 4,
    maxCalls: 5,
    defaultRoles: ["ROUTER", "GENERATOR", "REVIEWER", "VERIFIER"],
  },
];

export const availableModelOptions = [
  {
    id: "openai-gpt-5-2",
    provider: "OpenAI",
    model: "GPT-5.2",
    credentialType: "PLATFORM_CREDENTIAL" as const,
    processor: "OpenAI · Mock",
  },
  {
    id: "deepseek-reasoner",
    provider: "DeepSeek",
    model: "DeepSeek Reasoner",
    credentialType: "PLATFORM_CREDENTIAL" as const,
    processor: "DeepSeek · Mock",
  },
  {
    id: "anthropic-claude",
    provider: "Anthropic",
    model: "Claude Sonnet · Mock",
    credentialType: "USER_CREDENTIAL" as const,
    processor: "Anthropic · Mock",
  },
  {
    id: "google-gemini",
    provider: "Google",
    model: "Gemini Pro · Mock",
    credentialType: "USER_CREDENTIAL" as const,
    processor: "Google · Mock",
  },
] as const;

export const platformCredential: CredentialContract = {
  credential_id: "platform-default",
  owner_user_id: "platform",
  organization_id: "platform",
  credential_type: "PLATFORM_CREDENTIAL",
  provider: "OpenAI + DeepSeek · Mock",
  masked_key: "平台托管 · 不向用户显示",
  encrypted_secret_ref: null,
  allowed_model_ids: ["openai-gpt-5-2", "deepseek-reasoner"],
  allowed_project_ids: ["*"],
  allowed_roles: ["GENERATOR", "REVIEWER", "VERIFIER", "REVISER", "ROUTER"],
  status: "READY",
  last_tested_at: null,
  created_at: "平台配置",
  disabled_at: null,
};

export const mockUserCredential: CredentialContract = {
  credential_id: "user-key-mock-01",
  owner_user_id: "user-demo",
  organization_id: "org-demo",
  credential_type: "USER_CREDENTIAL",
  provider: "Anthropic · Mock",
  masked_key: "sk-ant-•••• •••• 7M3Q",
  encrypted_secret_ref: null,
  allowed_model_ids: ["anthropic-claude"],
  allowed_project_ids: ["demo"],
  allowed_roles: ["REVIEWER", "VERIFIER"],
  status: "READY",
  last_tested_at: "刚刚 · Mock",
  created_at: "本次演示",
  disabled_at: null,
};

export const standardAssignments: ModelAssignment[] = [
  {
    id: "assignment-generator",
    role: "GENERATOR",
    provider: "OpenAI",
    model: "GPT-5.2",
    credential_type: "PLATFORM_CREDENTIAL",
    credential_id: "platform-default",
    skill: "通用章节写作",
    skill_version: "v1.3",
    timeout_seconds: 90,
    max_calls: 1,
    data_processor: "OpenAI · Mock",
  },
  {
    id: "assignment-reviewer",
    role: "REVIEWER",
    provider: "DeepSeek",
    model: "DeepSeek Reasoner",
    credential_type: "PLATFORM_CREDENTIAL",
    credential_id: "platform-default",
    skill: "独立学术审阅",
    skill_version: "v0.1 Mock",
    timeout_seconds: 90,
    max_calls: 1,
    data_processor: "DeepSeek · Mock",
  },
];

export const strictAssignment: ModelAssignment = {
  id: "assignment-verifier",
  role: "VERIFIER",
  provider: "Anthropic",
  model: "Claude Sonnet · Mock",
  credential_type: "USER_CREDENTIAL",
  credential_id: "user-key-mock-01",
  skill: "最终边界验证",
  skill_version: "v0.1 Mock",
  timeout_seconds: 75,
  max_calls: 1,
  data_processor: "Anthropic · Mock",
};

export const orchestrationPlan: OrchestrationPlan = {
  task_id: "task-introduction-v4",
  parent_task_id: null,
  mode: "STRICT",
  max_models: 3,
  max_total_calls: 4,
  timeout_seconds: 300,
  stop_conditions: [
    "达到最大调用次数",
    "任一高风险真实性问题无法核验",
    "用户取消",
    "供应商连续失败",
    "完成一次修订和一次最终验证",
  ],
  assignments: [...standardAssignments, strictAssignment],
  credential_source: "PLATFORM_CREDENTIAL",
  estimated_duration: "2—4 分钟",
  authorized_material_ids: ["requirements", "literature"],
  fallback_plan: "保留已成功产物；失败角色只标记未完成，由用户决定是否更换模型重试。",
};

export const conflictOpinions: ModelOpinion[] = [
  {
    id: "opinion-reviewer-01",
    model_assignment_id: "assignment-reviewer",
    role: "REVIEWER",
    provider: "DeepSeek",
    model: "DeepSeek Reasoner",
    issue_key: "method-causality",
    conclusion: "现有方法不能支持因果表述，应降级为相关性或机制候选。",
    evidence_basis: "诊断卡方法字段仍待确认，材料未提供实验或纵向设计。",
    source_material_ids: ["requirements"],
    source_locations: ["课程要求.docx · 第 3 页"],
    confidence: "HIGH",
  },
  {
    id: "opinion-verifier-01",
    model_assignment_id: "assignment-verifier",
    role: "VERIFIER",
    provider: "Anthropic",
    model: "Claude Sonnet · Mock",
    issue_key: "method-causality",
    conclusion: "可以保留机制解释，但必须明确它是理论推断而非经验因果结论。",
    evidence_basis: "参考论文允许机制性讨论，但当前项目没有直接数据验证。",
    source_material_ids: ["literature"],
    source_locations: ["参考论文.pdf · 第 8 页"],
    confidence: "MEDIUM",
  },
];

export const modelFailureStates: Array<{
  id: ModelFailureStatus;
  label: string;
  retainedArtifact: string;
  taskOutcome: string;
}> = [
  {
    id: "GENERATION_FAILED",
    label: "生成失败",
    retainedArtifact: "无新生成版本；保留任务配置和错误摘要。",
    taskOutcome: "不得进入审阅或标记通过。",
  },
  {
    id: "REVIEW_FAILED",
    label: "生成成功但审阅失败",
    retainedArtifact: "保留生成版本。",
    taskOutcome: "显示审阅未完成，不得标记审阅通过。",
  },
  {
    id: "VERIFICATION_FAILED",
    label: "审阅成功但验证失败",
    retainedArtifact: "保留生成版本、审阅报告和修订版本。",
    taskOutcome: "最终验证状态为失败或未完成。",
  },
  {
    id: "PARTIAL_TIMEOUT",
    label: "部分模型超时",
    retainedArtifact: "保留按时间顺序已成功的全部产物。",
    taskOutcome: "超时角色单独标记，整体不通过。",
  },
  {
    id: "INVALID_KEY",
    label: "Key 无效",
    retainedArtifact: "不发送任务正文或材料。",
    taskOutcome: "要求用户检查或禁用凭据。",
  },
  {
    id: "INSUFFICIENT_QUOTA",
    label: "额度不足",
    retainedArtifact: "保留任务配置，不创建新产物。",
    taskOutcome: "等待切换额度来源或模型。",
  },
  {
    id: "PROVIDER_RATE_LIMITED",
    label: "供应商限流",
    retainedArtifact: "保留已成功产物和重试建议。",
    taskOutcome: "不自动无限重试。",
  },
  {
    id: "USER_CANCELLED",
    label: "用户取消",
    retainedArtifact: "保留取消前已经完成的版本和报告。",
    taskOutcome: "任务标记已取消，不标记通过。",
  },
];

export const securityRequirements = [
  "M3 不接收或持久保存真实明文 API Key",
  "日志和错误信息不得包含完整 Key",
  "凭据必须绑定 owner_user_id 与 organization_id",
  "项目、模型和角色权限分别记录",
  "真实实现必须在服务端加密保存",
  "前端只能读取掩码、状态和授权范围",
  "真实加密、供应商连接和模型路由推迟到 M5",
] as const;

export const orchestrationRules = [
  "模型意见一致不代表事实已确认",
  "事实和引用问题必须回到原始材料核验",
  "重复问题可以合并，但必须保留每个模型的来源",
  "冲突意见必须展示各自依据",
  "审阅模型不得覆盖生成版本",
  "验证模型只生成验证报告",
  "最终采纳由用户决定",
  "最大模型数、调用次数、超时和停止条件必须同时存在",
  "禁止模型之间无限循环",
] as const;
