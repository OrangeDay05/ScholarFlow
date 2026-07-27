import type { M4TaskRole } from "./m4-task-contracts";

export type M4CredentialType =
  | "PLATFORM_CREDENTIAL"
  | "USER_CREDENTIAL";
export type M4ExecutionMode = "STANDARD" | "STRICT" | "CUSTOM";

export type M4ModelWorkspace = {
  providers: Array<{
    id: string;
    providerKey: string;
    displayName: string;
    dataProcessorName: string;
    status: "MOCK_ONLY" | "AVAILABLE" | "DISABLED";
  }>;
  models: Array<{
    id: string;
    providerId: string;
    modelKey: string;
    displayName: string;
    modelVersion: string;
    allowedRoles: M4TaskRole[];
    status: "MOCK_ONLY" | "AVAILABLE" | "DISABLED";
  }>;
  credentials: Array<{
    id: string;
    providerId: string;
    credentialType: M4CredentialType;
    label: string;
    maskedKey: string;
    secretReference: string | null;
    allowedModelIds: string[];
    allowedProjectIds: string[];
    allowedRoles: M4TaskRole[];
    status: "NOT_CONFIGURED" | "MOCK_ONLY" | "DISABLED" | "DELETED";
    lastTestStatus: "NOT_TESTED" | "MOCK_NOT_EXECUTED";
  }>;
  profiles: Array<{
    id: string;
    name: string;
    mode: M4ExecutionMode;
    maxModels: number;
    maxCalls: number;
    timeoutSeconds: number;
    fallbackPlan: string;
    assignments: Array<{
      providerModelId: string;
      credentialMetadataId: string | null;
      role: M4TaskRole;
      priority: number;
    }>;
  }>;
};

export interface M4SecretReferenceStore {
  storeSecret(plaintext: string): Promise<never>;
}

export const M4_SECRET_STORAGE_DEFERRED: M4SecretReferenceStore = {
  async storeSecret() {
    throw new Error(
      "M4 不接收明文密钥；真实服务端加密和安全存储在 M5 实现。",
    );
  },
};
