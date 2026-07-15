import type { Metadata } from "next";
import { InteractionPreviewPlatform } from "@/components/layout/InteractionPreviewPlatform";

export const metadata: Metadata = {
  title: "交互预览平台",
  description: "基于 App 页面截图拆解模块并模拟交互跳转的预览工具。",
};

export default function InteractionPreviewPage() {
  return <InteractionPreviewPlatform />;
}
