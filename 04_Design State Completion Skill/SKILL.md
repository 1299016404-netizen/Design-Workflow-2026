---
name: figma-design-completion
description: >
  当用户基于已有 Figma 主页面、模块或组件，要求补齐业务全情况、全状态、状态矩阵、组件变体或补全设计稿时使用。
  触发示例：
  - "补齐这个 Figma 页面所有业务状态" / "complete all business states for this Figma page"
  - "从这个主态反推还缺哪些全情况" / "derive missing states from this main design"
  - "把这个模块的状态矩阵和补全稿写回 Figma" / "write the matrix and completed variants back to Figma"
  - "扩展这个组件的业务变体" / "extend this component's business variants"
  - "按照这份状态表生成设计稿" / "generate designs from this state specification table"
  适用：已有 Figma 设计稿，需要推演业务变量、合法组合、状态矩阵，并在确认后生成页面态、模块态或组件变体；也适用于 PD 提供完整状态规格表后的规格驱动生成。
  不适用：从零设计页面、单纯 UI 美化、普通 Figma 搭建、纯 hover/pressed/focused 交互态、未明确要求的 loading/空态/网络失败等异常状态。
requires_human: true
knowledge_sink: true
self_evolution: true
author_intent:
  load_mode: description
  model_policy: runtime_default
  tool_policy: require_confirmation_for_writes
---

# Figma Design Completion

## 目标

从已有 Figma 主页面、模块或组件出发，补齐成立且有设计价值的业务状态、内容边界状态、页面组合态或组件变体。

运行目标：框架清晰、结构轻量、文件能少就不要多；运行时少读文件、少读 Figma、少返回冗余结果，同时不降低设计稿输出质量。

## 运行时边界

正式生成、盲测、探索式推导和规格驱动生成时，默认只允许读取 `maintenance/` 之外的运行资料：

- `SKILL.md`
- `references/core.md`
- `references/spec-generation.md`
- `references/figma-write.md`
- `references/layout.md`
- `references/qa.md`
- `references/domains/<domain>.md`
- `manifests/*`
- `scripts/*`

禁止在普通运行中读取 `maintenance/*`。只有用户明确要求复盘、优化 skill、对比内部案例、调试失败案例或审查历史材料时，才可读取 `maintenance/*`。

## 模式判定

进入执行前必须先判定模式；两种主模式互斥，只能命中一条链路。

- **规格驱动生成**：用户提供状态输入表、执行表或等效结构化状态定义。读取 `references/spec-generation.md`，不再推导状态矩阵。
- **探索式推导**：用户提供 Figma 链接和需求背景，但没有完整状态定义。读取 `references/core.md`，先推导状态范围和候选状态。
- **调试复盘 / skill 优化**：用户明确要求复盘、对比、分析失败或优化 skill。此时可读取 `maintenance/*`，但不得进入正式生成链路。

如果用户同时提供主页面和手动全情况稿，但表达的是测试泛化能力，按探索式或盲测处理，手动全情况稿暂不读取。

## 运行时节流原则

默认轻量，命中再加深；成功轻返回，失败才展开；同结构复用，禁止重复重型推导。

硬门禁：

1. 输入去重：用户已粘贴 skill 全文时，不再重复读取入口全文；用户只给路径时才读取入口。
2. 读取缓存：同一任务内已读取的 skill / reference / script 文件必须进入 read cache，后续只引用已读结论，不重复全文读取；只有文件刚被修改、失败修复需要、规则冲突或用户要求复核时，才允许按章节、函数或失败范围定向补读。
3. 模式互斥：模式判定后，不读取未命中模式的规则文件。
   - 规格驱动生成禁止读取 `references/core.md`。
   - 探索式推导禁止读取 `references/spec-generation.md`。
   - 只有用户明确要求复盘、对比两种模式、优化 skill 或调试链路串线时，才允许同时读取两者。
