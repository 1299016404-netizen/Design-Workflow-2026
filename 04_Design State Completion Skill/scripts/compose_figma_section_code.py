#!/usr/bin/env python3
"""Translate brief.json into a Figma Plugin API JS script ready to pass to the
use_figma MCP tool. This variant always writes into a new Section next to a
reference node, so the original design is not overwritten.

Spec: references/figma-write.md
Brief schema: scripts/validate_figma_brief.py top-of-file docstring

Usage:
  python3 scripts/compose_figma_section_code.py brief.json
  python3 scripts/compose_figma_section_code.py brief.json --out /tmp/write.js
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFESTS = ROOT / "manifests"

# font weight -> Figma style name (PingFang SC supports Regular/Medium/Semibold/Bold)
WEIGHT_TO_STYLE = {
    400: "Regular",
    500: "Medium",
    600: "Semibold",
    700: "Bold",
}


def load(p):
    return json.loads(Path(p).read_text())


def js_str(s):
    """Safe JS string literal."""
    return json.dumps(s, ensure_ascii=False)


def sanitize_var(name):
    """Make a string safe as a JS identifier."""
    s = re.sub(r"[^A-Za-z0-9_]", "_", name)
    if s and s[0].isdigit():
        s = "_" + s
    return s or "_"


class ComposeError(Exception):
    pass


# --------------------------------------------------------------------------- #
# Token resolution                                                            #
# --------------------------------------------------------------------------- #

def resolve_token(tokens, path):
    """'spacing.l' / 'color.text.dark' / 'radius.m' / 'text.h3' -> token dict."""
    parts = path.split(".")
    if parts[0] == "color":
        parts[0] = "colors"
    if parts[0] == "text":
        parts[0] = "text_styles"
    node = tokens
    for p in parts:
        if not isinstance(node, dict) or p not in node:
            raise ComposeError(f"token path {path!r} not found in tokens-mapping")
        node = node[p]
    return node


def find_variable_id(tokens, variable_id):
    """Walk tokens-mapping; return the entry dict with matching id, else None."""
    def walk(node, parents):
        if isinstance(node, dict):
            if node.get("id") == variable_id:
                return node, parents
            for k, v in node.items():
                hit = walk(v, parents + [k])
                if hit:
                    return hit
        elif isinstance(node, list):
            for v in node:
                hit = walk(v, parents)
                if hit:
                    return hit
        return None
    return walk(tokens, [])


# --------------------------------------------------------------------------- #
# Component / variant resolution                                              #
# --------------------------------------------------------------------------- #

def resolve_instance_key(components, set_key, props):
    """Given a brief instance node (set_key + props), find the matching variant key.
    Raises ComposeError if no exact match."""
    set_info = components.get("by_set_key", {}).get(set_key)
    if not set_info:
        raise ComposeError(f"set_key {set_key!r} not in components.by_set_key")
    variants = set_info.get("variants") or []
    if not variants:
        raise ComposeError(f"set {set_key!r} ({set_info.get('name')}) has no variants")
    # find exact match
    for v in variants:
        if (v.get("props") or {}) == (props or {}):
            return v["key"], v.get("name"), set_info
    known = [v.get("props") for v in variants]
    raise ComposeError(
        f"no variant in set {set_info.get('name')!r} matches props {props!r}. "
        f"Available combinations: {known}"
    )


# --------------------------------------------------------------------------- #
# Symbol table — collected during traversal, emitted in Phase 1               #
# --------------------------------------------------------------------------- #

class Symbols:
    def __init__(self):
        self.vars = {}          # key -> js identifier
        self.components = {}    # key -> js identifier
        self.text_styles = {}   # key -> js identifier
        self.fonts = set()      # set of (family, style) tuples

    def add_var(self, var_entry, hint):
        key = var_entry.get("key")
        if not key:
            raise ComposeError(
                f"variable {var_entry.get('name')!r} (id={var_entry.get('id')}) has "
                f"no published key — re-run scripts/fetch_all.py --only tokens "
                f"or publish the variable in the library"
            )
        ident = f"VAR_{sanitize_var(hint)}"
        # dedupe by key
        for k, existing in self.vars.items():
            if k == key:
                return existing
        # ensure unique identifier
        base = ident
        n = 1
        while ident in self.vars.values():
            ident = f"{base}_{n}"
            n += 1
        self.vars[key] = ident
        return ident

    def add_component(self, comp_key, hint):
        if comp_key in self.components:
            return self.components[comp_key]
        ident = f"CMP_{sanitize_var(hint)}"
        base = ident
        n = 1
        while ident in self.components.values():
            ident = f"{base}_{n}"
            n += 1
        self.components[comp_key] = ident
        return ident

    def add_text_style(self, style_entry, hint):
        key = style_entry.get("key")
        if not key:
            raise ComposeError(f"text style {hint!r} has no key in tokens-mapping")
        if key in self.text_styles:
            return self.text_styles[key]
        ident = f"STY_text_{sanitize_var(hint)}"
        base = ident
        n = 1
        while ident in self.text_styles.values():
            ident = f"{base}_{n}"
            n += 1
        self.text_styles[key] = ident
        # collect font
        fam = style_entry.get("font") or "PingFang SC"
        weight = style_entry.get("weight") or 400
        style_name = WEIGHT_TO_STYLE.get(int(weight), "Regular")
        self.fonts.add((fam, style_name))
        return ident


# --------------------------------------------------------------------------- #
# Node code generation                                                        #
# --------------------------------------------------------------------------- #

INDENT = "    "


def emit_token_binding(node_var, field, var_ident, depth):
    pad = INDENT * depth
    return f"{pad}{node_var}.setBoundVariable({js_str(field)}, {var_ident});"


def emit_padding_binding(node_var, var_ident, depth):
    pad = INDENT * depth
    sides = ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"]
    return "\n".join(
        f"{pad}{node_var}.setBoundVariable({js_str(s)}, {var_ident});" for s in sides
    )


def emit_corner_binding(node_var, var_ident, depth):
    pad = INDENT * depth
    sides = ["topLeftRadius", "topRightRadius", "bottomLeftRadius", "bottomRightRadius"]
    return "\n".join(
        f"{pad}{node_var}.setBoundVariable({js_str(s)}, {var_ident});" for s in sides
    )


def emit_node(node, parent_var, depth, syms, tokens, components, icons, var_counter):
    """Return JS code (string) that creates this node and appends to parent_var.
    var_counter is a [int] mutable counter used to make unique JS var names."""
    pad = INDENT * depth
    t = node.get("type")
    if t == "instance":
        return emit_instance(node, parent_var, depth, syms, components, var_counter, is_top=False)
    if t == "frame":
        return emit_frame(node, parent_var, depth, syms, tokens, components, icons, var_counter, is_top=False)
    if t == "text":
        return emit_text(node, parent_var, depth, syms, tokens, var_counter)
    if t == "icon":
        return emit_icon(node, parent_var, depth, syms, icons, var_counter)
    raise ComposeError(f"unknown node type {t!r}")


def _next_var(var_counter, prefix):
    var_counter[0] += 1
    return f"{prefix}{var_counter[0]}"


def emit_instance(node, parent_var, depth, syms, components, var_counter, is_top):
    pad = INDENT * depth
    set_key = node.get("set_key")
    props = node.get("props") or {}
    variant_key, variant_name, set_info = resolve_instance_key(components, set_key, props)
    hint = (set_info.get("name") or "comp") + "_" + "_".join(f"{k}{v}" for k, v in props.items())
    cmp_ident = syms.add_component(variant_key, hint[:40])
    v = _next_var(var_counter, "inst")
    lines = [
        f"{pad}{{",
        f"{pad}{INDENT}const {v} = {cmp_ident}.createInstance();",
        f"{pad}{INDENT}{v}.name = {js_str(node.get('name') or variant_name or 'instance')};",
    ]
    if "insert_at_index" in node and is_top:
        lines.append(f"{pad}{INDENT}{parent_var}.insertChild({int(node['insert_at_index'])}, {v});")
    else:
        lines.append(f"{pad}{INDENT}{parent_var}.appendChild({v});")
    if is_top:
        lines.append(f"{pad}{INDENT}created.push({{ name: {v}.name, id: {v}.id }});")
    lines.append(f"{pad}}}")
    return "\n".join(lines)


def emit_frame(node, parent_var, depth, syms, tokens, components, icons, var_counter, is_top):
    pad = INDENT * depth
    v = _next_var(var_counter, "frm")
    lines = [
        f"{pad}{{",
        f"{pad}{INDENT}const {v} = figma.createFrame();",
        f"{pad}{INDENT}{v}.name = {js_str(node.get('name') or 'frame')};",
    ]
    lm = node.get("layoutMode")
    # sizing modes — explicit per-axis, default AUTO (hug content) for auto-layout frames.
    # Use "FIXED" + width/height to pin; "AUTO" means hug children on that axis.
    primary_sizing = node.get("primaryAxisSizingMode")    # "AUTO" | "FIXED"
    counter_sizing = node.get("counterAxisSizingMode")    # "AUTO" | "FIXED"
    has_size = "width" in node and "height" in node
    if lm in ("VERTICAL", "HORIZONTAL"):
        lines.append(f"{pad}{INDENT}{v}.layoutMode = {js_str(lm)};")
        # Decide sizing: if the brief explicitly passed FIXED on an axis, honor it
        # (and require width/height). Otherwise default AUTO and FORBID resize(),
        # because resize() silently flips sizingMode back to FIXED — the #1 source
        # of "padding not hugging" bugs.
        p_mode = primary_sizing or ("FIXED" if has_size else "AUTO")
        c_mode = counter_sizing or ("FIXED" if has_size else "AUTO")
        lines.append(f"{pad}{INDENT}{v}.primaryAxisSizingMode = {js_str(p_mode)};")
        lines.append(f"{pad}{INDENT}{v}.counterAxisSizingMode = {js_str(c_mode)};")
        if has_size and (p_mode == "FIXED" or c_mode == "FIXED"):
            lines.append(f"{pad}{INDENT}{v}.resize({float(node['width'])}, {float(node['height'])});")
        elif has_size:
            raise ComposeError(
                f"frame {node.get('name')!r}: width/height supplied but both sizing "
                f"modes are AUTO (hug). Either drop width/height (recommended — let "
                f"auto-layout hug children) or set primaryAxisSizingMode/"
                f"counterAxisSizingMode to \"FIXED\"."
            )
    else:
        # non-auto-layout frame: width/height applies via plain resize
        if has_size:
            lines.append(f"{pad}{INDENT}{v}.resize({float(node['width'])}, {float(node['height'])});")
    # itemSpacing
    if "itemSpacing_token" in node:
        ve = resolve_token(tokens, node["itemSpacing_token"])
        ident = syms.add_var(ve, node["itemSpacing_token"].replace(".", "_"))
        lines.append(emit_token_binding(v, "itemSpacing", ident, depth + 1))
    elif "itemSpacing" in node:
        lines.append(f"{pad}{INDENT}{v}.itemSpacing = {int(node['itemSpacing'])};")
    # padding
    if "padding_token" in node:
        ve = resolve_token(tokens, node["padding_token"])
        ident = syms.add_var(ve, node["padding_token"].replace(".", "_"))
        lines.append(emit_padding_binding(v, ident, depth + 1))
    elif "padding" in node:
        p = node["padding"]
        if isinstance(p, dict):
            for side_js, key in (("paddingTop", "top"), ("paddingRight", "right"),
                                 ("paddingBottom", "bottom"), ("paddingLeft", "left")):
                if key in p and p[key] is not None:
                    lines.append(f"{pad}{INDENT}{v}.{side_js} = {int(p[key])};")
        elif isinstance(p, (int, float)):
            for side_js in ("paddingTop", "paddingRight", "paddingBottom", "paddingLeft"):
                lines.append(f"{pad}{INDENT}{v}.{side_js} = {int(p)};")
    # corner radius
    if "corner_radius_token" in node:
        ve = resolve_token(tokens, node["corner_radius_token"])
        ident = syms.add_var(ve, node["corner_radius_token"].replace(".", "_"))
        lines.append(emit_corner_binding(v, ident, depth + 1))
    elif "corner_radius" in node:
        lines.append(f"{pad}{INDENT}{v}.cornerRadius = {int(node['corner_radius'])};")
    # fill — Figma requires variable to be bound on the paint object directly,
    # not on the node's fills field. Use setBoundVariableForPaint.
    if "fill_token" in node:
        ve = resolve_token(tokens, node["fill_token"])
        hint = node["fill_token"].replace(".", "_")
        ident = syms.add_var(ve, hint)
        lines.append(
            f"{pad}{INDENT}{v}.fills = [figma.variables.setBoundVariableForPaint("
            f"{{ type: \"SOLID\", color: {{ r: 1, g: 1, b: 1 }} }}, \"color\", {ident})];"
        )
    elif "fill_variable_id" in node:
        ve_hit = find_variable_id(tokens, node["fill_variable_id"])
        if not ve_hit:
            raise ComposeError(f"fill_variable_id {node['fill_variable_id']!r} not in tokens-mapping")
        ve, parents = ve_hit
        hint = "_".join(parents[-2:])
        ident = syms.add_var(ve, hint)
        lines.append(
            f"{pad}{INDENT}{v}.fills = [figma.variables.setBoundVariableForPaint("
            f"{{ type: \"SOLID\", color: {{ r: 1, g: 1, b: 1 }} }}, \"color\", {ident})];"
        )

    # children
    for ch in node.get("children") or []:
        lines.append(emit_node(ch, v, depth + 1, syms, tokens, components, icons, var_counter))

    if "insert_at_index" in node and is_top:
        lines.append(f"{pad}{INDENT}{parent_var}.insertChild({int(node['insert_at_index'])}, {v});")
    else:
        lines.append(f"{pad}{INDENT}{parent_var}.appendChild({v});")

    # layoutSizing — only valid AFTER appendChild (needs parent auto-layout context).
    # Values: "FILL" (stretch in parent), "HUG" (hug children), "FIXED" (keep current size).
    for axis_key, prop in (("layoutSizingHorizontal", "layoutSizingHorizontal"),
                            ("layoutSizingVertical", "layoutSizingVertical")):
        if axis_key in node:
            val = node[axis_key]
            if val not in ("FILL", "HUG", "FIXED"):
                raise ComposeError(f"{axis_key} must be FILL/HUG/FIXED, got {val!r}")
            lines.append(f"{pad}{INDENT}try {{ {v}.{prop} = {js_str(val)}; }} catch (e) {{ /* parent not auto-layout */ }}")
    if is_top:
        lines.append(f"{pad}{INDENT}created.push({{ name: {v}.name, id: {v}.id }});")
    lines.append(f"{pad}}}")
    return "\n".join(lines)


def emit_text(node, parent_var, depth, syms, tokens, var_counter):
    pad = INDENT * depth
    v = _next_var(var_counter, "txt")
    style_key = node.get("text_style_key")
    style_entry = (tokens.get("text_styles") or {}).get(style_key)
    if not style_entry:
        raise ComposeError(f"text_style_key {style_key!r} not in tokens.text_styles")
    sty_ident = syms.add_text_style(style_entry, style_key)
    fam = style_entry.get("font") or "PingFang SC"
    weight = int(style_entry.get("weight") or 400)
    style_name = WEIGHT_TO_STYLE.get(weight, "Regular")
    content = node.get("content") or "<TODO 文案>"
    lines = [
        f"{pad}{{",
        f"{pad}{INDENT}const {v} = figma.createText();",
        f"{pad}{INDENT}{v}.fontName = {{ family: {js_str(fam)}, style: {js_str(style_name)} }};",
        f"{pad}{INDENT}{v}.characters = {js_str(content)};",
        f"{pad}{INDENT}await {v}.setRangeTextStyleIdAsync(0, {v}.characters.length, {sty_ident}.id);",
    ]
    if "fill_token" in node:
        ve = resolve_token(tokens, node["fill_token"])
        hint = node["fill_token"].replace(".", "_")
        ident = syms.add_var(ve, hint)
        lines.append(
            f"{pad}{INDENT}{v}.fills = [figma.variables.setBoundVariableForPaint("
            f"{{ type: \"SOLID\", color: {{ r: 0, g: 0, b: 0 }} }}, \"color\", {ident})];"
        )
    elif "fill_variable_id" in node:
        ve_hit = find_variable_id(tokens, node["fill_variable_id"])
        if not ve_hit:
            raise ComposeError(f"fill_variable_id {node['fill_variable_id']!r} not in tokens-mapping")
        ve, parents = ve_hit
        hint = "_".join(parents[-2:])
        ident = syms.add_var(ve, hint)
        lines.append(
            f"{pad}{INDENT}{v}.fills = [figma.variables.setBoundVariableForPaint("
            f"{{ type: \"SOLID\", color: {{ r: 0, g: 0, b: 0 }} }}, \"color\", {ident})];"
        )
    lines.append(f"{pad}{INDENT}{parent_var}.appendChild({v});")
    lines.append(f"{pad}}}")
    return "\n".join(lines)


def emit_icon(node, parent_var, depth, syms, icons, var_counter):
    pad = INDENT * depth
    icon_key = node.get("icon_key")
    if not icon_key or icon_key not in (icons.get("by_key") or {}):
        raise ComposeError(f"icon_key {icon_key!r} not in icons.by_key")
    icon_meta = icons["by_key"][icon_key]
    hint = "icon_" + sanitize_var(icon_meta.get("name", "?"))
    cmp_ident = syms.add_component(icon_key, hint)
    v = _next_var(var_counter, "ico")
    lines = [
        f"{pad}{{",
        f"{pad}{INDENT}const {v} = {cmp_ident}.createInstance();",
        f"{pad}{INDENT}{v}.name = {js_str(node.get('name') or icon_meta.get('name') or 'icon')};",
        f"{pad}{INDENT}{parent_var}.appendChild({v});",
        f"{pad}}}",
    ]
    return "\n".join(lines)


# --------------------------------------------------------------------------- #
# Top-level                                                                   #
# --------------------------------------------------------------------------- #

def compose(brief, tokens, components, icons):
    target = brief.get("target") or {}
    target_file_key = target.get("file_key")
    reference_node_id = target.get("reference_node_id")
    section_name = target.get("section_name")
    root_name = target.get("root_frame_name") or "补全设计区"
    section_offset_x = int(target.get("section_offset_x", 120))
    section_offset_y = int(target.get("section_offset_y", 0))
    section_bg = target.get("section_background_hex") or "#2B2B2B"
    if not target_file_key:
        raise ComposeError("brief.target.file_key is required")
    if not reference_node_id:
        raise ComposeError("brief.target.reference_node_id is required")
    if not section_name:
        raise ComposeError("brief.target.section_name is required")

    syms = Symbols()
    var_counter = [0]

    # Phase 3 body — generate first so syms is populated
    body_blocks = []
    for i, m in enumerate(brief.get("modules") or []):
        t = m.get("type")
        if t == "instance":
            body_blocks.append(emit_instance(m, "anchor", 2, syms, components, var_counter, is_top=True))
        elif t == "frame":
            body_blocks.append(emit_frame(m, "anchor", 2, syms, tokens, components, icons, var_counter, is_top=True))
        elif t == "text":
            block = emit_text(m, "anchor", 2, syms, tokens, var_counter)
            # promote: also push to created — wrap in a "{ ... created.push(...) }" by post-processing
            # simpler: re-emit with a tiny wrapper
            body_blocks.append(_promote_to_created(block))
        elif t == "icon":
            block = emit_icon(m, "anchor", 2, syms, icons, var_counter)
            body_blocks.append(_promote_to_created(block))
        else:
            raise ComposeError(f"top-level module type {t!r} not supported")

    # Phase 1 imports
    var_imports = [
        f"{INDENT*3}figma.variables.importVariableByKeyAsync({js_str(k)})"
        for k in syms.vars
    ]
    cmp_imports = [
        f"{INDENT*3}figma.importComponentByKeyAsync({js_str(k)})"
        for k in syms.components
    ]
    sty_imports = [
        f"{INDENT*3}figma.importStyleByKeyAsync({js_str(k)})"
        for k in syms.text_styles
    ]
    all_idents = list(syms.vars.values()) + list(syms.components.values()) + list(syms.text_styles.values())
    all_imports = var_imports + cmp_imports + sty_imports

    imports_block = ""
    if all_idents:
        idents_str = ",\n".join(f"{INDENT*3}{i}" for i in all_idents)
        promises_str = ",\n".join(all_imports)
        imports_block = (
            f"{INDENT*2}const [\n{idents_str}\n{INDENT*2}] = await Promise.all([\n"
            f"{promises_str}\n{INDENT*2}]);\n"
        )

    # Phase 2 fonts
    font_block = ""
    if syms.fonts:
        font_loads = ",\n".join(
            f"{INDENT*3}figma.loadFontAsync({{ family: {js_str(fam)}, style: {js_str(sty)} }})"
            for fam, sty in sorted(syms.fonts)
        )
        font_block = f"{INDENT*2}await Promise.all([\n{font_loads}\n{INDENT*2}]);\n"

    # Assemble
    body_str = "\n".join(body_blocks)
    js = f"""// Auto-generated by scripts/compose_figma_section_code.py — do not hand-edit.
