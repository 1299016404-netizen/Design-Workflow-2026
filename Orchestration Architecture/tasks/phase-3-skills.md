# Phase 3 — Skills 重构

> ⚠️ **全部 BLOCKED by T-EXT.1**（团队 SKILL 仓库导入）
> 理由：没有团队具体 SKILL 实现，pipeline 真实形状无法确定，讨论会变成纸上谈兵。
> 关联章节：architecture-review §3

---

## T3.1 S1 边界澄清 + prd-fetcher 横切 Skill

**状态**: BLOCKED  
**依赖**: T-EXT.1  
**优先级**: P1  
**关联章节**: architecture-review §3.1

### 目标

1. 明确 S1 的边界：它只做"PRD 质量审核 + 双产物输出"，不做 PRD 获取
2. 抽出 `prd-fetcher` 横切 skill：负责从语雀、钉钉文档、设计稿链接获取原始 PRD

### 保留问题

- "VisionPass 已将图片转为文本"是前置假设，需定义降级路径
- "争议选择题"的 schema 没定义；需要统一的 `HumanDecisionRequest` schema

### 交付物

- [ ] S1 SKILL.md 重写（边界明确版）
- [ ] `skills/_cross-cutting/prd-fetcher/SKILL.md`
- [ ] `HumanDecisionRequest` schema 定义

---

## T3.2 S2 拆分为 corpus-indexer + retriever

**状态**: BLOCKED  
**依赖**: T-EXT.1  
**优先级**: P1  
**关联章节**: architecture-review §3.2

### 目标

将 S2 拆分为：
- **横切 skill**：`design-corpus-indexer`（离线/调度型，构建刷新索引）
- **环节 skill**：`s2-ref-index`（在线，纯检索 + 4 维标注）

### 需要决定

- 稿子池在哪？Figma 文件树 / 本地导出 / 自建库？
- Embedding 模型？本地 vs 云端？
- 多人共享时索引同步策略？
- 索引刷新策略？
- 冷启动兜底策略（第一个项目无 precedent）？

### 交付物

- [ ] `skills/_cross-cutting/corpus-indexer/SKILL.md`
- [ ] `skills/s2-ref-index/SKILL.md` 重写
- [ ] 索引 schema 定义
- [ ] 冷启动方案

---

## T3.3 S3 任务路由 + 横切 Skill 抽离 + 自检硬化

**状态**: BLOCKED  
**依赖**: T-EXT.1  
**优先级**: P0 — 最高风险环节  
**关联章节**: architecture-review §3.3

### 目标

S3 是整条链唯一的真创造性环节。需要：

1. 实现三分支路由：修改 / 新模块 / 新页面
2. 实现硬解 vs 软解路径选择（默认软解）
3. 抽出横切 skill：`figma-mcp-adapter` / `image-gen-adapter` / `screenshot-fetcher`
4. 5 条自检写进 hard_gates

### 硬解 vs 软解

| 路径 | 输入 | 输出 | 适用 |
|------|------|------|------|
| **硬解** | 设计需求 + 设计规范 | 直接 Figma 设计稿 | 0→1 项目 |
| **软解** | 设计需求 → image2 出图 → 转图层 | Figma 可编辑图层 | 大厂、有历史包袱 |

**关键判断**：大厂场景下 "稳定能生成并可用" > "创造力"，默认走软解。

### 5 条自检规则（写进 hard_gates）

1. 硬性规则优先
2. 机械验证优先
3. 不做泛化像素验收
4. 审美判断降级处理
5. 标注风险

### 交付物

- [ ] `skills/s3-design-gen/SKILL.md` 完整重写
- [ ] 三分支路由逻辑
- [ ] 硬解/软解路径选择器
- [ ] `skills/_cross-cutting/figma-mcp-adapter/SKILL.md`
- [ ] `skills/_cross-cutting/image-gen-adapter/SKILL.md`
- [ ] `skills/_cross-cutting/screenshot-fetcher/SKILL.md`
- [ ] 5 条 hard gate 脚本

---

## T3.4 S4 状态矩阵 Schema + 推演算法

**状态**: BLOCKED  
**依赖**: T-EXT.1  
**优先级**: P1  
**关联章节**: architecture-review §3.4

