/**
 * auto_layout_qa.js - Generic Auto Layout fidelity QA for use_figma
 *
 * Purpose:
 *   Structure variants should remain editable Figma structures. If the
 *   reference design uses Auto Layout for a key container, generated states
 *   must preserve or rebuild an equivalent Auto Layout structure instead of
 *   flattening the container into coordinate-positioned frames.
 *
 * Usage inside use_figma:
 *
 *   // 1. Paste this file above your generation code.
 *   const qa = AutoLayoutQA.compare([
 *     { role: "recommendationList", reference: refList, generated: genList },
 *     { role: "card", reference: refCard, generated: genCard },
 *   ]);
 *   if (!qa.pass) return { ok: false, autoLayoutQa: qa };
 *
 * Notes:
 *   - It is valid for leaf media, decorative vectors, masks, and fixed overlays
 *     to use layoutMode NONE if the reference also does.
 *   - It is valid for a structure variant to switch HORIZONTAL <-> VERTICAL
 *     when the layout strategy explicitly requires it. That switch must be
 *     declared with allowDirectionChange.
 *   - It is only valid to change Fill/Hug/Fixed sizing or text autoresize when
 *     the layout strategy explicitly declares allowSizingChange or
 *     allowTextAutoResizeChange.
 */

const AutoLayoutQA = (() => {
  function hasLayoutApi(node) {
    return !!node && "layoutMode" in node;
  }

  function isAutoLayout(node) {
    return hasLayoutApi(node) && node.layoutMode !== "NONE";
  }

  function mode(node) {
    return hasLayoutApi(node) ? node.layoutMode : "NO_LAYOUT_API";
  }

  function sizing(node) {
    return {
      primaryAxisSizingMode:
        hasLayoutApi(node) && "primaryAxisSizingMode" in node
          ? node.primaryAxisSizingMode
          : null,
      counterAxisSizingMode:
        hasLayoutApi(node) && "counterAxisSizingMode" in node
          ? node.counterAxisSizingMode
          : null,
      layoutSizingHorizontal:
        node && "layoutSizingHorizontal" in node ? node.layoutSizingHorizontal : null,
      layoutSizingVertical:
        node && "layoutSizingVertical" in node ? node.layoutSizingVertical : null,
      layoutPositioning:
        node && "layoutPositioning" in node ? node.layoutPositioning : null,
      textAutoResize:
        node && node.type === "TEXT" && "textAutoResize" in node ? node.textAutoResize : null,
    };
  }

  function spacing(node) {
    if (!hasLayoutApi(node)) return null;
    return {
      itemSpacing: node.itemSpacing,
      paddingTop: node.paddingTop,
      paddingRight: node.paddingRight,
      paddingBottom: node.paddingBottom,
      paddingLeft: node.paddingLeft,
    };
  }

  function children(node) {
    return node && "children" in node ? node.children.filter((child) => child.visible !== false) : [];
  }

  function absoluteChildRatio(node) {
    const visibleChildren = children(node);
    if (!visibleChildren.length) return 0;
    const abs = visibleChildren.filter(
      (child) => "layoutPositioning" in child && child.layoutPositioning === "ABSOLUTE",
    ).length;
    return abs / visibleChildren.length;
  }

  function summary(node) {
    return {
      id: node ? node.id : null,
      name: node ? node.name : null,
      type: node ? node.type : null,
      layoutMode: mode(node),
      sizing: node ? sizing(node) : null,
      spacing: node ? spacing(node) : null,
      childCount: children(node).length,
      absoluteChildRatio: node ? absoluteChildRatio(node) : null,
    };
  }

  function fail(role, reason, reference, generated, details = {}) {
    return {
      pass: false,
      role,
      reason,
      reference: reference ? summary(reference) : null,
      generated: generated ? summary(generated) : null,
      ...details,
    };
  }

  function axisSizingChanges(reference, generated) {
    const referenceSizing = sizing(reference);
    const generatedSizing = sizing(generated);
    const changes = [];

    for (const key of [
      "layoutSizingHorizontal",
      "layoutSizingVertical",
      "primaryAxisSizingMode",
      "counterAxisSizingMode",
      "layoutPositioning",
    ]) {
      if (referenceSizing[key] == null || generatedSizing[key] == null) continue;
      if (referenceSizing[key] !== generatedSizing[key]) {
        changes.push({
          property: key,
          reference: referenceSizing[key],
          generated: generatedSizing[key],
        });
      }
    }

    return changes;
  }

  function textAutoResizeChange(reference, generated) {
    if (!reference || !generated || reference.type !== "TEXT" || generated.type !== "TEXT") return null;
    if (!("textAutoResize" in reference) || !("textAutoResize" in generated)) return null;
    if (reference.textAutoResize === generated.textAutoResize) return null;
    return {
      property: "textAutoResize",
      reference: reference.textAutoResize,
      generated: generated.textAutoResize,
    };
  }

  function comparePair(spec) {
    const role = spec.role || "unknown";
    const reference = spec.reference;
    const generated = spec.generated;
    const allowDirectionChange = spec.allowDirectionChange === true;
    const allowAutoToNone = spec.allowAutoToNone === true;
    const allowSizingChange = spec.allowSizingChange === true;
    const allowTextAutoResizeChange = spec.allowTextAutoResizeChange === true;
    const maxAbsoluteChildRatio =
      typeof spec.maxAbsoluteChildRatio === "number" ? spec.maxAbsoluteChildRatio : 0.25;

    if (!reference) return fail(role, "missing_reference_node", reference, generated);
    if (!generated) return fail(role, "missing_generated_node", reference, generated);

    const referenceAuto = isAutoLayout(reference);
    const generatedAuto = isAutoLayout(generated);

    if (referenceAuto && !generatedAuto && !allowAutoToNone) {
      return fail(role, "auto_layout_degraded_to_none", reference, generated);
    }

    if (
      referenceAuto &&
      generatedAuto &&
      !allowDirectionChange &&
      reference.layoutMode !== generated.layoutMode
    ) {
      return fail(role, "layout_direction_changed_without_declaration", reference, generated);
    }

    const sizingChanges = axisSizingChanges(reference, generated);
    if (sizingChanges.length && !allowSizingChange) {
      return fail(role, "layout_sizing_changed_without_declaration", reference, generated, {
        sizingChanges,
      });
    }

    const resizeChange = textAutoResizeChange(reference, generated);
    if (resizeChange && !allowTextAutoResizeChange) {
      return fail(role, "text_auto_resize_changed_without_declaration", reference, generated, {
        textAutoResizeChange: resizeChange,
      });
    }

    const generatedAbsoluteRatio = absoluteChildRatio(generated);
    if (referenceAuto && generatedAbsoluteRatio > maxAbsoluteChildRatio) {
      return fail(role, "too_many_absolute_children_in_auto_layout_container", reference, generated, {
        maxAbsoluteChildRatio,
        actualAbsoluteChildRatio: generatedAbsoluteRatio,
      });
    }

    return {
      pass: true,
      role,
      reference: summary(reference),
      generated: summary(generated),
      allowDirectionChange,
      allowSizingChange,
      allowTextAutoResizeChange,
    };
  }

  function compare(specs) {
    const checks = specs.map(comparePair);
    const failures = checks.filter((check) => !check.pass);
    return {
      pass: failures.length === 0,
      checked: checks.map((check) => check.role),
      checks,
      failures,
    };
  }

  function collectKeyAutoLayoutNodes(root, options = {}) {
    const maxDepth = typeof options.maxDepth === "number" ? options.maxDepth : 4;
    const minChildren = typeof options.minChildren === "number" ? options.minChildren : 1;
    const result = [];

    function visit(node, depth) {
      if (!node || depth > maxDepth) return;
      if (isAutoLayout(node) && children(node).length >= minChildren) result.push(node);
      for (const child of children(node)) visit(child, depth + 1);
    }

    visit(root, 0);
    return result;
  }

  return {
    compare,
    comparePair,
    collectKeyAutoLayoutNodes,
    summary,
    isAutoLayout,
    absoluteChildRatio,
  };
})();
