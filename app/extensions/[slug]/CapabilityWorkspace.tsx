"use client";

import { useState } from "react";
import type { V042Capability } from "@/app/lib/v042-mock";
import styles from "../Extensions.module.css";

export function CapabilityWorkspace({
  capability,
}: {
  capability: V042Capability;
}) {
  const [previewReady, setPreviewReady] = useState(false);
  const [selectedInputs, setSelectedInputs] = useState(() =>
    capability.inputs.map((_, index) => index === 0),
  );

  function toggleInput(index: number) {
    setSelectedInputs((current) =>
      current.map((selected, currentIndex) =>
        currentIndex === index ? !selected : selected,
      ),
    );
    setPreviewReady(false);
  }

  return (
    <>
      <div className={styles.workspaceGrid}>
        <section className={styles.setupPanel} aria-label={`${capability.title}任务准备`}>
          <div className={styles.panelHeading}>
            <div>
              <p>TASK SETUP</p>
              <h2>任务准备</h2>
            </div>
            <span>MOCK</span>
          </div>
          <div className={styles.setupBody}>
            <p className={styles.prompt}>{capability.prompt}</p>
            {capability.inputs.map((input, index) => (
              <label className={styles.inputChoice} key={input}>
                <input
                  checked={selectedInputs[index]}
                  onChange={() => toggleInput(index)}
                  type="checkbox"
                />
                <span>{input}</span>
              </label>
            ))}
            <button
              className={styles.setupAction}
              disabled={!selectedInputs.some(Boolean)}
              onClick={() => setPreviewReady(true)}
              type="button"
            >
              生成演示预览 <span>→</span>
            </button>
          </div>
        </section>

        <section className={styles.previewPanel} aria-live="polite">
          <div className={styles.panelHeading}>
            <div>
              <p>WORKSPACE PREVIEW</p>
              <h2>{previewReady ? "演示结果已更新" : "工作区预览"}</h2>
            </div>
            <span>{previewReady ? "READY" : "SAMPLE"}</span>
          </div>
          <div className={styles.flow} aria-label="演示流程">
            {capability.steps.map((step, index) => (
              <div className={styles.flowStep} key={step}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{step}</strong>
              </div>
            ))}
          </div>
          <div className={styles.previewList}>
            {capability.preview.map((item, index) => (
              <article
                className={
                  previewReady && index === 0
                    ? `${styles.previewCard} ${styles.previewCardActive}`
                    : styles.previewCard
                }
                key={item.label}
              >
                <span>{item.label}</span>
                <h3>{item.title}</h3>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>
        </section>
      </div>

      <div className={styles.outputBar}>
        <strong>预计输出 · 仅界面演示</strong>
        <div>
          {capability.outputs.map((output) => (
            <span key={output}>{output}</span>
          ))}
        </div>
      </div>
    </>
  );
}
