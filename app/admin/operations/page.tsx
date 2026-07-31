import { AdminShell } from "../../components/AdminShell";
import { OperationsClient } from "./OperationsClient";

export default function AdminOperationsPage() {
  return (
    <AdminShell active="/admin/operations" description="查看真实基础指标、失败事件、灰度开关和 A/B 实验；所有变更写入管理员审计日志。" eyebrow="05 / Operations and release" title="运营与发布候选">
      <OperationsClient />
    </AdminShell>
  );
}
