/**
 * layout_visual_groups.js — Generic visual group layout helpers for use_figma
 *
 * Purpose:
 *   Structure variants should be laid out by visual groups and alignment axes,
 *   not by isolated hard-coded node coordinates. Paste this helper into a
 *   use_figma script when a generated state changes layout, density, grouping,
 *   quantity, or module height.
 *
 * Core concepts:
 *   - visual group: a semantic visual unit, e.g. media, primary info,
 *     secondary info, action, status, tag, price, form field, empty-state art.
 *   - group box: union bounds of visible nodes in the group.
 *   - relation: a checkable alignment rule between two groups or a group and
 *     its parent, e.g. centerY aligned, left aligned, inside parent.
 *
 * Usage inside use_figma:
 *
 *   // 1. Paste this file above your generation code.
 *   const media = VisualGroupLayout.group("media", [imageNode]);
 *   const info = VisualGroupLayout.group("primaryInfo", [titleNode, descNode]);
 *
 *   // 2. Position groups by computed boxes, then apply translation to nodes.
 *   VisualGroupLayout.alignGroupToBox(info, media.box, { y: "center" });
 *
 *   // 3. Run generic QA before returning.
 *   const qa = VisualGroupLayout.qa([
 *     VisualGroupLayout.relation.centerY(info, media, 4),
 *     VisualGroupLayout.relation.insideParent(info, parentFrame, 0),
 *   ]);
 *   if (!qa.pass) return { success: false, qa };
 */

