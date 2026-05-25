package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestCollapseForPreview_ShortPassesThrough(t *testing.T) {
	in := "line 1\nline 2\nline 3"
	got, hidden := collapseForPreview(in, 8)
	if got != in {
		t.Errorf("short input shouldn't be modified: got %q", got)
	}
	if hidden != 0 {
		t.Errorf("hidden count should be 0 for short input, got %d", hidden)
	}
}

func TestCollapseForPreview_LongClipsToN(t *testing.T) {
	// 12 lines, budget 8 → preview first 8, hidden = 4.
	lines := make([]string, 12)
	for i := range lines {
		lines[i] = "line " + string(rune('a'+i))
	}
	in := strings.Join(lines, "\n")
	got, hidden := collapseForPreview(in, 8)
	if strings.Count(got, "\n") != 7 {
		t.Errorf("preview should contain exactly 7 newlines (8 lines), got %d: %q",
			strings.Count(got, "\n"), got)
	}
	if hidden != 4 {
		t.Errorf("hidden count = %d, want 4", hidden)
	}
}

func TestCollapseForPreview_TrailingNewlineDoesntInflateCount(t *testing.T) {
	// "a\nb\nc\n" is 3 lines, not 4 (trailing newline shouldn't count).
	got, hidden := collapseForPreview("a\nb\nc\n", 5)
	if hidden != 0 {
		t.Errorf("3-line input should fit in 5-line budget, got hidden=%d", hidden)
	}
	if got != "a\nb\nc\n" {
		t.Errorf("unchanged output expected: %q", got)
	}
}

func TestLineCount(t *testing.T) {
	cases := []struct {
		in   string
		want int
	}{
		{"", 0},
		{"single line", 1},
		{"two\nlines", 2},
		// "three\nlines\n" is 2 content lines (trailing \n is a
		// terminator, not an empty third line).
		{"three\nlines\n", 2},
		{"\n", 1},
	}
	for _, tc := range cases {
		if got := lineCount(tc.in); got != tc.want {
			t.Errorf("lineCount(%q) = %d, want %d", tc.in, got, tc.want)
		}
	}
}

func TestRenderPart_ToolResultCollapsesLongOutput(t *testing.T) {
	theme := DefaultTheme()
	// 20 lines of output — well over the 5-line default preview budget.
	var b strings.Builder
	for i := 0; i < 20; i++ {
		if i > 0 {
			b.WriteString("\n")
		}
		b.WriteString("log line number ")
		b.WriteString(string(rune('a' + i%26)))
	}
	p := gact.Part{
		Type: gact.PartTypeToolResult, CallID: "c1",
		Content: []gact.Part{{Type: gact.PartTypeText, Text: b.String()}},
	}
	got := theme.renderPart(p, 80)
	plain := ansi.Strip(got)
	// Default threshold is 5 (set by applyStyles), so 20 - 5 = 15 lines
	// are hidden. The exact number is less important than the presence
	// of a collapse hint + the Ctrl+E pointer.
	if !strings.Contains(plain, "more lines") {
		t.Errorf("long tool_result should show a 'more lines' hint; got:\n%s", plain)
	}
	if !strings.Contains(plain, "Ctrl+E") {
		t.Errorf("collapse hint should mention Ctrl+E; got:\n%s", plain)
	}
}

// TestFindBulkyPartIn covers Z1: scanning a single message for bulky
// parts returns the first qualifying tool_result or text. Used by the
// cursor-routed Ctrl+E path.
func TestFindBulkyPartIn(t *testing.T) {
	// No bulky parts in a short-text message.
	short := gact.Message{
		ID: "m1", Role: gact.RoleAssistant,
		Parts: []gact.Part{{ID: "p1", Type: gact.PartTypeText, Text: "short"}},
	}
	if _, ok := findBulkyPartIn(short); ok {
		t.Errorf("short msg shouldn't qualify as bulky")
	}

	// Long text qualifies.
	var b strings.Builder
	for i := 0; i < 40; i++ {
		if i > 0 {
			b.WriteString("\n")
		}
		b.WriteString("line ")
	}
	long := gact.Message{
		ID: "m2", Role: gact.RoleAssistant,
		Parts: []gact.Part{{ID: "p1", Type: gact.PartTypeText, Text: b.String()}},
	}
	ref, ok := findBulkyPartIn(long)
	if !ok {
		t.Fatalf("long msg should qualify")
	}
	if !strings.Contains(ref.title, "text") {
		t.Errorf("title missing 'text': %q", ref.title)
	}
}

