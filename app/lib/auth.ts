import { getD1 } from "@/db";

export const SESSION_COOKIE_NAME = "scholarflow_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

const PASSWORD_ITERATIONS = 210_000;
const PASSWORD_ALGORITHM = "PBKDF2";
const PASSWORD_HASH = "SHA-256";
const PASSWORD_KEY_LENGTH = 32;

export type AuthUser = {
  id: string;
  email: string;
  phone: string;
  displayName: string;
};

export type AuthActor = {
  userId: string;
  email: string;
  displayName: string;
};

export type AuthErrorCode =
  | "VALIDATION_ERROR"
  | "EMAIL_ALREADY_EXISTS"
  | "PHONE_ALREADY_EXISTS"
  | "INVALID_CREDENTIALS"
  | "SESSION_EXPIRED"
  | "UNAUTHENTICATED"
  | "INTERNAL_ERROR";

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

type UserRow = {
  id: string;
  email: string;
  phone: string | null;
  display_name: string;
  password_hash: string | null;
  status: string;
};

type SessionRow = {
  expires_at: string;
  revoked_at: string | null;
  user_id: string;
  email: string;
  phone: string | null;
  display_name: string;
  status: string;
};

export type RegisterInput = {
  displayName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
};

export async function registerUser(
  request: Request,
  input: RegisterInput,
): Promise<{ user: AuthUser; sessionToken: string }> {
  const displayName = input.displayName.trim();
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);
  validateRegistration(displayName, email, phone, input.password, input.confirmPassword);

  const db = getD1();
  const duplicateEmail = await db
    .prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();
  if (duplicateEmail) {
    throw new AuthError("EMAIL_ALREADY_EXISTS", "该邮箱已注册。", 409);
  }
  const duplicatePhone = await db
    .prepare("SELECT id FROM users WHERE phone = ?")
    .bind(phone)
    .first<{ id: string }>();
  if (duplicatePhone) {
    throw new AuthError("PHONE_ALREADY_EXISTS", "该手机号已注册。", 409);
  }

  const userId = crypto.randomUUID();
  const workspaceId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const sessionToken = randomHex(32);
  const tokenHash = await sha256Hex(sessionToken);
  const passwordHash = await hashPassword(input.password);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();
  const loginMeta = await requestLoginMeta(request);

  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO users (
             id, email, phone, display_name, password_hash, status, role
           ) VALUES (?, ?, ?, ?, ?, 'active', 'user')`,
        )
        .bind(userId, email, phone, displayName, passwordHash),
      db
        .prepare(
          `INSERT INTO workspaces (id, owner_user_id, name, status)
           VALUES (?, ?, ?, 'active')`,
        )
        .bind(workspaceId, userId, `${displayName} 的工作区`),
      db
        .prepare(
          `INSERT INTO workspace_memberships (
             id, workspace_id, user_id, role, status
           ) VALUES (?, ?, ?, 'AUTHOR', 'active')`,
        )
        .bind(crypto.randomUUID(), workspaceId, userId),
      db
        .prepare(
          `INSERT INTO sessions (id, user_id, token_hash, expires_at)
           VALUES (?, ?, ?, ?)`,
        )
        .bind(sessionId, userId, tokenHash, expiresAt),
      db
        .prepare(
          `INSERT INTO login_records (
             id, user_id, provider, status, ip_hash, user_agent
           ) VALUES (?, ?, 'password', 'succeeded', ?, ?)`,
        )
        .bind(crypto.randomUUID(), userId, loginMeta.ipHash, loginMeta.userAgent),
    ]);
  } catch (error) {
    const emailNowExists = await db
      .prepare("SELECT id FROM users WHERE email = ?")
      .bind(email)
      .first<{ id: string }>();
    if (emailNowExists) {
      throw new AuthError("EMAIL_ALREADY_EXISTS", "该邮箱已注册。", 409);
    }
    const phoneNowExists = await db
      .prepare("SELECT id FROM users WHERE phone = ?")
      .bind(phone)
      .first<{ id: string }>();
    if (phoneNowExists) {
      throw new AuthError("PHONE_ALREADY_EXISTS", "该手机号已注册。", 409);
    }
    throw error;
  }

  return {
    user: { id: userId, email, phone, displayName },
    sessionToken,
  };
}

export async function loginUser(
  request: Request,
  identifierInput: string,
  password: string,
): Promise<{ user: AuthUser; sessionToken: string }> {
  const identifier = normalizeIdentifier(identifierInput);
  if (!identifier || !password) {
    throw new AuthError("VALIDATION_ERROR", "请输入账号和密码。", 400);
  }

  const db = getD1();
  const user = await db
    .prepare(
      identifier.kind === "email"
        ? `SELECT id, email, phone, display_name, password_hash, status
           FROM users WHERE email = ?`
        : `SELECT id, email, phone, display_name, password_hash, status
           FROM users WHERE phone = ?`,
    )
    .bind(identifier.value)
    .first<UserRow>();

  if (!user || !user.password_hash || user.status !== "active") {
    throw new AuthError("INVALID_CREDENTIALS", "账号或密码不正确。", 401);
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    await recordFailedLogin(db, request, user.id, "INVALID_CREDENTIALS");
    throw new AuthError("INVALID_CREDENTIALS", "账号或密码不正确。", 401);
  }

  const sessionToken = randomHex(32);
  const tokenHash = await sha256Hex(sessionToken);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();
  const now = new Date().toISOString();
  const loginMeta = await requestLoginMeta(request);
  await db.batch([
    db
      .prepare(
        `INSERT INTO sessions (id, user_id, token_hash, expires_at)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(crypto.randomUUID(), user.id, tokenHash, expiresAt),
    db.prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?").bind(
      now,
      now,
      user.id,
    ),
    db
      .prepare(
        `INSERT INTO login_records (
           id, user_id, provider, status, ip_hash, user_agent
         ) VALUES (?, ?, 'password', 'succeeded', ?, ?)`,
      )
      .bind(crypto.randomUUID(), user.id, loginMeta.ipHash, loginMeta.userAgent),
  ]);

  return {
    user: toAuthUser(user),
    sessionToken,
  };
}

