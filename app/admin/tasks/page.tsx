"use client";

import { AdminShell } from "../../components/AdminShell";
import { useMockWorkspace } from "../../lib/MockWorkspaceContext";
import styles from "../admin.module.css";

const taskRows = [
  { id: "T-240724-031", type: "通用章节写作", model: "ChatGPT · 主模型", state: "成功", detail: "生成 v4；读取 2 份授权材料", time: "1m 18s" },
  { id: "T-240724-030", type: "引用与证据检查", model: "ChatGPT · 主模型", state: "警告", detail: "2 条论断无法确认", time: "42s" },
  { id: "T-240724-029", type: "一致性检查", model: "DeepSeek · 备用模型", state: "失败", detail: "主模型超时后由用户选择备用模型；备用模型仍失败", time: "2m 04s" },
];

export default function AdminTasksPage() {
  const { taskStatus, taskMessage, failMockTask, runMockTask } = useMockWorkspace();
  return (
    <AdminShell
      active="/admin/tasks"
      description="查看任务使用的模型、阶段、耗时和可理解的失败原因。不会静默切换备用模型。"
      eyebrow="03 / AI task diagnostics"
      title="AI 任务"
    >
      <section className={styles.stats}>
        <div className={styles.stat}><span>今日任务</span><strong>94</strong><small>演示统计</small></div>
        <div className={styles.stat}><span>正在运行</span><strong>{taskStatus === "running" ? "01" : "00"}</strong><small>{taskMessage}</small></div>
        <div className={styles.stat}><span>失败</span><strong>03</strong><small>可诊断</small></div>
        <div className={styles.stat}><span>备用模型</span><strong>07</strong><small>均由用户选择</small></div>
      </section>

      <section className={styles.panel}>
        <header className={styles.panelHeading}>
          <strong>任务与错误</strong>
          <span>
            <button className={styles.ghostButton} onClick={failMockTask} type="button">模拟失败</button>{" "}
            <button className={styles.actionButton} onClick={runMockTask} type="button">模拟运行</button>
          </span>
        </header>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>任务</th><th>模型</th><th>状态</th><th>结果或原因</th><th>耗时</th></tr></thead>
            <tbody>
              {taskRows.map((task) => (
                <tr key={task.id}>
                  <td><strong>{task.type}</strong><small>{task.id} · Mock</small></td>
                  <td>{task.model}</td>
                  <td><span className={task.state === "失败" ? styles.statusError : task.state === "警告" ? styles.statusWarning : styles.status}>{task.state}</span></td>
                  <td>{task.detail}</td>
                  <td>{task.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}
