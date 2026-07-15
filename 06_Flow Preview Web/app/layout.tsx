import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flow Preview",
  description: "交互流程预览工具，用于展示 Figma 页面与状态切图的流程预览。",
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
