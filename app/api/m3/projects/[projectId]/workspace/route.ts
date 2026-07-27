import { getWorkspaceForActor } from "@/db/repositories/m3-projects";
import {
  apiSuccess,
  repositoryError,
  requireM3ApiActor,
} from "../../../_shared";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = requireM3ApiActor(request);
  if ("response" in auth) return auth.response;
  const { projectId } = await params;
  const section =
    new URL(request.url).searchParams.get("section")?.trim() || "introduction";

  try {
    return apiSuccess(
      await getWorkspaceForActor(auth.actor, projectId, section),
    );
  } catch (error) {
    return repositoryError(error);
  }
}
