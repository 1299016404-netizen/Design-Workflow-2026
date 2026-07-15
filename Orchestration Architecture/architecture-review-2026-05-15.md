---
title: Design Workflow 2026 架构审查与任务路线图
date: 2026-05-15
reviewer: Claude Opus 4.7
scope: 编排层 / 6 skill 骨架 / UXdesign-buff / HTML 输出 / 记忆层 / harness 级运行时
status: draft-for-discussion
---

# Design Workflow 2026 — 架构审查与任务路线图

> 这份文档不是结论，是**讨论起点**。每一节末尾会指向 `任务路线图`（第 8 节）里的具体任务，team 与 owner 按任务粒度逐个推进。讨论过程中的每次澄清、每次决策、每次方向调整，都按"任务编号 + 决议日期"追加到本文档末尾的 `决策日志`（第 9 节），不另建文件。

---

## 0. 审查上下文与约束

### 0.1 输入材料

- 项目根：`/Users/xutu/Desktop/Qoder项目/Design Workflow 2026/`
- 整体架构图：5 张单页规划（顶层架构、PRD to DRD、命名 skill、figma-executor-agent、design-state-completion）
- 关联 skill：
  - `/Users/xutu/Desktop/Qoder项目/UXdesign-buff/`（设计评审 skill，已有 0.7 版本，相对成熟）
  - `/Users/xutu/Desktop/Qoder项目/skill-inspector/`（skill 质量检查器，作为方法论参考）
- 历史规划：`/Users/xutu/Desktop/记忆与进化系统.rtfd/`（与 EverOS 文章对比的记忆系统设计稿）

### 0.2 已确认约束（2026-05-15 对齐）

| 项 | 决定 |
|---|---|
| 优先支持的运行时 | Codex + Claude Code（Qoder 的 Figma MCP 兼容问题暂不处理） |
| 操作系统 | 全员 macOS |
| gbrain | 管理者可强制要求安装，作为统一基础设施 |
| 优先级原则 | "稳定可用 > 功能丰富"，不做 toy-grade 设计 |
| 工作流 | 一个任务一个任务讨论，决策与修正全部记录 |

### 0.3 这份审查的输出形态

1. **本文档**：架构判断 + 痛点全景 + 任务路线图（一次性落盘）
2. **任务列表**：通过 TaskCreate 建立，可被持续追踪和重排
3. **决策日志**：每次任务讨论结束后追加到第 9 节，作为单一可信记忆

### 0.4 已知契约漂移（待对齐）

| 项 | 架构图（image #1） | 当前 codebase | 处理 |
|---|---|---|---|
| 环节 2 身份 | 命名 skill | `s2-ref-index`（参考画板索引） | 等团队 SKILL 仓库到位后对齐（T-EXT.1） |

**含义**：架构图把"命名 skill / 让设计组件变成 AI 可调用的组件系统"放在环节 2，但 `engine/state_machine.py` 的 `SKILL_IDS[2]` 是 `ref-index`。两者要么是一回事的不同名称，要么是 codebase 落后于团队规划。**此前所有"S2 = 参考画板索引"的论述（第 3.2 / 6.x 节）需在 T-EXT.1 决议后回查修订。**

### 0.5 任务暂停说明

下列 T3.x 任务等待 **T-EXT.1（团队 SKILL 仓库导入）** 解锁：
- T3.1（s1 边界 + prd-fetcher 抽离）
- T3.2（s2 拆分）
- T3.3（s3 任务路由 + 横切 skill）
- T3.4（s4 状态矩阵）
- T3.5（s5 桥接 UXdesign-buff）
- T3.6（s6 渲染管道）

理由：没有团队具体 SKILL 实现，pipeline 真实形状无法确定，讨论会变成纸上谈兵。其他 Phase（0/1/2/4/5/6/7/8/9/10）不受影响，可正常推进。

### 0.6 用户工作方法论补充（2026-05-15 用户深度交底）

下面 5 段是用户**亲自校准的核心方法论**，超越我之前从代码反推的认识。所有相关章节（特别是 §3.1 / §3.3 / §3.4 / §5）已据此修订。

#### 0.6.1 PRD-to-DRD 阶段：4 维质量审核框架

PRD 是跨职能协作的起点，但**起草过程受多方因素影响**——业务目标的演进、组织优先级的调整、资源与时间约束、起草者的视角与经验差异——这些都会让 PRD 在传到设计环节前积累 4 类典型偏移。S1 的职责不是"挑 PM 毛病"，而是**作为设计前置的质量门**，把这 4 类潜在偏移结构化呈现，让 PM、设计、相关方在进入执行前共同收敛。

##### 维度 1：业务目标对齐度与方案必要性

PRD 中各方案模块与开篇宣称的业务目标之间，对齐度可能存在松弛。常见表现：
- 部分需求与核心业务目标关联较弱，论证链路较短
- 方案整体规模与业务目标的预期产出不匹配（过度堆砌或保守不足）
- 受组织诉求、资源约束、阶段性优先级等因素影响，方案重心可能发生隐性偏移

**S1 的检测动作**：把方案逐条对照业务目标，标注关联强度，识别可能偏离主目标的部分，作为讨论起点——不替 PM 做删减判断，而是把判断决策权显式交回给业务方。

##### 维度 2：数据解读的深度与方案的因果关系

PRD 中的方案通常基于一段业务数据论证。同一份数据，不同的解读深度会得出不同的方案方向。常见风险：
- 仅基于表层指标做症状性方案，根因分析深度不足
- 对数据中潜在的分群差异、漏斗瓶颈、关联指标等未充分挖掘
- 以"数据论证"包装的结论与数据本身可支撑的结论之间存在落差

**S1 的检测动作**：用 AI 独立做一次数据解读（不看 PRD 论证），作为对 PRD 结论的**交叉验证**，把不同的洞察路径列出来。这不是替代 PM 的数据能力，而是为关键决策提供第二视角，避免单一解读路径锁死方案方向。

##### 维度 3：PRD 内部逻辑一致性

PRD 在起草过程中可能存在内部逻辑不一致，三种典型表现：
- **目标层级不清**：目标项过多、缺少明确的优先级取舍，导致后续方案打点分散、产品心智不聚焦
- **竞品借鉴的本地化不足**：参考竞品方案时未充分适配本产品的用户特征、业务环境、合规约束
- **跨章节的描述漂移**：因篇幅、多轮修订或异步协作导致同一功能在不同章节的描述存在出入

**S1 的检测动作**：做全文交叉对照，把不一致点结构化呈现，让 PM 与设计共同决定如何收敛，而非直接覆写。

##### 维度 4：设计可行性与体验底线预审

PRD 在描述需求时，可能因为对设计实现约束或用户体验最佳实践不熟悉，下达对设计执行困难、或对用户体验有明显风险的需求。例如：
- 在物理空间有限的组件位置要求承载大量信息（既未调整组件形态，也未压缩文案）
- 要求的交互密度或信息密度超出目标用户群体的认知负荷
- 文案策略与用户既有心智习惯存在较大距离

**S1 的检测动作**：基于 UX 方法论（与 UXdesign-buff 同源）对 PRD 中的设计相关需求做可行性预审，识别会在设计环节产生返工或体验问题的需求点，提前提示，并给出可行的替代方向。

##### 输出契约

S1 必须输出**两份产物**：
- **PRD v2**（清洗版 / 修订版）— 含审核标注、争议项、PM 与设计共同收敛后的最终版本，供上下游对齐与归档
- **设计需求.md**（干净版）— 不含审核痕迹，是给下游生成环节的纯粹设计输入

→ 修订 §3.1；新增 T2.6（PRD 4 维质量审核方法论 spec）

#### 0.6.2 生成环节的"无脑执行"原则

**生成环节都是不带脑子只干执行的**——所以 设计需求.md 的**准确性 + 正确性**就是整条链的核心。S1 的输出质量决定 S2/S3/S4 是否在做白工。这与 §1.3 风险地图相互印证：S3 是真创造性环节但只能在准确输入下创造，S1 是真审核环节决定输入是否准确。

#### 0.6.3 设计生成的硬解 vs 软解二元分类

