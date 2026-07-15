---
name: transparent-icon-cutout
description: Extract reusable transparent UI image assets from screenshots or product artwork. Use when the user asks to identify/crop icons, illustrations, card visuals, benefits artwork, buttons, or other reusable visual elements from an image; redraw each crop with Codex image_gen on a chroma-key background; and export transparent PNG cutouts using the bundled transparent_asset_pipeline.py script.
---

# Transparent Icon Cutout

## Workflow

Use this skill to turn a source UI image into reusable transparent PNG assets.

This skill is for reusable non-photographic UI visual elements: icons, illustrations, card artwork, benefit graphics, decorative symbols, and similar generated or designed assets.

Do not cut out real photos. Real photography, product photos, hotel or attraction photos, map screenshots, user avatars, and other true image content should remain as normal image assets. They should not be redrawn with image_gen, placed on chroma-key backgrounds, or exported as transparent cutouts unless the user explicitly asks to isolate a foreground subject from that photo.

The required sequence is:

1. Detect or crop reusable visual elements with `scripts/transparent_asset_pipeline.py`.
2. Inspect each crop and its generated `*-image-gen-prompt.txt`.
3. Call Codex `image_gen` once per crop to redraw the subject on a green/chroma background.
4. Locate the generated PNG files and run the bundled script with `--source` to remove the chroma background.
5. Validate output previews and alpha reports before responding.

Do not stop after crop/prompt generation unless the user explicitly asks for only that stage.

## Script

Use the bundled script in this skill:

```bash
python3 /Users/tianzhongyi/.codex/skills/transparent-icon-cutout/scripts/transparent_asset_pipeline.py --help
```

If this skill is copied elsewhere, use the `scripts/transparent_asset_pipeline.py` next to this `SKILL.md`.

The script requires Pillow:

```bash
python3 -m pip install pillow
```

Install only if importing `PIL` fails.

## Step 1: Detect Crops

Before detecting crops, classify the visible assets:

- Crop reusable UI artwork, such as illustrations, decorative objects, benefit icons, card visuals, or designed symbols.
- Skip real photos, product photos, hotel or attraction images, map screenshots, user avatars, and other true image content.
- If a source screenshot mixes UI artwork and real photos, crop only the reusable UI artwork and leave real photos out of the transparent cutout pipeline.

For card-style UI where each card has an icon/illustration above text, prefer:

```bash
python3 /Users/tianzhongyi/.codex/skills/transparent-icon-cutout/scripts/transparent_asset_pipeline.py \
  --input /path/to/source.png \
  --detect-card-icons \
  --out-dir /path/to/output \
  --name source
```

For general screenshots with many independent visual elements, use:

```bash
python3 /Users/tianzhongyi/.codex/skills/transparent-icon-cutout/scripts/transparent_asset_pipeline.py \
  --input /path/to/source.png \
  --auto-detect-assets \
  --out-dir /path/to/output \
  --name source
```

If automatic detection misses an obvious element, use manual bbox:

```bash
python3 /Users/tianzhongyi/.codex/skills/transparent-icon-cutout/scripts/transparent_asset_pipeline.py \
  --input /path/to/source.png \
  --bbox x,y,width,height \
  --out-dir /path/to/output/item_01 \
  --name item_01 \
  --subject-hint "short subject description"
```

Always inspect the overlay and crops with `view_image` or another image viewer before generating.

## Step 2: Redraw With Codex Image Gen

For each crop:

1. Open the crop image visually.
2. Read its `*-image-gen-prompt.txt`.
3. Call Codex `image_gen` with a prompt that combines the prompt file plus a precise visual description of the crop.

Important: in this Codex environment, `image_gen` may not accept a local file path as an image input. If no image input parameter exists, inspect the crop yourself and describe it precisely in the prompt. Ask for:

- one centered foreground object or icon group only
- perfectly flat chroma-key green background
- no card, no text outside the subject, no watermark, no floor plane
- generous padding around the subject
- preserved material, perspective, lighting, and proportions

Use `#00FF00` as the requested background, but expect Codex image generation may output a slightly varied green. The cutout step should usually use `--auto-key`.

See [references/image_gen_prompting.md](references/image_gen_prompting.md) for compact prompt templates and failure handling.

## Step 3: Locate Generated Images

After each `image_gen` call, note the generated image path from the runtime message. If needed, list newest generated files:

```bash
find /Users/tianzhongyi/.codex/generated_images -type f -name '*.png' -print0 | xargs -0 ls -lt | head
```

Never delete the original files under `/Users/tianzhongyi/.codex/generated_images`; copy or process them into the requested output folder.

## Step 4: Export Transparent PNGs

Run the bundled script once per generated green-screen image:

```bash
python3 /Users/tianzhongyi/.codex/skills/transparent-icon-cutout/scripts/transparent_asset_pipeline.py \
  --source /path/to/generated-green-image.png \
  --auto-key \
  --out-dir /path/to/output/icon_01 \
  --name icon_01 \
  --transparent-threshold 42 \
  --opaque-threshold 115 \
  --edge-contract 1 \
  --edge-feather 0 \
  --alpha-cleanup-threshold 24 \
  --trim-padding 40
```

Use `--no-auto-key --key-color '#00ff00'` only when the generated background is truly flat pure green. Prefer `--auto-key` for Codex image_gen outputs.

The important outputs are:

- `*-transparent.png`
- `*-transparent-trimmed.png`
- `*-transparent-preview.png`

## Validation

Inspect every `*-transparent-preview.png`.

Accept the output only when:

- JSON validation `mode` is `RGBA`
- `corners_alpha` is `[0, 0, 0, 0]`
- `transparent_pixels` is greater than `0`
- preview does not show a visible green/gray rectangle around the subject
- crop has not removed meaningful subject edges

If corners are not transparent, rerun with `--auto-key`, increase `--transparent-threshold`, and keep `--opaque-threshold` larger than the transparent threshold.

If edges are too jagged, try `--edge-feather 0.25`. If green fringe remains, try `--edge-contract 2` or higher `--despill`.

## Final Response

Return concise paths to the finished `*-transparent-trimmed.png` files and mention validation status. Include preview paths only when useful.
