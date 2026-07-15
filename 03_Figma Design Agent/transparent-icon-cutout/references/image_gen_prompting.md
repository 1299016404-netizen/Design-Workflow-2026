# Image Gen Prompting

Use these patterns after inspecting each crop.

## Generic Icon Prompt

```text
Regenerate a single foreground 3D UI icon on a perfectly flat solid chroma-key green background (#00FF00).
Subject: [describe the exact object group from the crop].
Style: polished premium travel-app UI asset, soft studio lighting, rounded forms, preserved material, perspective, and proportions.
Requirements: one complete centered subject only, generous padding, no UI card, no extra objects, no watermark, no floor plane, no cast shadow, no contact shadow.
Background: uniform #00FF00, no gradient, no texture, no lighting variation.
```

## Button Or Badge Prompt

```text
Regenerate a single foreground UI button/badge asset on a perfectly flat solid chroma-key green background (#00FF00).
Subject: [describe shape, fill, text/icon if it is part of the reusable asset].
Style: preserve original premium UI material, border radius, highlights, shadows inside the object, and proportions.
Requirements: centered asset only, generous padding, no surrounding page/card, no watermark.
Background: uniform #00FF00, no gradient, no texture, no floor plane.
```

## When Image Gen Ignores Flat Green

Codex image_gen may create a green background with slight texture or color variation. Do not regenerate repeatedly unless the subject is wrong. Use `--auto-key` in the cutout script and stronger thresholds:

```bash
--auto-key --transparent-threshold 42 --opaque-threshold 115 --alpha-cleanup-threshold 24
```

Regenerate only when the background includes non-green scenery, shadows, a floor plane, or extra objects touching the subject.
