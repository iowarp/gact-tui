import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class WorkflowReleaseConfigTests(unittest.TestCase):
    def test_go_workflow_toolchains_match_go_work_pin(self):
        workflows = [
            ROOT / ".github/workflows/ci.yml",
            ROOT / ".github/workflows/release.yml",
            ROOT / ".github/workflows/apps.yml",
        ]

        pins = {}
        for path in workflows:
            text = path.read_text(encoding="utf-8")
            matches = re.findall(r"go-version:\s*['\"]?([^'\"\n]+)['\"]?", text)
            self.assertTrue(matches, f"{path.relative_to(ROOT)} has no Go setup pin")
            pins[str(path.relative_to(ROOT))] = matches

        self.assertEqual(
            pins,
            {
                ".github/workflows/ci.yml": ["1.26.x", "1.26.x"],
                ".github/workflows/release.yml": ["1.26.x"],
                ".github/workflows/apps.yml": ["1.26.x"],
            },
        )


if __name__ == "__main__":
    unittest.main()
