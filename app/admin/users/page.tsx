"use client";

import { useState } from "react";
import { AdminShell } from "../../components/AdminShell";
import styles from "../admin.module.css";

const initialUsers = [
  {
    id: "U-1001",
    name: "林研究员",
    account: "researcher@example.com",
    state: "正常",
    lastLogin: "今天 20:31",
    failures: "0",
  },
  {
    id: "U-1002",
    name: "周同学",
    account: "zhou@example.com",
    state: "正常",
    lastLogin: "今天 16:08",
    failures: "1 次密码错误",
  },
  {
    id: "U-1003",
    name: "测试账号 03",
    account: "qa-03@example.com",
    state: "已冻结",
    lastLogin: "昨天 11:20",
    failures: "连续 5 次失败",
  },
];

export default function AdminUsersPage() {
  const [users, setUsers] = useState(initialUsers);

  function toggleUser(id: string) {
    setUsers((items) =>
      items.map((item) =>
        item.id === id ? { ...item, state: item.state === "正常" ? "已冻结" : "正常" } : item,
      ),
    );
  }

  return (
    <AdminShell
      active="/admin/users"
      description="查看账号状态、最近登录和失败原因。冻结操作只影响当前 Mock 会话。"
      eyebrow="01 / Account diagnostics"
      title="用户管理"
    >
      <section className={styles.stats}>
        <div className={styles.stat}><span>总用户</span><strong>128</strong><small>演示统计</small></div>
        <div className={styles.stat}><span>今日活跃</span><strong>34</strong><small>最近 24 小时</small></div>
        <div className={styles.stat}><span>登录失败</span><strong>06</strong><small>需要排查</small></div>
        <div className={styles.stat}><span>已冻结</span><strong>{String(users.filter((user) => user.state === "已冻结").length).padStart(2, "0")}</strong><small>当前样例</small></div>
      </section>

      <section className={styles.panel}>
        <header className={styles.panelHeading}>
          <strong>账号状态</strong>
          <span>3 条演示记录 · Mock</span>
        </header>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>用户</th><th>账号状态</th><th>最近登录</th><th>失败原因</th><th>操作</th></tr></thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td><strong>{user.name}</strong><small>{user.id} · {user.account}</small></td>
                  <td><span className={user.state === "正常" ? styles.status : styles.statusError}>{user.state}</span></td>
                  <td>{user.lastLogin}</td>
                  <td>{user.failures}</td>
                  <td><button className={styles.ghostButton} onClick={() => toggleUser(user.id)} type="button">{user.state === "正常" ? "冻结（演示）" : "解冻（演示）"}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}
