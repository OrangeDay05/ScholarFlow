"use client";

import { useCallback, useEffect, useState } from "react";
import type { M10Dashboard } from "../lib/m10-operations-contracts";
import styles from "./admin.module.css";

type AdminView = "users" | "projects" | "tasks" | "models";

export function AdminDataClient({ view }: { view: AdminView }) {
  const [dashboard, setDashboard] = useState<M10Dashboard | null>(null);
  const [notice, setNotice] = useState("正在读取当前数据库…");
  const load = useCallback(async () => {
    const response = await fetch("/api/m10/admin/operations", { cache: "no-store" });
    const payload = await response.json() as { ok: boolean; data?: M10Dashboard; error?: { message: string } };
    if (!response.ok || !payload.ok || !payload.data) { setNotice(payload.error?.message ?? "管理数据读取失败。"); return; }
    setDashboard(payload.data);
    setNotice(`数据更新于 ${new Date(payload.data.generatedAt).toLocaleTimeString("zh-CN")}`);
  }, []);
  useEffect(() => {
    const timeout = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  async function changeUser(user: M10Dashboard["users"][number]) {
    const nextStatus = user.status === "active" ? "frozen" : "active";
    const reason = window.prompt(`请输入${nextStatus === "frozen" ? "冻结" : "恢复"} ${user.displayName} 的原因（5—500 字）：`);
    if (!reason) return;
    const impact = nextStatus === "frozen" ? "该用户的全部有效会话将立即撤销，但项目与材料不会删除。" : "该用户将恢复登录权限，历史项目与材料保持不变。";
    if (!window.confirm(`${impact}\n\n确认继续吗？`)) return;
    const response = await fetch("/api/m10/admin/operations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "update_user_status", user_id: user.id, status: nextStatus, reason }) });
    const payload = await response.json() as { ok: boolean; error?: { message: string } };
    setNotice(payload.ok ? "账号状态已更新并写入审计日志。" : payload.error?.message ?? "账号状态更新失败。");
    if (payload.ok) await load();
  }

  if (!dashboard) return <div className={styles.notice}>{notice}</div>;
  if (view === "users") return <UsersView dashboard={dashboard} notice={notice} onChangeUser={changeUser} />;
  if (view === "projects") return <ProjectsView dashboard={dashboard} notice={notice} />;
  if (view === "tasks") return <TasksView dashboard={dashboard} notice={notice} />;
  return <ModelsView dashboard={dashboard} notice={notice} />;
}

function UsersView({ dashboard, notice, onChangeUser }: { dashboard: M10Dashboard; notice: string; onChangeUser: (user: M10Dashboard["users"][number]) => void }) {
  return <>
    <div className={styles.notice}>只展示掩码账号与登录结果，不返回密码、密码 Hash 或 Session Token。{notice}</div>
    <section className={styles.stats}>
      <Stat label="总用户" value={dashboard.metrics.users} detail="当前数据库" />
      <Stat label="有效会话" value={dashboard.metrics.activeSessions} detail="未撤销且未过期" />
      <Stat label="已冻结" value={dashboard.users.filter((user) => user.status === "frozen").length} detail="软禁用，可恢复" />
      <Stat label="登录失败" value={dashboard.users.reduce((sum, user) => sum + user.failedLogins, 0)} detail="累计安全记录" />
    </section>
    <Panel title="账号状态" note={`${dashboard.users.length} 条，最多显示 100 条`}>
      <table className={styles.table}><thead><tr><th>用户</th><th>角色</th><th>状态</th><th>最近登录</th><th>失败登录</th><th>操作</th></tr></thead><tbody>
        {dashboard.users.map((user) => <tr key={user.id}><td><strong>{user.displayName}</strong><small>{user.id} · {user.email}</small></td><td>{user.role}</td><td><Status value={user.status} /></td><td>{formatTime(user.lastLoginAt)}</td><td>{user.failedLogins}</td><td><button className={styles.ghostButton} onClick={() => onChangeUser(user)} type="button">{user.status === "active" ? "冻结" : "恢复"}</button></td></tr>)}
      </tbody></table>
    </Panel>
  </>;
}

function ProjectsView({ dashboard, notice }: { dashboard: M10Dashboard; notice: string }) {
  return <>
    <div className={styles.notice}>只显示状态与错误码，不展开用户论文、材料正文或内部对象键。{notice}</div>
    <section className={styles.stats}>
      <Stat label="项目" value={dashboard.metrics.projects} detail="当前数据库" />
      <Stat label="材料" value={dashboard.metrics.materials} detail="当前数据库" />
      <Stat label="解析运行" value={dashboard.parseRuns.length} detail="最近 100 条" />
      <Stat label="解析失败" value={dashboard.parseRuns.filter((run) => run.status === "FAILED").length} detail="保留失败原因" />
    </section>
    <Panel title="项目" note="按最近更新排序"><table className={styles.table}><thead><tr><th>项目</th><th>所有者</th><th>阶段</th><th>材料</th><th>状态</th><th>更新时间</th></tr></thead><tbody>{dashboard.projects.map((project) => <tr key={project.id}><td><strong>{project.title}</strong><small>{project.id}</small></td><td>{project.ownerDisplayName}</td><td>{project.currentStage}</td><td>{project.materialCount}</td><td><Status value={project.status} /></td><td>{formatTime(project.updatedAt)}</td></tr>)}</tbody></table></Panel>
    <div className={styles.sectionGap} />
    <Panel title="材料与解析" note="最近 100 条材料"><table className={styles.table}><thead><tr><th>文件</th><th>项目</th><th>类型 / 大小</th><th>材料状态</th><th>解析器</th><th>错误</th></tr></thead><tbody>{dashboard.materials.map((material) => { const run = dashboard.parseRuns.find((item) => item.filename === material.filename); return <tr key={material.id}><td><strong>{material.filename}</strong><small>{material.id}</small></td><td>{material.projectTitle}</td><td>{material.contentType}<small>{formatBytes(material.sizeBytes)}</small></td><td><Status value={material.status} /></td><td>{run ? `${run.format} · ${run.parser}` : "尚无解析运行"}</td><td>{run?.errorCode ?? material.errorCode ?? "—"}</td></tr>; })}</tbody></table></Panel>
  </>;
}

function TasksView({ dashboard, notice }: { dashboard: M10Dashboard; notice: string }) {
  return <>
    <div className={styles.notice}>任务、Provider 与输出状态来自当前 D1；失败与预算暂停不会被计为通过。{notice}</div>
    <section className={styles.stats}>
      <Stat label="AI 任务" value={dashboard.metrics.aiTasks} detail={`失败 ${dashboard.metrics.failedAiTasks ?? 0}`} />
      <Stat label="预算暂停" value={dashboard.usage.budgetPaused} detail="不会自动恢复" />
      <Stat label="Token" value={dashboard.usage.promptTokens + dashboard.usage.completionTokens} detail={`推理 Token ${dashboard.usage.reasoningTokens}`} />
      <Stat label="实际成本" value={dashboard.usage.finalCost.toFixed(4)} detail={dashboard.usage.currency ?? "尚无计费记录"} />
    </section>
    <Panel title="AI Task 与错误" note="最近 100 条"><table className={styles.table}><thead><tr><th>任务</th><th>Skill / 角色</th><th>状态</th><th>调用</th><th>错误码</th><th>创建时间</th></tr></thead><tbody>{dashboard.tasks.map((task) => <tr key={task.id}><td><strong>{task.taskType}</strong><small>{task.id}</small></td><td>{task.productSkill}<small>{task.role ?? "未分配角色"}</small></td><td><Status value={task.status} /></td><td>{task.callsUsed} / {task.maxCalls}</td><td>{task.errorCode ?? "—"}</td><td>{formatTime(task.createdAt)}</td></tr>)}</tbody></table></Panel>
    <div className={styles.sectionGap} />
    <Panel title="DOCX、图件与 PPTX" note="最近 100 条输出任务"><table className={styles.table}><thead><tr><th>类型</th><th>项目</th><th>状态</th><th>错误</th><th>创建时间</th></tr></thead><tbody>{dashboard.jobs.map((job) => <tr key={`${job.kind}-${job.id}`}><td><strong>{job.kind}</strong><small>{job.id}</small></td><td>{job.projectTitle}</td><td><Status value={job.status} /></td><td>{job.error ?? "—"}</td><td>{formatTime(job.createdAt)}</td></tr>)}</tbody></table></Panel>
  </>;
}

function ModelsView({ dashboard, notice }: { dashboard: M10Dashboard; notice: string }) {
  return <>
    <div className={styles.notice}>仅展示 Provider、模型能力、角色配置和凭据类型统计；不会返回 API Key、Secret 引用或 reasoning_content。{notice}</div>
    <section className={styles.stats}>
      <Stat label="Provider" value={dashboard.providers.length} detail="当前目录" />
      <Stat label="可用模型" value={dashboard.providers.reduce((sum, item) => sum + item.modelCount, 0)} detail="含禁用目录项" />
      <Stat label="平台凭据" value={dashboard.metrics.platformCredentials ?? 0} detail="仅状态，不含 Secret" />
      <Stat label="用户凭据" value={dashboard.metrics.userCredentials ?? 0} detail="仅状态，不含 Key" />
    </section>
    <Panel title="Provider 与 Model Capability" note="真实目录状态"><table className={styles.table}><thead><tr><th>Provider</th><th>标识</th><th>状态</th><th>模型</th><th>活动能力版本</th></tr></thead><tbody>{dashboard.providers.map((provider) => <tr key={provider.id}><td><strong>{provider.name}</strong><small>{provider.id}</small></td><td>{provider.key}</td><td><Status value={provider.status} /></td><td>{provider.modelCount}</td><td>{provider.activeCapabilityCount}</td></tr>)}</tbody></table></Panel>
    <div className={styles.sectionGap} />
    <Panel title="Agent Role 配置" note="明确区分思考模式与推理强度"><table className={styles.table}><thead><tr><th>角色</th><th>Provider / 模型</th><th>Thinking Mode</th><th>Reasoning Effort</th><th>凭据类型</th><th>状态</th></tr></thead><tbody>{dashboard.agentRoles.map((role) => <tr key={role.id}><td><strong>{role.role}</strong><small>{role.id}</small></td><td>{role.provider}<small>{role.model}</small></td><td>{role.thinkingMode}</td><td>{role.reasoningEffort ?? "不适用"}</td><td>{role.credentialType}</td><td><Status value={role.status} /></td></tr>)}</tbody></table></Panel>
    <div className={styles.sectionGap} />
    <Panel title="六个产品级 Skill" note="名称、版本、审计和启停"><table className={styles.table}><thead><tr><th>Skill</th><th>标识</th><th>版本</th><th>审计</th><th>状态</th></tr></thead><tbody>{dashboard.skills.map((skill) => <tr key={skill.id}><td><strong>{skill.name}</strong><small>{skill.id}</small></td><td>{skill.key}</td><td>{skill.latestVersion ?? "未登记"}</td><td>{skill.auditStatus ?? "未审计"}</td><td><Status value={skill.enabled ? "ENABLED" : "DISABLED"} /></td></tr>)}</tbody></table></Panel>
  </>;
}

function Stat({ label, value, detail }: { label: string; value: string | number; detail: string }) { return <div className={styles.stat}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>; }
function Panel({ title, note, children }: { title: string; note: string; children: React.ReactNode }) { return <section className={styles.panel}><header className={styles.panelHeading}><strong>{title}</strong><span>{note}</span></header><div className={styles.tableWrap}>{children}</div></section>; }
function Status({ value }: { value: string }) { const normalized = value.toUpperCase(); const failing = /FAILED|ERROR|BLOCKED|FROZEN|QUARANTINED/.test(normalized); const warning = /PAUSED|PENDING|DRAFT|QUEUED|RUNNING|PARSING|DISABLED|MOCK|UNVERIFIED/.test(normalized); return <span className={failing ? styles.statusError : warning ? styles.statusWarning : styles.status}>{value}</span>; }
function formatTime(value: string | null) { return value ? new Date(value).toLocaleString("zh-CN") : "—"; }
function formatBytes(bytes: number) { if (bytes < 1024) return `${bytes} B`; if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`; return `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }
