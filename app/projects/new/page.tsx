import Link from "next/link";
import { AppShell } from "@/app/components/AppShell";
import { creationPaths } from "@/app/lib/m1-mock";
import styles from "./new.module.css";

export default function NewProjectPage() {
  return (
    <AppShell
      eyebrow="新建项目 · 五种起点"
      title="先说，你手里有什么？"
      description="不必从空白文档开始。选择最接近你当前材料的入口，之后仍可继续补充其他内容。"
      action={
        <Link className={styles.backLink} href="/projects">
          ← 返回项目
        </Link>
      }
    >
      <section className={styles.intro} aria-label="创建说明">
        <p>
          选择入口后只需提供三个基础回答。项目会保存到你的独立工作区，专业信息和材料可以稍后继续补充。
        </p>
      </section>

      <section className={styles.cardGrid} aria-label="选择项目创建方式">
        {creationPaths.map((path, index) => (
          <Link
            className={`${styles.card} ${styles[path.tone]} ${
              index === 0 ? styles.featured : ""
            }`}
            href={path.href}
            key={path.id}
          >
            <div className={styles.cardTop}>
              <span className={styles.mark} aria-hidden="true">
                {path.mark}
              </span>
              <span className={styles.index}>{path.index}</span>
            </div>
            <div className={styles.cardCopy}>
              <p className={styles.kicker}>{path.detail}</p>
              <h2>{path.title}</h2>
              <p className={styles.description}>{path.description}</p>
            </div>
            <span className={styles.start}>开始 →</span>
          </Link>
        ))}
      </section>
    </AppShell>
  );
}
