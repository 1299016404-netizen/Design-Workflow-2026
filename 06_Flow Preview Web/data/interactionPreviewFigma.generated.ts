export type FigmaPageIconType = "home" | "list" | "detail" | "order";

export type FigmaPreviewAsset = {
  id: string;
  name: string;
  imageUrl: string;
  figmaNodeId: string;
  width: number;
  height: number;
};

export type FigmaPreviewFocusRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type FigmaHtmlStateAsset = FigmaPreviewAsset & {
  displayName: string;
  normalizedStateName: string;
  order: number;
};

export type FigmaHtmlPageAsset = FigmaPreviewAsset & {
  displayName: string;
  normalizedStateName: string;
  order: number;
  pageGroupId: string;
  stateId: string;
};

export type FigmaHtmlPageGroup = {
  id: string;
  name: string;
  displayName: string;
  figmaSourceName: string;
  pageType: FigmaPageIconType;
  order: number;
};

export type FigmaHtmlPageBinding = {
  id: string;
  pageGroupId: string;
  stateId: string;
  pageAssetId: string;
  focusRect: FigmaPreviewFocusRect;
};

const figmaHtmlAssetVersion = "?v=20260523-figma-slice-stable";

export const figmaHtmlStates: FigmaHtmlStateAsset[] = [
  {
    id: "figma-1446-7414",
    name: "html状态-AI引导卡 / 常规卡片",
    displayName: "常规卡片",
    normalizedStateName: "常规卡片",
    imageUrl: `/images/interaction-preview/figma-html/states/1446-7414.png${figmaHtmlAssetVersion}`,
    figmaNodeId: "1446:7414",
    width: 348,
    height: 474,
    order: 0,
  },
  {
    id: "figma-1446-7423",
    name: "html状态-AI引导卡 / 生成中",
    displayName: "生成中",
    normalizedStateName: "生成中",
    imageUrl: `/images/interaction-preview/figma-html/states/1446-7423.png${figmaHtmlAssetVersion}`,
    figmaNodeId: "1446:7423",
    width: 348,
    height: 474,
    order: 1,
  },
  {
    id: "figma-1446-7433",
    name: "html状态-AI引导卡 / 继续推荐",
    displayName: "继续推荐",
    normalizedStateName: "继续推荐",
    imageUrl: `/images/interaction-preview/figma-html/states/1446-7433.png${figmaHtmlAssetVersion}`,
    figmaNodeId: "1446:7433",
    width: 348,
    height: 474,
    order: 2,
  },
  {
    id: "figma-1446-7442",
    name: "html状态-AI引导卡 / 文字极端",
    displayName: "文字极端",
    normalizedStateName: "文字极端",
    imageUrl: `/images/interaction-preview/figma-html/states/1446-7442.png${figmaHtmlAssetVersion}`,
    figmaNodeId: "1446:7442",
    width: 348,
    height: 474,
    order: 3,
  },
];

export const figmaHtmlPageGroups: FigmaHtmlPageGroup[] = [
  {
    id: "page-group-home",
    name: "首页",
    displayName: "酒店首页",
    figmaSourceName: "html页面-首页",
    pageType: "home",
    order: 0,
  },
];

export const figmaHtmlPages: FigmaHtmlPageAsset[] = [
  {
    id: "figma-1343-198176",
    name: "html页面-首页 / 常规页面",
    displayName: "常规页面",
    normalizedStateName: "常规页面",
    imageUrl: `/images/interaction-preview/figma-html/pages/1343-198176.png${figmaHtmlAssetVersion}`,
    figmaNodeId: "1343:198176",
    width: 750,
    height: 3266,
    order: 0,
    pageGroupId: "page-group-home",
    stateId: "figma-1446-7414",
  },
  {
    id: "figma-1368-136548",
    name: "html页面-首页 / 生成中",
    displayName: "生成中",
    normalizedStateName: "生成中",
    imageUrl: `/images/interaction-preview/figma-html/pages/1368-136548.png${figmaHtmlAssetVersion}`,
    figmaNodeId: "1368:136548",
    width: 750,
    height: 3266,
    order: 1,
    pageGroupId: "page-group-home",
    stateId: "figma-1446-7423",
  },
  {
    id: "figma-1372-4081",
    name: "html页面-首页 / 继续推荐",
    displayName: "继续推荐",
    normalizedStateName: "继续推荐",
    imageUrl: `/images/interaction-preview/figma-html/pages/1372-4081.png${figmaHtmlAssetVersion}`,
    figmaNodeId: "1372:4081",
    width: 750,
    height: 3266,
    order: 2,
    pageGroupId: "page-group-home",
    stateId: "figma-1446-7433",
  },
  {
    id: "figma-1372-4475",
    name: "html页面-首页 / 文字极端",
    displayName: "文字极端",
    normalizedStateName: "文字极端",
    imageUrl: `/images/interaction-preview/figma-html/pages/1372-4475.png${figmaHtmlAssetVersion}`,
    figmaNodeId: "1372:4475",
    width: 750,
    height: 3266,
    order: 3,
    pageGroupId: "page-group-home",
    stateId: "figma-1446-7442",
  },
];

export const figmaHtmlPageBindings: FigmaHtmlPageBinding[] = [
  {
    id: "binding-page-group-home-figma-1446-7414",
    pageGroupId: "page-group-home",
    stateId: "figma-1446-7414",
    pageAssetId: "figma-1343-198176",
    focusRect: { x: 384, y: 2628, width: 348, height: 474 },
  },
  {
    id: "binding-page-group-home-figma-1446-7423",
    pageGroupId: "page-group-home",
    stateId: "figma-1446-7423",
    pageAssetId: "figma-1368-136548",
    focusRect: { x: 384, y: 2628, width: 348, height: 474 },
  },
  {
    id: "binding-page-group-home-figma-1446-7433",
    pageGroupId: "page-group-home",
    stateId: "figma-1446-7433",
    pageAssetId: "figma-1372-4081",
    focusRect: { x: 384, y: 2628, width: 348, height: 474 },
  },
  {
    id: "binding-page-group-home-figma-1446-7442",
    pageGroupId: "page-group-home",
    stateId: "figma-1446-7442",
    pageAssetId: "figma-1372-4475",
    focusRect: { x: 384, y: 2628, width: 348, height: 474 },
  },
];
