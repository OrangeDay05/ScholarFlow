import Link from "next/link";
import { AppShell } from "@/app/components/AppShell";
import { ProjectContextBar } from "@/app/components/ProjectContextBar";
import { authActor } from "@/app/lib/auth";
import { requirePageUser } from "@/app/lib/page-auth";
import { loadM4DiagnosisWorkspace } from "@/db/repositories/m4-diagnosis";
import { loadProjectAccessContext, ProjectContextError } from "@/db/repositories/m10-project-context";

export default async function ProjectTasksPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requirePageUser(`/projects/${projectId}/tasks`);
  const actor = authActor(user);
  try {
    const context = await loadProjectAccessContext(actor, projectId);
    if (context.role === "REVIEWER") {
      return <AppShell title="当前身份仅可审核" description="审核员不能创建或执行作者修改任务。"><ProjectContextBar context={context} /><p style={{ padding: 28 }}><Link href={`/reviews/${projectId}`}>进入审核工作台</Link></p></AppShell>;
    }
    const workspace = await loadM4DiagnosisWorkspace(actor, projectId);
    const available = workspace.readiness.filter((item) => item.status === "READY" || item.status === "READY_WITH_WARNINGS");
    return (
      <AppShell title="可开展任务" description="任务状态来自当前项目的诊断就绪检查，不会回退到其他项目。">
        <ProjectContextBar context={context} />
        <section style={{ padding: 28 }}>
          {available.length ? available.map((item) => <article key={item.id} style={{ padding: 18, borderBottom: "1px solid #bfd6ca" }}><h2>{item.task_name}</h2><p>{item.reason}</p><Link href={`/projects/${projectId}/editor?section=introduction`}>在当前项目中开展</Link></article>) : <div><h2>当前项目尚无可开展任务</h2><p>{workspace.readiness.length ? "诊断信息尚未满足任务条件，请先补充缺失字段。" : "当前项目尚未完成任务就绪检查。"}</p><Link href={`/projects/${projectId}/diagnosis`}>返回项目诊断</Link></div>}
        </section>
      </AppShell>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "无法读取当前项目任务。";
    const title = error instanceof ProjectContextError && error.code === "PROJECT_FORBIDDEN" ? "无权访问该项目" : error instanceof ProjectContextError && error.code === "PROJECT_NOT_FOUND" ? "项目不存在" : "任务加载失败";
    return <AppShell title={title} description={message}><p style={{ padding: 28 }}><Link href="/projects">返回项目列表</Link></p></AppShell>;
  }
}
