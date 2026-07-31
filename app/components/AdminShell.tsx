import Link from "next/link";
import { Brand } from "./AppShell";
import styles from "./AdminShell.module.css";

const adminLinks = [
  { href: "/admin/users", label: "用户管理", index: "01" },
  { href: "/admin/projects-files", label: "项目与文件", index: "02" },
  { href: "/admin/tasks", label: "AI 任务", index: "03" },
  { href: "/admin/models-skills", label: "模型与 Skill", index: "04" },
  { href: "/admin/operations", label: "运营与发布", index: "05" },
];

export function AdminShell({
  active,
  eyebrow,
  title,
  description,
  children,
}: {
  active: string;
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <Brand />
        <div className={styles.topbarMeta}>
          <span>受限管理入口</span>
          <Link href="/projects">返回用户端</Link>
        </div>
      </header>

      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeading}>
            <span>ADMIN / OPERATIONS</span>
            <strong>运营管理台</strong>
            <p>查看当前数据库、任务、模型、输出和发布状态。</p>
          </div>
          <nav aria-label="管理员导航">
            {adminLinks.map((item) => (
              <Link
                className={active === item.href ? styles.activeLink : styles.navLink}
                href={item.href}
                key={item.href}
              >
                <span>{item.index}</span>
                {item.label}
              </Link>
            ))}
          </nav>
          <div className={styles.boundary}>
            <strong>安全边界</strong>
            <p>不展示密码、Session、API Key、论文正文或模型推理内容；管理变更必须留痕。</p>
          </div>
        </aside>

        <main className={styles.main}>
          <header className={styles.heading}>
            <p>{eyebrow}</p>
            <h1>{title}</h1>
            <span>{description}</span>
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}
