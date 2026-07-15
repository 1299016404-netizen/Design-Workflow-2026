import importlib.util
import unittest
from pathlib import Path

from PIL import Image, ImageDraw


def load_render_module(repo_root: Path):
    script = repo_root / "skills" / "ui-precision-audit" / "scripts" / "render_audit_pack.py"
    spec = importlib.util.spec_from_file_location("render_audit_pack", script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class IssueBadgeSizingTests(unittest.TestCase):
    def test_badge_metrics_are_readable_after_html_scaling(self):
        repo_root = Path(__file__).resolve().parents[2]
        render = load_render_module(repo_root)

        metrics = render.issue_badge_metrics((1500, 1486))

        self.assertGreaterEqual(metrics["badge_radius"] * 2, 96)
        self.assertGreaterEqual(metrics["badge_font_size"], 56)
        self.assertGreaterEqual(metrics["lane_gutter"], metrics["badge_radius"] * 2 + 32)
        self.assertGreaterEqual(metrics["minimum_gap"], metrics["badge_radius"] * 2 + 28)

    def test_badge_text_position_centers_real_glyph_bounds(self):
        repo_root = Path(__file__).resolve().parents[2]
        render = load_render_module(repo_root)
        image = Image.new("RGBA", (240, 240), (255, 255, 255, 0))
        draw = ImageDraw.Draw(image)
        font = render.load_font(72)

        for label in ["1", "2", "4", "10"]:
            text_x, text_y = render.badge_text_position(draw, label, font, 120, 120)
            bbox = draw.textbbox((text_x, text_y), label, font=font)
            center_x = (bbox[0] + bbox[2]) / 2
            center_y = (bbox[1] + bbox[3]) / 2

            self.assertAlmostEqual(center_x, 120, delta=0.5)
            self.assertAlmostEqual(center_y, 120, delta=0.5)


if __name__ == "__main__":
    unittest.main()
