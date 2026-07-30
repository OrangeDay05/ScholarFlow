import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell, MockBadge } from "@/app/components/AppShell";
import { V042_INCREMENTAL_MOCK_ENABLED } from "@/app/lib/v042-features";
import {
  getV042Capability,
  v042Capabilities,
} from "@/app/lib/v042-mock";
import styles from "../Extensions.module.css";
import { CapabilityWorkspace } from "./CapabilityWorkspace";
import { ResearchFiguresWorkspace } from "./ResearchFiguresWorkspace";
import { PresentationWorkspace } from "./PresentationWorkspace";

export function generateStaticParams() {
  return v042Capabilities.map((capability) => ({ slug: capability.slug }));
}

export default async function ExtensionCapabilityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!V042_INCREMENTAL_MOCK_ENABLED) {
    notFound();
  }

  const { slug } = await params;
  const capability = getV042Capability(slug);

  if (!capability) {
    notFound();
  }

  return (
    <AppShell
      action={slug === "research-figures" ? <MockBadge>M8 · 本地受限执行</MockBadge> : slug === "presentations" ? <MockBadge>M9 · 真实 PPTX</MockBadge> : <MockBadge>V0.4.2 · 未接真实服务</MockBadge>}
      description={capability.summary}
      eyebrow={`${capability.index} · ${capability.kicker}`}
      title={capability.title}
    >
      <div className={styles.modeNotice}>
        <strong>独立业务页面 · 不改写 M2</strong>
        <Link className={styles.backLink} href="/extensions">
          返回研究扩展工作区 →
        </Link>
      </div>
      {slug === "research-figures" ? (
        <ResearchFiguresWorkspace projectId="demo" />
      ) : slug === "presentations" ? (
        <PresentationWorkspace projectId="demo" />
      ) : (
        <CapabilityWorkspace capability={capability} />
      )}
    </AppShell>
  );
}
