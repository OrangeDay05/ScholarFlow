"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./AppShell.module.css";

export default function LogoutButton() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function logout() {
    if (submitting) return;
    setSubmitting(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <button className={styles.logoutButton} disabled={submitting} onClick={logout} type="button">
      {submitting ? "退出中…" : "退出"}
    </button>
  );
}
