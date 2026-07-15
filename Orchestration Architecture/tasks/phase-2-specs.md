# Phase 2 — 规范层

> 让规范变成刚性约束，而不是靠 skill 自觉遵守。
> 关联章节：architecture-review §2.4, §3.1

---

## T2.1 specs/ 目录结构与最小 Schema

**状态**: 未开始  
**优先级**: P0  
**阻塞**: 无  
**关联章节**: architecture-review §2.2

### 目标

定义 specs/ 目录的结构规范和最小 schema，让 Spec Injector 能自动发现和注入。

### 初始结构

```
specs/
├── manifest.yml              # 全局清单：列出所有 spec 文件 + 版本
├── design-system/
│   ├── colors.md             # 色板 token
│   ├── typography.md         # 字号/字重/行高
│   ├── spacing.md            # 栅格/间距
│   ├── components.md         # 组件注册表
│   └── naming.md             # 命名规范
├── design-principles/
│   ├── three-flow.md         # 旅程流/操作流/心智流
│   ├── five-dimensions.md    # 五维评审
│   └── jtbd.md               # Jobs to be Done
├── brand/
│   ├── tone.md               # 品牌调性
│   ├── copy-rules.md         # 文案规范
│   └── compliance.md         # 合规约束
├── state-library/            # 见 T2.3
├── memory-starter/           # 见 T1.5
└── _proposals/               # 自动同步提议暂存（见 T7.8）
```

### 每个 spec 文件的最小 schema

```yaml
---
id: <spec-id>
version: v<semver>
last_updated: <date>
owner: <person-or-team>
inject_as: system_prefix | tool_call_only | reference
---
# 正文（供注入的内容）
```

### 交付物

- [ ] specs/ 目录骨架
- [ ] manifest.yml schema
- [ ] 单个 spec 文件的 schema 定义
- [ ] Spec Injector 加载逻辑的接口文档

---

## T2.2 design-system 内容初始化

**状态**: 未开始  
**优先级**: P1  
**阻塞**: 无  

### 目标

从飞猪现有设计规范导入初始内容到 `specs/design-system/`。

### 来源

- Figma 设计规范库
- 语雀文档
- 现有设计系统文档

### 交付物

- [ ] colors.md（色板 token 完整列表）
- [ ] typography.md
- [ ] spacing.md
- [ ] components.md（组件 ID + 语义 + variant 列表）
- [ ] naming.md

---

## T2.3 state-library Taxonomy 定义

**状态**: 未开始  
**优先级**: P1  
**阻塞**: 无  
**关联章节**: architecture-review §3.4.2

### 目标

定义状态分类法，供 S4（状态补全）使用。分层：通用维度 + 业务维度。

### 分层结构

```
specs/state-library/
├── taxonomy.yml              # 分类法总览
├── universal/                # 通用维度（所有项目适用）
│   ├── data-states.md        # 数据：空/加载中/加载失败/部分加载/满载
│   ├── network-states.md     # 网络：在线/离线/弱网
│   ├── permission-states.md  # 权限：有/无/部分/过期
│   ├── lifecycle-states.md   # 生命周期：创建/激活/暂停/终止
│   └── interaction-states.md # 交互：默认/悬浮/按压/禁用/聚焦
└── business/                 # 业务维度（飞猪酒店特有）
    ├── member-level.md       # 会员等级：普通/银/金/白金/88VIP
    ├── order-status.md       # 订单状态
    ├── room-availability.md  # 房态
    └── ...
```

### 交付物

- [ ] taxonomy.yml（分类法定义）
- [ ] 通用维度的 5 个文件
- [ ] 业务维度的初始文件（至少 3 个）
- [ ] S4 如何消费这些 spec 的接口说明

---

## T2.4 Business Context-Pack 机制

**状态**: 未开始  
**优先级**: P1  
**阻塞**: 无  
**关联章节**: architecture-review §4.1

### 目标

实现项目级业务上下文注入机制，让通用方法论（如 UXdesign-buff）能感知飞猪酒店的业务先验。

### 配置格式

```yaml
# .design-workflow/context-pack.yml
domain: hotel-booking
critical_constraints:
  - 88VIP 权益不可篡改文案
  - 海外酒店价格要标外加显式
  - 会员卡升级流程不能跳出主链
known_anti_patterns:
  - 立省金额未加显式锚点
  - 信任递进第三步缺信任锚点
flow_stage_weights:
  main_conversion: 1.5
  info_display: 0.5
  registered_user: 0.7
```

