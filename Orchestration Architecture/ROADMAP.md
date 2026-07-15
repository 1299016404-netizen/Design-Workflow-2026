# Design Workflow 2026 — 施工路线图

> 本文件是项目全景地图。每个任务的详细描述见 `docs/tasks/` 目录。
> 已做决策见 `docs/DECISIONS.md`，未决问题见 `docs/OPEN-QUESTIONS.md`。
> 架构完整论述见 `docs/architecture-review-2026-05-15.md`（v0.5）。

---

## 项目定位

飞猪酒店设计团队的 6 环节自动化设计工作流 Agent 系统：

```
PRD → S1(需求清洗) → S2(参考索引) → S3(设计生成) → S4(状态补全) → S5(设计评审) → S6(HTML输出)
```

目标：从 PRD 到可交互原型的全链路自动化，设计师从"执行者"变为"决策者"。

---

## 系统架构分层

```
┌─ Runner Layer ────────────────────────────────┐
│ CLI / API / IDE 入口、会话管理、人机交互通道      │
├─ Orchestrator Layer ──────────────────────────┤
│ • 状态机 (已有)                                  │
│ • Skill Loader (已有，需扩展)                    │
│ • Spec Injector (缺) ⭐                        │
│ • Hard Gate Validator (缺) ⭐                  │
│ • Memory Runtime (现塞在 knowledge.py，需独立)   │
│ • CVR: 错误分类 + Checkpoint + 恢复 (缺)        │
│ • LLM/Tool Adapter (已有)                       │
│ • Trace & Observability (已有)                  │
├─ Spec Layer (缺) ⭐ ─────────────────────────┤
│ specs/                                         │
│ ├─ design-system/  颜色/字号/栅格/组件/命名      │
│ ├─ design-principles/ 三流/五维/JTBD           │
│ ├─ brand/  调性/文案/合规                       │
│ └─ state-library/ 状态分类法                    │
├─ Skill Layer (已有 6 + 横切待建) ─────────────┤
│ s1-s6 主线 + figma-mcp-adapter / image-gen 等  │
└─ Memory Layer (现硬绑 gbrain) ⭐ ──────────────┘
```

---

## Phase 总览与依赖关系

| Phase | 主题 | 任务数 | 前置依赖 | 状态 |
|-------|------|--------|----------|------|
| **0** | 地基对齐 | 3 | 无 | 未开始，**推荐首批** |
| **1** | 记忆层 | 6 | 无 | 未开始 |
| **2** | 规范层 | 7 | 无 | 未开始，T2.6/T2.7 **推荐首批** |
| **3** | Skills 重构 | 6 | T-EXT.1 | **全部 BLOCKED** |
| **4** | UXdesign-buff 升级 | 13 | 无 | 未开始 |
| **5** | Harness 运行时 | 7 | 无 | 未开始 |
| **6** | 数据流契约 | 4 | 无 | 未开始 |
| **7** | 协作/部署/运维 | 8 | 无 | 未开始 |
| **8** | 测试/评估 | 4 | 无 | 未开始 |
| **9** | 安全/合规 | 3 | 无 | 未开始 |
| **10** | 文档/知识 | 4 | 无 | 未开始 |
| **CVR** | 约束校验恢复 | 7 | T-EXT.1 解锁后落地 | 未开始 |
| **EXT** | 外部依赖 | 1 | 等团队 SKILL 仓库 | **BLOCKED** |
| **RESEARCH** | 调研 | 1 | 无 | 未开始 |

**总计：74 个任务**

---

## 推荐执行顺序

### 第一批（可并行，无依赖）

| 任务 | 理由 |
|------|------|
| T0.1 编排层职责边界 | 地基中的地基，决定 Spec Injector + Hard Gate Validator 是否引入 |
| T2.6 PRD 4 维审核方法论 spec | 用户原创框架，不阻塞，做完后可用来审核团队 S1 实现 |
| T2.7 数据洞察方法论 spec | L0 步骤的指引，独立可做 |
| T-RESEARCH.1 硬解 vs 软解调研 | 不阻塞主线，产出影响 T3.3 设计 |