- **硬解**：IDE + 设计 skill + 设计规范 → 直接生成 Figma 设计稿（pencil/googlestitch 路径）。上限高、覆盖广，但**不适用于成熟互联网产品**——这些工具针对 0→1，无历史包袱；而**大厂场景下"稳定能生成并可用"比"创造力"更需要**，且生成结果**往往很丑、缺美感、离设计师手作差距大**
- **软解**：image2 等图像生成先出方案图（顶级模型创造力）→ 转 Figma 图层 → 人微调。**结果显著优于硬解**（架构图 PPT slide 4 已验证）

**用户希望真实测试后做调研**：硬/软解各自是否有更好的方案。

→ 修订 §3.3；新增 T-RESEARCH.1（硬解/软解调研）

#### 0.6.4 全状态矩阵的协作语义

设计师做完一个模块后，要手动把所有相关状态出全才能交给开发。所以 S3 交付给 S4 的是**一个标准模块/单状态**，S4 自动扩展为全状态。在自动化前，S4 还要：
- 读项目历史
- 读 PRD
- 列举出需要哪些状态
- 让人选择/判断
- 才能生成

→ 修订 §3.4

#### 0.6.5 HTML 输出的辅助面板形态

S6 可以使用现成 skill 做基础能力，但需要**辅助面板**：
- **左侧**：页面导航（可切换不同页面）
- **右侧**：当前页面，可点击交互跳转
- **联动**：右侧跳转后，左侧导航自动跟随切换到新页

→ 修订 §5

---

## 1. 总判断

### 1.1 现状评分

| 维度 | 现状 | 评级 |
|---|---|---|
| 状态机骨架 | `engine/state_machine.py` 已实现 6 环节 + 反馈循环 + 否决权 + 人工挂起 | 强 |
| skill 装载机制 | 目录式 + frontmatter + 注册表 + index.md，工业化雏形 | 中 |
| skill 内容深度 | s1（146 行）成熟，s2-s6 都是骨架（66-71 行），与单页规划差距大 | 弱 |
| 规范层 | 单页规划反复提到"规范刚性约束"，但 `specs/` 目录不存在 | 缺 |
| 记忆层 | `engine/knowledge.py` 有抽象，但 `GbrainKnowledgeStore` 是 placeholder，`learned_namespace` 写入是隐式硬依赖 | 弱 |
| 横切 skill | `design-context-init` / `design-spec-check` 在规划但未建 | 缺 |
| UXdesign-buff | 方法论扎实、人机分账清晰、跨平台适配齐全 | 强 |
| harness 级特性 | 工具沙箱、流式、中断、幂等、预算、错误分类、telemetry 几乎全缺 | 弱 |

### 1.2 一句话定性

**骨架不是玩具，但远未成熟。**问题不在结构而在边界——规范没刚性、记忆有隐式硬依赖、6 个 skill 由不同水平的人开发缺乏统一约束、harness 级生产特性大面积缺失。

### 1.3 风险地图

```
最高风险:  s3 (设计生成)        — 真创造性环节，质量直接决定下游是否在做白工
次高风险:  记忆层 gbrain 硬依赖  — 团队部署直接卡在这
中等风险:  Spec 注入缺失         — 6 个不同水平的开发者会各自飘移
中等风险:  UXdesign-buff 无业务先验 — 用在飞猪场景会显得通用
中等风险:  s5 重复造轮子         — 不 delegate 给 UXdesign-buff 的话
低风险:    s6 (HTML 输出)        — 纯工具型，只要不塞 LLM 就稳
```

---

## 2. 编排层架构与职责边界

### 2.1 当前定位偏窄

`AGENTS.md` 把编排层定位成"装载 / 调度 / 观测 / 记忆"。够用，但漏了一层：**规范注入与契约校验**。这层散落在各 skill 自觉读 `design-spec`，没人验证 skill 真读了，也没人在产出物上做硬性 gate。

> 多人开发系统，规范不能靠 skill 自觉。

### 2.2 推荐分层

```
┌─ Runner Layer ─────────────────────────────┐
│ CLI / API / IDE 入口、会话管理、人机交互通道  │
├─ Orchestrator Layer ───────────────────────┤
│ • 状态机                  (已有)              │
│ • Skill Loader            (已有，需扩展)       │
│ • Spec Injector           (缺) ⭐             │
│ • Hard Gate Validator     (缺) ⭐             │
│ • Memory Runtime          (现塞在 knowledge.py，需独立) │
│ • LLM/Tool Adapter        (llm_client.py 在做)│
│ • Trace & Observability   (已有)              │
├─ Spec Layer (缺) ⭐ ────────────────────────┤
│ specs/                                      │
│ ├─ design-system/  颜色/字号/栅格/组件/命名 │
│ ├─ design-principles/ 三流/五维/JTBD        │
│ ├─ brand/  调性/文案/合规                   │
│ └─ state-library/ 状态分类法                │
├─ Skill Layer (已有 6 + 横切) ───────────────┤
│ 每个 skill 的"脑" + 自动化 + 自检            │
└─ Memory Layer (现硬绑 gbrain) ⭐ ───────────┘
```

### 2.3 编排层放什么 vs Skill 放什么 vs Spec 放什么

判断准则：**"如果换人重写编排层（甚至换语言），什么必须保留下来？"**
- 留下：流程逻辑、契约、校验机制、记忆 schema
- 不留：skill 内部的"脑"、规范本体、prompt 实质

| 类别 | 编排层 | Skill | Spec |
|---|---|---|---|
| 流程 | 状态机、反馈循环、否决权、回退 | skill 内部步骤 | — |
| 规范 | 加载机制 | 调用规范 | 规范本体 |
| prompt | system 头（角色 + 规范片段 + 记忆 brief） | skill 自己的"脑" | — |
| 数据 | 产物归置、trace、session id | 产物结构 | 状态分类、品牌口径 |
| 校验 | hard gate runner | 自检 checklist | 规则本体 |
| 记忆 | typed schema、读写运行时、合并策略 | 写哪些字段、读哪些 namespace | — |

### 2.4 必须新增的三个组件

#### 2.4.1 Spec Injector（规范刚性注入）

每个 skill 在 frontmatter 声明依赖：
```yaml
spec_dependencies:
  - design-system/colors.md
  - design-system/components.md
  - state-library/task-states.md
spec_inject_as: system_prefix   # system_prefix | tool_call_only | reference
```

编排层在调用 skill 前：
1. 读取声明的 spec 文件
2. 检查文件存在、版本号匹配
3. 拼装到 system message 头部，作为不可篡改段（用 `<system_constants>` 等标签包住）
4. 缺失或版本错位 → fail-fast，**不允许 skill 在缺规范时跑**

→ **任务**：T0.1 / T2.1 / T2.5

#### 2.4.2 Hard Gate Validator（产物硬性校验）

跑在 skill 输出之后、状态机推进之前：
```yaml
hard_gates:
  - id: color-token-only
    rule: "no #hex outside token registry"
    severity: P0
  - id: component-id-required
    rule: "every Figma instance node must reference component_id"
    severity: P0
soft_gates:
  - id: copy-tone-aligned
    rule: "matches brand voice profile"
    severity: P1
```

校验器是一组小脚本（参考 `UXdesign-buff/scripts/validate_review_contract.py`），编排层按 frontmatter 自动执行。P0 不通过 → 直接打回，不进 human 阶段。

→ **任务**：T2.5

#### 2.4.3 Skill Frontmatter 升级版

把 `_TEMPLATE/SKILL.md` 扩展为完整契约：
```yaml
---
id: design-gen
name: 设计生成 agent
step: 3
version: v2026-05-01

# 输入输出契约
input_contract:
  required: [design-req.md, references.json]
  schema: schemas/s3-input.json
output_contract:
  artifacts:
    - path: plan.json
      schema: schemas/s3-output.json

# 规范注入（编排层强制）
spec_dependencies:
  - design-system/colors.md
  - design-system/components.md

# 校验
hard_gates: [color-token-only, component-id-required]
soft_gates: [copy-tone-aligned]

# 工具/MCP 依赖
required_tools: [figma-mcp, image2-gen]
optional_tools: [competitor-screenshot]
fallback_when_missing:
  figma-mcp: degrade-to-spec-doc

# 记忆
memory_read:
  - namespace: design-workflow/design-gen/cases
    top_k: 3
    by: similar_intent
memory_write:
  - type: case
    when: on_complete

# 人机交互
requires_human: true
human_decisions:
  - id: style-choice
    type: choice
    options_from: auto_result.style_candidates

# 进化
self_evolution: true
evolution_strategy: case-clustering
---
```

