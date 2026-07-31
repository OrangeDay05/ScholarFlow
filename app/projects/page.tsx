import Link from "next/link";
import { AppShell } from "../components/AppShell";
import { authActor } from "../lib/auth";
import type { M3ProjectSummary } from "../lib/m3-contracts";
import { requirePageUser } from "../lib/page-auth";
import { listM4ProjectsForActor } from "@/db/repositories/m4-projects";
import styles from "./Projects.module.css";

export default async function ProjectsPage() {
  const user = await requirePageUser("/projects");
  const projects = await listM4ProjectsForActor(authActor(user));
  const activeProjects = projects.filter((project) => project.status === "active");
  const archivedProjects = projects.filter((project) => project.status === "archived");
  const nextProject = activeProjects[0] ?? projects[0] ?? null;

  return (
    <AppShell
      action={<Link className={styles.newButton} href="/projects/new">新建项目 <span>＋</span></Link>}
      description="从当前阶段继续，项目与版本保存在你的独立工作区。"
      eyebrow="Project workspace"
      title={`你好，${user.displayName}。`}
    >
      <section className={styles.focusGrid} aria-label="项目下一步概览">
        <article className={styles.nextPanel}>
          <div className={styles.panelTop}>
            <span>当前最重要的下一步</span>
          </div>
          <div className={styles.nextBody}>
            <div className={styles.stepIndex}>{nextProject ? "01" : "＋"}</div>
            <div>
              <p>{nextProject?.title ?? "还没有项目"}</p>
              <h2>
                {nextProject
                  ? `继续${stageLabel(nextProject.currentStage)}`
                  : "从 Idea、初稿、要求、文献或研究数据开始。"}
              </h2>
              <span>
                {nextProject
                  ? "系统会保留材料、诊断卡和章节版本，不覆盖已经采用的内容。"
                  : "创建项目只需要三个基础回答，专业信息可以稍后补充。"}
              </span>
            </div>
          </div>
          <div className={styles.nextActions}>
            <Link href={nextProject ? projectDestination(nextProject) : "/projects/new"}>
              {nextProject ? "继续项目" : "创建新项目"} <span aria-hidden="true">→</span>
            </Link>
            {nextProject ? <span>更新于 {formatDate(nextProject.updatedAt)}</span> : null}
          </div>
        </article>

        <aside className={styles.summaryPanel} aria-label="项目状态摘要">
          <p>工作区概览</p>
          <dl>
            <div><dt>{pad(projects.length)}</dt><dd>全部项目</dd></div>
            <div><dt>{pad(activeProjects.length)}</dt><dd>进行中</dd></div>
            <div><dt>{pad(archivedProjects.length)}</dt><dd>已归档</dd></div>
          </dl>
          <div className={styles.summaryNote}>
            <span className={styles.pulse} />
            数据来自当前用户的持久化工作区
          </div>
        </aside>
      </section>

      <section className={styles.projectsSection} aria-labelledby="project-list-heading">
        <div className={styles.sectionHeading}>
          <div>
            <p>MY PROJECTS / {pad(projects.length)}</p>
            <h2 id="project-list-heading">我的项目</h2>
          </div>
        </div>

        {projects.length > 0 ? (
          <div className={styles.projectList}>
            {projects.map((project, projectIndex) => (
              <article className={styles.projectCard} key={project.id}>
                <div className={styles.cardIndex}>{pad(projectIndex + 1)}</div>
                <div className={styles.cardMain}>
                  <div className={styles.cardMeta}>
                    <span>{creationLabel(project.primaryCreationMethod)}</span>
                    <span>{project.language}</span>
                  </div>
                  <h3>{project.title}</h3>
                  <div className={styles.phaseRow}>
                    <span>当前阶段</span>
                    <strong>{stageLabel(project.currentStage)}</strong>
                  </div>
                  <div className={styles.nextRow}>
                    <span>项目状态</span>
                    <p>{project.status === "active" ? "进行中" : "已归档"}</p>
                  </div>
                </div>
                <div className={styles.cardProgress}>
                  <small>更新于 {formatDate(project.updatedAt)}</small>
                  <Link href={projectDestination(project)}>继续项目 <span aria-hidden="true">→</span></Link>
                </div>
              </article>
            ))}
          </div>
        ) : null}

        <Link
          className={styles.emptyHint}
          href="/projects/new"
          aria-label="创建新项目，选择创建方式"
        >
          <span className={styles.emptyMark}>＋</span>
          <div>
            <strong>创建新项目</strong>
            <p>可从 Idea、初稿、论文要求、文献范文或研究数据开始。</p>
          </div>
          <span className={styles.emptyAction}>
            选择创建方式 <span aria-hidden="true">→</span>
          </span>
        </Link>
      </section>
    </AppShell>
  );
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function projectDestination(project: M3ProjectSummary) {
  if (project.currentStage === "diagnosis") return `/projects/${project.id}/diagnosis`;
  if (project.currentStage === "outline") return `/projects/${project.id}/outline`;
  return `/projects/${project.id}/editor?section=introduction`;
}

function stageLabel(stage: string) {
  return ({ diagnosis: "项目诊断", outline: "研究提纲", writing: "章节写作" } as Record<string, string>)[stage] ?? stage;
}

function creationLabel(method: M3ProjectSummary["primaryCreationMethod"]) {
  return ({
    idea: "Idea",
    existing_draft: "已有初稿",
    requirements: "论文要求",
    literature: "文献与范文",
    data: "研究数据",
  } satisfies Record<M3ProjectSummary["primaryCreationMethod"], string>)[method];
}
