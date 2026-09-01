package ui

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func newContextTestApp() *App {
	a := New("http://localhost:0")
	a.width = 120
	a.height = 40
	return a
}

func TestContextViewRebuildExpertsListsHierarchy(t *testing.T) {
	a := newContextTestApp()
	a.agent.hierarchyAgents = []gact.AgentDef{
		{ID: "orchestrator", Title: "Orchestrator", Tier: 1},
		{ID: "coder", Title: "Coder", Tier: 2, ParentID: "orchestrator"},
	}
	a.contextView.rebuildExperts()
	if len(a.contextView.experts) < 3 {
		t.Fatalf("experts = %d, want >=3 (default + 2 agents)", len(a.contextView.experts))
	}
	if a.contextView.experts[0].id != "" {
		t.Fatalf("first expert should be the session default, got %q", a.contextView.experts[0].id)
	}
	ids := make([]string, len(a.contextView.experts))
	for i, e := range a.contextView.experts {
		ids[i] = e.id
	}
	joined := strings.Join(ids, ",")
	if !strings.Contains(joined, "orchestrator") || !strings.Contains(joined, "coder") {
		t.Fatalf("experts %v missing hierarchy agents", ids)
	}
}

func TestContextViewSeedsSelectionToPinnedExpert(t *testing.T) {
	a := newContextTestApp()
	a.agent.hierarchyAgents = []gact.AgentDef{
		{ID: "orchestrator", Title: "Orchestrator"},
		{ID: "coder", Title: "Coder"},
	}
	a.agent.nextTurnAgentID = "coder"
	a.contextView.rebuildExperts()
	if a.contextView.currentScope() != "coder" {
		t.Fatalf("selected scope = %q, want coder", a.contextView.currentScope())
	}
}

func TestContextViewHandleKeySwitchesExpert(t *testing.T) {
	a := newContextTestApp()
	a.agent.hierarchyAgents = []gact.AgentDef{{ID: "coder", Title: "Coder"}}
	a.contextView.open = true
	a.contextView.rebuildExperts() // [default, coder]
	if a.contextView.selected != 0 {
		t.Fatalf("initial selection = %d, want 0", a.contextView.selected)
	}
	_, cmd := a.contextView.handleKey(keyMsg("down"))
	if a.contextView.selected != 1 {
		t.Fatalf("after down selection = %d, want 1", a.contextView.selected)
	}
	if cmd == nil {
		t.Fatalf("expected a reload command after switching expert")
	}
	// Esc closes.
	a.contextView.handleKey(keyMsg("esc"))
	if a.contextView.open {
		t.Fatalf("esc should close the context overlay")
	}
}

func TestCompactErrorNoticeMapsTypedEnvelopes(t *testing.T) {
	cases := map[string]string{
		"nothing_to_compact":     "nothing to compact (no live segments)",
		"compaction_unavailable": "compaction unavailable (no LM bound or summary failed)",
		"session_not_found":      "session not found",
	}
	for code, want := range cases {
		got := compactErrorNotice(&client.Error{Status: 409, Code: code, Message: code})
		if got != want {
			t.Fatalf("compactErrorNotice(%q) = %q, want %q", code, got, want)
		}
	}
}

func TestContextViewBodyRendersBarAndLegend(t *testing.T) {
	a := newContextTestApp()
	a.contextView.open = true
	a.contextView.rebuildExperts()
	// Pretend a session is active so the body renders the bar path.
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0
	a.contextView.state = client.ContextState{
		WindowTokens:   200000,
		LiveTokens:     50000,
		UsedTokens:     ptrInt(60000),
		UsedPct:        ptrFloat(0.30),
		AutocompactPct: ptrFloat(0.85),
		Categories: map[string]int{
			"system":   10000,
			"messages": 30000,
			"tools":    10000,
		},
	}
	rows := a.contextView.bodyRows(80)
	joined := ansi.Strip(strings.Join(rows, "\n"))
	if !strings.Contains(joined, "Categories") {
		t.Fatalf("body missing legend section:\n%s", joined)
	}
	if !strings.Contains(joined, "system") || !strings.Contains(joined, "messages") {
		t.Fatalf("body missing category names:\n%s", joined)
	}
	if !strings.Contains(joined, "30%") {
		t.Fatalf("body missing header percent:\n%s", joined)
	}
	if !strings.Contains(joined, "auto-compaction at 85%") {
		t.Fatalf("body missing autocompact legend:\n%s", joined)
	}
}

func TestContextViewHandleFooterStateCaches(t *testing.T) {
	a := newContextTestApp()
	a.contextView.handleFooterState(footerContextStateMsg{
		state: client.ContextState{LiveTokens: 1234, Categories: map[string]int{"messages": 1234}},
	})
	if a.session.footerContext == nil || a.session.footerContext.LiveTokens != 1234 {
		t.Fatalf("footer context not cached")
	}
	// An error leaves the cache untouched.
	a.contextView.handleFooterState(footerContextStateMsg{err: &client.Error{Status: 501, Code: "not_supported"}})
	if a.session.footerContext == nil || a.session.footerContext.LiveTokens != 1234 {
		t.Fatalf("error should not clobber cached footer context")
	}
}

func TestMemoryInspectorContextBarPrependsUsage(t *testing.T) {
	theme := DefaultTheme()
	cs := client.ContextState{
		Scope:        "coder",
		WindowTokens: 100000,
		UsedTokens:   ptrInt(40000),
		UsedPct:      ptrFloat(0.40),
		Categories:   map[string]int{"messages": 30000, "system": 10000},
	}
	out := memoryInspectorContextBar(theme, cs)
	plain := ansi.Strip(out)
	if !strings.Contains(plain, "Context usage (coder)") {
		t.Fatalf("missing scoped header: %s", plain)
	}
	if !strings.Contains(plain, "messages") || !strings.Contains(plain, "40%") {
		t.Fatalf("missing legend/percent: %s", plain)
	}
	// Empty categories -> no bar.
	if got := memoryInspectorContextBar(theme, client.ContextState{}); got != "" {
		t.Fatalf("empty context should render no bar, got %q", got)
	}
}
