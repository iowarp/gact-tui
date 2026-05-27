package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// VVVVVVVVV1: adjustScrollForSelectedPart must bump scrollOffset so
// the ▸ marker falls within the visible viewport. This is the scroll
// fix for the "selected block scrolled above the fold" wart flagged
// as a follow-up on TTTTTTTTT1 — walking the part cursor up through
// a long multi-tool message left the marker invisible.
//
// Fixture: a body with 50 lines where the marker sits on row 8 (near
// the top). Viewport of 10 rows, starting pinned to the bottom (
// stickyToBottom=true shows lines 40..49). After adjustment the
// marker must be within [start, end) of the visible window.
func TestAdjustScrollForSelectedPart_BringsMarkerIntoView(t *testing.T) {
	var lines []string
	for i := 0; i < 50; i++ {
		if i == 8 {
			lines = append(lines, "▸ selected part first line")
		} else {
			lines = append(lines, "line "+itos(i))
		}
	}
	body := strings.Join(lines, "\n")

	a := &App{
		stickyToBottom: true,
		scrollOffset:   0,
	}
	a.adjustScrollForSelectedPart(body, 10)

	// After adjustment, the visible slice must contain the marker.
	totalLines := 50
	viewportH := 10
	start := totalLines - viewportH - a.scrollOffset
	if a.stickyToBottom {
		start = totalLines - viewportH
	}
	end := start + viewportH
	if 8 < start || 8 >= end {
		t.Errorf("after adjust, marker row 8 outside visible [%d,%d); scrollOffset=%d sticky=%v",
			start, end, a.scrollOffset, a.stickyToBottom)
	}
}

func TestAdjustScrollForSelectedPart_UsesCurrentSelectionMarker(t *testing.T) {
	var lines []string
	for i := 0; i < 60; i++ {
		if i == 9 {
			lines = append(lines, "▌ selected tool call")
		} else {
			lines = append(lines, "line "+itos(i))
		}
	}
	body := strings.Join(lines, "\n")

	a := &App{stickyToBottom: true}
	a.adjustScrollForSelectedPart(body, 12)

	start := 60 - 12 - a.scrollOffset
	if a.stickyToBottom {
		start = 60 - 12
	}
	end := start + 12
	if 9 < start || 9 >= end {
		t.Fatalf("current selection marker row not visible [%d,%d); scrollOffset=%d sticky=%v",
			start, end, a.scrollOffset, a.stickyToBottom)
	}
}

// VVVVVVVVV1: when the marker is ALREADY in the upper 2/3 of the
// viewport the adjustment should be a no-op (no UI jitter as the
// user walks through adjacent parts that happen to be on-screen).
func TestAdjustScrollForSelectedPart_NoOpWhenVisible(t *testing.T) {
	var lines []string
	for i := 0; i < 20; i++ {
		if i == 15 {
			lines = append(lines, "▸ marker")
		} else {
			lines = append(lines, "line "+itos(i))
		}
	}
	body := strings.Join(lines, "\n")

	a := &App{
		stickyToBottom: false,
		scrollOffset:   0, // bottom-sticky: visible [10,20), marker at 15 = visible
	}
	// Marker at row 15, viewport 10 → [10,20). Margin = 10/3 = 3, so
	// target zone is [10,17). 15 is in [10,17) — no-op expected.
	before := a.scrollOffset
	a.adjustScrollForSelectedPart(body, 10)
	if a.scrollOffset != before {
		t.Errorf("expected no-op when marker already in upper 2/3 of viewport; scrollOffset moved %d→%d",
			before, a.scrollOffset)
	}
}

// VVVVVVVVV1: no marker → no scroll change. Covers the "cursor off"
// and "selected part has empty rendering" cases.
func TestAdjustScrollForSelectedPart_NoMarkerIsNoOp(t *testing.T) {
	body := "line 1\nline 2\nline 3\n"
	a := &App{scrollOffset: 5, stickyToBottom: false}
	a.adjustScrollForSelectedPart(body, 10)
	if a.scrollOffset != 5 || a.stickyToBottom {
		t.Errorf("no-marker should leave scroll state untouched; got offset=%d sticky=%v",
			a.scrollOffset, a.stickyToBottom)
	}
}

