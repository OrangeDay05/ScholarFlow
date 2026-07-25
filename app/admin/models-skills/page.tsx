import { AdminShell } from "../../components/AdminShell";
import { productSkills } from "../../lib/m1-mock";
import styles from "../admin.module.css";

export default function AdminModelsSkillsPage() {
  return (
    <AdminShell
      active="/admin/models-skills"
      description="查看主备模型角色和六个产品级 Skill 的原型配置；不展示内部编排或供应商密钥。"
      eyebrow="04 / Model and product skills"
      title="模型与 Skill"
    >
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
