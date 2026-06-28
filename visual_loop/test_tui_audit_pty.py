import subprocess
import sys
import unittest

from tui_audit_pty import strip_ansi, terminate_process


class TuiAuditPtyTest(unittest.TestCase):
    def test_strip_ansi_removes_terminal_control_sequences(self) -> None:
        raw = (
            b"\x1b[31mred\x1b[0m "
            b"\x1b]0;title\x07"
            b"\x1b(Bplain"
        )

        self.assertEqual(strip_ansi(raw), "red plain")

    def test_terminate_process_stops_process_group(self) -> None:
        proc = subprocess.Popen(
            [sys.executable, "-c", "import time; time.sleep(30)"],
            start_new_session=True,
        )
        self.addCleanup(lambda: terminate_process(proc))

        terminate_process(proc)

        self.assertIsNotNone(proc.poll())


if __name__ == "__main__":
    unittest.main()
