package ui

// live_event_context.go decides which SSE events apply to the current session and filters stale replays.

import (
	"strings"
	"time"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

func sameSessionOrUnknown(a, b string) bool {
	a = strings.TrimSpace(a)
	b = strings.TrimSpace(b)
	return a == "" || b == "" || a == b
}

func operatorNotificationTitle(title string) string {
	return strings.ReplaceAll(title, "MCP server", "MCP connection")
}

func (c *conversationComponent) shouldIgnoreStatusReplay(sessionID, incoming string, e client.SSEEvent) bool {
	if incoming != gact.StatusRunning && incoming != gact.StatusWaitingPermission {
		return false
	}
	idx := -1
	for i := range c.app.session.sessions {
		if c.app.session.sessions[i].ID == sessionID {
			idx = i
			break
		}
	}
	if idx < 0 || !sessionStatusIsTerminal(c.app.session.sessions[idx].Status) {
		return false
	}
	eventTime, ok := sseOccurredAt(e)
	if !ok || c.app.session.sessions[idx].UpdatedAt.IsZero() {
		return false
	}
	return !eventTime.After(c.app.session.sessions[idx].UpdatedAt)
}

func (c *conversationComponent) shouldIgnoreSessionReplay(sessionID string, e client.SSEEvent) bool {
	sessionID = strings.TrimSpace(sessionID)
	if sessionID == "" {
		return false
	}
	idx := -1
	for i := range c.app.session.sessions {
		if c.app.session.sessions[i].ID == sessionID {
			idx = i
			break
		}
	}
	if idx < 0 || c.app.session.sessions[idx].UpdatedAt.IsZero() {
		return false
	}
	eventTime, ok := sseOccurredAt(e)
	if !ok {
		return false
	}
	return !eventTime.After(c.app.session.sessions[idx].UpdatedAt)
}

func (c *conversationComponent) replaySessionID(sessionID string) string {
	sessionID = strings.TrimSpace(sessionID)
	if sessionID != "" {
		return sessionID
	}
	return c.app.session.currentID()
}

func (c *conversationComponent) eventSessionID(e client.SSEEvent) string {
	pl := eventPayload(e)
	if sid := strings.TrimSpace(valuefmt.StringValue(pl["session_id"])); sid != "" {
		return sid
	}
	return c.app.session.currentID()
}

func sessionStatusIsTerminal(status string) bool {
	switch status {
	case gact.StatusIdle, gact.StatusError, gact.StopReasonCancelled, "completed", "failed":
		return true
	default:
		return false
	}
}

func sseOccurredAt(e client.SSEEvent) (time.Time, bool) {
	raw := strings.TrimSpace(valuefmt.StringValue(e.Payload["occurred_at"]))
	if raw == "" {
		return time.Time{}, false
	}
	t, err := time.Parse(time.RFC3339Nano, raw)
	if err != nil {
		return time.Time{}, false
	}
	return t, true
}
