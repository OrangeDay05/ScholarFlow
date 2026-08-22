import type {
  M5ConnectionTestResult,
  M5ProviderAdapter,
  M5ProviderRequest,
  M5ProviderResult,
  M5ProviderToolCall,
} from "./m5-provider-adapter";
import type { M5InferenceConfiguration, M5ModelCapability } from "./m5-model-capabilities";
import { requireM5ModelCapability, validateM5ModelConfiguration } from "./m5-model-capabilities";
import { M5ProviderError } from "./m5-provider-error";

const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";

type DeepSeekUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
  completion_tokens_details?: { reasoning_tokens?: number };
};

type DeepSeekMessage = {
  content?: string | null;
  reasoning_content?: string;
  tool_calls?: M5ProviderToolCall[];
};

export class DeepSeekProviderAdapter implements M5ProviderAdapter {
  readonly providerKey = "deepseek";
  private readonly fetcher: typeof fetch;
  private readonly baseUrl: string;
  private readonly transientToolRuns = new Map<string, { message: DeepSeekMessage; expiresAt: number }>();

  constructor(options: { fetcher?: typeof fetch; baseUrl?: string } = {}) {
    this.fetcher = options.fetcher ?? fetch;
    this.baseUrl = (options.baseUrl ?? DEFAULT_DEEPSEEK_BASE_URL).replace(/\/$/u, "");
  }

  async listModels(credential: string, signal: AbortSignal): Promise<string[]> {
    const response = await this.fetcher(`${this.baseUrl}/models`, { headers: authorization(credential), signal });
    if (!response.ok) throw deepSeekHttpError(response, null);
    const payload = await response.json() as { data?: Array<{ id?: string }> };
    return (payload.data ?? []).flatMap((model) => typeof model.id === "string" ? [model.id] : []);
  }

  async validateCredential(credential: string, signal: AbortSignal): Promise<boolean> {
    return (await this.listModels(credential, signal)).length > 0;
  }

  async testConnection(modelKey: string, credential: string, signal: AbortSignal): Promise<M5ConnectionTestResult> {
    try {
      const models = await this.listModels(credential, signal);
      return { ok: models.includes(modelKey), providerKey: this.providerKey, modelKey, errorCode: models.includes(modelKey) ? null : "MODEL_NOT_FOUND" };
    } catch (error) {
      const normalized = normalizeDeepSeekError(error, modelKey);
      return { ok: false, providerKey: this.providerKey, modelKey, errorCode: normalized.code };
    }
  }

  validateModelConfiguration(capability: M5ModelCapability, configuration: M5InferenceConfiguration): void {
    const validation = validateM5ModelConfiguration(capability, configuration);
    if (!validation.ok) throw new M5ProviderError(validation.code, validation.message, false, { provider: "DEEPSEEK", modelId: capability.modelId });
  }

  normalizeUsage(value: unknown): NonNullable<M5ProviderResult["usage"]> {
    const usage = value && typeof value === "object" ? value as DeepSeekUsage : {};
    return { promptTokens: usage.prompt_tokens ?? null, cacheHitTokens: usage.prompt_cache_hit_tokens ?? null, cacheMissTokens: usage.prompt_cache_miss_tokens ?? null, completionTokens: usage.completion_tokens ?? null, reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? null };
  }

  normalizeFinishReason(value: unknown): M5ProviderResult["finishReason"] {
    return value === "stop" || value === "tool_calls" ? "STOP" : value === "length" ? "LENGTH" : value === "content_filter" ? "CONTENT_FILTER" : "UNKNOWN";
  }

  normalizeError(error: unknown, modelId: string | null = null): M5ProviderError { return normalizeDeepSeekError(error, modelId); }

  async execute(request: M5ProviderRequest, credential: string, signal: AbortSignal): Promise<M5ProviderResult> {
    return this.createCompletion(request, credential, signal);
  }