### 目标

实现 S4 的三段式协作语义 + 状态推演算法。

### 三段式（用户校准）

1. **辅助列举阶段**：读项目历史 + PRD + 状态库 → 列出"此模块应该有哪些状态"
2. **人工选择阶段**：让设计师选/判/补
3. **自动生成阶段**：基于确认的状态清单，生成全状态矩阵

### state-matrix.json 输出格式

```json
{
  "module_id": "hotel-card",
  "dimensions": [
    {
      "name": "data_state",
      "states": ["empty", "loading", "loaded", "error"],
      "source": "universal/data-states"
    }
  ],
  "cells": [
    {
      "state_combo": ["loaded", "member_gold"],
      "figma_node_ref": "1234:5678",
      "prd_evidence_line": "PRD §3.2 第 4 段",
      "confidence": 0.9,
      "designer_confirmed": true
    }
  ]
}
```

### 推演算法（不能纯靠 LLM 想）

```
任务类型 → 适用维度（从 state-library 查）→ 生成 cell 列表 → 比对设计稿 → 标缺失
```

### 交付物

- [ ] `skills/s4-state-complete/SKILL.md` 重写
- [ ] state-matrix.json schema
- [ ] 推演算法伪代码/实现
- [ ] 人工选择阶段的交互设计

---

## T3.5 S5 改为 delegate UXdesign-buff 桥接

**状态**: BLOCKED  
**依赖**: T-EXT.1  
**优先级**: P1  
**关联章节**: architecture-review §3.5

### 目标

S5 不自己实现三流检查，而是调用 UXdesign-buff 作为横切能力。S5 真正职责：

1. 准备证据（从上游产物收集）
2. 调用 UXdesign-buff
3. 把 review-state.json 翻译为反馈循环决策：
   - P0 → 自动回退 S3/S4
   - P1+ → 选择题给设计师
   - pass → 进 S6

### 交付物

- [ ] `skills/s5-design-review/SKILL.md` 重写
- [ ] 证据准备模块
- [ ] UXdesign-buff 调用接口
- [ ] 反馈循环决策翻译逻辑

---

## T3.6 S6 渲染管道（无 LLM）

**状态**: BLOCKED  
**依赖**: T-EXT.1  
**优先级**: P2  
**关联章节**: architecture-review §5

### 目标

实现 S6 的确定性渲染管道（纯脚本，无 LLM）+ 辅助面板形态。

### 辅助面板

```
┌─────────────┬───────────────────────────┐
│  左侧导航    │      右侧主视图            │
│  (页面列表)  │   (当前页面，可点击交互)   │
└─────────────┴───────────────────────────┘
       │            │
       └─联动────────┘ 右侧跳转后左侧自动 highlight
```

### 渲染管道（6 步确定性脚本）

1. `fetch_figma_exports.py` — 批量导出 PNG@2x
2. `extract_hotspots.py` — 从 Figma metadata 算热点坐标
3. `build_routing.py` — 从 task_chain_graph 算跳转
4. `assemble.py` — 模板填充
5. `inline_assets.py` — base64 内联
6. `validate.py` — 校验单文件可独立打开

### 技术栈

Vanilla JS + 极简 CSS，不引入框架。单文件 HTML 默认输出。

### 分阶段交付

| 阶段 | 能力 | 优先级 |
|------|------|--------|
| v1 | 静态屏幕 + 状态下拉 + 线性导航 | P0 |
| v2 | 像素级热点跳转 + 跳转栈 | P1 |
| v3 | variant 切换 + 简单表单状态模拟 | P2 |
| v4 | 评审 issue 内联展示 + 反馈收集 | P2 |

### 避坑

- ❌ 不用 puppeteer 渲染 Figma → DOM 重写，走官方 export API
- ❌ 不在 s6 塞 LLM
- ✅ 每屏带 `data-source-frame-id` 属性
- ✅ 加"评审视图模式"（叠加 s5 issue 标记）

### 交付物

- [ ] `skills/s6-html-export/SKILL.md` 重写
- [ ] 6 步渲染管道脚本
- [ ] 辅助面板 HTML 模板
- [ ] 验证脚本
