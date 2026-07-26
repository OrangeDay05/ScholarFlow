import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell, MockBadge } from "@/app/components/AppShell";
import { V042_INCREMENTAL_MOCK_ENABLED } from "@/app/lib/v042-features";
import { v042Capabilities } from "@/app/lib/v042-mock";
import styles from "./Extensions.module.css";

export default function ExtensionsPage() {
  if (!V042_INCREMENTAL_MOCK_ENABLED) {
    notFound();
  }

  return (
    <AppShell
      action={<MockBadge>V0.4.2 · 增量 Mock</MockBadge>}
      description="独立承接研究前期、外部资料、审稿返修与研究表达，不改变已批准的 M2 论文写作主流程。"
      eyebrow="Research extensions"
      title="研究扩展工作区"
    >
      <div className={styles.modeNotice}>
        <strong>M2 核心工作台保持不变</strong>
        <span>这里的六项能力均为独立 Mock 页面，尚未接入真实 Skill 或外部服务。</span>
      </div>

      <section className={styles.capabilityGrid} aria-label="V0.4.2 增量能力">
        {v042Capabilities.map((capability) => (
          <Link
            className={styles.capabilityCard}
            href={`/extensions/${capability.slug}`}
            key={capability.slug}
          >
            <div className={styles.cardTop}>
              <span className={styles.cardIndex}>{capability.index}</span>
              <span className={styles.cardStatus}>MOCK</span>
            </div>
            <p className={styles.cardKicker}>{capability.kicker}</p>
            <h2>{capability.title}</h2>
            <p className={styles.cardSummary}>{capability.summary}</p>
            <div className={styles.cardAction}>
              <span>打开独立工作区</span>
              <span aria-hidden="true">→</span>
            </div>
          </Link>
        ))}
      </section>

      <aside className={styles.boundary}>
        <strong>增量设计边界</strong>
        <p>
          功能开关关闭后，新增导航、右栏入口和本组页面全部隐藏，登录、项目列表、五种创建入口、
          诊断卡、三栏编辑器、版本、证据与 DOCX 预检恢复为完整 M2 体验。
        </p>
      </aside>
    </AppShell>
  );
}
