/**
 * read_reference_structure.js — lightweight Figma structure reader
 *
 * Purpose:
 *   Read only the structure needed for state completion. Default mode is
 *   shallow. Use deep mode only for target module nodes, and probe mode before
 *   structure variants or clone rewrites.
 *
 * Usage via use_figma MCP:
 *   1. Replace __PAGE_ID__ and __REF_NODE_ID__.
 *   2. Optionally replace __READ_MODE__ with "shallow", "deep", or "probe".
 *   3. Optionally fill TARGET_NODE_IDS / TARGET_NAME_KEYWORDS.
 *
 * Return policy:
 *   - shallow: small semantic map, direct children names, bounded instances.
 *   - deep: compact bounded tree for target nodes only.
 *   - probe: compact path availability and risk summary only.
 */

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const PAGE_ID = "__PAGE_ID__";
const REF_NODE_ID = "__REF_NODE_ID__";
const RAW_READ_MODE = "__READ_MODE__"; // shallow | deep | probe

// Fill these manually when using deep/probe mode.
const TARGET_NODE_IDS = [];
const TARGET_NAME_KEYWORDS = [];

const MAX_CHILDREN_PER_NODE = 40;
const MAX_INSTANCES = 24;

function readMode() {
  if (!RAW_READ_MODE || RAW_READ_MODE.startsWith("__")) return "shallow";
  const mode = String(RAW_READ_MODE).toLowerCase();
  return ["shallow", "deep", "probe"].includes(mode) ? mode : "shallow";
}

const MODE = readMode();
const MAX_DEPTH = MODE === "deep" ? 4 : MODE === "probe" ? 2 : 2;

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function hasChildren(node) {
  return node && "children" in node && Array.isArray(node.children);
}

function visibleChildren(node) {
  if (!hasChildren(node)) return [];
  return node.children.filter((child) => child.visible !== false).slice(0, MAX_CHILDREN_PER_NODE);
}

function sizeOf(node) {
  return {
    x: "x" in node ? Math.round(node.x) : null,
    y: "y" in node ? Math.round(node.y) : null,
    width: "width" in node ? Math.round(node.width) : null,
    height: "height" in node ? Math.round(node.height) : null,
  };
}

function layoutOf(node, includeDetails) {
  if (!("layoutMode" in node)) return {};
  const out = { layoutMode: node.layoutMode };
  if ("layoutSizingHorizontal" in node) out.layoutSizingHorizontal = node.layoutSizingHorizontal;
  if ("layoutSizingVertical" in node) out.layoutSizingVertical = node.layoutSizingVertical;
  if ("layoutPositioning" in node) out.layoutPositioning = node.layoutPositioning;
  if (includeDetails && node.layoutMode !== "NONE") {
    out.primaryAxisSizingMode = node.primaryAxisSizingMode;
    out.counterAxisSizingMode = node.counterAxisSizingMode;
    out.itemSpacing = node.itemSpacing;
    out.padding = {
      top: node.paddingTop,
      right: node.paddingRight,
      bottom: node.paddingBottom,
      left: node.paddingLeft,
    };
  }
  return out;
}

function textOf(node, includeDetails) {
  if (node.type !== "TEXT") return {};
  const out = {};
  if ("textAutoResize" in node) out.textAutoResize = node.textAutoResize;
  if (includeDetails) {
    out.charactersLength = node.characters ? node.characters.length : 0;
    out.lineHeight = node.lineHeight;
    out.textAlignHorizontal = node.textAlignHorizontal;
    out.textAlignVertical = node.textAlignVertical;
  }
  return out;
}

