import type {
  M5ConnectionTestResult,
  M5ProviderAdapter,
  M5ProviderRequest,
  M5ProviderResult,
} from "./m5-provider-adapter";

export class M5ProviderError extends Error {
  readonly code:
    | "AUTHENTICATION_FAILED"
    | "RATE_LIMITED"
    | "QUOTA_EXCEEDED"
    | "REQUEST_REJECTED"
    | "PROVIDER_UNAVAILABLE"
    | "PROVIDER_TIMEOUT"
    | "INVALID_PROVIDER_RESPONSE";
  readonly retryable: boolean;
  constructor(code: M5ProviderError["code"], message: string, retryable: boolean) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

export class OpenAiCompatibleProviderAdapter implements M5ProviderAdapter {
  readonly providerKey: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(options: { providerKey: "openai" | "deepseek"; baseUrl: string; fetcher?: typeof fetch }) {
    this.providerKey = options.providerKey;
    this.baseUrl = options.baseUrl.replace(/\/$/u, "");
    this.fetcher = options.fetcher ?? fetch;
  }

  async testConnection(modelKey: string, credential: string, signal: AbortSignal): Promise<M5ConnectionTestResult> {
    try {
      const response = await this.fetcher(`${this.baseUrl}/models`, { headers: authorization(credential), signal });
      if (!response.ok) throw await providerHttpError(response);
      const payload = await response.json() as { data?: Array<{ id?: string }> };
      return { ok: Array.isArray(payload.data) && payload.data.some((model) => model.id === modelKey), providerKey: this.providerKey, modelKey, errorCode: null };
    } catch (error) {
      const normalized = normalizeProviderError(error);
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
    } catch (error) { throw normalizeProviderError(error); }
    if (!response.ok) throw await providerHttpError(response);
    const payload = await response.json() as {
      id?: string;
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const choice = payload.choices?.[0];
    if (!choice || typeof choice.message?.content !== "string") throw new M5ProviderError("INVALID_PROVIDER_RESPONSE", "供应商返回缺少文本结果。", false);
    return {
      providerKey: this.providerKey,
      modelKey: request.modelKey,
      modelVersion: request.modelVersion,
      outputText: choice.message.content,
      finishReason: finishReason(choice.finish_reason),
      inputTokens: payload.usage?.prompt_tokens ?? null,
      outputTokens: payload.usage?.completion_tokens ?? null,
      providerRequestId: payload.id ?? null,
    };
  }
}

export function createDefaultProviderAdapters(fetcher?: typeof fetch) {
  return [
    new OpenAiCompatibleProviderAdapter({ providerKey: "openai", baseUrl: "https://api.openai.com/v1", fetcher }),
    new OpenAiCompatibleProviderAdapter({ providerKey: "deepseek", baseUrl: "https://api.deepseek.com", fetcher }),
  ];
}

function authorization(credential: string) { return { Authorization: `Bearer ${credential}` }; }
function finishReason(value?: string): M5ProviderResult["finishReason"] { return value === "stop" ? "STOP" : value === "length" ? "LENGTH" : value === "content_filter" ? "CONTENT_FILTER" : "UNKNOWN"; }
async function providerHttpError(response: Response): Promise<M5ProviderError> {
  if (response.status === 401 || response.status === 403) return new M5ProviderError("AUTHENTICATION_FAILED", "供应商拒绝了凭据。", false);
  if (response.status === 429) return new M5ProviderError(response.headers.get("x-ratelimit-remaining-requests") === "0" ? "RATE_LIMITED" : "QUOTA_EXCEEDED", "供应商限流或额度不足。", true);
  if (response.status >= 500) return new M5ProviderError("PROVIDER_UNAVAILABLE", "供应商暂时不可用。", true);
  return new M5ProviderError("REQUEST_REJECTED", "供应商拒绝了请求。", false);
}
function normalizeProviderError(error: unknown): M5ProviderError {
  if (error instanceof M5ProviderError) return error;
  if (error instanceof DOMException && error.name === "AbortError") return new M5ProviderError("PROVIDER_TIMEOUT", "供应商调用已超时或取消。", true);
  return new M5ProviderError("PROVIDER_UNAVAILABLE", "无法连接供应商。", true);
}
