# Phase 0 — 地基对齐

> 优先级最高。后续所有 Phase 的结构都依赖这里的决策。

---

## T0.1 编排层职责边界确认

**状态**: 未开始  
**优先级**: P0 — 推荐首批  
**阻塞**: T0.2, T0.3  
**关联章节**: architecture-review §2

### 目标

确认编排层引入 Spec Injector + Hard Gate Validator 两个新组件的具体职责划分。

### 背景

当前 `AGENTS.md` 把编排层定义为"装载/调度/观测/记忆"。缺少一层：**规范注入与契约校验**。这层目前散落在各 skill "自觉读 design-spec"，没人验证 skill 真读了，也没人对产出物做硬性 gate。

多人开发系统，规范不能靠 skill 自觉。

### 需要决定

1. Spec Injector 的注入方式：`system_prefix` / `tool_call_only` / `reference`，是否允许 skill 自行选择？
2. Hard Gate Validator 跑在哪个时机？skill 输出后 → 状态机推进前？还是也允许 mid-skill gate？
3. 编排层 vs Skill 的职责边界确认表（见 architecture-review §2.3 的草案）
4. 是否把 `engine/` 重命名为 `orchestrator/`（取决于本决策）

### 交付物

- [ ] 编排层职责边界确认文档（追加到 DECISIONS.md）
- [ ] Spec Injector 接口定义（interface/abstract class）
- [ ] Hard Gate Validator 接口定义
- [ ] AGENTS.md 更新

### 参考

- architecture-review §2.1 ~ §2.4
- UXdesign-buff `scripts/validate_review_contract.py`（gate 脚本参考）

---

## T0.2 目录重组方案确认

**状态**: 未开始  
**优先级**: P0  
**依赖**: T0.1（需先确认编排层边界）  
**关联章节**: architecture-review §2, 附录 A

### 目标

确认项目目录结构重组方案，引入 `specs/` 目录，决定是否将 `engine/` 重命名为 `orchestrator/`。

### 需要决定

1. `engine/` → `orchestrator/` 是否执行？涉及大量 import 路径变更
2. `specs/` 的初始子目录结构
3. `orchestrator/memory/` 的位置与现有 `engine/knowledge.py` 的关系
4. 横切 skill 的目录位置（`skills/_cross-cutting/` vs `skills/` 顶层）

### 交付物

- [ ] 确认后的目录树文档
- [ ] 迁移脚本（如果重命名 engine → orchestrator）
- [ ] import 路径更新

---

## T0.3 SKILL.md frontmatter 升级版定稿

**状态**: 未开始  
**优先级**: P0  
**依赖**: T0.1（需确认哪些字段归编排层管）  
**关联章节**: architecture-review §2.4.3

### 目标

定稿 SKILL.md 的完整 frontmatter 契约，所有 skill 开发者按此模板开发。

### 当前状态

`skills/_TEMPLATE/SKILL.md` 只有最基础的 id/name/step/version 字段。

### 目标 frontmatter（草案，待讨论确认）

```yaml
---
id: <skill-id>
name: <中文名>
step: <number | null for cross-cutting>
version: v<date>

input_contract:
  required: [<file-list>]
  schema: schemas/<id>-input.json
output_contract:
  artifacts:
    - path: <output-file>
      schema: schemas/<id>-output.json

spec_dependencies:
  - <spec-path>
spec_inject_as: system_prefix | tool_call_only | reference

hard_gates: [<gate-id-list>]
soft_gates: [<gate-id-list>]

required_tools: [<tool-list>]
optional_tools: [<tool-list>]
fallback_when_missing:
  <tool>: <fallback-strategy>

memory_read:
  - namespace: <ns>
    top_k: <n>
    by: <strategy>
memory_write:
  - type: <memory-type>
    when: <trigger>

requires_human: <bool>
human_decisions:
  - id: <decision-id>
    type: <choice | confirm | freeform>

self_evolution: <bool>
evolution_strategy: <strategy>
---
```

### 交付物

- [ ] 最终 frontmatter schema（JSON Schema 格式）
- [ ] 更新 `skills/_TEMPLATE/SKILL.md`
- [ ] 6 个现有 skill SKILL.md 迁移到新格式（骨架级，不含具体值填充）