// TestFindLatestBulkyPart_TargetsLongText covers S2: long assistant
// text should now qualify as bulky so Ctrl+E can open it.
func TestFindLatestBulkyPart_TargetsLongText(t *testing.T) {
	var longText strings.Builder
	for i := 0; i < 50; i++ {
		if i > 0 {
			longText.WriteString("\n")
		}
		longText.WriteString("paragraph line ")
		longText.WriteString(string(rune('a' + i%26)))
	}
	msgs := []gact.Message{
		{ID: "m1", SessionID: "s1", Role: gact.RoleAssistant,
			Parts: []gact.Part{{Type: gact.PartTypeText, Text: longText.String(), ID: "p1"}}},
	}
	got, ok := findLatestBulkyPart(msgs)
	if !ok {
		t.Fatalf("long text should be bulky")
	}
	if !strings.Contains(got.title, "text") {
		t.Errorf("title = %q, want mention of 'text'", got.title)
	}
}

func TestFindLatestBulkyPart_PicksNewestBulky(t *testing.T) {
	// Three tool_result parts, only the last two are bulky. Should pick
	// the last (most recent) one.
	bulky := strings.Repeat("line\n", 15)
	msgs := []gact.Message{
		{ID: "m1", Role: gact.RoleTool, Parts: []gact.Part{
			{Type: gact.PartTypeToolResult, CallID: "c1",
				Content: []gact.Part{{Type: gact.PartTypeText, Text: "short"}}},
		}},
		{ID: "m2", Role: gact.RoleTool, Parts: []gact.Part{
			{ID: "p2", Type: gact.PartTypeToolResult, CallID: "c2",
				Content: []gact.Part{{Type: gact.PartTypeText, Text: bulky}}},
		}},
		{ID: "m3", Role: gact.RoleTool, Parts: []gact.Part{
			{ID: "p3", Type: gact.PartTypeToolResult, CallID: "c3",
				Content: []gact.Part{{Type: gact.PartTypeText, Text: bulky + "newest"}}},
		}},
	}
	got, ok := findLatestBulkyPart(msgs)
	if !ok {
		t.Fatal("expected a bulky part")
	}
	if got.messageID != "m3" {
		t.Errorf("picked %s, want m3", got.messageID)
	}
	if !strings.Contains(got.fullText, "newest") {
		t.Errorf("fullText wrong: %q", got.fullText)
	}
}

func TestFindLatestBulkyPart_NoneAvailable(t *testing.T) {
	msgs := []gact.Message{
		{Role: gact.RoleTool, Parts: []gact.Part{
			{Type: gact.PartTypeToolResult,
				Content: []gact.Part{{Type: gact.PartTypeText, Text: "short"}}},
		}},
	}
	if _, ok := findLatestBulkyPart(msgs); ok {
		t.Error("short tool_result should not be considered bulky")
	}
}

func TestFindBulkyPartForSelectedShortToolCallShowsInput(t *testing.T) {
	msg := gact.Message{
		ID:   "m1",
		Role: gact.RoleAssistant,
		Parts: []gact.Part{
			{
				ID:       "call",
				Type:     gact.PartTypeToolCall,
				CallID:   "c1",
				ToolName: "shell_bash",
				Input: map[string]any{
					"command":          "date",
					"cwd":              ".",
					"max_output_bytes": 1000,
					"timeout_s":        5,
				},
			},
			{
				ID:     "result",
				Type:   gact.PartTypeToolResult,
				CallID: "c1",
				Content: []gact.Part{{
					Type: gact.PartTypeText,
					Text: "Saturday, May 23, 2026 3:49:03 PM",
				}},
			},
		},
	}

	ref, ok := findBulkyPartForSelected(msg, 0, []gact.Message{msg}, 0)
	if !ok {
		t.Fatal("selected tool_call should open detail view even when output is short")
	}
	for _, want := range []string{
		"shell_bash input",
		"tool: shell_bash",
		`"command": "date"`,
		`"max_output_bytes": 1000`,
	} {
		if !strings.Contains(ref.title+"\n"+ref.fullText, want) {
			t.Fatalf("tool call detail missing %q:\n%s\n%s", want, ref.title, ref.fullText)
		}
	}
}

