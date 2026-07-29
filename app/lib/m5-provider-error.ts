export type M5ProviderErrorCode =
  | "AUTHENTICATION_FAILED"
  | "INVALID_REQUEST"
  | "INVALID_PARAMETERS"
  | "INSUFFICIENT_BALANCE"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "CONTENT_FILTERED"
  | "PROVIDER_UNAVAILABLE"
  | "INSUFFICIENT_PROVIDER_RESOURCE"
  | "MODEL_NOT_FOUND"
  | "MODEL_RETIRED"
  | "MODEL_CONFIGURATION_UNSUPPORTED"
  | "USER_CANCELLED"
  | "INVALID_PROVIDER_RESPONSE"
  | "UNKNOWN";

export class M5ProviderError extends Error {
  readonly code: M5ProviderErrorCode;
  readonly provider: string;
  readonly modelId: string | null;
  readonly statusCode: number | null;
  readonly retryable: boolean;
  readonly retryAfter: number | null;
  readonly retryAfterSeconds: number | null;
  readonly safeMessage: string;
  readonly internalCauseReference: string;
  readonly requestId: string | null;
  readonly occurredAt: string;

  constructor(
    code: M5ProviderErrorCode,
    safeMessage: string,
    retryable: boolean,
    details: {
      provider?: string;
      modelId?: string | null;
      statusCode?: number | null;
      retryAfterSeconds?: number | null;
      requestId?: string | null;
      internalCauseReference?: string;
    } = {},
  ) {
    super(safeMessage);
    this.name = "M5ProviderError";
    this.code = code;
    this.provider = details.provider ?? "unknown";
    this.modelId = details.modelId ?? null;
    this.statusCode = details.statusCode ?? null;
    this.retryable = retryable;
    this.retryAfter = details.retryAfterSeconds ?? null;
    this.retryAfterSeconds = this.retryAfter;
    this.safeMessage = safeMessage;
    this.internalCauseReference = details.internalCauseReference ?? crypto.randomUUID();
    this.requestId = details.requestId ?? null;
    this.occurredAt = new Date().toISOString();
  }
}