→ **任务**：T0.3

---

## 3. 各 skill 方向评估

### 3.1 S1 `req-clarify` — 方向对，最成熟，**根据用户深度反馈大幅补强**

**对**：L1-L4 流水线和单页"PRD to DRD"5 步完全对齐。confidence 阈值 + 争议选择题机制是工业级做法。

**根据 §0.6.1 / §0.6.2 用户反馈，重新校准 S1 的根本职责**：

#### 3.1.1 S1 真正的核心职责

S1 不是简单的格式清洗，而是**设计环节的前置质量门**。下游生成环节是确定性执行，对输入的偏差不做二次判断；因此 S1 输出的准确性 = 整条链的天花板。S1 的价值在于把 PRD 在跨职能传递过程中可能积累的偏移（详见 §0.6.1 的 4 个维度）结构化呈现，让 PM、设计、相关方在进入执行前共同收敛。

#### 3.1.2 输出契约修正：双产物

| 产物 | 用途 | 受众 |
|---|---|---|
| **PRD v2**（清洗版/纯净版） | 上下游对齐、给 PM/PMO 看的"经过审核"版本 | 人（PM、stakeholder） |
| **设计需求.md**（干净版） | 喂给生成环节、状态扩展环节 | 下游 skill |

当前骨架只输出 设计需求.md，**遗漏了 PRD v2**。这是契约级缺陷——没有 PRD v2，PM 永远不知道哪些被改了、为什么被改、决策由谁做的。

#### 3.1.3 4 维 PRD 质量审核方法论（待编码为 spec）

详见 §0.6.1。每一维对应 S1 的一个独立检测层：

| 维度 | 检测层 | 当前骨架对应 | 状态 |
|---|---|---|---|
| 业务目标对齐度与方案必要性 | L1+L2（业务目的抽象 + 适配性检测） | ✅ 已有 | 需用方法论加深 |
| **数据解读的深度与方案的因果关系** | **L0（AI 独立数据解读，作为交叉验证）** | ❌ **缺** | **必须新增** |
| PRD 内部逻辑一致性 | L3（矛盾性检测） | ✅ 已有 | 需细分三亚型 |
| 设计可行性与体验底线 | L4（体验合理性） | ✅ 已有 | 需引入 UXdesign-buff 同源方法论 |

**最大缺口：L0「AI 独立做数据解读」是当前 S1 完全没有的步骤。**当前 L1 的"业务目的抽象"是从 PRD 自述里反推业务目的——这继承了 PRD 的解读路径，无法作为对 PRD 论证的独立验证。L0 应该独立做：
- 拿到原始业务数据（埋点指标、转化漏斗、分群表现等）
- **不看 PRD 论证**，先用 AI 自己做一次洞察
- 再对比 PRD 的论证 → 列出洞察分歧点（PRD 未提及的、解读不同的、可能弱化的）
- 形成**讨论清单**（不是"质疑清单"——表达上是中性的待确认项，由 PM 与设计共同收敛）

#### 3.1.4 其他保留问题

1. 单页规划里"全自动访问语雀、钉钉文档、设计稿链接"是重活，抽成 `prd-fetcher` 横切 skill
2. "VisionPass 已将图片转为文本"是前置假设，需定义降级路径
3. "争议选择题"的 schema 没定义；编排层需要统一的 `HumanDecisionRequest` schema

→ **任务**：T3.1（被 T-EXT.1 阻塞）/ **T2.6 PRD 4 类问题审核方法论 spec**（不阻塞，可立即做）

### 3.2 S2 `ref-index` — **拆分**为离线索引 + 在线检索

**问题**：单页规划提到全盘索引、Embedding、关联系数、搜索标注、渐进式遍历，但骨架未回答：
- 稿子池在哪？Figma 文件树 / 本地导出 / 自建库？
- Embedding 模型？本地 vs 云端？多人共享时索引同步策略？
- 索引刷新策略？

**改法**：
- 横切：`design-corpus-indexer`（离线/调度型 daemon），构建/刷新索引
- 环节：`ref-index`（s2，在线，纯检索 + 4 维标注）
- 解决冷启动：第一个项目无precedent时的兜底策略

→ **任务**：T3.2

### 3.3 S3 `design-gen` — **拆分 + 大幅补强**，**最高风险环节**

**对照单页规划差距巨大**。slide 4 显示：
- 解析需求 → 任务路由 (修改/新模块/新页面三分支)
- 各分支不同上下文读取
- 找参考图 → 生成方案 → 用户确认 → 准备素材 → 写入 Figma
- 5 条自检规则（硬性规则优先 / 机械验证优先 / 不做泛化像素验收 / 审美判断降级处理 / 标注风险）

骨架（66 行）只有非常模糊的"框架/排版/文案"。

#### 3.3.1 硬解 vs 软解 二元分类（用户原创框架，详见 §0.6.3）

| 路径 | 输入 | 输出 | 适用 | 当前评估 |
|---|---|---|---|---|
| **硬解** | 设计需求 + 设计规范 | 直接 Figma 设计稿 | 0→1 项目（pencil/googlestitch 类） | 大厂场景下"很丑、缺美感、离手作差距大" |
| **软解** | 设计需求 → image2 出图 → 转图层 | Figma 可编辑图层（人微调） | 大厂、有历史包袱、有规范继承 | **结果显著优于硬解** |

**关键判断**（用户校准）：
- 大厂场景下"**稳定能生成并可用**" > "**创造力**"
- 默认走软解，但要保留硬解作为 fallback 或特定场景使用
- "稳定 > 创造性"原则在两条路径上都不变——出图后必须经过设计规范校准 + 人工微调

#### 3.3.2 改法

1. 抽出横切 skill：`figma-mcp-adapter` / `image-gen-adapter` / `screenshot-fetcher`
2. s3 主体只负责：解析 → 路由（修改/新模块/新页面） → **选择硬解 or 软解路径** → 调度横切 skill → 自检
3. 5 条自检写进 `hard_gates`，不写进 prompt（prompt 只生产，校验交给确定性脚本）
4. 单页规划"对比基模/Step1-3"对应**golden test set**，每次 skill 改动跑回归

#### 3.3.3 待调研

用户希望真实测试后调研：硬解和软解各自的解决方案是否有更好办法。这是独立的**研究型任务**，不阻塞 S3 开发，但结果会反哺 S3 设计。

→ **任务**：T3.3（被 T-EXT.1 阻塞）/ **T-RESEARCH.1 硬解 vs 软解 调研**（不阻塞，可并行）

**这个 skill 是整条链上唯一的真创造性环节，也最容易飘。优先投入资源。**

### 3.4 S4 `state-complete` — 方向对，**补强 schema + 明确协作语义**

**对**：单页规划"单状态输入 → 状态矩阵输出"的核心洞察很好——强调**推演**而非**穷举**。

#### 3.4.1 真实协作语义（用户校准 §0.6.4）

设计师做完一个模块后要**手动**把所有相关状态出全才能交开发。S4 自动化的是这个手工苦力活。所以：
- **S3 → S4 的输入是一个标准模块/单状态**，不是完整设计
- S4 的工作分两阶段：
  1. **辅助列举阶段**：读项目历史 + PRD + 状态库 → 列出"此模块应该有哪些状态"
  2. **人工选择阶段**：让设计师选/判/补
  3. **自动生成阶段**：基于确认的状态清单，生成全状态矩阵

这意味着 S4 不是"自动跑完 → 人工 review"，而是"**辅助 → 人工选择 → 自动生成**"——三段式，中间的人参与是必要的，不是 escape hatch。

#### 3.4.2 schema 改法

