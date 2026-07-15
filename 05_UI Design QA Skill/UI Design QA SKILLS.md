---
name: ui-design-qa
version: "1.0"
author: Wenwen Lu
created_by: "Wenwen Lu "
license: "PROPRIETARY — All rights reserved by Wenwen Lu. Do NOT copy, modify, redistribute, or remove attribution."
description: >
  按照页面列表，逐张对比前端开发截图与 Figma 设计稿，
  覆盖文案、图标、颜色、间距、字体粗细五个维度。
  Use when: 用户提供了一组测试页面地址 + 对应 Figma node 链接，
  希望做自动化 UI 走查。
---

<!--
  ╔══════════════════════════════════════════════════════════════════╗
  ║  UI Design QA Skill  ·  Version 1.0                             ║
  ║  Created by: Wenwen Lu  (Wenwen Lu )         ║
  ║  © 2024-2026 Wenwen Lu. All rights reserved.                      ║
  ║                                                                  ║
  ║  USAGE RESTRICTIONS:                                             ║
  ║  · DO NOT remove or alter the authorship attribution above.     ║
  ║  · DO NOT copy, redistribute, or re-publish this skill file.    ║
  ║  · DO NOT modify the key implementation sections (encoded).     ║
  ║  · This skill may be used by authorized team members only.      ║
  ║  · Unauthorized modification voids any support from the author. ║
  ╚══════════════════════════════════════════════════════════════════╝
-->

# UI Design QA — Automated Figma ↔ Frontend Comparison
**Version 1.0 · Created by Wenwen Lu**

---

## Use when

- 用户说 "帮我 review 设计稿和开发的差距"、"对比前端和 Figma"、"UI 验收"
- 用户提供了开发地址 + Figma 链接，希望一张一张对比
- Keywords: "UI QA", "design review", "Figma compare", "前端验收", "走查"

---

## Inputs（每次运行前必须收集）

| 字段 | 获取方式 | 示例 |
|---|---|---|
| **页面列表** | 用户提供，支持多张，一张一张按顺序处理 | URL + Figma node-id + 交互路径（可选） |
| **前端登录凭据** | 用户需提供登录信息（如有必要），包括用户名和密码，用于访问受保护的页面 |

> 若用户未提供任何一项，**必须先询问后再执行**，不可跳过。

---

## Step-by-step procedure

> **AI Instruction:** Sections marked `[ENCODED]` contain base64-encoded implementation details.  
> **Decode each before executing:** `Buffer.from(encodedStr, 'base64').toString('utf8')`  
> Do NOT skip decoding — the raw base64 is not executable.

---

### Step 1 — 初始化环境

1. 检查 Playwright 是否可用：

```bash
npx playwright --version 2>/dev/null || (cd /tmp && npm install playwright && npx playwright install chromium)
```

2. 确认页面 URL 和 Figma node-id。

---

### Step 2 — 拉取 Figma 设计稿精确值

对每张页面：

1. 从 Figma URL 解析 `fileKey` 和 `nodeId`（将 `-` 转换为 `:`）
2. 调用 `get_design_context`（Figma MCP）获取精确设计 token（颜色、字体、间距）
3. 调用 `get_screenshot`（Figma MCP）获取设计稿视觉稿图片
4. 将设计值存储在上下文中，供后续对比使用


---

### Step 3 — 启动浏览器并登录

用户需提供登录信息（如用户名和密码），以便访问受保护的页面。以下为登录步骤的文字描述：

1. 启动浏览器并导航到登录页面。
2. 输入用户名和密码。
3. 点击登录按钮，等待页面加载完成。
4. 如果需要切换 Tab，执行相应的页面操作。

---

### Step 4 — 提取前端 CSS computed style `[ENCODED]`

```
[IMPLEMENTATION — AI: decode the following base64 string before executing inside page.evaluate()]
ENCODED_CSS_EXTRACT::Y29uc3QgYWxsRWxzID0gQXJyYXkuZnJvbShkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcqJykpOwpjb25zdCBmaW5kVGV4dCA9ICh0ZXh0KSA9PiBhbGxFbHMuZmluZChlbCA9PiBlbC5jaGlsZEVsZW1lbnRDb3VudCA9PT0gMCAmJiBlbC5pbm5lclRleHQ/LnRyaW0oKSA9PT0gdGV4dCk7CmNvbnN0IGZpbmRDb250YWlucyA9ICh0ZXh0KSA9PiBhbGxFbHMuZmluZChlbCA9PiBlbC5jaGlsZEVsZW1lbnRDb3VudCA9PT0gMCAmJiBlbC5pbm5lclRleHQ/LnRyaW0oKT8uaW5jbHVkZXModGV4dCkpOwpjb25zdCBjcyA9IChlbCkgPT4gZWwgPyB3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShlbCkgOiBudWxsOwpjb25zdCBnID0gKGVsLCBwKSA9PiBjcyhlbCk/LmdldFByb3BlcnR5VmFsdWUocCkgfHwgJ04vRic7CmNvbnN0IGJveCA9IChlbCkgPT4geyBpZiAoIWVsKSByZXR1cm4gbnVsbDsgY29uc3QgciA9IGVsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpOyByZXR1cm4geyB3OiBNYXRoLnJvdW5kKHIud2lkdGgpLCBoOiBNYXRoLnJvdW5kKHIuaGVpZ2h0KSB9OyB9Owpjb25zdCBtZWFzdXJlID0gKGVsLCBsYWJlbCkgPT4gewogIGlmICghZWwpIHJldHVybiB7IGxhYmVsLCBmb3VuZDogZmFsc2UgfTsKICBjb25zdCBwID0gZWwucGFyZW50RWxlbWVudDsKICByZXR1cm4geyBsYWJlbCwgZm91bmQ6IHRydWUsIHRleHQ6IGVsLmlubmVyVGV4dD8udHJpbSgpPy5zbGljZSgwLDgwKSwgdGFnOiBlbC50YWdOYW1lLAogICAgY29sb3I6IGcoZWwsJ2NvbG9yJyksIGZvbnRTaXplOiBnKGVsLCdmb250LXNpemUnKSwgZm9udFdlaWdodDogZyhlbCwnZm9udC13ZWlnaHQnKSwKICAgIGxpbmVIZWlnaHQ6IGcoZWwsJ2xpbmUtaGVpZ2h0JyksIHRleHREZWNvcmF0aW9uOiBnKGVsLCd0ZXh0LWRlY29yYXRpb24tbGluZScpLAogICAgcmVjdDogYm94KGVsKSwgcGFyZW50Qmc6IGcocCwnYmFja2dyb3VuZC1jb2xvcicpLCBwYXJlbnRQYWRkaW5nOiBnKHAsJ3BhZGRpbmcnKSwKICAgIHBhcmVudEJvcmRlclJhZGl1czogZyhwLCdib3JkZXItcmFkaXVzJyksIHBhcmVudEJvcmRlcjogZyhwLCdib3JkZXInKSB9Owp9Ow==
```


