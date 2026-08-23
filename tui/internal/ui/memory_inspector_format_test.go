package ui

import (
	"strings"
	"testing"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func TestFormatMemoryInspectorShowsSessionAndGlobalContext(t *testing.T) {
	budget := 4000
	out := formatMemoryInspector(gact.MemoryStats{
		Cache: gact.CacheStats{Hits: 3, Misses: 1, HitRate: 0.75, Capacity: 64},
		Global: gact.GlobalMemoryStats{
			ConversationsTotal: 5,
			InvocationsTotal:   9,
		},
		Session: &gact.SessionMemoryStats{
			SessionID:        "sess_1",
			MessagesRetained: 7,
			TokensRetained:   1234,
			TokensBudget:     &budget,
			ProfilesAttached: 2,
		},
	})

	for _, want := range []string{
		"Operator summary",
		"current context: 7 retained session messages · no context frame reported",
		"retrieval status: ARC cache exercised · 75.0% · 4 lookups",
		"agent memory access: not checked for this session",
		"operator action: send a turn to capture the next context frame",
		"scope: current session",
		"retrieval cache: 75.0% hit rate · 3 hits · 1 misses",
		"context pressure: low (30.9%)",
		"Context cache",
		"hit rate: 75.0%",
		"purpose: recent-context recall",
		"Global memory",
		"conversations: 5",
		"Current session context",
		"messages retained: 7",
		"token budget: 4000",
		"context usage: 1234 / 4000 tokens (30.9%)",
		"remaining budget: 2766 tokens",
		"pressure: low (30.9%)",
		"profiles attached: 2",
		"Compaction",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("memory inspector missing %q:\n%s", want, out)
		}
	}
}

func TestFormatMemoryInspectorShowsOverBudgetAmount(t *testing.T) {
	budget := 4000
	out := formatMemoryInspector(gact.MemoryStats{
		Session: &gact.SessionMemoryStats{
			SessionID:        "sess_pressure",
			MessagesRetained: 10,
			TokensRetained:   48294,
			TokensBudget:     &budget,
		},
	})

	for _, want := range []string{
		"context usage: 48294 / 4000 tokens (1207.3%)",
		"remaining budget: 0 tokens (44294 over budget)",
		"pressure: over budget (1207.3%)",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("memory inspector missing over-budget detail %q:\n%s", want, out)
		}
	}
}

func TestFormatMemoryInspectorStartsWithOperatorSummaryForFreshSession(t *testing.T) {
	out := formatMemoryInspector(gact.MemoryStats{})
	if !strings.HasPrefix(out, "Operator summary\n") {
		t.Fatalf("memory inspector should lead with operator summary:\n%s", out)
	}
	for _, want := range []string{
		"current context: no session context loaded yet",
		"retrieval status: no loaded transcript activity yet",
		"agent memory access: not checked for this session",
		"operator action: start or attach a session to inspect retained context",
		"session activity: no loaded transcript activity yet",
		"retrieval cache: no loaded transcript activity yet",
		"context pressure: not session-specific yet",
		"tool evidence: none loaded",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("fresh memory inspector missing %q:\n%s", want, out)
		}
	}
	for _, unwanted := range []string{"current_context", "retrieval_status", "agent_memory_access", "operator_action", "context_pressure", "tool_evidence", "cache_hit_rate"} {
		if strings.Contains(out, unwanted) {
			t.Fatalf("fresh memory inspector leaked backend label %q:\n%s", unwanted, out)
		}
	}
}

func TestFormatMemoryInspectorShowsCompactionMetadata(t *testing.T) {
	out := formatMemoryInspector(gact.MemoryStats{
		Metadata: map[string]any{"compaction_state": "recent summary retained"},
	})
	if !strings.Contains(out, "state: recent summary retained") {
		t.Fatalf("memory inspector should surface backend compaction metadata:\n%s", out)
	}
}

