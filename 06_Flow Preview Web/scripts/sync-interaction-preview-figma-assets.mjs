import { execFileSync } from "node:child_process";
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const FIGMA_URL =
  "https://www.figma.com/design/2CXckWUEm1b8tpa3v7SG1M/%E9%85%92%E5%BA%97-AI-Design-Context?node-id=1372-6019";
const FIGMA_MCP_URL = "http://127.0.0.1:3845/mcp";
const ROOT_NODE_ID = "1372:6019";
const MAX_DIRECT_EXPORT_SIDE = 1024;
const PAGE_BACKGROUND = "#F2F3F5";
const FIGMA_MATTE_RGB = [51, 51, 51];
const STATE_CARD_RADIUS = 8;
const ASSET_VERSION = "20260523-figma-slice-stable";
const OUT_DIR = path.resolve("public/images/interaction-preview/figma-html");
const DATA_MODULE_PATH = path.resolve("data/interactionPreviewFigma.generated.ts");
const TMP_DIR = path.resolve(".tmp-interaction-preview-figma-sync");
const TMP_OUT_DIR = path.join(TMP_DIR, "out");
const CLI_ARGS = new Set(process.argv.slice(2));
const DEBUG_CONTEXT = CLI_ARGS.has("--debug-context");
const REUSE_EXISTING = CLI_ARGS.has("--reuse-existing");
const SCREENSHOT_TIMEOUT_MS = optionNumber(
  process.env.FIGMA_SYNC_SCREENSHOT_TIMEOUT_MS,
  45000,
);
const SCREENSHOT_RETRIES = optionNumber(process.env.FIGMA_SYNC_SCREENSHOT_RETRIES, 2);
const SYNC_CONCURRENCY = Math.max(
  1,
  Math.min(8, optionNumber(process.env.FIGMA_SYNC_CONCURRENCY, 4)),
);

let sessionId;
let rpcId = 0;
const syncStartedAt = Date.now();
const timings = {};
const screenshotStats = [];
const screenshotCache = new Map();
let screenshotCacheHits = 0;

function optionNumber(value, fallback) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function elapsedMs(start) {
  return Date.now() - start;
}

async function timed(label, task) {
  const start = Date.now();
  try {
    return await task();
  } finally {
    const durationMs = elapsedMs(start);
    timings[label] = (timings[label] ?? 0) + durationMs;
    console.error(`[timing] ${label}: ${durationMs}ms`);
  }
}

function createLimiter(limit) {
  let active = 0;
  const queue = [];

  const runNext = () => {
    if (active >= limit || queue.length === 0) {
      return;
    }

    const { task, resolve, reject } = queue.shift();
    active += 1;
    task()
      .then(resolve, reject)
      .finally(() => {
        active -= 1;
        runNext();
      });
  };

  return (task) =>
    new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject });
      runNext();
    });
}

const limitScreenshotTask = createLimiter(SYNC_CONCURRENCY);

async function rpc(method, params, { timeoutMs } = {}) {
  const controller = timeoutMs ? new AbortController() : undefined;
  const timeout = timeoutMs
    ? setTimeout(() => controller.abort(), timeoutMs)
    : undefined;

  let response;
  try {
    response = await fetch(FIGMA_MCP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(sessionId ? { "mcp-session-id": sessionId } : {}),
      },
      signal: controller?.signal,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: ++rpcId,
        method,
        params,
      }),
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`${method} timed out after ${timeoutMs}ms`);
    }

    throw error;
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }

  const nextSessionId = response.headers.get("mcp-session-id");
  if (nextSessionId) {
    sessionId = nextSessionId;
  }

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${text}`);
  }

  if (text.startsWith("event:")) {
    const dataLine = text.split("\n").find((line) => line.startsWith("data:"));
    if (!dataLine) {
      throw new Error(`MCP stream response missing data line: ${text}`);
    }
    return JSON.parse(dataLine.slice(5).trim());
  }

  return JSON.parse(text);
}

async function notify(method, params = {}) {
  await fetch(FIGMA_MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(sessionId ? { "mcp-session-id": sessionId } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method,
      params,
    }),
  });
}

async function initializeMcp() {
  await rpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: {
      name: "codex-interaction-preview-sync",
      version: "1.0.0",
    },
  });
  await notify("notifications/initialized");
}

function attr(line, name) {
  const match = line.match(new RegExp(`${name}="([^"]*)"`));
  return match?.[1];
}

