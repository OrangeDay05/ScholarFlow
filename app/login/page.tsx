import Link from "next/link";
import { Brand, MockBadge } from "../components/AppShell";
import styles from "./Auth.module.css";

export default function LoginPage() {
  return (
    <main className={styles.authPage}>
      <header className={styles.authHeader}>
        <Brand />
        <nav className={styles.authNav} aria-label="登录前导航">
          <span>已有工作区</span>
          <Link href="/register">创建账号</Link>
        </nav>
      </header>

      <section className={styles.authGrid}>
        <div className={styles.hero}>
          <div className={styles.heroTop}>
            <MockBadge>产品骨架 · Mock</MockBadge>
            <span className={styles.heroIndex}>M1 / 01</span>
          </div>
          <div className={styles.heroCopy}>
            <p className={styles.kicker}>Research, in sequence.</p>
            <h1>让每一篇论文，<br />都有清楚的下一步。</h1>
            <p>
              从项目诊断、材料授权到章节版本，研序把研究写作组织成一条可确认、可回看、
              可继续的路径。
            </p>
          </div>
          <ol className={styles.principles}>
            <li><span>01</span><strong>项目先于生成</strong><small>先看清要求与缺口，再开始写作。</small></li>
            <li><span>02</span><strong>证据回到原文</strong><small>只说明已上传材料能够支持什么。</small></li>
            <li><span>03</span><strong>版本始终保留</strong><small>原稿不覆盖，每次操作创建新版本。</small></li>
          </ol>
        </div>

        <div className={styles.formPanel}>
          <div className={styles.formHeading}>
            <p>欢迎回来</p>
            <h2>进入你的论文工作区</h2>
            <span>使用演示账号查看 M1 页面骨架</span>
          </div>

          <div className={styles.form}>
            <label>
              <span>账号或邮箱</span>
              <input
                autoComplete="username"
                defaultValue="researcher@example.com"
                name="account"
                type="email"
              />
            </label>
            <label>
              <span>密码</span>
              <input
                autoComplete="current-password"
                defaultValue="mock-password"
                name="password"
                type="password"
              />
            </label>

            <div className={styles.errorSample} role="status">
              <strong>错误状态样例</strong>
              <span>账号或密码不匹配时，会在这里说明原因；当前未执行真实认证。</span>
            </div>

            <Link className={styles.primaryButton} href="/projects">
              进入演示工作台 <span aria-hidden="true">→</span>
            </Link>
          </div>

          <p className={styles.switchLine}>
            还没有账号？ <Link href="/register">创建一个演示账号</Link>
          </p>
          <p className={styles.disclaimer}>
            M1 仅展示登录视觉与校验状态，不保存账号、密码或登录状态。
          </p>
        </div>
      </section>
    </main>
  );
}
