import Link from "next/link";
import { Brand, MockBadge } from "./AppShell";
import styles from "./AdminShell.module.css";

const adminLinks = [
  { href: "/admin/users", label: "用户管理", index: "01" },
  { href: "/admin/projects-files", label: "项目与文件", index: "02" },
  { href: "/admin/tasks", label: "AI 任务", index: "03" },
  { href: "/admin/models-skills", label: "模型与 Skill", index: "04" },
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
          <MockBadge>管理员原型 · Mock</MockBadge>
          <Link href="/projects">返回用户端</Link>
        </div>
      </header>

      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeading}>
            <span>ADMIN / M2</span>
            <strong>简易管理台</strong>
            <p>只保留首版排障所需的四个模块。</p>
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
            <strong>原型边界</strong>
            <p>操作只改变当前浏览器中的 Mock 状态，不触发真实账号、文件或模型。</p>
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