function parseMetadataTree(text) {
  const root = { children: [], depth: -1 };
  const stack = [root];

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("</")) {
      continue;
    }

    const tagMatch = line.match(/^<([a-z-]+)/);
    if (!tagMatch) {
      continue;
    }

    const id = attr(line, "id");
    const name = attr(line, "name");
    const width = Number(attr(line, "width"));
    const height = Number(attr(line, "height"));

    if (!id || !name || !Number.isFinite(width) || !Number.isFinite(height)) {
      continue;
    }

    const depth = rawLine.match(/^\s*/)?.[0].length ?? 0;
    const node = {
      id,
      name,
      type: tagMatch[1],
      x: Number(attr(line, "x") ?? 0),
      y: Number(attr(line, "y") ?? 0),
      width,
      height,
      hidden: attr(line, "hidden") === "true",
      children: [],
      depth,
    };

    while (stack.length > 1 && stack.at(-1).depth >= depth) {
      stack.pop();
    }

    stack.at(-1).children.push(node);

    if (!line.endsWith("/>")) {
      stack.push(node);
    }
  }

  return root.children[0];
}

function filenameForNodeId(nodeId) {
  return `${nodeId.replace(":", "-")}.png`;
}

function findChild(node, predicate) {
  return node.children.find((child) => !child.hidden && predicate(child));
}

function terminalName(name) {
  return name.split("/").at(-1)?.trim() ?? name.trim();
}

function normalizeStateName(name) {
  const terminal = terminalName(name);
  return terminal === "常规页面" ? "常规卡片" : terminal;
}

function stableIdForNodeId(nodeId) {
  return `figma-${nodeId.replace(":", "-")}`;
}

function pageGroupSourceName(name) {
  return name.split("/")[0]?.trim() ?? name.trim();
}

function pageGroupName(name) {
  return pageGroupSourceName(name).replace(/^html页面-/, "").trim();
}

function pageGroupId(name) {
  const sourceName = pageGroupName(name);
  const normalized =
    sourceName === "首页"
      ? "home"
      : sourceName
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, "");

  return `page-group-${normalized || "page"}`;
}

function pageGroupDisplayName(name) {
  const sourceName = pageGroupName(name);
  return sourceName === "首页" ? "酒店首页" : sourceName;
}

function pageIconTypeForName(name) {
  if (name.includes("下单") || name.includes("订单")) {
    return "order";
  }

  if (name.includes("详情")) {
    return "detail";
  }

  if (name.includes("首页")) {
    return "home";
  }

  return "list";
}

function absoluteSlice(node, offsetX, offsetY, role = "content") {
  return {
    id: node.id,
    name: node.name,
    role,
    x: offsetX + node.x,
    y: offsetY + node.y,
    width: node.width,
    height: node.height,
  };
}

function collectExportSlices(node, offsetX = 0, offsetY = 0, role = "content") {
  const slices = [];

  for (const child of node.children) {
    if (child.hidden) {
      continue;
    }

    const x = offsetX + child.x;
    const y = offsetY + child.y;
    const canExportDirectly =
      child.width <= MAX_DIRECT_EXPORT_SIDE &&
      child.height <= MAX_DIRECT_EXPORT_SIDE;

    if (canExportDirectly || child.children.length === 0) {
      slices.push({
        id: child.id,
        name: child.name,
        role,
        x,
        y,
        width: child.width,
        height: child.height,
      });
      continue;
    }

    slices.push(...collectExportSlices(child, x, y, role));
  }

  return slices;
}

