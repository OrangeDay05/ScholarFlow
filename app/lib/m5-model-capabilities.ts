export const M5_PROVIDER_IDS = ["DEEPSEEK", "OPENAI", "ANTHROPIC"] as const;
export type M5ProviderId = (typeof M5_PROVIDER_IDS)[number];

export const M5_AGENT_ROLES = [
  "CONVERSATION_AGENT",
  "ROUTER",
  "GENERATOR",
  "REVIEWER",
  "VERIFIER",
  "REVISER",
  "AGGREGATOR",
] as const;
export type M5AgentRole = (typeof M5_AGENT_ROLES)[number];
export type M5ThinkingMode = "DISABLED" | "ENABLED";
export type M5ReasoningEffort = "LOW" | "MEDIUM" | "HIGH" | "MAX";
export type M5ModelLifecycle = "DISCOVERED" | "TESTING" | "ACTIVE" | "DEPRECATED" | "RETIRED" | "DISABLED";

export type M5ThinkingCapability = {
  supported: boolean;
  modes: M5ThinkingMode[];
  efforts: M5ReasoningEffort[];
  supportsToolCalls: boolean;
  providerParameterMapping: string;
};

export type M5ModelCapability = {
  provider: M5ProviderId;
  modelId: string;
  capabilityVersion: string;
  thinking: M5ThinkingCapability;
  supportsStreaming: boolean;
  supportsToolCalls: boolean;
  supportsThinkingToolCalls: boolean;
  supportsJsonOutput: boolean;
  supportsVision: boolean;
  contextWindow: number;
  maxOutputTokens: number;
  supportedParameters: string[];
  ignoredParameters: string[];
  lifecycleStatus: M5ModelLifecycle;
  deprecatedAt: string | null;
  sourceUpdatedAt: string;
};

export type M5InferenceConfiguration = {
  thinkingMode: M5ThinkingMode;
  reasoningEffort: M5ReasoningEffort | null;
  maxOutputTokens: number;
  temperature?: number;
  topP?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  responseFormat: "TEXT" | "JSON";
  timeoutMs: number;
  streaming: boolean;
  tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
};

export type M5ModelConfigurationValidation =
  | { ok: true; effective: M5InferenceConfiguration; ignoredParameters: string[] }
  | { ok: false; code: "MODEL_RETIRED" | "MODEL_CONFIGURATION_UNSUPPORTED" | "INVALID_PARAMETERS"; message: string };

const DEEPSEEK_SOURCE_UPDATED_AT = "2026-07-24T00:00:00.000Z";
const DEEPSEEK_PARAMETERS = ["thinking", "reasoning_effort", "max_tokens", "response_format", "stream", "tools", "temperature", "top_p", "presence_penalty", "frequency_penalty"];

export const M5_DEEPSEEK_CAPABILITIES: readonly M5ModelCapability[] = [
  deepSeekCapability("deepseek-v4-flash"),
  deepSeekCapability("deepseek-v4-pro"),
  deepSeekCapability("deepseek-chat", "RETIRED"),
  deepSeekCapability("deepseek-reasoner", "RETIRED"),
];

export function activeM5DeepSeekCapabilities() {
  return M5_DEEPSEEK_CAPABILITIES.filter((capability) => capability.lifecycleStatus === "ACTIVE");
}

export function requireM5ModelCapability(provider: M5ProviderId, modelId: string): M5ModelCapability | null {
  if (provider !== "DEEPSEEK") return null;
  return M5_DEEPSEEK_CAPABILITIES.find((item) => item.modelId === modelId) ?? null;
}

export function validateM5ModelConfiguration(
  capability: M5ModelCapability,
  configuration: M5InferenceConfiguration,
): M5ModelConfigurationValidation {
  if (["RETIRED", "DEPRECATED", "DISABLED"].includes(capability.lifecycleStatus)) {
    return { ok: false, code: "MODEL_RETIRED", message: "该模型已停止用于新任务，请重新选择并确认当前模型。" };
  }
  if (!capability.thinking.modes.includes(configuration.thinkingMode)) {
    return unsupported("当前模型不支持所选思考模式。");
  }
  if (configuration.thinkingMode === "DISABLED" && configuration.reasoningEffort !== null) {
    return unsupported("关闭思考模式时，推理强度必须为空。 ");
  }
  if (configuration.thinkingMode === "ENABLED") {
    if (!configuration.reasoningEffort || !capability.thinking.efforts.includes(configuration.reasoningEffort)) {
      return unsupported("当前模型不支持所选推理强度；系统不会静默映射。 ");
    }
  }
  if (configuration.streaming && !capability.supportsStreaming) return unsupported("当前模型不支持流式输出。");
  if (configuration.responseFormat === "JSON" && !capability.supportsJsonOutput) return unsupported("当前模型不支持 JSON 输出。");
  if (configuration.tools.length && (!capability.supportsToolCalls || configuration.thinkingMode === "ENABLED" && !capability.supportsThinkingToolCalls)) return unsupported("当前模型或模式不支持工具调用。");
  if (configuration.maxOutputTokens < 1 || configuration.maxOutputTokens > capability.maxOutputTokens) {
    return { ok: false, code: "INVALID_PARAMETERS", message: `最大输出必须在 1—${capability.maxOutputTokens} 之间。` };
  }
  if (configuration.timeoutMs < 1_000 || configuration.timeoutMs > 600_000) return { ok: false, code: "INVALID_PARAMETERS", message: "超时必须在 1—600 秒之间。" };
  const ignoredParameters = configuration.thinkingMode === "ENABLED"
    ? ["temperature", "top_p", "presence_penalty", "frequency_penalty"]
    : [];
  const effective = { ...configuration };
  if (configuration.thinkingMode === "ENABLED") {
    delete effective.temperature;
    delete effective.topP;
    delete effective.presencePenalty;
    delete effective.frequencyPenalty;
  }
  return { ok: true, effective, ignoredParameters };
}

function deepSeekCapability(modelId: string, lifecycleStatus: M5ModelLifecycle = "ACTIVE"): M5ModelCapability {
  return {
    provider: "DEEPSEEK",
    modelId,
    capabilityVersion: "deepseek-v4-2026-07-24",
    thinking: { supported: true, modes: ["DISABLED", "ENABLED"], efforts: ["HIGH", "MAX"], supportsToolCalls: true, providerParameterMapping: "deepseek-openai-v4" },
    supportsStreaming: true,
    supportsToolCalls: true,
    supportsThinkingToolCalls: true,
    supportsJsonOutput: true,
    supportsVision: false,
    contextWindow: 1_000_000,
    maxOutputTokens: 393_216,
    supportedParameters: DEEPSEEK_PARAMETERS,
    ignoredParameters: ["temperature", "top_p", "presence_penalty", "frequency_penalty"],
    lifecycleStatus,
    deprecatedAt: lifecycleStatus === "RETIRED" ? DEEPSEEK_SOURCE_UPDATED_AT : null,
    sourceUpdatedAt: DEEPSEEK_SOURCE_UPDATED_AT,
  };
}

function unsupported(message: string): M5ModelConfigurationValidation {
  return { ok: false, code: "MODEL_CONFIGURATION_UNSUPPORTED", message: message.trim() };
}
