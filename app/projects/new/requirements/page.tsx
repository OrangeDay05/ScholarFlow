import { UploadProjectForm } from "../_components/UploadProjectForm";

export default async function RequirementsPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string | string[] }>;
}) {
  const { state } = await searchParams;

  return (
    <UploadProjectForm kind="requirements" state={Array.isArray(state) ? state[0] : state} />
  );
}
