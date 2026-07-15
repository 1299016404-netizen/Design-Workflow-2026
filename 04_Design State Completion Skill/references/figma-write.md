# Figma Write Rules

<!-- scope: Figma 写入边界、参考结构、Section 输出、组件复用、Auto Layout、路径探针、返回格式 -->

## 1. 写入边界

- 写入 Figma 前必须使用 `figma-use` skill。
- 只有用户明确要求写回 Figma、直接生成画稿、补全设计稿或同等意图时，才写入原 Figma 文件。
- 写入前必须确认目标 file / node、补全区域名称和写入范围。
- 不覆盖原主页面，不改动与本次补全无关的原节点。
- 生成内容必须写入新建 Section；`target.reference_node_id` 只用于定位 page 和摆放位置，不得作为 append 父容器。
- 写入前集中确认所有会影响画稿结果的问题；写入后不得新增会改变画稿范围的问题。
- 默认采用 clone-first：复制参考页面、参考模块或原组件实例后改造。不得在已有参考节点可复制时，从空白重画一个视觉相似但脱离页面上下文的模块。
- 若目标模块来自完整页面，生成态必须保留真实页面 / 父容器上下文；只生成孤立模块需要用户明确要求。
- 写入时必须检查可加载中文字体。若 `PingFang SC` 不可加载，优先使用 `Noto Sans SC` 或当前文件中可加载的中文字体。
- 写入脚本执行前，必须先定位目标节点所在的 Page 并调用 `figma.setCurrentPageAsync(page)` 加载。未加载 Page 时，跨页面的子节点 ID 通过 `figma.getNodeById()` 可能返回 null。不得假设当前 Page 即为目标 Page。
- 当用户提供 Figma URL 且包含 `node-id` 时，该 `node_id` 是写入目标的唯一锚点。Page 定位必须通过遍历 Page 并验证 `figma.getNodeById(targetNodeId)` 存在来完成；不得用不带 `node-id` 的 top-level page 列表、当前选中节点、同名节点或历史补全 Section 覆盖该锚点。
- Page 定位不得只检查 `figma.getNodeById(targetNodeId)` 非空。必须沿目标节点 `parent` 链向上找到 `PAGE` 祖先，并以该 Page 作为目标 Page；写入前后都必须校验目标锚点、输出 Section、所有状态页 / 状态模块的祖先 Page 一致。
- 新建 Section 和状态画板必须创建在目标 Page 上。若使用 Section 作为组织区域，不得只依赖 `section.children` 判断包含关系；必须同时用状态节点 ID、祖先 Page 和 Section 坐标范围 / 包围盒关系验证输出归属。
- 大型写入脚本落盘后，优先用语法检查、关键函数 / 关键 ID 的定向搜索、小片段读取验证；不得每次小改都全文读取大脚本。只有语法错误、目标函数改动、路径定位失败或 QA 失败时，才允许按失败范围补读。

## 2. 参考稿结构解读

规格驱动生成和结构变体生成前，必须先对参考 Figma 稿做节点级结构分析，而不是只看截图。

必须识别：

- 每个关键子结构的语义角色：Tab 栏、锚点条 / 信息条、服务行列表、推荐标记、价格区、CTA、辅助提示等。
- 哪些子结构是 component instance（可 clone + override），哪些是普通 frame。
- 组件实例的 main component、component set 和可切换 variant properties。
- 稳定区和可变区。
- 若参考稿中已有多个完成状态，必须对比结构差异，作为已知变形模式。

不要跳过结构解读直接 clone 参考稿后凭直觉改。

## 3. 设计系统来源

高保真状态补全优先使用自定义 `use_figma` 脚本 clone 参考节点并改造。manifest 用于新增组件、图标、token 和来源校验，但不得用 manifest brief 从空白替代可 clone 的真实参考结构。

新增结构、补充资源和从空白生成的低保真草稿使用 manifest-driven brief 链路：

1. 生成 `brief.json`，其中 `target.file_key`、`target.reference_node_id`、`target.section_name` 必填。
2. 使用 `manifests/tokens-mapping.json` 选择颜色、间距、圆角、文字样式和 effect。
3. 使用 `manifests/components-manifest.json` 复用 component set / variant。
4. 使用 `manifests/icons-manifest.json` 复用图标。
5. 运行 `python3 scripts/validate_figma_brief.py brief.json`，FAIL 必须修到 PASS。
6. 运行 `python3 scripts/compose_figma_section_code.py brief.json --out /tmp/write.js`。
7. 调用 `use_figma(fileKey=<target.file_key>, code=<contents of /tmp/write.js>, description=...)`。

禁止为了视觉相似手绘替代 manifest 中已有的 component、icon、text style、spacing、radius 或 fill token。

## 4. 状态复杂度分级

写入前把每个状态分为三类，决定生成策略：

