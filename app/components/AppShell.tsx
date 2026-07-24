import Link from "next/link";
import styles from "./AppShell.module.css";

type AppShellProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  compact?: boolean;
  children: React.ReactNode;
};

export function Brand() {
  return (
    <Link className={styles.brand} href="/projects" aria-label="研序 ScholarFlow 项目列表">
      <span className={styles.brandMark}>研</span>
      <span>
        <strong>研序</strong>
        <small>ScholarFlow</small>
      </span>
    </Link>
  );
}

export function MockBadge({ children = "演示数据 · Mock" }: { children?: React.ReactNode }) {
  return <span className={styles.mockBadge}>{children}</span>;
}

export function AppShell({
  eyebrow,
  title,
  description,
  action,
  compact = false,
  children,
}: AppShellProps) {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Brand />
        <nav className={styles.nav} aria-label="主要导航">
          <Link href="/projects">项目</Link>
          <Link href="/projects/new">新建项目</Link>
          <span className={styles.disabledNav} aria-label="当前阶段未开放">
            帮助
          </span>
        </nav>
        <div className={styles.account}>
          <MockBadge />
          <span className={styles.avatar}>林</span>
        </div>
      </header>

      <main className={compact ? styles.mainCompact : styles.main}>
        <section className={styles.pageHeading}>
          <div>
            {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
            <h1>{title}</h1>
            {description ? <p className={styles.description}>{description}</p> : null}
          </div>
          {action ? <div className={styles.action}>{action}</div> : null}
        </section>
        {children}
      </main>
    </div>
  );
}

