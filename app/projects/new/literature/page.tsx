import { UploadProjectForm } from "../_components/UploadProjectForm";

export default async function LiteraturePage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string | string[] }>;
}) {
  const { state } = await searchParams;

  return (
    <UploadProjectForm kind="literature" state={Array.isArray(state) ? state[0] : state} />
  );
}
