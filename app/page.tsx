"use client";

import { ChangeEvent, useMemo, useState } from "react";

type View = "dashboard" | "project" | "editor";

const creationPaths = [
  {
    id: "idea",
    mark: "✦",
    title: "从一个 Idea 开始",
    description: "把模糊想法整理成可执行的研究问题与论文结构。",
    tone: "forest",
  },
  {
    id: "draft",
    mark: "文",
    title: "导入已有初稿",
    description: "识别章节、论点与缺口，原稿始终保留。",
    tone: "leaf",
  },
  {
    id: "requirements",
    mark: "✓",
    title: "上传论文要求",
    description: "解析课程、学校、导师或期刊的硬性规则。",
    tone: "emerald",
  },
  {
    id: "literature",
    mark: "引",
    title: "导入文献与范文",
    description: "提取证据，分析同水平论文的结构与写作规范。",
    tone: "sage",
  },
  {
    id: "data",
    mark: "▦",
    title: "上传数据与材料",
    description: "识别表格、访谈、语料和图片中的研究信息。",
    tone: "mist",
  },
];

const outline = [
  ["摘要", "done"],
  ["1. 引言", "active"],
  ["2. 文献综述", "warning"],
  ["3. 理论基础", "idle"],
  ["4. 研究方法", "idle"],
  ["5. 分析与讨论", "idle"],
  ["6. 结论", "idle"],
  ["参考文献", "warning"],
];

const skillList = [
  ["✦", "续写本节", "结合项目上下文补充论证"],
  ["改", "学术润色", "保留原意，改善表达与衔接"],
  ["查", "逻辑检查", "检查论点、证据和章节回应"],
  ["引", "引用建议", "仅从已上传文献中寻找证据"],
];

const starterText = `近年来，生成式人工智能开始进入高校学术阅读与写作场景。它能够快速生成结构完整的英文材料，但“语言流畅”并不等于“适合学习者阅读”。现有研究更多关注生成文本的正确性与检测问题，对于文本复杂度是否匹配中国 EFL 学习者的实际水平，仍缺少以真实课程要求为边界的系统比较。

本研究拟比较人工编写与生成式人工智能生成的英语阅读材料，从词汇、句法和篇章三个层面分析其复杂度差异，并进一步讨论这些差异对材料选择与课堂使用的启示。`;

