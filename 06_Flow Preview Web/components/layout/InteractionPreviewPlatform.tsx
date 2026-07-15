"use client";

import Image from "next/image";
import * as React from "react";
import {
  figmaHtmlPageBindings,
  figmaHtmlPageGroups,
  figmaHtmlPages,
  figmaHtmlStates,
  type FigmaHtmlPageAsset,
  type FigmaHtmlPageBinding,
  type FigmaHtmlPageGroup,
  type FigmaHtmlStateAsset,
  type FigmaPageIconType,
  type FigmaPreviewAsset,
} from "@/data/interactionPreviewFigma.generated";
import { cn } from "@/lib/utils";

type ThemeMode = "light" | "dark";
type LayoutMode = "desktop" | "mobile";
type PageIconType = FigmaPageIconType;

type InteractionTreeChild = {
  id: string;
  label: string;
  state: FigmaHtmlStateAsset;
  figmaNodeId: string;
  children: InteractionTreeChild[];
};

type InteractionTreeNode = {
  id: string;
  label: string;
  pageGroup: FigmaHtmlPageGroup;
  iconType: PageIconType;
  badgeNumber: number | null;
  children: InteractionTreeChild[];
};

type PreviewFocusRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type PreviewFocusBehavior = "scroll" | "mark";

type PreviewScrollMetrics = {
  clientHeight: number;
  clientWidth: number;
  scrollHeight: number;
  scrollTop: number;
};

const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;
const SIDEBAR_WIDTH = 340;
const PHONE_WIDTH = 429;
const PHONE_HEIGHT = 940;
const STATE_CARDS_WIDTH = 509;
const CONTENT_GROUP_GAP = 150;
const THEME_STORAGE_KEY = "interaction-preview-theme";
const THEME_OVERRIDE_STORAGE_KEY = "interaction-preview-theme-override";
const ASSET_BASE = "/images/interaction-preview/figma";
const HOME_PREVIEW_BOTTOM_NAV_SRC = "/images/interaction-preview/preview-bottom-nav.png";
const loadedPreviewImageUrls = new Set<string>();
const previewImagePreloadPromises = new Map<string, Promise<void>>();
const STATUS_LABEL_MAX_LENGTH = 9;
const STATUS_LABEL_VISIBLE_LENGTH = 8;

const previewStickyHeaderConfig: Record<
  PageIconType,
  {
    height: number;
    src: string;
    width: number;
  }
> = {
  home: {
    height: 750,
    src: "/images/interaction-preview/headers/home.png",
    width: 2250,
  },
  list: {
    height: 1062,
    src: "/images/interaction-preview/headers/list.png",
    width: 2250,
  },
  detail: {
    height: 1026,
    src: "/images/interaction-preview/headers/detail.png",
    width: 2250,
  },
  order: {
    height: 750,
    src: "/images/interaction-preview/headers/order.png",
    width: 2250,
  },
};

const previewStickyHeaderThreshold: Record<PageIconType, number> = {
  detail: 80,
  home: 50,
  list: 0,
  order: 50,
};

const pageIconConfig: Record<
  PageIconType,
  {
    asset: string;
    badgeTop: number;
    height: number;
    label: string;
    maskHeight?: number;
    maskWidth?: number;
    renderHeight?: number;
    renderOffsetY?: number;
    renderWidth?: number;
    width: number;
  }
> = {
  home: {
    asset: "page-home.svg",
    badgeTop: 19,
    height: 19.15,
    label: "首页",
    width: 19.15,
  },
  list: {
    asset: "page-list.svg?v=2",
    badgeTop: 18,
    height: 17.5,
    label: "列表页",
    maskHeight: 19.5,
    maskWidth: 18.5,
    renderHeight: 19.5,
    renderWidth: 18.5,
    width: 16.5,
  },
  detail: {
    asset: "page-detail.svg",
    badgeTop: 18,
    height: 18.5,
    label: "详情页",
    width: 20.5,
  },
  order: {
    asset: "page-order.svg?v=2",
    badgeTop: 19,
    height: 20.6,
    label: "下单页",
    maskHeight: 22.72,
    maskWidth: 20.82,
    renderHeight: 22.72,
    renderWidth: 20.82,
    width: 18.7,
  },
};


function getScheduledTheme(date = new Date()): ThemeMode {
  const hour = date.getHours();

  return hour >= 8 && hour < 18 ? "light" : "dark";
}

function getNextThemeBoundary(date = new Date()) {
  const nextBoundary = new Date(date);
  const hour = date.getHours();

  if (hour < 8) {
    nextBoundary.setHours(8, 0, 0, 0);
    return nextBoundary.getTime();
  }

  if (hour < 18) {
    nextBoundary.setHours(18, 0, 0, 0);
    return nextBoundary.getTime();
  }

  nextBoundary.setDate(nextBoundary.getDate() + 1);
  nextBoundary.setHours(8, 0, 0, 0);
  return nextBoundary.getTime();
}

function readThemeOverride(now = Date.now()): ThemeMode | null {
  const storedOverride = window.localStorage.getItem(THEME_OVERRIDE_STORAGE_KEY);

  if (!storedOverride) {
    return null;
  }

  try {
    const parsed = JSON.parse(storedOverride) as {
      theme?: ThemeMode;
      expiresAt?: number;
    };

    if (
      (parsed.theme === "light" || parsed.theme === "dark") &&
      typeof parsed.expiresAt === "number" &&
      parsed.expiresAt > now
    ) {
      return parsed.theme;
    }
  } catch {
    // Ignore malformed storage from older builds or manual edits.
  }

  window.localStorage.removeItem(THEME_OVERRIDE_STORAGE_KEY);
  return null;
}

function getResolvedTheme() {
  return readThemeOverride() ?? getScheduledTheme();
}

function getInitialTheme() {
  return getScheduledTheme();
}

function preloadPreviewImage(url: string) {
  if (typeof window === "undefined" || !url) {
    return Promise.resolve();
  }

  if (loadedPreviewImageUrls.has(url)) {
    return Promise.resolve();
  }

  const cachedPromise = previewImagePreloadPromises.get(url);

  if (cachedPromise) {
    return cachedPromise;
  }

  const promise = new Promise<void>((resolve, reject) => {
    const image = new window.Image();
    let hasSettled = false;

    const resolveWhenDecoded = async () => {
      if (hasSettled) {
        return;
      }

      if (typeof image.decode === "function") {
        await image.decode().catch(() => undefined);
      }

      hasSettled = true;
      loadedPreviewImageUrls.add(url);
      resolve();
    };

    image.decoding = "async";
    image.onload = () => {
      void resolveWhenDecoded();
    };
    image.onerror = () => {
      if (hasSettled) {
        return;
      }

      hasSettled = true;
      reject(new Error(`Failed to preload image: ${url}`));
    };
    image.src = url;

    if (image.complete && image.naturalWidth > 0) {
      void resolveWhenDecoded();
    }
  }).catch((error) => {
    previewImagePreloadPromises.delete(url);
    throw error;
  });

  previewImagePreloadPromises.set(url, promise);
  return promise;
}

function getCompactStatusLabel(label: string) {
  const characters = Array.from(label);

  if (characters.length <= STATUS_LABEL_MAX_LENGTH) {
    return label;
  }

  return `${characters.slice(0, STATUS_LABEL_VISIBLE_LENGTH).join("")}…`;
}

