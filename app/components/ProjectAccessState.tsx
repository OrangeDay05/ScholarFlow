import Link from "next/link";

export function ProjectAccessState({
  title,
  detail,
  role = "AUTHOR",
}: {
  title: string;
  detail: string;
  role?: "AUTHOR" | "REVIEWER";
}) {
  return (
    <main style={{ maxWidth: 760, margin: "80px auto", padding: 32, border: "1px solid #bfd6ca", background: "#fffdf7", color: "#00392e" }}>
      <p style={{ color: "#007746", fontWeight: 800 }}>PROJECT ACCESS</p>
      <h1>{title}</h1>
      <p style={{ lineHeight: 1.7 }}>{detail}</p>
      <Link href={role === "REVIEWER" ? "/projects?role=REVIEWER" : "/projects?role=AUTHOR"}>返回项目列表</Link>
    </main>
  );
}
