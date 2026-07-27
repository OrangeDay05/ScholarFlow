import type {
  CreateM3ProjectInput,
  M3CreationMethod,
} from "@/app/lib/m3-contracts";
import {
  createProjectForActor,
  listProjectsForActor,
} from "@/db/repositories/m3-projects";
import {
  apiError,
  apiSuccess,
  isRecord,
  repositoryError,
  requireM3ApiActor,
} from "../_shared";

const creationMethods = new Set<M3CreationMethod>([
  "idea",
  "existing_draft",
  "requirements",
  "literature",
  "data",
]);

export async function GET(request: Request) {
  const auth = requireM3ApiActor(request);
  if ("response" in auth) return auth.response;

  try {
    return apiSuccess(await listProjectsForActor(auth.actor));
  } catch (error) {
    return repositoryError(error);
  }
}

export async function POST(request: Request) {
  const auth = requireM3ApiActor(request);
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

  const title = stringValue(body.title);
  const paperType = stringValue(body.paperType);
  const language = stringValue(body.language);
  const method = stringValue(body.primaryCreationMethod);
  if (!title || !paperType || !language || !creationMethods.has(method as M3CreationMethod)) {
    return apiError(
      400,
      "INVALID_PROJECT",
      "题目、论文类型、语言和五种创建方式均为必填项。",
    );
  }

  const input: CreateM3ProjectInput = {
    title,
    paperType,
    language,
    primaryCreationMethod: method as M3CreationMethod,
    researchObject: stringValue(body.researchObject),
    researchQuestion: stringValue(body.researchQuestion),
    method: stringValue(body.method),
    requirements: stringValue(body.requirements),
  };

  try {
    return apiSuccess(await createProjectForActor(auth.actor, input), 201);
  } catch (error) {
    return repositoryError(error);
  }
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