// target.reference_node_id = {reference_node_id!r}, target file = {target_file_key!r}
const created = [];
const warnings = [];
const layoutQa = {{ pass: true, failures: [] }};
const autoLayoutQa = {{ pass: true, failures: [] }};
try {{
{INDENT*2}const REF_NODE_ID = {js_str(reference_node_id)};
{INDENT*2}const ref = await figma.getNodeByIdAsync(REF_NODE_ID);
{INDENT*2}if (!ref) throw new Error(`reference node ${{REF_NODE_ID}} not found in current file`);
{INDENT*2}function findPage(node) {{
{INDENT*3}let p = node;
{INDENT*3}while (p && p.type !== "PAGE") p = p.parent;
{INDENT*3}return p || figma.currentPage;
{INDENT*2}}}
{INDENT*2}function hexToRgb(hex) {{
{INDENT*3}const raw = String(hex || "#2B2B2B").replace("#", "");
{INDENT*3}const n = parseInt(raw.length === 3 ? raw.split("").map(c => c + c).join("") : raw, 16);
{INDENT*3}return {{ r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 }};
{INDENT*2}}}
{INDENT*2}const page = findPage(ref);
{INDENT*2}const section = figma.createSection();
{INDENT*2}section.name = {js_str(section_name)};
{INDENT*2}page.appendChild(section);
{INDENT*2}try {{ section.fills = [{{ type: "SOLID", color: hexToRgb({js_str(section_bg)}) }}]; }} catch (e) {{ warnings.push("section background could not be set"); }}
{INDENT*2}const refBox = ref.absoluteBoundingBox;
{INDENT*2}if (refBox) {{
{INDENT*3}section.x = refBox.x + refBox.width + {section_offset_x};
{INDENT*3}section.y = refBox.y + {section_offset_y};
{INDENT*2}}}
{INDENT*2}const anchor = figma.createFrame();
{INDENT*2}anchor.name = {js_str(root_name)};
{INDENT*2}anchor.layoutMode = "VERTICAL";
{INDENT*2}anchor.primaryAxisSizingMode = "AUTO";
{INDENT*2}anchor.counterAxisSizingMode = "AUTO";
{INDENT*2}anchor.itemSpacing = 24;
{INDENT*2}anchor.fills = [];
{INDENT*2}section.appendChild(anchor);
{INDENT*2}anchor.x = 0;
{INDENT*2}anchor.y = 0;
{INDENT*2}created.push({{ name: section.name, id: section.id, type: "SECTION" }});

{INDENT*2}// Phase 1 — import library assets
{imports_block}
{INDENT*2}// Phase 2 — preload fonts
{font_block}
{INDENT*2}// Phase 3 — build module tree
{body_str}

{INDENT*2}return JSON.stringify({{
{INDENT*3}ok: true,
{INDENT*3}sectionId: section.id,
{INDENT*3}createdNodeIds: created.map(n => n.id),
{INDENT*3}created,
{INDENT*3}layoutQa,
{INDENT*3}autoLayoutQa,
{INDENT*3}warnings,
{INDENT*2}}});
}} catch (e) {{
{INDENT*2}return JSON.stringify({{
{INDENT*3}ok: false,
{INDENT*3}error: String(e && e.message || e),
{INDENT*3}failedStateId: null,
{INDENT*3}failures: [String(e && e.message || e)],
{INDENT*3}partialCreated: created.map(n => n.id),
{INDENT*2}}});
}}
"""
    return js, target_file_key, reference_node_id


def _promote_to_created(block_str):
    """For top-level text/icon, inject created.push right before the closing brace."""
    lines = block_str.rstrip().split("\n")
    if not lines:
        return block_str
    last = lines[-1]
    indent = last[: len(last) - len(last.lstrip())]
    # find the inner var (heuristic: search 'const VAR = figma.create' in block)
    m = re.search(r"const (\w+) = figma\.create", block_str)
    if not m:
        return block_str
    var = m.group(1)
    push = f"{indent}{INDENT}created.push({{ name: {var}.name, id: {var}.id }});"
    return "\n".join(lines[:-1] + [push, last])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("brief", help="path to brief.json")
    ap.add_argument("--out", help="output JS file (default: stdout)")
    args = ap.parse_args()

    brief = load(args.brief)
    tokens = load(MANIFESTS / "tokens-mapping.json")
    components = load(MANIFESTS / "components-manifest.json")
    icons = load(MANIFESTS / "icons-manifest.json")
    try:
        js, target_file_key, reference_node_id = compose(brief, tokens, components, icons)
    except ComposeError as e:
        print(f"COMPOSE FAIL: {e}", file=sys.stderr)
        return 1

    if args.out:
        Path(args.out).write_text(js)
        print(f"wrote {args.out}  ({len(js)} bytes)")
        print(f"  call: use_figma(fileKey={target_file_key!r}, code=<contents of {args.out}>, description=...)")
    else:
        print(js)
    return 0


if __name__ == "__main__":
    sys.exit(main())