export default function Home() {
  const [view, setView] = useState<View>("dashboard");
  const [createPath, setCreatePath] = useState<(typeof creationPaths)[number] | null>(null);
  const [activeSection, setActiveSection] = useState("1. 引言");
  const [editorText, setEditorText] = useState(starterText);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [diagnosisConfirmed, setDiagnosisConfirmed] = useState(false);

  const wordCount = useMemo(
    () => editorText.replace(/\s+/g, "").length,
    [editorText],
  );

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  }

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const names = Array.from(event.target.files ?? []).map((file) => file.name);
    setUploadedFiles(names);
  }

  function createProject() {
    setCreatePath(null);
    setView("project");
    showNotice("项目已创建，诊断卡等待你的确认");
  }

  return (
    <main className="app-shell">
      <aside className="side-rail" aria-label="主导航">
        <button className="brand" onClick={() => setView("dashboard")} aria-label="回到工作台">
          <span className="brand-seal">研</span>
          <span>
            <strong>研序</strong>
            <small>ScholarFlow</small>
          </span>
        </button>

        <nav className="main-nav" aria-label="论文工作区">
          <button
            className={view === "dashboard" ? "nav-item active" : "nav-item"}
            onClick={() => setView("dashboard")}
          >
            <span>⌂</span> 工作台
          </button>
          <button
            className={view === "project" ? "nav-item active" : "nav-item"}
            onClick={() => setView("project")}
          >
            <span>□</span> 我的项目
            <em>3</em>
          </button>
          <button className="nav-item" onClick={() => showNotice("文献库将在下一阶段接入真实数据")}>
            <span>引</span> 文献库
          </button>
          <button className="nav-item" onClick={() => showNotice("任务中心暂无进行中的任务")}>
            <span>◷</span> AI 任务
          </button>
        </nav>

        <div className="rail-section">
          <p>最近项目</p>
          <button className="recent-project" onClick={() => setView("project")}>
            <i className="project-dot teal" />
            <span>
              <strong>AI 英语阅读材料研究</strong>
              <small>刚刚编辑</small>
            </span>
          </button>
          <button className="recent-project" onClick={() => showNotice("已打开项目概览")}>
            <i className="project-dot orange" />
            <span>
              <strong>网络热词语义演变</strong>
              <small>2 天前</small>
            </span>
          </button>
        </div>

        <div className="rail-footer">
          <button className="help-button" onClick={() => showNotice("帮助中心正在整理中")}>?</button>
          <div className="avatar">林</div>
          <span>
            <strong>林同学</strong>
            <small>简易版体验账号</small>
          </span>
          <button className="more-button" aria-label="更多账户选项">•••</button>
        </div>
      </aside>

      <section className="main-stage">
        <header className="topbar">
          <div className="crumbs">
            <span>研序</span>
            <b>/</b>
            <strong>
              {view === "dashboard" && "工作台"}
              {view === "project" && "AI 英语阅读材料研究"}
              {view === "editor" && activeSection}
            </strong>
          </div>
          <div className="top-actions">
            <button className="language-button" onClick={() => showNotice("项目语言：中文 / English")}>
              中 / EN
            </button>
            <button className="icon-button" aria-label="查看通知" onClick={() => showNotice("没有新的系统通知")}>
              ◌
            </button>
            <button className="primary-button compact" onClick={() => setCreatePath(creationPaths[0])}>
              <span>＋</span> 新建项目
            </button>
          </div>
        </header>

        {view === "dashboard" && (
          <Dashboard
            onCreate={setCreatePath}
            onOpenProject={() => setView("project")}
            onOpenEditor={() => setView("editor")}
          />
        )}

        {view === "project" && (
          <ProjectOverview
            confirmed={diagnosisConfirmed}
            onConfirm={() => {
              setDiagnosisConfirmed(true);
              showNotice("诊断卡已确认，后续 Skill 将读取这份上下文");
            }}
            onEdit={() => setView("editor")}
          />
        )}

        {view === "editor" && (
          <Editor
            activeSection={activeSection}
            editorText={editorText}
            wordCount={wordCount}
            setActiveSection={setActiveSection}
            setEditorText={setEditorText}
            onSave={() => showNotice("已保存为章节版本 V4")}
            onExport={() => showNotice("Word 导出演示：正式接入后将在此下载")}
            onRunSkill={(name) => showNotice(`${name} 已加入任务队列（演示）`)}
          />
        )}
      </section>

      {createPath && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setCreatePath(null)}>
          <section
            className="create-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button className="modal-close" onClick={() => setCreatePath(null)} aria-label="关闭">
              ×
            </button>
            <div className={`modal-mark ${createPath.tone}`}>{createPath.mark}</div>
            <p className="eyebrow">创建论文项目</p>
            <h2 id="create-title">{createPath.title}</h2>
            <p className="modal-description">{createPath.description}</p>

            <label className="field-label" htmlFor="project-title">论文题目或初步想法</label>
            <input
              id="project-title"
              className="text-input"
              defaultValue="生成式 AI 英语阅读材料的文本复杂度研究"
            />

            <div className="field-row">
              <label>
                <span className="field-label">论文语言</span>
                <select className="text-input" defaultValue="zh">
                  <option value="zh">中文</option>
                  <option value="en">English</option>
                  <option value="both">中英双语</option>
                </select>
              </label>
              <label>
                <span className="field-label">论文类型</span>
                <select className="text-input" defaultValue="course">
                  <option value="course">课程论文</option>
                  <option value="thesis">毕业论文</option>
                  <option value="journal">期刊论文</option>
                </select>
              </label>
            </div>

            <label className="upload-zone">
              <input type="file" multiple onChange={handleFiles} />
              <span className="upload-symbol">＋</span>
              <strong>拖入文件，或点击选择</strong>
              <small>支持 PDF、Word、Excel、CSV、TXT 和图片</small>
            </label>

            {uploadedFiles.length > 0 && (
              <div className="file-list">
                {uploadedFiles.map((file) => (
                  <span key={file}>✓ {file}</span>
                ))}
              </div>
            )}

            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setCreatePath(null)}>取消</button>
              <button className="primary-button" onClick={createProject}>生成项目诊断卡 →</button>
            </div>
          </section>
        </div>
      )}

      {notice && <div className="toast" role="status">{notice}</div>}
    </main>
  );
}

