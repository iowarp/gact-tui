package ui

// spinner.go provides the spinner tick command and busy/thinking status indicators.

import (
	"time"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

// spinnerFrames is a standard Braille dots spinner. Short cycle means
// long turns feel animated without needing a huge frame count.
var spinnerFrames = []string{"⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"}

// modalStatusRows renders the shared error + busy-spinner status block used by
// the text-entry modals (mcp-install, expert-pack-install, agent-blueprint-
// manage, …). An empty errText omits the error line; busy==false omits the
// spinner line. busyLabel is the text shown after the spinner glyph (e.g.
// "installing…"). Returns an empty slice when neither row applies.
func (m *modalkit) modalStatusRows(errText string, busy bool, busyLabel string) []string {
	t := m.app.Theme
	rows := []string{}
	if errText != "" {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.Danger).Italic(true).
			Render("error: "+errText))
	}
	if busy {
		rows = append(rows, lipgloss.NewStyle().Foreground(t.Warning).Italic(true).
			Render(m.app.ticker.spinnerChar()+" "+busyLabel))
	}
	return rows
}

// spinnerTickInterval balances "feels alive" against "burns CPU". At
// 100 ms we redraw 10x/sec, same as most TUIs. Dropped to 125 ms after
// spot-checking that the terminal keeps up under load.
const spinnerTickInterval = 125 * time.Millisecond

// spinnerTickMsg advances the spinner frame counter. Emitted by a
// self-rescheduling tea.Tick only while at least one visible session
// is non-idle — an idle TUI costs no frames.
type spinnerTickMsg struct{}

// spinnerCmd schedules the next spinnerTickMsg. Called from
// connectedMsg (to bootstrap) and again from every spinnerTickMsg
// handler when there's still something running.
func spinnerCmd() tea.Cmd {
	return scheduleTick(spinnerTickInterval, func() tea.Msg {
		return spinnerTickMsg{}
	})
}

// anyRunning reports whether any session we know about is
// non-idle. Used as the gate for rescheduling the spinner tick —
// lets the tick loop drain naturally when everything settles.
func (c *sessionComponent) anyRunning() bool {
	// Fast path: the header status is derived from the selected
	// session. If it's non-idle we're already running.
	if c.currentStatus != "" && c.currentStatus != gact.StatusIdle {
		return true
	}
	// Scan the full sidebar too — a subagent turn might be running on
	// a session we don't have selected, and the user should still see
	// the dot animate on it.
	for _, s := range c.sessions {
		if s.Status != "" && s.Status != gact.StatusIdle {
			return true
		}
	}
	return false
}

// shouldShowThinkingIndicator decides whether to append a "thinking…"
// row to the conversation. True when the current session is running AND
// the latest visible message has no rendered text/tool parts yet — i.e.
// the user is staring at their own message wondering if anything is
// happening. Once the assistant streams a delta or fires a tool call,
// the placeholder vanishes (real content takes over).
func (c *conversationComponent) shouldShowThinkingIndicator() bool {
	a := c.app
	if a.session.currentStatus != gact.StatusRunning &&
		a.session.currentStatus != gact.StatusWaitingPermission {
		return false
	}
	if len(c.messages) == 0 {
		return true
	}
	last := c.messages[len(c.messages)-1]
	// User just sent something; no assistant turn has started yet.
	if last.Role == gact.RoleUser {
		return true
	}
	// Assistant turn started but emitted no body yet (thinking parts on
	// their own don't count as "visible content" for this signal — the
	// thinking pane already conveys progress).
	if last.Role == gact.RoleAssistant {
		for _, p := range last.Parts {
			switch p.Type {
			case gact.PartTypeText, gact.PartTypeToolCall,
				gact.PartTypeToolResult, gact.PartTypeFileDiff,
				gact.PartTypeRoutingDecision:
				return false
			}
		}
		return true
	}
	return false
}

// statusDot renders the leading glyph for a session row in the
// sidebar. Animates for running; static for waiting_permission and
// idle. Colours are theme-aware so the light/dark palettes both read
// correctly.
//
// Returned string is one glyph + one space, width-stable so the title
// line lines up regardless of status.
func (c *sessionComponent) statusDot(status string) string {
	t := c.app.Theme
	switch status {
	case gact.StatusRunning:
		return lipgloss.NewStyle().Foreground(t.Warning).Render(c.app.ticker.spinnerChar()) + " "
	case gact.StatusWaitingPermission:
		return lipgloss.NewStyle().Foreground(t.Warning).Bold(true).Render("⚠") + " "
	case gact.StatusIdle, "":
		return lipgloss.NewStyle().Foreground(t.FgMuted).Render("○") + " "
	default:
		// Forward-compat: unknown statuses get a neutral dot so nothing
		// is "broken" if the backend adds new values.
		return lipgloss.NewStyle().Foreground(t.FgMuted).Render("○") + " "
	}
}
