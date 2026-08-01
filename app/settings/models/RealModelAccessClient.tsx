"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/app/components/AppShell";
import styles from "./models.module.css";

const roles = [
  ["CONVERSATION_AGENT", "对话 Agent"],
  ["GENERATOR", "生成 Agent"],
  ["REVIEWER", "审阅 Agent"],
  ["VERIFIER", "验证 Agent"],
  ["REVISER", "修订 Agent"],
  ["AGGREGATOR", "汇总 Agent"],
] as const;

type Project = { id: string; title: string };
type Config = {
  id: string;
  agent_role: string;
  model_id: string;
  thinking_mode: "DISABLED" | "ENABLED";
  reasoning_effort: "HIGH" | "MAX" | null;
  per_turn_budget: number;
  timeout_ms: number;
};
type Capability = { model_id: string; model_key: string; lifecycle_status: string };
type Workspace = {
  configs: Config[];
  capabilities: Capability[];
  platformCredentialConfigured: boolean;
};

export default function RealModelAccessClient() {
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [role, setRole] = useState<(typeof roles)[number][0]>("CONVERSATION_AGENT");
  const [modelId, setModelId] = useState("");
  const [thinkingMode, setThinkingMode] = useState<"DISABLED" | "ENABLED">("DISABLED");
  const [reasoningEffort, setReasoningEffort] = useState<"HIGH" | "MAX">("HIGH");
  const [budget, setBudget] = useState(100);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("正在读取项目……");

  useEffect(() => { void loadProjects(); }, []);
  useEffect(() => { if (projectId) void loadWorkspace(projectId); }, [projectId]);

  const activeModels = useMemo(() => {
    const byKey = new Map<string, Capability>();
    for (const item of workspace?.capabilities ?? []) {
      if (item.lifecycle_status === "ACTIVE") byKey.set(item.model_key, item);
    }
    return [...byKey.values()];
  }, [workspace]);
  const effectiveModelId = modelId || activeModels[0]?.model_key || "";

  async function loadProjects() {
    try {
      const response = await fetch("/api/m4/projects", { credentials: "same-origin" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message ?? "无法读取项目。");
      const next = (Array.isArray(payload.data) ? payload.data : []).map((item: Record<string, unknown>) => ({ id: String(item.id), title: String(item.title ?? "未命名项目") }));
      setProjects(next);
      const requestedProjectId = searchParams.get("project_id") ?? "";
      const selected = next.some((project: Project) => project.id === requestedProjectId) ? requestedProjectId : "";
      setProjectId(selected);
      setNotice(next.length ? selected ? "已载入链接中明确指定的项目。" : "请选择项目；系统不会默认使用第一个项目。" : "请先创建项目，再配置模型角色。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "无法读取项目。");
    }
  }

  async function loadWorkspace(nextProjectId: string) {
    try {
      const response = await fetch(`/api/m5/projects/${encodeURIComponent(nextProjectId)}/model-orchestration`, { credentials: "same-origin" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message ?? "无法读取模型配置。");
      setWorkspace(payload.data);
      setNotice(payload.data.platformCredentialConfigured ? "平台凭据已由服务器安全配置；本页不会显示或接收密钥。" : "服务器尚未配置平台凭据。可以保存角色配置，但真实任务会保持阻断。");
    } catch (error) {
      setWorkspace(null);
      setNotice(error instanceof Error ? error.message : "无法读取模型配置。");
    }
  }

  async function saveRole() {
    if (!projectId || !effectiveModelId || !confirmed || busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/m5/projects/${encodeURIComponent(projectId)}/model-orchestration`, {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "save_role_config",
          agent_role: role,
          model_id: effectiveModelId,
          credential_type: "PLATFORM_CREDENTIAL",
          credential_reference: "env://DEEPSEEK_API_KEY",
          thinking_mode: thinkingMode,
          reasoning_effort: thinkingMode === "ENABLED" ? reasoningEffort : null,
          max_output_tokens: 4096,
          timeout_ms: 60_000,
          per_turn_budget: budget,
          tools_allowed: false,
          response_format: "TEXT",
          streaming: false,
          fallback_config_id: null,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message ?? "角色配置保存失败。");
      setConfirmed(false);
      await loadWorkspace(projectId);
      setNotice(`${roles.find((item) => item[0] === role)?.[1]} 已保存；正式任务仍需再次确认执行范围。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "角色配置保存失败。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      eyebrow="MODEL ORCHESTRATION"
      title="模型与 Agent 配置"
      description="模型、思考模式、推理强度和预算分别记录；服务器凭据不会进入浏览器。"
      action={projectId ? <Link className={styles.backLink} href={`/projects/${projectId}/editor?section=introduction`}>返回当前项目</Link> : null}
    >
      <div className={styles.mockNotice} role="status"><strong>真实配置</strong><span>{notice}</span></div>
      <section className={styles.configurationGrid}>
        <div className={styles.keyPanel}>
          <header><div><span>Project scope</span><h2>项目级 Agent 角色</h2></div><strong>{workspace?.platformCredentialConfigured ? "平台凭据可用" : "平台凭据未配置"}</strong></header>
          <div className={styles.keyForm}>
            <label><span>项目</span><select value={projectId} onChange={(event) => { setProjectId(event.target.value); setConfirmed(false); }}><option value="">请选择当前项目</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>
            <label><span>Agent Role</span><select value={role} onChange={(event) => { setRole(event.target.value as typeof role); setConfirmed(false); }}>{roles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label><span>Model</span><select value={effectiveModelId} onChange={(event) => { setModelId(event.target.value); setConfirmed(false); }}><option value="">请选择</option>{activeModels.map((model) => <option key={model.model_key} value={model.model_key}>{model.model_key}</option>)}</select></label>
            <label><span>Thinking Mode</span><select value={thinkingMode} onChange={(event) => { setThinkingMode(event.target.value as typeof thinkingMode); setConfirmed(false); }}><option value="DISABLED">关闭</option><option value="ENABLED">开启</option></select></label>
            <label><span>Reasoning Effort</span><select disabled={thinkingMode === "DISABLED"} value={reasoningEffort} onChange={(event) => { setReasoningEffort(event.target.value as typeof reasoningEffort); setConfirmed(false); }}><option value="HIGH">HIGH</option><option value="MAX">MAX</option></select></label>
            <label><span>单轮预算上限</span><input min={1} max={100000} onChange={(event) => { setBudget(Number(event.target.value)); setConfirmed(false); }} type="number" value={budget} /></label>
          </div>
          <label className={styles.pilotConfirm}><input checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" />我确认当前项目、角色、模型、思考模式与预算。</label>
          <div className={styles.keyActions}><button disabled={!confirmed || !projectId || !effectiveModelId || busy} onClick={saveRole} type="button">保存角色配置</button></div>
        </div>
        <aside className={styles.securityPanel}>
          <header><span>Security boundary</span><h2>凭据与执行边界</h2></header>
          <ul><li>本页不接收、不显示真实 API Key。</li><li>平台凭据只通过服务器 Secret 引用。</li><li>保存配置不会调用模型。</li><li>每次正式任务仍需用户确认材料与调用范围。</li><li>不会静默切换模型、提高预算或开启思考。</li></ul>
        </aside>
      </section>
      <section className={styles.assignmentSection}>
        <div className={styles.sectionHeading}><div><span>Active assignments</span><h2>当前已保存配置</h2></div><p>同一角色的最新活动配置用于下一次明确确认的任务。</p></div>
        <div className={styles.preflightGrid}>{roles.map(([value, label]) => { const config = workspace?.configs.find((item) => item.agent_role === value); const model = activeModels.find((item) => item.model_id === config?.model_id); return <article key={value}><span>{value}</span><strong>{label}</strong><small>{config ? `${model?.model_key ?? config.model_id} · ${config.thinking_mode}${config.reasoning_effort ? ` / ${config.reasoning_effort}` : ""} · 预算 ${config.per_turn_budget}` : "尚未配置"}</small></article>; })}</div>
      </section>
    </AppShell>
  );
}
