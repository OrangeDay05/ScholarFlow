import Link from "next/link";
import { AppShell, MockBadge } from "@/app/components/AppShell";
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
        <MockBadge />
        <p>
          M1 只展示创建结构与演示队列，不会上传、解析或调用 AI。所有入口都会先生成一张可修改的诊断卡草稿。
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