const VisualGroupLayout = (() => {
  function isVisible(node) {
    return node && node.visible !== false && "width" in node && "height" in node;
  }

  function nodeBox(node) {
    return {
      id: node.id,
      name: node.name,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      right: node.x + node.width,
      bottom: node.y + node.height,
      centerX: node.x + node.width / 2,
      centerY: node.y + node.height / 2,
    };
  }

  function unionBox(boxes) {
    if (!boxes.length) {
      return {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        right: 0,
        bottom: 0,
        centerX: 0,
        centerY: 0,
      };
    }
    const x = Math.min(...boxes.map((b) => b.x));
    const y = Math.min(...boxes.map((b) => b.y));
    const right = Math.max(...boxes.map((b) => b.right));
    const bottom = Math.max(...boxes.map((b) => b.bottom));
    return {
      x,
      y,
      width: right - x,
      height: bottom - y,
      right,
      bottom,
      centerX: x + (right - x) / 2,
      centerY: y + (bottom - y) / 2,
    };
  }

  function refresh(group) {
    const boxes = group.nodes.filter(isVisible).map(nodeBox);
    group.box = unionBox(boxes);
    return group;
  }

  function group(name, nodes, role = "generic") {
    return refresh({
      name,
      role,
      nodes: nodes.filter(Boolean),
      box: null,
    });
  }

  function move(group, dx, dy) {
    for (const node of group.nodes) {
      node.x += dx;
      node.y += dy;
    }
    return refresh(group);
  }

  function moveTo(group, x, y) {
    refresh(group);
    return move(group, x - group.box.x, y - group.box.y);
  }

  function alignGroupToBox(group, targetBox, options = {}) {
    refresh(group);
    let dx = 0;
    let dy = 0;

    if (options.x === "left") dx = targetBox.x - group.box.x;
    if (options.x === "center") dx = targetBox.centerX - group.box.centerX;
    if (options.x === "right") dx = targetBox.right - group.box.right;

    if (options.y === "top") dy = targetBox.y - group.box.y;
    if (options.y === "center") dy = targetBox.centerY - group.box.centerY;
    if (options.y === "bottom") dy = targetBox.bottom - group.box.bottom;

    return move(group, dx, dy);
  }

  function parentContentBox(parent, padding = 0) {
    return {
      x: padding,
      y: padding,
      width: parent.width - padding * 2,
      height: parent.height - padding * 2,
      right: parent.width - padding,
      bottom: parent.height - padding,
      centerX: parent.width / 2,
      centerY: parent.height / 2,
    };
  }

  function placeGroupInParent(group, parent, options = {}) {
    const box = parentContentBox(parent, options.padding || 0);
    return alignGroupToBox(group, box, {
      x: options.x || "left",
      y: options.y || "top",
    });
  }

  function stackGroups(groups, options = {}) {
    const direction = options.direction || "vertical";
    const gap = options.gap || 0;
    const align = options.align || "start";

    for (const g of groups) refresh(g);
    for (let i = 1; i < groups.length; i++) {
      const prev = groups[i - 1];
      const cur = groups[i];
      if (direction === "vertical") {
        const y = prev.box.bottom + gap;
        let x = cur.box.x;
        if (align === "start") x = prev.box.x;
        if (align === "center") x = prev.box.centerX - cur.box.width / 2;
        if (align === "end") x = prev.box.right - cur.box.width;
        moveTo(cur, x, y);
      } else {
        const x = prev.box.right + gap;
        let y = cur.box.y;
        if (align === "start") y = prev.box.y;
        if (align === "center") y = prev.box.centerY - cur.box.height / 2;
        if (align === "end") y = prev.box.bottom - cur.box.height;
        moveTo(cur, x, y);
      }
    }
    return groups.map(refresh);
  }

  function fail(name, actual, expected, tolerance, extra = {}) {
    return { pass: false, name, actual, expected, tolerance, ...extra };
  }

  function pass(name, actual, expected, tolerance, extra = {}) {
    return { pass: true, name, actual, expected, tolerance, ...extra };
  }

  const relation = {
    centerY(a, b, tolerance = 4) {
      refresh(a);
      refresh(b);
      const actual = Math.abs(a.box.centerY - b.box.centerY);
      return actual <= tolerance
        ? pass("centerY", actual, 0, tolerance, { a: a.name, b: b.name })
        : fail("centerY", actual, 0, tolerance, { a: a.name, b: b.name });
    },
    centerX(a, b, tolerance = 4) {
      refresh(a);
      refresh(b);
      const actual = Math.abs(a.box.centerX - b.box.centerX);
      return actual <= tolerance
        ? pass("centerX", actual, 0, tolerance, { a: a.name, b: b.name })
        : fail("centerX", actual, 0, tolerance, { a: a.name, b: b.name });
    },
    left(a, b, tolerance = 2) {
      refresh(a);
      refresh(b);
      const actual = Math.abs(a.box.x - b.box.x);
      return actual <= tolerance
        ? pass("left", actual, 0, tolerance, { a: a.name, b: b.name })
        : fail("left", actual, 0, tolerance, { a: a.name, b: b.name });
    },
    top(a, b, tolerance = 2) {
      refresh(a);
      refresh(b);
      const actual = Math.abs(a.box.y - b.box.y);
      return actual <= tolerance
        ? pass("top", actual, 0, tolerance, { a: a.name, b: b.name })
        : fail("top", actual, 0, tolerance, { a: a.name, b: b.name });
    },
    insideParent(a, parent, padding = 0) {
      refresh(a);
      const box = parentContentBox(parent, padding);
      const ok =
        a.box.x >= box.x &&
        a.box.y >= box.y &&
        a.box.right <= box.right &&
        a.box.bottom <= box.bottom;
      return ok
        ? pass("insideParent", 0, 0, 0, { a: a.name, parent: parent.name })
        : fail("insideParent", 1, 0, 0, { a: a.name, parent: parent.name, box: a.box, parentBox: box });
    },
    minGap(a, b, minGap) {
      refresh(a);
      refresh(b);
      const horizontalGap = Math.max(b.box.x - a.box.right, a.box.x - b.box.right);
      const verticalGap = Math.max(b.box.y - a.box.bottom, a.box.y - b.box.bottom);
      const actual = Math.max(horizontalGap, verticalGap);
      return actual >= minGap
        ? pass("minGap", actual, minGap, 0, { a: a.name, b: b.name })
        : fail("minGap", actual, minGap, 0, { a: a.name, b: b.name });
    },
  };

  function qa(relations) {
    const results = relations;
    return {
      pass: results.every((r) => r.pass),
      failures: results.filter((r) => !r.pass),
      results,
    };
  }

  return {
    group,
    refresh,
    nodeBox,
    unionBox,
    move,
    moveTo,
    alignGroupToBox,
    parentContentBox,
    placeGroupInParent,
    stackGroups,
    relation,
    qa,
  };
})();
