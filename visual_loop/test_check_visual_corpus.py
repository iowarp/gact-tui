import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_visual_corpus


class VisualCorpusCheckTest(unittest.TestCase):
    def test_complete_manifest_passes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for group in check_visual_corpus.CORPUS_GROUPS:
                for rel in group.required:
                    path = root / rel
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_text("artifact\n", encoding="utf-8")

            result = check_visual_corpus.check_corpus(root)

        self.assertTrue(result["ok"])
        self.assertTrue(all(not group["missing"] for group in result["groups"]))

    def test_missing_or_empty_artifacts_fail(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            first = check_visual_corpus.CORPUS_GROUPS[0]
            empty = root / first.required[0]
            empty.parent.mkdir(parents=True, exist_ok=True)
            empty.write_text("", encoding="utf-8")

            result = check_visual_corpus.check_corpus(root)

        self.assertFalse(result["ok"])
        first_group = result["groups"][0]
        self.assertIn(first.required[0] + " (empty)", first_group["missing"])
        self.assertIn(first.required[1] + " (missing)", first_group["missing"])


if __name__ == "__main__":
    unittest.main()
