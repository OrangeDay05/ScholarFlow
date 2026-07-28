import type { M4TaskRole } from "./m4-task-contracts";

export type M5ProviderMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type M5ProviderRequest = {
  requestId: string;
  modelKey: string;
  modelVersion: string;
  taskRole: M4TaskRole;
  messages: M5ProviderMessage[];
  maxOutputTokens: number;
  timeoutSeconds: number;
};

export type M5ProviderResult = {
  providerKey: string;
  modelKey: string;
  modelVersion: string;
  outputText: string;
  finishReason: "STOP" | "LENGTH" | "CONTENT_FILTER" | "UNKNOWN";
  inputTokens: number | null;
  outputTokens: number | null;
  providerRequestId: string | null;
};

export type M5ConnectionTestResult = {
  ok: boolean;
  providerKey: string;
  modelKey: string;
  errorCode: string | null;
};

export interface M5CredentialResolver {
  resolveCredential(secretReference: string): Promise<string>;
}

export interface M5ProviderAdapter {
  readonly providerKey: string;
  testConnection(
    modelKey: string,
    credential: string,
    signal: AbortSignal,
  ): Promise<M5ConnectionTestResult>;
  execute(
    request: M5ProviderRequest,
    credential: string,
    signal: AbortSignal,
  ): Promise<M5ProviderResult>;
}

export class M5ProviderRegistry {
  private readonly adapters = new Map<string, M5ProviderAdapter>();

  register(adapter: M5ProviderAdapter) {
    if (this.adapters.has(adapter.providerKey)) {
      throw new Error(`Provider Adapter 已注册：${adapter.providerKey}`);
    }
    this.adapters.set(adapter.providerKey, adapter);
  }

  require(providerKey: string): M5ProviderAdapter {
    const adapter = this.adapters.get(providerKey);
    if (!adapter) throw new Error(`Provider Adapter 不可用：${providerKey}`);
    return adapter;
  }
}

export async function runWithProviderTimeout<T>(
  timeoutSeconds: number,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  if (timeoutSeconds < 1 || timeoutSeconds > 600) {
    throw new Error("Provider 超时必须在 1—600 秒之间。");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutSeconds * 1000);
  try {
    return await operation(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}
