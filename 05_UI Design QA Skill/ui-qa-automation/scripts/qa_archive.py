import argparse
import json
import re
import shutil
from collections import Counter
from datetime import datetime
from pathlib import Path


DEFAULT_CONFIG = {
    "archive": "auto",
    "stats": "auto",
    "insights": "auto",
    "skill_candidates": "review",
    "update_skills": "manual",
    "auto_promote_after_confirmed_count": 3,
}

ARTIFACTS = [
    "report.json",
    "summary-report.md",
    "summary-report.html",
    "issue-annotated.png",
    "overlay-preview.png",
    "dev-fix.md",
]
REPORT_ARTIFACTS = [name for name in ARTIFACTS if name != "report.json"]

AUTOMATION_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = AUTOMATION_ROOT.parent


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def load_config(path: Path | None) -> dict:
    config = dict(DEFAULT_CONFIG)
    if path and path.exists():
        loaded = load_json(path)
        config.update({key: value for key, value in loaded.items() if value is not None})
    return config


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = value.strip("-")
    return value or "ui-qa-run"


def default_run_id(report: dict) -> str:
    page_name = str(report.get("sources", {}).get("page_name") or "ui-qa-run")
    stamp = datetime.now().strftime("%Y-%m-%d-%H%M%S")
    return f"{stamp}-{slugify(page_name)}"


def mode_label(mode: str) -> str:
    return {
        "auto": "Auto",
        "review": "Review",
        "manual": "Manual",
    }.get(str(mode).lower(), str(mode))


def normalize_issue(report: dict, issue: dict, run_id: str, archived_at: str) -> dict:
    sources = report.get("sources", {})
    summary = report.get("summary", {})
    bbox = issue.get("bbox") or {}
    return {
        "run_id": run_id,
        "archived_at": archived_at,
        "page_name": sources.get("page_name", ""),
        "platform": sources.get("platform", ""),
        "alignment_method": sources.get("alignment_method", ""),
        "status": summary.get("status", ""),
        "issue_id": issue.get("id", ""),
        "severity": issue.get("severity", ""),
        "property": issue.get("property", ""),
        "title_zh": issue.get("title_zh", ""),
        "summary_zh": issue.get("summary_zh", ""),
        "expected": issue.get("expected", ""),
        "actual": issue.get("actual", ""),
        "delta": issue.get("delta", ""),
        "bbox": {
            "x": bbox.get("x", 0),
            "y": bbox.get("y", 0),
            "width": bbox.get("width", 0),
            "height": bbox.get("height", 0),
        },
        "fix_suggestion_zh": issue.get("fix_suggestion_zh", ""),
        "suspected_cause_zh": issue.get("suspected_cause_zh", ""),
        "acceptance_criteria_zh": issue.get("acceptance_criteria_zh", ""),
    }


def read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            rows.append(json.loads(line))
    return rows


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows)
    path.write_text(text, encoding="utf-8")


def copy_artifacts(report_path: Path, deliverables_dir: Path, run_dir: Path) -> None:
    run_dir.mkdir(parents=True, exist_ok=True)
    destinations = {
        "report.json": report_path,
        "summary-report.md": deliverables_dir / "summary-report.md",
        "summary-report.html": deliverables_dir / "summary-report.html",
        "issue-annotated.png": deliverables_dir / "issue-annotated.png",
        "overlay-preview.png": deliverables_dir / "overlay-preview.png",
        "dev-fix.md": deliverables_dir / "dev-fix.md",
    }
    for name in ARTIFACTS:
        source = destinations[name]
        if source.exists():
            shutil.copy2(source, run_dir / name)


def parse_generated_at(value: str | datetime | None) -> datetime:
    if isinstance(value, datetime):
        return value.replace(microsecond=0)
    if value:
        return datetime.fromisoformat(value).replace(microsecond=0)
    return datetime.now().replace(microsecond=0)


def unique_timestamp_dir(reports_dir: Path, generated_at: datetime) -> tuple[Path, int]:
    day = generated_at.strftime("%Y-%m-%d")
    stem = generated_at.strftime("%Y-%m-%d_%H-%M-%S")
    parent = reports_dir / "runs" / day
    sequence = 1
    candidate = parent / stem
    while candidate.exists():
        sequence += 1
        candidate = parent / f"{stem}-{sequence:03d}"
    return candidate, sequence


