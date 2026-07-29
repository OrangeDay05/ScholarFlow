import type {
  M5ConnectionTestResult,
  M5ProviderAdapter,
  M5ProviderRequest,
  M5ProviderResult,
} from "./m5-provider-adapter";
import type { M5InferenceConfiguration, M5ModelCapability } from "./m5-model-capabilities";
import { validateM5ModelConfiguration } from "./m5-model-capabilities";
import { M5ProviderError } from "./m5-provider-error";
import { DeepSeekProviderAdapter } from "./m5-deepseek-provider";

export { M5ProviderError } from "./m5-provider-error";

export class OpenAiCompatibleProviderAdapter implements M5ProviderAdapter {
  readonly providerKey: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(options: { providerKey: "openai" | "deepseek"; baseUrl: string; fetcher?: typeof fetch }) {
    this.providerKey = options.providerKey;
    this.baseUrl = options.baseUrl.replace(/\/$/u, "");
    this.fetcher = options.fetcher ?? fetch;
  }

  async listModels(credential: string, signal: AbortSignal): Promise<string[]> {
    const response = await this.fetcher(`${this.baseUrl}/models`, { headers: authorization(credential), signal });
    if (!response.ok) throw providerHttpError(response, this.providerKey);
    const payload = await response.json() as { data?: Array<{ id?: string }> };
    return (payload.data ?? []).flatMap((model) => typeof model.id === "string" ? [model.id] : []);
  }

  async validateCredential(credential: string, signal: AbortSignal): Promise<boolean> {
    return (await this.listModels(credential, signal)).length > 0;
  }

  validateModelConfiguration(capability: M5ModelCapability, configuration: M5InferenceConfiguration): void {
    const validation = validateM5ModelConfiguration(capability, configuration);
    if (!validation.ok) throw new M5ProviderError(validation.code, validation.message, false, { provider: this.providerKey, modelId: capability.modelId });
  }

  normalizeUsage(value: unknown): NonNullable<M5ProviderResult["usage"]> {
    const usage = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return { promptTokens: numberOrNull(usage.prompt_tokens), cacheHitTokens: null, cacheMissTokens: null, completionTokens: numberOrNull(usage.completion_tokens), reasoningTokens: null };
  }

  normalizeFinishReason(value: unknown): M5ProviderResult["finishReason"] { return finishReason(typeof value === "string" ? value : undefined); }
  normalizeError(error: unknown): M5ProviderError { return normalizeProviderError(error, this.providerKey); }

  async testConnection(modelKey: string, credential: string, signal: AbortSignal): Promise<M5ConnectionTestResult> {
    try {
      const models = await this.listModels(credential, signal);
      return { ok: models.includes(modelKey), providerKey: this.providerKey, modelKey, errorCode: null };
    } catch (error) {
      const normalized = normalizeProviderError(error, this.providerKey);
      return { ok: false, providerKey: this.providerKey, modelKey, errorCode: normalized.code };
    }
  }

  async execute(request: M5ProviderRequest, credential: string, signal: AbortSignal): Promise<M5ProviderResult> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { ...authorization(credential), "Content-Type": "application/json" },
        body: JSON.stringify({ model: request.modelKey, messages: request.messages, max_tokens: request.maxOutputTokens }),
        signal,
      });
    } catch (error) { throw normalizeProviderError(error, this.providerKey); }
    if (!response.ok) throw providerHttpError(response, this.providerKey);
    const payload = await response.json() as {
      id?: string;
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const choice = payload.choices?.[0];
    if (!choice || typeof choice.message?.content !== "string") throw new M5ProviderError("INVALID_PROVIDER_RESPONSE", "供应商返回缺少文本结果。", false, { provider: this.providerKey, statusCode: response.status });
    return {
      providerKey: this.providerKey,
      modelKey: request.modelKey,
      modelVersion: request.modelVersion,
      outputText: choice.message.content,
      finishReason: finishReason(choice.finish_reason),
      inputTokens: payload.usage?.prompt_tokens ?? null,
      outputTokens: payload.usage?.completion_tokens ?? null,
      providerRequestId: payload.id ?? null,
      systemFingerprint: null,
      retryable: false,
    };
  }

  async createCompletion(request: M5ProviderRequest, credential: string, signal: AbortSignal): Promise<M5ProviderResult> {
    return this.execute(request, credential, signal);
  }

  async streamCompletion(request: M5ProviderRequest, credential: string, signal: AbortSignal, onContent: (contentDelta: string) => void): Promise<M5ProviderResult> {
    const result = await this.execute(request, credential, signal);
    onContent(result.outputText);
    return result;
  }
}

export function createDefaultProviderAdapters(fetcher?: typeof fetch) {
  return [
    new OpenAiCompatibleProviderAdapter({ providerKey: "openai", baseUrl: "https://api.openai.com/v1", fetcher }),
    new DeepSeekProviderAdapter({ fetcher }),
  ];
}

function authorization(credential: string) { return { Authorization: `Bearer ${credential}` }; }
function finishReason(value?: string): M5ProviderResult["finishReason"] { return value === "stop" ? "STOP" : value === "length" ? "LENGTH" : value === "content_filter" ? "CONTENT_FILTER" : "UNKNOWN"; }
function providerHttpError(response: Response, provider: string): M5ProviderError {
  const details = { provider, statusCode: response.status, retryAfterSeconds: retryAfter(response.headers.get("retry-after")) };
  if (response.status === 401 || response.status === 403) return new M5ProviderError("AUTHENTICATION_FAILED", "供应商拒绝了凭据。", false, details);
  if (response.status === 400) return new M5ProviderError("INVALID_REQUEST", "供应商拒绝了请求参数。", false, details);
  if (response.status === 404) return new M5ProviderError("MODEL_NOT_FOUND", "供应商未提供所选模型。", false, details);
  if (response.status === 429) return new M5ProviderError(response.headers.get("x-ratelimit-remaining-requests") === "0" ? "RATE_LIMITED" : "INSUFFICIENT_BALANCE", "供应商限流或额度不足。", true, details);
  if (response.status >= 500) return new M5ProviderError("PROVIDER_UNAVAILABLE", "供应商暂时不可用。", true, details);
  return new M5ProviderError("UNKNOWN", "供应商拒绝了请求。", false, details);
}
function normalizeProviderError(error: unknown, provider: string): M5ProviderError {
  if (error instanceof M5ProviderError) return error;
  if (error instanceof DOMException && error.name === "AbortError") return new M5ProviderError("TIMEOUT", "供应商调用已超时或取消。", true, { provider });
  return new M5ProviderError("PROVIDER_UNAVAILABLE", "无法连接供应商。", true, { provider });
}
function retryAfter(value: string | null): number | null { if (!value) return null; const seconds = Number(value); return Number.isFinite(seconds) && seconds >= 0 ? seconds : null; }
function numberOrNull(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
