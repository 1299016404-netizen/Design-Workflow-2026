# Phase 4 — UXdesign-buff 升级

> 让 UXdesign-buff 从通用方法论工具升级为飞猪酒店场景下的生产力武器。
> 不依赖 T-EXT.1，可独立推进。
> 关联章节：architecture-review §4
> 外部项目路径：`/Users/xutu/Desktop/Qoder项目/UXdesign-buff/`

---

## T4.1 Business Context Pack 注入

**状态**: 未开始  
**优先级**: P1  
**关联章节**: architecture-review §4.1

### 问题

14 套方法论是普世的。放进飞猪酒店场景时会显得通用——不知道 "88VIP 权益条文不能改"、"会员等级有金白银三档" 这些行业先验。

### 改法

增加 `business_context_pack` 注入机制，评审时这些先验和方法论同等优先级使用。

### 交付物

- [ ] context-pack 加载机制
- [ ] 飞猪酒店初始 context-pack
- [ ] 注入点与方法论的优先级合并逻辑

---

## T4.2 Severity 场景校准

**状态**: 未开始  
**优先级**: P1  
**关联章节**: architecture-review §4.2

### 问题

`critical/high/medium/low` 是绝对刻度。"CTA 按钮不够突出"在转化首页是 critical，在三级帮助页是 low。

### 改法

severity × `flow_stage_weight`：
- 主转化路径 × 1.5
- 信息展示 × 0.5
- 已注册老用户 × 0.7

权重表来自 context-pack。

### 交付物

- [ ] 权重计算逻辑
- [ ] 与 context-pack 的集成
- [ ] 文档更新

---

## T4.3 证据可追溯性硬化

**状态**: 未开始  
**优先级**: P1  
**关联章节**: architecture-review §4.3

### 问题

playbook 写了证据优先级（PRD > Figma > 截图 > 推断），但运行时没办法验。模型很容易说 "PRD 显示..." 而其实是从截图推的。

### 改法

每条 issue 的 `evidence_ids` 必须能验证回具体 source（PRD line range、Figma node id、screenshot region）。`validate_review_contract.py` 加 evidence-traceability gate。

### 交付物

- [ ] evidence_ids 验证逻辑
- [ ] 校验脚本更新
- [ ] issue 格式增加 source_type 字段

---

## T4.4 三流图谱化（Task Chain Graph）

**状态**: 未开始  
**优先级**: P1  
**关联章节**: architecture-review §4.4

### 问题

旅程流的"断点检测"应该是图论问题：节点（步骤）+ 边（转换）→ 找缺边、找环、找死锁。当前实现是对每步过 checklist，会漏跨步骤断裂。

### 改法

在 `review-state.json` 产出显式 `task_chain_graph: { nodes, edges, gaps }`。三流检查跑在图上。

### 交付物

- [ ] task_chain_graph schema
- [ ] 图构建算法
- [ ] 缺边/环/死锁检测
- [ ] review-state.json 格式更新

---

## T4.5 Designer Response 反驳通道

**状态**: 未开始  
**优先级**: P2  
**关联章节**: architecture-review §4.5

### 问题

UXdesign-buff 出了报告就完事——设计师反驳没地方去。反驳是最高价值训练信号。

### 改法

每条 issue 增加 `designer_response: { stance, reason, accepted_at }`。

### 交付物

- [ ] issue 格式扩展
- [ ] 反驳 UI 设计
- [ ] 反驳信号回流到记忆层

---

## T4.6 跨评审记忆 Namespace

**状态**: 未开始  
**优先级**: P2  
**关联章节**: architecture-review §4.6

### 问题

每次评审从零开始。理想：同一 flow 第二次评审自动 diff；跨项目升级为"项目级已知弱点"。

### 改法

增加 `memory_namespace: ux-review/<project>`，接入记忆层。

### 交付物

- [ ] namespace 定义
- [ ] diff 逻辑（同 flow 前后对比）
- [ ] 跨项目弱点升级机制

---

## T4.7 方法论插件化

**状态**: 未开始  
**优先级**: P2  
**关联章节**: architecture-review §4.7

### 问题

14 个框架硬编码。新方法论加不进来。

### 改法

`references/methodologies/` 改成插件目录，每个方法论一个 md，主 playbook 用 manifest 引用。

### 可扩展的方法论

- BJ Fogg 行为设计
- Cialdini 说服心理学
- Service blueprint backstage
- Dark Pattern detection

### 交付物

- [ ] 插件目录结构
- [ ] manifest 引用机制
- [ ] 1-2 个新方法论示例

---

## T4.8 任务链推断步骤

**状态**: 未开始  
**优先级**: P1  
**关联章节**: architecture-review §4.8

### 问题

三流检查需要任务链作为前提，但设计师不一定给。

### 改法

buff 看完所有 frame 后，先推一条 task chain 草案问设计师确认，再开始三流检查。

### 交付物

- [ ] 任务链推断算法
- [ ] 确认交互设计
- [ ] 与 T4.4 图谱化的衔接

---

## T4.9 视觉度量证据强制

**状态**: 未开始  
**优先级**: P2  
**关联章节**: architecture-review §4.9

### 问题

"字号太小" "对比度不够"——具体多少？没量。

### 改法

所有视觉度量类 issue 必须带可验证数值（px、WCAG 比值）。`get_metadata` 取得到的强制取，取不到的下调置信度到 inferred。

### 交付物

- [ ] 度量数值强制规则
- [ ] 与 Figma metadata 的对接
- [ ] 置信度降级逻辑

---

## T4.10 A11y 独立轨道

**状态**: 未开始  
**优先级**: P2  
**关联章节**: architecture-review §4.10

### 问题

"包容性设计"散在五维里，没有专门可访问性轨道。

### 改法

增加独立 WCAG 2.2 AA 检查轨道：contrast、target size、focus order。

### 交付物

- [ ] `references/a11y-checklist.md`
- [ ] `scripts/wcag_check.py`
- [ ] 与主评审流程的集成

---

## T4.11 Addendum_slots 领域定制

**状态**: 未开始  
**优先级**: P2  
**关联章节**: architecture-review §4.11

### 问题

shell 锁死防漂移很对，但阻止了垂直定制。

### 改法

shell 锁死，但允许 `addendum_slots` 注入领域特定章节。

### 交付物

- [ ] slot 注入机制
- [ ] 飞猪示例 slot："会员权益专项检查"

---

## T4.12 Quick-pass 模式

**状态**: 未开始  
**优先级**: P1  
**关联章节**: architecture-review §4.12

### 问题

单次评审 50K+ token，日常自查太重。

### 改法

增加 `quick-pass` 模式：只跑三流 + critical issue，省 70% token，5 分钟出结果。

### 交付物

- [ ] quick-pass 模式实现
- [ ] 配置开关
- [ ] token 成本对比测试

---

## T4.13 Opus 4.7 能力对齐

**状态**: 未开始  
**优先级**: P2  
**关联章节**: architecture-review §4.13

### 目标

利用 Opus 4.7 新能力提升 UXdesign-buff：

| 能力 | 用在哪 |
|------|--------|
| extended thinking | 背景重建 + 根因追问 |
| parallel tool use | Figma MCP 多节点并发读 |
| prompt caching | 缓存 methodology checklist + business context |
| structured outputs | 强制 review-state.json schema |

### 交付物

- [ ] thinking 模式集成
- [ ] parallel tool use 适配
- [ ] prompt caching 策略
- [ ] structured output schema
