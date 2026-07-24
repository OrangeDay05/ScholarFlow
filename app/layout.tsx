import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "研序 ScholarFlow｜AI 论文研究与写作工作台",
  description: "从论文要求、文献与数据出发，管理研究思路、章节、证据和版本。",
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