function collectSearchModuleSlices(searchNode, offsetX = 0, offsetY = 0) {
  const slices = [];
  const searchX = offsetX + searchNode.x;
  const searchY = offsetY + searchNode.y;
  const topArea = findChild(searchNode, (node) => node.name.includes("HOME.TOP_AREA"));
  const searchPanel = findChild(searchNode, (node) =>
    node.name.includes("HOME.SEARCH_MODULE"),
  );

  if (!topArea || !searchPanel) {
    throw new Error(`Unexpected search module structure in ${searchNode.id}`);
  }

  const topAreaX = searchX + topArea.x;
  const topAreaY = searchY + topArea.y;
  const topBanner = findChild(topArea, (node) => node.name === "TopBanner");
  const navBar = findChild(topArea, (node) => node.name.includes("NAV_BAR"));

  if (!topBanner || !navBar) {
    throw new Error(`Unexpected top area structure in ${topArea.id}`);
  }

  slices.push(absoluteSlice(topBanner, topAreaX, topAreaY, "background"));
  slices.push(absoluteSlice(navBar, topAreaX, topAreaY, "overlay"));
  slices.push(absoluteSlice(searchPanel, searchX, searchY, "content"));

  return slices;
}

function collectPageSlices(pageNode) {
  const slices = [];

  for (const child of pageNode.children) {
    if (child.hidden) {
      continue;
    }

    if (child.name === "搜索模块") {
      slices.push(...collectSearchModuleSlices(child));
      continue;
    }

    const role =
      child.name.includes("状态栏") || child.name.includes("BOTTOM_NAV")
        ? "overlay"
        : "content";

    if (
      child.width <= MAX_DIRECT_EXPORT_SIDE &&
      child.height <= MAX_DIRECT_EXPORT_SIDE
    ) {
      slices.push(absoluteSlice(child, 0, 0, role));
      continue;
    }

    slices.push(...collectExportSlices(child, child.x, child.y, role));
  }

  return slices;
}

function roundedMask(width, height, radius) {
  return Buffer.from(`
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="#fff"/>
    </svg>
  `);
}

function isNearFigmaMatte(sourceRaw, index) {
  return (
    Math.abs(sourceRaw[index] - FIGMA_MATTE_RGB[0]) <= 8 &&
    Math.abs(sourceRaw[index + 1] - FIGMA_MATTE_RGB[1]) <= 8 &&
    Math.abs(sourceRaw[index + 2] - FIGMA_MATTE_RGB[2]) <= 8
  );
}

async function fetchScreenshotWithRetry(nodeId, { contentsOnly }) {
  const startedAt = Date.now();
  let lastError;

  for (let attempt = 1; attempt <= SCREENSHOT_RETRIES + 1; attempt += 1) {
    try {
      const response = await rpc(
        "tools/call",
        {
          name: "get_screenshot",
          arguments: {
            nodeId,
            contentsOnly,
          },
        },
        { timeoutMs: SCREENSHOT_TIMEOUT_MS },
      );
      const image = response.result?.content?.find((item) => item.type === "image");

      if (!image?.data) {
        throw new Error(`No screenshot image returned for ${nodeId}`);
      }

      const stat = {
        nodeId,
        contentsOnly,
        attempts: attempt,
        durationMs: elapsedMs(startedAt),
      };
      screenshotStats.push(stat);

      return {
        buffer: Buffer.from(image.data, "base64"),
        stat,
      };
    } catch (error) {
      lastError = error;
      if (attempt > SCREENSHOT_RETRIES) {
        break;
      }

      const delayMs = 500 * 2 ** (attempt - 1);
      console.error(
        `Retrying screenshot ${nodeId} after ${delayMs}ms (${attempt}/${SCREENSHOT_RETRIES})`,
      );
      await wait(delayMs);
    }
  }

  throw lastError;
}

