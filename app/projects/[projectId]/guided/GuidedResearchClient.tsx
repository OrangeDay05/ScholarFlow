"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/app/components/AppShell";
import styles from "./guided.module.css";

type Message = { id: string; role: "USER" | "AGENT"; content: string };
type Material = { materialId: string; originalFilename: string; materialStatus: string };
type Proposal = {
  title: string; subtitle: string; proposalAbstract: string; keywords: string;
  researchGoal: string; researchQuestions: string; framework: string; data: string;
  method: string; contribution: string; risks: string; limitations: string;
  outline: string[];
};

const emptyProposal: Proposal = {
  title: "", subtitle: "", proposalAbstract: "", keywords: "", researchGoal: "",
  researchQuestions: "", framework: "", data: "", method: "", contribution: "",
  risks: "", limitations: "", outline: [],
};

export function GuidedResearchClient({ projectId, projectTitle }: { projectId: string; projectTitle: string }) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("CONTEXT_PREPARING");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [credentialReady, setCredentialReady] = useState(false);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [uploading, setUploading] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [proposalMessageId, setProposalMessageId] = useState<string | null>(null);
  const [proposalOpen, setProposalOpen] = useState(false);
  const [proposalCopied, setProposalCopied] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);
  const lastInputRef = useRef("");

  useEffect(() => { void hydrate(); }, [projectId]);
  useEffect(() => {
    if (!busy) { setElapsedSeconds(0); return; }
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1_000)), 1_000);
    return () => window.clearInterval(timer);
  }, [busy]);

  async function hydrate() {
    setStatus("CONTEXT_PREPARING");
    try {
      const [conversation, models, materialData] = await Promise.all([
        api<any>(`/api/m5/projects/${projectId}/conversations`),
        api<any>(`/api/m5/projects/${projectId}/model-orchestration`),
        api<any[]>(`/api/m5/projects/${projectId}/materials`),
      ]);
      const storedMessages = (conversation.messages ?? []) as Message[];
      const latestCandidate = [...storedMessages].reverse().map((item) => ({ item, proposal: parseProposalCandidate(item) })).find((entry) => entry.proposal);
      setSessionId(conversation.selectedSession?.id ?? null);
      setMessages(storedMessages);
      if (latestCandidate?.proposal) { setProposal(latestCandidate.proposal); setProposalMessageId(latestCandidate.item.id); }
      setCredentialReady(Boolean(models.platformCredentialConfigured));
      setMaterials(materialData.map((item) => ({ materialId: item.materialId, originalFilename: item.originalFilename, materialStatus: item.materialStatus })));
      setStatus(models.platformCredentialConfigured ? "COMPLETED" : "CREDENTIAL_REQUIRED");
    } catch (caught) { setError(message(caught)); setStatus("CONTEXT_FAILED"); }
  }

  async function ensureSession() {
    if (sessionId) return sessionId;
    const created = await api<any>(`/api/m5/projects/${projectId}/conversations`, {
      method: "POST",
      body: JSON.stringify({ action: "create_session", title: "AI 引导梳理", activeProductSkill: "project_diagnosis_outline", idempotencyKey: `guided-session:${crypto.randomUUID()}` }),
    });
    setSessionId(created.session.id);
    return created.session.id as string;
  }

  async function copyMessage(item: Message) {
    await navigator.clipboard.writeText(item.content);
    setCopiedMessageId(item.id);
    window.setTimeout(() => setCopiedMessageId((current) => current === item.id ? null : current), 1600);
  }

  async function copyProposal() {
    if (!proposal) return;
    await navigator.clipboard.writeText(proposalToMarkdown(proposal));
    setProposalCopied(true);
    window.setTimeout(() => setProposalCopied(false), 1600);
  }

  async function send(content = draft.trim()) {
    if (!content || busy) return null;
    if (!credentialReady) { setStatus("CREDENTIAL_REQUIRED"); setError("服务器尚未配置 DeepSeek 平台凭据。"); return null; }
    lastInputRef.current = content;
    setBusy(true); setError(""); setDraft("");
    const optimistic: Message = { id: `local-${crypto.randomUUID()}`, role: "USER", content };
    setMessages((current) => [...current, optimistic]);
    const controller = new AbortController(); controllerRef.current = controller;
    try {
      const activeSession = await ensureSession();
      setStatus(materials.length ? "RETRIEVING_MATERIALS" : "CONTEXT_PREPARING");
      await tick(); setStatus("WAITING_PROVIDER");
      const result = await api<any>(`/api/m5/projects/${projectId}/conversations/respond`, {
        method: "POST", signal: controller.signal,
        body: JSON.stringify({ sessionId: activeSession, clientMessageId: `user-${crypto.randomUUID()}`, clientAgentMessageId: `agent-${crypto.randomUUID()}`, content, authorizedMaterialIds: materials.map((item) => item.materialId) }),
      });
      setStatus("STREAMING");
      setMessages((current) => [...current, result.message]);
      await tick(); setStatus("COMPLETED");
      return result.message as Message;
    } catch (caught) {
      if (controller.signal.aborted) { setStatus("CANCELLED"); setError("本次生成已取消。"); }
      else { const detail = message(caught); setError(detail); setStatus(detail.includes("凭据") ? "CREDENTIAL_REQUIRED" : detail.includes("timeout") || detail.includes("超时") ? "PROVIDER_TIMEOUT" : "PROVIDER_ERROR"); }
      return null;
    } finally { controllerRef.current = null; setBusy(false); }
  }

  async function generateProposal(force = false) {
    if (!force && proposal && proposalMessageId && !hasDiscussionAfterCandidate(messages, proposalMessageId)) { setProposalOpen(true); return; }
    const prompt = `请根据当前项目对话和已授权材料，生成一个真实、可编辑的 Research Proposal Candidate。没有真实结果时只能写 Proposal Abstract，不得写“研究发现”或“结果表明”。只返回 JSON，不要代码围栏，字段为：title, subtitle, proposalAbstract, keywords, researchGoal, researchQuestions, framework, data, method, contribution, risks, limitations, outline（5到8个章节标题数组）。信息不足处写“待确认”。`;
    const response = await send(prompt);
    if (!response) return;
    try { setProposal(normalizeProposal(JSON.parse(extractJson(response.content)))); setProposalMessageId(response.id); setProposalOpen(true); }
    catch { setError("DeepSeek 已回复，但方案不是有效结构化 JSON。可以重试生成或继续聊天补充信息。"); setStatus("PROVIDER_ERROR"); }
  }

  async function upload(file: File) {
    setUploading(true); setError("");
    try {
      const form = new FormData(); form.set("file", file); form.set("kind", inferKind(file.name));
      const stored = await api<any>(`/api/m5/projects/${projectId}/materials`, { method: "POST", headers: { "Idempotency-Key": `guided-upload:${crypto.randomUUID()}` }, body: form });
      setStatus("RETRIEVING_MATERIALS");
      await api<any>(`/api/m5/projects/${projectId}/materials/${stored.snapshot.materialId}/parse`, { method: "POST", headers: { "Idempotency-Key": `guided-parse:${crypto.randomUUID()}` } });
      await hydrate();
    } catch (caught) { setError(message(caught)); setStatus("CONTEXT_FAILED"); }
    finally { setUploading(false); }
  }

  async function confirmProposal() {
    if (!proposal || busy) return;
    setBusy(true); setError("");
    try {
      const started = await api<any>(`/api/m4/projects/${projectId}/diagnosis`, { method: "POST", body: JSON.stringify({ action: "start", mode: "guided", depth: "standard" }) });
      const diagnosisSessionId = started.session.id;
      const fields = proposalFields(proposal, materials);
      await api(`/api/m4/projects/${projectId}/diagnosis`, { method: "POST", body: JSON.stringify({ action: "save_fields", session_id: diagnosisSessionId, fields }) });
      await api(`/api/m4/projects/${projectId}/diagnosis`, { method: "POST", body: JSON.stringify({ action: "finish", session_id: diagnosisSessionId, stop_reason: "research_proposal_candidate_ready" }) });
      await api(`/api/m4/projects/${projectId}/diagnosis`, { method: "POST", body: JSON.stringify({ action: "confirm", session_id: diagnosisSessionId }) });
      await api(`/api/m3/projects/${projectId}/outline`, { method: "POST", body: JSON.stringify({ confirm: false, sections: proposal.outline.map((title, index) => ({ slug: slug(title, index), title, position: index + 1, status: "not_started", wordCount: 0 })) }) });
      router.push(`/projects/${projectId}/diagnosis`);
    } catch (caught) { setError(message(caught)); setBusy(false); }
  }

  return (
    <AppShell compact eyebrow="AI 引导梳理" title="AI 梳理中" description={`当前真实项目：${projectTitle}`} action={<Link className={styles.backAction} href="/projects">← 项目列表</Link>}>
      <div className={styles.layout}>
        <main className={styles.agent}>
          <header><div><span>研究诊断对话</span><h2>和 AI 一起形成研究方案</h2></div><strong data-status={status}>{status}</strong></header>
          <div className={styles.messages} aria-live="polite">
            {messages.some((item) => !isProposalPrompt(item.content)) ? messages.filter((item) => item.role !== "USER" || !isProposalPrompt(item.content)).map((item) => { const candidate = parseProposalCandidate(item); return candidate ? <article className={styles.candidateMessage} data-role="AGENT" key={item.id}><b>AI · 研究方案候选</b><strong>{candidate.title || "待确认题目"}</strong><p>{candidate.proposalAbstract || "候选方案已生成，可打开查看并继续编辑。"}</p><button onClick={() => { setProposal(candidate); setProposalMessageId(item.id); setProposalOpen(true); }} type="button">打开候选卡</button></article> : <article data-role={item.role} key={item.id}><b>{item.role === "USER" ? "你" : "AI"}</b><MarkdownMessage content={item.content} />{item.role === "AGENT" ? <div className={styles.messageActions}><button aria-label="复制这条 AI 回复" onClick={() => void copyMessage(item)} type="button">{copiedMessageId === item.id ? "已复制" : "复制"}</button></div> : null}</article>; }) : <div className={styles.welcome}><strong>可以从任何真实想法开始</strong><p>告诉我你想研究什么、已有何种材料，或者使用“引导追问”帮助你找到可行方向。</p></div>}
            {busy ? <article className={styles.thinking} data-role="AGENT"><b>AI</b><p>{statusCopy(status)}</p><span><i aria-hidden="true" />运行轨迹：{thinkingStage(status, elapsedSeconds)} · 已等待 {formatElapsed(elapsedSeconds)}</span><small>没有固定总时长；DeepSeek 持续返回活动时，系统会继续等待。</small></article> : null}
          </div>
          {error ? <div className={styles.error} role="alert"><div><strong>本次回复暂未完成</strong><span>{error}</span></div><button onClick={() => void (isProposalPrompt(lastInputRef.current) ? generateProposal(true) : send(lastInputRef.current))} type="button">重新生成回复</button></div> : null}
          <div className={styles.composer}>
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="描述你的研究想法，或回答 AI 的问题…" />
            <div className={styles.composerFooter}>
              <div className={styles.sendActions}><button disabled={busy || !draft.trim()} onClick={() => void send()} type="button">发送</button>{busy ? <button onClick={() => controllerRef.current?.abort()} type="button">停止生成</button> : null}<button disabled={busy} onClick={() => setDraft("请只追问真正会改变研究方案的问题；如果信息已足够，请主动提示可以生成方案。")} type="button">引导追问</button></div>
              <div className={styles.proposalActions}><button disabled={busy} onClick={() => void generateProposal()} type="button">生成研究方案</button><button disabled={busy} onClick={() => setDraft("请再深入问几个会真正影响研究设计的问题。")} type="button">继续深入讨论</button></div>
            </div>
          </div>
        </main>
        <aside className={styles.context}>
          <section className={styles.skillCard}><span>当前产品 Skill</span><strong>研究诊断与提纲</strong><p>由对话 Agent 帮你澄清研究方向、读取已授权材料并生成方案候选；确认前不会写入正式诊断卡。</p></section>
          <section><span>本轮上下文</span><strong>当前 Project</strong><p>{projectTitle}</p><strong>Conversation</strong><p>{messages.length} 条持久化消息</p><strong>Materials</strong><p>{materials.length ? `${materials.length} 份已保存材料` : "本轮未发送材料"}</p></section>
          <section><span>聊天上传材料</span><label className={styles.upload}>{uploading ? "正在保存并解析…" : "选择文件并进入项目材料"}<input disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} type="file" /></label>{materials.map((item) => <p key={item.materialId}>{item.originalFilename} · {item.materialStatus}</p>)}</section>
        </aside>
      </div>
      {proposal && proposalOpen ? <div className={styles.proposalOverlay} onMouseDown={(event) => { if (event.target === event.currentTarget) setProposalOpen(false); }}><section aria-labelledby="proposal-candidate-title" aria-modal="true" className={styles.proposal} role="dialog"><header><div><span>RESEARCH PROPOSAL CANDIDATE</span><h2 id="proposal-candidate-title">研究方案候选</h2></div><div className={styles.proposalHeaderActions}><strong>尚未成为正式事实</strong><button aria-label="关闭并继续讨论" onClick={() => setProposalOpen(false)} type="button">×</button></div></header><ProposalEditor proposal={proposal} onChange={setProposal} /><div className={styles.confirm}><button disabled={busy} onClick={confirmProposal} type="button">确认此方案并生成项目诊断卡</button><button disabled={busy} onClick={() => void generateProposal(true)} type="button">重新生成</button><button onClick={() => void copyProposal()} type="button">{proposalCopied ? "已复制候选卡" : "复制候选卡"}</button><button onClick={() => setProposalOpen(false)} type="button">关闭并继续讨论</button></div></section></div> : null}
    </AppShell>
  );
}