function Dashboard({
  onCreate,
  onOpenProject,
  onOpenEditor,
}: {
  onCreate: (path: (typeof creationPaths)[number]) => void;
  onOpenProject: () => void;
  onOpenEditor: () => void;
}) {
  return (
    <div className="dashboard page-frame">
      <section className="welcome-row">
        <div>
          <p className="eyebrow">2026年7月24日 · 星期五</p>
          <h1>下午好，林同学</h1>
          <p className="page-lead">今天从哪一步继续？你的材料、证据和版本都在同一个项目里。</p>
        </div>
        <div className="status-chip"><i /> 系统运行正常</div>
      </section>

      <section className="focus-card">
        <div className="focus-copy">
          <div className="focus-meta">
            <span className="tag">进行中</span>
            <span>最近编辑于 5 分钟前</span>
          </div>
          <h2>生成式 AI 英语阅读材料的文本复杂度研究</h2>
          <p>课程论文 · 中文 · 目标 8,000 字 · APA 7th</p>
          <div className="focus-actions">
            <button className="light-button" onClick={onOpenProject}>查看项目诊断</button>
            <button className="primary-button warm" onClick={onOpenEditor}>继续写作 →</button>
          </div>
        </div>
        <div className="progress-panel">
          <div className="progress-head">
            <span>整体进度</span>
            <strong>36%</strong>
          </div>
          <div className="progress-track"><i style={{ width: "36%" }} /></div>
          <div className="milestone-list">
            <span className="done">✓ 研究问题已确认</span>
            <span className="done">✓ 12 篇文献已入库</span>
            <span>○ 文献综述待补充证据</span>
          </div>
        </div>
      </section>

      <section className="section-heading">
        <div>
          <p className="eyebrow">新建论文项目</p>
          <h2>选择最接近你当前状态的入口</h2>
        </div>
        <span>之后可以继续补充其他材料</span>
      </section>

      <section className="creation-grid">
        {creationPaths.map((path, index) => (
          <button
            className={`creation-card ${path.tone} ${index === 0 ? "wide" : ""}`}
            key={path.id}
            onClick={() => onCreate(path)}
          >
            <span className="creation-number">0{index + 1}</span>
            <span className="creation-mark">{path.mark}</span>
            <strong>{path.title}</strong>
            <small>{path.description}</small>
            <i>开始 →</i>
          </button>
        ))}
      </section>

      <section className="dashboard-lower">
        <article className="panel-card task-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">最近任务</p>
              <h3>继续上次的工作</h3>
            </div>
            <button>查看全部</button>
          </div>
          <div className="task-row" onClick={onOpenEditor} role="button" tabIndex={0}>
            <span className="task-icon teal">引</span>
            <div>
              <strong>引言章节：补充研究缺口</strong>
              <small>AI 修改 · 已完成 · 2 分钟前</small>
            </div>
            <em>查看结果 →</em>
          </div>
          <div className="task-row" onClick={onOpenProject} role="button" tabIndex={0}>
            <span className="task-icon orange">析</span>
            <div>
              <strong>12 篇文献生成主题矩阵</strong>
              <small>材料分析 · 已完成 · 昨天</small>
            </div>
            <em>查看结果 →</em>
          </div>
        </article>

        <article className="panel-card rule-panel">
          <p className="eyebrow">项目约束</p>
          <h3>AI 每次写作都会读取</h3>
          <div className="rule-item"><span>语言</span><strong>中文</strong></div>
          <div className="rule-item"><span>引用</span><strong>APA 7th</strong></div>
          <div className="rule-item"><span>材料</span><strong>12 篇已验证原文</strong></div>
          <p className="rule-note">未找到来源的判断会被标记，不会伪装成文献结论。</p>
        </article>
      </section>
    </div>
  );
}