async function getScreenshotBuffer(nodeId, { contentsOnly = true } = {}) {
  const key = `${nodeId}:${contentsOnly}`;
  const cached = screenshotCache.get(key);

  if (cached) {
    screenshotCacheHits += 1;
    const result = await cached;
    return {
      buffer: result.buffer,
      stat: { ...result.stat, cacheHit: true, durationMs: 0 },
    };
  }

  const task = limitScreenshotTask(() =>
    fetchScreenshotWithRetry(nodeId, { contentsOnly }),
  );
  screenshotCache.set(key, task);

  try {
    return await task;
  } catch (error) {
    screenshotCache.delete(key);
    throw error;
  }
}

async function unmatteRoundedImage(buffer, width, height, radius) {
  const source = sharp(buffer).resize(width, height, { fit: "fill" }).ensureAlpha();
  const sourceRaw = await source.raw().toBuffer();
  const maskRaw = await sharp(roundedMask(width, height, radius))
    .ensureAlpha()
    .raw()
    .toBuffer();
  const output = Buffer.alloc(sourceRaw.length);
  const matteCleanupSize = Math.ceil(radius + 6);

  for (let index = 0; index < sourceRaw.length; index += 4) {
    const alpha = maskRaw[index + 3];
    const pixelIndex = index / 4;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    const isCornerCleanupRegion =
      (x < matteCleanupSize && y < matteCleanupSize) ||
      (x >= width - matteCleanupSize && y < matteCleanupSize) ||
      (x < matteCleanupSize && y >= height - matteCleanupSize) ||
      (x >= width - matteCleanupSize && y >= height - matteCleanupSize);

    if (
      alpha <= 0 ||
      (isCornerCleanupRegion && isNearFigmaMatte(sourceRaw, index))
    ) {
      output[index] = 0;
      output[index + 1] = 0;
      output[index + 2] = 0;
      output[index + 3] = 0;
      continue;
    }

    const a = alpha / 255;

    for (let channel = 0; channel < 3; channel += 1) {
      const unmatte =
        (sourceRaw[index + channel] - FIGMA_MATTE_RGB[channel] * (1 - a)) / a;
      output[index + channel] = Math.max(0, Math.min(255, Math.round(unmatte)));
    }

    output[index + 3] = alpha;
  }

  return sharp(output, {
    raw: {
      width,
      height,
      channels: 4,
    },
  })
    .png()
    .toBuffer();
}

async function normalizeSlice(buffer, width, height, { rounded = false } = {}) {
  if (rounded) {
    return unmatteRoundedImage(buffer, width, height, STATE_CARD_RADIUS);
  }

  let image = sharp(buffer).ensureAlpha();
  const metadata = await image.metadata();

  if (metadata.width !== width || metadata.height !== height) {
    image = image.resize(width, height, { fit: "fill" });
  }

  return image.png().toBuffer();
}

