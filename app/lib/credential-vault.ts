export type EncryptedCredential = {
  ciphertext: string;
  initializationVector: string;
  keyVersion: string;
  algorithm: "AES-GCM-256";
};

export class CredentialVaultError extends Error {
  readonly code: "MASTER_KEY_MISSING" | "MASTER_KEY_INVALID" | "CREDENTIAL_INVALID";
  constructor(code: CredentialVaultError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

export async function encryptCredential(
  plaintext: string,
  masterKeyBase64: string,
  ownerUserId: string,
  credentialId: string,
  keyVersion = "v1",
): Promise<EncryptedCredential> {
  validateCredential(plaintext);
  const key = await importMasterKey(masterKeyBase64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const additionalData = new TextEncoder().encode(`${ownerUserId}:${credentialId}:${keyVersion}`);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData }, key, new TextEncoder().encode(plaintext));
  return { ciphertext: toBase64(new Uint8Array(ciphertext)), initializationVector: toBase64(iv), keyVersion, algorithm: "AES-GCM-256" };
}

export async function decryptCredential(
  encrypted: EncryptedCredential,
  masterKeyBase64: string,
  ownerUserId: string,
  credentialId: string,
): Promise<string> {
  const key = await importMasterKey(masterKeyBase64);
  const additionalData = new TextEncoder().encode(`${ownerUserId}:${credentialId}:${encrypted.keyVersion}`);
  try {
    const iv = fromBase64(encrypted.initializationVector);
    const ciphertext = fromBase64(encrypted.ciphertext);
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv.buffer as ArrayBuffer, additionalData }, key, ciphertext.buffer as ArrayBuffer);
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new CredentialVaultError("CREDENTIAL_INVALID", "凭据无法解密或归属校验失败。" );
  }
}

export function maskCredential(value: string): string {
  const trimmed = value.trim();
  return trimmed.length <= 8 ? "****" : `${trimmed.slice(0, 3)}****${trimmed.slice(-4)}`;
}

function validateCredential(value: string) {
  if (value.trim().length < 8 || value.length > 4096) throw new CredentialVaultError("CREDENTIAL_INVALID", "API Key 长度无效。" );
}

async function importMasterKey(base64: string): Promise<CryptoKey> {
  if (!base64) throw new CredentialVaultError("MASTER_KEY_MISSING", "服务端凭据主密钥未配置。" );
  let bytes: Uint8Array;
  try { bytes = fromBase64(base64); }
  catch { throw new CredentialVaultError("MASTER_KEY_INVALID", "服务端凭据主密钥格式无效。" ); }
  if (bytes.byteLength !== 32) throw new CredentialVaultError("MASTER_KEY_INVALID", "服务端凭据主密钥必须为 32 字节。" );
  return crypto.subtle.importKey("raw", bytes.buffer as ArrayBuffer, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function toBase64(bytes: Uint8Array): string { return btoa(String.fromCharCode(...bytes)); }
function fromBase64(value: string): Uint8Array { return Uint8Array.from(atob(value), (character) => character.charCodeAt(0)); }
