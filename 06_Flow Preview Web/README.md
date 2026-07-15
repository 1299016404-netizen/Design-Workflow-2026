# Flow Preview / 交互流程预览

`04_Flow Preview` 是 Design Workflow 的第四步独立模块，用于把 Figma 中的页面画板与状态画板组织成可交互的手机流程预览。

当前仓库内置的是干净模板：保留页面结构、左侧树、右侧状态卡、手机预览框、上滑固定头部、首页底部固定导航、iOS 指示条、主题切换和响应式交互；真实 Figma 页面截图与状态截图已替换为空占位图，等待运行时同步填充。

## 运行

```bash
npm install
npm run dev
```

访问：

```text
http://localhost:3000/interaction-preview
```

根路径 `/` 会自动跳转到 `/interaction-preview`。

## 从 Figma 填充切图

1. 打开 Figma，并确保 Dev Mode MCP 服务可用：`http://127.0.0.1:3845/mcp`
2. 在模块目录运行：

```bash
npm run sync:figma
```

脚本会读取 Figma 节点，导出页面切图与状态切图，写入：

- `public/images/interaction-preview/figma-html/pages/`
- `public/images/interaction-preview/figma-html/states/`
- `data/interactionPreviewFigma.generated.ts`

同步失败时不会覆盖正式资源。

## 主要文件

- `app/interaction-preview/page.tsx`：页面入口
- `components/layout/InteractionPreviewPlatform.tsx`：核心三栏预览与交互
- `data/interactionPreviewFigma.generated.ts`：页面、状态、绑定关系 manifest
- `scripts/sync-interaction-preview-figma-assets.mjs`：Figma 资源同步脚本
- `public/images/interaction-preview/`：图标、固定头部、底部导航和占位切图资源

## 注意事项

- 初始 PNG 是透明占位，不包含任何固定 Figma 截图内容。
- 不依赖本机临时路径或其它步骤目录。
- 上传到 `Design-Workflow-2026` 时，将整个 `04_Flow Preview` 文件夹放在仓库根目录，与 `01_PRD to DRD`、`02_figma-design-agent设计生成`、`03_design-state-completion-skill` 同级。