- 状态库写进 `specs/state-library/`，分层定义：通用维度（数据/网络/权限...）+ 业务维度（任务类型/角色/会员等级...）
- s4 输出 `state-matrix.json` 是显式多维结构，不是平铺数组
- 每个 cell 必须带：Figma 节点引用、PRD 证据行、置信度、是否 designer 确认
- 给状态推演引擎一个明确算法：任务类型 → 适用维度 → 生成 cell 列表 → 比对设计稿 → 标缺失。**不能纯靠 LLM 想**。

→ **任务**：T3.4（被 T-EXT.1 阻塞）/ T2.3（不阻塞）

### 3.5 S5 `design-review` — 应该 **delegate 给 UXdesign-buff**

**当前骨架**直接重写了三流检查的简化版，而 UXdesign-buff 已经把同一件事做到 14 个方法论框架的深度。重复造轮子。

**改法**：
- s5 不实现三流，**调用 UXdesign-buff** 作为横切能力
- s5 真正职责：准备证据 → 调 UXdesign-buff → 把 review-state.json 翻译为反馈循环决策（P0 → 自动回退 s3/s4 / P1+ → 选择题 / pass → 进 s6）
- UXdesign-buff 升级，s5 自动受益

→ **任务**：T3.5

### 3.6 S6 `html-export` — 方向对，先回答 5 个隐藏问题（见第 5 节）

骨架最干净（纯工具型，无创造性）——但有几个隐藏假设要验证。详见 §5。

→ **任务**：T3.6

---

## 4. UXdesign-buff 深度审查

不走 skill-inspector 的格式化路径，直接讲**有效性问题**。skill 已经很好——下面是它作为团队级生产力工具还可以更狠的地方。

### 4.1 静态方法论 vs 业务先验的鸿沟（最大问题）

14 套方法论是普世的。放进飞猪酒店场景时会显得通用——它不知道"88VIP 权益条文不能改"、"权益领取前要先开卡"、"会员等级有金白银三档"这些行业先验。

**改法**：增加 `business_context_pack` 注入机制
```yaml
# 项目根 .UXdesign-buff/context-pack.yml
domain: hotel-booking
critical_constraints:
  - 88VIP 权益不可篡改文案
  - 海外酒店价格要标外加显式
known_anti_patterns:
  - 立省金额未加显式锚点
  - 会员卡升级流程跳出主链
```
评审时这些先验和方法论同等优先级使用。

→ **任务**：T4.1

### 4.2 严重度没有场景校准

`critical/high/medium/low` 是绝对刻度。"CTA 按钮不够突出"在转化首页是 critical，在三级帮助页是 low。

**改法**：severity × `flow_stage_weight`：
- 主转化路径 × 1.5
- 信息展示 × 0.5
- 已注册老用户 × 0.7

权重表来自项目的 context-pack。

→ **任务**：T4.2

### 4.3 证据优先是宣称的，没强制

playbook 写了 PRD > Figma > 截图 > 推断的优先级，但**运行时没办法验**。模型很容易说"PRD 显示..."而其实是从截图推的。

**改法**：每条 issue 的 `evidence_ids` 必须能验证回到具体 source（PRD line range、Figma node id、screenshot region）。`scripts/validate_review_contract.py` 加 evidence-traceability gate。

→ **任务**：T4.3

### 4.4 三流检查是 checklist，不是图

旅程流的"断点检测"应该是图论问题：节点（步骤）+ 边（转换）→ 找缺边、找环、找死锁。当前实现是对每步过 checklist，会漏跨步骤断裂。

**改法**：在 `review-state.json` 里产出显式 `task_chain_graph: { nodes, edges, gaps }`。三流检查跑在图上，而不是节点序列上。

→ **任务**：T4.4

### 4.5 设计师反驳路径缺失

UXdesign-buff 出了报告就完事——设计师如果不同意，反驳没地方去。下游 s5 有 skip_review，但 buff 内部学不到这个反驳。

**改法**：每条 issue 增加 `designer_response: { stance, reason, accepted_at }`。**反驳是最高价值训练信号**。

→ **任务**：T4.5

### 4.6 完全无记忆

每次评审都从零开始。理想情况：
- 同一个 flow 第二次评审，自动 diff（上次的 issue 哪些解决了、哪些复现了）
- 跨项目：如果"信任递进-第三步缺信任锚点"在飞猪 5 个流里都出现，应升级为**项目级已知弱点**

**改法**：增加 `memory_namespace: ux-review/<project>`。直接接到第 6 节的记忆架构。

→ **任务**：T4.6

### 4.7 方法论栈是封闭的

14 个框架硬编码。新方法论（BJ Fogg 行为设计、Cialdini 说服心理学、Service blueprint backstage、Dark Pattern detection）加不进来。

**改法**：`references/methodologies/` 改成插件目录，每个方法论一个 md，主 playbook 用 manifest 引用。

→ **任务**：T4.7

### 4.8 三流检查需要任务链作为前提

文档说"至少选一条关键任务链"——但任务链从哪来？如果设计师没给，谁定？

**改法**：增加**任务链推断步骤**：buff 看完所有 frame 后，先推一条 task chain 草案问设计师确认，再开始三流检查。

→ **任务**：T4.8

### 4.9 视觉感知断言无证据

"字号太小，老人看不清"——多小？没量。"对比度不够"——具体多少？没算。

**改法**：硬规则——所有视觉度量类 issue 必须带可验证数值（px、WCAG 比值）。`get_metadata` 取得到的强制取，取不到的下调置信度到 inferred。

→ **任务**：T4.9

### 4.10 缺独立 A11y track

"包容性设计"散在五维里，没有专门可访问性轨道。WCAG 2.2 AA 应该是独立硬轨道。

**改法**：增加 `references/a11y-checklist.md` + `scripts/wcag_check.py`（contrast、target size、focus order）。

→ **任务**：T4.10

### 4.11 报告渲染管道刚性双刃

强制固定 shell 防漂移很对，但也阻止了垂直定制。

**改法**：shell 锁死，但允许 `addendum_slots` 注入领域特定章节（飞猪场景下加"会员权益专项检查"）。

→ **任务**：T4.11

### 4.12 单次评审成本过高

5 维 × 3 流 × N issue × per-issue 方法论追溯 + HTML 渲染 = 单次轻松 50K+ token。日常自查太重。

**改法**：增加 `quick-pass` 模式——只跑三流 + critical issue，省 70% token，5 分钟出结果。

→ **任务**：T4.12

### 4.13 用 Opus 4.7 进一步提升

- **extended thinking** 用在背景重建 + 根因追问两步——这是最值得"想久一点"的两环
- **parallel tool use** 用在 Figma MCP 多节点并发读
- **prompt caching** 缓存 methodology checklist + business context pack
- **structured outputs** 强制 review-state.json 的 schema，模型直接产出已验证的结构

→ **任务**：T4.13

---

## 5. HTML 输出环节（s6）规划

骨架对的（纯工具型 skill，无 LLM 创造），但有几个隐藏决定要先定。

### 5.0 用户校准的辅助面板形态（§0.6.5）

**S6 可用现成 skill 做基础渲染**，但需要一个**辅助面板**：

```
┌─────────────┬───────────────────────────┐
│             │                           │
│  左侧导航    │      右侧主视图            │
│  (页面列表)  │   (当前页面，可点击交互)   │
│             │                           │
│  • 首页      │   ┌────────────────┐     │
│  • 列表页 ✓  │   │  当前显示页面     │     │
│  • 详情页    │   │                │     │
│  • 支付页    │   │  [按钮] [链接]   │     │
│  • 完成页    │   │                │     │
│             │   └────────────────┘     │
│             │                           │
└─────────────┴───────────────────────────┘
       │            │
       └─联动────────┘
   右侧跳转后，左侧导航
   自动 highlight 到新页
```

**核心交互**：
- 左侧点击 → 右侧切换页面
- 右侧热点点击跳转 → 左侧 highlight 自动跟随
- 左右始终同步，单一真源（current_screen_id）

### 5.1 必须先回答的 5 个问题

