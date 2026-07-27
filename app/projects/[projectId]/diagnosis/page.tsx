import { PROGRESSIVE_DIAGNOSIS_MOCK_ENABLED } from "@/app/lib/progressive-diagnosis-features";
import { M4_DIAGNOSIS_PERSISTENCE_ENABLED } from "@/app/lib/m4-features";
import LegacyDiagnosisPage from "./LegacyDiagnosisPage";
import ProgressiveDiagnosisPage from "./ProgressiveDiagnosisPage";

export default async function DiagnosisPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return PROGRESSIVE_DIAGNOSIS_MOCK_ENABLED ? (
    <ProgressiveDiagnosisPage
      projectId={projectId}
      persistenceEnabled={M4_DIAGNOSIS_PERSISTENCE_ENABLED}
    />
  ) : (
    <LegacyDiagnosisPage />
  );
}
