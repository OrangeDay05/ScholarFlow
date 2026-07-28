import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE_NAME,
  resolveSessionToken,
  type AuthUser,
} from "./auth";

export async function currentPageUser(): Promise<AuthUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value ?? null;
  const session = await resolveSessionToken(token);
  return session.status === "valid" ? session.user : null;
}

export async function requirePageUser(returnTo = "/projects"): Promise<AuthUser> {
  const user = await currentPageUser();
  if (user) return user;
  redirect(`/login?return_to=${encodeURIComponent(safeReturnTo(returnTo))}`);
}

export async function redirectAuthenticatedUser(): Promise<void> {
  if (await currentPageUser()) redirect("/projects");
}

function safeReturnTo(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/projects";
}
