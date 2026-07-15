# 内部案例索引

本目录存放 `figma-design-completion` 调试期样例、标准答案复盘和案例特有结论。它是内部维护和离线回归评测资产，不参与正式生成流程。

## 使用边界

- 正式生成、盲测和泛化测试不得读取本目录。
- 不得在用户可见输出中引用本目录、案例名称或标准答案。
- 本目录只用于 skill 维护、调试期差异复盘和离线回归评测。
- 可迁移规则必须沉淀到正式 reference 文件；不要让正式流程依赖案例匹配。

## 能力目录

| 目录 | 主能力 | 适用场景 |
| --- | --- | --- |
| `state-matrix/` | 状态矩阵推演 | 业务变量组合、合法组合过滤、全状态矩阵 |
| `subcomponent-variants/` | 子组件变体补全 | 卡片、权益项、rate、挑战卡等内部状态 |
| `page-composition/` | 页面组合态生成 | 模块状态放回完整页面验证承接效果 |
| `content-boundary-layout/` | 内容边界布局 | 数量、文案长度、图片缺失、展示上限 |
| `cross-module-expression/` | 跨模块表达迁移 | 一个模块的表达规则迁移到另一模块 |
| `platform-basic-states/` | 平台基础状态处理 | loading、骨架、失败、空态等明确点名状态 |
| `eval/` | 评测案例 | 只用于验收和复盘，不参与初始推演 |

## 已验证案例

| 文件 | 主分类 | 辅助能力 | 适用场景 | 禁止误用 |
| --- | --- | --- | --- | --- |
| `state-matrix/airline-member-challenge.md` | 状态矩阵推演 | 页面组合态生成 | 航司会员挑战活动承接页；页面级场景和挑战卡矩阵 | 不要只做挑战卡子组件而遗漏单挑战 / 多挑战页面级状态 |
| `subcomponent-variants/hotel-member-card.md` | 子组件变体补全 | 页面组合态生成、内容边界布局 | 酒店详情页二官会员卡模块；会员卡、权益、成长和活动行状态 | 不要手绘近似稿替代原组件；不要把权益数量变化只当作文案差异 |
| `cross-module-expression/rate-benefit-expression.md` | 跨模块表达迁移 | 状态矩阵推演 | 酒店详情页 88VIP rate 权益强化表达；跨 rate 类型迁移权益表达 | 不要直接复制来源 rate 结构破坏目标 rate 的组件语义 |
| `content-boundary-layout/content-boundary-layout.md` | 内容边界布局 | 子组件变体补全 | 酒店会员详情页推荐权益数量布局；不同数量下的布局智能适配 | 不要默认取前 N 个对象；不要机械拉宽或删除卡片 |
| `platform-basic-states/loading-skeleton.md` | 平台基础状态处理 | 无 | 酒店权益模块 Loading 骨架态；用户明确点名的平台基础状态 | 未被明确点名时不要主动生成平台基础画稿 |

## 新增案例登记模板

```md
| 文件 | 主分类 | 辅助能力 | 适用场景 | 禁止误用 |
| --- | --- | --- | --- | --- |
| `分类目录/案例文件.md` | 主要推演能力 | 最多 1-2 个辅助能力 | 该案例最适合触发的需求 | 不应套用该案例的场景 |
```

## 沉淀规则

- 案例特有输入、人工目标、自动稿版本问题和最终验收结论写入对应能力目录下的案例文件。
- 可迁移的通用规则应进入 `decision-framework.md`、`scenario-decomposition.md`、`capability-routing.md`、`figma-generation-rules.md`、`failure-patterns.md`、`quality-checklist.md` 或领域规则文件。
- 新增案例后必须同步更新本索引。
