import { PROGRESSIVE_DIAGNOSIS_MOCK_ENABLED } from "@/app/lib/progressive-diagnosis-features";
import LegacyDiagnosisPage from "./LegacyDiagnosisPage";
import ProgressiveDiagnosisPage from "./ProgressiveDiagnosisPage";

export default function DiagnosisPage() {
  return PROGRESSIVE_DIAGNOSIS_MOCK_ENABLED ? (
    <ProgressiveDiagnosisPage />
  ) : (
    <LegacyDiagnosisPage />
  );
}
