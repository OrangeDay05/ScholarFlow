import Link from "next/link";
import { AppShell, MockBadge } from "../components/AppShell";
import { StateGallery } from "../components/StateGallery";
import { demoProjects } from "../lib/m1-mock";
import styles from "./Projects.module.css";

export default function ProjectsPage() {
  return (
    <AppShell
      action={<Link className={styles.newButton} href="/projects/new">新建项目 <span>＋</span></Link>}
      description="从当前阶段继续，而不是从空白聊天框重新开始。所有项目、进度与提示均为 M1 演示数据。"
      eyebrow="Project workspace · Mock"
      title="下午好，林研究员。"
    >
      <section className={styles.focusGrid} aria-label="项目下一步概览">
        <article className={styles.nextPanel}>
          <div className={styles.panelTop}>
            <span>当前最重要的下一步</span>
            <MockBadge>演示项目</MockBadge>
          </div>
          <div className={styles.nextBody}>
            <div className={styles.stepIndex}>01</div>
            <div>
              <p>数字平台中的知识协作机制研究</p>
              <h2>确认诊断卡，再进入正式章节写作。</h2>
              <span>
                研究对象与方法仍需核对。诊断卡未确认时，通用章节写作会保持阻断。
              </span>
            </div>
          </div>
          <div className={styles.nextActions}>
            <Link href="/projects/demo/diagnosis">检查诊断卡 <span aria-hidden="true">→</span></Link>
            <span>上次更新 · 今天 20:36</span>
          </div>
        </article>

        <aside className={styles.summaryPanel} aria-label="项目状态摘要">
          <p>工作区概览</p>
          <dl>
            <div><dt>02</dt><dd>进行中的项目</dd></div>
            <div><dt>01</dt><dd>等待确认</dd></div>
            <div><dt>01</dt><dd>需要补充证据</dd></div>
          </dl>
          <div className={styles.summaryNote}>
            <span className={styles.pulse} />
            页面状态由 Mock 数据展示
          </div>
        </aside>
      </section>

      <section className={styles.projectsSection} aria-labelledby="project-list-heading">
        <div className={styles.sectionHeading}>
          <div>
            <p>MY PROJECTS / 02</p>
            <h2 id="project-list-heading">我的项目</h2>
          </div>
          <div className={styles.filters} aria-label="项目列表筛选骨架">
            <button className={styles.activeFilter} type="button">全部</button>
            <button type="button">进行中</button>
            <button type="button">待确认</button>
          </div>
        </div>

        <div className={styles.projectList}>
          {demoProjects.map((project, projectIndex) => {
            const destination =
              project.id === "demo"
                ? "/projects/demo/diagnosis"
                : "/projects/demo/editor?section=introduction";

            return (
              <article className={styles.projectCard} key={project.id}>
                <div className={styles.cardIndex}>{String(projectIndex + 1).padStart(2, "0")}</div>
                <div className={styles.cardMain}>
                  <div className={styles.cardMeta}>
                    <span>{project.type}</span>
                    <span>{project.language}</span>
                    <MockBadge />
                  </div>
                  <h3>{project.title}</h3>
                  <div className={styles.phaseRow}>
                    <span>当前阶段</span>
                    <strong>{project.phase}</strong>
                  </div>
                  <div className={styles.nextRow}>
                    <span>下一步</span>
                    <p>{project.next}</p>
                  </div>
                </div>
                <div className={styles.cardProgress}>
                  <div className={styles.progressValue}>
                    <strong>{project.progress}</strong><span>%</span>
                  </div>
                  <div className={styles.progressTrack} aria-label={`项目完成度 ${project.progress}%`}>
                    <span style={{ width: `${project.progress}%` }} />
                  </div>
                  <small>{project.updated}</small>
                  <Link href={destination}>继续项目 <span aria-hidden="true">→</span></Link>
                </div>
              </article>
            );
          })}
        </div>

        <div className={styles.emptyHint}>
          <span className={styles.emptyMark}>＋</span>
          <div>
            <strong>没有更多项目</strong>
            <p>你也可以从 Idea、初稿、论文要求、文献范文或研究数据开始。</p>
          </div>
          <Link href="/projects/new">选择创建方式</Link>
        </div>
      </section>

      <StateGallery />
    </AppShell>
  );
}
