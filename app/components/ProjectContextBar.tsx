import Link from "next/link";
import type { ProjectAccessContext } from "@/db/repositories/m10-project-context";
import styles from "./ProjectContextBar.module.css";

export function ProjectContextBar({
  context,
  conversationSessionId,
}: {
  context: ProjectAccessContext;
  conversationSessionId?: string | null;
}) {
  return (
    <aside className={styles.bar} aria-label="当前项目上下文">
      <div><span>Workspace</span><strong>{context.workspaceName}</strong></div>
      <div><span>当前项目</span><strong>{context.projectTitle}</strong></div>
      <div><span>当前身份</span><strong>{context.role === "AUTHOR" ? "作者" : "审核员"}</strong></div>
      <div><span>当前权限</span><strong>{context.permissionLabel}</strong></div>
      {conversationSessionId ? <div><span>当前会话</span><strong>{conversationSessionId.slice(0, 8)}</strong></div> : null}
      <Link href={context.role === "REVIEWER" ? "/projects?role=REVIEWER" : "/projects?role=AUTHOR"}>切换项目</Link>
    </aside>
  );
}