async function copyExistingIfRequested(kind, nodeId, target) {
  if (!REUSE_EXISTING) {
    return false;
  }

  const source = path.join(OUT_DIR, kind, filenameForNodeId(nodeId));
  try {
    await copyFile(source, target);
    console.error(`Reusing existing ${kind} asset ${nodeId}`);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function exportStateFrame(stateNode, targetDir) {
  console.error(`Exporting state ${stateNode.id} ${stateNode.name}`);
  const width = Math.round(stateNode.width);
  const height = Math.round(stateNode.height);
  const target = path.join(targetDir, "states", filenameForNodeId(stateNode.id));

  if (await copyExistingIfRequested("states", stateNode.id, target)) {
    return {
      id: stateNode.id,
      name: stateNode.name,
      width,
      height,
      target,
      screenshot: { reusedExisting: true },
    };
  }

  const { buffer: raw, stat } = await getScreenshotBuffer(stateNode.id);
  const fixed = await normalizeSlice(raw, width, height, { rounded: true });
  await writeFile(target, fixed);
  return { id: stateNode.id, name: stateNode.name, width, height, target, screenshot: stat };
}

function findStateAssetForPage(pageNode, states) {
  const pageStateName = normalizeStateName(pageNode.name);
  return states.find((state) => normalizeStateName(state.name) === pageStateName);
}

async function exportPageFrame(pageNode, targetDir, stateAsset) {
  const width = Math.round(pageNode.width);
  const height = Math.round(pageNode.height);
  const slices = collectPageSlices(pageNode);
  const target = path.join(targetDir, "pages", filenameForNodeId(pageNode.id));

  console.error(
    `Exporting page ${pageNode.id} ${pageNode.name} with ${slices.length} slices`,
  );

  if (await copyExistingIfRequested("pages", pageNode.id, target)) {
    return {
      id: pageNode.id,
      name: pageNode.name,
      width,
      height,
      slices: slices.map((slice) => ({
        ...slice,
        screenshot: { reusedExistingPage: true },
      })),
      target,
      reusedExisting: true,
    };
  }

  const preparedSlices = await Promise.all(slices.map(async (slice) => {
    console.error(`  slice ${slice.id} ${slice.role} ${slice.name}`);
    const sliceWidth = Math.round(slice.width);
    const sliceHeight = Math.round(slice.height);
    const isAiGuideCard =
      slice.name.includes("AI引导卡") || slice.name.includes("html状态-AI引导卡");
    const canReuseStateCard =
      isAiGuideCard && sliceWidth === 348 && sliceHeight === 474 && stateAsset?.target;
    let input;
    let screenshot;

    if (canReuseStateCard) {
      input = stateAsset.target;
      screenshot = {
        reusedFromState: stateAsset.id,
        reusedFromStateName: stateAsset.name,
      };
    } else {
      const { buffer: raw, stat } = await getScreenshotBuffer(slice.id);
      input = await normalizeSlice(raw, sliceWidth, sliceHeight, {
        rounded: isAiGuideCard && sliceWidth === 348 && sliceHeight === 474,
      });
      screenshot = stat;
    }

    return {
      composite: {
        input,
        left: Math.round(slice.x),
        top: Math.round(slice.y),
      },
      slice: {
        ...slice,
        screenshot,
      },
    };
  }));

  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: PAGE_BACKGROUND,
    },
  })
    .composite(preparedSlices.map((slice) => slice.composite))
    .png()
    .toFile(target);

  return {
    id: pageNode.id,
    name: pageNode.name,
    width,
    height,
    slices: preparedSlices.map((slice) => slice.slice),
    target,
  };
}

function rectsOverlap(a, b) {
  const left = Math.max(a.x, b.x);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.height, b.y + b.height);

  return right > left && bottom > top;
}

function findIllegalSliceOverlaps(page) {
  const contentSlices = page.slices.filter((slice) => slice.role === "content");
  const overlaps = [];

  for (let i = 0; i < contentSlices.length; i += 1) {
    for (let j = i + 1; j < contentSlices.length; j += 1) {
      if (rectsOverlap(contentSlices[i], contentSlices[j])) {
        overlaps.push({
          a: contentSlices[i],
          b: contentSlices[j],
        });
      }
    }
  }

  return overlaps;
}

async function getRawImage(file) {
  const image = sharp(file).ensureAlpha();
  const metadata = await image.metadata();
  const raw = await image.raw().toBuffer();

  return { metadata, raw };
}

function pixel(raw, width, x, y) {
  const index = (y * width + x) * 4;
  return raw.subarray(index, index + 4);
}

function isPageBackground(pixelValue) {
  return (
    Math.abs(pixelValue[0] - 242) <= 2 &&
    Math.abs(pixelValue[1] - 243) <= 2 &&
    Math.abs(pixelValue[2] - 245) <= 2 &&
    pixelValue[3] >= 250
  );
}

