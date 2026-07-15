---
title: 约束校验恢复（Constraint · Validation · Recovery）架构方案
date: 2026-05-15
status: approved-pending-implementation
depends_on: T-EXT.1（skill 齐备后与编排层串联时落地）
---

# 约束校验恢复（CVR）— 编排层扩展方案

## 问题

当前编排层缺少失败场景下的确定性行为：
- S3 跑到一半 API 超时 → scheduler 循环崩溃，workflow 卡在中间态
- 电脑重启 → workflow.db 记录了"在 S3 auto 阶段"但不知道内部跑到哪
- skill 产出不符合设计规范 → 没有拦截点，直接推进状态机
- 没有重试、降级、错误分类机制

## 方案总览

在编排层增加三个新组件 + 改造 scheduler 主循环：

```
agent.execute_step()
    ↓ （加重试 + 错误分类）
gate_validator.validate()
    ↓ P0 失败 → 挂起等人（回退 or 重跑）
    ↓ P1 → 警告继续
router.evaluate()
    ↓
fsm.advance()
```

---

## 1. 错误分类与重试（resilience.py）

错误分两类，处理策略不同：

| 类型 | 例子 | 策略 |
|------|------|------|
| TRANSIENT | API 超时、网络抖动、rate limit | 指数退避重试（1s→2s→4s），最多 3 次 |
| PERMANENT | skill 不存在、schema 校验失败、业务错误 | 直接标记 FAILED，等人介入或走降级路径 |

降级路径在 SKILL.md frontmatter 声明：
```yaml
fallback_when_missing:
  figma-mcp: degrade-to-spec-doc
  image2-gen: degrade-to-text-desc
```

---

## 2. Step Checkpoint（checkpoint.py）

skill 执行内部有多个子步骤（如 S3 = 解析→路由→生成→自检）。记录最后成功的子步骤，崩溃后从该点恢复。

- 存储：`StepExecutionORM` 新增 `checkpoint` JSON 字段
- 恢复逻辑：scheduler 恢复时检查 checkpoint → 有则从断点续跑，无则整步重跑

---

## 3. Hard Gate Validator（gate_validator.py）

跑在 skill 输出后、状态机推进前。确定性脚本校验，不用 LLM。

- P0 失败：挂起等人决策，给两个选项：
  - "回退到上一步重新来"（rollback to step-1）
  - "本步从头再跑一次"（retry，iteration_count +1）
- P1 警告：标记 warning，继续推进

校验规则来源：
- SKILL.md frontmatter 的 `hard_gates` / `soft_gates`
- `specs/` 下的规则文件

---

## 4. Crash Recovery

scheduler 启动时扫描"上次跑到一半"的 workflow：

1. 查 status=RUNNING 但无活跃进程的 workflow
2. 有 checkpoint → 从 checkpoint 恢复
3. 无 checkpoint → 整步重跑

---

## 5. Scheduler 主循环改造

```python
async def _run_loop(self, workflow_id: str) -> None:
    while iteration < max_iterations:
        try:
            agent_result = await self._execute_with_retry(step, skill_id, context)

            gate_result = await self.gate_validator.validate(step, agent_result, skill_def)
            if not gate_result.passed:
                # 挂起等人决策（回退 or 重跑）
                step_result = {
                    "requires_human": True,
                    "decision_type": "choice",
                    "decision_prompt": f"Gate 校验失败：{gate_result.summary}",
                    "decision_options": [
                        {"value": "rollback", "label": "回退到上一步重新来"},
                        {"value": "retry", "label": "本步从头再跑一次"},
                    ],
                }
                transition = await self.fsm.advance(workflow_id, step_result)
                break

            # ... router + advance ...

        except TransientError as e:
            await self._mark_failed(workflow_id, e)
            break
        except PermanentError as e:
            await self._mark_failed(workflow_id, e)
            break
```

---

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `engine/resilience.py` | 新建 | 错误分类 + 重试策略 + 降级路由 |
| `engine/checkpoint.py` | 新建 | Step checkpoint 读写 |
| `engine/gate_validator.py` | 新建 | Hard/Soft Gate 校验框架 |
| `engine/scheduler.py` | 修改 | 主循环加 try/except + 重试 + gate + 恢复入口 |
| `engine/models.py` | 修改 | StepExecutionORM 加 checkpoint + error_info 字段 |
| `engine/state_machine.py` | 修改 | 新增 mark_failed() + retry_from_failed() |
| `engine/agent_runtime.py` | 修改 | 错误分类替代统一 _error_result |

---

## 任务拆分

| ID | 任务 | 依赖 | 优先级 |
|----|------|------|--------|
| T-CVR.1 | 错误分类模型 + 重试策略 | 无 | P0 |
| T-CVR.2 | Step Checkpoint 机制 | 无 | P0 |
| T-CVR.3 | Hard Gate Validator 框架 | 无 | P0 |
| T-CVR.4 | Scheduler 主循环改造 | T-CVR.1, T-CVR.3 | P0 |
| T-CVR.5 | 状态机扩展：mark_failed + retry | T-CVR.1 | P1 |
| T-CVR.6 | Crash Recovery：启动时恢复中断 workflow | T-CVR.2, T-CVR.5 | P1 |
| T-CVR.7 | SKILL.md frontmatter 扩展 hard_gates / fallback 字段 | T-CVR.3 | P2 |

MVP = T-CVR.1 ~ T-CVR.4，做完即有基本的约束校验恢复能力。

---

## 关键设计决策

1. **Gate 失败不自动 rollback**：转人工决策（回退 or 重跑），因为 gate 失败原因可能在当前步也可能在上游
2. **Checkpoint 不建新表**：复用 StepExecutionORM 的 JSON 字段，避免 schema 膨胀
3. **降级路径声明式**：写在 SKILL.md frontmatter 里，编排层按声明执行，不硬编码
4. **实施时机**：等 skill 齐备、编排层串联时一起落地（不先做空壳）

[Source: designworkflow session, 2026-05-15]
