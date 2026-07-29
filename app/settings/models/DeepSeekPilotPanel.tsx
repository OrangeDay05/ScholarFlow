"use client";

import { useEffect, useState } from "react";
import styles from "./models.module.css";

type PilotStatus = { credential: { configured: boolean; fingerprint: string | null }; models: Array<{ modelId: string; lifecycleStatus: string; thinking: { efforts: string[] }; contextWindow: number; maxOutputTokens: number; supportsToolCalls: boolean; supportsJsonOutput: boolean }> };

export default function DeepSeekPilotPanel() {
  const [status, setStatus] = useState<PilotStatus | null>(null);
  const [modelId, setModelId] = useState("");
  const [thinkingMode, setThinkingMode] = useState<"DISABLED" | "ENABLED">("DISABLED");
  const [effort, setEffort] = useState<"HIGH" | "MAX">("HIGH");
  const [agentRole, setAgentRole] = useState("CONVERSATION_AGENT");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("尚未执行真实测试。");

  useEffect(() => {
    fetch("/api/m5/providers/deepseek/pilot", { credentials: "same-origin" })
      .then((response) => response.json())
      .then((payload) => { if (payload.ok) setStatus(payload.data); })
      .catch(() => setResult("无法读取 Pilot 状态。"));
  }, []);

  async function run(action: "list_models" | "completion") {
    if (!confirmed || busy) return;
    setBusy(true);
    setResult("正在执行单次受控测试……");
    try {
      const response = await fetch("/api/m5/providers/deepseek/pilot", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, confirmed: true, model_id: modelId, thinking_mode: thinkingMode, reasoning_effort: thinkingMode === "ENABLED" ? effort : null }),
      });
      const payload = await response.json();
      setResult(payload.ok ? JSON.stringify(payload.data, null, 2) : `${payload.error.code}：${payload.error.message}`);
      setConfirmed(false);
    } catch { setResult("Pilot 请求失败；未自动重试或切换模型。"); }
    finally { setBusy(false); }
  }

  async function saveRoleConfiguration() {
    if (!confirmed || !modelId || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/m5/projects/demo/model-orchestration", {
        method: "PUT", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "save_role_config", agent_role: agentRole, model_id: modelId, credential_type: "PLATFORM_CREDENTIAL", credential_reference: "env://DEEPSEEK_API_KEY", thinking_mode: thinkingMode, reasoning_effort: thinkingMode === "ENABLED" ? effort : null, max_output_tokens: 4096, timeout_ms: 60_000, per_turn_budget: 100, tools_allowed: true, response_format: "TEXT", streaming: true, fallback_config_id: null }),
      });
      const payload = await response.json();
      setResult(payload.ok ? `角色配置已保存：${agentRole} · ${modelId} · ${thinkingMode}${thinkingMode === "ENABLED" ? `/${effort}` : ""}` : `${payload.error.code}：${payload.error.message}`);
      setConfirmed(false);
    } catch { setResult("角色配置保存失败；未执行模型调用。"); }
    finally { setBusy(false); }
  }

  const selected = status?.models.find((item) => item.modelId === modelId);
  return (
    <section className={styles.pilotPanel}>
      <header>
        <div><span>M5-B4 / DeepSeek Pilot</span><h2>服务器端受控连接测试</h2></div>
        <strong>{status?.credential.configured ? `凭据已配置 · ${status.credential.fingerprint}` : "凭据未配置"}</strong>
      </header>
      <p>不接收 API Key；每次仅测试一个明确模型与模式，不发送论文、材料、诊断卡或对话历史。</p>
      <div className={styles.pilotGrid}>
        <label><span>Provider</span><input value="DEEPSEEK" readOnly /></label>
        <label><span>Model</span><select value={modelId} onChange={(event) => { setModelId(event.target.value); setConfirmed(false); }}><option value="">请选择，不自动默认</option>{status?.models.map((model) => <option key={model.modelId} value={model.modelId}>{model.modelId}</option>)}</select></label>
        <label><span>Thinking Mode</span><select value={thinkingMode} onChange={(event) => { setThinkingMode(event.target.value as "DISABLED" | "ENABLED"); setConfirmed(false); }}><option value="DISABLED">DISABLED</option><option value="ENABLED">ENABLED</option></select></label>
        <label><span>Reasoning Effort</span><select disabled={thinkingMode === "DISABLED"} value={effort} onChange={(event) => { setEffort(event.target.value as "HIGH" | "MAX"); setConfirmed(false); }}><option value="HIGH">HIGH</option><option value="MAX">MAX</option></select></label>
        <label><span>Agent Role</span><select value={agentRole} onChange={(event) => { setAgentRole(event.target.value); setConfirmed(false); }}><option value="CONVERSATION_AGENT">对话 Agent</option><option value="GENERATOR">生成 Agent</option><option value="REVIEWER">审阅 Agent</option><option value="VERIFIER">验证 Agent</option><option value="REVISER">修订 Agent</option><option value="AGGREGATOR">汇总 Agent</option></select></label>
        <label><span>最大输出</span><input value="96 tokens（Pilot）" readOnly /></label>
        <label><span>预计调用 / 费用</span><input value="1 次 / 价格版本未确认" readOnly /></label>
      </div>
      {thinkingMode === "ENABLED" ? <p className={styles.pilotHint}>思考模式下 temperature、top_p、presence_penalty 和 frequency_penalty 已禁用，不会发送。</p> : null}
      {selected ? <div className={styles.capabilityLine}><span>{selected.lifecycleStatus}</span><span>上下文 {selected.contextWindow.toLocaleString()}</span><span>最大输出 {selected.maxOutputTokens.toLocaleString()}</span><span>Tools {selected.supportsToolCalls ? "✓" : "—"}</span><span>JSON {selected.supportsJsonOutput ? "✓" : "—"}</span></div> : null}
      <label className={styles.pilotConfirm}><input checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" />我确认当前显示的模型、模式与角色；若执行测试，仅发送固定安全提示。</label>
      <div className={styles.pilotActions}><button disabled={!confirmed || busy} onClick={() => run("list_models")} type="button">确认并同步目录</button><button disabled={!confirmed || busy || !modelId} onClick={() => run("completion")} type="button">确认并测试当前组合</button><button disabled={!confirmed || busy || !modelId} onClick={saveRoleConfiguration} type="button">保存当前角色配置</button></div>
      <pre className={styles.pilotResult}>{result}</pre>
    </section>
  );
}