  async createCompletion(request: M5ProviderRequest, credential: string, signal: AbortSignal): Promise<M5ProviderResult> {
    const { body, capability } = this.requestBody(request, false);
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { ...authorization(credential), "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) { throw normalizeDeepSeekError(error, request.modelKey); }
    if (!response.ok) throw deepSeekHttpError(response, request.modelKey);
    const payload = await response.json() as { id?: string; choices?: Array<{ message?: DeepSeekMessage; finish_reason?: string }>; usage?: DeepSeekUsage; system_fingerprint?: string };
    const choice = payload.choices?.[0];
    if (!choice?.message || typeof choice.message.content !== "string" && !choice.message.tool_calls?.length) throw new M5ProviderError("INVALID_PROVIDER_RESPONSE", "DeepSeek 返回缺少用户可见内容或工具调用。", false, { provider: "DEEPSEEK", modelId: request.modelKey, statusCode: response.status, requestId: payload.id ?? null });
    if (choice.message.tool_calls?.length && choice.message.reasoning_content) {
      this.transientToolRuns.set(request.requestId, { message: choice.message, expiresAt: Date.now() + 5 * 60_000 });
    }
    return normalizedResult(request, choice.message.content ?? "", (choice.message.reasoning_content ?? "").length, choice.message.tool_calls ?? [], choice.finish_reason, payload.usage, payload.id, payload.system_fingerprint ?? null, capability);
  }

  async continueToolRun(
    request: M5ProviderRequest,
    toolResults: Array<{ toolCallId: string; content: string }>,
    credential: string,
    signal: AbortSignal,
  ): Promise<M5ProviderResult> {
    const transient = this.transientToolRuns.get(request.requestId);
    this.transientToolRuns.delete(request.requestId);
    if (!transient || transient.expiresAt < Date.now()) {
      throw new M5ProviderError("INVALID_PARAMETERS", "当前工具调用的受控临时上下文已不存在。", false, { provider: "DEEPSEEK", modelId: request.modelKey });
    }
    const knownCalls = new Set((transient.message.tool_calls ?? []).map((call) => call.id));
    if (!toolResults.length || toolResults.some((item) => !knownCalls.has(item.toolCallId))) {
      throw new M5ProviderError("INVALID_PARAMETERS", "工具结果与当前 Provider Run 不匹配。", false, { provider: "DEEPSEEK", modelId: request.modelKey });
    }
    return this.createCompletion({
      ...request,
      messages: [
        ...request.messages,
        { role: "assistant", content: transient.message.content ?? null, reasoningContent: transient.message.reasoning_content, toolCalls: transient.message.tool_calls },
        ...toolResults.map((item) => ({ role: "tool" as const, content: item.content, toolCallId: item.toolCallId })),
      ],
    }, credential, signal);
  }

  async streamCompletion(request: M5ProviderRequest, credential: string, signal: AbortSignal, onContent: (contentDelta: string) => void, onActivity: () => void = () => undefined): Promise<M5ProviderResult> {
    const { body, capability } = this.requestBody(request, true);
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { ...authorization(credential), "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) { throw normalizeDeepSeekError(error, request.modelKey); }
    if (!response.ok) throw deepSeekHttpError(response, request.modelKey);
    if (!response.body) throw new M5ProviderError("INVALID_PROVIDER_RESPONSE", "DeepSeek 未返回流式响应体。", false, { provider: "DEEPSEEK", modelId: request.modelKey });
    onActivity();
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "", content = "", reasoningCharacters = 0, finish: string | undefined, usage: DeepSeekUsage | undefined, requestId: string | undefined;
    const toolCalls = new Map<number, M5ProviderToolCall>();
    while (true) {
      const chunk = await reader.read();
      if (!chunk.done || chunk.value?.length) onActivity();
      buffer += decoder.decode(chunk.value ?? new Uint8Array(), { stream: !chunk.done });
      const lines = buffer.split(/\r?\n/u); buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        const event = JSON.parse(data) as { id?: string; choices?: Array<{ delta?: { content?: string; reasoning_content?: string; tool_calls?: Array<{ index?: number; id?: string; type?: "function"; function?: { name?: string; arguments?: string } }> }; finish_reason?: string }>; usage?: DeepSeekUsage };
        requestId ??= event.id;
        usage = event.usage ?? usage;
        const choice = event.choices?.[0]; finish = choice?.finish_reason ?? finish;
        const contentDelta = choice?.delta?.content ?? "";
        if (contentDelta) { content += contentDelta; onContent(contentDelta); }
        reasoningCharacters += choice?.delta?.reasoning_content?.length ?? 0;
        for (const item of choice?.delta?.tool_calls ?? []) mergeToolCall(toolCalls, item);
      }
      if (chunk.done) break;
    }
    const calls = [...toolCalls.values()];
    return normalizedResult(request, content, reasoningCharacters, calls, finish, usage, requestId, null, capability);
  }

  private requestBody(request: M5ProviderRequest, stream: boolean): { body: Record<string, unknown>; capability: M5ModelCapability } {
    const capability = requireM5ModelCapability("DEEPSEEK", request.modelKey);
    if (!capability) throw new M5ProviderError("MODEL_NOT_FOUND", "DeepSeek 模型未在受控目录中注册。", false, { provider: "DEEPSEEK", modelId: request.modelKey });
    const inference = request.inference ?? defaultInference(request.maxOutputTokens, request.timeoutSeconds, stream);
    const validation = validateM5ModelConfiguration(capability, { ...inference, streaming: stream });
    if (!validation.ok) throw new M5ProviderError(validation.code, validation.message, false, { provider: "DEEPSEEK", modelId: request.modelKey });
    const effective = validation.effective;
    const body: Record<string, unknown> = {
      model: request.modelKey,
      messages: request.messages.map(providerMessage),
      max_tokens: effective.maxOutputTokens,
      thinking: { type: effective.thinkingMode === "ENABLED" ? "enabled" : "disabled" },
      stream,
    };
    if (effective.thinkingMode === "ENABLED") body.reasoning_effort = effective.reasoningEffort?.toLowerCase();
    else {
      if (effective.temperature !== undefined) body.temperature = effective.temperature;
      if (effective.topP !== undefined) body.top_p = effective.topP;
      if (effective.presencePenalty !== undefined) body.presence_penalty = effective.presencePenalty;
      if (effective.frequencyPenalty !== undefined) body.frequency_penalty = effective.frequencyPenalty;
    }
    if (effective.responseFormat === "JSON") body.response_format = { type: "json_object" };
    if (request.tools?.length) body.tools = request.tools;
    if (request.toolChoice && effective.thinkingMode === "DISABLED") body.tool_choice = request.toolChoice;
    return { body, capability };
  }
}

export function validateM5ToolArguments(tool: { inputSchema: Record<string, unknown> }, rawArguments: string): Record<string, unknown> {
  let value: unknown;
  try { value = JSON.parse(rawArguments); } catch { throw new M5ProviderError("INVALID_PARAMETERS", "工具参数不是有效 JSON，未执行工具。", false, { provider: "DEEPSEEK" }); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new M5ProviderError("INVALID_PARAMETERS", "工具参数必须是 JSON 对象，未执行工具。", false, { provider: "DEEPSEEK" });
  const required = Array.isArray(tool.inputSchema.required) ? tool.inputSchema.required.filter((item): item is string => typeof item === "string") : [];
  const record = value as Record<string, unknown>;
  if (required.some((key) => !(key in record))) throw new M5ProviderError("INVALID_PARAMETERS", "工具参数缺少必需字段，未执行工具。", false, { provider: "DEEPSEEK" });
  return record;
}

function providerMessage(message: M5ProviderRequest["messages"][number]) {
  return { role: message.role, content: message.content, ...(message.reasoningContent ? { reasoning_content: message.reasoningContent } : {}), ...(message.toolCalls ? { tool_calls: message.toolCalls } : {}), ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}) };
}

