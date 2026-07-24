import {
  Field,
  FormActions,
  FormScaffold,
  FormSection,
  formStyles,
} from "../_components/FormScaffold";

export default function IdeaProjectPage() {
  return (
    <FormScaffold
      eyebrow="01 · 从 Idea 开始"
      title="把一个念头，变成研究起点"
      description="先给出你已经知道的部分。研究对象、方法或引用格式不确定也没关系，诊断卡会把缺口明确列出来。"
      noteTitle="不替你编造研究"
      note="这一入口只整理你提供的想法与约束。没有材料支持的对象、方法和结论会被标为缺失，而不是自动补全。"
    >
      <FormSection
        index="01"
        title="核心 Idea"
        description="用自然语言说明你想研究什么，以及为什么值得研究。"
      >
        <div className={formStyles.fieldGrid}>
          <Field
            label="研究主题或初步题目 *"
            hint="建议包含研究对象、核心问题或具体情境。"
            full
          >
            <textarea
              defaultValue="数字平台中的知识协作机制：远程研究团队如何形成共同理解？"
              aria-label="研究主题或初步题目"
            />
          </Field>
          <Field label="研究对象" hint="不确定可留空">
            <input defaultValue="跨机构远程研究团队" aria-label="研究对象" />
          </Field>
          <Field label="背景或问题">
            <input defaultValue="线上协作中知识难以沉淀" aria-label="背景或问题" />
          </Field>
          <Field label="初步研究问题" full>
            <textarea
              defaultValue="团队成员通过哪些实践形成共享认知？平台功能在其中扮演什么角色？"
              aria-label="初步研究问题"
            />
          </Field>
        </div>
      </FormSection>

      <FormSection
        index="02"
        title="论文边界"
        description="这些字段将成为诊断卡中的显式约束，可在确认前继续修改。"
      >
        <div className={formStyles.fieldGrid}>
          <Field label="论文类型 *">
            <select defaultValue="journal" aria-label="论文类型">
              <option value="course">课程论文</option>
              <option value="undergraduate">本科论文</option>
              <option value="graduate">硕士论文</option>
              <option value="journal">期刊论文</option>
              <option value="conference">会议论文</option>
            </select>
          </Field>
          <Field label="目标语言 *">
            <select defaultValue="bilingual" aria-label="目标语言">
              <option value="zh">中文</option>
              <option value="en">English</option>
              <option value="bilingual">中英双语</option>
            </select>
          </Field>
          <Field label="目标字数">
            <input defaultValue="12000" inputMode="numeric" aria-label="目标字数" />
          </Field>
          <Field label="截止日期">
            <input defaultValue="2026-12-20" type="date" aria-label="截止日期" />
          </Field>
          <Field label="引用格式">
            <select defaultValue="apa7" aria-label="引用格式">
              <option value="apa7">APA 7th</option>
              <option value="gbt">GB/T 7714</option>
              <option value="mla9">MLA 9th</option>
              <option value="unknown">暂不确定</option>
            </select>
          </Field>
          <Field label="其他要求">
            <input placeholder="例如：需包含访谈或案例分析" aria-label="其他要求" />
          </Field>
        </div>
      </FormSection>
      <FormActions />
    </FormScaffold>
  );
}
