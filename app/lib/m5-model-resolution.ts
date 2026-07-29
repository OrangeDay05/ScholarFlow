import type { M5AgentRole, M5InferenceConfiguration, M5ProviderId } from "./m5-model-capabilities";
import { requireM5ModelCapability, validateM5ModelConfiguration } from "./m5-model-capabilities";
import { M5ProviderError } from "./m5-provider-error";

export type M5TaskModelSelection = {
  provider: M5ProviderId;
  providerModelId: string;
  modelId: string;
  agentRole: M5AgentRole;
  credentialType: "PLATFORM_CREDENTIAL" | "USER_CREDENTIAL";
  credentialReference: string;
  inference: M5InferenceConfiguration;
  pricingVersion: string | null;
  confirmedByUser: boolean;
};

export function resolveM5TaskModelSelection(selection: M5TaskModelSelection) {
  if (!selection.confirmedByUser) {
    throw new M5ProviderError("INVALID_PARAMETERS", "正式任务必须由用户确认明确的模型与思考配置。", false, { provider: selection.provider, modelId: selection.modelId });
  }
  const capability = requireM5ModelCapability(selection.provider, selection.modelId);
  if (!capability) throw new M5ProviderError("MODEL_NOT_FOUND", "模型不在受控能力目录中。", false, { provider: selection.provider, modelId: selection.modelId });
  const validation = validateM5ModelConfiguration(capability, selection.inference);
  if (!validation.ok) throw new M5ProviderError(validation.code, validation.message, false, { provider: selection.provider, modelId: selection.modelId });
  return {
    agentRole: selection.agentRole,
    provider: selection.provider,
    providerModelId: selection.providerModelId,
    modelId: selection.modelId,
    capabilityVersion: capability.capabilityVersion,
    thinkingMode: validation.effective.thinkingMode,
    reasoningEffort: validation.effective.reasoningEffort,
    effectiveParameters: validation.effective,
    ignoredParameters: validation.ignoredParameters,
    credentialType: selection.credentialType,
    credentialReference: selection.credentialReference,
    pricingVersion: selection.pricingVersion,
    confirmedByUser: true as const,
  };
}
