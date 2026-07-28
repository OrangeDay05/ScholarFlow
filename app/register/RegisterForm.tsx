"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "../login/Auth.module.css";

export default function RegisterForm() {
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
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          display_name: form.get("display_name"),
          email: form.get("email"),
          phone: form.get("phone"),
          password: form.get("password"),
          confirm_password: form.get("confirm_password"),
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error?.message ?? "注册失败，请稍后重试。");
        return;
      }
      router.push("/projects");
      router.refresh();
    } catch {
      setError("注册服务暂时不可用，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <label>
        <span>姓名或称呼</span>
        <input autoComplete="name" name="display_name" required type="text" />
      </label>
      <label>
        <span>邮箱</span>
        <input autoComplete="email" name="email" required type="email" />
      </label>
      <label>
        <span>手机号</span>
        <input autoComplete="tel" name="phone" required type="tel" />
      </label>
      <label>
        <span>设置密码</span>
        <input autoComplete="new-password" minLength={10} name="password" required type="password" />
      </label>
      <label>
        <span>确认密码</span>
        <input autoComplete="new-password" minLength={10} name="confirm_password" required type="password" />
      </label>
      {error ? (
        <div className={styles.errorSample} role="alert">
          <strong>注册失败</strong>
          <span>{error}</span>
        </div>
      ) : null}
      <button className={styles.primaryButton} disabled={submitting} type="submit">
        {submitting ? "正在创建…" : "创建并进入工作台"}<span aria-hidden="true">→</span>
      </button>
    </form>
  );
}
