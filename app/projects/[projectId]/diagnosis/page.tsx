import { M4_DIAGNOSIS_PERSISTENCE_ENABLED } from "@/app/lib/m4-features";
import ProgressiveDiagnosisPage from "./ProgressiveDiagnosisPage";

export default async function DiagnosisPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <ProgressiveDiagnosisPage
      projectId={projectId}
      persistenceEnabled={M4_DIAGNOSIS_PERSISTENCE_ENABLED}
    />
  );
}
