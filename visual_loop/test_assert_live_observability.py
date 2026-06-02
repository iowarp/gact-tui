import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from assert_live_observability import observations, ordered_sequence_before_completion


class LiveObservabilityAssertionTests(unittest.TestCase):
    def test_benchmark_hierarchy_passes_only_when_parent_resume_precedes_completion(self):
        rows = [
            {
                "t": 0.1,
                "event": "message.part.added",
                "part_type": "routing_decision",
                "execution_path": "orchestrator -> data",
                "selected_agent": "data",
            },
            {
                "t": 0.2,
                "event": "semantic.event",
                "payload": {"event_type": "delegation.started", "agent_id": "ndp_catalog"},
            },
            {"t": 0.3, "event": "tool.call.started", "tool": "ndp_search_datasets"},
            {"t": 0.4, "event": "tool.call.completed", "tool": "ndp_search_datasets"},
            {
                "t": 0.5,
                "event": "semantic.event",
                "payload": {"event_type": "delegation.parent_resumed"},
            },
            {"t": 0.6, "event": "message.completed"},
        ]

        ok, chosen, missing = ordered_sequence_before_completion(
            observations(rows),
            ["route_or_delegate", "child_expert_active", "tool_started", "tool_completed", "parent_resumed"],
        )

        self.assertTrue(ok, missing)
        self.assertEqual([item.kind for item in chosen], [
            "route_or_delegate",
            "child_expert_active",
            "tool_started",
            "tool_completed",
            "parent_resumed",
        ])

    def test_parent_resume_after_completion_fails_benchmark_hierarchy(self):
        rows = [
            {"t": 0.1, "event": "message.part.added", "part_type": "routing_decision"},
            {"t": 0.2, "event": "message.part.added", "part_type": "expert_handoff", "stage": "tool.started"},
            {"t": 0.3, "event": "tool.call.started", "tool": "read_file"},
            {"t": 0.4, "event": "tool.call.completed", "tool": "read_file"},
            {"t": 0.5, "event": "message.completed"},
            {"t": 0.6, "event": "semantic.event", "payload": {"event_type": "delegation.parent_resumed"}},
        ]

        ok, _, missing = ordered_sequence_before_completion(
            observations(rows),
            ["route_or_delegate", "child_expert_active", "tool_started", "tool_completed", "parent_resumed"],
        )

        self.assertFalse(ok)
        self.assertEqual(missing, ["parent_resumed"])

    def test_basic_tools_mode_does_not_require_hierarchy(self):
        rows = [
            {"t": 0.3, "event": "tool.call.started", "tool": "read_file"},
            {"t": 0.4, "event": "tool.call.completed", "tool": "read_file"},
            {"t": 0.5, "event": "message.completed"},
        ]

        ok, chosen, missing = ordered_sequence_before_completion(
            observations(rows),
            ["tool_started", "tool_completed"],
        )

        self.assertTrue(ok, missing)
        self.assertEqual([item.kind for item in chosen], ["tool_started", "tool_completed"])


if __name__ == "__main__":
    unittest.main()