func TestFormatMemoryInspectorInfersRetainedCompactionSummary(t *testing.T) {
	out := formatMemoryInspectorWithMessages(gact.MemoryStats{}, []gact.Message{{
		Role: gact.RoleAssistant,
		Parts: []gact.Part{{
			Type: gact.PartTypeText,
			Text: "[compact summary]\nEvidence-Preserving Compact Memory\nkept tool evidence",
			Metadata: map[string]any{
				"synthetic": "compact_summary",
			},
		}},
	}})

	for _, want := range []string{
		"state: not reported for this session",
		"summary retained: yes",
		"summary parts: 1",
		"summary lines: 2",
		"detail: compact summary is retained in the transcript",
		"Ctrl+E on the compaction marker",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("memory inspector missing transcript-derived compaction detail %q:\n%s", want, out)
		}
	}
}

func TestFormatMemoryInspectorShowsTranscriptEvidenceSummary(t *testing.T) {
	out := formatMemoryInspectorWithMessages(gact.MemoryStats{}, []gact.Message{{
		Role: gact.RoleAssistant,
		Parts: []gact.Part{{
			Type:     gact.PartTypeToolCall,
			CallID:   "call_1",
			ToolName: "ReadFile",
		}},
	}, {
		Role: gact.RoleTool,
		Parts: []gact.Part{{
			Type:    gact.PartTypeToolResult,
			CallID:  "call_1",
			IsError: true,
			Content: []gact.Part{{Type: gact.PartTypeText, Text: "permission denied"}},
		}},
	}, {
		Role: gact.RoleAssistant,
		Parts: []gact.Part{{
			Type:    gact.PartTypeCompaction,
			Summary: "kept evidence",
		}},
	}})

	for _, want := range []string{
		"Transcript evidence",
		"messages loaded: 3",
		"addressable detail parts: 3",
		"tool calls: 1",
		"tool results: 1",
		"tool errors: 1",
		"compaction markers: 1",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("memory inspector missing transcript evidence %q:\n%s", want, out)
		}
	}
}

func TestFormatMemoryInspectorIncludesSearchProvenance(t *testing.T) {
	stats := gact.MemoryStats{}
	resp := &gact.MemorySearchResponse{
		Query:            "pressure dataset",
		SearchedSessions: []string{"sess_1"},
		Hits: []gact.MemorySearchHit{{
			SessionID: "sess_1", SessionTitle: "NDP", Text: "pressure dataset evidence",
			MatchTerms: []string{"pressure", "dataset"},
		}},
	}
	out := formatMemoryInspectorWithSearch(stats, nil, resp)
	for _, want := range []string{"retrieval status: searched current session · 1 hits · query \"pressure dataset\"", "Memory search", "query: pressure dataset", "searched sessions: sess_1", "terms: pressure, dataset", "pressure dataset evidence"} {
		if !strings.Contains(out, want) {
			t.Fatalf("memory inspector missing %q:\n%s", want, out)
		}
	}
}