function ProposalEditor({ proposal, onChange }: { proposal: Proposal; onChange: (value: Proposal) => void }) {
  const fields: Array<[keyof Proposal, string]> = [["title","题目"],["subtitle","副标题"],["proposalAbstract","Proposal Abstract"],["keywords","关键词"],["researchGoal","研究目标"],["researchQuestions","研究问题"],["framework","理论框架"],["data","数据 / 研究对象"],["method","方法"],["contribution","贡献"],["risks","风险"],["limitations","局限"]];
  return <div className={styles.proposalGrid}>{fields.map(([key,label]) => <label key={key}><span>{label}</span>{key === "title" || key === "subtitle" || key === "keywords" ? <input value={String(proposal[key])} onChange={(e) => onChange({ ...proposal, [key]: e.target.value })} /> : <textarea value={String(proposal[key])} onChange={(e) => onChange({ ...proposal, [key]: e.target.value })} />}</label>)}<label><span>推荐目录</span><textarea value={proposal.outline.join("\n")} onChange={(e) => onChange({ ...proposal, outline: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} /></label></div>;
}

function MarkdownMessage({ content }: { content: string }) {
  const lines = content.split(/\r?\n/u);
  const blocks: ReactNode[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index].trim();
    const next = lines[index + 1]?.trim() ?? "";
    if (text.includes("|") && /^\|?\s*:?-{3,}/u.test(next)) {
      const rows = [text];
      index += 2;
      while (index < lines.length && lines[index].includes("|")) {
        rows.push(lines[index].trim());
        index += 1;
      }
      index -= 1;
      blocks.push(<table key={`table-${index}`}><thead><tr>{tableCells(rows[0]).map((cell, cellIndex) => <th key={cellIndex}>{inlineMarkdown(cell)}</th>)}</tr></thead><tbody>{rows.slice(1).map((row, rowIndex) => <tr key={rowIndex}>{tableCells(row).map((cell, cellIndex) => <td key={cellIndex}>{inlineMarkdown(cell)}</td>)}</tr>)}</tbody></table>);
      continue;
    }
    if (!text) blocks.push(<span className={styles.markdownSpace} key={index} />);
    else if (/^-{3,}$/u.test(text)) blocks.push(<hr key={index} />);
    else {
      const heading = text.match(/^(#{1,3})\s+(.+)$/u);
      const list = text.match(/^(?:(\d+)\.|[-*])\s+(.+)$/u);
      if (heading) blocks.push(<strong className={styles.markdownHeading} key={index}>{inlineMarkdown(heading[2])}</strong>);
      else if (list) blocks.push(<p className={styles.markdownList} key={index}><span>{list[1] ? `${list[1]}.` : "•"}</span><span>{inlineMarkdown(list[2])}</span></p>);
      else blocks.push(<p key={index}>{inlineMarkdown(text)}</p>);
    }
  }
  return <div className={styles.markdown}>{blocks}</div>;
}

function tableCells(row: string) { return row.replace(/^\||\|$/gu, "").split("|").map((cell) => cell.trim()); }

function inlineMarkdown(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/gu).filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}

async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> { const response = await fetch(url, { credentials: "same-origin", ...init, headers: init?.body instanceof FormData ? init.headers : init?.body ? { "content-type": "application/json", ...init.headers } : init?.headers }); const payload = await response.json(); if (!response.ok || !payload?.ok) throw new Error(payload?.error?.message ?? "请求失败。"); return payload.data as T; }
function message(value: unknown) { return value instanceof Error ? value.message : "操作失败。"; }
function isProposalPrompt(content: string) { return content.startsWith("请根据当前项目对话和已授权材料，生成一个真实、可编辑的 Research Proposal Candidate。"); }
function parseProposalCandidate(item: Message): Proposal | null { if (item.role !== "AGENT" || !item.content.includes('"proposalAbstract"') || !item.content.includes('"outline"')) return null; try { return normalizeProposal(JSON.parse(extractJson(item.content))); } catch { return null; } }
function hasDiscussionAfterCandidate(messages: Message[], candidateId: string) { const index = messages.findIndex((item) => item.id === candidateId); return index >= 0 && messages.slice(index + 1).some((item) => item.role === "USER" && !isProposalPrompt(item.content)); }
function proposalToMarkdown(value: Proposal) {
  const sections: Array<[string, string]> = [
    ["题目", value.title], ["副标题", value.subtitle], ["Proposal Abstract", value.proposalAbstract],
    ["关键词", value.keywords], ["研究目标", value.researchGoal], ["研究问题", value.researchQuestions],
    ["理论框架", value.framework], ["数据 / 研究对象", value.data], ["方法", value.method],
    ["贡献", value.contribution], ["风险", value.risks], ["局限", value.limitations],
    ["推荐目录", value.outline.join("\n")],
  ];
  return `# 研究方案候选\n\n> 尚未成为正式项目事实，需经用户确认后才能写入项目诊断卡。\n\n${sections.map(([label, content]) => `## ${label}\n\n${content || "待确认"}`).join("\n\n")}`;
}
function formatElapsed(seconds: number) { return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`; }
function thinkingStage(status: string, seconds: number) { if (status === "RETRIEVING_MATERIALS") return "正在读取授权材料"; if (seconds < 8) return "已连接模型，准备上下文"; if (seconds < 45) return "模型正在分析问题"; return "模型正在进行较长推理"; }
function tick() { return new Promise((resolve) => setTimeout(resolve, 120)); }
function extractJson(text: string) { const start = text.indexOf("{"); const end = text.lastIndexOf("}"); if (start < 0 || end <= start) throw new Error("missing json"); return text.slice(start, end + 1); }
function normalizeProposal(value: any): Proposal {
  const text = (key: keyof Omit<Proposal, "outline">) => Array.isArray(value?.[key])
    ? value[key].map(String).filter(Boolean).join("\n")
    : typeof value?.[key] === "string" ? value[key] : "";
  return {
    title: text("title"), subtitle: text("subtitle"), proposalAbstract: text("proposalAbstract"),
    keywords: text("keywords"), researchGoal: text("researchGoal"), researchQuestions: text("researchQuestions"),
    framework: text("framework"), data: text("data"), method: text("method"), contribution: text("contribution"),
    risks: text("risks"), limitations: text("limitations"),
    outline: Array.isArray(value?.outline) ? value.outline.map(String).filter(Boolean).slice(0, 10) : [],
  };
}
function inferKind(name: string) { const ext = name.split(".").pop()?.toLowerCase(); if (ext === "docx") return "manuscript"; if (["pdf","ris","bib","bibtex"].includes(ext ?? "")) return "literature"; if (["csv","xlsx"].includes(ext ?? "")) return "data"; if (["png","jpg","jpeg"].includes(ext ?? "")) return "image"; return "note"; }
function statusCopy(status: string) { return ({ CONTEXT_PREPARING: "正在准备项目上下文…", RETRIEVING_MATERIALS: "正在读取相关材料…", WAITING_PROVIDER: "正在调用 DeepSeek…", STREAMING: "正在生成回答…" } as Record<string,string>)[status] ?? "正在处理…"; }
function slug(title: string, index: number) { const ascii = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); return ascii || `section-${index + 1}`; }
function proposalFields(value: Proposal, materials: Material[]) { const map: Array<[string,string,string]> = [["formal_title","正式题目",value.title],["project_goal","研究目标",value.researchGoal],["research_question","研究问题",value.researchQuestions],["theoretical_framework","理论框架",value.framework],["data_source","数据与研究对象",value.data],["research_method","研究方法",value.method],["proposal_abstract","Proposal Abstract",value.proposalAbstract],["keywords","关键词",value.keywords],["contribution","研究贡献",value.contribution],["risks","风险",value.risks],["limitations","局限",value.limitations]]; return map.map(([field,label,text]) => ({ field,label,value:text || "待确认",status:"AI_INFERRED",source_type:"AI_RECOMMENDED",source_material_ids:materials.map((item) => item.materialId),source_locations:[],confidence:"MEDIUM",requires_confirmation:true,rationale:"由 Conversation Agent 根据当前项目对话和用户授权材料生成；用户确认研究方案后进入正式诊断卡。" })); }
