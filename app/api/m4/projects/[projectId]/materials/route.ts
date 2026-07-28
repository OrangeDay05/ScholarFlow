import type { M4MaterialRegistrationInput } from "@/app/lib/m4-project-contracts";
import {
  listM4MaterialsForActor,
  registerM4MaterialForActor,
} from "@/db/repositories/m4-projects";
import { apiError, apiSuccess, isRecord } from "../../../../m3/_shared";
import { m4RepositoryError, requireM4Actor } from "../../../_shared";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await requireM4Actor(request);
  if ("response" in auth) return auth.response;
  try {
    return apiSuccess(
      await listM4MaterialsForActor(auth.actor, (await params).projectId),
    );
  } catch (error) {
    return m4RepositoryError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await requireM4Actor(request);
  if ("response" in auth) return auth.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_JSON", "请求正文必须是有效 JSON。");
  }
  if (!isRecord(body)) {
    return apiError(400, "INVALID_MATERIAL", "材料元数据不完整。");
  }
  const kind = text(body.kind);
  const filename = text(body.filename);
  const contentType = text(body.contentType);
  const sizeBytes = body.sizeBytes;
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
    return apiError(400, "INVALID_MATERIAL", "材料元数据格式无效。");
  }
  const input: M4MaterialRegistrationInput = {
    kind: kind as M4MaterialRegistrationInput["kind"],
    filename,
    contentType,
    sizeBytes,
  };
  try {
    return apiSuccess(
      await registerM4MaterialForActor(
        auth.actor,
        (await params).projectId,
        input,
      ),
      201,
    );
  } catch (error) {
    return m4RepositoryError(error);
  }
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
