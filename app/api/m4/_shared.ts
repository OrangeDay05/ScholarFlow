import { M3_PERSISTENCE_ENABLED } from "@/app/lib/m3-features";
import {
  M4_DIAGNOSIS_PERSISTENCE_ENABLED,
  M4_PERSISTENCE_ENABLED,
} from "@/app/lib/m4-features";
import { getM3Actor, type M3Actor } from "@/app/lib/m3-server-identity";
import { M4ProjectRepositoryError } from "@/db/repositories/m4-projects";
import { apiError } from "../m3/_shared";

export function requireM4Actor(
  request: Request,
  scope: "core" | "diagnosis" = "core",
): { actor: M3Actor } | { response: Response } {
  const enabled =
    M3_PERSISTENCE_ENABLED &&
    (scope === "diagnosis"
      ? M4_DIAGNOSIS_PERSISTENCE_ENABLED
      : M4_PERSISTENCE_ENABLED);
  if (!enabled) {
    return {
      response: apiError(
        404,
        "M4_PERSISTENCE_DISABLED",
        "M4 持久化当前未启用。",
      ),
    };
  }
  const actor = getM3Actor(request);
  return actor
    ? { actor }
    : {
        response: apiError(
          401,
          "AUTHENTICATION_REQUIRED",
          "需要经过平台认证后才能访问诊断数据。",
        ),
      };
}

export function m4RepositoryError(error: unknown): Response {
  if (error instanceof M4ProjectRepositoryError || isM4NotFound(error)) {
    return apiError(404, error.code, error.message);
  }
  console.error("M4 persistence failure", error);
  return apiError(500, "M4_PERSISTENCE_FAILURE", "M4 持久化操作失败。");
}

function isM4NotFound(
  error: unknown,
): error is Error & { code: string } {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code.endsWith("_NOT_FOUND")
  );
}
