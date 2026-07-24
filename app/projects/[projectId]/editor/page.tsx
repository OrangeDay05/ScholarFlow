import Link from "next/link";
import { productSkills, projectOutline } from "@/app/lib/m1-mock";
import styles from "./Editor.module.css";

type EditorPageProps = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ state?: string; section?: string }>;
};

const materials = [
  {
    type: "研究文献",
    name: "platform-collaboration-review.docx",
    status: "已授权",
  },
  {
    type: "论文要求",
    name: "投稿规范与章节要求.txt",
    status: "已授权",
  },
  {
    type: "参考论文",
    name: "同水平论文结构样例.docx",
    status: "未授权",
  },
];

function OutlinePanel() {
  return (
    <>
      <div className={styles.panelHeading}>
        <div>
          <p>STRUCTURE</p>
          <h2>论文目录</h2>
        </div>
        <button aria-label="添加章节" className={styles.roundButton} type="button">
          ＋
        </button>
      </div>

      <nav className={styles.outline} aria-label="论文章节">
        {projectOutline.map((section) => {
          const current = section.title === "引言";
          return (
            <Link
              aria-current={current ? "page" : undefined}
              className={current ? styles.outlineActive : styles.outlineItem}
              href={`/projects/demo/editor?section=${section.title === "引言" ? "introduction" : section.index}`}
              key={section.index}
            >
              <span className={styles.outlineIndex}>{section.index}</span>
              <span className={styles.outlineCopy}>
                <strong>{section.title}</strong>
                <small>
                  {section.words.toLocaleString()} 字 · {section.state}
                </small>
              </span>
              {section.title === "结果与讨论" ? (
                <span className={styles.alertDot} title="缺少数据" />
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className={styles.materialSummary}>
        <div className={styles.sectionLabel}>
          <span>本节材料</span>
          <span>2 / 3 已授权</span>
        </div>
        {materials.map((material) => (
          <div className={styles.materialMini} key={material.name}>
            <span className={styles.fileMark}>{material.type.slice(0, 1)}</span>
            <span>
              <strong>{material.type}</strong>
              <small>{material.status}</small>
            </span>
          </div>
        ))}
        <button className={styles.textButton} type="button">
          管理本节材料 →
        </button>
      </div>
    </>
  );
}

function AssistantPanel({ blocked }: { blocked: boolean }) {
  return (
    <>
      <div className={styles.panelHeading}>
        <div>
          <p>CHAPTER ASSISTANT</p>
          <h2>章节助手</h2>
        </div>
        <span className={styles.mockLabel}>MOCK</span>
      </div>

      <section className={styles.skillSection} aria-labelledby="skill-title">
        <div className={styles.sectionLabel} id="skill-title">
          <span>选择产品 Skill</span>
          <span>六项</span>
        </div>
        <div className={styles.skillList}>
          {productSkills.map((skill) => {
            const selected = skill.id === "chapter-writing";
            const isBlockedSkill = blocked && selected;
            return (
              <button
                aria-pressed={selected}
                className={selected ? styles.skillActive : styles.skillButton}
                disabled={isBlockedSkill}
                key={skill.id}
                type="button"
              >
                <span className={styles.skillIndex}>{skill.index}</span>
                <span>
                  <strong>{skill.title}</strong>
                  <small>
                    {isBlockedSkill ? "诊断卡未确认 · 已阻断" : skill.description}
                  </small>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {blocked ? (
        <section className={styles.blockedCard} aria-label="章节写作阻断">
          <p>写作前置门</p>
          <h3>正式章节写作暂不可用</h3>
          <span>项目诊断卡仍在等待确认。请先核对研究对象、方法与交付要求。</span>
          <Link href="/projects/demo/diagnosis?status=draft">
            返回诊断卡确认 →
          </Link>
        </section>
      ) : (
        <section className={styles.readyCard} aria-label="章节写作已就绪">
          <span className={styles.readyDot} />
          <div>
            <strong>诊断卡已确认</strong>
            <small>可以基于授权材料创建新的章节版本。</small>
          </div>
        </section>
      )}

      <section className={styles.authorization}>
        <div className={styles.sectionLabel}>
          <span>本次材料授权</span>
          <button type="button">更改</button>
        </div>
        {materials.map((material, index) => (
          <label className={styles.materialChoice} key={material.name}>
            <input checked={index < 2} readOnly type="checkbox" />
            <span>
              <strong>{material.type}</strong>
              <small>{material.name}</small>
            </span>
          </label>
        ))}
        <p className={styles.scopeNote}>
          只读取本次明确勾选的材料，不自动读取整个项目。
        </p>
      </section>

      <section className={styles.evidenceCard}>
        <div className={styles.sectionLabel}>
          <span>引用证据</span>
          <span className={styles.supportTag}>直接支持</span>
        </div>
        <blockquote>
          “协作平台通过可追溯的知识交换机制降低跨团队协调成本……”
        </blockquote>
        <dl>
          <div>
            <dt>来源</dt>
            <dd>platform-collaboration-review.docx</dd>
          </div>
          <div>
            <dt>位置</dt>
            <dd>第 4 页，第 2 段</dd>
          </div>
        </dl>
        <p>核验范围：仅基于用户上传原文，不代表外部数据库核验。</p>
      </section>

      <section className={styles.taskCard}>
        <div>
          <span className={styles.taskPulse} />
          <span>
            <strong>任务状态 · 等待执行</strong>
            <small>ChatGPT · 主模型 · 演示数据</small>
          </span>
        </div>
        <button disabled={blocked} type="button">
          {blocked ? "确认诊断卡后可运行" : "运行并创建新版本"}
        </button>
      </section>
    </>
  );
}

export default async function EditorPage({
  params,
  searchParams,
}: EditorPageProps) {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  const blocked = query.state === "warning";
  const sectionTitle = query.section === "method" ? "研究方法" : "引言";

  return (
    <div className={styles.editorPage}>
      <header className={styles.topbar}>
        <div className={styles.projectIdentity}>
          <Link className={styles.brand} href="/projects" aria-label="返回项目列表">
            研
          </Link>
          <div>
            <p>
              <Link href="/projects">我的项目</Link>
              <span>/</span>
              <Link href={`/projects/${projectId}`}>数字平台中的知识协作机制研究</Link>
              <span>/</span>
              <strong>{sectionTitle}</strong>
            </p>
            <small>章节草稿 · 1,248 字 · v3 人工保存</small>
          </div>
        </div>

        <div className={styles.topActions}>
          <span className={styles.saveStatus}>已保存 20:36</span>
          <button className={styles.secondaryButton} type="button">
            保存版本
          </button>
          <button className={styles.secondaryButton} type="button">
            版本历史
          </button>
          <button className={styles.exportButton} type="button">
            导出 DOCX
          </button>
        </div>
      </header>

      <div className={styles.mockBanner}>
        <span>演示模式 · Mock</span>
        <p>页面仅展示编辑器视觉骨架，不会保存正文、调用模型或生成文件。</p>
      </div>

      {blocked ? (
        <aside className={styles.warningBar} aria-label="诊断卡未确认警告">
          <span className={styles.warningIcon}>!</span>
          <div>
            <strong>诊断卡尚未确认，正式章节写作已阻断</strong>
            <p>你仍可查看与编辑现有草稿，但不能运行“通用章节写作”。</p>
          </div>
          <Link href="/projects/demo/diagnosis?status=draft">去确认诊断卡</Link>
        </aside>
      ) : null}

      <div className={styles.mobileTools}>
        <details>
          <summary>打开论文目录</summary>
          <div className={styles.mobileDrawer}>
            <OutlinePanel />
          </div>
        </details>
        <details>
          <summary>打开章节助手</summary>
          <div className={styles.mobileDrawer}>
            <AssistantPanel blocked={blocked} />
          </div>
        </details>
      </div>

      <main className={styles.workspace}>
        <aside className={styles.leftPanel}>
          <OutlinePanel />
        </aside>

        <section className={styles.documentArea} aria-label="正文编辑区">
          <div className={styles.documentToolbar}>
            <div className={styles.formatTools} aria-label="基础格式工具">
              <button type="button">正文</button>
              <button aria-label="加粗" type="button">
                B
              </button>
              <button aria-label="斜体" type="button">
                I
              </button>
              <button type="button">引用</button>
            </div>
            <div className={styles.versionRule}>
              <span>当前版本 · v3</span>
              <small>新操作会创建新版本，不覆盖原稿</small>
            </div>
          </div>

          <article className={styles.paper} contentEditable suppressContentEditableWarning>
            <div className={styles.paperMeta}>
              <span>02</span>
              <span>INTRODUCTION</span>
            </div>
            <h1>{sectionTitle}</h1>
            <p className={styles.lead}>
              数字平台正在重塑知识生产与组织协作的基本方式。与传统的信息系统不同，
              平台不仅承载内容，也通过权限、接口与互动规则重新分配知识的可见性和流动路径。
            </p>
            <p>
              现有研究分别从技术采纳、组织学习与在线协作解释这一变化，但对于
              <mark>平台机制如何在跨团队情境中形成可持续的知识协作</mark>
              ，仍缺少能够连接规则设计、参与行为与协作结果的整合性讨论。
              <button className={styles.evidenceAnchor} type="button">
                证据 01
              </button>
            </p>
            <p>
              本文以数字平台中的项目团队为研究对象，尝试回答两个相互关联的问题：
              第一，平台规则如何影响成员贡献与复用知识的意愿；第二，不同协作情境下，
              哪些机制能够降低协调成本并维持知识质量。
            </p>
            <h2>研究切口</h2>
            <p>
              为避免把“平台使用”直接等同于“协作改善”，本文将平台机制拆分为可追溯性、
              反馈可见性与知识重组三个维度，并以用户已经上传的材料作为当前论证边界。
            </p>
            <aside className={styles.paperNote} contentEditable={false}>
              <strong>编辑提示 · Mock</strong>
              <span>此处需要补充研究对象的具体范围，并回到上传原文核对“协调成本”的定义。</span>
            </aside>
          </article>

          <footer className={styles.documentFooter}>
            <span>第 2 / 6 章</span>
            <span>1,248 字</span>
            <span>中文 · APA 7th</span>
          </footer>
        </section>

        <aside className={styles.rightPanel}>
          <AssistantPanel blocked={blocked} />
        </aside>
      </main>
    </div>
  );
}
