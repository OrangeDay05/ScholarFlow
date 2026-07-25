"use client";

import { AdminShell } from "../../components/AdminShell";
import { useMockWorkspace } from "../../lib/MockWorkspaceContext";
import styles from "../admin.module.css";

const statusLabel = {
  queued: "等待处理",
  parsing: "正在解析",
  success: "解析成功",
  failed: "解析失败",
  cancelled: "已取消",
};

export default function AdminProjectsFilesPage() {
  const { files, retryFile } = useMockWorkspace();

  return (
    <AdminShell
      active="/admin/projects-files"
      description="定位项目材料的处理阶段、错误和重试结果，不展示用户论文正文。"
      eyebrow="02 / Project and file diagnostics"
      title="项目与文件"
    >
      <section className={styles.stats}>
        <div className={styles.stat}><span>项目</span><strong>42</strong><small>进行中 31</small></div>
        <div className={styles.stat}><span>文件</span><strong>286</strong><small>演示统计</small></div>
        <div className={styles.stat}><span>正在解析</span><strong>{String(files.filter((file) => file.status === "parsing").length).padStart(2, "0")}</strong><small>当前队列</small></div>
        <div className={styles.stat}><span>解析失败</span><strong>{String(files.filter((file) => file.status === "failed").length).padStart(2, "0")}</strong><small>允许重试</small></div>
      </section>

      <div className={styles.notice}>这里只展示文件状态、处理阶段和错误原因。正文内容、研究数据和引用原文不在管理员列表中展开。</div>

      <section className={styles.panel}>
        <header className={styles.panelHeading}><strong>项目文件队列</strong><span>Mock Adapter</span></header>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>文件</th><th>项目</th><th>处理器</th><th>状态</th><th>说明</th><th>操作</th></tr></thead>
            <tbody>
              {files.map((file) => (
                <tr key={file.id}>
                  <td><strong>{file.name}</strong><small>{file.kind} · {file.size}</small></td>
                  <td>P-demo-001</td>
                  <td>{file.name.endsWith(".csv") ? "Table Parser" : "Document Parser"}</td>
                  <td><span className={file.status === "failed" ? styles.statusError : file.status === "parsing" ? styles.statusWarning : styles.status}>{statusLabel[file.status]}</span></td>
                  <td>{file.detail}</td>
                  <td>{file.status === "failed" ? <button className={styles.actionButton} onClick={() => retryFile(file.id)} type="button">重试</button> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}
