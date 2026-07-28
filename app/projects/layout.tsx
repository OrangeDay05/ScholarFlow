import { requirePageUser } from "../lib/page-auth";

export default async function ProjectsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requirePageUser("/projects");
  return children;
}
