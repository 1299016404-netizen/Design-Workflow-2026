# Phase 7 — 协作 / 部署 / 运维

> 从单人开发走向团队协作的基础设施。
> 关联章节：architecture-review §7.5 ~ §7.12

---

## T7.1 Spec 版本治理

**状态**: 未开始  
**优先级**: P1  
**关联痛点**: H12, H32  
**关联章节**: architecture-review §7.3, §7.8

### 问题

colors.md 改了，活动 session 不知道；改了谁通知？

### 改法

- 每个 spec 文件有 semver 版本号
- manifest.yml 记录所有 spec 的当前版本
- 版本变更时通知机制（见 T7.8 定时同步）
- 活动 session 锁定启动时的 spec 版本，显式选择是否升级

### 交付物

- [ ] 版本号管理机制
- [ ] manifest.yml 自动更新
- [ ] 变更通知协议
- [ ] session 版本锁定逻辑

---

## T7.2 Skill 更新分发机制

**状态**: 未开始  
**优先级**: P2  
**关联痛点**: H33, H34  
**关联章节**: architecture-review §7.8

### 问题

SKILL.md 改了，团队怎么 pull？两个 dev 同时改 s3 怎么 merge？

### 改法

- skill 通过 git 分发（主仓库 + PR 流程）
- 版本锁：每个环境锁定 skill 版本，显式升级
- 并发修改走标准 git merge（SKILL.md 是文本，可 diff）

### 交付物

- [ ] skill 版本锁机制
- [ ] 升级命令（`workflow skill upgrade <id>`）
- [ ] 冲突解决指南

---

## T7.3 环境引导扩展

**状态**: 未开始  
**优先级**: P1  
**关联痛点**: H36  
**关联章节**: architecture-review §7.8

### 问题

`setup_check.py` 覆盖范围不全。

### 改法

setup_check.py 必须覆盖：
- [ ] MCP 服务可达性（figma-mcp、其他）
- [ ] LLM API key 有效性
- [ ] specs/ 完整性（所有声明的 spec 文件存在）
- [ ] memory store 可用性
- [ ] 依赖工具版本（Python、Node 等）
- [ ] gbrain 可用性（如果配置了）
- [ ] starter pack 是否已导入

### 交付物

- [ ] setup_check.py 完整重写
- [ ] 各项检查的 pass/fail 报告
- [ ] 自动修复建议

---

## T7.4 升级与迁移路径

**状态**: 未开始  
**优先级**: P2  
**关联痛点**: H37  

### 问题

v2026-05 → v2026-06，什么迁移？

### 改法

- 每个大版本附带 migration 脚本
- migration 检查：数据库 schema、spec 格式、SKILL.md 格式、记忆格式
- 支持 dry-run 模式

### 交付物

- [ ] 迁移框架
- [ ] 版本检测逻辑
- [ ] dry-run 模式

---

## T7.5 团队级 Dashboard

**状态**: 未开始  
**优先级**: P2  
**关联痛点**: H24, H26  
**关联章节**: architecture-review §7.6

### 问题

trace.jsonl 本地，无聚合。

### 改法

聚合展示：
- 自动通过率（per skill）
- 人工 override 率
- per-skill 平均时长
- token 消耗趋势
- 常见失败模式

### 交付物

- [ ] 数据聚合脚本
- [ ] 简易 web dashboard（或 CLI 报告）
- [ ] 团队级数据收集协议

---

## T7.6 健康检查

**状态**: 未开始  
**优先级**: P1  
**关联痛点**: H25  

### 问题

LLM 通吗？GBrain 通吗？MCP 通吗？

### 改法

`workflow health` 命令：
- LLM API 连通性 + 模型可用性
- GBrain 连通性（如果配置了）
- MCP 服务连通性（逐个检查）
- 磁盘空间
- 数据库完整性

### 交付物

- [ ] health check 命令
- [ ] 各项检查的实现
- [ ] 输出格式（JSON + 人类可读）

---

## T7.7 决策 UI 通用化 + 异步决策 + 通知

**状态**: 未开始  
**优先级**: P1  
**关联痛点**: H18, H19, H20, H21  
**关联章节**: architecture-review §7.5

### 问题

- `decision_options` 只是字符串列表，无视觉对比
- designer 下班了第二天能继续吗？
- 需要多人审批的流程？
- 需要人介入时怎么通知？

### 改法

- 统一 `HumanDecisionRequest` schema（支持 choice/confirm/freeform/visual-compare）
- 异步决策：挂起 → 持久化 → 下次启动时继续
- 多人 review：配置审批链
- 通知渠道：钉钉 / Slack / 终端通知

### 交付物

- [ ] HumanDecisionRequest schema
- [ ] 异步决策持久化
- [ ] 通知插件接口
- [ ] 多人审批逻辑

---

## T7.8 定时同步：设计规范 + Figma 模块标注 + 业务语境

**状态**: 未开始  
**优先级**: P1  
**关联痛点**: H48, H49, H50  
**关联章节**: architecture-review §7.12

### 问题

设计规范不是一次性写完就锁死的。specs/ 不能自动跟上 → 规范注入在传播过期约束。

### 同步机制（6 步）

1. **Figma 全树扫描**：列出 published components → diff → 提取 annotation
2. **设计规范源扫描**：语雀 / Figma 内嵌规范页 / git 仓库
3. **业务语境提取**：从 component_id 命名反向解析业务状态
4. **生成提议**：写到 `specs/_proposals/<date>/`
5. **团队 review**：PR 形式，接受/拒绝/推迟
6. **通知活动 session**：spec 变更后通知正在跑的 session

### 待决策

1. 触发节奏：每周 / 每日 / 按需手动？
2. 扫描范围：全 Figma 文件 vs 仅"设计规范库"？
3. 接受策略：人工审 vs 简单变更自动接受？
4. 冲突处理：人手改了 specs/ 同时又来了自动提议？
5. session 隔离：活动 session 锁版本？何时通知？何时强制升级？

### 交付物

- [ ] 同步 daemon 框架
- [ ] Figma API 扫描脚本
- [ ] 提议生成逻辑
- [ ] review 流程
- [ ] 通知机制
