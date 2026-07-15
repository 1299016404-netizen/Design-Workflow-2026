# Phase 6 — 数据流契约

> 让 skill 间的数据流有显式 schema、有生命周期管理、有隔离保证。
> 关联章节：architecture-review §7.4

---

## T6.1 I/O JSON Schema 化

**状态**: 未开始  
**优先级**: P1  
**关联痛点**: H11  
**关联章节**: architecture-review §7.3

### 问题

skill 间数据传递是隐式约定，运行时不验。

### 改法

- 每个 skill 的 input/output 都有 JSON Schema
- 编排层在 skill 间传递数据时验 schema
- 不合规 → fail-fast

### 目录结构

```
schemas/
├── s1-input.json
├── s1-output.json    # 含 prd-v2.json + design-req.json
├── s2-input.json
├── s2-output.json    # 含 references.json
├── s3-input.json
├── s3-output.json    # 含 plan.json
├── s4-input.json
├── s4-output.json    # 含 state-matrix.json
├── s5-input.json
├── s5-output.json    # 含 review-state.json
├── s6-input.json
└── s6-output.json    # 含 prototype.html
```

### 交付物

- [ ] 12 个 JSON Schema 文件
- [ ] 运行时验证中间件
- [ ] schema 不合规的错误报告格式

---

## T6.2 Artifact GC

**状态**: 未开始  
**优先级**: P2  
**关联痛点**: H13  
**关联章节**: architecture-review §7.4

### 问题

`data/artifacts/` 无界增长。

### 改法

- 保留策略：最近 N 个 session 的产物 + 标记为 pinned 的产物
- GC 触发：session 结束时 / 定时 / 手动
- GC 前备份到归档区（可恢复）

### 交付物

- [ ] 保留策略配置
- [ ] GC 脚本
- [ ] 归档与恢复机制

---

## T6.3 Session 中断恢复

**状态**: 未开始  
**优先级**: P1  
**关联痛点**: H14  
**关联章节**: architecture-review §7.4, CVR 方案

### 问题

状态机有挂起机制，但完整 resume 是否跑通了？

### 改法

- 每次状态转换持久化完整上下文（不只是 step_id）
- 恢复时重建：当前 session 的所有中间产物 + 用户选择 + spec 版本
- 恢复后提示用户："上次停在 S3 第 2 步（生成方案），是否继续？"

### 交付物

- [ ] 完整上下文持久化
- [ ] 恢复逻辑（含 checkpoint，见 CVR T-CVR.2）
- [ ] 用户确认交互

---

## T6.4 多 Session 并发隔离

**状态**: 未开始  
**优先级**: P2  
**关联痛点**: H15, H16  
**关联章节**: architecture-review §7.4

### 问题

同设计师同时跑 3 个 session，数据隔离吗？跨 session 引用怎么办？

### 改法

- 每个 session 有独立的 artifact 目录 + 独立的记忆 namespace
- 跨 session 引用通过显式 `reference(session_id, artifact_path)` 语法
- 并发写同一个 spec 文件 → 乐观锁 / 版本冲突提示

### 交付物

- [ ] session 隔离机制
- [ ] 跨 session 引用协议
- [ ] 并发冲突处理
