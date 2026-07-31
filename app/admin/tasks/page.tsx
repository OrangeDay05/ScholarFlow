import { AdminDataClient } from "../AdminDataClient";
import { AdminShell } from "../../components/AdminShell";

export default function AdminTasksPage() {
  return <AdminShell active="/admin/tasks" description="查看真实 AI Task、预算暂停、Token、成本、Provider 错误及 DOCX、图件和 PPTX 输出状态。" eyebrow="03 / AI task diagnostics" title="AI 任务"><AdminDataClient view="tasks" /></AdminShell>;
}
