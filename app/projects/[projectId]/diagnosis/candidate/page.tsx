import { authActor } from "@/app/lib/auth";
import { requirePageUser } from "@/app/lib/page-auth";
import { getWorkspaceForActor } from "@/db/repositories/m3-projects";
import { redirect } from "next/navigation";
import ProgressiveDiagnosisPage from "../ProgressiveDiagnosisPage";

export default async function DiagnosisCandidatePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await requirePageUser(`/projects/${projectId}/diagnosis/candidate`);
  const workspace = await getWorkspaceForActor(authActor(user), projectId);
  if (workspace.diagnosis?.status === "confirmed") {
    redirect(`/projects/${projectId}/diagnosis`);
  }
  return <ProgressiveDiagnosisPage projectId={projectId} persistenceEnabled />;
}
