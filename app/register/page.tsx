import Link from "next/link";
import { Brand, MockBadge } from "../components/AppShell";
import styles from "../login/Auth.module.css";

export default function RegisterPage() {
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
            <MockBadge>注册骨架 · Mock</MockBadge>
            <span className={styles.heroIndex}>M1 / 02</span>
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
            <h2>开始一个演示工作区</h2>
            <span>填写信息后将进入 Mock 项目列表</span>
          </div>

          <div className={styles.form}>
            <label>
              <span>姓名或称呼</span>
              <input autoComplete="name" defaultValue="林研究员" name="name" type="text" />
            </label>
            <label>
              <span>邮箱</span>
              <input autoComplete="email" defaultValue="researcher@example.com" name="email" type="email" />
            </label>
            <label>
              <span>设置密码</span>
              <input autoComplete="new-password" defaultValue="mock-password" name="password" type="password" />
            </label>

            <div className={styles.errorSample} role="status">
              <strong>校验状态样例</strong>
              <span>邮箱格式、密码长度等提示将在此显示；当前不会创建或保存真实账号。</span>
            </div>

            <Link className={styles.primaryButton} href="/projects">
              创建并进入演示 <span aria-hidden="true">→</span>
            </Link>
          </div>

          <p className={styles.switchLine}>
            已有账号？ <Link href="/login">返回登录</Link>
          </p>
          <p className={styles.disclaimer}>
            这是 M1 注册视觉骨架，不包含短信、邮件验证或真实账号持久化。
          </p>
        </div>
      </section>
    </main>
  );
}
