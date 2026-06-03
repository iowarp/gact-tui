import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from assert_live_observability import observations
from capture_live_observability import summarize


class LiveObservabilityCaptureTests(unittest.TestCase):
    def test_summarize_preserves_semantic_payload_for_hierarchy_classification(self):
        event = {
            "monotonic": 12.5,
            "event": "semantic.event",
            "payload": {
                "payload": {
                    "event_type": "delegation.started",
                    "trace_id": "trace-1",
                    "turn_id": "turn-1",
                    "status": "running",
                    "actor": {"agent_id": "orchestrator", "role": "parent_expert"},
                    "subject": {"agent_id": "ndp_catalog", "role": "child_expert"},
                    "payload": {
                        "stage": "delegate.started",
                        "parent_id": "orchestrator",
                        "agent_id": "ndp_catalog",
                        "execution_path": "orchestrator -> ndp_catalog",
                    },
                }
            },
        }

        summary = summarize(event, 10.0)

        self.assertEqual(summary["t"], 2.5)
        self.assertEqual(summary["event_type"], "delegation.started")
        self.assertEqual(summary["trace_id"], "trace-1")
        self.assertEqual(summary["turn_id"], "turn-1")
        self.assertEqual(summary["parent_id"], "orchestrator")
        self.assertEqual(summary["agent_id"], "ndp_catalog")
        self.assertEqual(summary["stage"], "delegate.started")
        self.assertIn("payload", summary)

        kinds = [item.kind for item in observations([summary])]
        self.assertIn("route_or_delegate", kinds)
        self.assertIn("child_expert_active", kinds)


if __name__ == "__main__":
    unittest.main()