- 轻改状态：只改文案、字段值、显隐、状态标签或 CTA，不改变子结构。可批量生成。
- 结构变体：增删子结构、替换内容组合、改变列表数量、调整模块高度、切换上下文或影响页面流。生成前必须明确参考源、保留区、可变区、字段来源、路径探针结果和布局策略。
- 新组件 / 替代结构：参考稿中没有对应结构，需要新的卡片、弹窗、搜索区或兜底模块。必须确认组件来源；没有可靠来源时不得输出正式高保真稿。

全量生成时应分批进行：生成一批，完成四道 QA，问题清零后再进入下一批。已通过的状态作为回归基线，后续批次不得让其退化。

## 5. 路径探针

结构变体或 clone 改造前，先用 `scripts/read_reference_structure.js` 的 `probe` 模式验证关键路径。探针只返回：

- `ok`
- `missingPaths`
- `foundNodes`
- `flowObjects`
- `fixedObjects`
- `autoLayoutContainers`
- `risks`

路径探针必须确认：

- clone 源节点存在。
- 目标模块在复制后的页面 / 父容器内可定位。
- 目标模块下方页面流对象和固定区可区分。
- 关键 Auto Layout 容器可读取。
- 若输出为孤立模块，必须有用户明确要求或在结果中标注为模块态草稿。

探针失败时只读取错误相关路径，不重新做大范围结构读取。

## 6. Section 输出

- 每次生成的所有内容必须维持在同一个 Section 内，命名为 `业务状态补全 / {页面名称}`。
- Section 背景默认使用深色中性背景，推荐 `#2B2B2B` 或沿用当前文件同类补全 Section 的深色背景。
- 状态画板自身背景必须保持原稿真实背景，不因 Section 背景统一而修改。
- 默认只包含新生成的状态画板、页面内模块状态或组件变体，以及每个状态画板上方的简短状态说明。
- 状态矩阵只作为内部推演和写入前确认材料，默认不写入 Figma 画布。
- 默认不要在画布中额外生成可见标题、说明区或重复说明文本。
- 用户按 A/B/C 分组确认时，Figma 写入时也必须按同样分组排布。

页面内模块状态不是孤立卡片：必须复制包含该模块的真实页面 / 父容器，并在原承接位置改造模块。若只输出模块，应命名为“模块态”并说明未验证页面承接。

## 7. 命名和状态说明

- Section：`业务状态补全 / {页面名称}`。
- 画板 / 模块 / 组件命名使用纯状态名称，不带用户确认阶段的 `A1`、`B1`、`C1` 编号。
- 每个状态画板必须配套一个简短状态说明。轻量画布模式下，状态说明是状态画板上方唯一默认可见的说明文本。
- 状态说明在深色 Section 背景上必须使用浅色文字，推荐 `#F5F5F5`；辅助说明可用 `#D0D0D0`。
- 不写入 QA 过程说明。

## 8. 组件复用和画稿规则

- 保持原页面视觉语言：颜色、圆角、字体层级、按钮、图标、徽标、标签、分隔线、间距应来自原稿或原组件。
- 业务稳定元素不要随状态变化，例如挑战名称、任务标题、奖品名称、会员等级名称、酒店名、房型名、店铺名、基础价格结构。
- 组件来源优先级：① 当前 Figma 文件中的真实节点或组件实例 → ② 已订阅组件库中的组件 → ③ 用户提供的规范源 → ④ 当前主页面中可合法改造的原槽位。
- 找不到组件源时，不得输出正式高保真稿；可降级为低保真草稿并标注。
- 组件复用必须满足视觉体系、结构槽位和使用语境三要素；不得只因为存在 manifest key 或视觉相似节点就把它当作正式来源。
- 当用户要求直接生成为子组件时，必须创建或补齐 Figma component / component set，而不是只画普通 frame。
- 补充 variant 必须和原变体放在同一个父 component set 内；可标注 `来源=原组件` / `来源=补充`，但不要分散成两个无关组件区。
- 对复合模块，应先拆子组件，再列页面组合态。不要把所有状态都塞进一个大组件矩阵。
- 页面组合态中的状态说明必须放在对应画板上方，并优先用纯文本。
- 输出后必须完成语义、结构、视觉、来源四道 QA。截图检查不仅检查中文文本是否缺字、裁切或显示为空，还必须检查对齐、基线、密度、图标风格、槽位语义和正式稿质感。

## 9. Auto Layout 保真

