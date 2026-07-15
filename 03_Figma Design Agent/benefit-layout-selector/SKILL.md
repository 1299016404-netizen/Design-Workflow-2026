---
name: benefit-layout-selector
description: Select the three best visual layout schemes from bundled aesthetic reference rules and images. Use when a user provides a marketing, product, landing page, campaign, or design module requirement and asks for layout方案,利益点排版,美学参考,三个方案,对应图片,or a conversational recommendation based on benefit-point count and hierarchy.
---

# Benefit Layout Selector

Use this skill to turn a requirement into the three most suitable layout options from the bundled aesthetic reference set.

## Workflow

1. Read the user's requirement and identify the benefit points.
2. Count the benefit points: 1, 2, 3, 4, or 5.
3. Decide the relationship:
   - Equal priority
   - One core benefit plus auxiliary benefits
   - A single visual container that groups multiple benefits
   - Lightweight screen-effect presentation
4. Read `references/layout-rules.md` when exact layout selection is needed.
5. Output exactly three recommended schemes in conversational Chinese.

## Output Format

Use this shape unless the user asks for another format:

```text
1.
[方案名称：用一句话描述利益点关系]
[适合场景：说明为什么适合当前需求]
![对应图片](/absolute/path/to/skill/assets/aesthetic-reference/[文件名].png)

2.
...

3.
...
```

Always embed the corresponding reference image directly with Markdown image syntax immediately after the scheme explanation. Use the absolute filesystem path to the bundled image so the Codex desktop app can render it. Do not output the label text `对应图片` or only the image filename unless the user explicitly asks for filenames only.

## Selection Rules

- If there is one strongest selling point and the rest are support, prioritize a `主次` layout.
- If all benefits are equally important, prioritize equal `上下布局`, `左右布局`, or `四宫格布局`.
- If the module should feel like one integrated product scene or benefit package, prioritize `包含布局`.
- If page height is limited or the module should feel light and product-screen-like, prioritize `屏效布局`.
- Prefer `上下布局` for reading-heavy or mobile-friendly modules.
- Prefer `左右布局` for desktop modules, feature cards, and open horizontal compositions.

## Assets

Reference images are bundled in:

`assets/aesthetic-reference/`

When answering, name the matching image file. If the environment supports local media links and the user asks to see the image, include the absolute image path as Markdown image syntax.
When the user asks for方案 recommendations, embed each matching image by default, without adding a separate `对应图片` label.