| 决定项 | 推荐 | 原因 |
|---|---|---|
| **输出形态** | 单文件 HTML 默认，多文件包可选 | 钉钉/邮件分享是核心场景 |
| **交互模型** | 状态切换 + 热点跳转 + variant 切换；表单不模拟 | 真表单要后端 |
| **渲染源** | Figma frame 导出 PNG/SVG（不重新还原 DOM） | 还原 DOM 是 v3+ 才该想 |
| **跳转图谱来源** | s1 设计需求里的"用户路径" + s5 的 task_chain_graph | 单一来源 |
| **状态切换控件** | 来自 s4 的 state-matrix.json | 直接消费上游 |

### 5.2 推荐架构（v1 落地最简版）

```
prototype.html (单文件)
├─ <header> 项目元信息 + session id + 版本
├─ <nav>
│   ├─ 屏幕列表 (从 s3 plan.json)
│   ├─ 状态过滤器 (从 s4 state-matrix.json)
│   └─ 设备 frame 切换
├─ <main>
│   ├─ <img src="data:image/png;base64,..."> Figma 导出
│   ├─ <svg overlay> 热点 (从 Figma rect 坐标)
│   └─ 跳转触发 → 切换下一屏
└─ <aside> 证据面板
    ├─ 当前屏对应 PRD 段落
    ├─ s5 评审结论 (resolved + open issues)
    └─ Figma 节点 ID
```

### 5.3 技术栈

**Vanilla JS + 极简 CSS**，不引入框架。理由：
- 内联体积小
- 长期维护成本低（团队不需要懂 React 也能改）
- 离线打开零依赖

### 5.4 渲染管道（确定性，无 LLM）

```
plan.json + state-matrix.json + review-state.json
   ↓
1. fetch_figma_exports.py     # 批量导出 PNG@2x
2. extract_hotspots.py        # 从 Figma metadata 算热点坐标
3. build_routing.py           # 从 task_chain_graph 算跳转
4. assemble.py                # 模板填充
5. inline_assets.py           # base64 内联
6. validate.py                # 校验单文件可独立打开
```

每步是脚本，s6 的 SKILL.md 只组织调度。LLM 唯一可介入的是"屏幕标题/状态文案的人话化"，且必须可关闭。

### 5.5 分阶段交付

| 阶段 | 能力 | 优先级 |
|---|---|---|
| v1 | 静态屏幕 + 状态下拉 + 线性导航 | P0 |
| v2 | 像素级热点跳转 + 跳转栈 | P1 |
| v3 | variant 切换 + 简单表单状态模拟 | P2 |
| v4 | 评审 issue 内联展示 + 反馈收集 | P2 |

### 5.6 容易踩的坑

- **不要** 用 puppeteer 渲染 Figma → DOM 重写。永远走 Figma 官方 export API
- **不要** 在 s6 里塞 LLM。一旦塞了，"评审通过的方案 + s6 的 LLM 漂移" 会让最终交付物和评审对象不一致
- **必须** 给每屏带 `data-source-frame-id` 属性，反向追踪到 Figma
- **建议** 加"评审视图模式"：开关后，HTML 上叠加 s5 报告里的 issue 标记

→ **任务**：T3.6

---

## 6. 记忆与进化层架构

### 6.1 当前最大问题：gbrain 是隐式硬依赖

`engine/knowledge.py` 里 `GbrainKnowledgeStore` 是 placeholder，但 `learned_namespace` 写入路径都假设 gbrain 存在。**别人机器没 gbrain → skill 写记忆静默失败**。

> 即使你能用行政力强制装 gbrain，依赖图也应该是显式的：失败要 fail-fast 不是 silent skip。

### 6.2 三层记忆架构

```
Layer 1 — Memory Store (后端可插拔)
  ├─ LocalSqliteStore (默认，零配置)
  ├─ LocalVectorStore (本地 hnswlib，零依赖)
  ├─ GbrainStore (统一基础设施)
  ├─ RemoteHttpStore (团队共享后端)
  └─ FileStore (markdown + frontmatter，git 友好)

Layer 2 — Memory Runtime (在编排层)
  ├─ Pre-skill   : 意图分类 → 多路检索 → Memory Brief 注入
  ├─ In-skill    : 决策/事实/foresight/证据 → scratchpad
  └─ Post-skill  : 自动分段 → typed write → 去重 → link

Layer 3 — Maintainer (后台或会话末)
  ├─ 语义巩固 (semantic consolidation)
  ├─ 冲突解决 (supersedes 链)
  ├─ Case 聚类 → Skill 蒸馏
  └─ Profile 进化
```

### 6.3 Typed Memory Schema（必须做）

放弃当前 `KnowledgeEntry.category = decision/artifact/experience/evolution` 的扁平分类，改为：

| type | 用途 | 例子 |
|---|---|---|
| `profile` | 项目/团队/用户的稳定画像 | 飞猪酒店设计偏好"克制商业感" |
| `fact` | 可独立复用的关键事实 | "88VIP 权益条文不可改文案" |
| `episode` | 一段任务/对话的浓缩剧情 | "本次需求清洗：3 个争议、2 个被剔除" |
| `event` | 带时间戳的事件 | "2026-05-15 designer 拒绝了 P1 评审建议" |
| `foresight` | 未来要做的事 | "下次状态补全要覆盖海外信用卡场景" |
| `case` | 一次完整任务记录 | s3 一次完整生成（输入/步骤/产出/质量分） |
| `skill` | 多次 case 蒸馏出的复用打法 | "酒店卡片改版优先复用 LIST.HOTEL_CARD 变体" |
| `source` | 原始证据 | PRD 链接、Figma 节点 |

每条记忆 frontmatter：
```yaml
type: case
domain: design-workflow/design-gen
project: fliggy-hotel
team: design
entities: [88vip, member-benefit, hotel-card]
status: active
confidence: 0.86
valid_from: 2026-05-15
valid_until: null
supersedes: []
quality_score: 0.8
session_id: <session-id>
```

### 6.4 冲突解决规则

1. 同 `(type, entities)` + 重叠有效期 → 新的胜，旧的标 `superseded_by`
2. `profile` 用字段合并而非替换
3. `confidence < 0.3` 不能覆盖 `confidence > 0.7`，除非显式 override
4. 等置信度时按 timestamp 决定

### 6.5 Case → Skill 蒸馏循环

```
每次 skill 执行结束 → 写一条 Case
  inputs / steps / outputs / outcome / quality_score

Maintainer 周期跑：
  for skill_id in skills:
    cases = get_cases(skill_id, last_30d)
    if len(cases) >= 5:
      clusters = cluster(cases, by=intent_similarity)
      for cluster in clusters:
        if cluster.cohesion > 0.7:
          proposal = distill_skill_patch(cluster)
          write to skills/<id>/proposals/{date}.md

Skill 升级流程：
  - Maintainer 写 proposal（不直接改 SKILL.md）
  - Owner code review → accept → 合入 SKILL.md + 版本 +1
  - Reject → 标记为 designer-disagreed，进负样本
```

**Maintainer 不能直接改 SKILL.md，必须走 PR 形式给人看。**

### 6.6 部署模式

```
~/.design-workflow/         (默认本地存储位置)
├─ memory.db                (SQLite)
├─ vectors/                 (hnswlib index)
├─ pages/                   (markdown 形式的 typed memory)
└─ config.yml

team-share/  (可选)
├─ pull/push 通过 git/s3/http
└─ scope: 团队共享 vs 个人私有
```

三种模式：
1. **Solo**（默认）：纯本地，零配置
2. **Team-shared**：通过 `--team-namespace` 共享，后端可选 git 仓库 / 共享 SQL / S3
3. **Hybrid**：读团队记忆，写本地

### 6.7 冷启动（新人入职 day 0 就有用）

随项目分发 `specs/memory-starter/`：
- 已策展的 profile（飞猪酒店设计偏好、品牌口径）
- 已蒸馏的 skill 案例（"酒店卡片改版的 5 步打法"）
- 已积累的 fact 库

`setup_check.py` 加一步：首次运行时把 starter pack 导入本地 store。

**这是新人和老人差距收敛最快的机制——不靠口口相传。**

### 6.8 与现有代码的关系