async function validatePageAsset(page) {
  const { metadata, raw } = await getRawImage(page.target);
  const errors = [];

  if (metadata.width !== 750 || metadata.height !== 3266) {
    errors.push(`invalid page size ${metadata.width}x${metadata.height}`);
  }

  let greyPixels = 0;
  const sampleRows = Math.min(24, metadata.height);
  const total = metadata.width * sampleRows;

  for (let y = 0; y < sampleRows; y += 1) {
    for (let x = 0; x < metadata.width; x += 1) {
      if (isPageBackground(pixel(raw, metadata.width, x, y))) {
        greyPixels += 1;
      }
    }
  }

  const greyRatio = greyPixels / total;
  if (greyRatio > 0.2) {
    errors.push(`top grey background ratio too high ${greyRatio.toFixed(3)}`);
  }

  const illegalOverlaps = findIllegalSliceOverlaps(page);
  if (illegalOverlaps.length > 0) {
    errors.push(
      `illegal content slice overlap: ${illegalOverlaps
        .map((item) => `${item.a.id}<->${item.b.id}`)
        .join(", ")}`,
    );
  }

  return { errors, greyRatio };
}

async function validateStateAsset(state) {
  const { metadata, raw } = await getRawImage(state.target);
  const errors = [];

  if (metadata.width !== 348 || metadata.height !== 474) {
    errors.push(`invalid state size ${metadata.width}x${metadata.height}`);
  }

  const cornerPoints = [
    [0, 0],
    [1, 1],
    [metadata.width - 1, 0],
    [0, metadata.height - 1],
    [metadata.width - 1, metadata.height - 1],
  ];

  for (const [x, y] of cornerPoints) {
    if (pixel(raw, metadata.width, x, y)[3] !== 0) {
      errors.push(`corner alpha is not transparent at ${x},${y}`);
    }
  }

  let matteFringePixels = 0;
  const cornerSize = 14;
  const cornerRegions = [
    [0, 0],
    [metadata.width - cornerSize, 0],
    [0, metadata.height - cornerSize],
    [metadata.width - cornerSize, metadata.height - cornerSize],
  ];

  for (const [startX, startY] of cornerRegions) {
    for (let y = startY; y < startY + cornerSize; y += 1) {
      for (let x = startX; x < startX + cornerSize; x += 1) {
        const p = pixel(raw, metadata.width, x, y);
        if (
          p[3] > 0 &&
          Math.abs(p[0] - FIGMA_MATTE_RGB[0]) <= 8 &&
          Math.abs(p[1] - FIGMA_MATTE_RGB[1]) <= 8 &&
          Math.abs(p[2] - FIGMA_MATTE_RGB[2]) <= 8
        ) {
          matteFringePixels += 1;
        }
      }
    }
  }

  if (matteFringePixels > 0) {
    errors.push(`figma matte fringe pixels in corners: ${matteFringePixels}`);
  }

  return { errors, matteFringePixels };
}

async function validateExportedAssets(pages, states) {
  const errors = [];
  const pageReports = await Promise.all(
    pages.map(async (page) => {
      const report = await validatePageAsset(page);
      errors.push(...report.errors.map((error) => `${page.id}: ${error}`));
      return { id: page.id, name: page.name, ...report };
    }),
  );
  const stateReports = await Promise.all(
    states.map(async (state) => {
      const report = await validateStateAsset(state);
      errors.push(...report.errors.map((error) => `${state.id}: ${error}`));
      return { id: state.id, name: state.name, ...report };
    }),
  );

  return { pageReports, stateReports, errors };
}

async function commitGeneratedAssets(pages, states) {
  await mkdir(path.join(OUT_DIR, "pages"), { recursive: true });
  await mkdir(path.join(OUT_DIR, "states"), { recursive: true });

  for (const page of pages) {
    await copyFile(
      page.target,
      path.join(OUT_DIR, "pages", filenameForNodeId(page.id)),
    );
  }

  for (const state of states) {
    await copyFile(
      state.target,
      path.join(OUT_DIR, "states", filenameForNodeId(state.id)),
    );
  }
}