export async function resolveRequestSession(request: Request): Promise<{
  user: AuthUser | null;
  status: "valid" | "missing" | "expired" | "revoked" | "invalid";
}> {
  return resolveSessionToken(readCookie(request.headers.get("cookie"), SESSION_COOKIE_NAME));
}

export async function resolveSessionToken(token: string | null): Promise<{
  user: AuthUser | null;
  status: "valid" | "missing" | "expired" | "revoked" | "invalid";
}> {
  if (!token) return { user: null, status: "missing" };
  const tokenHash = await sha256Hex(token);
  const row = await getD1()
    .prepare(
      `SELECT s.expires_at, s.revoked_at,
              u.id AS user_id, u.email, u.phone, u.display_name, u.status
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`,
    )
    .bind(tokenHash)
    .first<SessionRow>();
  if (!row) return { user: null, status: "invalid" };
  if (row.revoked_at) return { user: null, status: "revoked" };
  if (Date.parse(row.expires_at) <= Date.now()) {
    return { user: null, status: "expired" };
  }
  if (row.status !== "active") return { user: null, status: "invalid" };
  return {
    status: "valid",
    user: {
      id: row.user_id,
      email: row.email,
      phone: row.phone ?? "",
      displayName: row.display_name,
    },
  };
}

export async function revokeRequestSession(request: Request): Promise<void> {
  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE_NAME);
  if (!token) return;
  const tokenHash = await sha256Hex(token);
  await getD1()
    .prepare(
      `UPDATE sessions SET revoked_at = ?
       WHERE token_hash = ? AND revoked_at IS NULL`,
    )
    .bind(new Date().toISOString(), tokenHash)
    .run();
}

export function authActor(user: AuthUser): AuthActor {
  return { userId: user.id, email: user.email, displayName: user.displayName };
}

export function sessionCookie(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}${secure}`;
}

export function clearSessionCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`;
}

