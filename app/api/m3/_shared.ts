import type { M3ApiEnvelope } from "@/app/lib/m3-contracts";
import { M3_PERSISTENCE_ENABLED } from "@/app/lib/m3-features";
import {
  getM3Actor,
  type M3Actor,
} from "@/app/lib/m3-server-identity";
import { M3RepositoryError } from "@/db/repositories/m3-projects";

export function requireM3ApiActor(
  request: Request,
): { actor: M3Actor } | { response: Response } {
  if (!M3_PERSISTENCE_ENABLED) {
    return {
      response: apiError(
        404,
        "M3_PERSISTENCE_DISABLED",
        "M3 基础持久化当前未启用。",
      ),
    };
  }

  const actor = getM3Actor(request);
  if (!actor) {
    return {
      response: apiError(
        401,
        "AUTHENTICATION_REQUIRED",
        "需要经过平台认证后才能访问项目数据。",
      ),
    };
  }

  return { actor };
}

export function apiSuccess<T>(data: T, status = 200): Response {
  return Response.json(
    { ok: true, data } satisfies M3ApiEnvelope<T>,
    { status },
  );
}

export function apiError(
  status: number,
  code: string,
  message: string,
): Response {
  return Response.json(
    { ok: false, error: { code, message } } satisfies M3ApiEnvelope<never>,
    { status },
  );
}

export function repositoryError(error: unknown): Response {
  if (error instanceof M3RepositoryError) {
    return apiError(404, error.code, error.message);
  }
  console.error("M3 API failure", error);
  return apiError(
    500,
    "M3_PERSISTENCE_FAILURE",
    "基础持久化操作失败，请检查服务日志。",
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