function buildGeneratedDataModule(pages, states) {
  const version = `?v=${ASSET_VERSION}`;
  const stateRows = states.map((state, index) => ({
    id: stableIdForNodeId(state.id),
    name: state.name,
    displayName: terminalName(state.name),
    normalizedStateName: normalizeStateName(state.name),
    imageUrl: `/images/interaction-preview/figma-html/states/${filenameForNodeId(state.id)}${version}`,
    figmaNodeId: state.id,
    width: state.width,
    height: state.height,
    order: index,
  }));
  const groupMap = new Map();
  const pageRows = pages.map((page, index) => {
    const groupId = pageGroupId(page.name);
    const matchedState = stateRows.find(
      (state) => state.normalizedStateName === normalizeStateName(page.name),
    );

    if (!matchedState) {
      throw new Error(`No matching html状态 frame for page ${page.id} ${page.name}`);
    }

    if (!groupMap.has(groupId)) {
      groupMap.set(groupId, {
        id: groupId,
        name: pageGroupName(page.name),
        displayName: pageGroupDisplayName(page.name),
        figmaSourceName: pageGroupSourceName(page.name),
        pageType: pageIconTypeForName(page.name),
        order: groupMap.size,
      });
    }

    return {
      id: stableIdForNodeId(page.id),
      name: page.name,
      displayName: terminalName(page.name),
      normalizedStateName: normalizeStateName(page.name),
      imageUrl: `/images/interaction-preview/figma-html/pages/${filenameForNodeId(page.id)}${version}`,
      figmaNodeId: page.id,
      width: page.width,
      height: page.height,
      order: index,
      pageGroupId: groupId,
      stateId: matchedState.id,
    };
  });
  const bindings = pageRows.map((page) => ({
    id: `binding-${page.pageGroupId}-${page.stateId}`,
    pageGroupId: page.pageGroupId,
    stateId: page.stateId,
    pageAssetId: page.id,
    focusRect: { x: 384, y: 2628, width: 348, height: 474 },
  }));

  return `export type FigmaPageIconType = "home" | "list" | "detail" | "order";

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

export const figmaHtmlStates: FigmaHtmlStateAsset[] = ${JSON.stringify(stateRows, null, 2)};

export const figmaHtmlPageGroups: FigmaHtmlPageGroup[] = ${JSON.stringify([...groupMap.values()], null, 2)};

export const figmaHtmlPages: FigmaHtmlPageAsset[] = ${JSON.stringify(pageRows, null, 2)};

export const figmaHtmlPageBindings: FigmaHtmlPageBinding[] = ${JSON.stringify(bindings, null, 2)};
`;
}

async function writeGeneratedDataModule(pages, states) {
  await writeFile(DATA_MODULE_PATH, buildGeneratedDataModule(pages, states));
}

