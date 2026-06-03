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

    def test_summarize_preserves_final_runtime_provenance(self):
        event = {
            "monotonic": 15.0,
            "event": "message.completed",
            "payload": {
                "message_id": "msg_1",
                "stop_reason": "end_turn",
                "metadata": {
                    "runtime_provenance": {
                        "turn": {"trace_id": "trace-1"},
                        "agent": {"active_expert_id": "ndp_catalog"},
                        "tools": {"observed": [{"name": "ndp_search_datasets"}]},
                    }
                },
            },
        }

        summary = summarize(event, 10.0)

        self.assertEqual(summary["event"], "message.completed")
        self.assertEqual(summary["message_id"], "msg_1")
        self.assertEqual(summary["runtime_provenance"]["turn"]["trace_id"], "trace-1")
        self.assertEqual(
            summary["runtime_provenance"]["tools"]["observed"][0]["name"],
            "ndp_search_datasets",
        )


if __name__ == "__main__":
    unittest.main()
