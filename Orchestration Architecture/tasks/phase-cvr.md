# Phase CVR — 约束校验恢复

> 编排层串联时落地（等 T-EXT.1 解锁、skill 齐备后）。
> 详细方案见 `docs/design-cvr-constraint-validation-recovery.md`。
> 关联章节：architecture-review §8 Phase CVR

---

## T-CVR.1 错误分类模型 + 重试策略

**状态**: 未开始 | **优先级**: P0 | **阻塞**: T-CVR.4, T-CVR.5

```
TRANSIENT (可重试): API 超时、网络抖动、rate limit → 指数退避 1s→2s→4s, max 3 次
PERMANENT (需人工): skill 不存在、schema 校验失败、业务错误 → 标 FAILED + 降级路径
```

**交付物**: `engine/resilience.py`（错误分类枚举 + retry decorator + 降级路由）

---

## T-CVR.2 Step Checkpoint 机制

**状态**: 未开始 | **优先级**: P0 | **阻塞**: T-CVR.6

skill 执行内部记录最后成功子步骤，崩溃后从该点恢复。存储在 `StepExecutionORM` 的 `checkpoint` JSON 字段。

**交付物**: `engine/checkpoint.py` + ORM 字段扩展

---

## T-CVR.3 Hard Gate Validator 框架

**状态**: 未开始 | **优先级**: P0 | **阻塞**: T-CVR.4, T-CVR.7

跑在 skill 输出后、状态机推进前。P0 失败 → 挂起等人（回退 or 重跑）；P1 → 警告继续。

**交付物**: `engine/gate_validator.py`

---

## T-CVR.4 Scheduler 主循环改造

**状态**: 未开始 | **优先级**: P0 | **依赖**: T-CVR.1, T-CVR.3

接入重试 + gate + 异常捕获。见 CVR 方案文档 §5 的代码示例。

**交付物**: `engine/scheduler.py` 修改

---

## T-CVR.5 状态机扩展：mark_failed + retry_from_failed

**状态**: 未开始 | **优先级**: P1 | **依赖**: T-CVR.1 | **阻塞**: T-CVR.6

**交付物**: `engine/state_machine.py` 新增两个方法

---

## T-CVR.6 Crash Recovery

**状态**: 未开始 | **优先级**: P1 | **依赖**: T-CVR.2, T-CVR.5

启动时扫描 status=RUNNING 但无活跃进程的 workflow → 有 checkpoint 从断点恢复，无 checkpoint 整步重跑。

**交付物**: scheduler 启动时的恢复逻辑

---

## T-CVR.7 SKILL.md Frontmatter 扩展

**状态**: 未开始 | **优先级**: P2 | **依赖**: T-CVR.3

扩展 `hard_gates` / `soft_gates` / `fallback_when_missing` 字段到 frontmatter schema。

**交付物**: _TEMPLATE/SKILL.md 更新 + 文档

---

## MVP 定义

**T-CVR.1 ~ T-CVR.4** 做完即有基本的约束校验恢复能力。
