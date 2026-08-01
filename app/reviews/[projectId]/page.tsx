import Link from "next/link";
import { AppShell } from "@/app/components/AppShell";
import { ProjectContextBar } from "@/app/components/ProjectContextBar";
import { authActor } from "@/app/lib/auth";
import { requirePageUser } from "@/app/lib/page-auth";
import { getD1 } from "@/db";
import { loadProjectAccessContext, ProjectContextError } from "@/db/repositories/m10-project-context";

export default async function ReviewWorkspacePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requirePageUser(`/reviews/${projectId}`);
  try {
    const context = await loadProjectAccessContext(authActor(user), projectId, "REVIEWER");
    const reports = await getD1()
      .prepare(`SELECT id, status, summary, created_at FROM review_reports WHERE project_id = ? AND owner_user_id = (SELECT owner_user_id FROM projects WHERE id = ?) ORDER BY created_at DESC`)
      .bind(projectId, projectId)
      .all<{ id: string; status: string; summary: string; created_at: string }>();
    return (
      <AppShell title="项目审核工作台" description="审核意见进入 ReviewReport / ReviewIssue 流程，不会直接改写作者正文。">
        <ProjectContextBar context={context} />
        <section style={{ padding: 28 }}>
          {(reports.results ?? []).length ? (reports.results ?? []).map((report) => (
            <article key={report.id} style={{ padding: 18, borderBottom: "1px solid #bfd6ca" }}>
              <strong>{report.status}</strong><h2>{report.summary || "待填写审核摘要"}</h2><small>{report.created_at}</small>
            </article>
          )) : <div><h2>当前分配尚未创建审核报告</h2><p>你可以查看该项目，但当前身份仅可审核，不可进入作者编辑器或创建修改类 AI 任务。</p></div>}
          <p><Link href="/projects?role=REVIEWER">返回审核分配</Link></p>
        </section>
      </AppShell>
    );
  } catch (error) {
    const forbidden = error instanceof ProjectContextError && error.code === "PROJECT_FORBIDDEN";
    return <AppShell title={forbidden ? "无权访问该审核项目" : "审核项目加载失败"} description={error instanceof Error ? error.message : "无法读取当前审核分配。"}><p style={{ padding: 28 }}><Link href="/projects?role=REVIEWER">返回审核分配</Link></p></AppShell>;
  }
}
