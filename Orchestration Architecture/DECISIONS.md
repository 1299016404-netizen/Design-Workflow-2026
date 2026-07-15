# 已做决策日志

> 每个任务讨论结束后追加。格式固定，方便 grep。

---

## 全局约束决策（2026-05-15）

| # | 决定 | 理由 |
|---|------|------|
| D1 | 优先运行时：Codex + Claude Code | Qoder Figma MCP 兼容问题暂不处理 |
| D2 | 全员 macOS | 团队现状 |
| D3 | gbrain 作为统一基础设施 | 管理者权力可强制安装 |
| D4 | 稳定可用 > 功能丰富 | 不做 toy-grade 设计 |
| D5 | 一个任务一个讨论 | 避免批量决策导致遗漏 |
| D6 | PRD 方法论双口径 | 对外专业化（给 PM 看）/ 内部保留用户原话精度（给 AI 判断用） |
| D7 | T3.x 全部 blocked | 等团队 SKILL 仓库到位后解锁 |

---

## [T-CVR] 约束校验恢复架构方案 — 2026-05-15

- **背景**: 编排层缺少失败恢复、产出物校验、重试降级能力
- **决议**: 新增 Phase CVR（7 个任务），增加 resilience + checkpoint + gate_validator 三组件
- **关键 trade-off**:
  - Gate P0 失败不自动 rollback → 转人工决策（因为失败原因可能在当前步也可能在上游）
  - Checkpoint 不建新表 → 复用 StepExecutionORM JSON 字段（避免 schema 膨胀）
  - 降级路径声明式写在 SKILL.md frontmatter → 编排层按声明执行不硬编码
- **影响范围**: scheduler.py / state_machine.py / models.py / agent_runtime.py + 3 个新文件
- **后续动作**: 等 skill 齐备后与编排层串联时一并实施，MVP = T-CVR.1~4

---

## [SESSION] 会话命名与 checkpoint — 2026-05-15

- **背景**: 确保跨 session 上下文不丢失
- **决议**: 命名 "designworkflow" 作为召回关键词
- **后续**: 已保存到 Claude Code memory 系统，下次说 "designworkflow" 自动召回

---

## 决策模板

```markdown
## [T<编号>] <主题> — <日期>

- **背景**: 一句话
- **决议**: ...
- **关键 trade-off**: ...
- **影响范围**: 影响哪些任务/文件
- **后续动作**: ...
```
