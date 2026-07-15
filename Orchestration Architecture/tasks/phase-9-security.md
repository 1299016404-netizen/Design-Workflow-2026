# Phase 9 — 安全 / 合规

> 关联章节：architecture-review §7.9

---

## T9.1 Secret 管理

**状态**: 未开始 | **优先级**: P1 | **关联痛点**: H3

**问题**: Figma token / LLM key 散在 .env，团队分发时易泄漏。

**改法**: 统一 secret store（macOS Keychain / 环境变量 / vault），.env 只存非敏感配置。setup_check 验证 secret 可达性但不打印值。

**交付物**: secret 管理模块 + 迁移指南 + setup_check 集成

---

## T9.2 敏感数据脱敏

**状态**: 未开始 | **优先级**: P2 | **关联痛点**: H38

**问题**: PRD 含机密数字，写记忆前是否脱敏？

**改法**: 记忆写入前过脱敏 pipeline（正则 + 命名实体识别），可配置白名单。

**交付物**: 脱敏 pipeline + 配置机制 + 白名单管理

---

## T9.3 审计 Immutable + 数据保留策略

**状态**: 未开始 | **优先级**: P2 | **关联痛点**: H39, H17, H40

**问题**: trace 文件可被改（无 hash chain）；数据留多久？怎么删除特定项目记忆？

**改法**:
- trace 写入后计算 hash，追加到 hash chain（类 git）
- 数据保留策略：配置 per-project retention period
- GDPR-like 删除：`workflow forget --project <id>` 级联删除

**交付物**: hash chain 机制 + retention 配置 + forget 命令
