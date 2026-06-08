package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// CLIO-BBBBBBBBBB4: the footer shows an ARC memory hit-rate chip when the
// backend advertises capabilities.memory AND memoryStats has at
// least one hit-or-miss recorded.
func TestFooter_MemoryChip_RendersWhenCapAndStats(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 160
	a.caps.Capabilities.Memory = true
	a.memoryStats = gact.MemoryStats{
		Cache: gact.CacheStats{
			Hits:     80,
			Misses:   20,
			HitRate:  0.80,
			Capacity: 1000,
		},
	}

	got := stripANSI(a.renderFooter())
	if !strings.Contains(got, "ARC hit") {
		t.Errorf("footer should contain ARC hit label; got:\n%s", got)
	}
	if !strings.Contains(got, "80%") {
		t.Errorf("footer should contain '80%%' hit-rate readout; got:\n%s", got)
	}
}

func TestFooter_MemoryChipUsesSemanticHitTarget(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 180
	a.height = 30
	a.caps.Capabilities.Memory = true
	a.memoryStats = gact.MemoryStats{
		Cache: gact.CacheStats{
			Hits:    80,
			Misses:  20,
			HitRate: 0.80,
		},
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "footer:memory")
	if !ok {
		t.Fatal("missing semantic memory footer target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd == nil {
		t.Fatal("memory footer click should dispatch memory inspector load command")
	}
	if a.detailViewOpen {
		t.Fatal("memory footer click should wait for async inspector result before opening detail")
	}
}

// CLIO-BBBBBBBBBB4: v0.1 backends (capabilities.memory = false) see
// no chip.
func TestFooter_MemoryChip_HiddenWhenCapFalse(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 160
	a.caps.Capabilities.Memory = false
	a.memoryStats = gact.MemoryStats{
		Cache: gact.CacheStats{Hits: 80, Misses: 20, HitRate: 0.80},
	}

	got := stripANSI(a.renderFooter())
	if strings.Contains(got, "cache") {
		t.Errorf("v0.1 backend should NOT show memory chip; got:\n%s", got)
	}
}

// CLIO-BBBBBBBBBB4: zero-stats (fresh session before first fetch)
// hides the chip even when the capability is on.
func TestFooter_MemoryChip_HiddenWithZeroStats(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 160
	a.caps.Capabilities.Memory = true
	// memoryStats zero-value (no hits, no misses).

	got := stripANSI(a.renderFooter())
	if strings.Contains(got, "cache") {
		t.Errorf("zero stats should hide the chip; got:\n%s", got)
	}
}

func TestFooter_ContextHintsChangeByFocus(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 180

	a.focus = FocusSidebar
	sidebar := stripANSI(a.renderFooter())
	for _, want := range []string{"Enter open", "e rename", "x delete", "c children"} {
		if !strings.Contains(sidebar, want) {
			t.Fatalf("sidebar footer missing %q:\n%s", want, sidebar)
		}
	}

	a.focus = FocusBody
	body := stripANSI(a.renderFooter())
	for _, want := range []string{"Enter/Ctrl+E details", "y copy", "G bottom"} {
		if !strings.Contains(body, want) {
			t.Fatalf("conversation footer missing %q:\n%s", want, body)
		}
	}

	a.focus = FocusInput
	input := stripANSI(a.renderFooter())
	for _, want := range []string{"Enter send", "\\+Enter newline", "Ctrl+G compose"} {
		if !strings.Contains(input, want) {
			t.Fatalf("input footer missing %q:\n%s", want, input)
		}
	}
}

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

func TestPaletteMemoryCommandLoadsInspectorWhenSupported(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.caps.Capabilities.Memory = true
	a.paletteOpen = true
	a.paletteFilter = "/memory"

	_, cmd := a.handlePaletteKey(tea.KeyPressMsg{Code: tea.KeyEnter})

	if cmd == nil {
		t.Fatal("/memory should load the memory inspector when capabilities.memory is true")
	}
	if a.paletteOpen {
		t.Fatal("/memory should close the command palette before opening detail")
	}
}

func TestStandaloneMemoryDetailLoadedOpensInspector(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.catalogBrowserOpen = false

	model, _ := a.Update(catalogDetailLoadedMsg{
		title:      "Memory · context",
		text:       "ARC cache\nhits: 1",
		standalone: true,
	})
	got := model.(*App)

	if !got.detailViewOpen || got.detailView == nil {
		t.Fatal("standalone memory detail should open detail view")
	}
	if got.detailView.title != "Memory · context" {
		t.Fatalf("detail title = %q, want memory inspector title", got.detailView.title)
	}
}

func TestPaletteMemoryFilterPrioritizesExactCommand(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.caps.Capabilities.Memory = true
	a.commands = []gact.Command{
		{ID: "/clear", Title: "Clear session messages", Description: "clear memory-like transcript text"},
		{ID: "/memory", Title: "Memory", Description: "inspect retained memory and context"},
	}
	a.paletteFilter = "memory"

	matches := a.paletteMatches()
	if len(matches) == 0 || matches[0].ID != "/memory" {
		t.Fatalf("exact /memory match should be first, got %#v", matches)
	}
}

// TestPaletteMemoryCommandHiddenWhenUnsupported asserts the hide-when-
// unsupported contract: a backend that does not advertise the memory
// capability must not offer /memory in the palette at all (rather than
// offering it and flashing an "unsupported by this backend" hint on
// invocation). The transient-hint dispatch path remains as a defensive
// fallback for a direct keybind but is unreachable from the palette.
func TestPaletteMemoryCommandHiddenWhenUnsupported(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.caps.Capabilities.Memory = false
	a.paletteOpen = true
	a.paletteFilter = "/memory"

	for _, cmd := range a.paletteMatches() {
		if cmd.ID == "/memory" {
			t.Fatalf("unsupported /memory should be hidden from the palette, got %#v", cmd)
		}
	}
}

func TestPaletteMemoryCommandShowsCapabilityStatusWhenSupported(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.caps.Capabilities.Memory = false
	a.paletteOpen = true
	a.paletteFilter = "memory"

	out := ansi.Strip(a.viewPalette())
	if strings.Contains(out, "/memory") {
		t.Fatalf("palette should hide memory command when unsupported:\n%s", out)
	}

	a.caps.Capabilities.Memory = true
	out = ansi.Strip(a.viewPalette())
	if !strings.Contains(out, "/memory") {
		t.Fatalf("palette should surface memory command when supported:\n%s", out)
	}
	if !strings.Contains(out, "[retained context]") {
		t.Fatalf("palette should mark supported memory command with purpose:\n%s", out)
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

func TestFooter_NarrowKeepsQuitVisible(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 100
	a.focus = FocusInput

	got := stripANSI(a.renderFooter())
	if !strings.Contains(got, "Ctrl+C quit") {
		t.Fatalf("narrow footer should keep quit visible:\n%s", got)
	}
	if strings.Contains(got, "compose") {
		t.Fatalf("narrow footer should drop low-priority compose hint:\n%s", got)
	}
}

func TestFooter_SidebarWithMemoryChipKeepsHelpAndQuitVisible(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 150
	a.focus = FocusSidebar
	a.caps.Capabilities.Memory = true
	a.memoryStats = gact.MemoryStats{
		Cache: gact.CacheStats{Hits: 99, Misses: 64, HitRate: 0.607},
	}

	got := stripANSI(a.renderFooter())
	for _, want := range []string{"? help", "Ctrl+C quit", "ARC hit"} {
		if !strings.Contains(got, want) {
			t.Fatalf("footer should keep %q visible with right-side chips:\n%s", want, got)
		}
	}
	if strings.Contains(got, "o add context") {
		t.Fatalf("footer should drop low-priority sidebar hints before help/quit:\n%s", got)
	}
}
