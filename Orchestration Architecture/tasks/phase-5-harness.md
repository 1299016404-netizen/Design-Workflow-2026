# Phase 5 — Harness 级运行时

> 参考 Claude Code、Cursor 等成熟 harness 架构，补齐生产级运行时能力。
> 关联章节：architecture-review §7

---

## T5.1 工具权限/沙箱机制

**状态**: 未开始  
**优先级**: P1  
**关联痛点**: H1  
**关联章节**: architecture-review §7.1

### 问题

skill 没声明能用什么工具，多人开发时 skill 行为不可预测。

### 改法

- 每个 skill 在 frontmatter 声明 `required_tools` / `optional_tools`
- 编排层在调用 skill 前验证工具可用性
- 未声明的工具调用 → 拒绝并报错
- 沙箱级别可配置（strict / permissive）

### 交付物

- [ ] 工具权限验证模块
- [ ] 沙箱配置机制
- [ ] 违规行为的处理策略（拒绝 / 警告 / 审计）

---

## T5.2 流式/进度/中断/取消

**状态**: 未开始  
**优先级**: P1  
**关联痛点**: H4, H5  
**关联章节**: architecture-review §7.2

### 问题

skill 跑 10 分钟无进度提示；启动后无法 clean stop。

### 改法

- 每个 skill 声明 `progress_stages`
- 运行时通过回调上报进度
- 支持 graceful cancel（当前步完成后停止）和 force cancel
- 流式输出中间结果

### 交付物

- [ ] 进度上报接口
- [ ] 中断/取消协议
- [ ] CLI/API 的进度展示

---

## T5.3 幂等性与缓存键

**状态**: 未开始  
**优先级**: P2  
**关联痛点**: H6  
**关联章节**: architecture-review §7.2

### 问题

同输入两次跑可能不同输出，无 cache key。

### 改法

- 每次 skill 调用计算 cache key（input hash + spec version + skill version）
- 相同 key 直接返回缓存结果（可配置）
- 缓存有 TTL

### 交付物

- [ ] cache key 计算逻辑
- [ ] 缓存存储与过期
- [ ] 强制刷新机制

---

## T5.4 重试/退避/降级

**状态**: 未开始  
**优先级**: P0  
**关联痛点**: H2, H7  
**关联章节**: architecture-review §7.2, CVR 方案

### 问题

失败直接抛异常；MCP 挂了整个 session 阻塞。

### 改法

- TRANSIENT 错误：指数退避重试（1s→2s→4s），最多 3 次
- PERMANENT 错误：标记 FAILED，走降级路径
- 降级路径在 SKILL.md frontmatter 声明

### 交付物

- [ ] 重试策略实现（见 CVR T-CVR.1）
- [ ] 降级路由逻辑
- [ ] 与 scheduler 主循环的集成

---

## T5.5 成本/Token 预算

**状态**: 未开始  
**优先级**: P2  
**关联痛点**: H8  
**关联章节**: architecture-review §7.2

### 问题

无 per-skill / per-session 预算控制。

### 改法

- 配置：per-skill token 上限 + per-session 总预算
- 接近上限时警告
- 超出时暂停，等人决策（继续 / 中止）

### 交付物

- [ ] 预算配置 schema
- [ ] token 计数与追踪
- [ ] 超限处理逻辑

---

## T5.6 错误分类与恢复

**状态**: 未开始  
**优先级**: P0  
**关联痛点**: H9  
**关联章节**: architecture-review §7.2, CVR 方案

### 问题

全是 `Exception`，下游无法分别处理。

### 改法

错误分类体系：
```
BaseWorkflowError
├── TransientError (可重试)
│   ├── ApiTimeoutError
│   ├── RateLimitError
│   └── NetworkError
├── PermanentError (需人工介入)
│   ├── SchemaValidationError
│   ├── SkillNotFoundError
│   └── BusinessLogicError
└── GateError (校验失败)
    ├── HardGateError (P0)
    └── SoftGateError (P1)
```

### 交付物

- [ ] 错误分类体系（见 CVR T-CVR.1）
- [ ] 各类错误的默认处理策略
- [ ] 错误上下文保留（用于后续分析）

---

## T5.7 Skill 版本兼容

**状态**: 未开始  
**优先级**: P2  
**关联痛点**: H10  
**关联章节**: architecture-review §7.3

### 问题

s1 v2 输出，s2 v1 能消费吗？无版本兼容检查。

### 改法

- 每个 skill 声明 input_contract 的 schema 版本
- 编排层在串联时检查上游输出版本 vs 下游期望版本
- 不兼容 → fail-fast + 建议升级路径

### 交付物

- [ ] 版本兼容检查逻辑
- [ ] 不兼容时的提示与建议
- [ ] 版本迁移工具（schema 转换器）
