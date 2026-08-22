import { authActor } from "@/app/lib/auth";
import { requirePageUser } from "@/app/lib/page-auth";
import { ProjectAccessState } from "@/app/components/ProjectAccessState";
import { loadProjectAccessContext } from "@/db/repositories/m10-project-context";
import { GuidedResearchClient } from "./GuidedResearchClient";

export default async function GuidedResearchPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requirePageUser(`/projects/${projectId}/guided`);
  try {
    const context = await loadProjectAccessContext(authActor(user), projectId);
    if (!context.canEdit) return <ProjectAccessState title="无法进入 AI 梳理" detail="当前身份没有修改此项目的权限。" />;
    return <GuidedResearchClient projectId={projectId} projectTitle={context.projectTitle} />;
  } catch (error) {
    return <ProjectAccessState title="无法打开项目" detail={error instanceof Error ? error.message : "项目不存在或无权访问。"} />;
  }
}