def copy_report_outputs(
    deliverables_dir: Path,
    reports_dir: Path,
    run_id: str,
    generated_at: datetime,
    archive_run_dir: Path,
) -> tuple[Path, Path, int]:
    report_dir, sequence = unique_timestamp_dir(reports_dir, generated_at)
    latest_dir = reports_dir / "latest"
    report_dir.mkdir(parents=True, exist_ok=True)
    latest_dir.mkdir(parents=True, exist_ok=True)

    copied = []
    for name in REPORT_ARTIFACTS:
        source = deliverables_dir / name
        if source.exists():
            shutil.copy2(source, report_dir / name)
            shutil.copy2(source, latest_dir / name)
            copied.append(name)

    meta = {
        "run_id": run_id,
        "generated_at": generated_at.isoformat(timespec="seconds"),
        "sequence": sequence,
        "report_dir": str(report_dir),
        "latest_dir": str(latest_dir),
        "archive_run_dir": str(archive_run_dir),
        "source_deliverables": str(deliverables_dir),
        "artifacts": copied,
    }
    save_json(report_dir / "report-meta.json", meta)
    save_json(latest_dir / "report-meta.json", meta)
    return report_dir, latest_dir, sequence


def build_stats(rows: list[dict], config: dict) -> dict:
    by_property = Counter(row.get("property", "") for row in rows)
    by_severity = Counter(row.get("severity", "") for row in rows)
    by_page = Counter(row.get("page_name", "") for row in rows)
    by_title = Counter(row.get("title_zh", "") for row in rows)
    by_page_property = Counter(f"{row.get('page_name', '')}::{row.get('property', '')}" for row in rows)
    return {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "issue_total": len(rows),
        "run_total": len({row.get("run_id", "") for row in rows}),
        "modes": {
            "archive": config.get("archive"),
            "stats": config.get("stats"),
            "insights": config.get("insights"),
            "skill_candidates": config.get("skill_candidates"),
            "update_skills": config.get("update_skills"),
        },
        "by_property": dict(by_property),
        "by_severity": dict(by_severity),
        "by_page": dict(by_page),
        "by_title": dict(by_title),
        "by_page_property": dict(by_page_property),
    }


def top_lines(counter: dict, empty: str = "暂无数据") -> list[str]:
    if not counter:
        return [f"- {empty}"]
    items = sorted(counter.items(), key=lambda item: (-item[1], item[0]))
    return [f"- `{key or '未分类'}`: {value}" for key, value in items[:10]]


def write_insights(path: Path, stats: dict) -> None:
    lines = [
        "# UI QA 高频问题洞察",
        "",
        f"- 生成时间：`{stats['generated_at']}`",
        f"- 归档运行数：`{stats['run_total']}`",
        f"- 问题总数：`{stats['issue_total']}`",
        "",
        "## 按问题类型",
        *top_lines(stats.get("by_property", {})),
        "",
        "## 按严重程度",
        *top_lines(stats.get("by_severity", {})),
        "",
        "## 按页面",
        *top_lines(stats.get("by_page", {})),
        "",
        "## 高频问题标题",
        *top_lines(stats.get("by_title", {})),
        "",
        "## 页面 x 问题类型",
        *top_lines(stats.get("by_page_property", {})),
        "",
    ]
    path.write_text("\n".join(lines), encoding="utf-8")


def candidate_rows(rows: list[dict]) -> list[tuple[tuple[str, str], list[dict]]]:
    groups: dict[tuple[str, str], list[dict]] = {}
    for row in rows:
        key = (row.get("property", ""), row.get("title_zh", ""))
        groups.setdefault(key, []).append(row)
    return sorted(groups.items(), key=lambda item: (-len(item[1]), item[0][0], item[0][1]))