func TestFindBulkyPartForSelectedRoutingDecisionShowsDetails(t *testing.T) {
	msg := gact.Message{
		ID:   "m1",
		Role: gact.RoleAssistant,
		Parts: []gact.Part{{
			ID:            "route",
			Type:          gact.PartTypeRoutingDecision,
			SelectedAgent: "utility",
			Rationale:     "The user asked for current system time.",
			Confidence:    0.92,
			Metadata: map[string]any{
				"route_source": "planner",
			},
		}},
	}

	ref, ok := findBulkyPartForSelected(msg, 0, []gact.Message{msg}, 0)
	if !ok {
		t.Fatal("selected routing decision should open detail view")
	}
	for _, want := range []string{
		"routing decision",
		"selected_agent: utility",
		"route_source: planner",
		"confidence: 0.92",
		"The user asked for current system time.",
	} {
		if !strings.Contains(ref.title+"\n"+ref.fullText, want) {
			t.Fatalf("routing detail missing %q:\n%s\n%s", want, ref.title, ref.fullText)
		}
	}
}

func TestFindBulkyPartForSelectedShortToolResultShowsDetails(t *testing.T) {
	msg := gact.Message{
		ID:   "m1",
		Role: gact.RoleAssistant,
		Parts: []gact.Part{{
			ID:         "result",
			Type:       gact.PartTypeToolResult,
			CallID:     "c1",
			ToolName:   "shell_bash",
			DurationMS: 123,
			Content: []gact.Part{{
				Type: gact.PartTypeText,
				Text: "Saturday, May 23, 2026 3:49:03 PM",
			}},
		}},
	}

	ref, ok := findBulkyPartForSelected(msg, 0, []gact.Message{msg}, 0)
	if !ok {
		t.Fatal("selected short tool_result should open detail view")
	}
	for _, want := range []string{
		"shell_bash result",
		"tool: shell_bash",
		"call_id: c1",
		"duration_ms: 123",
		"Saturday, May 23, 2026 3:49:03 PM",
	} {
		if !strings.Contains(ref.title+"\n"+ref.fullText, want) {
			t.Fatalf("tool result detail missing %q:\n%s\n%s", want, ref.title, ref.fullText)
		}
	}
}

func TestPartDetailShowsPromotedEvidenceProvenance(t *testing.T) {
	out := partDetailText(gact.Part{
		ID:     "result",
		Type:   gact.PartTypeToolResult,
		CallID: "c1",
		Metadata: map[string]any{
			"synthetic_from": "tools_called_metadata",
			"raw_result":     map[string]any{"status": "success"},
		},
		Content: []gact.Part{{Type: gact.PartTypeText, Text: "status: success"}},
	})
	if !strings.Contains(out, "provenance: trace metadata") {
		t.Fatalf("tool detail should surface promoted evidence provenance:\n%s", out)
	}
	if strings.Count(out, "raw_result:") != 1 {
		t.Fatalf("tool detail should show raw_result once, not repeat it inside metadata:\n%s", out)
	}
	if strings.Contains(out, "synthetic_from") {
		t.Fatalf("tool detail should not repeat provenance transport metadata:\n%s", out)
	}

	out = partDetailText(gact.Part{
		ID:   "handoff",
		Type: gact.PartTypeExpertHandoff,
		Metadata: map[string]any{
			"synthetic_from": "expert_handoffs_metadata",
			"agent_id":       "data",
		},
	})
	if !strings.Contains(out, "provenance: handoff metadata") {
		t.Fatalf("handoff detail should surface promoted evidence provenance:\n%s", out)
	}
}

func TestPartDetailHidesPartialAnswerRenderFlag(t *testing.T) {
	out := partDetailText(gact.Part{
		ID:   "answer",
		Type: gact.PartTypeText,
		Text: "Recovered answer.",
		Metadata: map[string]any{
			"partial_after_error": true,
			"stream_source":       "batch",
		},
	})
	if strings.Contains(out, "partial_after_error") {
		t.Fatalf("detail should not expose UI-only partial answer marker:\n%s", out)
	}
	if !strings.Contains(out, "Recovered answer.") || !strings.Contains(out, "stream_source") {
		t.Fatalf("detail should retain text and real metadata:\n%s", out)
	}
}