### 交付物

- [ ] context-pack.yml schema
- [ ] 编排层注入机制（与 Spec Injector 协同）
- [ ] 飞猪酒店的初始 context-pack 内容

---

## T2.5 hard_gates 校验器框架

**状态**: 未开始  
**优先级**: P0  
**阻塞**: 无  
**关联章节**: architecture-review §2.4.2

### 目标

实现 hard gate / soft gate 校验框架：确定性脚本，跑在 skill 输出后。

### 设计

- P0（hard gate）不通过 → 直接打回，不进 human 阶段
- P1（soft gate）不通过 → 警告但继续
- 校验器是小脚本，编排层按 SKILL.md frontmatter 声明自动执行

### 校验器接口

```python
class GateValidator:
    def validate(self, artifact_path: str, gate_config: dict) -> GateResult:
        """
        Returns:
          GateResult(passed=bool, severity=P0|P1, violations=[...])
        """
```

### 示例 gate

| gate_id | 规则 | severity |
|---------|------|----------|
| color-token-only | 输出中无 #hex，只有 token 引用 | P0 |
| component-id-required | 每个 Figma instance 必须有 component_id | P0 |
| copy-tone-aligned | 文案符合品牌调性 | P1 |

### 交付物

- [ ] gate validator 框架（`engine/gate_validator.py`）
- [ ] Gate 脚本约定（输入/输出/错误格式）
- [ ] 3 个示例 gate 脚本
- [ ] 与 scheduler 集成点说明

---

## T2.6 PRD 4 维质量审核方法论 Spec ⭐

**状态**: 未开始  
**优先级**: P0 — 推荐首批  
**阻塞**: 无（不依赖任何其他任务）  
**关联章节**: architecture-review §0.6.1, §3.1

### 目标

将用户原创的 PRD 4 维质量审核方法论编码为可机读的 spec，供 S1 强制注入。

### 4 个维度

| 维度 | 检测动作 | 当前 S1 骨架 |
|------|----------|-------------|
| 1. 业务目标对齐度与方案必要性 | 方案逐条对照业务目标，标注关联强度 | 已有（L1+L2），需用方法论加深 |
| 2. 数据解读深度与因果关系 | AI 独立做数据解读，作为交叉验证 | **缺（L0）— 最大缺口** |
| 3. PRD 内部逻辑一致性 | 全文交叉对照（目标层级/竞品本地化/描述漂移） | 已有（L3），需细分三亚型 |
| 4. 设计可行性与体验底线 | UX 方法论预审设计相关需求 | 已有（L4），需引入 UXdesign-buff 同源方法论 |

### L0 数据重读（维度 2 的核心缺口）

```
输入：原始业务数据（埋点指标、转化漏斗、分群表现等）
步骤：
  1. 不看 PRD 论证，AI 独立做数据洞察
  2. 对比 PRD 的论证 → 列出洞察分歧点
  3. 形成讨论清单（中性表达，不是质疑）
输出：讨论清单 + AI 独立洞察报告
```

### S1 输出契约（双产物）

| 产物 | 用途 | 受众 |
|------|------|------|
| PRD v2（清洗版） | 上下游对齐、审核记录 | PM、stakeholder |
| 设计需求.md（干净版） | 喂给下游 skill | S2/S3/S4 |

### 交付物

- [ ] `specs/design-principles/prd-quality-review.md`（方法论正文）
- [ ] L0 数据重读步骤的详细 spec
- [ ] 三亚型逻辑一致性检查清单
- [ ] S1 双产物输出格式定义

---

## T2.7 数据洞察方法论 Spec

**状态**: 未开始  
**优先级**: P1 — 推荐首批  
**阻塞**: 无  
**关联章节**: architecture-review §3.1.3

### 目标

为 L0 "AI 独立数据解读" 步骤编写方法论指引：什么数据看什么、怎么解读、产出什么格式。

### 需要定义

1. 数据源类型清单（埋点、漏斗、分群、AB 实验结果...）
2. 每类数据的标准解读框架
3. 洞察表达格式（结构化 JSON + 自然语言摘要）
4. 与 PRD 论证的对比方法
5. "讨论清单" 的输出模板

### 交付物

- [ ] `specs/design-principles/data-insight-methodology.md`
- [ ] 数据解读框架（分类型）
- [ ] 输出模板
