package ui

import (
	"testing"

	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

// TestRenderBody_ReturnsExactHeight is the tight viewport contract: regardless
// of content size, the final rendered TUI View is bounded by a.height rows.
func TestRenderBody_ReturnsExactHeight(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a := newReadyApp(sessions, longConversation("sess_1", 100))

	for _, dim := range []struct{ W, H int }{
		{80, 20}, {100, 30}, {140, 40}, {60, 12},
	} {
		rendered := renderAtSize(a, dim.W, dim.H)
		got := lipgloss.Height(rendered)
		if got > dim.H {
			t.Errorf("W=%d H=%d: rendered %d lines (> H)", dim.W, dim.H, got)
		}
	}
}
