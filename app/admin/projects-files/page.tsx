import { AdminDataClient } from "../AdminDataClient";
import { AdminShell } from "../../components/AdminShell";

export default function AdminProjectsFilesPage() {
  return <AdminShell active="/admin/projects-files" description="定位真实项目、材料与解析任务状态，不展示用户论文正文或内部对象键。" eyebrow="02 / Project and file diagnostics" title="项目与文件"><AdminDataClient view="projects" /></AdminShell>;
}