function defaultInference(maxOutputTokens: number, timeoutSeconds: number, streaming: boolean): M5InferenceConfiguration {
  return { thinkingMode: "DISABLED", reasoningEffort: null, maxOutputTokens, responseFormat: "TEXT", timeoutMs: timeoutSeconds * 1_000, streaming, tools: [] };
}

function normalizedResult(request: M5ProviderRequest, content: string, reasoningCharacters: number, toolCalls: M5ProviderToolCall[], rawFinish: string | undefined, usage: DeepSeekUsage | undefined, requestId: string | undefined, systemFingerprint: string | null, capability: M5ModelCapability): M5ProviderResult {
  return {
    providerKey: "deepseek",
    modelKey: request.modelKey,
    modelVersion: capability.capabilityVersion,
    outputText: content,
    finishReason: rawFinish === "stop" || rawFinish === "tool_calls" ? "STOP" : rawFinish === "length" ? "LENGTH" : rawFinish === "content_filter" ? "CONTENT_FILTER" : "UNKNOWN",
    inputTokens: usage?.prompt_tokens ?? null,
    outputTokens: usage?.completion_tokens ?? null,
    providerRequestId: requestId ?? null,
    systemFingerprint,
    retryable: false,
    toolCalls,
    reasoningAudit: { produced: reasoningCharacters > 0, characters: reasoningCharacters, toolCallNames: toolCalls.map((call) => call.function.name) },
    usage: { promptTokens: usage?.prompt_tokens ?? null, cacheHitTokens: usage?.prompt_cache_hit_tokens ?? null, cacheMissTokens: usage?.prompt_cache_miss_tokens ?? null, completionTokens: usage?.completion_tokens ?? null, reasoningTokens: usage?.completion_tokens_details?.reasoning_tokens ?? null },
    warnings: [],
  };
}

function mergeToolCall(target: Map<number, M5ProviderToolCall>, item: { index?: number; id?: string; type?: "function"; function?: { name?: string; arguments?: string } }) {
  const index = item.index ?? 0;
  const current = target.get(index) ?? { id: item.id ?? `tool-${index}`, type: "function" as const, function: { name: "", arguments: "" } };
  current.id = item.id ?? current.id;
  current.function.name += item.function?.name ?? "";
  current.function.arguments += item.function?.arguments ?? "";
  target.set(index, current);
}

function authorization(credential: string) { return { Authorization: `Bearer ${credential}` }; }
function deepSeekHttpError(response: Response, modelId: string | null): M5ProviderError {
  const details = { provider: "DEEPSEEK", modelId, statusCode: response.status, retryAfterSeconds: retryAfter(response.headers.get("retry-after")), requestId: response.headers.get("x-request-id") };
  if (response.status === 401 || response.status === 403) return new M5ProviderError("AUTHENTICATION_FAILED", "DeepSeek 拒绝了服务器凭据。", false, details);
  if (response.status === 400) return new M5ProviderError("INVALID_REQUEST", "DeepSeek 拒绝了请求参数。", false, details);
  if (response.status === 404) return new M5ProviderError("MODEL_NOT_FOUND", "DeepSeek 未提供所选模型。", false, details);
  if (response.status === 402) return new M5ProviderError("INSUFFICIENT_BALANCE", "DeepSeek 账户余额不足。", false, details);
  if (response.status === 429) return new M5ProviderError("RATE_LIMITED", "DeepSeek 当前限流，请稍后重试。", true, details);
  if (response.status >= 500) return new M5ProviderError("PROVIDER_UNAVAILABLE", "DeepSeek 服务暂时不可用。", true, details);
  return new M5ProviderError("UNKNOWN", "DeepSeek 调用失败。", false, details);
}
function normalizeDeepSeekError(error: unknown, modelId: string | null): M5ProviderError {
  if (error instanceof M5ProviderError) return error;
  if (error instanceof DOMException && error.name === "AbortError") return new M5ProviderError("TIMEOUT", "DeepSeek 调用已超时或取消。", true, { provider: "DEEPSEEK", modelId });
  return new M5ProviderError("PROVIDER_UNAVAILABLE", "无法连接 DeepSeek。", true, { provider: "DEEPSEEK", modelId });
}
function retryAfter(value: string | null): number | null { const seconds = Number(value); return value && Number.isFinite(seconds) && seconds >= 0 ? seconds : null; }
