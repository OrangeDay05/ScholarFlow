"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./Auth.module.css";

export default function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          identifier: form.get("identifier"),
          password: form.get("password"),
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error?.message ?? "登录失败，请稍后重试。");
        return;
      }
      router.push("/projects");
      router.refresh();
    } catch {
      setError("登录服务暂时不可用，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <label>
        <span>邮箱或手机号</span>
        <input autoComplete="username" name="identifier" required type="text" />
      </label>
      <label>
        <span>密码</span>
        <input autoComplete="current-password" name="password" required type="password" />
      </label>
      {error ? (
        <div className={styles.errorSample} role="alert">
          <strong>登录失败</strong>
          <span>{error}</span>
        </div>
      ) : null}
      <button className={styles.primaryButton} disabled={submitting} type="submit">
        {submitting ? "正在验证…" : "进入工作台"}<span aria-hidden="true">→</span>
      </button>
    </form>
  );
}