def write_candidates(path: Path, rows: list[dict], config: dict) -> None:
    skill_mode = mode_label(config.get("skill_candidates", "review"))
    update_mode = mode_label(config.get("update_skills", "manual"))
    threshold = int(config.get("auto_promote_after_confirmed_count", 3))
    lines = [
        "# UI QA Skill 候选经验",
        "",
        f"- 候选生成模式：`{skill_mode}`",
        f"- 正式 skill 更新模式：`{update_mode}`",
        f"- 自动晋级建议阈值：人工确认 `{threshold}` 次后可进入自动经验草稿",
        "",
        "## 候选列表",
    ]
    for index, ((property_name, title), group) in enumerate(candidate_rows(rows), start=1):
        pages = sorted({item.get("page_name", "") for item in group if item.get("page_name")})
        severities = Counter(item.get("severity", "") for item in group)
        examples = group[:3]
        lines.extend(
            [
                "",
                f"### {index}. [{property_name or '未分类'}] {title or '未命名问题'}",
                f"- 出现次数：`{len(group)}`",
                f"- 涉及页面：{', '.join(pages) if pages else '待确认'}",
                f"- 严重程度分布：{dict(severities)}",
                f"- 建议目标 skill：`skills/ui-qa-experience/SKILL.md`",
                f"- 处理模式：`{skill_mode}` 生成候选，`{update_mode}` 写入正式 skill",
                "- 经验草稿：",
                f"  - 触发条件：页面出现 `{title}` 或同类 `{property_name}` 差异。",
                f"  - 排查重点：{examples[0].get('suspected_cause_zh') or '待补充'}",
                f"  - 修复建议：{examples[0].get('fix_suggestion_zh') or '待补充'}",
                "- 关联样例：",
            ]
        )
        for item in examples:
            lines.append(f"  - `{item.get('run_id')}` / `{item.get('issue_id')}` / {item.get('delta') or '无 delta'}")
    if len(lines) == 9:
        lines.append("- 暂无候选经验。")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def archive_run(
    report_path: Path,
    deliverables_dir: Path,
    archive_dir: Path,
    reports_dir: Path | None = None,
    config: dict | None = None,
    run_id: str | None = None,
    generated_at: str | datetime | None = None,
) -> dict:
    config = dict(DEFAULT_CONFIG if config is None else config)
    report = load_json(report_path)
    run_id = run_id or default_run_id(report)
    generated_at_dt = parse_generated_at(generated_at)
    archived_at = generated_at_dt.isoformat(timespec="seconds")

    run_dir = archive_dir / "runs" / run_id
    copy_artifacts(report_path, deliverables_dir, run_dir)
    reports_dir = reports_dir or AUTOMATION_ROOT / "reports"
    report_dir, latest_report_dir, report_sequence = copy_report_outputs(
        deliverables_dir=deliverables_dir,
        reports_dir=reports_dir,
        run_id=run_id,
        generated_at=generated_at_dt,
        archive_run_dir=run_dir,
    )

    issue_source = report.get("issues") or report.get("spotlights") or []
    normalized = [normalize_issue(report, issue, run_id, archived_at) for issue in issue_source]

    issues_path = archive_dir / "issues.jsonl"
    existing = [row for row in read_jsonl(issues_path) if row.get("run_id") != run_id]
    rows = existing + normalized
    write_jsonl(issues_path, rows)

    stats = build_stats(rows, config)
    save_json(archive_dir / "stats.json", stats)
    write_insights(archive_dir / "qa-insights.md", stats)
    write_candidates(archive_dir / "skill-candidates.md", rows, config)

    save_json(
        run_dir / "archive-meta.json",
        {
            "run_id": run_id,
            "archived_at": archived_at,
            "issue_count": len(normalized),
            "modes": stats["modes"],
            "report_dir": str(report_dir),
            "latest_report_dir": str(latest_report_dir),
        },
    )
    return {
        "run_id": run_id,
        "run_dir": str(run_dir),
        "issue_count": len(normalized),
        "archive_dir": str(archive_dir),
        "report_dir": str(report_dir),
        "latest_report_dir": str(latest_report_dir),
        "report_sequence": report_sequence,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Archive UI QA audit results and regenerate insight files.")
    parser.add_argument("--report", default=str(PROJECT_ROOT / "internal" / "report.json"), help="Path to internal/report.json")
    parser.add_argument("--deliverables", default=str(PROJECT_ROOT / "deliverables"), help="Path to deliverables directory")
    parser.add_argument("--archive-dir", default=str(AUTOMATION_ROOT / "archive"), help="Archive output directory")
    parser.add_argument("--reports-dir", default=str(AUTOMATION_ROOT / "reports"), help="Timestamped report output directory")
    parser.add_argument("--config", default=str(AUTOMATION_ROOT / "config" / "qa-automation.json"), help="Mode config JSON")
    parser.add_argument("--run-id", default="", help="Optional stable run id")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    config = load_config(Path(args.config))
    result = archive_run(
        report_path=Path(args.report),
        deliverables_dir=Path(args.deliverables),
        archive_dir=Path(args.archive_dir),
        reports_dir=Path(args.reports_dir),
        config=config,
        run_id=args.run_id or None,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
