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
	a.conversation.bodySelMsgIdx = -1

	// Tab: sidebar → body. Should seed cursor to last message (idx=2).
	out, _ := a.Update(tea.KeyPressMsg{Code: tea.KeyTab})
	got := out.(*App)
	if got.focus != FocusBody {
		t.Fatalf("after Tab, focus = %v, want FocusBody", got.focus)
	}
	if got.conversation.bodySelMsgIdx != 2 {
		t.Errorf("after Tab into body, bodySelMsgIdx = %d, want 2 (last msg)", got.conversation.bodySelMsgIdx)
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
	a.conversation.bodySelMsgIdx = 0 // user already navigated up

	// Tab thrice: body → input → sidebar → body. Cursor must survive.
	for i := 0; i < 3; i++ {
		out, _ := a.Update(tea.KeyPressMsg{Code: tea.KeyTab})
		a = out.(*App)
	}
	if a.focus != FocusBody {
		t.Fatalf("after 3 tabs, focus = %v, want FocusBody", a.focus)
	}
	if a.conversation.bodySelMsgIdx != 0 {
		t.Errorf("after 3 tabs, bodySelMsgIdx = %d, want 0 (preserved)", a.conversation.bodySelMsgIdx)
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
	a.conversation.bodySelMsgIdx = 0 // pointing at EARLIER, not LATEST

	// Ctrl+E. The Z1 path must pick EARLIER since the cursor is set.
	out, _ := a.Update(tea.KeyPressMsg{Code: 'e', Mod: tea.ModCtrl, Text: ""})
	got := out.(*App)
	if !got.detail.visible || got.detail.ref == nil {
		t.Fatalf("Ctrl+E should open detail view; open=%v ref=%+v", got.detail.visible, got.detail.ref)
	}
	if got.detail.ref.messageID != "EARLIER" {
		t.Errorf("detail view targeted %q, want EARLIER (cursor message), not the latest",
			got.detail.ref.messageID)
	}
	if !strings.Contains(got.detail.ref.fullText, "EARLIER") {
		t.Errorf("expanded body should contain EARLIER marker, got: %q",
			got.detail.ref.fullText[:min(80, len(got.detail.ref.fullText))])
	}
}

// ZZZZZZZZ1: body-focus Enter opens the detail view on the cursor's
// bulky message — same behaviour as Ctrl+E, mapped to the intuitive
// "Enter to open" convention.
func TestBodyEnter_OpensDetailView(t *testing.T) {
	bulky := strings.Repeat("line\n", 80)
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
	a.conversation.bodySelMsgIdx = 1 // MIDDLE

	// Enter via handleBodyKey — same code path as Ctrl+E.
	out, _ := a.conversation.handleKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	got := out.(*App)
	if !got.detail.visible || got.detail.ref == nil {
		t.Fatalf("Enter should open detail view; open=%v", got.detail.visible)
	}
	if got.detail.ref.messageID != "MIDDLE" {
		t.Errorf("detail view targeted %q, want MIDDLE (cursor message)",
			got.detail.ref.messageID)
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
				Type:    gact.PartTypeToolResult,
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
	a.conversation.bodySelMsgIdx = -1

	out, _ := a.Update(tea.KeyPressMsg{Code: 'e', Mod: tea.ModCtrl, Text: ""})
	got := out.(*App)
	if got.detail.ref == nil || got.detail.ref.messageID != "LATEST" {
		t.Errorf("no-cursor Ctrl+E should fall through to LATEST; got %+v", got.detail.ref)
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// WWWWW1: in FocusBody, up/down move the cursor (and scroll
// follows), not the raw scroll. User reported "the window scrolls
// but the cursor remains there" — orphan marker bug.
func TestBodyUpDown_MovesCursorNotJustScroll(t *testing.T) {
	a := newReadyApp(
		[]gact.Session{{ID: "sess_1", Title: "t", Status: gact.StatusIdle}},
		[]gact.Message{
			{ID: "m1", Role: "user", Parts: []gact.Part{{Type: gact.PartTypeText, Text: "a"}}},
			{ID: "m2", Role: "assistant", Parts: []gact.Part{{Type: gact.PartTypeText, Text: "b"}}},
			{ID: "m3", Role: "user", Parts: []gact.Part{{Type: gact.PartTypeText, Text: "c"}}},
			{ID: "m4", Role: "assistant", Parts: []gact.Part{{Type: gact.PartTypeText, Text: "d"}}},
		},
	)
	a.width, a.height = 120, 30
	a.focus = FocusBody
	a.conversation.bodySelMsgIdx = 3 // start on the latest

	// up moves cursor one back.
	out, _ := a.Update(tea.KeyPressMsg{Code: tea.KeyUp})
	a = out.(*App)
	if a.conversation.bodySelMsgIdx != 2 {
		t.Errorf("after up, bodySelMsgIdx = %d, want 2", a.conversation.bodySelMsgIdx)
	}
	// up again.
	out, _ = a.Update(tea.KeyPressMsg{Code: tea.KeyUp})
	a = out.(*App)
	if a.conversation.bodySelMsgIdx != 1 {
		t.Errorf("after second up, bodySelMsgIdx = %d, want 1", a.conversation.bodySelMsgIdx)
	}
	// down brings cursor forward.
	out, _ = a.Update(tea.KeyPressMsg{Code: tea.KeyDown})
	a = out.(*App)
	if a.conversation.bodySelMsgIdx != 2 {
		t.Errorf("after down, bodySelMsgIdx = %d, want 2", a.conversation.bodySelMsgIdx)
	}
	// up at bottom: clamps at 0 (oldest).
	for i := 0; i < 10; i++ {
		out, _ = a.Update(tea.KeyPressMsg{Code: tea.KeyUp})
		a = out.(*App)
	}
	if a.conversation.bodySelMsgIdx != 0 {
		t.Errorf("clamp low: bodySelMsgIdx = %d, want 0", a.conversation.bodySelMsgIdx)
	}
	// G jumps cursor to latest.
	out, _ = a.Update(tea.KeyPressMsg{Code: 'G', Text: "G"})
	a = out.(*App)
	if a.conversation.bodySelMsgIdx != 3 {
		t.Errorf("after G, bodySelMsgIdx = %d, want 3 (last)", a.conversation.bodySelMsgIdx)
	}
	// g jumps to first.
	out, _ = a.Update(tea.KeyPressMsg{Code: 'g', Text: "g"})
	a = out.(*App)
	if a.conversation.bodySelMsgIdx != 0 {
		t.Errorf("after g, bodySelMsgIdx = %d, want 0 (first)", a.conversation.bodySelMsgIdx)
	}
}

// First up/down on an unset cursor seeds it (latest for up, first
// for down) — composes with FFFFF1's maybeInitBodyCursor.
func TestBodyUpDown_SeedsCursorWhenUnset(t *testing.T) {
	a := newReadyApp(
		[]gact.Session{{ID: "sess_1", Title: "t", Status: gact.StatusIdle}},
		[]gact.Message{
			{ID: "m1", Role: "user", Parts: []gact.Part{{Type: gact.PartTypeText, Text: "a"}}},
			{ID: "m2", Role: "assistant", Parts: []gact.Part{{Type: gact.PartTypeText, Text: "b"}}},
		},
	)
	a.width, a.height = 120, 30
	a.focus = FocusBody
	a.conversation.bodySelMsgIdx = -1

	// up on unset → seed to latest (idx=1).
	out, _ := a.Update(tea.KeyPressMsg{Code: tea.KeyUp})
	a = out.(*App)
	if a.conversation.bodySelMsgIdx != 1 {
		t.Errorf("up on unset cursor: idx = %d, want 1 (latest)", a.conversation.bodySelMsgIdx)
	}

	a.conversation.bodySelMsgIdx = -1
	out, _ = a.Update(tea.KeyPressMsg{Code: tea.KeyDown})
	a = out.(*App)
	if a.conversation.bodySelMsgIdx != 0 {
		t.Errorf("down on unset cursor: idx = %d, want 0 (first)", a.conversation.bodySelMsgIdx)
	}
}