不要从头重写：
1. `engine/knowledge.py` → `orchestrator/memory/legacy/` 保留兼容
2. 新建 `orchestrator/memory/`：
   - `schema.py` (typed records)
   - `stores/` (sqlite / vector / file / gbrain / remote)
   - `runtime.py` (pre/in/post skill hooks)
   - `maintainer.py` (consolidation + case→skill)
3. 现有 `KnowledgeEntry` 通过 adapter 映射到新 typed schema

→ **任务**：T1.1 ~ T1.6

---

## 7. Harness 级运行时痛点全景

> 用户要求："参考先进的 harness 架构"。Claude Code、Cursor 这些成熟 harness 都解决了下面这些问题。我们目前几乎全缺。

### 7.1 工具与权限

| # | 痛点 | 现状 | 影响 |
|---|---|---|---|
| H1 | 工具权限/沙箱机制 | skill 没声明能用什么工具 | 多人开发时 skill 行为不可预测 |
| H2 | MCP 失败降级 | s3 用 figma-mcp，挂了怎么办？ | 整个 session 阻塞 |
| H3 | secret 管理 | Figma token / LLM key 散在 .env | 团队分发时易泄漏 |

→ **任务**：T5.1 / T5.4 / T9.1

### 7.2 流程控制

| # | 痛点 | 现状 |
|---|---|---|
| H4 | 流式/进度 | skill 跑 10 分钟，无进度提示 |
| H5 | 中断/取消 | 启动后无法 clean stop |
| H6 | 幂等性 | 同输入两次跑可能不同输出，无 cache key |
| H7 | 重试/退避 | 失败直接抛异常 |
| H8 | 成本/Token 预算 | 无 per-skill / per-session 预算 |
| H9 | 错误分类 | 全是 `Exception`，下游无法分别处理 |

→ **任务**：T5.2 / T5.3 / T5.4 / T5.5 / T5.6

### 7.3 版本与契约

| # | 痛点 | 现状 |
|---|---|---|
| H10 | skill 版本兼容 | s1 v2 输出，s2 v1 能消费吗？ |
| H11 | I/O schema 化 | 隐式约定，运行时不验 |
| H12 | spec 版本治理 | colors.md 改了，活动 session 不知道 |

→ **任务**：T5.7 / T6.1 / T7.1

### 7.4 数据生命周期

| # | 痛点 | 现状 |
|---|---|---|
| H13 | artifact GC | `data/artifacts/` 无界增长 |
| H14 | session 中断恢复 | 状态机有挂起，但完整 resume 跑通了吗？ |
| H15 | 多 session 并发 | 同设计师同时跑 3 个 session，隔离吗？ |
| H16 | 跨 session 引用 | s5 of session A 引用 s3 of session B 的 variant？ |
| H17 | 数据保留策略 | PRD/artifact 留多久？ |

→ **任务**：T6.2 / T6.3 / T6.4 / T9.3

### 7.5 人机交互

| # | 痛点 | 现状 |
|---|---|---|
| H18 | 决策 UI 通用 | `decision_options` 只是字符串列表，无视觉对比 |
| H19 | 异步决策 | designer 下班，第二天能继续吗？ |
| H20 | 多人 review | 需要 2 个设计师都批准的流程？ |
| H21 | 通知/感知 | 需要人介入时怎么告知 designer？ |

→ **任务**：T7.x

### 7.6 可观测与可解释

| # | 痛点 | 现状 |
|---|---|---|
| H22 | "为什么这么生成"解释 | designer 问起来，无 causal chain |
| H23 | 决策审计 | 每次选择的 evidence 链未持久化 |
| H24 | 团队 telemetry | trace.jsonl 本地，无聚合 |
| H25 | 健康检查 | LLM 通吗？GBrain 通吗？MCP 通吗？ |
| H26 | 质量 dashboard | 自动通过率、人工 override 率、per-skill 时长 |

→ **任务**：T7.5 / T7.6 / T8.x

### 7.7 测试与评估

| # | 痛点 | 现状 |
|---|---|---|
| H27 | golden test suite | 改 skill 后没东西跑回归 |
| H28 | 回归检测 | skill 变更不该恶化已有 case |
| H29 | A/B eval | 怎么知道 skill 改动确实更好？ |
| H30 | inter-rater | 多 designer review 同一设计的一致性 |
| H31 | 合成 eval | UXdesign-buff 评同一设计两次，结论稳定吗？ |

→ **任务**：T8.1 / T8.2 / T8.3

### 7.8 协作与部署

| # | 痛点 | 现状 |
|---|---|---|
| H32 | spec 版本 | 改了 colors.md 谁通知？ |
| H33 | skill 更新分发 | SKILL.md 改了，团队怎么 pull？ |
| H34 | 并发修改 | 两个 dev 同时改 s3 怎么 merge？ |
| H35 | 设计 ownership | session 输出归谁？审计？ |
| H36 | 环境 bootstrap | `setup_check.py` 覆盖 mcp/keys/specs/memory 全部吗？ |
| H37 | 升级路径 | v2026-05 → v2026-06，什么迁移？ |

→ **任务**：T7.x

### 7.9 安全合规

| # | 痛点 | 现状 |
|---|---|---|
| H38 | 敏感数据脱敏 | PRD 含机密数字，写记忆前是否脱敏？ |
| H39 | 审计 immutable | trace 文件可被改，无 hash chain |
| H40 | GDPR-like 删除 | 怎么从记忆里删除特定项目？ |

→ **任务**：T9.x

### 7.10 知识传递

| # | 痛点 | 现状 |
|---|---|---|
| H41 | onboarding 文档 | 新人加入读哪些文档什么顺序？ |
| H42 | skill author 指南 | 怎么写一个新 skill？ |
| H43 | 失败模式手册 | 已知失败和恢复路径？ |
| H44 | ADR | 为什么 X 这么设计？ |

→ **任务**：T10.x

### 7.11 进化机制本身

| # | 痛点 | 现状 |
|---|---|---|
| H45 | 进化提案审核 | maintainer 写的 SKILL.md patch 谁审？ |
| H46 | 进化回滚 | 应用了 patch 后效果变差，怎么回滚？ |
| H47 | 反馈循环饱和 | designer 对 1000 条 issue 都点了 reject，怎么处理？ |

→ **任务**：T1.4 / T1.6

### 7.12 持续同步：规范、Figma、业务语境（新增 2026-05-15）

| # | 痛点 | 现状 |
|---|---|---|
| H48 | 设计规范漂移检测 | 设计师在 Figma 里加了组件 / 改了 variant / 修了 annotation，specs/ 不知道 |
| H49 | 业务语境更新 | 字段什么状态展示什么、什么角色看到什么——这些规则会随业务迭代变化 |
| H50 | 规范文档版本同步 | colors.md / components.md 的源头（语雀文档 / Figma 内嵌规范页）改了，本仓库的副本不会自动跟随 |

#### 7.12.1 为什么要做

设计规范不是一次性写完就锁死的。真实场景里：
- 设计师每周可能新增 2-5 个组件（随业务上线节奏）
- 现有组件会被加 variant（新场景出现）
- annotation 文本会更新（规则解释更精确）
- 字段展示条件随产品策略动态调整

如果 specs/ 不能自动跟上，**规范注入就在传播过期约束**——所有下游 skill 拿到的是错的"刚性规则"，比没规范还糟。

#### 7.12.2 推荐机制

```
定时同步 Daemon (默认每周一次，可调到每日)
   ↓
1. Figma 全树扫描
   - 列出所有 published components
   - 对比上次扫描快照 → diff（新增/修改/删除）
   - 提取每个组件的 annotation / description
   - 提取 variant 列表与 variant_id 的语义
   
2. 设计规范源扫描
   - 语雀文档（已订阅的页面 ID）
   - Figma 内嵌规范页（如果有）
   - git 仓库（如果规范分散在其他 repo）
   - diff 出新增章节 / 改动段落
   
3. 业务语境提取（可选，依赖结构化标注）
   - 从 component_id 命名规范里反向解析（如 LIST.HOTEL_CARD.MEMBER_BENEFIT_BADGE # ACTIVATED）
   - 标记每个 variant 适用的业务状态
   
4. 生成提议（不自动应用）
   - 写到 specs/_proposals/<date>/{component-update.md, spec-update.md, ...}
   - 含 diff、来源、影响范围、建议改动
   
5. 团队 review
   - PR 形式或编排层 CLI 命令呈现
   - 接受 → 写回 specs/，bump version
   - 拒绝 → 标记 explicit-ignore，下次 diff 时跳过
   - 推迟 → 留在 _proposals/ 等下次再看
   
6. 通知活动 session
   - 任何接受的 spec 变更 → 通知正在跑的 session（"你正在用 v2.3 的 colors.md，已发布 v2.4"）
   - session 选择继续用旧版本（保证幂等）或重启
```

