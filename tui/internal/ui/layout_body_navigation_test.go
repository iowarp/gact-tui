package ui

import (
	"strings"
	"testing"
	"time"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// TestBodyCursor_DeleteTargetsSelection covers Y2: with the body cursor on a
// non-last message, `d` drops that specific message instead of the latest one.
func TestBodyCursor_DeleteTargetsSelection(t *testing.T) {
	sessions := []gact.Session{{ID: "s1", Title: "demo", Status: gact.StatusIdle}}
	msgs := []gact.Message{
		{ID: "m1", SessionID: "s1", Role: gact.RoleUser,
			Parts: []gact.Part{{Type: gact.PartTypeText, Text: "first", ID: "p1"}}},
		{ID: "m2", SessionID: "s1", Role: gact.RoleAssistant,
			Parts: []gact.Part{{Type: gact.PartTypeText, Text: "middle", ID: "p2"}}},
		{ID: "m3", SessionID: "s1", Role: gact.RoleUser,
			Parts: []gact.Part{{Type: gact.PartTypeText, Text: "last", ID: "p3"}}},
	}
	a := newReadyApp(sessions, msgs)
	a.focus = FocusBody
	a.conversation.bodySelMsgIdx = 1 // target the middle message

	out, cmd := a.Update(tea.KeyPressMsg{Code: 'd', Text: "d"})
	a = out.(*App)
	if len(a.conversation.messages) != 2 {
		t.Fatalf("want 2 messages after delete, got %d", len(a.conversation.messages))
	}
	remaining := []string{a.conversation.messages[0].ID, a.conversation.messages[1].ID}
	if remaining[0] != "m1" || remaining[1] != "m3" {
		t.Fatalf("wrong messages remain: %v", remaining)
	}
	if cmd == nil {
		t.Fatalf("expected deleteMessageCmd")
	}
	if a.conversation.bodySelMsgIdx != 1 {
		t.Errorf("cursor should stay at 1 after delete, got %d", a.conversation.bodySelMsgIdx)
	}
}

// TestBodyCursor_WalksMessages covers Y1: `n` advances the body cursor and
// `N` walks it backward, clamped at both ends.
func TestBodyCursor_WalksMessages(t *testing.T) {
	sessions := []gact.Session{{ID: "s1", Title: "demo", Status: gact.StatusIdle}}
	msgs := []gact.Message{
		{ID: "m1", SessionID: "s1", Role: gact.RoleUser,
			Parts: []gact.Part{{Type: gact.PartTypeText, Text: "a", ID: "p1"}}},
		{ID: "m2", SessionID: "s1", Role: gact.RoleAssistant,
			Parts: []gact.Part{{Type: gact.PartTypeText, Text: "b", ID: "p2"}}},
		{ID: "m3", SessionID: "s1", Role: gact.RoleUser,
			Parts: []gact.Part{{Type: gact.PartTypeText, Text: "c", ID: "p3"}}},
	}
	a := newReadyApp(sessions, msgs)
	a.focus = FocusBody

	if a.conversation.bodySelMsgIdx != -1 {
		t.Fatalf("default bodySelMsgIdx = %d, want -1", a.conversation.bodySelMsgIdx)
	}

	out, _ := a.Update(tea.KeyPressMsg{Code: 'n', Text: "n"})
	a = out.(*App)
	if a.conversation.bodySelMsgIdx != 0 {
		t.Fatalf("after first n, idx = %d, want 0", a.conversation.bodySelMsgIdx)
	}

	for i := 0; i < 4; i++ {
		out, _ = a.Update(tea.KeyPressMsg{Code: 'n', Text: "n"})
		a = out.(*App)
	}
	if a.conversation.bodySelMsgIdx != 2 {
		t.Fatalf("after many n, idx = %d, want 2 (clamped)", a.conversation.bodySelMsgIdx)
	}

	out, _ = a.Update(tea.KeyPressMsg{Code: 'N', Text: "N"})
	a = out.(*App)
	if a.conversation.bodySelMsgIdx != 1 {
		t.Fatalf("after N, idx = %d, want 1", a.conversation.bodySelMsgIdx)
	}

	plain := ansi.Strip(renderAtSize(a, 110, 30))
	if !strings.Contains(plain, "▌ ") {
		t.Errorf("body cursor glyph missing:\n%s", plain)
	}
}

// TestSearchJump_MarksMessage verifies V3: jumpToMessage sets
// searchHitMessageID and the rendered conversation contains the gutter marker
// on the matching row.
func TestSearchJump_MarksMessage(t *testing.T) {
	sessions := []gact.Session{{ID: "s1", Title: "demo", Status: gact.StatusIdle}}
	msgs := []gact.Message{
		{ID: "m1", SessionID: "s1", Role: gact.RoleUser,
			Parts: []gact.Part{{Type: gact.PartTypeText, Text: "first", ID: "p1"}}},
		{ID: "m2", SessionID: "s1", Role: gact.RoleAssistant,
			Parts: []gact.Part{{Type: gact.PartTypeText, Text: "second", ID: "p2"}}},
	}
	a := newReadyApp(sessions, msgs)
	a.conversation.jumpToMessage("m2")

	if a.conversation.searchHitMessageID != "m2" {
		t.Fatalf("searchHitMessageID = %q, want m2", a.conversation.searchHitMessageID)
	}

	rendered := ansi.Strip(renderAtSize(a, 110, 30))
	if !strings.Contains(rendered, "▶ ") {
		t.Fatalf("gutter marker missing from render:\n%s", rendered)
	}
}

// TestTimestampToggle_FlipsAndRenders verifies S1: body-focus `t` toggles
// Theme.ShowTimestamps, and the rendered conversation includes a formatted
// timestamp when the flag is on.
func TestTimestampToggle_FlipsAndRenders(t *testing.T) {
	ts := time.Date(2026, 4, 18, 20, 34, 5, 0, time.UTC)
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	msgs := []gact.Message{
		{
			ID: "m1", SessionID: "sess_1", Role: gact.RoleUser,
			CreatedAt: ts,
			Parts:     []gact.Part{{ID: "p1", Type: gact.PartTypeText, Text: "hi"}},
		},
	}
	a := newReadyApp(sessions, msgs)
	a.focus = FocusBody

	plain := ansi.Strip(renderAtSize(a, 110, 30))
	if strings.Contains(plain, "2026-04-18 20:34:05") {
		t.Fatalf("timestamp shown before toggle")
	}

	out, _ := a.Update(tea.KeyPressMsg{Code: 't', Text: "t"})
	a = out.(*App)
	if !a.Theme.ShowTimestamps {
		t.Fatalf("showTimestamps didn't flip on")
	}

	plain = ansi.Strip(renderAtSize(a, 110, 30))
	if !strings.Contains(plain, "2026-04-18 20:34:05") {
		t.Fatalf("timestamp missing after toggle-on: %q", plain[:400])
	}

	out, _ = a.Update(tea.KeyPressMsg{Code: 't', Text: "t"})
	a = out.(*App)
	if a.Theme.ShowTimestamps {
		t.Fatalf("showTimestamps didn't flip off")
	}
}
