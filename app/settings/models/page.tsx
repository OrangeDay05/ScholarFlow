import { notFound } from "next/navigation";
import { MODEL_ORCHESTRATION_MOCK_ENABLED } from "@/app/lib/model-orchestration-features";
import ModelAccessClient from "./ModelAccessClient";

export default function ModelAccessPage() {
  if (!MODEL_ORCHESTRATION_MOCK_ENABLED) notFound();
  return <ModelAccessClient />;
}
