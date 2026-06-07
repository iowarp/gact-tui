import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from assert_live_observability import observations, ordered_sequence_before_completion, runtime_provenance_agreement


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
            {"t": 1.0, "event": "message.completed"},
        ]

        ok, chosen, missing = ordered_sequence_before_completion(
            observations(rows),
            ["route_or_delegate", "child_expert_active", "tool_started", "tool_completed", "parent_resumed"],
            min_live_lead_s=0.25,
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
            {"t": 0.8, "event": "message.completed"},
            {"t": 0.9, "event": "semantic.event", "payload": {"event_type": "delegation.parent_resumed"}},
        ]

        ok, _, missing = ordered_sequence_before_completion(
            observations(rows),
            ["route_or_delegate", "child_expert_active", "tool_started", "tool_completed", "parent_resumed"],
            min_live_lead_s=0.25,
        )

        self.assertFalse(ok)
        self.assertEqual(missing, ["parent_resumed"])

    def test_parent_resume_in_final_burst_fails_benchmark_hierarchy(self):
        rows = [
            {"t": 0.1, "event": "message.part.added", "part_type": "routing_decision"},
            {"t": 0.2, "event": "message.part.added", "part_type": "expert_handoff", "stage": "tool.started"},
            {"t": 0.3, "event": "tool.call.started", "tool": "read_file"},
            {"t": 0.4, "event": "tool.call.completed", "tool": "read_file"},
            {"t": 0.999, "event": "semantic.event", "payload": {"event_type": "delegation.parent_resumed"}},
            {"t": 1.0, "event": "message.completed"},
        ]

        ok, _, missing = ordered_sequence_before_completion(
            observations(rows),
            ["route_or_delegate", "child_expert_active", "tool_started", "tool_completed", "parent_resumed"],
            min_live_lead_s=0.25,
        )

        self.assertFalse(ok)
        self.assertEqual(missing, ["parent_resumed"])

    def test_clio_semantic_delegation_payload_classifies_hierarchy(self):
        rows = [
            {
                "t": 0.05,
                "event": "semantic.event",
                "payload": {
                    "payload": {
                        "event_type": "agent.invocation.started",
                        "status": "running",
                        "actor": {"agent_id": "data"},
                        "payload": {"selected_agent": "data"},
                    }
                },
            },
            {
                "t": 0.1,
                "event": "semantic.event",
                "payload": {
                    "payload": {
                        "event_type": "delegation.started",
                        "status": "running",
                        "actor": {"agent_id": "data", "role": "parent_expert"},
                        "subject": {"agent_id": "ndp_catalog", "role": "child_expert"},
                        "payload": {"stage": "delegate.started", "parent_id": "data", "agent_id": "ndp_catalog"},
                    }
                },
            },
            {
                "t": 0.2,
                "event": "semantic.event",
                "payload": {
                    "payload": {
                        "event_type": "tool.call.started",
                        "actor": {"tool": "ndp_search_datasets"},
                        "subject": {"call_id": "call_1"},
                        "payload": {"tool": "ndp_search_datasets", "call_id": "call_1"},
                    }
                },
            },
            {
                "t": 0.3,
                "event": "semantic.event",
                "payload": {
                    "payload": {
                        "event_type": "tool.call.completed",
                        "actor": {"tool": "ndp_search_datasets"},
                        "subject": {"call_id": "call_1"},
                        "payload": {"tool": "ndp_search_datasets", "call_id": "call_1", "ok": True},
                    }
                },
            },
            {
                "t": 0.4,
                "event": "semantic.event",
                "payload": {
                    "payload": {
                        "event_type": "delegation.parent_resumed",
                        "actor": {"agent_id": "data", "role": "parent_expert"},
                        "subject": {"agent_id": "ndp_catalog", "role": "child_expert"},
                        "payload": {"stage": "parent.resumed", "parent_id": "data", "agent_id": "ndp_catalog"},
                    }
                },
            },
            {"t": 1.0, "event": "message.completed"},
        ]

        ok, chosen, missing = ordered_sequence_before_completion(
            observations(rows),
            ["route_or_delegate", "child_expert_active", "tool_started", "tool_completed", "parent_resumed"],
            min_live_lead_s=0.25,
        )

        self.assertTrue(ok, missing)
        self.assertEqual([item.kind for item in chosen], [
            "route_or_delegate",
            "child_expert_active",
            "tool_started",
            "tool_completed",
            "parent_resumed",
        ])
        self.assertIn("data -> ndp_catalog", chosen[1].detail)
        self.assertIn("ndp_search_datasets", chosen[2].detail)

    def test_blueprint_semantic_delegation_payload_classifies_hierarchy(self):
        rows = [
            {
                "t": 0.05,
                "event": "semantic.event",
                "payload": {
                    "payload": {
                        "event_type": "agent.invocation.started",
                        "status": "running",
                        "actor": {"agent_id": "data"},
                        "payload": {"selected_agent": "data"},
                    }
                },
            },
            {
                "t": 0.1,
                "event": "semantic.event",
                "payload": {
                    "payload": {
                        "event_type": "blueprint.delegation.started",
                        "status": "running",
                        "actor": {"agent_id": "data", "role": "parent_expert"},
                        "subject": {"agent_id": "ndp_catalog", "role": "child_expert"},
                        "payload": {"stage": "delegate.started", "parent_id": "data", "agent_id": "ndp_catalog"},
                    }
                },
            },
            {
                "t": 0.2,
                "event": "semantic.event",
                "payload": {"payload": {"event_type": "tool.call.started", "payload": {"tool": "ndp_search_datasets"}}},
            },
            {
                "t": 0.3,
                "event": "semantic.event",
                "payload": {"payload": {"event_type": "tool.call.completed", "payload": {"tool": "ndp_search_datasets"}}},
            },
            {
                "t": 0.4,
                "event": "semantic.event",
                "payload": {
                    "payload": {
                        "event_type": "blueprint.delegation.parent_resumed",
                        "actor": {"agent_id": "data", "role": "parent_expert"},
                        "subject": {"agent_id": "ndp_catalog", "role": "child_expert"},
                        "payload": {"stage": "parent.resumed", "parent_id": "data", "agent_id": "ndp_catalog"},
                    }
                },
            },
            {"t": 1.0, "event": "message.completed"},
        ]

        ok, chosen, missing = ordered_sequence_before_completion(
            observations(rows),
            ["route_or_delegate", "child_expert_active", "tool_started", "tool_completed", "parent_resumed"],
            min_live_lead_s=0.25,
        )

        self.assertTrue(ok, missing)
        self.assertEqual([item.kind for item in chosen], [
            "route_or_delegate",
            "child_expert_active",
            "tool_started",
            "tool_completed",
            "parent_resumed",
        ])

    def test_blueprint_fanout_payload_classifies_hierarchy_activity(self):
        rows = [
            {
                "t": 0.05,
                "event": "semantic.event",
                "payload": {
                    "payload": {
                        "event_type": "agent.invocation.started",
                        "status": "running",
                        "actor": {"agent_id": "data"},
                        "payload": {"selected_agent": "data"},
                    }
                },
            },
            {
                "t": 0.1,
                "event": "semantic.event",
                "payload": {
                    "payload": {
                        "event_type": "blueprint.fanout.started",
                        "status": "running",
                        "actor": {"agent_id": "data", "role": "fanout_parent"},
                        "subject": {"child_agent_ids": ["analysis", "visualization"]},
                        "payload": {
                            "requested_child_agent_ids": ["analysis", "visualization"],
                            "skipped_child_agent_ids": [],
                        },
                    }
                },
            },
            {"t": 0.2, "event": "semantic.event", "payload": {"payload": {"event_type": "tool.call.started", "payload": {"tool": "fanout_to_children"}}}},
            {"t": 0.3, "event": "semantic.event", "payload": {"payload": {"event_type": "tool.call.completed", "payload": {"tool": "fanout_to_children"}}}},
            {
                "t": 0.4,
                "event": "semantic.event",
                "payload": {
                    "payload": {
                        "event_type": "blueprint.fanout.completed",
                        "status": "completed",
                        "actor": {"agent_id": "data", "role": "fanout_parent"},
                        "subject": {"child_agent_ids": ["analysis", "visualization"]},
                        "payload": {
                            "stage": "fanout.completed",
                            "executed_child_agent_ids": ["analysis", "visualization"],
                            "result_count": 2,
                        },
                    }
                },
            },
            {
                "t": 0.5,
                "event": "semantic.event",
                "payload": {
                    "payload": {
                        "event_type": "blueprint.delegation.parent_resumed",
                        "actor": {"agent_id": "main", "role": "parent_expert"},
                        "subject": {"agent_id": "data", "role": "child_expert"},
                        "payload": {"stage": "parent.resumed", "parent_id": "main", "agent_id": "data"},
                    }
                },
            },
            {"t": 1.0, "event": "message.completed"},
        ]

        ok, chosen, missing = ordered_sequence_before_completion(
            observations(rows),
            ["route_or_delegate", "child_expert_active", "tool_started", "tool_completed", "parent_resumed"],
            min_live_lead_s=0.25,
        )

        self.assertTrue(ok, missing)
        self.assertEqual([item.kind for item in chosen], [
            "route_or_delegate",
            "child_expert_active",
            "tool_started",
            "tool_completed",
            "parent_resumed",
        ])

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

    def test_flattened_semantic_rows_classify_benchmark_hierarchy(self):
        rows = [
            {
                "t": 0.1,
                "event": "semantic.event",
                "event_type": "agent.invocation.started",
                "agent_id": "orchestrator",
            },
            {
                "t": 0.2,
                "event": "semantic.event",
                "event_type": "blueprint.delegation.started",
                "parent_id": "orchestrator",
                "agent_id": "ndp_catalog",
            },
            {
                "t": 0.3,
                "event": "semantic.event",
                "event_type": "tool.call.started",
                "tool": "ndp_search_datasets",
            },
            {
                "t": 0.4,
                "event": "semantic.event",
                "event_type": "tool.call.completed",
                "tool": "ndp_search_datasets",
            },
            {
                "t": 0.5,
                "event": "semantic.event",
                "event_type": "blueprint.delegation.parent_resumed",
                "parent_id": "orchestrator",
                "agent_id": "ndp_catalog",
            },
            {"t": 1.0, "event": "message.completed"},
        ]

        ok, chosen, missing = ordered_sequence_before_completion(
            observations(rows),
            ["route_or_delegate", "child_expert_active", "tool_started", "tool_completed", "parent_resumed"],
            min_live_lead_s=0.25,
        )

        self.assertTrue(ok, missing)
        self.assertEqual([item.kind for item in chosen], [
            "route_or_delegate",
            "child_expert_active",
            "tool_started",
            "tool_completed",
            "parent_resumed",
        ])

    def test_runtime_provenance_agreement_matches_live_timeline(self):
        rows = [
            {
                "t": 0.1,
                "event": "semantic.event",
                "event_type": "delegation.started",
                "trace_id": "trace_1",
                "parent_id": "orchestrator",
                "agent_id": "data",
            },
            {
                "t": 0.2,
                "event": "semantic.event",
                "event_type": "tool.call.started",
                "trace_id": "trace_1",
                "tool": "ndp_search_datasets",
            },
            {
                "t": 0.3,
                "event": "semantic.event",
                "event_type": "tool.call.completed",
                "trace_id": "trace_1",
                "tool": "ndp_search_datasets",
            },
            {
                "t": 0.4,
                "event": "semantic.event",
                "event_type": "delegation.parent_resumed",
                "trace_id": "trace_1",
                "parent_id": "orchestrator",
                "agent_id": "data",
            },
            {
                "t": 0.9,
                "event": "message.completed",
                "runtime_provenance": {
                    "turn": {"trace_id": "trace_1"},
                    "agent": {"selected_agent_id": "data", "active_expert_id": "data", "parent_id": "orchestrator"},
                    "tools": {"observed": [{"name": "ndp_search_datasets"}]},
                    "delegation": {
                        "events": [
                            {"stage": "delegate.started", "parent_id": "orchestrator", "agent_id": "data"},
                            {"stage": "parent.resumed", "parent_id": "orchestrator", "agent_id": "data"},
                        ]
                    },
                },
            },
        ]

        agreement = runtime_provenance_agreement(rows)

        self.assertTrue(agreement.ok, agreement.missing)
        self.assertTrue(any(item.startswith("trace_id: trace_1") for item in agreement.matched))
        self.assertTrue(any("observed tools: ndp_search_datasets" == item for item in agreement.matched))
        self.assertTrue(any("parent resume: orchestrator->data" == item for item in agreement.matched))

    def test_runtime_provenance_agreement_accepts_live_fanout_child_sets(self):
        rows = [
            {
                "t": 0.1,
                "event": "semantic.event",
                "event_type": "blueprint.fanout.started",
                "trace_id": "trace_1",
                "actor": {"agent_id": "data"},
                "subject": {"child_agent_ids": ["analysis"]},
            },
            {
                "t": 0.9,
                "event": "message.completed",
                "runtime_provenance": {
                    "turn": {"trace_id": "trace_1"},
                    "agent": {"selected_agent_id": "analysis", "parent_id": "data"},
                    "tools": {"observed": []},
                    "delegation": {
                        "events": [
                            {"stage": "fanout.started", "parent_id": "data", "agent_id": "analysis"},
                        ]
                    },
                },
            },
        ]

        agreement = runtime_provenance_agreement(rows)

        self.assertTrue(agreement.ok, agreement.missing)
        self.assertIn("delegation rows: data->analysis", agreement.matched)

    def test_runtime_provenance_agreement_accepts_turn_completed_metadata(self):
        rows = [
            {
                "t": 0.1,
                "event": "semantic.event",
                "event_type": "delegation.started",
                "trace_id": "trace_1",
                "parent_id": "data",
                "agent_id": "ndp_catalog",
            },
            {
                "t": 0.2,
                "event": "semantic.event",
                "event_type": "tool.call.started",
                "trace_id": "trace_1",
                "tool": "NdpSearchDatasets",
            },
            {
                "t": 0.3,
                "event": "semantic.event",
                "event_type": "tool.call.completed",
                "trace_id": "trace_1",
                "tool": "NdpSearchDatasets",
            },
            {
                "t": 0.4,
                "event": "semantic.event",
                "event_type": "delegation.parent_resumed",
                "trace_id": "trace_1",
                "parent_id": "data",
                "agent_id": "ndp_catalog",
            },
            {
                "t": 0.9,
                "event": "semantic.event",
                "event_type": "turn.completed",
                "trace_id": "trace_1",
                "payload": {
                    "payload": {
                        "metadata": {
                            "tools_called": [{"name": "NdpSearchDatasets"}],
                            "expert_handoffs": [
                                {
                                    "stage": "delegate.started",
                                    "parent_id": "data",
                                    "agent_id": "ndp_catalog",
                                },
                                {
                                    "stage": "parent.resumed",
                                    "parent_id": "data",
                                    "agent_id": "ndp_catalog",
                                },
                            ],
                        }
                    }
                },
            },
            {"t": 1.0, "event": "message.completed"},
        ]

        agreement = runtime_provenance_agreement(rows)

        self.assertTrue(agreement.ok, agreement.missing)
        self.assertIn("observed tools: NdpSearchDatasets", agreement.matched)
        self.assertIn("parent resume: data->ndp_catalog", agreement.matched)

    def test_runtime_provenance_agreement_accepts_resumed_from_metadata(self):
        rows = [
            {
                "t": 0.1,
                "event": "semantic.event",
                "event_type": "blueprint.delegation.completed",
                "trace_id": "trace_1",
                "parent_id": "main",
                "agent_id": "data",
                "stage": "delegate.completed",
            },
            {
                "t": 0.2,
                "event": "semantic.event",
                "event_type": "tool.call.started",
                "trace_id": "trace_1",
                "tool": "hdf5_list_datasets",
            },
            {
                "t": 0.3,
                "event": "semantic.event",
                "event_type": "tool.call.completed",
                "trace_id": "trace_1",
                "tool": "hdf5_list_datasets",
            },
            {
                "t": 0.4,
                "event": "semantic.event",
                "event_type": "blueprint.delegation.parent_resumed",
                "trace_id": "trace_1",
                "agent_id": "main",
                "stage": "parent.resumed",
            },
            {
                "t": 0.9,
                "event": "semantic.event",
                "event_type": "turn.completed",
                "trace_id": "trace_1",
                "payload": {
                    "payload": {
                        "metadata": {
                            "tools_called": [{"name": "hdf5_list_datasets"}],
                            "expert_handoffs": [
                                {
                                    "stage": "delegate.completed",
                                    "parent_id": "main",
                                    "agent_id": "data",
                                },
                                {
                                    "stage": "parent.resumed",
                                    "agent_id": "main",
                                    "resumed_from": "data",
                                },
                            ],
                        }
                    }
                },
            },
            {"t": 1.0, "event": "message.completed"},
        ]

        agreement = runtime_provenance_agreement(rows)

        self.assertTrue(agreement.ok, agreement.missing)
        self.assertIn("parent resume: main->data", agreement.matched)

    def test_runtime_provenance_agreement_requires_final_provenance(self):
        rows = [
            {"t": 0.1, "event": "semantic.event", "event_type": "tool.call.started", "tool": "read_file"},
            {"t": 0.2, "event": "semantic.event", "event_type": "tool.call.completed", "tool": "read_file"},
            {"t": 0.3, "event": "message.completed"},
        ]

        agreement = runtime_provenance_agreement(rows)

        self.assertFalse(agreement.ok)
        self.assertEqual(agreement.missing, ["runtime_provenance missing"])

    def test_runtime_provenance_agreement_fails_mismatched_tools(self):
        rows = [
            {"t": 0.1, "event": "semantic.event", "event_type": "tool.call.started", "tool": "ndp_search_datasets"},
            {"t": 0.2, "event": "semantic.event", "event_type": "tool.call.completed", "tool": "ndp_search_datasets"},
            {
                "t": 0.3,
                "event": "message.completed",
                "runtime_provenance": {
                    "tools": {"observed": [{"name": "read_file"}]},
                },
            },
        ]

        agreement = runtime_provenance_agreement(rows)

        self.assertFalse(agreement.ok)
        self.assertTrue(any(item.startswith("observed tools agreement") for item in agreement.missing))


if __name__ == "__main__":
    unittest.main()
