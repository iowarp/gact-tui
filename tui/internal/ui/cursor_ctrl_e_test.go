package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// FFFFF1: Tab into FocusBody seeds the body cursor on the latest
// message — without this the cursor stays at -1 (invisible) and the
// user has no way to discover that n/N work.
func TestTab_SeedsBodyCursor(t *testing.T) {
	a := newReadyApp(
		[]gact.Session{{ID: "sess_1", Title: "t", Status: gact.StatusIdle}},
		[]gact.Message{
			{ID: "m1", Role: "user", Parts: []gact.Part{{Type: gact.PartTypeText, Text: "first"}}},
			{ID: "m2", Role: "assistant", Parts: []gact.Part{{Type: gact.PartTypeText, Text: "reply"}}},
			{ID: "m3", Role: "user", Parts: []gact.Part{{Type: gact.PartTypeText, Text: "third"}}},
		},
	)
	a.width, a.height = 120, 30
	a.focus = FocusSidebar
	a.bodySelMsgIdx = -1

	// Tab: sidebar → body. Should seed cursor to last message (idx=2).
	out, _ := a.Update(tea.KeyPressMsg{Code: tea.KeyTab})
	got := out.(*App)
	if got.focus != FocusBody {
		t.Fatalf("after Tab, focus = %v, want FocusBody", got.focus)
	}
	if got.bodySelMsgIdx != 2 {
		t.Errorf("after Tab into body, bodySelMsgIdx = %d, want 2 (last msg)", got.bodySelMsgIdx)
	}
}

// Re-Tabbing through the cycle (body → input → sidebar) and back
// shouldn't blow away the user's existing cursor selection.
func TestTab_PreservesExistingCursor(t *testing.T) {
	a := newReadyApp(
		[]gact.Session{{ID: "sess_1", Title: "t", Status: gact.StatusIdle}},
		[]gact.Message{
			{ID: "m1", Role: "user", Parts: []gact.Part{{Type: gact.PartTypeText, Text: "a"}}},
			{ID: "m2", Role: "assistant", Parts: []gact.Part{{Type: gact.PartTypeText, Text: "b"}}},
			{ID: "m3", Role: "assistant", Parts: []gact.Part{{Type: gact.PartTypeText, Text: "c"}}},
		},
	)
	a.width, a.height = 120, 30
	a.focus = FocusBody
	a.bodySelMsgIdx = 0 // user already navigated up

	// Tab thrice: body → input → sidebar → body. Cursor must survive.
	for i := 0; i < 3; i++ {
		out, _ := a.Update(tea.KeyPressMsg{Code: tea.KeyTab})
		a = out.(*App)
	}
	if a.focus != FocusBody {
		t.Fatalf("after 3 tabs, focus = %v, want FocusBody", a.focus)
	}
	if a.bodySelMsgIdx != 0 {
		t.Errorf("after 3 tabs, bodySelMsgIdx = %d, want 0 (preserved)", a.bodySelMsgIdx)
	}
}

// FFFFF1: Ctrl+E with a body cursor on an EARLIER bulky message
// expands THAT message, not the latest. This is the load-bearing
// fix the user asked for: multiple "dump the log" turns produce
// multiple bulky tool_results and Ctrl+E must be able to address
// any of them, not just the newest.
func TestCtrlE_TargetsCursorMessage(t *testing.T) {
	bulky := strings.Repeat("line\n", 80) // > toolResultPreviewLines
	mkBulky := func(id string) gact.Message {
		return gact.Message{
			ID:   id,
			Role: "tool",
			Parts: []gact.Part{{
				Type: gact.PartTypeToolResult,
				Content: []gact.Part{{
					Type: gact.PartTypeText,
					Text: id + "\n" + bulky,
				}},
			}},
		}
	}
	a := newReadyApp(
		[]gact.Session{{ID: "sess_1", Title: "t", Status: gact.StatusIdle}},
		[]gact.Message{mkBulky("EARLIER"), mkBulky("MIDDLE"), mkBulky("LATEST")},
	)
	a.width, a.height = 120, 30
	a.focus = FocusBody
	a.bodySelMsgIdx = 0 // pointing at EARLIER, not LATEST

	// Ctrl+E. The Z1 path must pick EARLIER since the cursor is set.
	out, _ := a.Update(tea.KeyPressMsg{Code: 'e', Mod: tea.ModCtrl, Text: ""})
	got := out.(*App)
	if !got.detailViewOpen || got.detailView == nil {
		t.Fatalf("Ctrl+E should open detail view; open=%v ref=%+v", got.detailViewOpen, got.detailView)
	}
	if got.detailView.messageID != "EARLIER" {
		t.Errorf("detail view targeted %q, want EARLIER (cursor message), not the latest",
			got.detailView.messageID)
	}
	if !strings.Contains(got.detailView.fullText, "EARLIER") {
		t.Errorf("expanded body should contain EARLIER marker, got: %q",
			got.detailView.fullText[:min(80, len(got.detailView.fullText))])
	}
}

// And the fall-through still works: cursor unset → Ctrl+E expands
// the latest bulky part (back-compat with L3).
func TestCtrlE_FallbackLatestWhenNoCursor(t *testing.T) {
	bulky := strings.Repeat("line\n", 80)
	mk := func(id string) gact.Message {
		return gact.Message{
			ID: id, Role: "tool",
			Parts: []gact.Part{{
				Type: gact.PartTypeToolResult,
				Content: []gact.Part{{Type: gact.PartTypeText, Text: id + "\n" + bulky}},
			}},
		}
	}
	a := newReadyApp(
		[]gact.Session{{ID: "sess_1", Title: "t", Status: gact.StatusIdle}},
		[]gact.Message{mk("EARLIER"), mk("LATEST")},
	)
	a.width, a.height = 120, 30
	a.focus = FocusInput // not body — cursor irrelevant
	a.bodySelMsgIdx = -1

	out, _ := a.Update(tea.KeyPressMsg{Code: 'e', Mod: tea.ModCtrl, Text: ""})
	got := out.(*App)
	if got.detailView == nil || got.detailView.messageID != "LATEST" {
		t.Errorf("no-cursor Ctrl+E should fall through to LATEST; got %+v", got.detailView)
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
