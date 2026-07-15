#!/usr/bin/env python3
"""
Generic transparent cutout pipeline.

The script is intentionally asset-agnostic. It can crop a region from any image,
write a generic prompt for regenerating that crop on a flat chroma-key
background, and remove a solid/chroma background from any generated or prepared
source image.
"""

from __future__ import annotations

import argparse
import os
import json
import math
import shlex
import subprocess
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable, Sequence

from PIL import Image, ImageDraw, ImageFilter


DEFAULT_KEY = (0, 255, 0)


@dataclass
class ValidationReport:
    path: str
    mode: str
    size: tuple[int, int]
    transparent_pixels: int
    partially_transparent_pixels: int
    opaque_pixels: int
    corners_alpha: list[int]
    content_bbox: tuple[int, int, int, int] | None


@dataclass
class AssetCandidate:
    index: int
    bbox: tuple[int, int, int, int]
    crop_path: str
    prompt_path: str
    area_ratio: float
    fill_ratio: float
    colorfulness: float


@dataclass
class GeneratedCutout:
    index: int
    crop_path: str
    prompt_path: str
    generated_path: str
    transparent_path: str
    trimmed_path: str
    preview_path: str
    validation: ValidationReport


def parse_color(value: str) -> tuple[int, int, int]:
    raw = value.strip()
    if raw.startswith("#"):
        raw = raw[1:]
    if len(raw) != 6:
        raise argparse.ArgumentTypeError("color must be in #RRGGBB format")
    try:
        return tuple(int(raw[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]
    except ValueError as exc:
        raise argparse.ArgumentTypeError("color must be in #RRGGBB format") from exc


def parse_bbox(value: str) -> tuple[int, int, int, int]:
    parts = [int(v.strip()) for v in value.split(",")]
    if len(parts) != 4:
        raise argparse.ArgumentTypeError("bbox must be x,y,width,height")
    x, y, width, height = parts
    if width <= 0 or height <= 0:
        raise argparse.ArgumentTypeError("bbox width and height must be positive")
    return x, y, x + width, y + height


def clamp_bbox(
    bbox: tuple[int, int, int, int],
    size: tuple[int, int],
) -> tuple[int, int, int, int]:
    width, height = size
    left, top, right, bottom = bbox
    left = max(0, min(width, left))
    top = max(0, min(height, top))
    right = max(left + 1, min(width, right))
    bottom = max(top + 1, min(height, bottom))
    return left, top, right, bottom


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def crop_image(input_path: Path, output_path: Path, bbox: tuple[int, int, int, int]) -> Path:
    image = Image.open(input_path).convert("RGBA")
    cropped = image.crop(clamp_bbox(bbox, image.size))
    ensure_parent(output_path)
    cropped.save(output_path)
    return output_path


def mean(values: Sequence[float]) -> float:
    return sum(values) / len(values) if values else 0


def expand_bbox(
    bbox: tuple[int, int, int, int],
    padding: int,
    size: tuple[int, int],
) -> tuple[int, int, int, int]:
    left, top, right, bottom = bbox
    return clamp_bbox(
        (left - padding, top - padding, right + padding, bottom + padding),
        size,
    )


def bbox_intersection_area(
    a: tuple[int, int, int, int],
    b: tuple[int, int, int, int],
) -> int:
    left = max(a[0], b[0])
    top = max(a[1], b[1])
    right = min(a[2], b[2])
    bottom = min(a[3], b[3])
    return max(0, right - left) * max(0, bottom - top)


def bbox_area(bbox: tuple[int, int, int, int]) -> int:
    return max(0, bbox[2] - bbox[0]) * max(0, bbox[3] - bbox[1])


def merge_nearby_boxes(
    boxes: list[tuple[int, int, int, int]],
    gap: int,
) -> list[tuple[int, int, int, int]]:
    merged = boxes[:]
    changed = True
    while changed:
        changed = False
        next_boxes: list[tuple[int, int, int, int]] = []
        used = [False] * len(merged)
        for i, box in enumerate(merged):
            if used[i]:
                continue
            current = box
            used[i] = True
            for j in range(i + 1, len(merged)):
                if used[j]:
                    continue
                expanded = (
                    current[0] - gap,
                    current[1] - gap,
                    current[2] + gap,
                    current[3] + gap,
                )
                if bbox_intersection_area(expanded, merged[j]) > 0:
                    other = merged[j]
                    current = (
                        min(current[0], other[0]),
                        min(current[1], other[1]),
                        max(current[2], other[2]),
                        max(current[3], other[3]),
                    )
                    used[j] = True
                    changed = True
            next_boxes.append(current)
        merged = next_boxes
    return merged


def component_boxes(mask: Image.Image, min_pixels: int) -> list[tuple[int, int, int, int]]:
    mask = mask.convert("1")
    width, height = mask.size
    px = mask.load()
    seen = bytearray(width * height)
    boxes: list[tuple[int, int, int, int]] = []

    for y in range(height):
        for x in range(width):
            offset = y * width + x
            if seen[offset] or not px[x, y]:
                continue

            stack = [(x, y)]
            seen[offset] = 1
            count = 0
            left = right = x
            top = bottom = y

            while stack:
                cx, cy = stack.pop()
                count += 1
                left = min(left, cx)
                right = max(right, cx)
                top = min(top, cy)
                bottom = max(bottom, cy)

                for nx, ny in (
                    (cx - 1, cy),
                    (cx + 1, cy),
                    (cx, cy - 1),
                    (cx, cy + 1),
                ):
                    if nx < 0 or ny < 0 or nx >= width or ny >= height:
                        continue
                    next_offset = ny * width + nx
                    if seen[next_offset] or not px[nx, ny]:
                        continue
                    seen[next_offset] = 1
                    stack.append((nx, ny))

            if count >= min_pixels:
                boxes.append((left, top, right + 1, bottom + 1))

    return boxes


def color_mask(
    image: Image.Image,
    min_saturation: int,
    min_brightness: int,
    exclude_color: tuple[int, int, int] | None = None,
    exclude_distance: int = 42,
) -> Image.Image:
    rgb = image.convert("RGB")
    mask = Image.new("L", rgb.size, 0)
    rgb_px = rgb.load()
    mask_px = mask.load()
    for y in range(rgb.height):
        for x in range(rgb.width):
            r, g, b = rgb_px[x, y]
            high = max(r, g, b)
            low = min(r, g, b)
            saturation = high - low
            if (
                exclude_color is not None
                and color_distance((r, g, b), exclude_color) <= exclude_distance
            ):
                continue
            if saturation >= min_saturation and high >= min_brightness:
                mask_px[x, y] = 255
    return mask


def dominant_canvas_bbox(
    image: Image.Image,
    background_color: tuple[int, int, int],
    distance: int = 12,
) -> tuple[int, int, int, int]:
    rgb = image.convert("RGB")
    px = rgb.load()
    xs: list[int] = []
    ys: list[int] = []
    for y in range(rgb.height):
        for x in range(rgb.width):
            if color_distance(px[x, y], background_color) > distance:
                xs.append(x)
                ys.append(y)

    if not xs or not ys:
        return (0, 0, rgb.width, rgb.height)
    return (min(xs), min(ys), max(xs) + 1, max(ys) + 1)


def dominant_background_colors(
    image: Image.Image,
    bbox: tuple[int, int, int, int],
    limit: int,
    sample_step: int = 4,
) -> list[tuple[int, int, int]]:
    rgb = image.convert("RGB")
    px = rgb.load()
    buckets: dict[tuple[int, int, int], list[tuple[int, int, int]]] = {}
    left, top, right, bottom = bbox
    for y in range(top, bottom, sample_step):
        for x in range(left, right, sample_step):
            color = px[x, y]
            key = tuple((channel // 8) * 8 for channel in color)
            buckets.setdefault(key, []).append(color)

    colors: list[tuple[int, int, int]] = []
    for _, samples in sorted(
        buckets.items(),
        key=lambda item: len(item[1]),
        reverse=True,
    ):
        count = len(samples)
        colors.append(
            tuple(
                round(sum(pixel[index] for pixel in samples) / count)
                for index in range(3)
            )
        )
        if len(colors) >= limit:
            break
    return colors


def foreground_distance_mask(
    image: Image.Image,
    background_colors: Sequence[tuple[int, int, int]],
    distance: int,
) -> Image.Image:
    rgb = image.convert("RGB")
    px = rgb.load()
    mask = Image.new("L", rgb.size, 0)
    mask_px = mask.load()
    for y in range(rgb.height):
        for x in range(rgb.width):
            color = px[x, y]
            if all(color_distance(color, background) > distance for background in background_colors):
                mask_px[x, y] = 255
    return mask


def candidate_metrics(
    image: Image.Image,
    mask: Image.Image,
    bbox: tuple[int, int, int, int],
) -> tuple[float, float]:
    rgb = image.convert("RGB")
    mask_l = mask.convert("L")
    rgb_px = rgb.load()
    mask_px = mask_l.load()
    left, top, right, bottom = bbox
    saturated = 0
    colorfulness_values: list[float] = []
    for y in range(top, bottom):
        for x in range(left, right):
            if mask_px[x, y] > 0:
                saturated += 1
                r, g, b = rgb_px[x, y]
                colorfulness_values.append(max(r, g, b) - min(r, g, b))

    area = bbox_area(bbox)
    fill_ratio = saturated / area if area else 0
    return fill_ratio, mean(colorfulness_values)


def looks_like_text_or_layout(
    bbox: tuple[int, int, int, int],
    fill_ratio: float,
    area_ratio: float,
    image_size: tuple[int, int],
) -> bool:
    width, height = image_size
    box_width = bbox[2] - bbox[0]
    box_height = bbox[3] - bbox[1]
    aspect = box_width / max(1, box_height)

    if box_width > width * 0.82:
        return True
    if box_height > height * 0.55:
        return True
    if area_ratio > 0.2:
        return True

    # Text lines and labels are usually long, short, and sparse.
    if aspect > 2.4 and box_height < max(72, height * 0.055):
        return True
    if aspect > 4.0 and fill_ratio < 0.45:
        return True

    # Solid rounded buttons or bars are not reusable visual assets.
    if aspect > 1.8 and fill_ratio > 0.62 and area_ratio > 0.002:
        return True

    # Tiny strokes are usually text, dividers, or UI chrome.
    if box_height < 16 or box_width < 16:
        return True

    return False


def write_detection_overlay(
    image_path: Path,
    output_path: Path,
    candidates: Sequence[AssetCandidate],
) -> Path:
    image = Image.open(image_path).convert("RGBA")
    draw = ImageDraw.Draw(image)
    for candidate in candidates:
        left, top, right, bottom = candidate.bbox
        draw.rectangle([left, top, right, bottom], outline=(255, 0, 0, 255), width=3)
        draw.text((left + 4, top + 4), str(candidate.index), fill=(255, 0, 0, 255))
    ensure_parent(output_path)
    image.save(output_path)
    return output_path


def detect_reusable_assets(
    input_path: Path,
    out_dir: Path,
    name: str,
    key_color: tuple[int, int, int],
    subject_hint: str,
    max_assets: int,
    padding: int,
    min_size: int,
    min_area_ratio: float,
    max_area_ratio: float,
    min_saturation: int,
    min_brightness: int,
    top_exclusion_ratio: float,
    merge_gap: int,
    dilate: int,
    write_overlay: bool,
) -> tuple[list[AssetCandidate], Path | None]:
    image = Image.open(input_path).convert("RGBA")
    width, height = image.size
    border_color = dominant_border_color(image, border=12)
    border_saturation = max(border_color) - min(border_color)
    exclude_color = border_color if border_saturation >= min_saturation else None
    source_mask = color_mask(
        image,
        min_saturation=min_saturation,
        min_brightness=min_brightness,
        exclude_color=exclude_color,
    )

    mask = source_mask
    if dilate > 0:
        kernel = dilate * 2 + 1
        if kernel % 2 == 0:
            kernel += 1
        mask = mask.filter(ImageFilter.MaxFilter(kernel))
    boxes = component_boxes(mask, min_pixels=max(8, min_size * min_size // 16))
    boxes = merge_nearby_boxes(boxes, gap=merge_gap)

    top_exclusion = round(height * top_exclusion_ratio)
    total_area = width * height
    filtered: list[tuple[tuple[int, int, int, int], float, float, float]] = []

    for box in boxes:
        box = clamp_bbox(box, image.size)
        box_width = box[2] - box[0]
        box_height = box[3] - box[1]
        area_ratio = bbox_area(box) / total_area
        if box[3] <= top_exclusion:
            continue
        if box_width < min_size or box_height < min_size:
            continue
        if area_ratio < min_area_ratio or area_ratio > max_area_ratio:
            continue

        fill_ratio, colorfulness = candidate_metrics(image, source_mask, box)
        if colorfulness < min_saturation:
            continue
        if looks_like_text_or_layout(box, fill_ratio, area_ratio, image.size):
            continue
        filtered.append((box, area_ratio, fill_ratio, colorfulness))

    filtered.sort(key=lambda item: (item[1], item[3]), reverse=True)

    candidates: list[AssetCandidate] = []
    crops_dir = out_dir / f"{name}-detected-assets"
    for raw_index, (box, area_ratio, fill_ratio, colorfulness) in enumerate(filtered):
        expanded = expand_bbox(box, padding, image.size)
        if any(
            bbox_intersection_area(expanded, candidate.bbox)
            / max(1, min(bbox_area(expanded), bbox_area(candidate.bbox)))
            > 0.72
            for candidate in candidates
        ):
            continue

        index = len(candidates) + 1
        crop_path = crops_dir / f"{name}-asset-{index:02d}-crop.png"
        prompt_path = crops_dir / f"{name}-asset-{index:02d}-image-gen-prompt.txt"
        crop_image(input_path, crop_path, expanded)
        write_image_gen_prompt(crop_path, prompt_path, subject_hint, key_color)
        candidates.append(
            AssetCandidate(
                index=index,
                bbox=expanded,
                crop_path=str(crop_path),
                prompt_path=str(prompt_path),
                area_ratio=area_ratio,
                fill_ratio=fill_ratio,
                colorfulness=colorfulness,
            )
        )

        if len(candidates) >= max_assets:
            break

    overlay_path = None
    if write_overlay:
        overlay_path = crops_dir / f"{name}-detected-assets-overlay.png"
        write_detection_overlay(input_path, overlay_path, candidates)

    report_path = crops_dir / f"{name}-detected-assets.json"
    ensure_parent(report_path)
    report_path.write_text(
        json.dumps([asdict(candidate) for candidate in candidates], indent=2),
        encoding="utf-8",
    )

    return candidates, overlay_path


def detect_card_icon_assets(
    input_path: Path,
    out_dir: Path,
    name: str,
    key_color: tuple[int, int, int],
    subject_hint: str,
    max_assets: int,
    padding: int,
    min_size: int,
    min_area_ratio: float,
    max_area_ratio: float,
    top_ratio: float,
    bottom_ratio: float,
    background_count: int,
    background_distance: int,
    merge_gap: int,
    dilate: int,
    write_overlay: bool,
) -> tuple[list[AssetCandidate], Path | None]:
    image = Image.open(input_path).convert("RGBA")
    width, height = image.size
    border_color = dominant_border_color(image, border=12)
    canvas_bbox = dominant_canvas_bbox(image, border_color)
    backgrounds = [border_color]
    backgrounds.extend(
        color
        for color in dominant_background_colors(image, canvas_bbox, limit=background_count)
        if color not in backgrounds
    )

    source_mask = foreground_distance_mask(
        image,
        background_colors=backgrounds,
        distance=background_distance,
    )
    mask = source_mask
    if dilate > 0:
        kernel = dilate * 2 + 1
        if kernel % 2 == 0:
            kernel += 1
        mask = mask.filter(ImageFilter.MaxFilter(kernel))

    boxes = component_boxes(mask, min_pixels=max(8, min_size * min_size // 18))
    boxes = merge_nearby_boxes(boxes, gap=merge_gap)

    total_area = width * height
    min_center_y = height * top_ratio
    max_center_y = height * bottom_ratio
    filtered: list[tuple[tuple[int, int, int, int], float, float, float]] = []

    for box in boxes:
        box = clamp_bbox(box, image.size)
        box_width = box[2] - box[0]
        box_height = box[3] - box[1]
        center_y = (box[1] + box[3]) / 2
        aspect = box_width / max(1, box_height)
        area_ratio = bbox_area(box) / total_area

        if not (min_center_y <= center_y <= max_center_y):
            continue
        if box_width < min_size or box_height < min_size:
            continue
        if area_ratio < min_area_ratio or area_ratio > max_area_ratio:
            continue
        if aspect < 0.45 or aspect > 2.25:
            continue

        fill_ratio, colorfulness = candidate_metrics(image, source_mask, box)
        filtered.append((box, area_ratio, fill_ratio, colorfulness))

    filtered.sort(key=lambda item: item[0][0])

    candidates: list[AssetCandidate] = []
    crops_dir = out_dir / f"{name}-card-icons"
    for box, area_ratio, fill_ratio, colorfulness in filtered:
        expanded = expand_bbox(box, padding, image.size)
        if any(
            bbox_intersection_area(expanded, candidate.bbox)
            / max(1, min(bbox_area(expanded), bbox_area(candidate.bbox)))
            > 0.72
            for candidate in candidates
        ):
            continue

        index = len(candidates) + 1
        crop_path = crops_dir / f"{name}-card-icon-{index:02d}-crop.png"
        prompt_path = crops_dir / f"{name}-card-icon-{index:02d}-image-gen-prompt.txt"
        crop_image(input_path, crop_path, expanded)
        write_image_gen_prompt(crop_path, prompt_path, subject_hint, key_color)
        candidates.append(
            AssetCandidate(
                index=index,
                bbox=expanded,
                crop_path=str(crop_path),
                prompt_path=str(prompt_path),
                area_ratio=area_ratio,
                fill_ratio=fill_ratio,
                colorfulness=colorfulness,
            )
        )

        if len(candidates) >= max_assets:
            break

    overlay_path = None
    if write_overlay:
        overlay_path = crops_dir / f"{name}-card-icons-overlay.png"
        write_detection_overlay(input_path, overlay_path, candidates)

    report_path = crops_dir / f"{name}-card-icons.json"
    ensure_parent(report_path)
    report_path.write_text(
        json.dumps(
            {
                "background_colors": [
                    "#{:02x}{:02x}{:02x}".format(*color)
                    for color in backgrounds
                ],
                "candidates": [asdict(candidate) for candidate in candidates],
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    return candidates, overlay_path


def border_pixels(image: Image.Image, border: int) -> Iterable[tuple[int, int, int]]:
    rgb = image.convert("RGB")
    width, height = rgb.size
    px = rgb.load()
    border = max(1, min(border, width // 2, height // 2))
    for y in range(height):
        for x in range(width):
            if x < border or y < border or x >= width - border or y >= height - border:
                yield px[x, y]


def dominant_border_color(image: Image.Image, border: int = 12) -> tuple[int, int, int]:
    buckets: dict[tuple[int, int, int], list[tuple[int, int, int]]] = {}
    for color in border_pixels(image, border):
        key = tuple((channel // 8) * 8 for channel in color)
        buckets.setdefault(key, []).append(color)
    if not buckets:
        return DEFAULT_KEY

    _, samples = max(buckets.items(), key=lambda item: len(item[1]))
    count = len(samples)
    return tuple(round(sum(pixel[i] for pixel in samples) / count) for i in range(3))  # type: ignore[return-value]


def color_distance(pixel: Sequence[int], key: Sequence[int]) -> float:
    return math.sqrt(sum((int(pixel[i]) - int(key[i])) ** 2 for i in range(3)))


def build_alpha(
    rgb_image: Image.Image,
    key_color: tuple[int, int, int],
    transparent_threshold: int,
    opaque_threshold: int,
) -> Image.Image:
    if opaque_threshold <= transparent_threshold:
        raise ValueError("opaque_threshold must be greater than transparent_threshold")

    rgb = rgb_image.convert("RGB")
    alpha = Image.new("L", rgb.size, 255)
    alpha_px = alpha.load()
    rgb_px = rgb.load()
    span = opaque_threshold - transparent_threshold

    for y in range(rgb.height):
        for x in range(rgb.width):
            distance = color_distance(rgb_px[x, y], key_color)
            if distance <= transparent_threshold:
                value = 0
            elif distance >= opaque_threshold:
                value = 255
            else:
                value = round(255 * (distance - transparent_threshold) / span)
            alpha_px[x, y] = value

    return alpha


def multiply_alpha(base_alpha: Image.Image, matte_alpha: Image.Image) -> Image.Image:
    base = base_alpha.convert("L")
    matte = matte_alpha.convert("L")
    out = Image.new("L", base.size, 0)
    base_px = base.load()
    matte_px = matte.load()
    out_px = out.load()
    for y in range(base.height):
        for x in range(base.width):
            out_px[x, y] = round(base_px[x, y] * matte_px[x, y] / 255)
    return out


def despill_rgb(
    rgb_image: Image.Image,
    alpha: Image.Image,
    key_color: tuple[int, int, int],
    strength: float,
) -> Image.Image:
    if strength <= 0:
        return rgb_image.convert("RGB")

    dominant_channel = max(range(3), key=lambda index: key_color[index])
    rgb = rgb_image.convert("RGB")
    rgb_px = rgb.load()
    alpha_px = alpha.load()

    for y in range(rgb.height):
        for x in range(rgb.width):
            channels = list(rgb_px[x, y])
            dominant = channels[dominant_channel]
            others = [channels[i] for i in range(3) if i != dominant_channel]
            excess = max(0, dominant - max(others))
            if excess:
                edge_weight = 1 - (alpha_px[x, y] / 255)
                channels[dominant_channel] = round(
                    dominant - excess * strength * edge_weight
                )
                rgb_px[x, y] = tuple(max(0, min(255, c)) for c in channels)

    return rgb


def remove_chroma_key(
    input_path: Path,
    output_path: Path,
    key_color: tuple[int, int, int] | None,
    auto_key: bool,
    border: int,
    transparent_threshold: int,
    opaque_threshold: int,
    edge_contract: int,
    edge_feather: float,
    alpha_cleanup_threshold: int,
    despill_strength: float,
) -> tuple[Path, tuple[int, int, int]]:
    source = Image.open(input_path).convert("RGBA")
    resolved_key = dominant_border_color(source, border) if auto_key else key_color or DEFAULT_KEY

    matte_alpha = build_alpha(
        source,
        resolved_key,
        transparent_threshold=transparent_threshold,
        opaque_threshold=opaque_threshold,
    )
    alpha = multiply_alpha(source.getchannel("A"), matte_alpha)

    if edge_contract > 0:
        for _ in range(edge_contract):
            alpha = alpha.filter(ImageFilter.MinFilter(3))
    if edge_feather > 0:
        alpha = alpha.filter(ImageFilter.GaussianBlur(edge_feather))
    if alpha_cleanup_threshold > 0:
        alpha = alpha.point(
            lambda value: 0 if value <= alpha_cleanup_threshold else value
        )

    rgb = despill_rgb(source, alpha, resolved_key, despill_strength)
    result = Image.merge("RGBA", (*rgb.split(), alpha))
    ensure_parent(output_path)
    result.save(output_path)
    return output_path, resolved_key


def trim_alpha(input_path: Path, output_path: Path, padding: int, threshold: int) -> Path:
    image = Image.open(input_path).convert("RGBA")
    mask = image.getchannel("A").point(lambda value: 255 if value > threshold else 0)
    bbox = mask.getbbox()
    if bbox is None:
        raise ValueError(f"no visible pixels found in {input_path}")
    left, top, right, bottom = bbox
    left = max(0, left - padding)
    top = max(0, top - padding)
    right = min(image.width, right + padding)
    bottom = min(image.height, bottom + padding)
    ensure_parent(output_path)
    image.crop((left, top, right, bottom)).save(output_path)
    return output_path


def make_checkerboard_preview(input_path: Path, output_path: Path, cell: int = 32) -> Path:
    image = Image.open(input_path).convert("RGBA")
    background = Image.new("RGBA", image.size, (255, 255, 255, 255))
    draw = ImageDraw.Draw(background)
    for y in range(0, image.height, cell):
        for x in range(0, image.width, cell):
            if (x // cell + y // cell) % 2:
                draw.rectangle(
                    [x, y, min(x + cell, image.width), min(y + cell, image.height)],
                    fill=(220, 220, 220, 255),
                )
    background.alpha_composite(image)
    ensure_parent(output_path)
    background.save(output_path)
    return output_path


def validate_alpha(input_path: Path, threshold: int = 8) -> ValidationReport:
    image = Image.open(input_path).convert("RGBA")
    alpha = image.getchannel("A")
    values = list(alpha.getdata())
    transparent = sum(1 for value in values if value == 0)
    partial = sum(1 for value in values if 0 < value < 255)
    opaque = sum(1 for value in values if value == 255)
    width, height = image.size
    corners = [
        image.getpixel((0, 0))[3],
        image.getpixel((width - 1, 0))[3],
        image.getpixel((0, height - 1))[3],
        image.getpixel((width - 1, height - 1))[3],
    ]
    bbox = alpha.point(lambda value: 255 if value > threshold else 0).getbbox()
    return ValidationReport(
        path=str(input_path),
        mode=image.mode,
        size=image.size,
        transparent_pixels=transparent,
        partially_transparent_pixels=partial,
        opaque_pixels=opaque,
        corners_alpha=corners,
        content_bbox=bbox,
    )


def quote_command_value(value: Path | str) -> str:
    return shlex.quote(str(value))


def render_image_gen_command(
    command_template: str,
    crop_path: Path,
    prompt_path: Path,
    output_path: Path,
    key_color: tuple[int, int, int],
) -> str:
    prompt = prompt_path.read_text(encoding="utf-8")
    key_hex = "#{:02x}{:02x}{:02x}".format(*key_color)
    replacements = {
        "{crop}": quote_command_value(crop_path),
        "{crop_path}": quote_command_value(crop_path),
        "{prompt_path}": quote_command_value(prompt_path),
        "{prompt}": quote_command_value(prompt),
        "{output}": quote_command_value(output_path),
        "{output_path}": quote_command_value(output_path),
        "{key_color}": quote_command_value(key_hex),
    }
    command = command_template
    for placeholder, value in replacements.items():
        command = command.replace(placeholder, value)
    return command


def run_image_gen_command(
    command_template: str,
    crop_path: Path,
    prompt_path: Path,
    output_path: Path,
    key_color: tuple[int, int, int],
) -> Path:
    ensure_parent(output_path)
    command = render_image_gen_command(
        command_template=command_template,
        crop_path=crop_path,
        prompt_path=prompt_path,
        output_path=output_path,
        key_color=key_color,
    )
    subprocess.run(command, shell=True, check=True)
    if not output_path.exists():
        raise FileNotFoundError(
            f"image generation command completed but did not create {output_path}"
        )
    return output_path


def generate_and_cutout_assets(
    candidates: Sequence[AssetCandidate],
    out_dir: Path,
    name: str,
    command_template: str,
    key_color: tuple[int, int, int],
    auto_key: bool,
    border: int,
    transparent_threshold: int,
    opaque_threshold: int,
    edge_contract: int,
    edge_feather: float,
    alpha_cleanup_threshold: int,
    despill_strength: float,
    trim_padding: int,
    trim_threshold: int,
    preview_cell: int,
) -> list[GeneratedCutout]:
    generated_dir = out_dir / f"{name}-generated-green-screen"
    transparent_dir = out_dir / f"{name}-generated-transparent"
    results: list[GeneratedCutout] = []

    for candidate in candidates:
        index = candidate.index
        crop_path = Path(candidate.crop_path)
        prompt_path = Path(candidate.prompt_path)
        generated_path = generated_dir / f"{name}-generated-{index:02d}.png"
        transparent_path = transparent_dir / f"{name}-transparent-{index:02d}.png"
        trimmed_path = transparent_dir / f"{name}-transparent-{index:02d}-trimmed.png"
        preview_path = transparent_dir / f"{name}-transparent-{index:02d}-preview.png"

        run_image_gen_command(
            command_template=command_template,
            crop_path=crop_path,
            prompt_path=prompt_path,
            output_path=generated_path,
            key_color=key_color,
        )
        remove_chroma_key(
            generated_path,
            transparent_path,
            key_color=key_color,
            auto_key=auto_key,
            border=border,
            transparent_threshold=transparent_threshold,
            opaque_threshold=opaque_threshold,
            edge_contract=edge_contract,
            edge_feather=edge_feather,
            alpha_cleanup_threshold=alpha_cleanup_threshold,
            despill_strength=despill_strength,
        )
        trim_alpha(
            transparent_path,
            trimmed_path,
            padding=trim_padding,
            threshold=trim_threshold,
        )
        make_checkerboard_preview(trimmed_path, preview_path, cell=preview_cell)
        validation = validate_alpha(trimmed_path, threshold=trim_threshold)
        results.append(
            GeneratedCutout(
                index=index,
                crop_path=str(crop_path),
                prompt_path=str(prompt_path),
                generated_path=str(generated_path),
                transparent_path=str(transparent_path),
                trimmed_path=str(trimmed_path),
                preview_path=str(preview_path),
                validation=validation,
            )
        )

    return results


def write_image_gen_prompt(
    crop_path: Path,
    output_path: Path,
    subject_hint: str,
    key_color: tuple[int, int, int],
) -> Path:
    key_hex = "#{:02x}{:02x}{:02x}".format(*key_color)
    prompt = f"""Use case: background-extraction
Asset type: transparent cutout asset
Input image: {crop_path}
Primary request: Regenerate only the foreground subject from the input crop.
Subject: {subject_hint}
Background: perfectly flat solid {key_hex} chroma-key background.
Requirements:
- Reconstruct complete uncropped edges and keep generous padding around the subject.
- Preserve the subject's visual style, lighting direction, material feel, and proportions.
- The background must be one uniform color with no shadows, gradients, texture, reflections, floor plane, or lighting variation.
- Do not use {key_hex} anywhere in the subject.
- No cast shadow, no contact shadow, no watermark, and no extra UI elements.
"""
    ensure_parent(output_path)
    output_path.write_text(prompt, encoding="utf-8")
    return output_path


def run_pipeline(args: argparse.Namespace) -> dict[str, object]:
    out_dir = args.out_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    name = args.name
    results: dict[str, object] = {}
    generated_candidates: list[AssetCandidate] = []

    crop_path = out_dir / f"{name}-crop.png"
    if args.input and args.bbox:
        crop_image(args.input, crop_path, args.bbox)
        results["crop"] = str(crop_path)
        prompt_path = out_dir / f"{name}-image-gen-prompt.txt"
        write_image_gen_prompt(crop_path, prompt_path, args.subject_hint, args.key_color)
        results["image_gen_prompt"] = str(prompt_path)
        generated_candidates.append(
            AssetCandidate(
                index=1,
                bbox=args.bbox,
                crop_path=str(crop_path),
                prompt_path=str(prompt_path),
                area_ratio=0,
                fill_ratio=0,
                colorfulness=0,
            )
        )

    if args.input and args.auto_detect_assets:
        candidates, overlay_path = detect_reusable_assets(
            input_path=args.input,
            out_dir=out_dir,
            name=name,
            key_color=args.key_color,
            subject_hint=args.subject_hint,
            max_assets=args.detect_max_assets,
            padding=args.detect_padding,
            min_size=args.detect_min_size,
            min_area_ratio=args.detect_min_area_ratio,
            max_area_ratio=args.detect_max_area_ratio,
            min_saturation=args.detect_min_saturation,
            min_brightness=args.detect_min_brightness,
            top_exclusion_ratio=args.detect_top_exclusion_ratio,
            merge_gap=args.detect_merge_gap,
            dilate=args.detect_dilate,
            write_overlay=args.detect_overlay,
        )
        results["detected_assets"] = [asdict(candidate) for candidate in candidates]
        if overlay_path:
            results["detected_assets_overlay"] = str(overlay_path)
        generated_candidates.extend(candidates)

    if args.input and args.detect_card_icons:
        candidates, overlay_path = detect_card_icon_assets(
            input_path=args.input,
            out_dir=out_dir,
            name=name,
            key_color=args.key_color,
            subject_hint=args.subject_hint,
            max_assets=args.detect_max_assets,
            padding=args.detect_padding,
            min_size=args.detect_min_size,
            min_area_ratio=args.detect_min_area_ratio,
            max_area_ratio=args.detect_max_area_ratio,
            top_ratio=args.card_icon_top_ratio,
            bottom_ratio=args.card_icon_bottom_ratio,
            background_count=args.card_icon_background_count,
            background_distance=args.card_icon_background_distance,
            merge_gap=args.detect_merge_gap,
            dilate=args.detect_dilate,
            write_overlay=args.detect_overlay,
        )
        results["card_icons"] = [asdict(candidate) for candidate in candidates]
        if overlay_path:
            results["card_icons_overlay"] = str(overlay_path)
        generated_candidates.extend(candidates)

    image_gen_command = args.image_gen_command or os.environ.get("IMAGE_GEN_COMMAND")
    if args.run_image_gen:
        if not image_gen_command:
            raise ValueError(
                "provide --image-gen-command or set IMAGE_GEN_COMMAND when using --run-image-gen"
            )
        if not generated_candidates:
            raise ValueError(
                "--run-image-gen requires assets from --bbox, --auto-detect-assets, or --detect-card-icons"
            )
        generated = generate_and_cutout_assets(
            candidates=generated_candidates,
            out_dir=out_dir,
            name=name,
            command_template=image_gen_command,
            key_color=args.key_color,
            auto_key=args.auto_key,
            border=args.border,
            transparent_threshold=args.transparent_threshold,
            opaque_threshold=args.opaque_threshold,
            edge_contract=args.edge_contract,
            edge_feather=args.edge_feather,
            alpha_cleanup_threshold=args.alpha_cleanup_threshold,
            despill_strength=args.despill,
            trim_padding=args.trim_padding,
            trim_threshold=args.trim_threshold,
            preview_cell=args.preview_cell,
        )
        results["generated_cutouts"] = [asdict(item) for item in generated]

    source_path = args.source
    if source_path:
        keyed_path = out_dir / f"{name}-transparent.png"
        keyed_path, resolved_key = remove_chroma_key(
            source_path,
            keyed_path,
            key_color=args.key_color,
            auto_key=args.auto_key,
            border=args.border,
            transparent_threshold=args.transparent_threshold,
            opaque_threshold=args.opaque_threshold,
            edge_contract=args.edge_contract,
            edge_feather=args.edge_feather,
            alpha_cleanup_threshold=args.alpha_cleanup_threshold,
            despill_strength=args.despill,
        )
        results["transparent"] = str(keyed_path)
        results["resolved_key_color"] = "#{:02x}{:02x}{:02x}".format(*resolved_key)

        trimmed_path = out_dir / f"{name}-transparent-trimmed.png"
        trim_alpha(
            keyed_path,
            trimmed_path,
            padding=args.trim_padding,
            threshold=args.trim_threshold,
        )
        results["trimmed"] = str(trimmed_path)

        preview_path = out_dir / f"{name}-transparent-preview.png"
        make_checkerboard_preview(trimmed_path, preview_path, cell=args.preview_cell)
        results["preview"] = str(preview_path)

        report = validate_alpha(trimmed_path, threshold=args.trim_threshold)
        results["validation"] = asdict(report)

    return results


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Crop, prompt, chroma-key, trim, and validate transparent cutouts."
    )
    parser.add_argument("--input", type=Path, help="source screenshot or source image")
    parser.add_argument(
        "--bbox",
        type=parse_bbox,
        help="main visual crop as x,y,width,height in source image pixels",
    )
    parser.add_argument(
        "--auto-detect-assets",
        action="store_true",
        help="scan --input and export reusable visual asset candidates",
    )
    parser.add_argument(
        "--detect-card-icons",
        action="store_true",
        help="scan --input for icon-sized foreground objects in card visual areas",
    )
    parser.add_argument(
        "--source",
        type=Path,
        help="image to cut out; best results require a flat solid/chroma background",
    )
    parser.add_argument(
        "--green-input",
        dest="source",
        type=Path,
        help=argparse.SUPPRESS,
    )
    parser.add_argument("--out-dir", type=Path, default=Path("assets/cutout"))
    parser.add_argument("--name", default="asset")
    parser.add_argument(
        "--subject-hint",
        default="the foreground subject from the crop",
        help="short description used in the generated image prompt",
    )
    parser.add_argument(
        "--run-image-gen",
        action="store_true",
        help="after crop/prompt generation, call an image generation command and cut out its result",
    )
    parser.add_argument(
        "--image-gen-command",
        help=(
            "shell command template used by --run-image-gen; placeholders: "
            "{crop}, {prompt_path}, {prompt}, {output}, {key_color}"
        ),
    )
    parser.add_argument("--key-color", type=parse_color, default=DEFAULT_KEY)
    parser.add_argument(
        "--auto-key",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="sample the chroma-key color from the image border",
    )
    parser.add_argument("--border", type=int, default=12)
    parser.add_argument("--transparent-threshold", type=int, default=12)
    parser.add_argument("--opaque-threshold", type=int, default=220)
    parser.add_argument("--edge-contract", type=int, default=1)
    parser.add_argument("--edge-feather", type=float, default=0.0)
    parser.add_argument(
        "--alpha-cleanup-threshold",
        type=int,
        default=16,
        help="force very low alpha values to 0 to avoid border noise",
    )
    parser.add_argument("--despill", type=float, default=0.85)
    parser.add_argument("--trim-padding", type=int, default=40)
    parser.add_argument("--trim-threshold", type=int, default=8)
    parser.add_argument("--preview-cell", type=int, default=32)
    parser.add_argument("--detect-max-assets", type=int, default=24)
    parser.add_argument("--detect-padding", type=int, default=24)
    parser.add_argument("--detect-min-size", type=int, default=24)
    parser.add_argument("--detect-min-area-ratio", type=float, default=0.00012)
    parser.add_argument("--detect-max-area-ratio", type=float, default=0.16)
    parser.add_argument("--detect-min-saturation", type=int, default=36)
    parser.add_argument("--detect-min-brightness", type=int, default=60)
    parser.add_argument("--detect-top-exclusion-ratio", type=float, default=0.075)
    parser.add_argument("--detect-merge-gap", type=int, default=18)
    parser.add_argument("--detect-dilate", type=int, default=4)
    parser.add_argument(
        "--card-icon-top-ratio",
        type=float,
        default=0.25,
        help="minimum vertical center ratio for card icon candidates",
    )
    parser.add_argument(
        "--card-icon-bottom-ratio",
        type=float,
        default=0.65,
        help="maximum vertical center ratio for card icon candidates",
    )
    parser.add_argument(
        "--card-icon-background-count",
        type=int,
        default=8,
        help="number of dominant canvas colors to exclude as backgrounds",
    )
    parser.add_argument(
        "--card-icon-background-distance",
        type=int,
        default=24,
        help="minimum RGB distance from dominant background colors",
    )
    parser.add_argument(
        "--detect-overlay",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="write a debug image with candidate boxes",
    )
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    if not args.input and not args.source:
        parser.error("provide --input for crop/prompt generation or --source for cutout")
    if args.input and not args.bbox and not args.auto_detect_assets and not args.detect_card_icons:
        parser.error("--bbox, --auto-detect-assets, or --detect-card-icons is required when --input is provided")

    results = run_pipeline(args)
    print(json.dumps(results, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
