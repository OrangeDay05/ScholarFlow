import { notFound } from "next/navigation";
import { getD1 } from "@/db";
import { requirePageUser } from "../lib/page-auth";

export const metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser("/admin");
  const row = await getD1().prepare("SELECT role FROM users WHERE id = ? AND status = 'active'").bind(user.id).first<{ role: string }>();
  if (row?.role !== "admin") notFound();
  return children;
}
