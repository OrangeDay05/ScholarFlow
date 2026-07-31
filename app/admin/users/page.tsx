import { AdminDataClient } from "../AdminDataClient";
import { AdminShell } from "../../components/AdminShell";

export default function AdminUsersPage() {
  return <AdminShell active="/admin/users" description="查看真实账号状态、最近登录和失败记录；冻结会撤销会话，所有变更要求原因并写入审计。" eyebrow="01 / Account diagnostics" title="用户管理"><AdminDataClient view="users" /></AdminShell>;
}
