import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/app/components/AppShell";
import { ProjectAccessState } from "@/app/components/ProjectAccessState";
import { authActor } from "@/app/lib/auth";
import { requirePageUser } from "@/app/lib/page-auth";
import { loadM4DiagnosisWorkspace } from "@/db/repositories/m4-diagnosis";
import { getWorkspaceForActor } from "@/db/repositories/m3-projects";
import styles from "./formal-diagnosis.module.css";
import { DiagnosisMaterials } from "./DiagnosisMaterials";

export default async function DiagnosisPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requirePageUser(`/projects/${projectId}/diagnosis`);
  const actor = authActor(user);
  try {
    const [project, diagnosisWorkspace] = await Promise.all([
      getWorkspaceForActor(actor, projectId),
      loadM4DiagnosisWorkspace(actor, projectId),
    ]);
    const card = project.diagnosis;
    if (!card || card.status !== "confirmed") {
      redirect(project.project.onboardingMode === "guided"
        ? `/projects/${projectId}/guided`
        : `/projects/${projectId}/diagnosis/candidate`);
    }
    const fields = [
      ["题目", card.title], ["论文类型", card.paperType], ["语言", card.language],
      ["研究对象 / 数据", card.researchObject || "待确认"], ["研究问题", card.researchQuestion || "待确认"],
      ["研究方法", card.method || "待确认"], ["要求", card.requirements || "待确认"],
    ];
    return (
      <AppShell compact eyebrow="CONFIRMED PROJECT FACTS" title="项目诊断卡" description="这是当前项目唯一正式事实源。AI 对话、材料提取和方案建议只有经用户确认后才会进入这里。" action={<Link href="/projects">返回项目列表</Link>}>
        <section className={styles.summary}>
          <div><span>当前版本</span><strong>V{card.versionNumber}</strong><small>confirmed</small></div>
          <div><span>项目</span><strong>{project.project.title}</strong><small>{projectId}</small></div>
          <div><span>材料</span><strong>{project.materials.length}</strong><small>份当前项目材料</small></div>
        </section>
        <section className={styles.card}>
          {fields.map(([label, value]) => <article key={label}><span>{label}</span><p>{value}</p><small>用户确认的正式项目事实</small></article>)}
        </section>
        <DiagnosisMaterials projectId={projectId} />
        <section className={styles.history}>
          <header><h2>版本与历史</h2><span>正式版本不可覆盖</span></header>
          {diagnosisWorkspace.versions.map((version) => <div key={version.id}><strong>V{version.version_number}</strong><span>{version.status}</span><small>{version.confirmed_at ?? version.created_at}</small></div>)}
        </section>
        <footer className={styles.actions}><Link href={`/projects/${projectId}/guided`}>提出研究方案级修改</Link><Link className={styles.primary} href={`/projects/${projectId}/outline`}>查看并确认推荐目录 →</Link></footer>
      </AppShell>
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("NEXT_REDIRECT")) throw error;
    return <ProjectAccessState title="无法打开项目诊断卡" detail={error instanceof Error ? error.message : "项目不存在或无权访问。"} />;
  }
}