### 第二批（T0.1 决议后）

| 任务 | 理由 |
|------|------|
| T0.2 目录重组 | 需 T0.1 确认编排层边界后才能动 |
| T0.3 SKILL.md frontmatter 定稿 | 需 T0.1 确认哪些字段归编排层 |
| T1.1 Typed memory schema | 不依赖 T0.x 但与之互补 |
| T2.1 specs/ 目录结构 | 同上 |

### 第三批（地基就绪后）

Phase 1 剩余 + Phase 2 剩余 + Phase 4（UXdesign-buff 升级不依赖 T-EXT.1）

### 第四批（T-EXT.1 解锁后）

Phase 3 全部 + Phase CVR

### 长尾

Phase 5-10 按需穿插

---

## 关键阻塞点

```
T-EXT.1 (团队 SKILL 仓库导入)
  ├── blocks → T3.1, T3.2, T3.3, T3.4, T3.5, T3.6
  └── blocks → Phase CVR 的实施时机

T0.1 (编排层职责边界)
  ├── blocks → T0.2 (目录重组)
  └── blocks → T0.3 (frontmatter 定稿)

T-CVR.1 (错误分类)
  ├── blocks → T-CVR.4 (scheduler 改造)
  └── blocks → T-CVR.5 (状态机扩展)

T-CVR.2 (checkpoint)
  └── blocks → T-CVR.6 (crash recovery)

T-CVR.3 (gate validator)
  ├── blocks → T-CVR.4 (scheduler 改造)
  └── blocks → T-CVR.7 (frontmatter 扩展)

T-CVR.5 (状态机扩展)
  └── blocks → T-CVR.6 (crash recovery)
```

---

## 已确认约束

| 项 | 决定 | 日期 |
|----|------|------|
| 优先运行时 | Codex + Claude Code | 2026-05-15 |
| 操作系统 | 全员 macOS | 2026-05-15 |
| gbrain | 管理者权力可强制安装，统一基础设施 | 2026-05-15 |
| 优先级原则 | 稳定可用 > 功能丰富 | 2026-05-15 |
| 工作模式 | 一个任务一个讨论，不批量 | 2026-05-15 |
| PRD 方法论 | 双口径（对外专业化 / 内部保留用户原话精度） | 2026-05-15 |
| T3.x 暂停 | 全部 blocked by T-EXT.1 | 2026-05-15 |

---

## 文件索引

```
docs/
├── ROADMAP.md                              ← 本文件（施工路线图）
├── DECISIONS.md                            ← 已做决策 + 决策模板
├── OPEN-QUESTIONS.md                       ← 所有未决问题
├── architecture-review-2026-05-15.md       ← 架构完整论述（真源 v0.5）
├── design-cvr-constraint-validation-recovery.md ← CVR 方案详细设计
└── tasks/
    ├── phase-0-foundation.md               ← 地基对齐（3 个任务）
    ├── phase-1-memory.md                   ← 记忆层（6 个任务）
    ├── phase-2-specs.md                    ← 规范层（7 个任务）
    ├── phase-3-skills.md                   ← Skills 重构（6 个任务，全 blocked）
    ├── phase-4-uxdesign-buff.md            ← UXdesign-buff 升级（13 个任务）
    ├── phase-5-harness.md                  ← Harness 运行时（7 个任务）
    ├── phase-6-data-contract.md            ← 数据流契约（4 个任务）
    ├── phase-7-collaboration.md            ← 协作/部署/运维（8 个任务）
    ├── phase-8-testing.md                  ← 测试/评估（4 个任务）
    ├── phase-9-security.md                 ← 安全/合规（3 个任务）
    ├── phase-10-docs.md                    ← 文档/知识（4 个任务）
    ├── phase-cvr.md                        ← 约束校验恢复（7 个任务）
    └── phase-ext-research.md               ← 外部依赖 + 调研（2 个任务）
```
