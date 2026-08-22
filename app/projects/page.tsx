import Link from "next/link";
import { AppShell } from "../components/AppShell";
import { authActor } from "../lib/auth";
import type { M3ProjectSummary } from "../lib/m3-contracts";
import { requirePageUser } from "../lib/page-auth";
import { listM4ProjectsForActor } from "@/db/repositories/m4-projects";
import {
  listAvailableProductRoles,
  listProjectAccessForActor,
  type ProductRole,
} from "@/db/repositories/m10-project-context";
import styles from "./Projects.module.css";
import { ProjectDeleteButton } from "./ProjectDeleteButton";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const user = await requirePageUser("/projects");
  const actor = authActor(user);
  const availableRoles = await listAvailableProductRoles(actor);
  const requestedRole = (await searchParams).role;
  const currentRole: ProductRole =
    requestedRole === "REVIEWER" && availableRoles.includes("REVIEWER")
      ? "REVIEWER"
      : availableRoles.includes("AUTHOR")
        ? "AUTHOR"
        : "REVIEWER";
  if (currentRole === "REVIEWER") {
    const assignments = await listProjectAccessForActor(actor, "REVIEWER");
    return (
      <AppShell
        action={availableRoles.includes("AUTHOR") ? <Link className={styles.newButton} href="/projects?role=AUTHOR">切换到作者身份</Link> : null}
        description="这里只显示明确分配给当前审核员的项目；审核身份不能直接修改作者正文。"
        eyebrow="Review workspace"
        title={`你好，${user.displayName} · 当前身份：审核员`}
      >
        <section className={styles.contextNotice} aria-label="当前审核上下文">
          <strong>当前 Workspace</strong>
          <span>{assignments[0]?.workspaceName ?? "尚未加入任何待审核工作区"}</span>
          <strong>当前权限</strong>
          <span>仅可审核，不可修改正文或创建修改类 AI 任务</span>
        </section>
        {assignments.length ? (
          <section className={styles.projectsSection}>
            <div className={styles.sectionHeading}><div><p>REVIEW ASSIGNMENTS</p><h2>已分配审核项目</h2></div></div>
            <div className={styles.projectList}>
              {assignments.map((assignment, index) => (
                <article className={styles.projectCard} key={assignment.projectId}>
                  <div className={styles.cardIndex}>{pad(index + 1)}</div>
                  <div className={styles.cardMain}>
                    <div className={styles.cardMeta}><span>审核员</span><span>仅可审核</span></div>
                    <h3>{assignment.projectTitle}</h3>
                    <div className={styles.nextRow}><span>审核状态</span><p>{assignment.assignmentStatus === "in_review" ? "审核中" : "待审核"}</p></div>
                  </div>
                  <div className={styles.cardProgress}>
                    <small>{assignment.workspaceName}</small>
                    <Link href={`/reviews/${assignment.projectId}`}>进入审核工作台 <span aria-hidden="true">→</span></Link>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : (
          <section className={styles.explicitEmpty} aria-labelledby="review-empty-title">
            <span>REVIEW QUEUE / 00</span>
            <h2 id="review-empty-title">当前没有待审核或已分配项目</h2>
            <p>这不是系统错误。审核员不能自动获得 Demo 项目或任意作者项目，也不具备直接修改正文的权限。</p>
            <div><Link href="/projects?role=REVIEWER">重新检查审核分配</Link>{availableRoles.includes("AUTHOR") ? <Link href="/projects?role=AUTHOR">切换到作者身份</Link> : null}</div>
          </section>
        )}
      </AppShell>
    );
  }
  const projects = await listM4ProjectsForActor(actor);
  const activeProjects = projects.filter((project) => project.status === "active");
  const archivedProjects = projects.filter((project) => project.status === "archived");
  const nextProject = activeProjects.at(0) ?? null;

  return (
    <AppShell
      action={<div className={styles.roleActions}>{availableRoles.includes("REVIEWER") ? <Link href="/projects?role=REVIEWER">切换到审核员身份</Link> : null}<Link className={styles.newButton} href="/projects/new">新建项目 <span>＋</span></Link></div>}
      description="从当前阶段继续，项目与版本保存在你的独立工作区。"
      eyebrow="Project workspace"
      title={`你好，${user.displayName} · 当前身份：作者`}
    >
      <section className={styles.contextNotice} aria-label="当前作者上下文">
        <strong>当前 Workspace</strong><span>{user.displayName} 的工作区</span>
        <strong>当前权限</strong><span>可创建项目；进入具体项目后才建立 AI 会话和任务上下文</span>
      </section>
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
                  ? `继续${projectStageLabel(nextProject)}`
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
                    {project.onboardingMode === "guided" ? <span>AI 引导</span> : null}
                    <span>{project.language}</span>
                  </div>
                  <h3>{project.title}</h3>
                  <div className={styles.phaseRow}>
                    <span>当前阶段</span>
                    <strong>{projectStageLabel(project)}</strong>
                  </div>
                  <div className={styles.nextRow}>
                    <span>项目状态</span>
                    <p>{project.status === "active" ? "进行中" : "已归档"}</p>
                  </div>
                </div>
                <div className={styles.cardProgress}>
                  <div className={styles.cardDeleteSlot}>
                    <ProjectDeleteButton projectId={project.id} title={project.title} />
                  </div>
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
  if (project.currentStage === "diagnosis" && project.onboardingMode === "guided") return `/projects/${project.id}/guided`;
  if (project.currentStage === "diagnosis") return `/projects/${project.id}/diagnosis/candidate`;
  if (project.currentStage === "outline") return `/projects/${project.id}/outline`;
  return `/projects/${project.id}/editor?section=introduction`;
}

function stageLabel(stage: string) {
  return ({ diagnosis: "项目诊断", outline: "研究提纲", writing: "章节写作" } as Record<string, string>)[stage] ?? stage;
}

function projectStageLabel(project: M3ProjectSummary) {
  return project.currentStage === "diagnosis" && project.onboardingMode === "guided"
    ? "AI 梳理中"
    : stageLabel(project.currentStage);
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
