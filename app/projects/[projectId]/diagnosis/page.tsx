import { M4_DIAGNOSIS_PERSISTENCE_ENABLED } from "@/app/lib/m4-features";
import ProgressiveDiagnosisPage from "./ProgressiveDiagnosisPage";
import { ProjectAccessState } from "@/app/components/ProjectAccessState";
import { ProjectContextBar } from "@/app/components/ProjectContextBar";
import { authActor } from "@/app/lib/auth";
import { requirePageUser } from "@/app/lib/page-auth";
import { loadProjectAccessContext } from "@/db/repositories/m10-project-context";

export default async function DiagnosisPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await requirePageUser(`/projects/${projectId}/diagnosis`);
  try {
    const context = await loadProjectAccessContext(authActor(user), projectId);
    if (!context.canEdit) return <ProjectAccessState role="REVIEWER" title="当前身份仅可审核" detail="审核员不能修改作者的诊断卡或创建修改任务。" />;
    return <><ProjectContextBar context={context} /><ProgressiveDiagnosisPage projectId={projectId} persistenceEnabled={M4_DIAGNOSIS_PERSISTENCE_ENABLED} /></>;
  } catch (error) {
    return <ProjectAccessState title="无法打开项目诊断" detail={error instanceof Error ? error.message : "项目不存在或无权访问。"} />;
  }
}
