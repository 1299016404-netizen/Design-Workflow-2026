# Adapter: use_figma Section writer

适配 Codex 桌面端的 `use_figma`。本文档定义 `brief.json -> Figma Plugin API JS` 的翻译约定，由 `scripts/compose_figma_section_code.py` 强制实现。

## 调用契约

```text
python3 scripts/validate_figma_brief.py brief.json
python3 scripts/compose_figma_section_code.py brief.json --out /tmp/write.js
use_figma(fileKey=<brief.target.file_key>, code=<contents of /tmp/write.js>, description="...")
```

返回值必须是 JSON 字符串：

```json
{ "ok": true, "created": [{"name": "业务状态补全 / 页面名称", "id": "123:456", "type": "SECTION"}], "warnings": [] }
```

失败时返回：

```json
{ "ok": false, "error": "...", "stack": "...", "partial_created": [...] }
```

## Brief Target

```json
{
  "target": {
    "file_key": "目标 Figma 文件 key",
    "reference_node_id": "原主页面/模块/组件 node id",
    "section_name": "业务状态补全 / 页面名称",
    "root_frame_name": "补全设计区"
  },
  "modules": []
}
```

`reference_node_id` 只用于定位新 Section 所在 page 和摆放位置，禁止作为 `appendChild` / `insertChild` 的父容器。

## 生成的 JS 结构

### Phase 0 — Header / Safety

```js
const created = [];
const warnings = [];
try {
  const ref = await figma.getNodeByIdAsync(REF_NODE_ID);
  if (!ref) throw new Error("reference node not found");
  const page = findPage(ref);
  const section = figma.createSection();
  section.name = brief.target.section_name;
  page.appendChild(section);
  const anchor = figma.createFrame();
  anchor.name = brief.target.root_frame_name || "补全设计区";
  anchor.layoutMode = "VERTICAL";
  anchor.primaryAxisSizingMode = "AUTO";
  anchor.counterAxisSizingMode = "AUTO";
  anchor.fills = [];
  section.appendChild(anchor);
```

所有 brief 顶层 `modules` 都 append 到新建的 `anchor` root frame，不写入原参考节点。

### Phase 1 — Import Library Assets

所有跨文件引用必须先 import：

- `tokens-mapping.json` 中的 variable key -> `figma.variables.importVariableByKeyAsync`
- `components-manifest.json` 中匹配到的 variant key -> `figma.importComponentByKeyAsync`
- `icons-manifest.json` 中的 icon key -> `figma.importComponentByKeyAsync`
- `tokens-mapping.json.text_styles` 中的 style key -> `figma.importStyleByKeyAsync`

### Phase 2 — Preload Fonts

所有 text 节点写入前必须 `figma.loadFontAsync`。

### Phase 3 — Build Module Tree

| brief 字段 | Plugin API 调用 |
| --- | --- |
| `type:"instance"`, `set_key` + `props` | 按 props 在 `components-manifest.by_set_key` 找精确 variant key，import 后 `createInstance()` |
| `type:"frame"`, `layoutMode` | `figma.createFrame()` 并设置 auto-layout |
| `itemSpacing_token` | `node.setBoundVariable("itemSpacing", VAR_x)` |
| `padding_token` | 绑定 `paddingTop/Right/Bottom/Left` |
| `corner_radius_token` | 绑定四个 radius 字段 |
| `fill_token` / `fill_variable_id` | 使用 `figma.variables.setBoundVariableForPaint(..., "color", VAR_x)` |
| `type:"text"`, `text_style_key` | `createText()` + `setRangeTextStyleIdAsync` |
| `type:"icon"`, `icon_key` | import icon component 后 `createInstance()` |

### Phase 3.5 — Visual Group Layout For Structure Variants

当写入脚本执行结构变体、数量边界、内容减少、模块高度收缩、横纵布局切换或页面流联动时，必须使用视觉组布局模型，而不是只写孤立坐标。

推荐做法：

1. 在 use_figma 写入脚本顶部嵌入 `scripts/layout_visual_groups.js`，或实现等价的视觉组 helper。
2. 把关键节点归入视觉组，例如主视觉组、主信息组、辅助信息组、操作组、状态 / 标签组。
3. 用 group box 和父容器 content box 计算位置，再落到节点 `x/y/width/height`。
4. 将视觉组目标关系翻译回 Figma Auto Layout：设置父容器方向、padding、gap、子节点顺序和 fill / hug / fixed，而不是只保留计算后的坐标。
5. 在 use_figma 写入脚本顶部嵌入 `scripts/auto_layout_qa.js`，或实现等价的 Auto Layout 结构保真 QA。
6. 写入后用 helper 的 `qa()` 返回组级对齐结果，并用 `AutoLayoutQA.compare()` 返回结构保真结果；任一失败时停止交付并修复。

禁止做法：

- 只用 `node.x = ...; node.y = ...` 这类孤立硬编码完成结构变体。
- 只检查容器宽高、节点数量或文本非空，不检查视觉组之间的对齐关系。
- 参考稿关键容器是 Auto Layout，但生成稿把对应容器退化为 `layoutMode = "NONE"`。
- 视觉组 QA 通过后跳过 Auto Layout 结构 QA。
- 只靠截图目检替代结构化组级 QA。

返回值应包含：

```json
{
  "createdNodeIds": ["..."],
  "mutatedNodeIds": ["..."],
  "layoutQa": {
    "pass": true,
    "groups": ["主视觉组", "主信息组"],
    "relations": ["insideParent", "centerY"],
    "failures": []
  },
  "autoLayoutQa": {
    "pass": true,
    "checked": ["推荐权益", "权益卡", "标题行", "信息组"],
    "failures": []
  }
}
```

## 已知陷阱

1. 跨文件变量必须用 published `variable.key`，不是 `VariableID`。
2. fill 变量必须绑在 paint 对象上，不能 `node.setBoundVariable("fills", v)`。
3. variant 必须精确匹配 props，找不到就 compose 失败，不选“最接近”。
4. catch 返回 `partial_created` 后，调用方应按 id 删除已创建节点做回滚。
5. 本适配器不修改、移动、删除原参考节点。
6. 生成代码必须使用 `use_figma` 支持的顶层 `await` + 顶层 `return`，禁止包成 `(async () => {})()`。
7. 结构变体必须以视觉组和对齐轴为主要布局单位；孤立坐标只能作为组级计算后的结果。
