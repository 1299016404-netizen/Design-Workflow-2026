# Phase 1 — 记忆层

> 解决 gbrain 隐式硬依赖 + 建立 Typed Memory Schema + Pluggable Store。
> 关联章节：architecture-review §6

---

## T1.1 Typed Memory Schema 定义

**状态**: 未开始  
**优先级**: P0  
**阻塞**: 无  
**关联章节**: architecture-review §6.3

### 目标

定义 8 种记忆类型的 schema，替代现有 `KnowledgeEntry.category` 的扁平分类。

### 8 种类型

| type | 用途 | 例子 |
|------|------|------|
| `profile` | 项目/团队/用户的稳定画像 | 飞猪酒店设计偏好"克制商业感" |
| `fact` | 可独立复用的关键事实 | "88VIP 权益条文不可改文案" |
| `episode` | 一段任务/对话的浓缩剧情 | "本次需求清洗：3 个争议、2 个被剔除" |
| `event` | 带时间戳的事件 | "2026-05-15 designer 拒绝了 P1 评审建议" |
| `foresight` | 未来要做的事 | "下次状态补全要覆盖海外信用卡场景" |
| `case` | 一次完整任务记录 | s3 一次完整生成（输入/步骤/产出/质量分） |
| `skill` | 多次 case 蒸馏出的复用打法 | "酒店卡片改版优先复用 LIST.HOTEL_CARD 变体" |
| `source` | 原始证据 | PRD 链接、Figma 节点 |

### Frontmatter（每条记忆必须带）

```yaml
type: <type>
domain: <workflow-scope>
project: <project-id>
team: <team-id>
entities: [<entity-list>]
status: active | superseded | archived
confidence: <0.0-1.0>
valid_from: <date>
valid_until: <date | null>
supersedes: [<memory-id-list>]
quality_score: <0.0-1.0>
session_id: <session-id>
```

### 交付物

- [ ] `orchestrator/memory/schema.py`（dataclass + JSON Schema）
- [ ] 冲突解决规则文档（见 §6.4 的 4 条规则）
- [ ] 与现有 `KnowledgeEntry` 的映射关系

---

## T1.2 Pluggable Store 架构

**状态**: 未开始  
**优先级**: P0  
**阻塞**: 无  
**关联章节**: architecture-review §6.2, §6.6

### 目标

实现可插拔的存储后端，解决 gbrain 硬依赖。默认零配置可用，gbrain 作为可选增强。

### Store 接口（5 种后端）

| Store | 场景 | 依赖 |
|-------|------|------|
| `LocalSqliteStore` | 默认，零配置 | sqlite3（内置） |
| `LocalVectorStore` | 语义检索 | hnswlib |
| `GbrainStore` | 统一基础设施 | gbrain CLI |
| `RemoteHttpStore` | 团队共享 | HTTP endpoint |
| `FileStore` | git 友好，可审阅 | 无 |

### 部署模式

1. **Solo**（默认）：纯本地，零配置
2. **Team-shared**：通过 `--team-namespace` 共享
3. **Hybrid**：读团队记忆，写本地

### 交付物

- [ ] `orchestrator/memory/stores/base.py`（抽象接口）
- [ ] `orchestrator/memory/stores/sqlite_store.py`
- [ ] `orchestrator/memory/stores/vector_store.py`
- [ ] `orchestrator/memory/stores/gbrain_store.py`
- [ ] `orchestrator/memory/stores/file_store.py`
- [ ] `orchestrator/memory/config.py`（配置选择哪个后端）
- [ ] 失败时 fail-fast 而非 silent skip

---

## T1.3 Pre/In/Post Skill Memory Runtime

**状态**: 未开始  
**优先级**: P1  
**阻塞**: 无  
**关联章节**: architecture-review §6.2 Layer 2

### 目标

实现编排层的记忆运行时：skill 执行前注入相关记忆、执行中记录决策、执行后写入结构化记忆。

### 三阶段

| 阶段 | 动作 |
|------|------|
| **Pre-skill** | 意图分类 → 多路检索 → Memory Brief 注入到 system message |
| **In-skill** | 决策/事实/foresight/证据 → scratchpad（临时区） |
| **Post-skill** | 自动分段 → typed write → 去重 → link |

### 交付物

- [ ] `orchestrator/memory/runtime.py`
- [ ] Memory Brief 模板定义
- [ ] 与 Spec Injector 的拼装顺序（Memory Brief 放在 spec 注入之后）

---

## T1.4 Maintainer 设计

**状态**: 未开始  
**优先级**: P1  
**阻塞**: 无  
**关联章节**: architecture-review §6.2 Layer 3, §6.5

### 目标

设计后台维护进程：语义巩固、冲突解决、Case→Skill 蒸馏循环。

### Case → Skill 蒸馏循环

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
```

### 关键约束

- **Maintainer 不能直接改 SKILL.md**，必须走 PR/proposal 形式给人审
- Reject 的 proposal → 进负样本
- 反馈循环饱和处理（大量 reject 时降低提案频率）

### 交付物

- [ ] `orchestrator/memory/maintainer.py`
- [ ] 语义巩固算法设计
- [ ] 冲突解决规则实现
- [ ] Case 聚类 + Skill 蒸馏 pipeline
- [ ] Proposal 模板与审核流程

---

## T1.5 Starter Pack 机制

**状态**: 未开始  
**优先级**: P2  
**阻塞**: 无  
**关联章节**: architecture-review §6.7

### 目标

新人 Day 0 就有用：随项目分发预策展的记忆包。

### 机制

- 项目内置 `specs/memory-starter/`：已策展的 profile、已蒸馏的 skill 案例、fact 库
- `setup_check.py` 首次运行时导入 starter pack 到本地 store
- 版本化：starter pack 有版本号，本地已导入过的不重复导入

### 交付物

- [ ] `specs/memory-starter/` 目录结构定义
- [ ] 导入脚本（集成到 setup_check.py）
- [ ] 版本控制机制

---

## T1.6 现有代码迁移路径

**状态**: 未开始  
**优先级**: P1  
**阻塞**: 无  
**关联章节**: architecture-review §6.8

### 目标

把现有 `engine/knowledge.py` 和 `engine/evolution.py` 平滑迁移到新记忆架构，不 break 现有功能。

### 迁移策略

1. `engine/knowledge.py` → `orchestrator/memory/legacy/` 保留兼容
2. 新建 `orchestrator/memory/` 完整新实现
3. 现有 `KnowledgeEntry` 通过 adapter 映射到新 typed schema
4. `engine/evolution.py` → 并入 `orchestrator/memory/maintainer.py`
5. 过渡期两套并存，新代码写新接口，旧代码逐步迁移

### 交付物

- [ ] 迁移计划文档（步骤 + 回滚方案）
- [ ] Adapter 层实现
- [ ] 现有测试迁移验证
