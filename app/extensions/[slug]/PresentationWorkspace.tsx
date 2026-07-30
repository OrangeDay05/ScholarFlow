"use client";

import { useMemo, useState } from "react";
import { M4_PRESENTATION_SCENES, type M4PresentationScene } from "@/app/lib/m4-presentation-contracts";
import styles from "./PresentationWorkspace.module.css";

const sceneLabels: Record<M4PresentationScene, string> = {
  COURSE_PRESENTATION: "课程论文汇报", CLASSROOM_PRESENTATION: "课堂展示", LITERATURE_REVIEW_PRESENTATION: "文献汇报", GROUP_PRESENTATION: "小组汇报", FINAL_COURSE_PRESENTATION: "期末展示", RESEARCH_PROPOSAL: "研究计划", PROPOSAL_DEFENSE: "开题答辩", MIDTERM_DEFENSE: "中期答辩", THESIS_DEFENSE: "毕业答辩", LAB_MEETING: "组会", CONFERENCE_PRESENTATION: "会议汇报", PAPER_SHARING: "论文分享", SUBMISSION_PRESENTATION: "投稿或项目汇报",
};
type ExportResult = { id: string; fileSize: number; slideCount: number; status: string; artifactToolVersion: string };
const qaPreparation = [{ question: "当前是否已经有真实研究结果？", answer: "若项目尚无真实结果，本版只展示计划分析和待验证假设。" }, { question: "这些判断能否追溯到来源？", answer: "每页来源绑定保存在 PresentationVersion 和 Slide 中，外部来源同时写入讲者备注的 [Sources] 区块。" }];

