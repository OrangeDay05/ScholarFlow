import Link from "next/link";
import { Brand, MockBadge } from "../components/AppShell";
import { redirectAuthenticatedUser } from "../lib/page-auth";
import styles from "../login/Auth.module.css";
import RegisterForm from "./RegisterForm";

export default async function RegisterPage() {
  await redirectAuthenticatedUser();
  return (
    <main className={styles.authPage}>
      <header className={styles.authHeader}>
        <Brand />
        <nav className={styles.authNav} aria-label="注册前导航">
          <span>已有账号</span>
          <Link href="/login">返回登录</Link>
        </nav>
      </header>

      <section className={styles.authGrid}>
        <div className={styles.hero}>
          <div className={styles.heroTop}>
            <MockBadge>账户安全 · M4</MockBadge>
            <span className={styles.heroIndex}>M4 / CORE-01</span>
          </div>
          <div className={styles.heroCopy}>
            <p className={styles.kicker}>A workspace for one author.</p>
            <h1>建立你的<br />独立研究空间。</h1>
            <p>
              首版不支持共享账号或多人协作。项目材料、诊断卡与章节版本都只归属于当前账号。
            </p>
          </div>
          <ol className={styles.principles}>
            <li><span>01</span><strong>账号独立</strong><small>每位使用者保有自己的研究工作区。</small></li>
            <li><span>02</span><strong>材料可控</strong><small>运行任务前明确选择允许读取的材料。</small></li>
            <li><span>03</span><strong>结果可追</strong><small>生成、修改与恢复均保留版本来源。</small></li>
          </ol>
        </div>

        <div className={styles.formPanel}>
          <div className={styles.formHeading}>
            <p>创建账号</p>
            <h2>开始独立研究工作区</h2>
            <span>邮箱和手机号均须唯一</span>
          </div>
          <RegisterForm />
          <p className={styles.switchLine}>
            已有账号？ <Link href="/login">返回登录</Link>
          </p>
          <p className={styles.disclaimer}>
            密码使用独立随机盐派生并只保存安全哈希；注册成功后自动登录。
          </p>
        </div>
      </section>
    </main>
  );
}
