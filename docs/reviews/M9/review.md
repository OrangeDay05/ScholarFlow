# M9 科研汇报与真实 PPTX 审核报告

日期：2026-07-30
分支：`m8-m11/delivery-readiness`

## 结论

M9 已完成到内部审核门：13 种场景继续共用 PresentationProject、PresentationVersion 和 Slide；真实 PPTX 由独立 Artifact Tool Runner 生成，保存为所有者隔离、版本绑定的不可变资产。生成成功与“用户已打开验证”分开记录。

## 已完成

- 13 种场景不按学历设门；PPT 是否可生成只看内容、权限和真实性就绪状态。
- 每次生成先建立来源版本和材料快照，再保存页面；不覆盖旧 PresentationVersion。
- 页面包含标题、核心信息、takeaway、讲者备注、来源绑定和问答准备。
- 没有真实结果时只展示计划分析、预期结果或待验证假设，不伪造结果。
- 真实 PPTX Runner 使用 `@oai/artifact-tool`，与 Web 进程解耦；本地 `dev:m9` 同时管理 M8、M9 Runner 和 Vinext。
- `presentation_exports` 保存来源版本、对象键、SHA-256、大小、Runner/Artifact Tool 版本、生成状态与打开验证时间。
- 科研图件可以通过 Slide 的 `asset_bindings_json` 绑定并以 PNG 嵌入 PPTX；外部或非平凡来源写入每页讲者备注 `[Sources]` 区块。

## 迁移

- `drizzle/0016_curvy_nick_fury.sql`：仅新增 `presentation_exports` 表和两个索引。
- 迁移为增量创建，无旧表重建、删除或数据回填。

## 验收

1. 13 种 PPT 场景：PASS
2. 不按学历阻断：PASS
3. 来源版本/材料快照：PASS
4. PresentationVersion 不覆盖：PASS
5. 页面和讲者备注：PASS
6. `[Sources]` 来源块：PASS
7. 问答准备：PASS
8. 无真实结果不伪造：PASS
9. 图件资产绑定：PASS
10. 真实 PPTX：PASS
11. OOXML ZIP、页数和核心文件验证：PASS
12. Artifact Tool 再导入：PASS
13. 5 页逐页 PNG 渲染：PASS
14. 用户打开验证独立状态：PASS
15. 所有者隔离下载：PASS

## 证据

- M9 Repository：2/2 通过，含就绪阻断、版本绑定、资产保存、打开验证和跨用户拒绝。
- Artifact Tool 真实 Runner：1/1 通过；5 页真实 PPTX、notes 和 `[Sources]` 可再次导入。
- 逐页渲染：5/5 PNG；人工查看无重叠、裁切或异常换行。
- TypeScript：通过。
- 样例：`docs/reviews/M9/artifacts/m9-sample.pptx`。
- 蒙版：`docs/reviews/M9/artifacts/m9-sample-montage.png`。

## 边界

- 当前是本地独立 Runner，不声称已经配置生产 PPTX 服务。
- 未接收生产 API Key，未调用外部模型，未部署。
- M10 将完成管理员、指标、全量测试、安全与发布候选；M11 仍需用户另行明确授权才可部署。
