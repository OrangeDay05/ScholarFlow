import { UploadProjectForm } from "../_components/UploadProjectForm";

export default async function DataPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string | string[] }>;
}) {
  const { state } = await searchParams;

  return <UploadProjectForm kind="data" state={Array.isArray(state) ? state[0] : state} />;
}