func TestBodyEndKeepsLongTranscriptAtTrueBottom(t *testing.T) {
	a := newLongToolTranscriptApp()
	a.scrollOffset = 30
	a.stickyToBottom = false
	a.bodySelMsgIdx = 1
	a.bodySelPartIdx = 3

	a.handleBodyKey(tea.KeyPressMsg{Code: 'G', Text: "G", Mod: tea.ModShift})
	rendered := ansi.Strip(a.renderBody(100, 34))

	if a.scrollOffset != 0 || !a.stickyToBottom {
		t.Fatalf("G should reattach to bottom, got offset=%d sticky=%v", a.scrollOffset, a.stickyToBottom)
	}
	if !strings.Contains(rendered, "TRUE_BOTTOM_SENTINEL") {
		t.Fatalf("true bottom sentinel not visible after G:\n%s", rendered)
	}
}

func TestBodyDownRepeatedlyReachesTrueBottomOnLongToolTranscript(t *testing.T) {
	a := newLongToolTranscriptApp()
	a.scrollOffset = 30
	a.stickyToBottom = false
	a.bodySelMsgIdx = 1
	a.bodySelPartIdx = 0

	for i := 0; i < 40; i++ {
		a.handleBodyKey(tea.KeyPressMsg{Code: tea.KeyDown})
		_ = a.renderBody(100, 34)
	}
	rendered := ansi.Strip(a.renderBody(100, 34))

	if a.scrollOffset != 0 || !a.stickyToBottom {
		t.Fatalf("repeated Down should reattach to bottom, got offset=%d sticky=%v", a.scrollOffset, a.stickyToBottom)
	}
	if !strings.Contains(rendered, "TRUE_BOTTOM_SENTINEL") {
		t.Fatalf("true bottom sentinel not visible after repeated Down:\n%s", rendered)
	}
}

func TestBodyPageDownReattachesLongTranscriptToTrueBottom(t *testing.T) {
	a := newLongToolTranscriptApp()
	a.scrollOffset = 30
	a.stickyToBottom = false
	a.bodySelMsgIdx = 1
	a.bodySelPartIdx = 0

	a.handleBodyKey(tea.KeyPressMsg{Code: tea.KeyPgDown})
	rendered := ansi.Strip(a.renderBody(100, 34))

	if a.scrollOffset != 0 || !a.stickyToBottom {
		t.Fatalf("PageDown should reattach to bottom, got offset=%d sticky=%v", a.scrollOffset, a.stickyToBottom)
	}
	if !strings.Contains(rendered, "TRUE_BOTTOM_SENTINEL") {
		t.Fatalf("true bottom sentinel not visible after PageDown:\n%s", rendered)
	}
}

func newLongToolTranscriptApp() *App {
	sessions := []gact.Session{{ID: "s1", Title: "long tools", Status: gact.StatusIdle}}
	parts := []gact.Part{
		{ID: "route", Type: gact.PartTypeRoutingDecision, SelectedAgent: "analysis"},
	}
	for i := 0; i < 14; i++ {
		callID := "call_" + itos(i)
		parts = append(parts,
			gact.Part{
				ID:       "call_" + itos(i),
				Type:     gact.PartTypeToolCall,
				CallID:   callID,
				ToolName: "parquet_compute_statistics",
				Input: map[string]any{
					"path":   "/tmp/science/facility_measurements.parquet",
					"column": "pressure_pa",
				},
			},
			gact.Part{
				ID:     "result_" + itos(i),
				Type:   gact.PartTypeToolResult,
				CallID: callID,
				Content: []gact.Part{{
					Type: gact.PartTypeText,
					Text: strings.Join([]string{
						`{"column":"pressure_pa","count":3000,"nulls":0,"mean":101231.18,"std":766.51}`,
						`{"min":98435.39,"median":101229.29,"max":103998.63}`,
						`{"path":"/tmp/science/facility_measurements.parquet","status":"success"}`,
					}, "\n"),
				}},
			},
		)
	}
	parts = append(parts, gact.Part{
		ID:   "final",
		Type: gact.PartTypeText,
		Text: "TRUE_BOTTOM_SENTINEL final assistant synthesis with caveats and artifact paths.",
	})
	msgs := []gact.Message{
		{ID: "user", SessionID: "s1", Role: gact.RoleUser, Parts: []gact.Part{{ID: "user_text", Type: gact.PartTypeText, Text: "Analyze this dataset."}}},
		{ID: "assistant", SessionID: "s1", Role: gact.RoleAssistant, Parts: parts},
	}
	a := newReadyApp(sessions, msgs)
	a.focus = FocusBody
	return a
}

func itos(i int) string {
	if i == 0 {
		return "0"
	}
	neg := false
	if i < 0 {
		neg = true
		i = -i
	}
	var b []byte
	for i > 0 {
		b = append([]byte{byte('0' + i%10)}, b...)
		i /= 10
	}
	if neg {
		b = append([]byte{'-'}, b...)
	}
	return string(b)
}