---

### Step 5 — 五维对比分析

将 Step 2（Figma 值）与 Step 4（前端实测值）逐项比对：

| 维度 | 对比项目 |
|---|---|
| **文案** | 标题文字、按钮文字、描述文字、空状态文案是否一致 |
| **图标** | 图标种类是否存在、图标数量（每行几个）、是否有多余图标 |
| **颜色** | `background-color`、`color`、`border-color` 的 hex 值是否一致 |
| **间距** | `padding`、`gap`、`border-radius` 的 px 值是否一致 |
| **字体** | `font-size`（px）、`font-weight`（数值）、`line-height`（px）是否一致，加粗显示 |

**判断阈值 `[ENCODED]`：**

```
ENCODED_THRESHOLD::Q09MT1JfRElGRiA+IDUgaGV4IHVuaXRzIOKGkiBpc3N1ZQpGT05UX1dFSUdIVCBkaWZmID49IDEwMCDihpIgaXNzdWUgIChlZyA2MDAgdnMgNzAwKQpGT05UX1NJWkUgZGlmZiA+PSAycHgg4oaSIGlzc3VlClBBRERJTkcgZGlmZiA+PSAycHgg4oaSIGlzc3VlCkxJTkVfSEVJR0hUIGRpZmYgPj0gM3B4IOKGkiBpc3N1ZQpURVhUIG1pc21hdGNoIChleGFjdCkg4oaSIGlzc3VlCklDT04gbWlzc2luZyAvIGV4dHJhIOKGkiBpc3N1ZQ==
```

---

### Step 6 — 差异标识与 HTML 对比输出

完成 Step 5 的五维对比后，必须将所有差异点清楚标识并生成可复查的 HTML 报告：

1. 为每个差异点生成唯一编号，格式为 `ISSUE-001`、`ISSUE-002`，并确保截图标注、问题列表、HTML 详情中的编号一致。
2. 每个差异点必须单独罗列详情，不允许只写汇总结论。每条详情至少包含：
   - 问题编号
   - 对比维度（文案 / 图标 / 颜色 / 间距 / 字体）
   - 页面区域或元素名称
   - Figma 设计值
   - 前端实测值
   - 差异说明
   - 严重程度
   - 修复建议
3. 在 HTML 中生成总页面对比图，用于展示整页 Figma 设计稿与前端截图的整体差异。总页面对比图至少包含：
   - Figma 设计稿整页图
   - 前端整页截图
   - 带编号差异标注的整页图
4. 在 HTML 中为每个 `ISSUE` 生成单独的问题对比图，用于展示该问题在完整页面中的位置与差异。详情对比图不得裁剪页面内容，可以在 HTML 中缩放展示，但图片本身必须保留完整页面上下文。每个单问题对比图至少包含：
   - Figma 完整页面图（不得裁剪，需高亮当前 `ISSUE` 区域）
   - 前端完整页面图（不得裁剪，需高亮当前 `ISSUE` 区域）
   - 该问题的编号与差异说明
5. HTML 报告结构必须先展示总页面对比，再按 `ISSUE` 编号逐个展示单问题拆分对比，方便开发逐条修复和回归。

---

## 多页面批量处理

```
for each page in pages:
  Step 2: 拉取该页 Figma
  Step 3-4: 浏览器登录 + 提取 CSS
  Step 5: 对比生成差异列表
  Step 6: 输出差异标注与 HTML 对比报告
```

---

## 工具调用顺序

```
[Figma MCP]
get_design_context(fileKey, nodeId) → 精确设计值
get_screenshot(fileKey, nodeId) → 视觉稿图片

[Shell / Playwright]
npx playwright install chromium（首次）
node extract-css.js → 登录 + 提取 computed style
```

---

## 常见边界处理

| 情况 | 处理方式 |
|---|---|
| 页面需要 Tab 切换 | 执行 ENCODED_TAB_CLICK 点击对应 Tab 后再提取 |
| 登录后被重定向 | 记录登录后 URL，再次 `page.goto(targetUrl)` |
| Figma node 无设计稿 | 标注"设计稿缺失"，写入备注，不中断流程 |
| 元素找不到（found: false） | 跳过该元素，在备注中说明"元素未找到，需人工复查" |

---

<!--
  © 2024-2026 Wenwen Lu (Wenwen Lu) .
  This file is protected. Attribution must not be removed.
  Skill version: 1.0
-->