func TestFormatMemoryInspectorIncludesContextFrameTruth(t *testing.T) {
	out := formatMemoryInspectorWithContext(gact.MemoryStats{}, nil, nil, []map[string]any{{
		"id":                   "ctx_1",
		"status":               "completed",
		"turn_id":              "msg_user_1",
		"assistant_message_id": "msg_asst_1",
		"tokens_estimated":     42,
		"agent":                map[string]any{"id": "analysis", "routing_mode": "reasoning_only"},
		"prompt":               map[string]any{"profile": "heavy", "source": "workspace"},
		"items": []any{
			map[string]any{"kind": "message", "source_id": "msg_user_1", "role": "user", "included": true, "reason": "visible_transcript", "tokens_estimated": 12},
			map[string]any{"kind": "context_file", "display_path": "data.csv", "included": true, "reason": "attached_context_file", "tokens_estimated": 30},
		},
		"metadata": map[string]any{"retained_context_source": "visible_gact_transcript"},
	}})
	for _, want := range []string{"current context: latest completed frame · 1 messages · 1 files · 0 excluded", "operator action: scroll for frame items, search hits, and agent memory access", "Context frame", "frame id: ctx_1", "agent", "analysis", "prompt", "heavy", "context_file · data.csv", "attached_context_file", "retained context source: visible transcript"} {
		if !strings.Contains(out, want) {
			t.Fatalf("memory inspector missing %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, "current context: latest frame ctx_1") {
		t.Fatalf("operator summary should not lead with raw context-frame id:\n%s", out)
	}
	if strings.Contains(out, "visible_gact_transcript") {
		t.Fatalf("context frame source should be human readable:\n%s", out)
	}
}

func TestFormatMemoryInspectorPrioritizesExcludedContextFiles(t *testing.T) {
	out := formatMemoryInspectorWithContext(gact.MemoryStats{}, nil, nil, []map[string]any{{
		"id":     "ctx_large",
		"status": "completed",
		"items": []any{
			map[string]any{"kind": "message", "source_id": "msg_1", "role": "user", "included": true, "reason": "visible_transcript", "tokens_estimated": 12},
			map[string]any{"kind": "message", "source_id": "msg_2", "role": "assistant", "included": true, "reason": "visible_transcript", "tokens_estimated": 14},
			map[string]any{"kind": "message", "source_id": "msg_3", "role": "user", "included": true, "reason": "visible_transcript", "tokens_estimated": 16},
			map[string]any{"kind": "message", "source_id": "msg_4", "role": "assistant", "included": true, "reason": "visible_transcript", "tokens_estimated": 18},
			map[string]any{"kind": "message", "source_id": "msg_5", "role": "user", "included": true, "reason": "visible_transcript", "tokens_estimated": 20},
			map[string]any{"kind": "message", "source_id": "msg_6", "role": "assistant", "included": true, "reason": "visible_transcript", "tokens_estimated": 22},
			map[string]any{"kind": "context_file", "display_path": "small.md", "included": true, "reason": "attached_context_file", "tokens_estimated": 8},
			map[string]any{"kind": "context_file", "display_path": "large.md", "included": false, "reason": "context_file_excluded_too_large", "tokens_estimated": 0},
		},
	}})
	for _, want := range []string{"2 files · 1 excluded", "context_file · large.md", "included: false", "context_file_excluded_too_large", "context_file · small.md"} {
		if !strings.Contains(out, want) {
			t.Fatalf("memory inspector missing %q:\n%s", want, out)
		}
	}
	if strings.Index(out, "context_file · large.md") > strings.Index(out, "message · msg_1") {
		t.Fatalf("excluded context file should appear before ordinary message rows:\n%s", out)
	}
}

func TestFormatMemoryInspectorIncludesAgentCallableMemoryToolPolicy(t *testing.T) {
	out := formatMemoryInspectorWithTools(gact.MemoryStats{}, nil, nil, nil, &memoryToolEvidence{
		search: &gact.MemoryToolSearchSessionsResponse{
			Hits: []gact.MemorySearchHit{{SessionID: "s1", Text: "pressure dataset evidence"}},
			Metadata: map[string]any{
				"policy_decision": "allow_same_session",
				"policy_scope":    "session",
				"audit_id":        "memtool_search",
			},
		},
		summary: &gact.MemoryToolReadSessionSummaryResponse{
			Summary: map[string]any{
				"message_count": float64(3),
				"metadata":      map[string]any{"source": "gact_visible_transcript_summary"},
			},
			Metadata: map[string]any{"policy_decision": "allow_same_session"},
		},
		frame: &gact.MemoryToolReadContextFrameResponse{
			Frame: map[string]any{
				"id":       "ctx_1",
				"metadata": map[string]any{"source": "gact_context_frame"},
			},
			Metadata: map[string]any{"policy_decision": "allow_same_session"},
		},
		errors: []string{"read-context-frame: backend timeout"},
	})
	for _, want := range []string{
		"Context state",
		"agent memory access: search session access allowed · summary session access allowed · frame session access allowed · 1 errors",
		"operator action: inspect memory tool errors below before relying on recall",
		"addressable details: 0",
		"tool evidence: 0 calls · 0 results · 0 errors",
		"Agent memory access proof",
		"search access: session access allowed",
		"search scope: session",
		"search hits: 1",
		"summary messages: 3",
		"summary source: visible transcript summary",
		"summary access: session access allowed",
		"frame id: ctx_1",
		"frame access: session access allowed",
		"frame source: captured context frame",
		"Memory tool errors",
		"backend timeout",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("memory tool evidence missing %q:\n%s", want, out)
		}
	}
	for _, unwanted := range []string{"allow_same_session", "Agent-callable memory tools", "gact_visible_transcript_summary", "gact_context_frame"} {
		if strings.Contains(out, unwanted) {
			t.Fatalf("memory inspector should translate backend memory wording %q:\n%s", unwanted, out)
		}
	}
}