func TestDetailModalWidthIsReadableButNotHuge(t *testing.T) {
	a := New("http://unused")
	a.width = 180
	if got := a.detailModalWidth(); got != 112 {
		t.Fatalf("wide terminal detail width = %d, want capped 112", got)
	}
	a.width = 120
	if got := a.detailModalWidth(); got != 80 {
		t.Fatalf("medium terminal detail width = %d, want two thirds", got)
	}
	a.width = 70
	if got := a.detailModalWidth(); got > a.width-8 {
		t.Fatalf("small terminal detail width = %d, should fit width %d", got, a.width)
	}
}

func TestDetailSectionsRenderConsistentFieldsAndBodies(t *testing.T) {
	rows := appendDetailSection(nil, "Section",
		detailField{"name", "value"},
		detailField{"description", "first\nsecond"},
		detailField{"", "freeform"},
	)
	out := strings.Join(rows, "\n")
	for _, want := range []string{
		"Section",
		"  name: value",
		"  description:",
		"    first",
		"    second",
		"    freeform",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("detail section missing %q:\n%s", want, out)
		}
	}
}

func TestDetailView_CtrlEOpensWithNewest(t *testing.T) {
	a := New("http://unused")
	a.focus = FocusBody
	a.messages = []gact.Message{{
		Role: gact.RoleTool, Parts: []gact.Part{{
			Type:    gact.PartTypeToolResult,
			Content: []gact.Part{{Type: gact.PartTypeText, Text: strings.Repeat("x\n", 20)}},
		}},
	}}
	a.handleKey(tea.KeyPressMsg{Code: 'e', Mod: tea.ModCtrl})
	if !a.detailViewOpen {
		t.Fatal("Ctrl+E should open detail view when a bulky part exists")
	}
	if a.detailView == nil {
		t.Fatal("detailView not populated")
	}
}

func TestDetailView_CtrlEWithoutBulkyShowsHint(t *testing.T) {
	a := New("http://unused")
	a.focus = FocusBody
	a.messages = nil
	a.handleKey(tea.KeyPressMsg{Code: 'e', Mod: tea.ModCtrl})
	if a.detailViewOpen {
		t.Error("Ctrl+E shouldn't open modal when nothing to expand")
	}
	if !strings.Contains(a.transientHint, "nothing to expand") {
		t.Errorf("hint = %q, want 'nothing to expand'", a.transientHint)
	}
}

func TestDetailView_EscClosesModal(t *testing.T) {
	a := New("http://unused")
	a.stage = StageReady
	a.width, a.height = 100, 30
	a.detailViewOpen = true
	a.detailView = &bulkyPartRef{title: "x", fullText: "content"}
	a.detailScroll = 5
	a.handleKey(tea.KeyPressMsg{Code: tea.KeyEsc})
	if a.detailViewOpen {
		t.Error("Esc should close the detail view")
	}
	if a.detailScroll != 0 {
		t.Errorf("scroll should reset, got %d", a.detailScroll)
	}
}

func TestDetailView_ScrollClampsAtZero(t *testing.T) {
	a := New("http://unused")
	a.detailViewOpen = true
	a.detailView = &bulkyPartRef{fullText: "one\ntwo\nthree"}
	a.detailScroll = 0
	a.handleDetailViewKey(tea.KeyPressMsg{Code: tea.KeyUp})
	if a.detailScroll != 0 {
		t.Errorf("↑ at scroll 0 should clamp; got %d", a.detailScroll)
	}
}

func TestDetailView_PgDnAdvancesByPageSize(t *testing.T) {
	a := New("http://unused")
	a.stage = StageReady
	a.width, a.height = 100, 30
	a.detailViewOpen = true
	a.detailView = &bulkyPartRef{fullText: strings.Repeat("line\n", 100)}

	step := a.detailPageSize()
	a.handleDetailViewKey(tea.KeyPressMsg{Code: tea.KeyPgDown})
	if a.detailScroll != step {
		t.Errorf("pgdown advanced by %d, want %d", a.detailScroll, step)
	}
}