export function authErrorResponse(error: unknown): Response {
  if (error instanceof AuthError) {
    return Response.json(
      { ok: false, error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  console.error("Authentication operation failed");
  return Response.json(
    { ok: false, error: { code: "INTERNAL_ERROR", message: "认证服务暂时不可用。" } },
    { status: 500 },
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await derivePassword(password, salt, PASSWORD_ITERATIONS);
  return `pbkdf2-sha256$v=1$i=${PASSWORD_ITERATIONS}$s=${toHex(salt)}$h=${toHex(derived)}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = Object.fromEntries(
    encoded.split("$").slice(1).map((part) => {
      const index = part.indexOf("=");
      return index === -1 ? [part, ""] : [part.slice(0, index), part.slice(index + 1)];
    }),
  );
  if (!encoded.startsWith("pbkdf2-sha256$") || parts.v !== "1") return false;
  const iterations = Number(parts.i);
  if (!Number.isInteger(iterations) || iterations < 100_000 || iterations > 1_000_000) {
    return false;
  }
  const salt = fromHex(parts.s ?? "");
  const expected = fromHex(parts.h ?? "");
  if (salt.length < 16 || expected.length !== PASSWORD_KEY_LENGTH) return false;
  const actual = await derivePassword(password, salt, iterations);
  return constantTimeEqual(actual, expected);
}

function validateRegistration(
  displayName: string,
  email: string,
  phone: string,
  password: string,
  confirmPassword: string,
) {
  if (!displayName || displayName.length > 80) {
    throw new AuthError("VALIDATION_ERROR", "请输入有效的姓名或称呼。", 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AuthError("VALIDATION_ERROR", "请输入有效邮箱。", 400);
  }
  if (!/^\+?[1-9]\d{6,14}$/.test(phone)) {
    throw new AuthError("VALIDATION_ERROR", "请输入有效手机号。", 400);
  }
  if (password.length < 10 || password.length > 128) {
    throw new AuthError("VALIDATION_ERROR", "密码长度应为 10—128 个字符。", 400);
  }
  if (password !== confirmPassword) {
    throw new AuthError("VALIDATION_ERROR", "两次输入的密码不一致。", 400);
  }
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizePhone(value: string): string {
  const compact = value.trim().replace(/[\s()-]/g, "");
  return compact.startsWith("00") ? `+${compact.slice(2)}` : compact;
}

function normalizeIdentifier(value: string): { kind: "email" | "phone"; value: string } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.includes("@")
    ? { kind: "email", value: normalizeEmail(trimmed) }
    : { kind: "phone", value: normalizePhone(trimmed) };
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=") || null;
  }
  return null;
}

async function recordFailedLogin(
  db: D1Database,
  request: Request,
  userId: string,
  errorCode: string,
) {
  const meta = await requestLoginMeta(request);
  await db
    .prepare(
      `INSERT INTO login_records (
         id, user_id, provider, status, ip_hash, user_agent, error_code
       ) VALUES (?, ?, 'password', 'failed', ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), userId, meta.ipHash, meta.userAgent, errorCode)
    .run();
}

async function requestLoginMeta(request: Request) {
  const ip = request.headers.get("cf-connecting-ip")?.trim();
  return {
    ipHash: ip ? await sha256Hex(ip) : null,
    userAgent: request.headers.get("user-agent")?.slice(0, 512) ?? null,
  };
}

async function derivePassword(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const stableSalt = Uint8Array.from(salt);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    PASSWORD_ALGORITHM,
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: PASSWORD_ALGORITHM, hash: PASSWORD_HASH, salt: stableSalt, iterations },
    key,
    PASSWORD_KEY_LENGTH * 8,
  );
  return new Uint8Array(bits);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(PASSWORD_HASH, new TextEncoder().encode(value));
  return toHex(new Uint8Array(digest));
}

function randomHex(bytes: number): string {
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)));
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(value: string): Uint8Array {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) return new Uint8Array();
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a[index] ^ b[index];
  }
  return difference === 0;
}

function toAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    phone: row.phone ?? "",
    displayName: row.display_name,
  };
}
