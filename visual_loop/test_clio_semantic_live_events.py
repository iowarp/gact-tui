import unittest
from pathlib import Path


class ClioSemanticLiveEventsFixtureTests(unittest.TestCase):
    def test_fixture_emits_parent_resume_hierarchy_events(self) -> None:
        script = Path("visual_loop/run_clio_semantic_live_events.sh").read_text(encoding="utf-8")

        for want in (
            "_active_semantic_trace_id",
            "_active_semantic_turn_id",
            "_emit_semantic_event",
            '"delegation.started"',
            '"delegation.completed"',
            '"delegation.parent_resumed"',
            '"stage": "parent.resumed"',
            '"resumed_from": "ndp_catalog"',
            "pred.expert_handoffs",
        ):
            self.assertIn(want, script)

        self.assertLess(
            script.index('"delegation.started"'),
            script.index('_GLOBAL_TOOL_OBSERVER("NdpSearchDatasets", args, "started", None)'),
        )
        self.assertLess(
            script.index('_GLOBAL_TOOL_OBSERVER("NdpSearchDatasets", args, "completed", None)'),
            script.index('"delegation.parent_resumed"'),
        )


if __name__ == "__main__":
    unittest.main()