async function main() {
  try {
    execFileSync("open", ["-a", "Figma", FIGMA_URL], { stdio: "ignore" });
    await wait(1500);
  } catch {
    // The Dev Mode MCP can still work if Figma is already focused on the file.
  }

  await rm(TMP_DIR, { recursive: true, force: true });
  await mkdir(path.join(TMP_OUT_DIR, "pages"), { recursive: true });
  await mkdir(path.join(TMP_OUT_DIR, "states"), { recursive: true });

  console.error(
    `Figma sync starting: concurrency=${SYNC_CONCURRENCY}, retries=${SCREENSHOT_RETRIES}, debugContext=${DEBUG_CONTEXT}, reuseExisting=${REUSE_EXISTING}`,
  );

  await timed("mcp:init", () => initializeMcp());
  const tools = await timed("mcp:tools", () => rpc("tools/list", {}));
  const toolNames = tools.result.tools.map((tool) => tool.name);
  if (
    !toolNames.includes("get_metadata") ||
    !toolNames.includes("get_screenshot") ||
    (DEBUG_CONTEXT && !toolNames.includes("get_design_context"))
  ) {
    throw new Error("Figma MCP missing required design tools.");
  }

  const metadata = await timed("mcp:metadata", () =>
    rpc("tools/call", {
      name: "get_metadata",
      arguments: {
        nodeId: ROOT_NODE_ID,
        clientLanguages: "typescript, css",
        clientFrameworks: "react, next.js",
      },
    }),
  );
  await writeFile(path.join(TMP_DIR, "metadata.json"), JSON.stringify(metadata, null, 2));

  if (DEBUG_CONTEXT) {
    const [context, referenceScreenshot] = await timed("mcp:debug-context", () =>
      Promise.all([
        rpc("tools/call", {
          name: "get_design_context",
          arguments: {
            nodeId: ROOT_NODE_ID,
            clientLanguages: "typescript, css",
            clientFrameworks: "react, next.js",
          },
        }),
        getScreenshotBuffer(ROOT_NODE_ID, { contentsOnly: false }),
      ]),
    );
    await writeFile(path.join(TMP_DIR, "context.json"), JSON.stringify(context, null, 2));
    await writeFile(
      path.join(TMP_DIR, "reference-screenshot.json"),
      JSON.stringify(
        {
          nodeId: ROOT_NODE_ID,
          screenshot: referenceScreenshot.stat,
        },
        null,
        2,
      ),
    );
  }

  const metadataText = metadata.result?.content?.[0]?.text ?? "";
  if (metadataText.startsWith("No node could be found")) {
    throw new Error(metadataText);
  }

  const rootNode = parseMetadataTree(metadataText);
  const pageNodes = rootNode.children.filter((node) =>
    node.name.startsWith("html页面-"),
  );
  const stateNodes = rootNode.children.filter((node) =>
    node.name.startsWith("html状态-"),
  );

  if (pageNodes.length === 0 || stateNodes.length === 0) {
    throw new Error(
      `Unexpected Figma structure: pages=${pageNodes.length}, states=${stateNodes.length}`,
    );
  }

  const states = await timed("export:states", () =>
    Promise.all(stateNodes.map((stateNode) => exportStateFrame(stateNode, TMP_OUT_DIR))),
  );

  const pages = await timed("export:pages", () =>
    Promise.all(
      pageNodes.map((pageNode) =>
        exportPageFrame(pageNode, TMP_OUT_DIR, findStateAssetForPage(pageNode, states)),
      ),
    ),
  );

  const validation = await timed("validate", () => validateExportedAssets(pages, states));
  const debugManifest = {
    syncedFrom: ROOT_NODE_ID,
    assetVersion: ASSET_VERSION,
    pageBackground: PAGE_BACKGROUND,
    stateCardRadius: STATE_CARD_RADIUS,
    generatedAt: new Date().toISOString(),
    options: {
      concurrency: SYNC_CONCURRENCY,
      screenshotRetries: SCREENSHOT_RETRIES,
      screenshotTimeoutMs: SCREENSHOT_TIMEOUT_MS,
      debugContext: DEBUG_CONTEXT,
      reuseExisting: REUSE_EXISTING,
    },
    pages: pages.map((page) => ({
      id: page.id,
      name: page.name,
      width: page.width,
      height: page.height,
      reusedExisting: page.reusedExisting ?? false,
      slices: page.slices.map(({ input, ...slice }) => slice),
    })),
    states: states.map((state) => ({
      id: state.id,
      name: state.name,
      width: state.width,
      height: state.height,
      screenshot: state.screenshot,
    })),
    screenshots: {
      calls: screenshotStats.length,
      cacheHits: screenshotCacheHits,
      stats: screenshotStats,
    },
    timings,
    validation,
  };

  if (validation.errors.length > 0) {
    debugManifest.timings = { ...timings, totalMs: elapsedMs(syncStartedAt) };
    await writeFile(
      path.join(TMP_DIR, "quality-report.json"),
      JSON.stringify(debugManifest, null, 2),
    );
    throw new Error(
      `Figma export quality gate failed:\n${validation.errors.join("\n")}`,
    );
  }

  await timed("commit", () => commitGeneratedAssets(pages, states));
  await timed("data", () => writeGeneratedDataModule(pages, states));
  debugManifest.timings = { ...timings, totalMs: elapsedMs(syncStartedAt) };
  await writeFile(
    path.join(OUT_DIR, "sync-debug-manifest.json"),
    JSON.stringify(debugManifest, null, 2),
  );
  await rm(TMP_DIR, { recursive: true, force: true });

  console.log(JSON.stringify(debugManifest, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
