import Link from "next/link";
import { AdminShell } from "../../components/AdminShell";
import { productSkills } from "../../lib/m1-mock";
import { MODEL_ORCHESTRATION_MOCK_ENABLED } from "../../lib/model-orchestration-features";
import styles from "../admin.module.css";

export default function AdminModelsSkillsPage() {
  return (
    <AdminShell
      active="/admin/models-skills"
      description="查看平台模型、五种内部任务角色和六个产品级 Skill；用户凭据只在用户侧显示掩码与范围。"
      eyebrow="04 / Model and product skills"
      title="模型与 Skill"
    >
      {MODEL_ORCHESTRATION_MOCK_ENABLED ? (
        <div className={styles.notice}>
          多模型编排与用户 API Key 当前仅为 M3 前端 Mock，不接收真实密钥或调用供应商。{" "}
          <Link href="/settings/models">打开用户侧模型与 API 配置 →</Link>
        </div>
      ) : null}
      <section className={styles.cards}>
        <article className={styles.card}>
          <div className={styles.cardTop}><h2>ChatGPT</h2><span className={styles.status}>主模型</span></div>
          <p>默认承担诊断、写作、修改和检查任务。具体版本尚未冻结，由后续后台配置。</p>
          <dl><div><dt>当前状态</dt><dd>演示可用</dd></div><div><dt>失败处理</dt><dd>询问用户是否重试</dd></div><div><dt>真实调用</dt><dd>未接入</dd></div></dl>
        </article>
        <article className={styles.card}>
          <div className={styles.cardTop}><h2>DeepSeek</h2><span className={styles.statusWarning}>备用模型</span></div>
          <p>主模型失败后，只有用户明确选择才会使用；输出独立保存为新版本。</p>
          <dl><div><dt>当前状态</dt><dd>演示待命</dd></div><div><dt>切换方式</dt><dd>用户显式确认</dd></div><div><dt>真实调用</dt><dd>未接入</dd></div></dl>
        </article>
        {MODEL_ORCHESTRATION_MOCK_ENABLED ? (
          <article className={styles.card}>
            <div className={styles.cardTop}>
              <h2>多模型编排</h2>
              <span className={styles.statusWarning}>M3 Mock</span>
            </div>
            <p>GENERATOR、REVIEWER、VERIFIER、REVISER 和 ROUTER 分别记录；标准模式两个模型，严格模式最多三个。</p>
            <dl>
              <div><dt>最大模型数</dt><dd>自定义模式最多 4 个</dd></div>
              <div><dt>调用限制</dt><dd>显式上限与停止条件</dd></div>
              <div><dt>真实路由</dt><dd>M5 才实现</dd></div>
            </dl>
          </article>
        ) : null}
      </section>

      <section className={styles.panel} style={{ marginTop: 16 }}>
        <header className={styles.panelHeading}><strong>六个产品级 Skill</strong><span>普通用户只看到这些名称</span></header>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>序号</th><th>产品名称</th><th>职责</th><th>模型角色</th><th>状态</th></tr></thead>
            <tbody>
              {productSkills.map((skill) => (
                <tr key={skill.id}>
                  <td>{skill.index}</td>
                  <td><strong>{skill.title}</strong><small>{skill.id}</small></td>
                  <td>{skill.description}</td>
                  <td>ChatGPT 主 / DeepSeek 备</td>
                  <td><span className={styles.status}>Mock 已配置</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}
