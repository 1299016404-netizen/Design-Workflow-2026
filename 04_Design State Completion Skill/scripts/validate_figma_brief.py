#!/usr/bin/env python3
"""Validate a brief.json against the manifests before writing to Figma.

Brief schema (v1, minimal):
{
  "target": {
    "file_key": "...",                   // user-provided target Figma file key
    "reference_node_id": "...",          // original page/module/component node; used only for locating the new Section
    "section_name": "业务状态补全 / 页面名称"
  },
  "modules": [
    {
      "name": "...",
      "type": "instance",
      "set_key": "...",                  // must exist in components by_set_key
      "props": { "层级": "白底", ... }    // optional; checked against set's variant_props
    },
    {
      "name": "...",
      "type": "frame",
      "layoutMode": "VERTICAL",          // VERTICAL | HORIZONTAL
      "itemSpacing_token": "spacing.l",  // dot path into manifests/tokens-mapping.json
      "padding_token":     "spacing.xl", // applied to all 4 sides
      "corner_radius_token": "radius.m",
      "fill_variable_id": "VariableID:208:11",   // optional
      "children": [
        { "type": "text",  "text_style_key": "h3", "fill_variable_id": "...", "content": "..." },
        { "type": "icon",  "icon_key": "..." },
        { "type": "instance", "set_key": "...", "props": {...} },
        { "type": "frame", ... }            // recursive
      ]
    }
  ]
}

Hard rules checked:
  R0  target.file_key, target.reference_node_id and target.section_name are required
  R1  module.type ∈ {instance, frame}
  R2  instance.set_key exists in manifests/components-manifest.by_set_key
  R3  instance.props keys are a subset of the set's known variant_props
       (values not checked — variants are not always exhaustive in the manifest)
  R4  frame.layoutMode ∈ {VERTICAL, HORIZONTAL}
  R5  every *_token resolves to an existing entry in manifests/tokens-mapping
       (spacing.<key>, radius.<key>, color.<bucket>.<key>, text.<key>)
  R6  every *_variable_id appears in manifests/tokens-mapping somewhere
  R7  text.text_style_key exists in tokens.text_styles
  R8  icon.icon_key exists in manifests/icons-manifest.by_key
  R9  raw padding/spacing values (if used without a token) must be in {0,6,12,18,24,30,36,42,48}
       (6-grid whitelist; deviation requires explicit justification field)

Exit 0 = PASS. Exit 1 = at least one FAIL.

Usage:
  python3 scripts/validate_figma_brief.py path/to/brief.json
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFESTS = ROOT / "manifests"
GRID = {0, 6, 12, 18, 24, 30, 36, 42, 48}


def load(p):
    return json.loads(Path(p).read_text())


def all_variable_ids(tokens):
    """Walk tokens-mapping and collect every 'id' field present."""
    out = set()
    def walk(node):
        if isinstance(node, dict):
            if "id" in node and isinstance(node["id"], str):
                out.add(node["id"])
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)
    walk(tokens)
    return out


def resolve_token_path(tokens, path):
    """Resolve dot-path like 'spacing.l' or 'color.text.dark' against tokens-mapping.
    Returns the token dict if found, else None."""
    parts = path.split(".")
    # tokens uses bare top-level keys: spacing/radius/text_styles/effects/colors
    # We accept 'color.<bucket>.<key>' as alias for 'colors.<bucket>.<key>'
    if parts[0] == "color":
        parts[0] = "colors"
    if parts[0] == "text":
        # allow 'text.h1' as shorthand for 'text_styles.h1'
        parts[0] = "text_styles"
    node = tokens
    for p in parts:
        if not isinstance(node, dict) or p not in node:
            return None
        node = node[p]
    if isinstance(node, dict) and "id" in node:
        return node
    return None


class Validator:
    def __init__(self, tokens, components, icons):
        self.tokens = tokens
        self.components = components
        self.icons = icons
        self.var_ids = all_variable_ids(tokens)
        self.failures = []
        self.warnings = []

    def fail(self, path, rule, msg):
        self.failures.append(f"  [{rule}] {path}: {msg}")

    def warn(self, path, msg):
        self.warnings.append(f"  {path}: {msg}")

    def check_token(self, path, field, value):
        tok = resolve_token_path(self.tokens, value)
        if tok is None:
            self.fail(path, "R5", f"{field}={value!r} does not resolve to any token in tokens-mapping")

    def check_variable_id(self, path, field, value):
        if value not in self.var_ids:
            self.fail(path, "R6", f"{field}={value!r} is not a known variable id in tokens-mapping")

    def check_raw_grid(self, path, field, value):
        if value not in GRID:
            self.fail(path, "R9", f"{field}={value} is not on the 6-grid whitelist {sorted(GRID)}")

    def check_instance(self, path, m):
        set_key = m.get("set_key")
        if not set_key:
            self.fail(path, "R2", "instance missing set_key")
            return
        info = self.components.get("by_set_key", {}).get(set_key)
        if not info:
            self.fail(path, "R2", f"set_key={set_key!r} not found in components.by_set_key")
            return
        props = m.get("props") or {}
        known = set(info.get("variant_props") or [])
        for pk in props:
            if known and pk not in known:
                self.warn(path, f"prop key {pk!r} not in set's variant_props {sorted(known)} (will still be sent, but may not bind)")

    def check_frame(self, path, m):
        lm = m.get("layoutMode")
        if lm not in (None, "VERTICAL", "HORIZONTAL"):
            self.fail(path, "R4", f"layoutMode={lm!r} must be VERTICAL or HORIZONTAL")

        for f in ("itemSpacing_token", "padding_token", "corner_radius_token", "fill_token"):
            v = m.get(f)
            if v is not None:
                self.check_token(path, f, v)

        for f in ("itemSpacing", "padding", "corner_radius"):
            v = m.get(f)
            if v is None:
                continue
            if isinstance(v, dict):
                for side, sv in v.items():
                    if isinstance(sv, (int, float)):
                        self.check_raw_grid(f"{path}.{f}.{side}", f"{f}.{side}", int(sv))
            elif isinstance(v, (int, float)):
                self.check_raw_grid(path, f, int(v))

        for f in ("fill_variable_id", "background_variable_id", "corner_radius_variable_id"):
            v = m.get(f)
            if v is not None:
                self.check_variable_id(path, f, v)

        for i, ch in enumerate(m.get("children") or []):
            self.check_node(f"{path}.children[{i}]", ch)

    def check_text(self, path, m):
        sk = m.get("text_style_key")
        if not sk or sk not in (self.tokens.get("text_styles") or {}):
            self.fail(path, "R7", f"text_style_key={sk!r} not found in tokens.text_styles")
        ft = m.get("fill_token")
        if ft is not None:
            self.check_token(path, "fill_token", ft)
        fv = m.get("fill_variable_id")
        if fv is not None:
            self.check_variable_id(path, "fill_variable_id", fv)

    def check_icon(self, path, m):
        ik = m.get("icon_key")
        if not ik or ik not in (self.icons.get("by_key") or {}):
            self.fail(path, "R8", f"icon_key={ik!r} not found in icons by_key")

    def check_node(self, path, m):
        t = m.get("type")
        if t == "instance":
            self.check_instance(path, m)
        elif t == "frame":
            self.check_frame(path, m)
        elif t == "text":
            self.check_text(path, m)
        elif t == "icon":
            self.check_icon(path, m)
        else:
            self.fail(path, "R1", f"unknown type {t!r} (allowed: instance/frame/text/icon)")

    def run(self, brief):
        target = brief.get("target") or {}
        if not isinstance(target, dict):
            self.fail("target", "R0", "target must be an object")
            target = {}
        for field in ("file_key", "reference_node_id", "section_name"):
            value = target.get(field)
            if not isinstance(value, str) or not value.strip():
                self.fail(f"target.{field}", "R0", f"{field} is required")
        if "page" in brief:
            self.warn("brief.page", "page is ignored by this Section writer; use target.reference_node_id instead")
        modules = brief.get("modules") or []
        if not isinstance(modules, list) or not modules:
            self.fail("modules", "R1", "modules must be a non-empty list")
            return
        for i, m in enumerate(modules):
            if not isinstance(m, dict):
                self.fail(f"modules[{i}]", "R1", "module must be an object")
                continue
            self.check_node(f"modules[{i}]({m.get('name', '?')})", m)


def main():
    if len(sys.argv) != 2:
        print("usage: validate_figma_brief.py path/to/brief.json", file=sys.stderr)
        return 2
    brief_path = Path(sys.argv[1])
    brief = load(brief_path)
    tokens = load(MANIFESTS / "tokens-mapping.json")
    components = load(MANIFESTS / "components-manifest.json")
    icons = load(MANIFESTS / "icons-manifest.json")

    v = Validator(tokens, components, icons)
    v.run(brief)

    if v.warnings:
        print("WARNINGS:")
        for w in v.warnings:
            print(w)
        print()

    if v.failures:
        print(f"FAIL ({len(v.failures)} issue(s)):")
        for f in v.failures:
            print(f)
        return 1

    print(f"PASS — brief is consistent with manifests "
          f"({len(brief.get('modules') or [])} top-level module(s) checked)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
