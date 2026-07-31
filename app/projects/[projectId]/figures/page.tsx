import Link from "next/link";
import { AppShell } from "@/app/components/AppShell";
import { ResearchFiguresWorkspace } from "@/app/extensions/[slug]/ResearchFiguresWorkspace";
import styles from "@/app/extensions/Extensions.module.css";

export default async function ProjectFiguresPage({
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
      description="数据快照、代码版本、运行记录和导出资产都绑定当前项目；普通模式先看图片，高级模式可查看代码。"
      eyebrow="RESEARCH FIGURES"
      title="科研图件工作台"
    >
      <ResearchFiguresWorkspace projectId={projectId} />
    </AppShell>
  );
}
