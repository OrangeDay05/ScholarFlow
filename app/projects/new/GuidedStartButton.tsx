"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./new.module.css";

export function GuidedStartButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/m4/projects", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", "Idempotency-Key": `guided-project:${crypto.randomUUID()}` },
        body: JSON.stringify({
          primaryCreationMethod: "idea",
          onboardingMode: "guided",
          goal: "待通过 AI 引导梳理明确研究方向",
          materialsSummary: "尚未提供材料，可在 AI 梳理中上传",
          firstAiHelp: "通过自然对话形成可确认的研究方案",
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok || typeof payload.data?.project?.id !== "string") {
        throw new Error(payload?.error?.message ?? "无法创建 AI 梳理项目。");
      }
      router.push(`/projects/${encodeURIComponent(payload.data.project.id)}/guided`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法创建 AI 梳理项目。");
      setBusy(false);
    }
  }

  return (
    <section className={styles.guidedCta} aria-labelledby="guided-start-title">
      <div>
        <span>AI GUIDED ONBOARDING</span>
        <h2 id="guided-start-title">不知道从哪里开始？让 AI 帮我梳理</h2>
        <p>先创建真实项目，再通过自然对话、材料和方案比较逐步形成正式项目诊断卡。</p>
      </div>
      <button disabled={busy} onClick={start} type="button">{busy ? "正在创建项目…" : "让 AI 帮我梳理 →"}</button>
      {error ? <p className={styles.guidedError} role="alert">{error}</p> : null}
    </section>
  );
}