function componentSetInfo(instanceNode, includeDetails) {
  if (instanceNode.type !== "INSTANCE") return null;
  const mc = instanceNode.mainComponent;
  if (!mc) return { switchable: false, mainComponentName: null, mainComponentId: null };

  const parent = mc.parent;
  if (!parent || parent.type !== "COMPONENT_SET") {
    return {
      switchable: false,
      mainComponentName: mc.name,
      mainComponentId: includeDetails ? mc.id : undefined,
    };
  }

  const currentVariants = {};
  mc.name.split(",").forEach((pair) => {
    const [key, val] = pair.split("=").map((s) => s.trim());
    if (key && val) currentVariants[key] = val;
  });

  const info = {
    switchable: true,
    componentSetName: parent.name,
    componentSetId: includeDetails ? parent.id : undefined,
    mainComponentName: mc.name,
    mainComponentId: includeDetails ? mc.id : undefined,
    currentVariants,
  };

  if (includeDetails) {
    const variantProperties = {};
    try {
      const defs = parent.componentPropertyDefinitions || {};
      for (const [key, def] of Object.entries(defs)) {
        if (def.type === "VARIANT") {
          variantProperties[key] = {
            defaultValue: def.defaultValue,
            options: def.variantOptions,
          };
        }
      }
    } catch (e) {
      // Some imported components may not expose definitions.
    }
    info.variantProperties = variantProperties;
  }

  return info;
}

function shouldRecurseInto(node, depth) {
  if (depth >= MAX_DEPTH) return false;
  if (MODE !== "deep" && node.type === "INSTANCE") return false;
  if (MODE !== "deep" && ["VECTOR", "BOOLEAN_OPERATION", "LINE"].includes(node.type)) return false;
  return hasChildren(node);
}

function buildTree(node, depth) {
  if (!node || depth > MAX_DEPTH) return null;

  const includeDetails = MODE === "deep";
  const kids = visibleChildren(node);
  const entry = {
    id: node.id,
    name: node.name,
    type: node.type,
    visible: node.visible !== false,
    ...sizeOf(node),
    ...layoutOf(node, includeDetails),
    ...textOf(node, includeDetails),
    childCount: hasChildren(node) ? node.children.length : 0,
    childrenNames: kids.map((child) => child.name),
  };

  if (node.type === "INSTANCE") {
    const info = componentSetInfo(node, includeDetails);
    if (info) entry.instance = info;
  }

  if (shouldRecurseInto(node, depth)) {
    entry.children = kids
      .map((child) => buildTree(child, depth + 1))
      .filter(Boolean);
  }

  return entry;
}

function walk(node, visitor, path) {
  visitor(node, path);
  if (!hasChildren(node)) return;
  for (const child of node.children) {
    if (child.visible === false && MODE !== "deep") continue;
    walk(child, visitor, `${path} > ${child.name}`);
  }
}

function findTargetNodes(root) {
  const byId = [];
  const foundIds = new Set();

  for (const id of TARGET_NODE_IDS) {
    const node = figma.getNodeById(id);
    if (node) {
      byId.push({ node, path: node.name, matchedBy: "id", query: id });
      foundIds.add(node.id);
    }
  }

  const byName = [];
  const keywords = TARGET_NAME_KEYWORDS.map((kw) => String(kw).toLowerCase()).filter(Boolean);
  if (keywords.length) {
    walk(root, (node, path) => {
      const name = String(node.name || "").toLowerCase();
      if (keywords.some((kw) => name.includes(kw)) && !foundIds.has(node.id)) {
        byName.push({ node, path, matchedBy: "name", query: node.name });
        foundIds.add(node.id);
      }
    }, root.name);
  }

  return byId.concat(byName);
}

function collectInstances(root) {
  const switchableInstances = [];
  const standaloneInstances = [];
  const componentSetRegistry = {};

  walk(root, (node, path) => {
    if (switchableInstances.length + standaloneInstances.length >= MAX_INSTANCES) return;
    if (node.type !== "INSTANCE") return;

    const info = componentSetInfo(node, MODE === "deep");
    const base = {
      instanceId: node.id,
      instanceName: node.name,
      path,
      visible: node.visible !== false,
    };

    if (info && info.switchable) {
      switchableInstances.push({ ...base, ...info });
      if (info.componentSetId && !componentSetRegistry[info.componentSetId]) {
        componentSetRegistry[info.componentSetId] = {
          name: info.componentSetName,
          variantProperties: info.variantProperties || {},
        };
      }
    } else {
      standaloneInstances.push({ ...base, ...(info || {}) });
    }
  }, root.name);

  return { switchableInstances, standaloneInstances, componentSetRegistry };
}

