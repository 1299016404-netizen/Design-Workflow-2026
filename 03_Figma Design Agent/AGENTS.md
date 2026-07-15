<!-- BEGIN COMPOUND CODEX TOOL MAP -->
## Compound Codex Tool Mapping (Claude Compatibility)

This section maps Claude Code plugin tool references to Codex behavior.
Only this block is managed automatically.

Tool mapping:
- Read: use shell reads (cat/sed) or rg
- Write: create files via shell redirection or apply_patch
- Edit/MultiEdit: use apply_patch
- Bash: use shell_command
- Grep: use rg (fallback: grep)
- Glob: use rg --files or find
- LS: use ls via shell_command
- WebFetch/WebSearch: use curl or Context7 for library docs
- AskUserQuestion/Question: present choices as a numbered list in chat and wait for a reply number. For multi-select (multiSelect: true), accept comma-separated numbers. Never skip or auto-configure — always wait for the user's response before proceeding.
- Task/Subagent/Parallel: run sequentially in main thread; use multi_tool_use.parallel for tool calls
- TodoWrite/TodoRead: use file-based todos in todos/ with todo-create skill
- Skill: open the referenced SKILL.md and follow it
- ExitPlanMode: ignore
<!-- END COMPOUND CODEX TOOL MAP -->

# Figma Design Agent Rules

本项目是一个全新的 Figma 设计 Agent 规则包。执行任何任务时，只允许参考本项目内资产和用户明确提供的输入，不得参考本地已有的相似项目、历史项目或外部未授权素材。

## Source of Truth

- 上游设计需求文档是任务输入源，格式见 `docs/upstream-requirements-template.md`。
- 设计稿输出 Figma 写入地址是任务上下文源；执行 Step 1 时必须读取目标 Figma 文件、页面或节点。
- 设计规范以 `design-rules.md` 和 `figma-design.md` 为准。
- 图标只能来自 `figma-icons/`。
- 新样式参考图只能来自 `style-library/` 或用户在当前任务中明确提供的图片。
- 新增需求的排版选择流程以 `benefit-layout-selector/SKILL.md` 为准。
- 透明底切图输出目录默认为 `icon-cutout/`。
- 透明切图流程以 `transparent-icon-cutout/SKILL.md` 为准。

## Required Workflow

1. 读取并解析上游设计需求文档，识别其中的每一个需求；同时读取设计稿输出 Figma 写入地址对应的目标页面上下文。
2. 按需求类型路由：
   - `新增页面` 或 `新增模块`：进入新增分支。
   - `修改已有页面`：直接进入 Figma 设计执行分支。
3. 新增分支必须先询问用户选择：
   - `新样式`：走参考图、草稿图、透明切图、Figma 导入写入。
   - `规范样式`：跳过草稿图和切图，直接按规范写入 Figma。
4. 用户选择 `新样式` 或 `规范样式` 后，必须调用 `benefit-layout-selector` skill 给出 3 个排版方案，并等待用户确认其中一个。
5. 确认后的排版形式必须带入后续流程：
   - `新样式`：带入 `image_gen` 草稿图生成、透明切图判断和 Figma 写入。
   - `规范样式`：带入 Figma 规范样式输出。
6. 新样式分支必须完成草稿图用户确认后，才允许进入透明切图和 Figma 写入。
7. 每个需求必须独立处理、独立验收；不得只执行文档中的第一个需求。

详见 `docs/workflow.md`。

## Mandatory Tool Rules

- 生成新样式草稿图必须使用 `image_gen`。
- 新增需求在选择 `新样式` 或 `规范样式` 后，必须调用 `benefit-layout-selector` skill 推荐 3 个排版方案，并等待用户确认排版。
- 生成新样式草稿图时，必须结合参考图提炼后的风格提示词、当前需求内容、用户确认后的排版形式，以及 Figma 写入地址对应目标页面的结构、背景、位置和邻近模块上下文。
- 查看草稿图必须使用 `view_image`。
- 抠图导出透明底素材必须使用 `transparent-icon-cutout` skill。
- 写入 Figma 必须使用 `use_figma`。
- 新样式写入 Figma 时，必须导入 `icon-cutout/` 中由 `transparent-icon-cutout` 产出的 `*-transparent-trimmed.png`。
- Figma 中的装饰图、插画、视觉符号应使用透明底切图还原草稿图，不能用 SVG、基础形状、临时手绘或整张草稿图铺底替代。
- Figma 写入文字时，优先加载并使用 `PingFang SC`；如果字体无法写入或加载失败，必须 fallback 到 `Alibaba-PuHuiTi`。

## Hard Prohibitions

- 禁止参考本地其他相似项目。
- 禁止联网查找参考图，除非用户明确要求。
- 禁止用 SVG 画设计稿。
- 禁止用 AI 临时绘制图标。
- 禁止使用 Figma 默认图形临时拼接图标。
- 禁止使用 emoji 代替图标。
- 禁止对真实摄影图片、商品实拍图、酒店/景点照片等真实图片执行透明抠图；真实图片应保持原图或按常规图片资源处理。
- 禁止跳过用户确认节点。
- 禁止在新增需求中跳过排版方案确认，或由 Agent 自动选择排版方案。
- 禁止固定高度导致内容裁切或溢出。
- 禁止将草稿图整张作为 Figma 底图来冒充可编辑设计稿。

## Acceptance

完成后必须按 `docs/acceptance-checklist.md` 自检。新样式分支必须额外截图比对草稿图和 Figma 结果，确认结构、风格、透明切图资产和整体还原度一致。