function usePreviewImagePreload(urls: string[]) {
  const preloadKey = React.useMemo(() => urls.join("\n"), [urls]);

  React.useEffect(() => {
    const imageUrls = preloadKey.split("\n").filter(Boolean);

    if (typeof window === "undefined" || imageUrls.length === 0) {
      return;
    }

    const timers: number[] = [];

    const startTimer = window.setTimeout(() => {
      imageUrls.forEach((url, index) => {
        const timer = window.setTimeout(() => {
          void preloadPreviewImage(url);
        }, index * 80);

        timers.push(timer);
      });
    }, 120);

    return () => {
      window.clearTimeout(startTimer);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [preloadKey]);
}

function useCanvasScale() {
  const [metrics, setMetrics] = React.useState({
    scale: 1,
    viewportWidth: CANVAS_WIDTH,
    viewportHeight: CANVAS_HEIGHT,
    isReady: false,
  });

  React.useLayoutEffect(() => {
    const updateScale = () => {
      const visualViewport = window.visualViewport;
      const nextViewportWidth = visualViewport?.width ?? window.innerWidth;
      const nextViewportHeight = visualViewport?.height ?? window.innerHeight;

      if (nextViewportWidth < 1280) {
        setMetrics({
          scale: 1,
          viewportWidth: nextViewportWidth,
          viewportHeight: nextViewportHeight,
          isReady: true,
        });
        return;
      }

      const nextScale = Number(
        Math.min(
          nextViewportWidth / CANVAS_WIDTH,
          nextViewportHeight / CANVAS_HEIGHT,
        ).toFixed(4),
      );

      setMetrics({
        scale: nextScale,
        viewportWidth: nextViewportWidth,
        viewportHeight: nextViewportHeight,
        isReady: true,
      });
    };

    updateScale();
    window.addEventListener("resize", updateScale);
    window.visualViewport?.addEventListener("resize", updateScale);
    window.visualViewport?.addEventListener("scroll", updateScale);

    return () => {
      window.removeEventListener("resize", updateScale);
      window.visualViewport?.removeEventListener("resize", updateScale);
      window.visualViewport?.removeEventListener("scroll", updateScale);
    };
  }, []);

  return metrics;
}

function getPageIconType(text = ""): PageIconType {
  if (/下单|订单/.test(text)) {
    return "order";
  }

  if (text.includes("详情")) {
    return "detail";
  }

  if (text.includes("列表")) {
    return "list";
  }

  if (text.includes("首页")) {
    return "home";
  }

  return "list";
}

function buildInteractionTree(
  pageGroups: FigmaHtmlPageGroup[],
  states: FigmaHtmlStateAsset[],
): InteractionTreeNode[] {
  const typeCounts = pageGroups.reduce(
    (counts, pageGroup) => ({
      ...counts,
      [pageGroup.pageType]: counts[pageGroup.pageType] + 1,
    }),
    {
      detail: 0,
      home: 0,
      list: 0,
      order: 0,
    } satisfies Record<PageIconType, number>,
  );
  const typeIndexes: Record<PageIconType, number> = {
    detail: 0,
    home: 0,
    list: 0,
    order: 0,
  };

  return pageGroups.map((pageGroup) => {
    typeIndexes[pageGroup.pageType] += 1;

    return {
      id: pageGroup.id,
      label: pageGroup.displayName,
      pageGroup,
      iconType: pageGroup.pageType,
      badgeNumber:
        typeCounts[pageGroup.pageType] > 1
          ? typeIndexes[pageGroup.pageType]
          : null,
      children: states.map((state) => ({
        id: state.id,
        label: state.displayName,
        state,
        figmaNodeId: state.figmaNodeId,
        children: [],
      })),
    };
  });
}

function IconBadge({
  iconType,
  isActive,
  number,
}: {
  iconType: PageIconType;
  isActive: boolean;
  number: number | null;
}) {
  if (number === null) {
    return null;
  }

  return (
    <span
      className={cn(
        "font-ip-sf absolute left-[25px] flex size-[16px] items-center justify-center rounded-[45.571px] text-center text-[13px] font-medium leading-none",
        isActive
          ? "bg-[var(--ip-tree-active-bg)]"
          : "bg-[var(--ip-panel)] group-hover:bg-[var(--ip-hover)]",
      )}
      style={{ top: pageIconConfig[iconType].badgeTop }}
    >
      {number}
    </span>
  );
}

function PageTypeIcon({
  badgeNumber,
  iconType,
  isActive,
}: {
  badgeNumber: number | null;
  iconType: PageIconType;
  isActive: boolean;
}) {
  const icon = pageIconConfig[iconType];
  const maskUrl = `url(${ASSET_BASE}/${icon.asset})`;
  const maskHeight = icon.maskHeight ?? icon.height;
  const maskWidth = icon.maskWidth ?? icon.width;
  const renderHeight = icon.renderHeight ?? icon.height;
  const renderWidth = icon.renderWidth ?? icon.width;

  return (
    <span className="relative flex size-[44px] shrink-0 items-center justify-center rounded-[10.214px] transition-transform duration-[280ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-[1px]">
      <span
        aria-hidden="true"
        className="block shrink-0 bg-[var(--ip-page-icon)]"
        style={{
          height: renderHeight,
          maskImage: maskUrl,
          maskPosition: "center",
          maskRepeat: "no-repeat",
          maskSize: `${maskWidth}px ${maskHeight}px`,
          transform:
            icon.renderOffsetY === undefined
              ? undefined
              : `translateY(${icon.renderOffsetY}px)`,
          width: renderWidth,
          WebkitMaskImage: maskUrl,
          WebkitMaskPosition: "center",
          WebkitMaskRepeat: "no-repeat",
          WebkitMaskSize: `${maskWidth}px ${maskHeight}px`,
        }}
      />
      <IconBadge
        iconType={iconType}
        isActive={isActive}
        number={badgeNumber}
      />
    </span>
  );
}

function InteractionTreeArrow({ isExpanded }: { isExpanded: boolean }) {
  const arrowUrl = `url(${ASSET_BASE}/collapse-arrow-light.svg?v=3)`;

  return (
    <span
      aria-hidden="true"
      className={cn(
        "ip-tree-arrow absolute right-[24px] top-[26px] flex size-[16px] items-center justify-center",
        isExpanded ? "rotate-90" : "-rotate-90",
      )}
    >
      <span
        className="block size-[16px] bg-[var(--ip-tree-arrow)]"
        style={{
          maskImage: arrowUrl,
          maskPosition: "center",
          maskRepeat: "no-repeat",
          maskSize: "12px 12px",
          WebkitMaskImage: arrowUrl,
          WebkitMaskPosition: "center",
          WebkitMaskRepeat: "no-repeat",
          WebkitMaskSize: "12px 12px",
        }}
      />
    </span>
  );
}

function InteractionTreeItem({
  isActive,
  isDesktop,
  isExpanded,
  node,
  onToggle,
}: {
  isActive: boolean;
  isDesktop: boolean;
  isExpanded: boolean;
  node: InteractionTreeNode;
  onToggle: (nodeId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(node.id)}
      aria-expanded={isExpanded}
      aria-pressed={isActive}
      className={cn(
        "ip-sidebar-item ip-tree-parent group relative flex max-w-full items-center gap-[8px] p-[12px] text-left",
        isDesktop ? "w-[292px]" : "w-[332px]",
        isActive
          ? "bg-[var(--ip-tree-active-bg)]"
          : "bg-transparent hover:bg-[var(--ip-tree-hover-bg)]",
      )}
      style={{ borderRadius: "var(--ip-tree-parent-radius)" }}
    >
      <PageTypeIcon
        badgeNumber={node.badgeNumber}
        iconType={node.iconType}
        isActive={isActive}
      />
      <span className="font-ip-pingfang min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[20px] font-normal leading-normal text-[var(--ip-tree-text-primary)]">
        {node.label}
      </span>
      <InteractionTreeArrow isExpanded={isExpanded} />
    </button>
  );
}

function InteractionStatusItem({
  child,
  isDesktop,
  isActive,
  onSelect,
}: {
  child: InteractionTreeChild;
  isDesktop: boolean;
  isActive: boolean;
  onSelect: (stateId: string) => void;
}) {
  const compactLabel = getCompactStatusLabel(child.label);

  return (
    <button
      type="button"
      title={child.label}
      aria-label={child.label}
      aria-pressed={isActive}
      onClick={() => onSelect(child.id)}
      className="ip-tree-child group/status relative flex h-[49px] w-[var(--ip-tree-child-row-width)] shrink-0 items-start justify-start gap-[30px] overflow-visible text-left"
      style={{
        ["--ip-tree-child-bg-width" as string]: isDesktop ? "189px" : "229px",
        ["--ip-tree-child-bg-height" as string]: "55px",
        ["--ip-tree-child-row-width" as string]: isDesktop ? "228px" : "265px",
        ["--ip-tree-child-center-y" as string]: "36px",
      }}
    >
      <span className="ip-tree-child-hover-bg absolute left-[36px] top-[calc(var(--ip-tree-child-center-y)-(var(--ip-tree-child-bg-height)/2))] h-[var(--ip-tree-child-bg-height)] w-[var(--ip-tree-child-bg-width)]" />
      {isActive ? (
        <span
          aria-hidden="true"
          className="ip-tree-child-active-bg absolute left-[36px] top-[calc(var(--ip-tree-child-center-y)-(var(--ip-tree-child-bg-height)/2))] h-[var(--ip-tree-child-bg-height)] w-[var(--ip-tree-child-bg-width)]"
        />
      ) : null}
      <span aria-hidden="true" className="ip-tree-branch relative -ml-px mt-px h-[49px] w-[24px] shrink-0" />
      <span
        className={cn(
          "ip-tree-child-label font-ip-pingfang relative flex h-[72px] items-center whitespace-nowrap text-[18px] font-normal leading-normal",
          isActive
            ? "text-[var(--ip-tree-text-primary)]"
            : "text-[var(--ip-tree-text-secondary)]",
        )}
      >
        {compactLabel}
      </span>
    </button>
  );
}

function InteractionTreeChildren({
  isDesktop,
  items,
  isExpanded,
  pageGroupId,
  selectedStateId,
  onSelect,
}: {
  isDesktop: boolean;
  items: InteractionTreeChild[];
  isExpanded: boolean;
  pageGroupId: string;
  selectedStateId: string | null;
  onSelect: (pageGroupId: string, stateId: string) => void;
}) {
  return (
    <div className="ip-tree-children" data-expanded={isExpanded ? "true" : "false"}>
      <div className="ip-tree-children-inner">
        <div className="flex items-start px-[66px]">
          <span aria-hidden="true" className="ip-tree-trunk w-px shrink-0 self-stretch" />
          <div className="relative flex shrink-0 flex-col items-start gap-[24px]">
            {items.map((child) => (
              <InteractionStatusItem
                key={child.id}
                child={child}
                isDesktop={isDesktop}
                isActive={child.id === selectedStateId}
                onSelect={(stateId) => onSelect(pageGroupId, stateId)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function InteractionTree({
  isDesktop,
  nodes,
  selectedPageGroupId,
  selectedStateId,
  onSelectPageGroup,
  onSelectTreeState,
}: {
  isDesktop: boolean;
  nodes: InteractionTreeNode[];
  selectedPageGroupId: string | null;
  selectedStateId: string | null;
  onSelectPageGroup: (pageGroupId: string) => void;
  onSelectTreeState: (pageGroupId: string, stateId: string) => void;
}) {
  const initialExpandedNodeId = React.useMemo(
    () => nodes.find((node) => node.children.length > 0)?.id ?? null,
    [nodes],
  );
  const [expandedNodeIds, setExpandedNodeIds] = React.useState<string[]>(() =>
    initialExpandedNodeId ? [initialExpandedNodeId] : [],
  );
  const hasInitializedExpansionRef = React.useRef(false);

  React.useEffect(() => {
    if (hasInitializedExpansionRef.current || !initialExpandedNodeId) {
      return;
    }

    setExpandedNodeIds([initialExpandedNodeId]);
    hasInitializedExpansionRef.current = true;
  }, [initialExpandedNodeId]);

  const toggleNode = React.useCallback((nodeId: string) => {
    onSelectPageGroup(nodeId);
    setExpandedNodeIds((current) =>
      current.includes(nodeId)
        ? current.filter((id) => id !== nodeId)
        : [...current, nodeId],
    );
  }, [onSelectPageGroup]);

  return (
    <div className="flex flex-col gap-[40px]">
      {nodes.map((node) => {
        const isExpanded = expandedNodeIds.includes(node.id);
        const isActive = node.id === selectedPageGroupId;

        return (
          <div
            key={node.id}
            className={cn(
              "flex flex-col items-start gap-[var(--ip-tree-root-gap)]",
              isDesktop && "ip-sidebar-motion-child",
            )}
          >
            <InteractionTreeItem
              isActive={isActive}
              isDesktop={isDesktop}
              isExpanded={isExpanded}
              node={node}
              onToggle={toggleNode}
            />
            <InteractionTreeChildren
              isDesktop={isDesktop}
              items={node.children}
              isExpanded={isExpanded}
              pageGroupId={node.id}
              selectedStateId={isActive ? selectedStateId : null}
              onSelect={onSelectTreeState}
            />
          </div>
        );
      })}
    </div>
  );
}

function ThemeDivider({ className }: { className?: string }) {
  const gradientId = React.useId();
  const lightGradientId = `${gradientId}-light`;
  const darkGradientId = `${gradientId}-dark`;

  return (
    <svg
      aria-hidden="true"
      className={cn(
        "pointer-events-none block overflow-visible",
        className,
      )}
      fill="none"
      height="1"
      preserveAspectRatio="none"
      viewBox="0 0 268 1"
      width="268"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        className="ip-theme-divider-path-light"
        d="M0 0.5L268 0.500023"
        stroke={`url(#${lightGradientId})`}
      />
      <path
        className="ip-theme-divider-path-dark"
        d="M0 0.5L268 0.500023"
        stroke={`url(#${darkGradientId})`}
      />
      <defs>
        <linearGradient
          id={lightGradientId}
          x1="-4.37114e-08"
          y1="1"
          x2="268"
          y2="1.00002"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#2E2E2E" />
          <stop offset="0.25" stopColor="#2E2E2E" />
          <stop offset="0.75" stopColor="#2E2E2E" />
          <stop
            offset="1"
            stopColor="#2E2E2E"
            stopOpacity="0"
          />
        </linearGradient>
        <linearGradient
          id={darkGradientId}
          x1="-4.37114e-08"
          y1="1"
          x2="268"
          y2="1.00002"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#FFFFFF" />
          <stop offset="0.25" stopColor="#FFFFFF" />
          <stop offset="0.75" stopColor="#FFFFFF" />
          <stop
            offset="1"
            stopColor="#FFFFFF"
            stopOpacity="0"
          />
        </linearGradient>
      </defs>
    </svg>
  );
}

function SidebarCollapseButton({
  theme,
  collapsed,
  onToggle,
  className,
  style,
}: {
  theme: ThemeMode;
  collapsed: boolean;
  onToggle: () => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const strokeColor = theme === "dark" ? "#79797A" : "#A9ACB2";

  return (
    <button
      type="button"
      aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
      onClick={onToggle}
      style={style}
      className={cn(
        "relative h-[76px] w-[82px] shrink-0",
        className,
      )}
    >
      <svg
        width="30"
        height="24.375"
        viewBox="0 0 32 26"
        className={cn(
          "absolute left-1/2 top-1/2 h-[24.375px] w-[30px] -translate-x-1/2 -translate-y-1/2 overflow-visible",
          collapsed && "ip-collapse-icon-collapsed",
        )}
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        fill="none"
      >
        <rect
          x="1"
          y="1"
          width="30"
          height="24"
          rx="6"
          stroke={strokeColor}
          strokeWidth="2"
        />
        <path
          d="M25 1C28.3137 1 31 3.68629 31 7V19C31 22.3137 28.3137 25 25 25H11V1H25Z"
          stroke={strokeColor}
          strokeWidth="2"
        />
        <path
          className="ip-collapse-arrow"
          d="M19.3389 8.36523L22.8851 11.9115C23.4579 12.4842 23.4579 13.4129 22.8851 13.9857L19.3389 17.5319"
          stroke={strokeColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

function SidebarNav({
  theme,
  pageGroups,
  states,
  selectedPageGroupId,
  selectedStateId,
  onSelectPageGroup,
  onSelectTreeState,
  onThemeToggle,
  onSidebarToggle,
  collapsed,
  mode,
  desktopCanvasHeight,
}: {
  theme: ThemeMode;
  pageGroups: FigmaHtmlPageGroup[];
  states: FigmaHtmlStateAsset[];
  selectedPageGroupId: string | null;
  selectedStateId: string | null;
  onSelectPageGroup: (pageGroupId: string) => void;
  onSelectTreeState: (pageGroupId: string, stateId: string) => void;
  onThemeToggle: () => void;
  onSidebarToggle: () => void;
  collapsed: boolean;
  mode: LayoutMode;
  desktopCanvasHeight?: number;
}) {
  const interactionTreeNodes = React.useMemo(
    () => buildInteractionTree(pageGroups, states),
    [pageGroups, states],
  );
  const resolvedSelectedStateId = selectedStateId ?? states[0]?.id ?? null;
  const resolvedSelectedPageGroupId =
    selectedPageGroupId ?? pageGroups[0]?.id ?? null;
  const isDesktop = mode === "desktop";

  return (
    <>
      <aside
        aria-hidden={isDesktop && collapsed}
        data-sidebar-collapsed={isDesktop && collapsed ? "true" : "false"}
        className={cn(
          "ip-sidebar-panel ip-layout-motion relative overflow-hidden bg-[var(--ip-panel)] text-[var(--ip-text)]",
          isDesktop
            ? "absolute left-0 top-0 w-[340px] rounded-r-[40px]"
            : "w-full rounded-[32px]",
          isDesktop &&
            (collapsed
              ? "pointer-events-none -translate-x-[18px] scale-[0.985] opacity-0"
              : "translate-x-0 scale-100 opacity-100"),
        )}
        style={isDesktop && desktopCanvasHeight ? { height: desktopCanvasHeight } : undefined}
      >
      <div className={cn("ip-sidebar-panel-body relative", isDesktop ? "h-full" : "min-h-0")}>
        <div
          className={cn(
            "ip-sidebar-motion-child flex w-full items-center",
            isDesktop
              ? "gap-[56px] px-[48px] py-[60px]"
              : "justify-between px-6 py-7",
          )}
        >
          <p className="ip-sidebar-title whitespace-nowrap text-[26px] leading-normal">
            交互预览工具
          </p>
          {!isDesktop ? (
            <SidebarCollapseButton
              theme={theme}
              collapsed={collapsed}
              onToggle={onSidebarToggle}
            />
          ) : null}
        </div>

        {isDesktop ? (
          <ThemeDivider
            className="ip-sidebar-motion-child absolute left-[48px] top-[156px] h-px w-[268px]"
          />
        ) : (
          <ThemeDivider className="mx-6 h-px w-[calc(100%_-_48px)]" />
        )}

        <div
          className={cn(
            "flex flex-col gap-[40px]",
            isDesktop ? "px-[24px] py-[40px]" : "px-4 py-6",
          )}
        >
          <InteractionTree
            isDesktop={isDesktop}
            nodes={interactionTreeNodes}
            selectedPageGroupId={resolvedSelectedPageGroupId}
            selectedStateId={resolvedSelectedStateId}
            onSelectPageGroup={onSelectPageGroup}
            onSelectTreeState={onSelectTreeState}
          />
        </div>

        {isDesktop ? (
          <ThemeDivider
            className="ip-sidebar-motion-child absolute right-[24px] bottom-[115px] h-px w-[268px]"
          />
        ) : (
          <ThemeDivider className="mx-6 h-px w-[calc(100%_-_48px)]" />
        )}

        <div
          className={cn(
            isDesktop && "ip-sidebar-motion-child",
            isDesktop ? "absolute bottom-[24px] left-[24px]" : "px-4 py-6",
          )}
        >
          <ThemeToggle
            isDesktop={isDesktop}
            theme={theme}
            onThemeToggle={onThemeToggle}
          />
        </div>
      </div>
    </aside>
    </>
  );
}

function ThemeToggle({
  isDesktop,
  theme,
  onThemeToggle,
}: {
  isDesktop: boolean;
  theme: ThemeMode;
  onThemeToggle: () => void;
}) {
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={onThemeToggle}
      className={cn(
        "ip-theme-toggle group flex max-w-full items-center gap-[8px] rounded-[16px] bg-[var(--ip-panel)] p-[12px] text-left hover:bg-[var(--ip-active)]",
        isDesktop ? "w-[292px]" : "w-[332px]",
      )}
    >
      <span className="ip-theme-toggle-icon flex size-[44px] shrink-0 items-center justify-center rounded-[10.214px]">
        <Image
          alt=""
          width={30}
          height={30}
          className="size-[30px]"
          src={isDark ? `${ASSET_BASE}/sun-dark.svg` : `${ASSET_BASE}/moon-light.svg`}
        />
      </span>
      <span className="ip-theme-toggle-label font-ip-pingfang min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[20px] font-normal leading-normal">
        {isDark ? "开启浅色模式" : "开启深色模式"}
      </span>
    </button>
  );
}

function PhoneScrollViewport({
  assetHeight,
  assetWidth,
  children,
  contentKey,
  focusBottomInsetRatio = 0,
  focusBehavior = "scroll",
  focusRect,
  focusSignal,
  focusTopInsetRatio = 0,
  onScrollOffsetChange,
}: {
  assetHeight?: number;
  assetWidth?: number;
  children: React.ReactNode;
  contentKey: string;
  focusBottomInsetRatio?: number;
  focusBehavior?: PreviewFocusBehavior;
  focusRect?: PreviewFocusRect;
  focusSignal?: number;
  focusTopInsetRatio?: number;
  onScrollOffsetChange?: (metrics: PreviewScrollMetrics) => void;
}) {
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const assetLayerRef = React.useRef<HTMLDivElement>(null);
  const dragStateRef = React.useRef<{
    hasMoved: boolean;
    lastTime: number;
    lastY: number;
    pointerId: number;
    startScrollTop: number;
    startY: number;
    velocity: number;
  } | null>(null);
  const momentumFrameRef = React.useRef<number | null>(null);
  const focusScrollFrameRef = React.useRef<number | null>(null);
  const focusRevealTimerRef = React.useRef<number | null>(null);
  const focusHideTimerRef = React.useRef<number | null>(null);
  const suppressNextClickRef = React.useRef(false);
  const [activeFocusRect, setActiveFocusRect] =
    React.useState<PreviewFocusRect | null>(null);
  const [focusAnimationKey, setFocusAnimationKey] = React.useState(0);
  const [isScrollable, setIsScrollable] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);

  const emitScrollMetrics = React.useCallback(
    (viewport: HTMLDivElement) => {
      onScrollOffsetChange?.({
        clientHeight: viewport.clientHeight,
        clientWidth: viewport.clientWidth,
        scrollHeight: viewport.scrollHeight,
        scrollTop: viewport.scrollTop,
      });
    },
    [onScrollOffsetChange],
  );

  const clampScrollTop = React.useCallback((viewport: HTMLDivElement, value: number) => {
    const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);

    return Math.min(maxScrollTop, Math.max(0, value));
  }, []);

  const cancelMomentumScroll = React.useCallback(() => {
    if (momentumFrameRef.current === null) {
      return;
    }

    window.cancelAnimationFrame(momentumFrameRef.current);
    momentumFrameRef.current = null;
  }, []);

  const clearFocusTimers = React.useCallback(() => {
    if (focusScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(focusScrollFrameRef.current);
      focusScrollFrameRef.current = null;
    }

    if (focusRevealTimerRef.current !== null) {
      window.clearTimeout(focusRevealTimerRef.current);
      focusRevealTimerRef.current = null;
    }

    if (focusHideTimerRef.current !== null) {
      window.clearTimeout(focusHideTimerRef.current);
      focusHideTimerRef.current = null;
    }
  }, []);

  const startMomentumScroll = React.useCallback(
    (initialVelocity: number) => {
      const viewport = viewportRef.current;

      if (!viewport || Math.abs(initialVelocity) < 0.28) {
        return;
      }

      const startedAt = performance.now();
      let lastFrameTime = startedAt;
      let velocity = Math.max(-2.4, Math.min(2.4, initialVelocity));

      const step = (frameTime: number) => {
        const currentViewport = viewportRef.current;

        if (!currentViewport) {
          momentumFrameRef.current = null;
          return;
        }

        const elapsed = Math.min(24, frameTime - lastFrameTime);
        const nextScrollTop = clampScrollTop(
          currentViewport,
          currentViewport.scrollTop + velocity * elapsed,
        );
        const hitBoundary = nextScrollTop === currentViewport.scrollTop;

        currentViewport.scrollTop = nextScrollTop;
        velocity *= Math.pow(0.88, elapsed / 16);
        lastFrameTime = frameTime;

        if (Math.abs(velocity) < 0.045 || hitBoundary || frameTime - startedAt > 520) {
          momentumFrameRef.current = null;
          return;
        }

        momentumFrameRef.current = window.requestAnimationFrame(step);
      };

      momentumFrameRef.current = window.requestAnimationFrame(step);
    },
    [clampScrollTop],
  );

  React.useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;

    if (!viewport || !content) {
      return;
    }

    const updateScrollableState = () => {
      const viewportHeight = viewport.clientHeight;
      const contentHeight = content.getBoundingClientRect().height;

      setIsScrollable(contentHeight > viewportHeight + 1);
      emitScrollMetrics(viewport);
    };

    if (focusBehavior === "scroll") {
      viewport.scrollTop = 0;
    }
    updateScrollableState();
    emitScrollMetrics(viewport);

    const resizeObserver = new ResizeObserver(updateScrollableState);
    resizeObserver.observe(viewport);
    resizeObserver.observe(content);
    window.addEventListener("resize", updateScrollableState);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateScrollableState);
    };
  }, [contentKey, emitScrollMetrics, focusBehavior]);

  React.useEffect(
    () => () => {
      cancelMomentumScroll();
      clearFocusTimers();
    },
    [cancelMomentumScroll, clearFocusTimers],
  );

  React.useEffect(() => {
    const viewport = viewportRef.current;
    const assetLayer = assetLayerRef.current;

    if (
      !focusSignal ||
      !focusRect ||
      !assetWidth ||
      !assetHeight ||
      !viewport ||
      !assetLayer
    ) {
      return;
    }

    clearFocusTimers();
    cancelMomentumScroll();
    setActiveFocusRect(null);

    let attempts = 0;

    const applyFocusScroll = () => {
      const currentViewport = viewportRef.current;
      const currentAssetLayer = assetLayerRef.current;

      if (!currentViewport || !currentAssetLayer) {
        return;
      }

      const assetLayerLayoutHeight =
        currentAssetLayer.scrollHeight || currentAssetLayer.offsetHeight;
      const assetLayerLayoutWidth =
        currentAssetLayer.clientWidth || currentAssetLayer.offsetWidth;

      if (
        attempts < 10 &&
        (assetLayerLayoutHeight <= currentViewport.clientHeight ||
          currentViewport.scrollHeight <= currentViewport.clientHeight)
      ) {
        attempts += 1;
        focusRevealTimerRef.current = window.setTimeout(applyFocusScroll, 80);
        return;
      }

      const revealFocusRing = (delay = 0) => {
        const showFocusRing = () => {
          setFocusAnimationKey(focusSignal);
          setActiveFocusRect(focusRect);

          focusHideTimerRef.current = window.setTimeout(() => {
            setActiveFocusRect(null);
            focusHideTimerRef.current = null;
          }, 1550);
          focusRevealTimerRef.current = null;
        };

        if (delay <= 0) {
          showFocusRing();
          return;
        }

        focusRevealTimerRef.current = window.setTimeout(showFocusRing, delay);
      };

      const scale =
        (assetLayerLayoutWidth || currentAssetLayer.getBoundingClientRect().width) /
        assetWidth;
      const targetTop = focusRect.y * scale;
      const targetHeight = focusRect.height * scale;
      const topInset = Math.min(
        currentViewport.clientHeight * 0.38,
        currentViewport.clientWidth * focusTopInsetRatio,
      );
      const bottomInset = Math.min(
        currentViewport.clientHeight * 0.32,
        currentViewport.clientWidth * focusBottomInsetRatio,
      );
      const focusMargin = 18;
      const safeTop = topInset + focusMargin;
      const safeBottom = bottomInset + focusMargin;
      const safeHeight = Math.max(
        targetHeight,
        currentViewport.clientHeight - safeTop - safeBottom,
      );
      const lowerScrollBound =
        targetTop + targetHeight + safeBottom - currentViewport.clientHeight;
      const upperScrollBound = targetTop - safeTop;
      const idealScrollTop =
        targetTop - safeTop - Math.max(0, (safeHeight - targetHeight) / 2);
      const desiredScrollTop =
        lowerScrollBound <= upperScrollBound
          ? Math.min(
              Math.max(idealScrollTop, lowerScrollBound),
              upperScrollBound,
            )
          : upperScrollBound;
      const targetScrollTop = clampScrollTop(currentViewport, desiredScrollTop);
      const currentScrollTop = currentViewport.scrollTop;
      const targetBottom = targetTop + targetHeight;
      const viewportSafeTop = currentScrollTop + safeTop;
      const viewportSafeBottom =
        currentScrollTop + currentViewport.clientHeight - safeBottom;
      const isSafelyVisible =
        targetTop >= viewportSafeTop - 2 && targetBottom <= viewportSafeBottom + 2;
      const isAlreadyAnchored =
        Math.abs(currentScrollTop - targetScrollTop) <= 1.5;

      if (isSafelyVisible || isAlreadyAnchored) {
        revealFocusRing();
        return;
      }

      currentViewport.scrollTo({
        top: targetScrollTop,
        behavior: "smooth",
      });

      const startedAt = performance.now();
      let lastScrollTop = currentViewport.scrollTop;
      let stableFrames = 0;

      const waitForScrollToSettle = (frameTime: number) => {
        const viewportAfterScroll = viewportRef.current;

        if (!viewportAfterScroll) {
          focusScrollFrameRef.current = null;
          return;
        }

        const distanceToTarget = Math.abs(
          viewportAfterScroll.scrollTop - targetScrollTop,
        );
        const movement = Math.abs(viewportAfterScroll.scrollTop - lastScrollTop);

        if (movement < 0.2) {
          stableFrames += 1;
        } else {
          stableFrames = 0;
        }

        lastScrollTop = viewportAfterScroll.scrollTop;

        if (
          distanceToTarget <= 1.5 ||
          (stableFrames >= 3 && frameTime - startedAt > 260) ||
          frameTime - startedAt > 980
        ) {
          focusScrollFrameRef.current = null;
          if (distanceToTarget > 1.5) {
            viewportAfterScroll.scrollTop = targetScrollTop;
            emitScrollMetrics(viewportAfterScroll);
          }
          revealFocusRing();
          return;
        }

        focusScrollFrameRef.current = window.requestAnimationFrame(
          waitForScrollToSettle,
        );
      };

      focusScrollFrameRef.current = window.requestAnimationFrame(
        waitForScrollToSettle,
      );
    };

    focusScrollFrameRef.current = window.requestAnimationFrame(applyFocusScroll);

    return clearFocusTimers;
  }, [
    assetHeight,
    assetWidth,
    cancelMomentumScroll,
    clampScrollTop,
    clearFocusTimers,
    emitScrollMetrics,
    focusBehavior,
    focusBottomInsetRatio,
    focusRect,
    focusSignal,
    focusTopInsetRatio,
  ]);

  const endDrag = React.useCallback(() => {
    const dragState = dragStateRef.current;

    if (dragState?.hasMoved) {
      suppressNextClickRef.current = true;
      startMomentumScroll(dragState.velocity);
    }

    dragStateRef.current = null;
    setIsDragging(false);
  }, [startMomentumScroll]);

  return (
    <div
      ref={viewportRef}
      onScroll={(event) => {
        emitScrollMetrics(event.currentTarget);
      }}
      onClickCapture={(event) => {
        if (!suppressNextClickRef.current) {
          return;
        }

        suppressNextClickRef.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerCancel={endDrag}
      onPointerDown={(event) => {
        if (!isScrollable || (event.pointerType === "mouse" && event.button !== 0)) {
          return;
        }

        dragStateRef.current = {
          hasMoved: false,
          lastTime: performance.now(),
          lastY: event.clientY,
          pointerId: event.pointerId,
          startScrollTop: event.currentTarget.scrollTop,
          startY: event.clientY,
          velocity: 0,
        };
        cancelMomentumScroll();
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const dragState = dragStateRef.current;

        if (!dragState || dragState.pointerId !== event.pointerId) {
          return;
        }

        const deltaY = event.clientY - dragState.startY;
        const now = performance.now();
        const elapsed = Math.max(1, now - dragState.lastTime);
        const instantVelocity = (dragState.lastY - event.clientY) / elapsed;

        if (Math.abs(deltaY) > 3) {
          dragState.hasMoved = true;
          setIsDragging(true);
        }

        if (dragState.hasMoved) {
          event.preventDefault();
          dragState.velocity = dragState.velocity * 0.32 + instantVelocity * 0.68;
          dragState.lastTime = now;
          dragState.lastY = event.clientY;
          event.currentTarget.scrollTop = clampScrollTop(
            event.currentTarget,
            dragState.startScrollTop - deltaY,
          );
        }
      }}
      onPointerUp={endDrag}
      className={cn(
        "ip-phone-scroll relative h-full w-full overflow-x-hidden rounded-[52px] bg-white [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        isScrollable ? "overflow-y-auto" : "overflow-y-hidden",
        isScrollable && (isDragging ? "cursor-grabbing" : "cursor-grab"),
      )}
      data-scrollable={isScrollable ? "true" : "false"}
    >
      <div ref={contentRef} className="relative min-h-full w-full">
        <div ref={assetLayerRef} className="relative w-full">
          {children}
          {activeFocusRect && assetWidth && assetHeight ? (
            <span
              key={focusAnimationKey}
              aria-hidden="true"
              className="ip-phone-focus-ring"
              data-preview-focus-ring="true"
              style={{
                height: `${(activeFocusRect.height / assetHeight) * 100}%`,
                left: `${(activeFocusRect.x / assetWidth) * 100}%`,
                top: `${(activeFocusRect.y / assetHeight) * 100}%`,
                width: `${(activeFocusRect.width / assetWidth) * 100}%`,
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function IOSHomeIndicator() {
  return (
    <span
      aria-hidden="true"
      className="ip-ios-home-indicator"
    />
  );
}

function PreviewStickyHeader({
  header,
  visible,
}: {
  header: {
    height: number;
    src: string;
    width: number;
  };
  visible: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "ip-home-preview-header",
        visible
          ? "ip-home-preview-header-visible"
          : "ip-home-preview-header-hidden",
      )}
    >
      <span className="ip-home-preview-header-top-mask" />
      <Image
        src={header.src}
        alt=""
        width={header.width}
        height={header.height}
        sizes="429px"
        unoptimized
        className="ip-home-preview-header-image"
        draggable={false}
      />
    </div>
  );
}

function HomePreviewBottomNav() {
  return (
    <div
      aria-hidden="true"
      className="ip-home-bottom-nav"
    >
      <span className="ip-home-bottom-nav-top-mask" />
      <Image
        src={HOME_PREVIEW_BOTTOM_NAV_SRC}
        alt=""
        width={2250}
        height={435}
        sizes="429px"
        unoptimized
        className="ip-home-bottom-nav-image"
        draggable={false}
      />
    </div>
  );
}

function PreviewAssetImage({
  asset,
  alt,
  className,
  imageClassName,
  preservePreviousOnSwitch = true,
  priority = false,
  sizes,
}: {
  asset: FigmaPreviewAsset;
  alt: string;
  className?: string;
  imageClassName?: string;
  preservePreviousOnSwitch?: boolean;
  priority?: boolean;
  sizes: string;
}) {
  const [visibleAsset, setVisibleAsset] = React.useState(asset);
  const [status, setStatus] = React.useState<"loading" | "loaded" | "error">(
    "loading",
  );

  React.useEffect(() => {
    if (asset.imageUrl === visibleAsset.imageUrl) {
      if (loadedPreviewImageUrls.has(asset.imageUrl)) {
        setStatus("loaded");
        return;
      }

      let isCancelled = false;

      setStatus("loading");
      void preloadPreviewImage(asset.imageUrl)
        .then(() => {
          if (!isCancelled) {
            setStatus("loaded");
          }
        })
        .catch(() => {
          if (!isCancelled) {
            setStatus("error");
          }
        });

      return () => {
        isCancelled = true;
      };
    }

    if (!preservePreviousOnSwitch) {
      setVisibleAsset(asset);
      setStatus(loadedPreviewImageUrls.has(asset.imageUrl) ? "loaded" : "loading");
      void preloadPreviewImage(asset.imageUrl);
      return;
    }

    let isCancelled = false;

    const commitImage = () => {
      if (isCancelled) {
        return;
      }

      setVisibleAsset(asset);
      setStatus("loaded");
    };

    const failImage = () => {
      if (isCancelled) {
        return;
      }

      setStatus("error");
    };

    setStatus("loading");

    if (loadedPreviewImageUrls.has(asset.imageUrl)) {
      commitImage();
      return () => {
        isCancelled = true;
      };
    }

    void preloadPreviewImage(asset.imageUrl).then(commitImage).catch(failImage);

    return () => {
      isCancelled = true;
    };
  }, [asset, preservePreviousOnSwitch, visibleAsset.imageUrl]);

  const isSwitching = visibleAsset.imageUrl !== asset.imageUrl;
  const showInitialSkeleton = status === "loading" && !isSwitching;
  const showError = status === "error" && !isSwitching;

  return (
    <div
      className={cn("relative overflow-hidden", className)}
      data-figma-node-id={visibleAsset.figmaNodeId}
    >
      {showInitialSkeleton ? (
        <span
          aria-hidden="true"
          className="ip-preview-skeleton absolute inset-0 z-10 rounded-[inherit]"
        />
      ) : null}
      {showError ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-[inherit] bg-[var(--ip-card)] px-4 text-center text-[14px] text-[var(--ip-text)]">
          图片加载失败
        </div>
      ) : null}
      <Image
        key={visibleAsset.imageUrl}
        src={visibleAsset.imageUrl}
        alt={visibleAsset.name || alt}
        width={visibleAsset.width}
        height={visibleAsset.height}
        priority={priority}
        sizes={sizes}
        unoptimized
        className={cn(
          "ip-preview-image-swap transition-opacity duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          showInitialSkeleton || showError ? "opacity-0" : "opacity-100",
          imageClassName,
        )}
        draggable={false}
        onLoad={() => {
          if (visibleAsset.imageUrl === asset.imageUrl) {
            setStatus("loaded");
          }
        }}
        onError={() => {
          if (visibleAsset.imageUrl === asset.imageUrl) {
            setStatus("error");
          }
        }}
      />
    </div>
  );
}

function FigmaPhoneFrame({
  emptyMessage = "当前页面暂无该状态切图",
  focusRect,
  focusBehavior = "scroll",
  focusSignal = 0,
  page,
  pageType,
  mode,
  placement = "figma",
}: {
  emptyMessage?: string;
  focusRect?: PreviewFocusRect;
  focusBehavior?: PreviewFocusBehavior;
  focusSignal?: number;
  page?: FigmaHtmlPageAsset;
  pageType?: PageIconType;
  mode: LayoutMode;
  placement?: "figma" | "flow";
}) {
  const isDesktop = mode === "desktop";
  const [previewScrollMetrics, setPreviewScrollMetrics] =
    React.useState<PreviewScrollMetrics | null>(null);
  const headerType = pageType ?? getPageIconType(page?.name ?? "");
  const stickyHeader = previewStickyHeaderConfig[headerType];
  const stickyHeaderThreshold = previewStickyHeaderThreshold[headerType];
  const shouldShowBottomNav = headerType === "home";
  const previewScrollTop = previewScrollMetrics?.scrollTop ?? 0;

  const phoneFrameStyle = {
    "--ip-phone-stroke": isDesktop ? "22px" : "clamp(14px, 5vw, 22px)",
    boxShadow: "0 0 0 var(--ip-phone-stroke) var(--ip-phone-border)",
  } as React.CSSProperties & Record<"--ip-phone-stroke", string>;

  return (
    <section
      className={cn(
        "ip-phone-enter relative overflow-hidden bg-white",
        isDesktop
          ? cn(
              "h-[940px] w-[429px] shrink-0 rounded-[52px]",
              placement === "figma" && "absolute left-[620px] top-[70px]",
            )
          : "mx-auto aspect-[429/940] w-[min(429px,calc(100vw-88px))] rounded-[52px]",
      )}
      style={phoneFrameStyle}
      data-preview-phone="true"
    >
      <PhoneScrollViewport
        assetHeight={page?.height}
        assetWidth={page?.width}
        contentKey={page?.id ?? "empty-page"}
        focusBottomInsetRatio={shouldShowBottomNav ? 435 / 2250 : 0}
        focusBehavior={focusBehavior}
        focusRect={focusRect}
        focusSignal={focusSignal}
        focusTopInsetRatio={stickyHeader.height / stickyHeader.width}
        onScrollOffsetChange={setPreviewScrollMetrics}
      >
        {page ? (
          <PreviewAssetImage
            asset={page}
            alt={page.name}
            priority
            sizes="429px"
            className="min-h-full w-full bg-white"
            imageClassName="block h-auto w-full select-none"
          />
        ) : (
          <div className="flex min-h-full items-center justify-center px-8 text-center text-[16px] text-[#919499]">
            {emptyMessage}
          </div>
        )}
      </PhoneScrollViewport>
      <PreviewStickyHeader
        header={stickyHeader}
        visible={previewScrollTop > stickyHeaderThreshold}
      />
      {shouldShowBottomNav ? <HomePreviewBottomNav /> : null}
      <IOSHomeIndicator />
    </section>
  );
}

function StateCards({
  states,
  selectedStateId,
  onSelectState,
  desktopEdgePadding = 70,
  desktopTopPadding = 70,
  desktopViewportHeight,
  mode,
  placement = "figma",
}: {
  states: FigmaHtmlStateAsset[];
  selectedStateId: string | null;
  onSelectState: (stateId: string) => void;
  desktopEdgePadding?: number;
  desktopTopPadding?: number;
  desktopViewportHeight?: number;
  mode: LayoutMode;
  placement?: "figma" | "flow";
}) {
  const isDesktop = mode === "desktop";
  const selectedState = states.find((state) => state.id === selectedStateId) ?? states[0];
  const scrollRef = React.useRef<HTMLElement | null>(null);
  const dragStateRef = React.useRef<{
    hasMoved: boolean;
    lastTime: number;
    lastY: number;
    pointerId: number;
    startScrollTop: number;
    startY: number;
    velocity: number;
  } | null>(null);
  const momentumFrameRef = React.useRef<number | null>(null);
  const suppressNextClickRef = React.useRef(false);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isScrollable, setIsScrollable] = React.useState(false);
  const [hasScrolledPastTop, setHasScrolledPastTop] = React.useState(false);

  const clampStateScrollTop = React.useCallback((element: HTMLElement, value: number) => {
    const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);

    return Math.min(Math.max(0, value), maxScrollTop);
  }, []);

  const cancelMomentumScroll = React.useCallback(() => {
    if (momentumFrameRef.current === null) {
      return;
    }

    window.cancelAnimationFrame(momentumFrameRef.current);
    momentumFrameRef.current = null;
  }, []);

  const startMomentumScroll = React.useCallback(
    (initialVelocity: number) => {
      const scrollElement = scrollRef.current;

      if (!scrollElement || Math.abs(initialVelocity) < 0.04) {
        return;
      }

      cancelMomentumScroll();

      let velocity = initialVelocity;
      let previousFrameTime = performance.now();

      const step = (frameTime: number) => {
        const currentElement = scrollRef.current;

        if (!currentElement) {
          momentumFrameRef.current = null;
          return;
        }

        const deltaTime = Math.min(28, frameTime - previousFrameTime);
        previousFrameTime = frameTime;
        velocity *= Math.pow(0.94, deltaTime / 16.67);

        const nextScrollTop = clampStateScrollTop(
          currentElement,
          currentElement.scrollTop + velocity * deltaTime,
        );

        if (
          nextScrollTop === currentElement.scrollTop ||
          Math.abs(velocity) < 0.025
        ) {
          momentumFrameRef.current = null;
          return;
        }

        currentElement.scrollTop = nextScrollTop;
        momentumFrameRef.current = window.requestAnimationFrame(step);
      };

      momentumFrameRef.current = window.requestAnimationFrame(step);
    },
    [cancelMomentumScroll, clampStateScrollTop],
  );

  React.useLayoutEffect(() => {
    const scrollElement = scrollRef.current;

    if (!scrollElement) {
      return;
    }

    const updateScrollableState = () => {
      setIsScrollable(scrollElement.scrollHeight > scrollElement.clientHeight + 1);
      setHasScrolledPastTop(scrollElement.scrollTop > 1);
    };

    updateScrollableState();

    const resizeObserver = new ResizeObserver(updateScrollableState);
    resizeObserver.observe(scrollElement);
    window.addEventListener("resize", updateScrollableState);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateScrollableState);
    };
  }, [states.length, isDesktop]);

  React.useEffect(
    () => () => {
      cancelMomentumScroll();
    },
    [cancelMomentumScroll],
  );

  const endDrag = React.useCallback(() => {
    const dragState = dragStateRef.current;

    if (dragState?.hasMoved) {
      suppressNextClickRef.current = true;
      startMomentumScroll(dragState.velocity);
    }

    dragStateRef.current = null;
    setIsDragging(false);
  }, [startMomentumScroll]);

  const cards = (
    <>
      {states.map((state, index) => {
        const isActive = selectedState?.id === state.id;
        const label = state.displayName;

        return (
          <button
            key={state.id}
            type="button"
            onClick={() => onSelectState(state.id)}
            aria-pressed={isActive}
            title={state.name}
            className="ip-state-card-button ip-state-card-enter group flex w-[509px] max-w-full flex-col items-start gap-[12px] text-left"
            style={{ "--ip-card-enter-index": index } as React.CSSProperties}
          >
            <p className="font-ip-pingfang min-w-full whitespace-nowrap text-[20px] font-normal leading-normal text-[var(--ip-text)]">
              <span className="font-ip-sf">
                {index + 1}.{" "}
              </span>
              <span>{label}</span>
            </p>
            <span
              className="ip-state-card-surface flex h-[300px] w-full items-center justify-center overflow-hidden rounded-[16px] bg-[var(--ip-card)] p-[18px]"
            >
              <PreviewAssetImage
                asset={state}
                alt={state.name}
                sizes="348px"
                className="ip-state-preview-image h-full w-full rounded-[12px]"
                imageClassName="mx-auto block h-full w-auto max-w-full object-contain"
              />
            </span>
          </button>
        );
      })}
      {states.length === 0 ? (
        <div className="flex h-[300px] w-[509px] max-w-full items-center justify-center rounded-[16px] bg-[var(--ip-card)] px-6 text-center text-[16px] text-[#919499]">
          暂无状态画板
        </div>
      ) : null}
    </>
  );

  if (isDesktop) {
    return (
      <div
        className={cn(
          "ip-state-enter relative w-[509px] shrink-0 overflow-hidden",
          placement === "figma" && "absolute left-[1199px] top-[70px]",
        )}
        style={
          isDesktop
            ? {
                height: `${desktopViewportHeight ?? PHONE_HEIGHT}px`,
                marginTop: desktopTopPadding
                  ? `-${desktopTopPadding}px`
                  : undefined,
              }
            : undefined
        }
        data-preview-statecards="true"
      >
        <section
          ref={scrollRef}
          aria-label="状态卡片列表"
          onScroll={(event) => {
            setHasScrolledPastTop(event.currentTarget.scrollTop > 1);
          }}
          onClickCapture={(event) => {
            if (!suppressNextClickRef.current) {
              return;
            }

            suppressNextClickRef.current = false;
            event.preventDefault();
            event.stopPropagation();
          }}
          onPointerCancel={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            endDrag();
          }}
          onPointerDown={(event) => {
            if (!isScrollable || (event.pointerType === "mouse" && event.button !== 0)) {
              return;
            }

            dragStateRef.current = {
              hasMoved: false,
              lastTime: performance.now(),
              lastY: event.clientY,
              pointerId: event.pointerId,
              startScrollTop: event.currentTarget.scrollTop,
              startY: event.clientY,
              velocity: 0,
            };
            cancelMomentumScroll();
          }}
          onPointerMove={(event) => {
            const dragState = dragStateRef.current;

            if (!dragState || dragState.pointerId !== event.pointerId) {
              return;
            }

            const deltaY = event.clientY - dragState.startY;
            const now = performance.now();
            const elapsed = Math.max(1, now - dragState.lastTime);
            const instantVelocity = (dragState.lastY - event.clientY) / elapsed;

            if (Math.abs(deltaY) > 3) {
              dragState.hasMoved = true;
              setIsDragging(true);

              if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.setPointerCapture(event.pointerId);
              }
            }

            if (dragState.hasMoved) {
              event.preventDefault();
              dragState.velocity = dragState.velocity * 0.32 + instantVelocity * 0.68;
              dragState.lastTime = now;
              dragState.lastY = event.clientY;
              event.currentTarget.scrollTop = clampStateScrollTop(
                event.currentTarget,
                dragState.startScrollTop - deltaY,
              );
            }
          }}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            endDrag();
          }}
          className={cn(
            "ip-state-scroll flex h-full w-full flex-col gap-[40px] overflow-y-auto",
            isScrollable && (isDragging ? "cursor-grabbing" : "cursor-grab"),
          )}
          style={{
            paddingBottom: `${desktopEdgePadding}px`,
            paddingTop: `${desktopEdgePadding}px`,
          }}
        >
          {cards}
        </section>
        <span
          aria-hidden="true"
          className={cn(
            "ip-state-fade-top",
            hasScrolledPastTop && "ip-state-fade-visible",
          )}
        />
        <span aria-hidden="true" className="ip-state-fade-bottom" />
      </div>
    );
  }

  return (
    <section
      aria-label="状态卡片列表"
      className="ip-state-scroll mx-auto flex w-full max-w-[509px] flex-col gap-[40px]"
    >
      {cards}
    </section>
  );
}

function DesktopCanvas({
  theme,
  pageGroups,
  states,
  selectedPageGroupId,
  selectedStateId,
  selectedBinding,
  selectedPage,
  selectedPageGroup,
  selectedFocusRect,
  onSelectPageGroup,
  onSelectTreeState,
  onSelectState,
  onThemeToggle,
  onSidebarToggle,
  phoneFocusBehavior,
  phoneFocusSignal,
  sidebarCollapsed,
}: {
  theme: ThemeMode;
  pageGroups: FigmaHtmlPageGroup[];
  states: FigmaHtmlStateAsset[];
  selectedPageGroupId: string | null;
  selectedStateId: string | null;
  selectedBinding?: FigmaHtmlPageBinding;
  selectedPage?: FigmaHtmlPageAsset;
  selectedPageGroup?: FigmaHtmlPageGroup;
  selectedFocusRect?: PreviewFocusRect;
  onSelectPageGroup: (pageGroupId: string) => void;
  onSelectTreeState: (pageGroupId: string, stateId: string) => void;
  onSelectState: (stateId: string) => void;
  onThemeToggle: () => void;
  onSidebarToggle: () => void;
  phoneFocusBehavior: PreviewFocusBehavior;
  phoneFocusSignal: number;
  sidebarCollapsed: boolean;
}) {
  const { scale, viewportWidth, viewportHeight, isReady } = useCanvasScale();
  const showStateCards = states.length > 0;
  const contentGroupWidth = showStateCards
    ? PHONE_WIDTH + CONTENT_GROUP_GAP + STATE_CARDS_WIDTH
    : PHONE_WIDTH;
  const contentGroupHeight = PHONE_HEIGHT;
  const visibleCanvasWidth = viewportWidth / scale;
  const visibleCanvasHeight = viewportHeight / scale;
  const contentLeft = sidebarCollapsed
    ? (visibleCanvasWidth - contentGroupWidth) / 2
    : (visibleCanvasWidth + SIDEBAR_WIDTH - contentGroupWidth) / 2;
  const contentTop = Math.max(0, (visibleCanvasHeight - contentGroupHeight) / 2);
  const stateCardsHeight = visibleCanvasHeight;

  return (
    <div className="fixed inset-0 hidden h-[100dvh] w-[100dvw] overflow-hidden bg-[var(--ip-bg)] xl:block">
      {isReady ? (
        <div
          className="relative h-full w-full"
          style={{
            width: viewportWidth,
            height: viewportHeight,
          }}
        >
          <div
            className="absolute left-0 top-0 origin-top-left bg-[var(--ip-bg)]"
            style={{
              width: visibleCanvasWidth,
              height: visibleCanvasHeight,
              transform: `scale(${scale})`,
            }}
          >
            <SidebarCollapseButton
              theme={theme}
              collapsed={sidebarCollapsed}
              onToggle={onSidebarToggle}
              className="ip-layout-motion absolute top-[41.5px] z-30"
              style={{
                left: sidebarCollapsed ? "40px" : "235px",
              }}
            />
            <SidebarNav
              theme={theme}
              pageGroups={pageGroups}
              states={states}
              selectedPageGroupId={selectedPageGroupId}
              selectedStateId={selectedStateId}
              onSelectPageGroup={onSelectPageGroup}
              onSelectTreeState={onSelectTreeState}
              onThemeToggle={onThemeToggle}
              onSidebarToggle={onSidebarToggle}
              collapsed={sidebarCollapsed}
              mode="desktop"
              desktopCanvasHeight={visibleCanvasHeight}
            />
            <div
              data-sidebar-collapsed={sidebarCollapsed ? "true" : "false"}
              data-preview-content-group="true"
              className={cn(
                "ip-content-group ip-layout-motion absolute flex items-start",
                showStateCards && "gap-[150px]",
              )}
              style={{
                left: `${contentLeft}px`,
                top: `${contentTop}px`,
                height: `${contentGroupHeight}px`,
              }}
            >
              <FigmaPhoneFrame
                emptyMessage={
                  selectedBinding
                    ? "页面切图资源缺失"
                    : "当前页面暂无该状态切图"
                }
                focusBehavior={phoneFocusBehavior}
                focusRect={selectedFocusRect}
                focusSignal={phoneFocusSignal}
                page={selectedPage}
                pageType={selectedPageGroup?.pageType}
                mode="desktop"
                placement="flow"
              />
              {showStateCards ? (
                <StateCards
                  states={states}
                  selectedStateId={selectedStateId}
                  onSelectState={onSelectState}
                  desktopEdgePadding={70 / scale}
                  desktopTopPadding={contentTop}
                  desktopViewportHeight={stateCardsHeight}
                  mode="desktop"
                  placement="flow"
                />
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function InteractionPreviewPlatform() {
  const [theme, setTheme] = React.useState<ThemeMode>(() => getInitialTheme());
  const [isThemeTransitioning, setIsThemeTransitioning] = React.useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [selectedPageGroupId, setSelectedPageGroupId] = React.useState<
    string | null
  >(() => figmaHtmlPageGroups[0]?.id ?? null);
  const [selectedStateId, setSelectedStateId] = React.useState<string | null>(
    () => figmaHtmlStates[0]?.id ?? null,
  );
  const [phoneFocusBehavior, setPhoneFocusBehavior] =
    React.useState<PreviewFocusBehavior>("scroll");
  const [phoneFocusSignal, setPhoneFocusSignal] = React.useState(0);
  const hasAnchoredPreviewRef = React.useRef(false);
  const themeTransitionTimerRef = React.useRef<number | null>(null);
  const previewPreloadUrls = React.useMemo(
    () => [
      ...figmaHtmlPages.map((asset) => asset.imageUrl),
      ...figmaHtmlStates.map((asset) => asset.imageUrl),
      ...Object.values(previewStickyHeaderConfig).map((header) => header.src),
      HOME_PREVIEW_BOTTOM_NAV_SRC,
    ],
    [],
  );

  usePreviewImagePreload(previewPreloadUrls);

  const beginThemeTransition = React.useCallback(() => {
    setIsThemeTransitioning(true);

    if (themeTransitionTimerRef.current !== null) {
      window.clearTimeout(themeTransitionTimerRef.current);
    }

    themeTransitionTimerRef.current = window.setTimeout(() => {
      setIsThemeTransitioning(false);
      themeTransitionTimerRef.current = null;
    }, 460);
  }, []);

  React.useEffect(() => {
    const syncTheme = () => {
      const resolvedTheme = getResolvedTheme();

      setTheme((current) => {
        if (current !== resolvedTheme) {
          beginThemeTransition();
        }

        return resolvedTheme;
      });
    };

    window.localStorage.removeItem(THEME_STORAGE_KEY);
    syncTheme();

    const interval = window.setInterval(syncTheme, 30 * 1000);
    return () => window.clearInterval(interval);
  }, [beginThemeTransition]);

  React.useEffect(
    () => () => {
      if (themeTransitionTimerRef.current !== null) {
        window.clearTimeout(themeTransitionTimerRef.current);
      }
    },
    [],
  );

  const selectedState =
    figmaHtmlStates.find((state) => state.id === selectedStateId) ??
    figmaHtmlStates[0];
  const selectedPageGroup =
    figmaHtmlPageGroups.find((pageGroup) => pageGroup.id === selectedPageGroupId) ??
    figmaHtmlPageGroups[0];
  const selectedBinding =
    selectedPageGroup && selectedState
      ? figmaHtmlPageBindings.find(
          (binding) =>
            binding.pageGroupId === selectedPageGroup.id &&
            binding.stateId === selectedState.id,
        )
      : undefined;
  const selectedPage = selectedBinding
    ? figmaHtmlPages.find((page) => page.id === selectedBinding.pageAssetId)
    : undefined;
  const selectedFocusRect =
    selectedBinding && selectedPage ? selectedBinding.focusRect : undefined;

  React.useEffect(() => {
    if (
      (!selectedPageGroupId ||
        !figmaHtmlPageGroups.some(
          (pageGroup) => pageGroup.id === selectedPageGroupId,
        )) &&
      figmaHtmlPageGroups[0]
    ) {
      setSelectedPageGroupId(figmaHtmlPageGroups[0].id);
    }

    if (
      (!selectedStateId ||
        !figmaHtmlStates.some((state) => state.id === selectedStateId)) &&
      figmaHtmlStates[0]
    ) {
      setSelectedStateId(figmaHtmlStates[0].id);
    }
  }, [selectedPageGroupId, selectedStateId]);

  const toggleTheme = React.useCallback(() => {
    beginThemeTransition();

    setTheme((current) => {
      const nextTheme = current === "dark" ? "light" : "dark";

      window.localStorage.setItem(
        THEME_OVERRIDE_STORAGE_KEY,
        JSON.stringify({
          theme: nextTheme,
          expiresAt: getNextThemeBoundary(),
        }),
      );

      return nextTheme;
    });
  }, [beginThemeTransition]);

  const toggleSidebar = React.useCallback(() => {
    setSidebarCollapsed((current) => !current);
  }, []);

  const selectPageGroup = React.useCallback(
    (pageGroupId: string) => {
      setSelectedPageGroupId(pageGroupId);

      const stateId = selectedState?.id ?? figmaHtmlStates[0]?.id;
      const binding = figmaHtmlPageBindings.find(
        (item) => item.pageGroupId === pageGroupId && item.stateId === stateId,
      );
      const page = binding
        ? figmaHtmlPages.find((item) => item.id === binding.pageAssetId)
        : undefined;

      if (page) {
        void preloadPreviewImage(page.imageUrl);
      }
    },
    [selectedState?.id],
  );

  const selectStateForPageGroup = React.useCallback((pageGroupId: string, stateId: string) => {
    const binding = pageGroupId
      ? figmaHtmlPageBindings.find(
          (item) => item.pageGroupId === pageGroupId && item.stateId === stateId,
        )
      : undefined;
    const pairedPage = binding
      ? figmaHtmlPages.find((page) => page.id === binding.pageAssetId)
      : undefined;

    setSelectedPageGroupId(pageGroupId);
    setSelectedStateId(stateId);

    if (pairedPage) {
      void preloadPreviewImage(pairedPage.imageUrl);
    }

    if (binding?.focusRect) {
      setPhoneFocusBehavior(
        hasAnchoredPreviewRef.current ? "mark" : "scroll",
      );
      hasAnchoredPreviewRef.current = true;
      setPhoneFocusSignal((current) => current + 1);
    }
  }, []);

  const selectState = React.useCallback(
    (stateId: string) => {
      const pageGroupId = selectedPageGroup?.id ?? figmaHtmlPageGroups[0]?.id;

      if (!pageGroupId) {
        setSelectedStateId(stateId);
        return;
      }

      selectStateForPageGroup(pageGroupId, stateId);
    },
    [selectStateForPageGroup, selectedPageGroup?.id],
  );

  return (
    <main
      className="interaction-preview-root min-h-screen bg-[var(--ip-bg)] text-[var(--ip-text)]"
      data-theme={theme}
      data-theme-transitioning={isThemeTransitioning ? "true" : "false"}
    >
      <DesktopCanvas
        theme={theme}
        pageGroups={figmaHtmlPageGroups}
        states={figmaHtmlStates}
        selectedPageGroupId={selectedPageGroup?.id ?? null}
        selectedStateId={selectedState?.id ?? null}
        selectedBinding={selectedBinding}
        selectedPage={selectedPage}
        selectedPageGroup={selectedPageGroup}
        selectedFocusRect={selectedFocusRect}
        onSelectPageGroup={selectPageGroup}
        onSelectTreeState={selectStateForPageGroup}
        onSelectState={selectState}
        onThemeToggle={toggleTheme}
        onSidebarToggle={toggleSidebar}
        phoneFocusBehavior={phoneFocusBehavior}
        phoneFocusSignal={phoneFocusSignal}
        sidebarCollapsed={sidebarCollapsed}
      />

      <div className="flex min-h-screen flex-col gap-8 bg-[var(--ip-bg)] px-4 py-5 xl:hidden">
        <SidebarNav
          theme={theme}
          pageGroups={figmaHtmlPageGroups}
          states={figmaHtmlStates}
          selectedPageGroupId={selectedPageGroup?.id ?? null}
          selectedStateId={selectedState?.id ?? null}
          onSelectPageGroup={selectPageGroup}
          onSelectTreeState={selectStateForPageGroup}
          onThemeToggle={toggleTheme}
          onSidebarToggle={() => undefined}
          collapsed={false}
          mode="mobile"
        />
        <FigmaPhoneFrame
          emptyMessage={
            selectedBinding
              ? "页面切图资源缺失"
              : "当前页面暂无该状态切图"
          }
          focusBehavior={phoneFocusBehavior}
          focusRect={selectedFocusRect}
          focusSignal={phoneFocusSignal}
          page={selectedPage}
          pageType={selectedPageGroup?.pageType}
          mode="mobile"
        />
        <StateCards
          states={figmaHtmlStates}
          selectedStateId={selectedState?.id ?? null}
          onSelectState={selectState}
          mode="mobile"
        />
      </div>
    </main>
  );
}