- 参考稿关键容器若 `layoutMode != "NONE"`，生成稿对应容器也必须保持 Auto Layout。关键容器包括页面流容器、模块容器、列表 / 栅格容器、卡片容器、信息组、标题行、CTA / 操作组和其他设计师会继续编辑的结构层。
- 结构变体可以按布局策略在 `HORIZONTAL` 和 `VERTICAL` 间切换，但不得退化为 `NONE` 后只靠 `x/y` 坐标模拟。方向切换必须在布局策略和 QA 返回值中说明。
- 子节点顺序、`padding`、`itemSpacing`、`layoutSizingHorizontal`、`layoutSizingVertical`、`primaryAxisSizingMode` 和 `counterAxisSizingMode` 应优先沿用参考稿；确需改变时必须服务于结构变体，而不是写入脚本省事。
- 写入脚本必须显式区分几何尺寸和自适应语义：使用 `resize()` 调整视觉尺寸后，应重新设置需要保留的 `layoutSizingHorizontal` / `layoutSizingVertical` / `primaryAxisSizingMode` / `counterAxisSizingMode`。不得让 Figma API 的 resize 副作用把 Hug / Fill 静默变成 Fixed。
- 文本节点若参考稿使用 `textAutoResize=HEIGHT` 或 `WIDTH_AND_HEIGHT`，生成稿默认必须继承；只有明确需要截断、固定高度或单行限制时才允许改成 `NONE`，并纳入 `autoLayoutQa` 的允许变化清单。
- 图片裁切层、装饰矢量、蒙版、固定浮层、原本就是绝对定位的标签等，可保持非 Auto Layout；但不得把可编辑的信息结构层、列表层或卡片层整体降级为普通 frame。
- 结构变体写入脚本应嵌入或等价实现 `scripts/layout_visual_groups.js` 和 `scripts/auto_layout_qa.js`。写入后必须返回 `layoutQa` 和 `autoLayoutQa`，其中 `autoLayoutQa` 必须比较关键节点的 layout direction、Fill / Hug / Fixed、轴向 sizing mode、绝对定位比例和文本 autoresize。
- `layoutQa` 通过但 `autoLayoutQa` 失败时，仍视为不可交付。必须修复 Auto Layout 结构、明确降级为低保真，或阻断交付。

写入脚本执行前必须完成 API preflight：

- `layoutSizingHorizontal = "FILL"` 或 `layoutSizingVertical = "FILL"` 必须在节点 append 到 Auto Layout 父容器后设置；不得先设 FILL 再 append。
- 任何 `text.characters`、`textAutoResize`、`lineHeight`、`fontSize` 或文本尺寸变更前，必须先 `await figma.loadFontAsync(...)` 加载该文本节点当前字体或目标字体。
- 横向 Auto Layout 中直接托管文本前，必须确认不会破坏 `textAutoResize`；若会破坏，应增加文本容器层，让文本保持在垂直 / 自适应语境中。
- 修复脚本必须只作用于失败节点和失败状态，不得重写已通过状态；上一次 use_figma 失败按原子回滚处理，不得假设存在半成品节点。
- 脚本内置 QA、路径校验或 Page 归属校验失败时，必须 `throw` 触发 use_figma 原子回滚，或在返回 `ok:false` 前显式删除本次创建的所有节点。禁止创建节点后直接 `return { ok:false }`。
- `return { ok:false }` 不等于 Figma 回滚；只有脚本抛异常才可按 use_figma 原子失败处理。若脚本选择返回失败对象，必须同时证明 `partialCreated` 已清理为空，或列出仍需人工确认的残留节点。

## 10. 返回格式

成功时返回轻量结果：

```json
{
  "ok": true,
  "sectionId": "...",
  "stateNodeIds": ["..."],
  "targetModuleNodeIds": ["..."],
  "layoutQa": {"pass": true, "failures": []},
  "autoLayoutQa": {"pass": true, "failures": []},
  "warnings": []
}
```

成功返回必须遵守字段白名单：`ok`、`sectionId`、`stateNodeIds`、`targetModuleNodeIds`、`layoutQa`、`autoLayoutQa`、`warnings`。禁止默认返回 `allCreatedNodeIds`、`allMutatedNodeIds`、完整 `stateSummaries`、完整节点几何或完整节点树。若需要进一步验证，后续步骤应按关键 ID 定向读取；只有失败返回或调试复盘模式可以展开详细证据。

失败时才返回详细证据：

```json
{
  "ok": false,
  "error": "...",
  "failedStateId": "...",
  "missingPaths": [],
  "failures": [],
  "partialCreated": []
}
```

失败返回必须区分两类：

- 脚本抛异常：按 use_figma 原子回滚处理，通常没有画布残留。
- 脚本返回 `ok:false`：不视为原子回滚；必须返回已清理结果，或返回 `partialCreated` 并阻断继续写入，先处理残留。

成功时不得返回完整 stateSummaries 或大段节点几何。

## 11. 失败最小修复

use_figma 或 QA 失败后的下一步只允许读取错误相关范围：

- 找不到节点：只探测目标父节点和候选同名 / 同语义节点。
- clone 失败：只检查 clone 源节点、父 page 和目标 Section。
- Auto Layout 失败：只读取失败容器及其直接子节点。
- 文案 / override 失败：只读取对应文本节点和所属状态画板。

不得因为单个状态失败重新读取完整 Section、完整页面或全部规则文件。

失败修复前必须先确认是否存在本次任务产生的残留 Section、状态页或模块。只允许清理可证明由本次失败批次创建且不属于最终通过结果的节点；清理前后都要用祖先 Page 和关键 node id 校验，避免误删用户或其他任务内容。

修复脚本定位目标节点时，必须同时按节点类型（FRAME / INSTANCE / TEXT 等）和层级路径过滤，不得仅按名称字符串匹配。复杂页面中同名节点频繁出现，仅按名称匹配容易命中错误节点导致修复二次失败。
