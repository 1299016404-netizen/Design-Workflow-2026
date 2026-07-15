import importlib.util
import json
import shutil
import unittest
from pathlib import Path


def load_module(repo_root: Path):
    script = repo_root / "scripts" / "qa_archive.py"
    spec = importlib.util.spec_from_file_location("qa_archive", script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class QaArchiveTests(unittest.TestCase):
    def test_archive_report_generates_idempotent_outputs(self):
        repo_root = Path(__file__).resolve().parents[1]
        qa_archive = load_module(repo_root)

        root = repo_root / ".tmp-tests" / "qa-archive-test"
        if root.exists():
            shutil.rmtree(root)
        root.mkdir(parents=True)
        try:
            report_path = root / "internal" / "report.json"
            deliverables = root / "deliverables"
            archive_dir = root / "qa-archive"
            reports_dir = root / "reports"
            report_path.parent.mkdir()
            deliverables.mkdir()
            for name in [
                "summary-report.md",
                "summary-report.html",
                "issue-annotated.png",
                "overlay-preview.png",
                "dev-fix.md",
            ]:
                (deliverables / name).write_text(f"artifact {name}", encoding="utf-8")

            report = {
                "summary": {"status": "FAILED", "issue_total": 2, "p0_count": 1, "p1_count": 1, "p2_count": 0},
                "sources": {"page_name": "Hotel Detail", "platform": "mobile", "alignment_method": "module-first"},
                "issues": [
                    {
                        "id": "ISSUE-001",
                        "severity": "P0",
                        "property": "text",
                        "title_zh": "Occupancy text mismatch",
                        "delta": "2 people -> 1 person",
                        "bbox": {"x": 1, "y": 2, "width": 3, "height": 4},
                        "fix_suggestion_zh": "Use design occupancy value.",
                    },
                    {
                        "id": "ISSUE-002",
                        "severity": "P1",
                        "property": "size",
                        "title_zh": "Hero image height mismatch",
                        "delta": "height -75px",
                        "bbox": {"x": 5, "y": 6, "width": 7, "height": 8},
                        "fix_suggestion_zh": "Restore image container height.",
                    },
                ],
                "spotlights": [],
                "warnings": [],
            }
            report_path.write_text(json.dumps(report, ensure_ascii=False), encoding="utf-8")

            config = {
                "archive": "auto",
                "stats": "auto",
                "insights": "auto",
                "skill_candidates": "review",
                "update_skills": "manual",
                "auto_promote_after_confirmed_count": 3,
            }

            result1 = qa_archive.archive_run(
                report_path=report_path,
                deliverables_dir=deliverables,
                archive_dir=archive_dir,
                reports_dir=reports_dir,
                config=config,
                run_id="2026-05-06-hotel-detail",
                generated_at="2026-05-07T09:35:12",
            )
            result2 = qa_archive.archive_run(
                report_path=report_path,
                deliverables_dir=deliverables,
                archive_dir=archive_dir,
                reports_dir=reports_dir,
                config=config,
                run_id="2026-05-06-hotel-detail",
                generated_at="2026-05-07T09:35:12",
            )

            self.assertEqual(result1["issue_count"], 2)
            self.assertEqual(result2["issue_count"], 2)
            self.assertTrue((archive_dir / "runs" / "2026-05-06-hotel-detail" / "report.json").exists())
            self.assertTrue((archive_dir / "runs" / "2026-05-06-hotel-detail" / "summary-report.html").exists())

            first_report_dir = reports_dir / "runs" / "2026-05-07" / "2026-05-07_09-35-12"
            second_report_dir = reports_dir / "runs" / "2026-05-07" / "2026-05-07_09-35-12-002"
            self.assertEqual(Path(result1["report_dir"]), first_report_dir)
            self.assertEqual(Path(result2["report_dir"]), second_report_dir)
            self.assertTrue((first_report_dir / "summary-report.html").exists())
            self.assertTrue((second_report_dir / "summary-report.html").exists())
            self.assertTrue((reports_dir / "latest" / "summary-report.html").exists())

            meta = json.loads((second_report_dir / "report-meta.json").read_text(encoding="utf-8"))
            self.assertEqual(meta["run_id"], "2026-05-06-hotel-detail")
            self.assertEqual(meta["generated_at"], "2026-05-07T09:35:12")
            self.assertEqual(meta["sequence"], 2)

            issues = [
                json.loads(line)
                for line in (archive_dir / "issues.jsonl").read_text(encoding="utf-8").splitlines()
                if line.strip()
            ]
            self.assertEqual(len(issues), 2)
            self.assertEqual({item["property"] for item in issues}, {"text", "size"})

            stats = json.loads((archive_dir / "stats.json").read_text(encoding="utf-8"))
            self.assertEqual(stats["issue_total"], 2)
            self.assertEqual(stats["by_property"]["text"], 1)
            self.assertEqual(stats["by_property"]["size"], 1)
            self.assertIn("Review", (archive_dir / "skill-candidates.md").read_text(encoding="utf-8"))
        finally:
            if root.exists():
                shutil.rmtree(root)


if __name__ == "__main__":
    unittest.main()
