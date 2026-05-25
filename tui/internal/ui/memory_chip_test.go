package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"

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
	for _, want := range []string{"select part", "Enter/Ctrl+E details", "G bottom"} {
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
		"ARC cache",
		"hit_rate: 75.0%",
		"role: recent-context retrieval cache",
		"Global memory",
		"conversations_total: 5",
		"Current session context",
		"messages_retained: 7",
		"tokens_budget: 4000",
		"context_usage: 1234 / 4000 tokens (30.9%)",
		"remaining_budget: 2766 tokens",
		"pressure: low (30.9%)",
		"profiles_attached: 2",
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
		"context_usage: 48294 / 4000 tokens (1207.3%)",
		"remaining_budget: 0 tokens (44294 over budget)",
		"pressure: over budget (1207.3%)",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("memory inspector missing over-budget detail %q:\n%s", want, out)
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
		"state: not reported by backend",
		"summary_retained: yes",
		"summary_parts: 1",
		"summary_lines: 2",
		"detail: compact summary is retained in the transcript",
		"Ctrl+E on the compaction marker",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("memory inspector missing transcript-derived compaction detail %q:\n%s", want, out)
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

func TestPaletteMemoryFilterPrioritizesExactCommand(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.commands = []gact.Command{
		{ID: "/clear", Title: "Clear session messages", Description: "clear memory-like transcript text"},
		{ID: "/memory", Title: "Memory", Description: "inspect ARC memory and context"},
	}
	a.paletteFilter = "memory"

	matches := a.paletteMatches()
	if len(matches) == 0 || matches[0].ID != "/memory" {
		t.Fatalf("exact /memory match should be first, got %#v", matches)
	}
}

func TestPaletteMemoryCommandExplainsUnsupportedBackend(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.caps.Capabilities.Memory = false
	a.paletteOpen = true
	a.paletteFilter = "/memory"

	_, cmd := a.handlePaletteKey(tea.KeyPressMsg{Code: tea.KeyEnter})

	if cmd == nil {
		t.Fatal("unsupported /memory should return a hint-expiry command")
	}
	if !strings.Contains(a.transientHint, "unsupported") {
		t.Fatalf("unsupported /memory should explain the missing backend capability, got %q", a.transientHint)
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
