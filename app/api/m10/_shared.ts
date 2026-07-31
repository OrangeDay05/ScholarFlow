import { getD1 } from "@/db/index";
import { apiError } from "@/app/api/m3/_shared";
import { getM3Actor } from "@/app/lib/m3-server-identity";

export async function requireM10Actor(request: Request) {
  const actor = await getM3Actor(request);
  return actor
    ? { actor }
    : {
        response: apiError(
          401,
          "AUTHENTICATION_REQUIRED",
          "需要经过平台认证后才能访问运营数据。",
        ),
      };
}

export async function requireM10Admin(request: Request) {
  const auth = await requireM10Actor(request);
  if ("response" in auth) return auth;
  const row = await getD1().prepare("SELECT role FROM users WHERE id = ? AND status = 'active'").bind(auth.actor.userId).first<{ role: string }>();
  return row?.role === "admin" ? auth : { response: apiError(403, "ADMIN_REQUIRED", "该操作仅允许管理员执行。") };
}
