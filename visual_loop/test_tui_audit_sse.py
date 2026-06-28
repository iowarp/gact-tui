import unittest

from tui_audit_sse import parse_sse_block


class TuiAuditSseTest(unittest.TestCase):
    def test_parse_sse_block_extracts_event_metadata_and_json_payload(self) -> None:
        parsed = parse_sse_block(
            [
                "id: evt-1",
                "event: semantic.event",
                'data: {"type": "semantic.event"}',
            ]
        )

        self.assertEqual(parsed["kind"], "semantic.event")
        self.assertEqual(parsed["event_id"], "evt-1")
        self.assertEqual(parsed["data_text"], '{"type": "semantic.event"}')
        self.assertEqual(parsed["data"], {"type": "semantic.event"})

    def test_parse_sse_block_preserves_non_json_data_text(self) -> None:
        parsed = parse_sse_block(["data: plain", "data: text"])

        self.assertEqual(parsed["kind"], "message")
        self.assertEqual(parsed["data_text"], "plain\ntext")
        self.assertIsNone(parsed["data"])


if __name__ == "__main__":
    unittest.main()
