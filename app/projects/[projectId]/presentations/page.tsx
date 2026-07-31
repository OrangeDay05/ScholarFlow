import Link from "next/link";
import { AppShell } from "@/app/components/AppShell";
import { PresentationWorkspace } from "@/app/extensions/[slug]/PresentationWorkspace";
import styles from "@/app/extensions/Extensions.module.css";

export default async function ProjectPresentationsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <AppShell
      action={
        <Link className={styles.backLink} href={`/projects/${projectId}/editor`}>
          ← 返回编辑器
        </Link>
      }
      description="创建绑定当前项目和来源快照的不可变汇报版本；PPTX 生成与用户打开验证分别记录。"
      eyebrow="PRESENTATION"
      title="科研汇报工作台"
    >
      <PresentationWorkspace projectId={projectId} />
    </AppShell>
  );
}