#### 7.12.3 与其他系统的关系

| 关系 | 说明 |
|---|---|
| 与 Memory Maintainer | 可共用一个 daemon 进程；同步任务跑完后顺便触发 case 聚类，节省调度开销 |
| 与 Spec Injector | spec 版本 bump 后，Spec Injector 在新 session 里自动注入新版；老 session 默认锁版本 |
| 与 case→skill 蒸馏 | spec 大改可能让某些已蒸馏的 skill 提议过期，要重新评估 |
| 与 hard_gates | spec 改动可能让 gate 规则过时（如颜色 token 表更新）；同步时联动检查 |

#### 7.12.4 关键决策点（讨论时需明确）

1. **触发节奏**：每周（轻量）、每日（中等）、按需手动（最简）
2. **扫描范围**：全 Figma 文件 vs 仅"设计规范库"指定文件
3. **接受策略**：人工审 vs 简单变更自动接受 vs 双轨制
4. **冲突处理**：人手改了 specs/ 同时又来了 Figma 自动提议，怎么 merge
5. **session 隔离**：活动 session 是否锁版本，何时通知，何时强制升级

→ **任务**：T7.8

---

## 8. 任务路线图

下面 10 个 Phase。**任务编号 T<phase>.<seq>，按 Phase 排序**。每个任务一次讨论；阻塞依赖在 `blocks/blockedBy` 标记。

### Phase 0 — 地基对齐（先做这个，否则后面都飘）

- **T0.1** 编排层职责边界确认（Spec Injector + Hard Gate Validator 引入决议）
- **T0.2** 目录重组方案确认（specs/ 引入、engine→orchestrator 重命名）
- **T0.3** SKILL.md frontmatter 升级版定稿

### Phase 1 — 记忆层（解 gbrain 硬依赖 + typed schema）

- **T1.1** Typed memory schema 定义（8 种类型 + frontmatter）
- **T1.2** Pluggable store 架构（默认 sqlite/vector + gbrain adapter）
- **T1.3** Pre/In/Post skill memory runtime
- **T1.4** Maintainer 设计（语义巩固 + 冲突解决 + case→skill）
- **T1.5** Starter pack 机制
- **T1.6** 与现有 `engine/knowledge.py` / `engine/evolution.py` 的迁移路径

### Phase 2 — 规范层（让规范变成刚性约束）

- **T2.1** specs/ 目录结构与最小 schema
- **T2.2** design-system 内容初始化（从飞猪现有规范导入）
- **T2.3** state-library taxonomy 定义
- **T2.4** business context-pack 机制
- **T2.5** hard_gates 校验器框架（含校验脚本约定）
- **T2.6** PRD 4 类问题审核方法论 spec（用户原创框架编码，被 S1 强制注入；新增 2026-05-15）
- **T2.7** 数据洞察方法论 spec（L0「AI 重新解读业务数据」步骤的指引；新增 2026-05-15）

### Phase 3 — Skills 重构

- **T3.1** s1 边界澄清 + 抽出 prd-fetcher 横切 skill
- **T3.2** s2 拆分为 corpus-indexer + retriever
- **T3.3** s3 任务路由 + 横切 skill 抽离 + 自检规则硬化（最高优先）
- **T3.4** s4 状态矩阵 schema + 推演算法
- **T3.5** s5 改为 delegate UXdesign-buff 的桥接逻辑
- **T3.6** s6 渲染管道（无 LLM）

### Phase 4 — UXdesign-buff 升级

- **T4.1** business context pack 注入
- **T4.2** severity 场景校准
- **T4.3** 证据可追溯性硬化
- **T4.4** 三流图谱化（task chain graph）
- **T4.5** designer response 反驳通道
- **T4.6** 跨评审记忆 namespace
- **T4.7** 方法论插件化
- **T4.8** 任务链推断步骤
- **T4.9** 视觉度量证据强制
- **T4.10** a11y 独立轨道
- **T4.11** addendum_slots 领域定制
- **T4.12** quick-pass 模式
- **T4.13** Opus 4.7 能力对齐（extended thinking、parallel tools、prompt caching）

### Phase 5 — Harness 级运行时

- **T5.1** 工具权限/沙箱机制（H1）
- **T5.2** 流式/进度/中断/取消（H4 H5）
- **T5.3** 幂等性与缓存键（H6）
- **T5.4** 重试/退避/降级（H2 H7）
- **T5.5** 成本/Token 预算（H8）
- **T5.6** 错误分类与恢复（H9）
- **T5.7** skill 版本兼容（H10）

### Phase 6 — 数据流契约

- **T6.1** I/O JSON schema 化（H11）
- **T6.2** artifact GC（H13）
- **T6.3** session 中断恢复（H14）
- **T6.4** 多 session 并发隔离（H15 H16）

### Phase 7 — 协作 / 部署 / 运维

- **T7.1** spec 版本治理（H12 H32）
- **T7.2** skill 更新分发机制（H33 H34）
- **T7.3** 环境引导扩展（H36，覆盖 mcp/keys/specs/memory）
- **T7.4** 升级与迁移路径（H37）
- **T7.5** 团队级 dashboard（H24 H26）
- **T7.6** 健康检查（H25）
- **T7.7** 决策 UI 通用化 + 异步决策 + 通知（H18 H19 H20 H21）
- **T7.8** 定时同步：设计规范 + Figma 模块标注 + 业务语境（H48 H49 H50，新增 2026-05-15）

### Phase 8 — 测试 / 评估

- **T8.1** golden test suite（H27）
- **T8.2** 回归检测（H28）
- **T8.3** A/B 评估框架（H29）
- **T8.4** skill-inspector 接入（持续质量审查）

### Phase 9 — 安全 / 合规

- **T9.1** secret 管理（H3）
- **T9.2** 敏感数据脱敏（H38）
- **T9.3** 审计 immutable + 数据保留策略（H39 H17 H40）

### Phase 10 — 文档 / 团队知识

- **T10.1** onboarding 文档（H41）
- **T10.2** skill 作者指南（H42）
- **T10.3** 失败模式手册（H43）
- **T10.4** ADR 机制（H44）

### 外部依赖

- **T-EXT.1** 团队 SKILL 仓库导入与对齐（阻塞所有 T3.x；含契约漂移修复）

### Phase CVR — 约束校验恢复（编排层串联时落地，新增 2026-05-15）

> 详细方案见 `docs/design-cvr-constraint-validation-recovery.md`

- **T-CVR.1** 错误分类模型 + 重试策略（`engine/resilience.py`）
- **T-CVR.2** Step Checkpoint 机制（`engine/checkpoint.py` + ORM 扩展）
- **T-CVR.3** Hard Gate Validator 框架（`engine/gate_validator.py`）
- **T-CVR.4** Scheduler 主循环改造：接入重试 + gate + 异常捕获（blocked by T-CVR.1, T-CVR.3）
- **T-CVR.5** 状态机扩展：mark_failed + retry_from_failed（blocked by T-CVR.1）
- **T-CVR.6** Crash Recovery：启动时扫描中断 workflow 并恢复（blocked by T-CVR.2, T-CVR.5）
- **T-CVR.7** SKILL.md frontmatter 扩展 `hard_gates` / `fallback_when_missing` 字段（blocked by T-CVR.3）

**实施时机**：等 T-EXT.1 解锁、skill 齐备、编排层开始串联时一并落地。MVP = T-CVR.1~4。

### 调研型任务（不阻塞主链，可并行）

- **T-RESEARCH.1** 硬解 vs 软解 设计生成方案调研（用户明确要求；产出影响 T3.3；新增 2026-05-15）

