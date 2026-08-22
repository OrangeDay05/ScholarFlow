"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./Projects.module.css";

export function ProjectDeleteButton({ projectId, title }: { projectId: string; title: string }) {
  const router = useRouter();
  const confirmButton = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    confirmButton.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [busy, open]);

  async function deleteProject() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/m4/projects/${encodeURIComponent(projectId)}`, {
        method: "DELETE",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error?.message || "项目删除失败，请稍后重试。");
      }
      setOpen(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "项目删除失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className={styles.projectDeleteTrigger} onClick={() => setOpen(true)} type="button">
        删除项目
      </button>
      {open ? (
        <div
          className={styles.deleteOverlay}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) setOpen(false);
          }}
        >
          <section
            aria-describedby={`delete-project-description-${projectId}`}
            aria-labelledby={`delete-project-title-${projectId}`}
            aria-modal="true"
            className={styles.deleteDialog}
            role="dialog"
          >
            <span>PROJECT REMOVAL</span>
            <h2 id={`delete-project-title-${projectId}`}>确认删除这个项目？</h2>
            <p id={`delete-project-description-${projectId}`}>
              “{title}”将从当前工作区和项目列表中移除，之后不能继续进入章节、材料或诊断卡。
            </p>
            {error ? <p className={styles.deleteError} role="alert">{error}</p> : null}
            <div className={styles.deleteDialogActions}>
              <button disabled={busy} onClick={() => setOpen(false)} type="button">取消</button>
              <button disabled={busy} onClick={() => void deleteProject()} ref={confirmButton} type="button">
                {busy ? "正在删除…" : "确认删除"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
