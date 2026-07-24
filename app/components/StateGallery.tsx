import styles from "./StateGallery.module.css";

const states = [
  { label: "加载中", detail: "正在读取材料", tone: "loading" },
  { label: "空状态", detail: "尚无可用内容", tone: "empty" },
  { label: "已完成", detail: "演示任务成功", tone: "success" },
  { label: "失败", detail: "可查看原因并重试", tone: "failure" },
  { label: "需注意", detail: "存在缺失材料", tone: "warning" },
] as const;

export function StateGallery() {
  return (
    <section className={styles.wrap} aria-label="页面状态视觉样例">
      <div className={styles.heading}>
        <p>状态语言</p>
        <span>仅为 M1 视觉样例，不代表真实任务已运行</span>
      </div>
      <div className={styles.grid}>
        {states.map((state) => (
          <div className={`${styles.state} ${styles[state.tone]}`} key={state.label}>
            <span className={styles.dot} />
            <div>
              <strong>{state.label}</strong>
              <small>{state.detail}</small>
            </div>
          </div>
        ))}
      </div>
      <div className={styles.taskStates} aria-label="耗时任务状态样例">
        <span>耗时任务</span>
        <strong>等待执行</strong>
        <strong>正在执行</strong>
        <strong>已取消</strong>
      </div>
    </section>
  );
}
