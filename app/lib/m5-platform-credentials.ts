import { env } from "cloudflare:workers";

export type M5PlatformCredentialStatus = {
  provider: "DEEPSEEK";
  configured: boolean;
  fingerprint: string | null;
};

export async function deepSeekPlatformCredentialStatus(): Promise<M5PlatformCredentialStatus> {
  const key = readDeepSeekKey();
  return {
    provider: "DEEPSEEK",
    configured: Boolean(key),
    fingerprint: key ? (await sha256(key)).slice(-8) : null,
  };
}

export function requireDeepSeekPlatformCredential(): string {
  const key = readDeepSeekKey();
  if (!key) throw new Error("DEEPSEEK_PLATFORM_CREDENTIAL_UNAVAILABLE");
  return key;
}

function readDeepSeekKey(): string | null {
  const value = (env as unknown as Record<string, unknown>).DEEPSEEK_API_KEY;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
