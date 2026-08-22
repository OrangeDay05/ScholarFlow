import type {
  M3CreationMethod,
  M3OnboardingMode,
} from "@/app/lib/m3-contracts";
import type { M4ProjectIntakeInput } from "@/app/lib/m4-project-contracts";
import {
  createM4ProjectForActor,
  listM4ProjectsForActor,
} from "@/db/repositories/m4-projects";
import { apiError, apiSuccess, isRecord } from "../../m3/_shared";
import { m4RepositoryError, requireM4Actor } from "../_shared";

const creationMethods = new Set<M3CreationMethod>([
  "idea",
  "existing_draft",
  "requirements",
  "literature",
  "data",
]);

export async function GET(request: Request) {
  const auth = await requireM4Actor(request);
  if ("response" in auth) return auth.response;
  try {
    return apiSuccess(await listM4ProjectsForActor(auth.actor));
  } catch (error) {
    return m4RepositoryError(error);
  }
}

export async function POST(request: Request) {
  const auth = await requireM4Actor(request);
  if ("response" in auth) return auth.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_JSON", "请求正文必须是有效 JSON。");
  }
  if (!isRecord(body)) {
    return apiError(400, "INVALID_PROJECT", "项目参数不完整。");
  }
  const primaryCreationMethod = text(body.primaryCreationMethod);
  const onboardingMode = text(body.onboardingMode) || "direct";
  const goal = text(body.goal);
  const materialsSummary = text(body.materialsSummary);
  const firstAiHelp = text(body.firstAiHelp);
  if (
    !creationMethods.has(primaryCreationMethod as M3CreationMethod) ||
    !["direct", "guided"].includes(onboardingMode) ||
    (onboardingMode === "guided" && primaryCreationMethod !== "idea") ||
    !goal ||
    !materialsSummary ||
    !firstAiHelp
  ) {
    return apiError(
      400,
      "INVALID_PROJECT",
      "五种创建方式和三个最低问题均为必填项。",
    );
  }
  const materials = parseMaterials(body.materials);
  if (materials === null) {
    return apiError(400, "INVALID_MATERIALS", "材料元数据格式无效。");
  }
  const input: M4ProjectIntakeInput = {
    primaryCreationMethod: primaryCreationMethod as M3CreationMethod,
    onboardingMode: onboardingMode as M3OnboardingMode,
    goal,
    materialsSummary,
    firstAiHelp,
    title: text(body.title) || undefined,
    paperType: text(body.paperType) || undefined,
    language: text(body.language) || undefined,
    materials,
    idempotencyKey:
      text(request.headers.get("Idempotency-Key")) || undefined,
  };
  try {
    return apiSuccess(await createM4ProjectForActor(auth.actor, input), 201);
  } catch (error) {
    return m4RepositoryError(error);
  }
}

function parseMaterials(value: unknown): M4ProjectIntakeInput["materials"] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 50) return null;
  const parsed: NonNullable<M4ProjectIntakeInput["materials"]> = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const kind = text(item.kind);
    const filename = text(item.filename);
    const contentType = text(item.contentType);
    const sizeBytes = item.sizeBytes;
    if (
      !["requirement", "manuscript", "literature", "data", "image", "note"].includes(
        kind,
      ) ||
      !filename ||
      !contentType ||
      typeof sizeBytes !== "number" ||
      !Number.isSafeInteger(sizeBytes) ||
      sizeBytes < 0
    ) {
      return null;
    }
    parsed.push({
      kind: kind as NonNullable<M4ProjectIntakeInput["materials"]>[number]["kind"],
      filename,
      contentType,
      sizeBytes,
    });
  }
  return parsed;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