export function PresentationWorkspace({ projectId }: { projectId: string }) {
  const [scene, setScene] = useState<M4PresentationScene>("COURSE_PRESENTATION");
  const [title, setTitle] = useState("数字平台中的知识协作机制研究");
  const [audience, setAudience] = useState("课程教师与同学");
  const [duration, setDuration] = useState(15);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("配置场景后创建不可变 PPT 版本；没有真实结果时只生成研究计划与待验证内容。");
  const [result, setResult] = useState<ExportResult | null>(null);
  const slides = useMemo(() => buildSlides(title, scene), [title, scene]);

  async function generate() {
    setBusy(true); setResult(null); setMessage("正在创建 PresentationProject、页面和来源绑定……");
    try {
      const workspace = await post(`/api/m4/projects/${projectId}/presentations`, { action: "create", title, scene, audience, duration_minutes: duration, readiness_status: "READY_WITH_WARNINGS", truth_status: "PARTIALLY_VERIFIED", source_material_snapshot: [] }) as { versions: Array<{ id: string; presentationProjectId: string; versionNumber: number }> };
      const baseVersion = workspace.versions.reduce((latest, item) => item.versionNumber > latest.versionNumber ? item : latest);
      const versioned = await post(`/api/m4/projects/${projectId}/presentations`, { action: "version", presentation_project_id: baseVersion.presentationProjectId, source_presentation_version_id: baseVersion.id, material_snapshot: [], narrative: { subtitle: sceneLabels[scene], qaPreparation } }) as { versions: Array<{ id: string; presentationProjectId: string; versionNumber: number }> };
      const version = versioned.versions.reduce((latest, item) => item.versionNumber > latest.versionNumber ? item : latest);
      for (const [index, slide] of slides.entries()) await post(`/api/m4/projects/${projectId}/presentations`, { action: "slide", presentation_version_id: version.id, position: index + 1, title: slide.title, content: { body: slide.body, takeaway: slide.takeaway }, speaker_notes: slide.notes, source_bindings: ["用户在当前 PPT 工作台确认的内容"], asset_bindings: [], verification_status: "VERIFIED_WITH_WARNINGS" });
      setMessage("页面已保存，正在由独立 PPTX Runner 生成并校验 OOXML……");
      const exported = await post(`/api/m9/projects/${projectId}/presentations`, { action: "export", presentation_version_id: version.id }) as ExportResult;
      setResult(exported); setMessage(`真实 PPTX 已生成：${exported.slideCount} 页，${exported.fileSize} bytes。下载打开后可回填打开验证状态。`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "PPTX 生成失败。"); }
    finally { setBusy(false); }
  }

  async function confirmOpened() { if (!result) return; try { await post(`/api/m9/projects/${projectId}/presentations`, { action: "mark_open_verified", export_id: result.id }); setResult({ ...result, status: "OPEN_VERIFIED" }); setMessage("已记录用户打开验证；该状态与生成成功分开保存。"); } catch (error) { setMessage(error instanceof Error ? error.message : "打开验证记录失败。"); } }

  return <div className={styles.workspace}><aside><span className={styles.kicker}>M9 · PRESENTATION</span><h2>科研汇报工作台</h2><label>汇报场景<select value={scene} onChange={(event) => setScene(event.target.value as M4PresentationScene)}>{M4_PRESENTATION_SCENES.map((item) => <option key={item} value={item}>{sceneLabels[item]}</option>)}</select></label><label>标题<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>听众<input value={audience} onChange={(event) => setAudience(event.target.value)} /></label><label>目标时长<input max={180} min={3} type="number" value={duration} onChange={(event) => setDuration(Number(event.target.value))} /></label><button disabled={busy} onClick={generate} type="button">{busy ? "正在生成真实 PPTX…" : "创建新版本并生成 PPTX"}</button><p>{message}</p>{result ? <><a download href={`/api/m9/projects/${projectId}/presentations/exports/${result.id}`}>下载 PPTX</a><button disabled={result.status === "OPEN_VERIFIED"} onClick={confirmOpened} type="button">{result.status === "OPEN_VERIFIED" ? "已记录打开验证" : "我已打开并验证"}</button></> : null}<small>使用 Scholar Green 视觉体系；PPT 可用性由内容与来源决定，不按学历限制。</small></aside><main><header><span>叙事与页面</span><strong>{slides.length} 页 · {duration} 分钟</strong></header>{slides.map((slide, index) => <article key={`${slide.title}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{slide.title}</h3>{slide.body.map((line) => <p key={line}>{line}</p>)}<small>{slide.takeaway}</small></div></article>)}<section><h3>问答准备</h3>{qaPreparation.map((item) => <article key={item.question}><span>Q</span><div><h3>{item.question}</h3><p>{item.answer}</p></div></article>)}</section></main></div>;
}

function buildSlides(title: string, scene: M4PresentationScene) { const plan = scene === "LITERATURE_REVIEW_PRESENTATION" || scene === "PAPER_SHARING"; return [{ title, body: [sceneLabels[scene], "内容来自当前确认版本与材料快照"], takeaway: "先说明问题，再说明证据。", notes: "介绍汇报目的和范围。" }, { title: plan ? "文献共同回答了什么" : "研究问题决定汇报的主线", body: ["明确研究对象与边界", "区分已知事实、材料归纳和待确认内容"], takeaway: "不完整信息不会被包装成确定结论。", notes: "说明研究问题和当前证据边界。" }, { title: plan ? "证据之间既有共识，也有分歧" : "材料支持哪些判断", body: ["来源绑定到项目版本或材料快照", "引用、图件与结论保留可追溯关系"], takeaway: "证据强度决定表达边界。", notes: "展示主要证据与来源。" }, { title: plan ? "研究缺口来自证据断点" : "方法与分析仍需服从真实材料", body: ["没有真实结果时，只展示计划分析或预期结果", "不会生成伪造统计图或结果"], takeaway: "待验证内容必须明确标注。", notes: "解释方法、限制与尚缺材料。" }, { title: "结论与下一步", body: ["总结当前可以确认的内容", "列出最值得继续验证的 1—3 个动作"], takeaway: "让听众知道现在能相信什么、下一步做什么。", notes: "收束主线并进入问答。" }]; }
async function post(url: string, body: unknown) { const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); const payload = await response.json() as { data?: unknown; error?: { message?: string } }; if (!response.ok || !payload.data) throw new Error(payload.error?.message || "请求失败。"); return payload.data; }
