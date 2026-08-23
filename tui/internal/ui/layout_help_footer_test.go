package ui

import (
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

// longConversation returns n alternating user/assistant messages so the
// rendered body is guaranteed to exceed any realistic viewport.
func longConversation(sessionID string, n int) []gact.Message {
	out := make([]gact.Message, 0, n)
	for i := 0; i < n; i++ {
		role := gact.RoleUser
		text := "user turn "
		if i%2 == 1 {
			role = gact.RoleAssistant
			text = "assistant turn "
		}
		out = append(out, gact.Message{
			ID:        "msg_" + itoa(i),
			SessionID: sessionID,
			Role:      role,
			Parts: []gact.Part{{
				ID: "p" + itoa(i), Type: gact.PartTypeText,
				Text: text + itoa(i) + "\nsecond line of " + itoa(i) + "\nthird line of " + itoa(i),
			}},
		})
	}
	return out
}

// TestFooter_StaysInFrameOnLongConversation reproduces the user-reported
// "footer disappears when conversation grows" bug. The fix keeps the
// total rendered height equal to a.height, which guarantees the footer
// row is visible at the bottom.
func TestFooter_StaysInFrameOnLongConversation(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a := newReadyApp(sessions, longConversation("sess_1", 40))

	const W, H = 110, 30
	rendered := renderAtSize(a, W, H)
	lines := strings.Split(rendered, "\n")
	if len(lines) > H {
		t.Fatalf("rendered %d lines for height=%d — footer would overflow", len(lines), H)
	}

	// Footer must be on the last visible line. The exact hints are
	// responsive, but quit stays present as the terminal-level escape.
	last := lines[len(lines)-1]
	if !strings.Contains(last, "Ctrl+C") {
		t.Fatalf("last row missing footer quit hint — got:\n%q", last)
	}
}

// TestHelpOverlay_TabCycles checks that ←/→ rotate helpTab within bounds
// so the tabbed help overlay never wraps past either end.
func TestHelpOverlay_TabCycles(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.help.open = true
	a.help.tab = 0

	// Right should increment up to helpTabCount-1 and stop.
	for i := 1; i < helpTabCount; i++ {
		out, _ := a.Update(tea.KeyPressMsg{Code: tea.KeyRight})
		a = out.(*App)
		if a.help.tab != i {
			t.Fatalf("after %d right-presses, helpTab = %d, want %d", i, a.help.tab, i)
		}
	}
	// One more right should stay pinned to the last tab.
	out, _ := a.Update(tea.KeyPressMsg{Code: tea.KeyRight})
	a = out.(*App)
	if a.help.tab != helpTabCount-1 {
		t.Fatalf("right past last tab: helpTab = %d, want %d", a.help.tab, helpTabCount-1)
	}

	// Left walks back to 0 and stops.
	for i := helpTabCount - 2; i >= 0; i-- {
		out, _ = a.Update(tea.KeyPressMsg{Code: tea.KeyLeft})
		a = out.(*App)
		if a.help.tab != i {
			t.Fatalf("helpTab = %d, want %d", a.help.tab, i)
		}
	}
	out, _ = a.Update(tea.KeyPressMsg{Code: tea.KeyLeft})
	a = out.(*App)
	if a.help.tab != 0 {
		t.Fatalf("left past first tab: helpTab = %d, want 0", a.help.tab)
	}
}

// TestHelpOverlay_FitsInSmallViewport verifies the overlay no longer
// overflows at the viewport size users report — 80x24 was the smallest
// size reviewers complained about.
func TestHelpOverlay_FitsInSmallViewport(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.help.open = true

	for _, dim := range []struct{ W, H int }{
		{80, 24}, {100, 30}, {110, 30},
	} {
		for tab := 0; tab < helpTabCount; tab++ {
			a.help.tab = tab
			rendered := renderAtSize(a, dim.W, dim.H)
			lines := strings.Count(rendered, "\n") + 1
			if lines > dim.H {
				t.Errorf("tab=%d W=%d H=%d: rendered %d lines > H", tab, dim.W, dim.H, lines)
			}
		}
	}
}
