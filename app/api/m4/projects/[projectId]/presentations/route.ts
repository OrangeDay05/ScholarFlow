import {
  M4_PRESENTATION_SCENES,
  type M4PresentationReadiness,
} from "@/app/lib/m4-presentation-contracts";
import {
  adoptM4PresentationVersion,
  appendM4PresentationVersion,
  createM4PresentationProject,
  loadM4PresentationWorkspace,
  saveM4Slide,
} from "@/db/repositories/m4-presentations";
import { apiError, apiSuccess, isRecord } from "../../../../m3/_shared";
import { m4RepositoryError, requireM4Actor } from "../../../_shared";

const readiness = [
  "READY",
  "READY_WITH_WARNINGS",
  "NEEDS_CONTENT",
  "NEEDS_CONFIRMATION",
  "NEEDS_MATERIAL",
  "BLOCKED",
] as const;
const truth = ["UNVERIFIED", "PARTIALLY_VERIFIED", "VERIFIED"] as const;
const verification = [
  "UNVERIFIED",
  "VERIFIED_WITH_WARNINGS",
  "VERIFIED",
] as const;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await requireM4Actor(request);
  if ("response" in auth) return auth.response;
  try {
    return apiSuccess(
      await loadM4PresentationWorkspace(auth.actor, (await params).projectId),
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
  if (!isRecord(body) || typeof body.action !== "string") {
    return apiError(400, "INVALID_ACTION", "缺少 PPT 操作类型。");
  }
  const projectId = (await params).projectId;
  try {
    switch (body.action) {
      case "create": {
        const title = text(body.title);
        const scene = text(body.scene);
        const readinessStatus = text(body.readiness_status);
        const truthStatus = text(body.truth_status);
        const materials = stringArray(body.source_material_snapshot);
        const duration = optionalInteger(body.duration_minutes, 1, 600);
        if (
          !title ||
          !M4_PRESENTATION_SCENES.includes(
            scene as (typeof M4_PRESENTATION_SCENES)[number],
          ) ||
          !readiness.includes(
            readinessStatus as (typeof readiness)[number],
          ) ||
          !truth.includes(truthStatus as (typeof truth)[number]) ||
          !materials ||
          duration === null
        ) {
          return apiError(400, "INVALID_PRESENTATION", "PPT 项目参数无效。");
        }
        return apiSuccess(
          await createM4PresentationProject(auth.actor, projectId, {
            title,
            scene: scene as (typeof M4_PRESENTATION_SCENES)[number],
            audience: text(body.audience),
            durationMinutes: duration,
            readinessStatus: readinessStatus as M4PresentationReadiness,
            truthStatus: truthStatus as (typeof truth)[number],
            sourceSectionVersionId:
              text(body.source_section_version_id) || undefined,
            sourceMaterialSnapshot: materials,
          }),
          201,
        );
      }
      case "version": {
        const presentationProjectId = text(body.presentation_project_id);
        const materials = stringArray(body.material_snapshot);
        if (
          !presentationProjectId ||
          !materials ||
          !isRecord(body.narrative)
        ) {
          return apiError(400, "INVALID_VERSION", "PPT 版本参数无效。");
        }
        return apiSuccess(
          await appendM4PresentationVersion(auth.actor, projectId, {
            presentationProjectId,
            sourcePresentationVersionId:
              text(body.source_presentation_version_id) || undefined,
            sourceSectionVersionId:
              text(body.source_section_version_id) || undefined,
            materialSnapshot: materials,
            narrative: body.narrative,
          }),
          201,
        );
      }
      case "slide": {
        const presentationVersionId = text(body.presentation_version_id);
        const position = optionalInteger(body.position, 1, 500);
        const title = text(body.title);
        const sources = stringArray(body.source_bindings);
        const assets = stringArray(body.asset_bindings ?? []);
        const verificationStatus = text(body.verification_status);
        if (
          !presentationVersionId ||
          position === null ||
          position === undefined ||
          !title ||
          !sources || !assets ||
          !isRecord(body.content) ||
          !verification.includes(
            verificationStatus as (typeof verification)[number],
          )
        ) {
          return apiError(400, "INVALID_SLIDE", "幻灯片参数无效。");
        }
        return apiSuccess(
          await saveM4Slide(auth.actor, projectId, {
            presentationVersionId,
            position,
            title,
            content: body.content,
            speakerNotes: text(body.speaker_notes),
            assetBindings: assets,
            sourceBindings: sources,
            verificationStatus:
              verificationStatus as (typeof verification)[number],
          }),
        );
      }
      case "adopt": {
        const presentationVersionId = text(body.presentation_version_id);
        return presentationVersionId
          ? apiSuccess(
              await adoptM4PresentationVersion(
                auth.actor,
                projectId,
                presentationVersionId,
              ),
            )
          : apiError(400, "INVALID_ADOPTION", "缺少待采用的 PPT 版本。");
      }
      default:
        return apiError(400, "INVALID_ACTION", "不支持的 PPT 操作。");
    }
  } catch (error) {
    return m4RepositoryError(error);
  }
}

function optionalInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): number | undefined | null {
  if (value === undefined || value === null) return undefined;
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : null;
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 200) return null;
  const result = value.map(text);
  return result.every(Boolean) ? result : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