function ProjectOverview({
  confirmed,
  onConfirm,
  onEdit,
}: {
  confirmed: boolean;
  onConfirm: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="project-page page-frame">
      <section className="project-header">
        <div>
          <p className="eyebrow">项目概览 · 最近更新 5 分钟前</p>
          <h1>生成式 AI 英语阅读材料的文本复杂度研究</h1>
          <div className="project-tags">
            <span>课程论文</span><span>中文</span><span>8,000 字</span><span>APA 7th</span>
          </div>
        </div>
        <div className="project-actions">
          <button className="secondary-button">管理材料</button>
          <button className="primary-button" onClick={onEdit}>进入编辑器 →</button>
        </div>
      </section>

      <section className="diagnosis-banner">
        <div className="diagnosis-score">
          <strong>78</strong>
          <span>项目清晰度</span>
        </div>
        <div>
          <p className="eyebrow">AI 项目诊断</p>
          <h2>研究方向基本可行，需补充样本选择依据</h2>
          <p>研究问题、理论方向和方法已有基础；当前最大风险是“适合学习者”的判断标准尚未操作化。</p>
        </div>
        <button className={confirmed ? "confirm-button confirmed" : "confirm-button"} onClick={onConfirm}>
          {confirmed ? "✓ 诊断卡已确认" : "确认诊断卡"}
        </button>
      </section>

      <section className="diagnosis-grid">
        <article className="diagnosis-card core">
          <div className="card-kicker"><span>01</span> 研究核心</div>
          <h3>比较人工编写与 AI 生成材料的文本复杂度</h3>
          <dl>
            <div><dt>研究对象</dt><dd>中国大学 EFL 阅读材料</dd></div>
            <div><dt>核心问题</dt><dd>AI 生成文本是否匹配学习者水平？</dd></div>
            <div><dt>理论方向</dt><dd>文本复杂度、可读性与二语阅读</dd></div>
          </dl>
        </article>

        <article className="diagnosis-card method">
          <div className="card-kicker"><span>02</span> 方法建议</div>
          <h3>多维指标比较 + 质性例证</h3>
          <ul>
            <li>词汇复杂度：频率、词汇多样性</li>
            <li>句法复杂度：从句与依存距离</li>
            <li>篇章层面：衔接与连贯特征</li>
          </ul>
        </article>

        <article className="diagnosis-card risk">
          <div className="card-kicker"><span>03</span> 待补信息</div>
          <h3>有 3 项会影响研究可信度</h3>
          <ul className="risk-list">
            <li><b>高</b> 学习者水平的判定标准</li>
            <li><b>中</b> 人工文本与 AI 文本的配对方式</li>
            <li><b>中</b> AI 生成参数与版本记录</li>
          </ul>
        </article>
      </section>

      <section className="outline-card">
        <div className="panel-title">
          <div><p className="eyebrow">推荐论文结构</p><h3>7 个章节 · 目标 8,000 字</h3></div>
          <button>调整结构</button>
        </div>
        <div className="outline-flow">
          {[
            ["01", "引言", "900 字", "已开始"],
            ["02", "文献综述", "1,800 字", "缺证据"],
            ["03", "理论基础", "900 字", "未开始"],
            ["04", "研究方法", "1,200 字", "未开始"],
            ["05", "分析与讨论", "2,200 字", "未开始"],
            ["06", "结论", "800 字", "未开始"],
          ].map(([number, title, words, state]) => (
            <button key={number} onClick={onEdit}>
              <span>{number}</span><strong>{title}</strong><small>{words}</small><em>{state}</em>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function Editor({
  activeSection,
  editorText,
  wordCount,
  setActiveSection,
  setEditorText,
  onSave,
  onExport,
  onRunSkill,
}: {
  activeSection: string;
  editorText: string;
  wordCount: number;
  setActiveSection: (section: string) => void;
  setEditorText: (text: string) => void;
  onSave: () => void;
  onExport: () => void;
  onRunSkill: (name: string) => void;
}) {
  return (
    <div className="editor-shell">
      <aside className="outline-pane">
        <div className="pane-heading">
          <span>论文目录</span>
          <button aria-label="更多目录操作">•••</button>
        </div>
        <div className="outline-list">
          {outline.map(([section, state]) => (
            <button
              key={section}
              className={activeSection === section ? "active" : ""}
              onClick={() => setActiveSection(section)}
            >
              <i className={state} />
              <span>{section}</span>
              {state === "warning" && <em>!</em>}
            </button>
          ))}
        </div>
        <div className="material-block">
          <div className="pane-heading"><span>本节材料</span><button>＋</button></div>
          <div className="material-item"><b>PDF</b><span><strong>Crossley_2023.pdf</strong><small>证据 4 处</small></span></div>
          <div className="material-item"><b>DOC</b><span><strong>课程作业要求.docx</strong><small>约束 6 条</small></span></div>
        </div>
      </aside>

      <section className="writing-pane">
        <div className="editor-toolbar">
          <div className="format-group">
            <button aria-label="撤销">↶</button><button aria-label="重做">↷</button>
            <i />
            <button className="text-format">正文⌄</button>
            <button><b>B</b></button><button><i>I</i></button>
            <button aria-label="项目符号列表">≡</button>
          </div>
          <div className="save-group">
            <span>已自动保存</span>
            <button className="secondary-button small" onClick={onSave}>保存版本</button>
            <button className="primary-button small" onClick={onExport}>导出 Word</button>
          </div>
        </div>

        <article className="paper-sheet">
          <div className="section-meta">
            <span>第 1 章</span>
            <span>{wordCount} 字</span>
            <span>版本 V3</span>
          </div>
          <input className="chapter-title" value={activeSection} readOnly aria-label="章节标题" />
          <textarea
            className="manuscript"
            value={editorText}
            onChange={(event) => setEditorText(event.target.value)}
            aria-label="论文正文编辑区"
          />
          <button className="inline-evidence" onClick={() => onRunSkill("证据检查")}>
            <span>引 1</span>
            这段关于“适合学习者”的判断仍缺少直接证据
            <b>查看建议 →</b>
          </button>
        </article>
      </section>

      <aside className="assistant-pane">
        <div className="assistant-heading">
          <div className="ai-badge">AI</div>
          <div><strong>章节助手</strong><small>读取当前项目上下文</small></div>
          <button>•••</button>
        </div>

        <div className="context-strip">
          <span><i /> 已读取</span>
          <strong>诊断卡 + 12 篇文献 + 2 条要求</strong>
        </div>

        <div className="assistant-section">
          <p>选择一个 Skill</p>
          <div className="skill-list">
            {skillList.map(([mark, name, description]) => (
              <button key={name} onClick={() => onRunSkill(name)}>
                <span>{mark}</span>
                <div><strong>{name}</strong><small>{description}</small></div>
                <em>→</em>
              </button>
            ))}
          </div>
        </div>

        <div className="evidence-card">
          <div className="evidence-title"><span>证据提醒</span><strong>1 条</strong></div>
          <blockquote>
            “语言流畅”并不自动说明材料适合目标学习者。
          </blockquote>
          <p>当前仅为你的研究判断，尚未绑定可核对的原文。</p>
          <button onClick={() => onRunSkill("引用建议")}>从已上传文献中查找</button>
        </div>

        <div className="prompt-box">
          <textarea defaultValue="请结合已上传文献，帮我补充这一段的研究缺口。" aria-label="给章节助手的指令" />
          <div>
            <button aria-label="添加材料">＋</button>
            <span>ChatGPT · 主模型</span>
            <button className="send-button" onClick={() => onRunSkill("自定义任务")}>↑</button>
          </div>
        </div>
      </aside>
    </div>
  );
}