4. Figma 输入锚点：用户提供 Figma URL 且包含 `node-id` 时，该 `node_id` 是最高优先级目标锚点。任何 page 列表、当前选中页、同名节点或全文件搜索结果都不得覆盖该锚点；只允许用于反查该节点所在 Page。
5. Page 定位：写入或 use_figma 读取前，必须通过“目标 `node_id` 在哪个 Page 下可访问”确定 Page；不得用不带 `node_id` 的 top-level page 列表反推目标 Page。
6. 规则预算：只读取当前模式必需文件；`layout.md` 仅命中内容边界、页面流或结构变体时读取；`qa.md` 在写入前后门禁阶段读取。每次读取前先说明触发条件，不允许为了“保险”全量读取运行文件。
7. Figma 分层读取：先用 `scripts/read_reference_structure.js` 的 `shallow` 模式读取浅层语义地图，再只对目标模块关键节点使用 `deep` 模式；不得默认深递归读取实例内部矢量、导航、状态栏等无关细节。
8. 结构读取轻返回：`shallow/probe/deep` 默认返回 compact summary；只返回目标变化区、直接父容器、直接后继页面流对象和固定区外层所需字段。禁止返回全页 Auto Layout 列表、完整 instance 内部树或无关稳定区几何。
9. 模板组复用：未完成结构形态分组，不进入逐状态生成；同结构组只允许一个模板状态完整生成，其余轻量复制。
10. 路径探针：结构变体或 clone 改造前，用 `scripts/read_reference_structure.js` 的 `probe` 模式验证关键节点、目标模块、页面流和固定区可定位。
11. 批量写入：同批状态尽量一次 brief、一次 compose、一次 use_figma 写入。
12. 写入事务安全：写入前后必须校验目标锚点、输出 Section、状态页 / 状态模块的 Page 祖先一致。脚本内置 QA 失败时必须抛异常触发原子回滚，或在返回 `ok:false` 前显式清理本次创建节点；不得把 `return {ok:false}` 当作 Figma 回滚。
13. 成功轻返回：use_figma 成功时只返回 `ok`、`sectionId`、`stateNodeIds`、`targetModuleNodeIds`、`layoutQa/autoLayoutQa` 的 pass/failures 和必要 warnings；禁止递归返回新 Section 的全部后代节点 ID，禁止默认返回 `allCreatedNodeIds`、`allMutatedNodeIds`、完整 `stateSummaries` 或完整几何。详细证据只在失败或调试复盘模式返回。

## 读取预算

普通运行中按下表控制读取范围：

| 场景 | 必读 | 条件读取 | 禁止读取 |
| --- | --- | --- | --- |
| 探索式推导 | `SKILL.md`、`references/core.md` | 写入时读 `figma-write.md`；命中布局读 `layout.md`；QA 时读 `qa.md`；命中业务域读 `domains/*` | `spec-generation.md`、`maintenance/*` |
| 规格驱动生成 | `SKILL.md`、`references/spec-generation.md`、`references/figma-write.md` | 命中布局读 `layout.md`；QA 时读 `qa.md`；命中业务域读 `domains/*` | `core.md`、`maintenance/*` |
| 写入失败修复 | `figma-write.md`、错误相关脚本或节点 | 仅当失败类型命中时读 `layout.md` 或 `qa.md` | 重新大范围读取 Figma 或全量规则 |

同一文件在同一任务中已读过时，后续只引用结论，不重复读取全文。

## 质量底线

瘦身只减浪费，不减质量。以下门禁不得删除：

- 参考节点结构解读
- clone-first 高保真改造：能复制参考页面 / 模块 / 组件时，不得从空白重画
- 页面 / 父容器上下文承接：模块状态默认必须放回真实页面或真实父容器中验证，不得只输出孤立卡片，除非用户明确要求只生成模块态
- 组件 / 实例 / variant 来源校验
- 内容边界布局策略
- 页面流和固定区判断
- Auto Layout 保真
- 语义 / 结构 / 视觉 / 来源四道 QA
- 截图验收

## 读取索引

规格驱动生成：

1. `references/spec-generation.md`
2. `references/figma-write.md`
3. 命中内容边界、页面流或结构变体时读 `references/layout.md`
4. 写入和交付前读 `references/qa.md`
5. 命中业务域时读 `references/domains/<domain>.md`

探索式推导：

1. `references/core.md`
2. 用户确认候选状态后读 `references/figma-write.md`
3. 命中内容边界、页面流或结构变体时读 `references/layout.md`
4. 写入和交付前读 `references/qa.md`
5. 命中业务域时读 `references/domains/<domain>.md`

写入 Figma 时：

- 使用 `manifests/tokens-mapping.json`
- 使用 `manifests/components-manifest.json`
- 使用 `manifests/icons-manifest.json`
- 运行 `scripts/validate_figma_brief.py`
- 运行 `scripts/compose_figma_section_code.py`

## 输出格式

探索式推导时：

- 对标能力：说明命中的对象层级和状态类别。
- 补全结果：说明已确认 / 已生成 / 仅进矩阵 / 不适用组合数量。
- 重点变化：最多列 5 条。
- 需要人工确认的问题：写入前集中询问；写入后不得新增会改变画稿范围的问题。

规格驱动生成时：

- 说明输入状态表、本次生成状态数、模板组数量和轻量复制数量。
- 说明已写入的 Section / 节点。
- 说明 QA 结论和必要的后续验收建议。

完整状态矩阵只作为内部推演和写入前确认材料，默认不写入 Figma 画布。