---

## 9. 决策日志

> 每个任务讨论结束后，按下面格式追加：

```
### [T<编号>] <主题> — <决议日期>
- 背景: 一句话
- 决议: ...
- 关键 trade-off: ...
- 影响范围: 影响哪些任务/文件
- 后续动作: ...
- 修订: 本文档第 X 节相应章节修订点
```

---

### [T-CVR] 约束校验恢复架构方案 — 2026-05-15

- **背景**：用户写分享稿时反思，发现当前编排层缺少失败恢复、产出物校验、重试降级能力
- **决议**：新增 Phase CVR（7 个任务），在编排层增加 resilience + checkpoint + gate_validator 三个组件，改造 scheduler 主循环
- **关键 trade-off**：
  - Gate P0 失败不自动 rollback，转人工决策（选回退 or 重跑）——因为失败原因可能在当前步也可能在上游
  - Checkpoint 不建新表，复用 StepExecutionORM JSON 字段——避免 schema 膨胀
  - 降级路径声明式写在 SKILL.md frontmatter——编排层按声明执行不硬编码
- **影响范围**：scheduler.py / state_machine.py / models.py / agent_runtime.py + 3 个新文件
- **后续动作**：等 skill 齐备（T-EXT.1 解锁后）与编排层串联时一并实施，MVP = T-CVR.1~4
- **修订**：§8 任务路线图新增 Phase CVR；方案详见 `docs/design-cvr-constraint-validation-recovery.md`

---

### [SESSION] 会话命名与 checkpoint — 2026-05-15

- **背景**：用户暂时离开，担心下次 session 上下文丢失
- **决议**：本会话命名 **"designworkflow"**，作为 Claude Code 跨 session 召回关键词
- **保存位置**：
  - 主入口：`~/.claude/projects/-Users-xutu/memory/session_designworkflow_state.md`（含 RESUME PROTOCOL + 任务清单快照 + 起手建议 + open questions）
  - 协作模式：`~/.claude/projects/-Users-xutu/memory/feedback_designworkflow_communication.md`（9 条本项目专属规则）
  - MEMORY.md 索引置顶
  - 关联记忆：项目记忆 / 用户角色 / PRD 4 维方法论 / 硬软解分类，全部交叉链接
- **召回方式**：用户下次说 "designworkflow" / "继续 designworkflow" / "design workflow" → AI 按 RESUME PROTOCOL 5 步读取
- **Open questions（留给下次）**：
  1. 起手任务在 T0.1（编排层职责边界）和 T2.6（PRD 方法论 spec）之间二选一未决
  2. 是否回头按双口径标准审查文档其他章节（§1.2 / §1.3 / §3.3）—— AI 提出但用户未回
  3. 团队 SKILL 仓库（GitHub）何时到位，决定 T-EXT.1 何时解锁 6 个 T3.x
- **本次会话追加的修订**：见修订历史 v0.2 → v0.4
- **跨工具限制**：本 checkpoint 保存在 Claude Code 的本地 memory 系统，不会自动同步到 Codex 或其他工具的记忆库。如果用户下次用 Codex 续作，需要手动指引读取本文档（架构审查报告）作为 cold start 入口

---

## 附录 A — 当前文件位置索引

```
/Users/xutu/Desktop/Qoder项目/Design Workflow 2026/
├── AGENTS.md                          # 编排层契约（本文档第 2 节扩展之）
├── README.md                          # 项目总览
├── docs/
│   └── architecture-review-2026-05-15.md  # 本文档
├── engine/                            # 待重构为 orchestrator/
│   ├── state_machine.py               # ✅ 6 环节状态机（成熟）
│   ├── skill_loader.py                # ✅ 装载机制
│   ├── knowledge.py                   # ⚠️ 待重构为 memory/
│   ├── evolution.py                   # ⚠️ 待并入 memory/maintainer.py
│   ├── llm_client.py                  # ✅ LLM adapter
│   ├── router.py / scheduler.py       # ✅
│   └── models.py / database.py        # ✅
├── skills/
│   ├── index.md                       # 注册表
│   ├── _TEMPLATE/SKILL.md             # 待升级为完整契约
│   ├── s1-req-clarify/SKILL.md        # ✅ 最成熟
│   ├── s2-ref-index/SKILL.md          # 🟡 骨架
│   ├── s3-design-gen/SKILL.md         # 🟡 骨架（最高风险）
│   ├── s4-state-complete/SKILL.md     # 🟡 骨架
│   ├── s5-design-review/SKILL.md      # 🟡 骨架（应 delegate UXdesign-buff）
│   └── s6-html-export/SKILL.md        # 🟡 骨架
├── data/
│   ├── workflow.db                    # 状态机持久化
│   ├── sessions/<id>/trace.jsonl
│   └── artifacts/<id>/<skill>/
├── cli/  api/  tests/  web/

外部依赖项目:
/Users/xutu/Desktop/Qoder项目/UXdesign-buff/        # 设计评审 skill (0.7)
/Users/xutu/Desktop/Qoder项目/skill-inspector/      # skill 质检（参考）
/Users/xutu/Desktop/记忆与进化系统.rtfd/             # 记忆系统历史规划
```

---

## 附录 B — 术语表

| 术语 | 含义 |
|---|---|
| 编排层 / Orchestrator | 状态机 + skill 装载 + 规范注入 + 校验 + 记忆 + LLM adapter，不承担任何单一 skill 生产力 |
| Spec / 规范 | 颜色/字号/组件/命名/状态等可机读的设计规范，存放在 `specs/` |
| Skill | 单一职能单元，目录式 + SKILL.md，按 step 装入状态机 |
| 横切 Skill | step=null 的 skill，不入状态机，由环节 skill 按需调用 |
| Hard Gate | 跑在 skill 输出后的 P0 校验，失败直接打回 |
| Soft Gate | P1 校验，失败警告但继续 |
| Typed Memory | 有显式 type 字段（profile/fact/episode/event/foresight/case/skill/source）的记忆记录 |
| Case → Skill | 多次同类 case 蒸馏成可复用 skill 模板的过程 |
| Memory Brief | skill 启动前注入的相关历史记忆摘要 |
| Three Flow | UXdesign-buff 的旅程流 / 操作流 / 心智流三流一致性检查 |
| Task Chain Graph | 任务路径的图谱形式（节点 + 边 + gap） |
| Harness | 围绕 LLM 的运行时框架，含工具、权限、流式、中断、记忆等基础设施 |

---

## 修订历史

| 版本 | 日期 | 变更 |
|---|---|---|
| 0.1 | 2026-05-15 | 初稿落盘 |
| 0.2 | 2026-05-15 | 用户反馈：1) 标注架构图与 codebase 在环节 2 的契约漂移（0.4 节）；2) 暂停 T3.x 任务等待团队 SKILL 仓库（0.5 节 + T-EXT.1）；3) 新增 7.12 节 + T7.8 定时同步任务 |
| 0.3 | 2026-05-15 | 用户深度交底关键方法论：1) 新增 0.6 节"用户工作方法论补充"5 条核心；2) §3.1 大幅修订（PRD 4 类方法论 + 双产物 + L0 数据重读 + 协作语义）；3) §3.3 修订（硬解/软解二元分类）；4) §3.4 修订（三段式协作语义）；5) §5.0 新增辅助面板规格；6) 新增 T2.6 / T2.7（spec 类，不阻塞）+ T-RESEARCH.1（调研型，不阻塞） |
| 0.4 | 2026-05-15 | 用户反馈：4 类问题描述需专业化。§0.6.1 完整重写为"4 维质量审核框架"，从"对人"改为"对工件"，承认 PM 合理约束，框架定位为"设计前置质量门 / 共同收敛"，避免对内对外口径混淆；§3.1.1 / §3.1.3 同步更新；记忆文件保留双口径以便 AI 内部判断仍准确 |
| 0.5 | 2026-05-15 | 新增 Phase CVR（约束校验恢复）7 个任务到 §8 路线图；新增决策日志 [T-CVR]；方案文档落盘到 `docs/design-cvr-constraint-validation-recovery.md` |
