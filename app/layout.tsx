import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "研序 ScholarFlow｜AI 论文研究与写作工作台",
  description: "围绕项目、材料、诊断、章节、证据与版本组织研究写作。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
