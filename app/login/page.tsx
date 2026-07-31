import Link from "next/link";
import { Brand } from "../components/AppShell";
import { redirectAuthenticatedUser } from "../lib/page-auth";
import styles from "./Auth.module.css";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  await redirectAuthenticatedUser();
  return (
    <main className={styles.authPage}>
      <header className={styles.authHeader}>
        <Brand />
        <nav className={styles.authNav} aria-label="登录前导航">
          <span>还没有账号</span>
          <Link href="/register">创建账号</Link>
        </nav>
      </header>

      <section className={styles.authGrid}>
        <div className={styles.hero}>
          <div className={styles.heroTop}>
            <span className={styles.heroPill}>安全账户</span>
            <span className={styles.heroIndex}>独立研究空间</span>
          </div>
          <div className={styles.heroCopy}>
            <p className={styles.kicker}>Research, in sequence.</p>
            <h1>让每一篇论文，<br />都有清晰的下一步。</h1>
            <p>
              从项目诊断、材料授权到章节版本，研序把研究写作组织成一条可确认、可回看、可继续的路径。
            </p>
          </div>
          <ol className={styles.principles}>
            <li><span>01</span><strong>项目先于生成</strong><small>先看清要求与缺口，再开始写作。</small></li>
            <li><span>02</span><strong>证据回到原文</strong><small>只说明已授权材料能够支持什么。</small></li>
            <li><span>03</span><strong>版本始终保留</strong><small>原稿不覆盖，每次操作创建新版本。</small></li>
          </ol>
        </div>

        <div className={styles.formPanel}>
          <div className={styles.formHeading}>
            <p>欢迎回来</p>
            <h2>进入你的论文工作区</h2>
            <span>使用邮箱或手机号登录</span>
          </div>
          <LoginForm />
          <p className={styles.switchLine}>
            还没有账号？ <Link href="/register">创建账号</Link>
          </p>
          <p className={styles.disclaimer}>
            登录成功后将创建安全的服务器端 Session；密码和 Session Token 均不会写入日志。
          </p>
        </div>
      </section>
    </main>
  );
}
