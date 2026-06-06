import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_slash_command_coverage


def write_repo(root: Path, app_source: str, ledger: str) -> None:
    app = root / "tui/internal/ui/app.go"
    app.parent.mkdir(parents=True, exist_ok=True)
    app.write_text(app_source, encoding="utf-8")
    coverage = root / "visual_loop/SLASH_COMMAND_VISUAL_COVERAGE.md"
    coverage.parent.mkdir(parents=True, exist_ok=True)
    coverage.write_text(ledger, encoding="utf-8")


APP_SOURCE = '''
func (a *App) paletteMatches() []gact.Command {
	localCmds := []gact.Command{
		localCmd("/clear", "command.clear.title", "command.clear.desc"),
		{ID: "/permissions", Title: "Permissions", Source: "builtin"},
	}
	if a.caps.Capabilities.IntegrationHealth {
	}
}
var helpTabs = []struct { title string; keys []helpKey }{
	{
		title: "Commands",
		keys: []helpKey{
			{"/clear", "help.commands.clear"},
			{"/permissions", "help.commands.permissions"},
		},
	},
}
'''


LEDGER = """
## Canonical Commands

| Command | Area | Representative visual proof | Deferred command-specific captures |
| --- | --- | --- | --- |
| `/clear` | Session | shared proof | None |
| `/permissions` | Diagnostics | shared proof | None |

## Hidden Or Folded Commands

| Command | Operator treatment | Visual proof |
| --- | --- | --- |
| `/catalog` | Folded into `/tools` | palette proof |
"""


class SlashCommandCoverageCheckTest(unittest.TestCase):
    def test_clean_command_model_passes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_repo(root, APP_SOURCE, LEDGER)

            result = check_slash_command_coverage.audit(root)

        self.assertTrue(result["ok"])
        self.assertEqual(result["missing_from_ledger"], [])
        self.assertEqual(result["missing_from_help"], [])

    def test_builtin_palette_command_requires_ledger_row(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = APP_SOURCE.replace(
                'localCmd("/clear", "command.clear.title", "command.clear.desc"),',
                'localCmd("/clear", "command.clear.title", "command.clear.desc"),\n\t\tlocalCmd("/mode", "command.mode.title", "command.mode.desc"),',
            )
            write_repo(root, source, LEDGER)

            result = check_slash_command_coverage.audit(root)

        self.assertFalse(result["ok"])
        self.assertEqual(result["missing_from_ledger"], ["/mode"])

    def test_missing_source_files_fail_without_throwing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)

            result = check_slash_command_coverage.audit(root)

        self.assertFalse(result["ok"])
        self.assertEqual(
            result["missing_files"],
            [
                "tui/internal/ui/app.go",
                "visual_loop/SLASH_COMMAND_VISUAL_COVERAGE.md",
            ],
        )

    def test_canonical_command_requires_help_discoverability(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            ledger = LEDGER.replace(
                "| `/permissions` | Diagnostics | shared proof | None |",
                "| `/permissions` | Diagnostics | shared proof | None |\n| `/mode` | Session | shared proof | None |",
            )
            write_repo(root, APP_SOURCE, ledger)

            result = check_slash_command_coverage.audit(root)

        self.assertFalse(result["ok"])
        self.assertEqual(result["missing_from_help"], ["/mode"])

    def test_folded_command_must_not_appear_in_help(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = APP_SOURCE.replace(
                '{"/permissions", "help.commands.permissions"},',
                '{"/permissions", "help.commands.permissions"},\n\t\t\t{"/catalog", "help.commands.catalog"},',
            )
            write_repo(root, source, LEDGER)

            result = check_slash_command_coverage.audit(root)

        self.assertFalse(result["ok"])
        self.assertEqual(result["folded_in_help"], ["/catalog"])


if __name__ == "__main__":
    unittest.main()
