/**
 * lint_ghost_frames.js — Post-write structural linter for ghost frame detection & fix
 *
 * Ghost frame: a FRAME/COMPONENT/INSTANCE/GROUP node where:
 *   - node.visible === true
 *   - node has children, AND every child is visible === false
 *   - node's parent uses auto-layout (layoutMode VERTICAL or HORIZONTAL)
 *
 * Effect: the empty-but-visible container still occupies height/width in the
 * parent auto-layout, causing blank gaps and extra itemSpacing.
 *
 * Fix: set node.visible = false so auto-layout collapses it.
 *
 * IMPORTANT — Cascading:
 *   Hiding a ghost frame may cause its parent to become a new ghost frame
 *   (all its visible children are now invisible). The linter runs multiple
 *   passes until no new ghosts are found (convergence).
 *
 * Usage via use_figma MCP (inline — paste directly):
 *   1. Replace __SECTION_ID__ with the target Section node ID
 *   2. Replace __PAGE_ID__ with the page ID containing the Section
 *   3. Set DRY_RUN = true for detection-only, false for detection + fix
 *
 * Known sub-types (from 14-state audit, 2026-06-08):
 *   Type A (fatal):  ~471×41px action-button containers → visible blank gap
 *   Type B (minor):  ~92×28px Tab-Style2 internal frames → small visual impact
 *   Cascade:         parent frames whose children all become invisible after fix
 */

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const PAGE_ID = "__PAGE_ID__";           // page containing the section
const SECTION_NODE_ID = "__SECTION_ID__"; // target section to lint
const DRY_RUN = false;  // true = detect only, false = detect + fix
const MAX_PASSES = 10;  // safety limit for cascade iterations

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function isWalkableType(node) {
  // Types whose children we need to traverse.
  // SECTION and PAGE are walkable as entry roots but can't themselves be ghosts.
  return (
    node.type === "FRAME" ||
    node.type === "COMPONENT" ||
    node.type === "INSTANCE" ||
    node.type === "GROUP" ||
    node.type === "SECTION" ||
    node.type === "PAGE"
  );
}

function isGhostCandidateType(node) {
  // Only these types can BE ghost frames (visible containers in auto-layout).
  return (
    node.type === "FRAME" ||
    node.type === "COMPONENT" ||
    node.type === "INSTANCE" ||
    node.type === "GROUP"
  );
}

function parentIsAutoLayout(node) {
  const p = node.parent;
  if (!p) return false;
  if ("layoutMode" in p) {
    return p.layoutMode === "VERTICAL" || p.layoutMode === "HORIZONTAL";
  }
  return false;
}

function hasOnlyInvisibleChildren(node) {
  if (!("children" in node) || node.children.length === 0) return false;
  return node.children.every((c) => c.visible === false);
}

function classifyGhost(node) {
  const w = Math.round(node.width);
  const h = Math.round(node.height);
  if (w > 200 && h > 30) return "A";
  return "B";
}

// ─── SINGLE-PASS TRAVERSAL ──────────────────────────────────────────────────

function lintPass(root, fix) {
  const ghosts = [];

  function walk(node) {
    if (!isWalkableType(node) || !("children" in node)) return;

    if (
      isGhostCandidateType(node) &&
      node.visible === true &&
      hasOnlyInvisibleChildren(node) &&
      parentIsAutoLayout(node)
    ) {
      const entry = {
        id: node.id,
        name: node.name,
        type: node.type,
        width: Math.round(node.width),
        height: Math.round(node.height),
        ghostType: classifyGhost(node),
        parentName: node.parent ? node.parent.name : "(root)",
        parentLayout:
          node.parent && "layoutMode" in node.parent
            ? node.parent.layoutMode
            : "NONE",
        fixed: false,
      };

      if (fix) {
        node.visible = false;
        entry.fixed = true;
      }

      ghosts.push(entry);
    }

    for (const child of node.children) {
      walk(child);
    }
  }

  walk(root);
  return ghosts;
}

// ─── MAIN — ITERATIVE UNTIL CONVERGENCE ─────────────────────────────────────

const page = figma.getNodeById(PAGE_ID);
if (page) await figma.setCurrentPageAsync(page);

const section = figma.getNodeById(SECTION_NODE_ID);
if (!section) {
  return {
    success: false,
    error: `Section ${SECTION_NODE_ID} not found. Did you set PAGE_ID correctly?`,
  };
}

const allGhosts = [];
const passes = [];

for (let i = 0; i < MAX_PASSES; i++) {
  const found = lintPass(section, !DRY_RUN);
  passes.push({ pass: i + 1, found: found.length });
  allGhosts.push(...found);
  if (found.length === 0) break;
}

return {
  success: true,
  sectionId: SECTION_NODE_ID,
  sectionName: section.name,
  dryRun: DRY_RUN,
  totalPasses: passes.length,
  totalGhosts: allGhosts.length,
  typeA: allGhosts.filter((g) => g.ghostType === "A").length,
  typeB: allGhosts.filter((g) => g.ghostType === "B").length,
  totalFixed: allGhosts.filter((g) => g.fixed).length,
  passes: passes,
  details: allGhosts,
};