function isFlowCandidate(node) {
  const name = String(node.name || "").toLowerCase();
  return ["list", "card", "section", "module", "content", "flow", "列表", "卡片", "模块", "内容"].some((kw) =>
    name.includes(kw),
  );
}

function isFixedCandidate(node) {
  const name = String(node.name || "").toLowerCase();
  return ["fixed", "sticky", "float", "bar", "tab", "nav", "底栏", "悬浮", "固定", "导航"].some((kw) =>
    name.includes(kw),
  );
}

function collectProbe(root, targets) {
  const foundNodes = targets.length
    ? targets.map((hit) => ({
        id: hit.node.id,
        name: hit.node.name,
        type: hit.node.type,
        path: hit.path,
        matchedBy: hit.matchedBy,
        ...sizeOf(hit.node),
        ...layoutOf(hit.node, false),
      }))
    : [{
        id: root.id,
        name: root.name,
        type: root.type,
        path: root.name,
        matchedBy: "reference",
        ...sizeOf(root),
        ...layoutOf(root, false),
      }];

  const missingPaths = TARGET_NODE_IDS
    .filter((id) => !foundNodes.some((node) => node.id === id))
    .map((id) => ({ type: "id", query: id }));

  const flowObjects = [];
  const fixedObjects = [];
  const autoLayoutContainers = [];

  walk(root, (node, path) => {
    if (flowObjects.length < 8 && isFlowCandidate(node)) {
      flowObjects.push({ id: node.id, name: node.name, type: node.type, path, ...sizeOf(node) });
    }
    if (fixedObjects.length < 8 && isFixedCandidate(node)) {
      fixedObjects.push({ id: node.id, name: node.name, type: node.type, path, ...sizeOf(node) });
    }
    if (autoLayoutContainers.length < 12 && "layoutMode" in node && node.layoutMode !== "NONE") {
      autoLayoutContainers.push({
        id: node.id,
        name: node.name,
        type: node.type,
        path,
        ...layoutOf(node, true),
        ...sizeOf(node),
      });
    }
  }, root.name);

  const risks = [];
  if (!flowObjects.length) risks.push("no obvious page-flow candidates found");
  if (!autoLayoutContainers.length) risks.push("no auto-layout containers found");

  return {
    ok: missingPaths.length === 0,
    refNodeId: root.id,
    refNodeName: root.name,
    foundNodes,
    missingPaths,
    flowObjects,
    fixedObjects,
    autoLayoutContainers,
    risks,
  };
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

const page = figma.getNodeById(PAGE_ID);
if (page) await figma.setCurrentPageAsync(page);

const refNode = figma.getNodeById(REF_NODE_ID);
if (!refNode) {
  return { ok: false, mode: MODE, error: `Reference node ${REF_NODE_ID} not found` };
}

const targetHits = findTargetNodes(refNode);

if (MODE === "probe") {
  return collectProbe(refNode, targetHits);
}

const roots = MODE === "deep" && targetHits.length
  ? targetHits.map((hit) => hit.node)
  : [refNode];

const instanceRoot = MODE === "deep" && targetHits.length ? targetHits[0].node : refNode;
const instanceSummary = collectInstances(instanceRoot);

return {
  ok: true,
  mode: MODE,
  refNodeId: REF_NODE_ID,
  refNodeName: refNode.name,
  refNodeType: refNode.type,
  targetNodes: targetHits.map((hit) => ({
    id: hit.node.id,
    name: hit.node.name,
    type: hit.node.type,
    path: hit.path,
    matchedBy: hit.matchedBy,
  })),
  totalInstances: instanceSummary.switchableInstances.length + instanceSummary.standaloneInstances.length,
  switchableCount: instanceSummary.switchableInstances.length,
  standaloneCount: instanceSummary.standaloneInstances.length,
  componentSetRegistry: MODE === "deep" ? instanceSummary.componentSetRegistry : {},
  switchableInstances: instanceSummary.switchableInstances,
  standaloneInstances: MODE === "deep" ? instanceSummary.standaloneInstances : [],
  structures: roots.map((node) => buildTree(node, 0)),
  limits: {
    maxDepth: MAX_DEPTH,
    maxChildrenPerNode: MAX_CHILDREN_PER_NODE,
    maxInstances: MAX_INSTANCES,
  },
};
