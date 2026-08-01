import EditorClient from "./EditorClient";
import { ProjectAccessState } from "@/app/components/ProjectAccessState";
import { ProjectContextBar } from "@/app/components/ProjectContextBar";
import { authActor } from "@/app/lib/auth";
import { requirePageUser } from "@/app/lib/page-auth";
import { loadProjectAccessContext } from "@/db/repositories/m10-project-context";

type EditorPageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function EditorPage({ params }: EditorPageProps) {
  const { projectId } = await params;
  const user = await requirePageUser(`/projects/${projectId}/editor`);
  try {
    const context = await loadProjectAccessContext(authActor(user), projectId);
    if (!context.canEdit) {
      return <ProjectAccessState role="REVIEWER" title="当前身份仅可审核" detail="该项目已分配给你审核，但未授予正文修改权限。请从审核工作台提交 ReviewReport 或 ReviewIssue。" />;
    }
    return <><ProjectContextBar context={context} /><EditorClient projectId={projectId} /></>;
  } catch (error) {
    return <ProjectAccessState title="无法打开项目编辑器" detail={error instanceof Error ? error.message : "项目不存在或无权访问。"} />;
  }
}
