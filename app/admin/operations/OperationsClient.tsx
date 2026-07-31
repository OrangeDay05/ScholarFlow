"use client";

import { useCallback, useEffect, useState } from "react";
import type { M10Dashboard } from "../../lib/m10-operations-contracts";
import styles from "../admin.module.css";

const metricLabels: Record<string, string> = {
  users: "用户", projects: "项目", materials: "材料", aiTasks: "AI 任务",
  failedAiTasks: "失败任务", docxExports: "DOCX", figureRuns: "图件运行", presentationExports: "PPTX",
  operationalFailures: "运营失败事件", platformCredentials: "平台凭据", userCredentials: "用户凭据", activeSessions: "有效会话",
};

export function OperationsClient() {
  const [dashboard, setDashboard] = useState<M10Dashboard | null>(null);
  const [notice, setNotice] = useState("正在读取运营数据…");
  const load = useCallback(async () => {
    const response = await fetch("/api/m10/admin/operations", { cache: "no-store" });
    const payload = await response.json() as { ok: boolean; data?: M10Dashboard; error?: { message: string } };
    if (!response.ok || !payload.ok || !payload.data) { setNotice(payload.error?.message ?? "运营数据读取失败。"); return; }
    setDashboard(payload.data); setNotice(`更新于 ${new Date(payload.data.generatedAt).toLocaleTimeString("zh-CN")}`);
  }, []);
  useEffect(() => {
    const timeout = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  async function update(body: Record<string, unknown>) {
    const response = await fetch("/api/m10/admin/operations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json() as { ok: boolean; error?: { message: string } };
    setNotice(payload.ok ? "设置已保存并写入审计日志。" : payload.error?.message ?? "保存失败。");
    if (payload.ok) await load();
  }

  function confirmUpdate(summary: string, impact: string, body: Record<string, unknown>) {
    const reason = window.prompt(`请输入${summary}的原因（5—500 字）：`);
    if (!reason || !window.confirm(`${impact}\n\n确认继续吗？`)) return;
    void update({ ...body, reason });
  }

  if (!dashboard) return <div className={styles.notice}>{notice}</div>;
  return <>
    <div className={styles.notice}>数据来自当前 D1；灰度和实验默认关闭，不会自动扩大流量。所有变更要求原因、二次确认并写入审计。{notice}</div>
    <section className={styles.stats}>
      <div className={styles.stat}><span>数据库</span><strong>{dashboard.health.database}</strong><small>{dashboard.health.tableCount} 张表 · {dashboard.health.migrationCount} 条迁移</small></div>
      <div className={styles.stat}><span>对象存储记录</span><strong>{dashboard.health.storedObjects}</strong><small>失败或隔离 {dashboard.health.failedObjects}</small></div>
      {Object.entries(dashboard.metrics).map(([key, value]) => <div className={styles.stat} key={key}><span>{metricLabels[key] ?? key}</span><strong>{value}</strong><small>当前数据库</small></div>)}
    </section>
    <section className={styles.panel}>
      <header className={styles.panelHeading}><strong>灰度开关</strong><span>0—100% 稳定分桶</span></header>
      <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>开关</th><th>状态</th><th>比例</th><th>操作</th></tr></thead><tbody>{dashboard.featureFlags.map((flag) => <tr key={flag.key}><td><strong>{flag.description}</strong><small>{flag.key}</small></td><td><span className={flag.enabled ? styles.status : styles.statusWarning}>{flag.enabled ? "启用" : "关闭"}</span></td><td>{flag.rolloutPercentage}%</td><td><button className={styles.ghostButton} onClick={() => confirmUpdate(flag.enabled ? "关闭灰度" : "开启 10% 灰度", `将${flag.enabled ? "停止" : "向稳定分桶的 10% 用户开放"}“${flag.description}”，不会修改业务数据。`, { action: "update_flag", key: flag.key, enabled: !flag.enabled, rollout_percentage: flag.enabled ? 0 : 10 })} type="button">{flag.enabled ? "关闭" : "10% 灰度"}</button></td></tr>)}</tbody></table></div>
    </section>
    <section className={styles.panel} style={{ marginTop: 16 }}>
      <header className={styles.panelHeading}><strong>A/B 实验</strong><span>停止条件由管理员控制</span></header>
      <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>实验</th><th>状态</th><th>实验组</th><th>操作</th></tr></thead><tbody>{dashboard.experiments.map((experiment) => <tr key={experiment.id}><td><strong>{experiment.name}</strong><small>{experiment.key}</small></td><td><span className={experiment.status === "RUNNING" ? styles.status : styles.statusWarning}>{experiment.status}</span></td><td>{experiment.treatmentPercentage}%</td><td><button className={styles.ghostButton} onClick={() => confirmUpdate(experiment.status === "RUNNING" ? "暂停实验" : "开始实验", `实验“${experiment.name}”将${experiment.status === "RUNNING" ? "停止分配新实验流量" : `向 ${experiment.treatmentPercentage}% 稳定分桶开放`}。`, { action: "update_experiment", key: experiment.key, status: experiment.status === "RUNNING" ? "PAUSED" : "RUNNING", treatment_percentage: experiment.treatmentPercentage })} type="button">{experiment.status === "RUNNING" ? "暂停" : "开始"}</button></td></tr>)}</tbody></table></div>
    </section>
    <section className={styles.panel} style={{ marginTop: 16 }}>
      <header className={styles.panelHeading}><strong>最近失败</strong><span>Provider、任务、解析与前端事件</span></header>
      <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>来源</th><th>错误码</th><th>安全说明</th><th>时间</th></tr></thead><tbody>{dashboard.recentFailures.map((failure, index) => <tr key={`${failure.source}-${failure.occurredAt}-${index}`}><td>{failure.source}</td><td>{failure.code ?? "—"}</td><td>{failure.message ?? "未记录可公开错误说明"}</td><td>{new Date(failure.occurredAt).toLocaleString("zh-CN")}</td></tr>)}</tbody></table></div>
    </section>
    <section className={styles.panel} style={{ marginTop: 16 }}>
      <header className={styles.panelHeading}><strong>管理员审计</strong><span>最近 100 条，不显示敏感元数据</span></header>
      <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>管理员</th><th>操作</th><th>原因</th><th>时间</th></tr></thead><tbody>{dashboard.auditLogs.map((entry) => <tr key={entry.id}><td>{entry.actor}</td><td>{entry.action}</td><td>{entry.reason ?? "历史记录未提供原因"}</td><td>{new Date(entry.createdAt).toLocaleString("zh-CN")}</td></tr>)}</tbody></table></div>
    </section>
  </>;
}
