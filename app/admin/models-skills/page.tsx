import { AdminDataClient } from "../AdminDataClient";
import { AdminShell } from "../../components/AdminShell";

export default function AdminModelsSkillsPage() {
  return <AdminShell active="/admin/models-skills" description="查看真实 Provider、Model Capability、Agent Role、凭据类型统计与六个产品级 Skill，不返回任何 Secret。" eyebrow="04 / Model and product skills" title="模型与 Skill"><AdminDataClient view="models" /></AdminShell>;
}
