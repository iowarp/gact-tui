package ui

// autorename.go derives auto session titles from message text and issues the title-patch commands.

import (
	"context"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// autoRenameTitleMaxLen is the character budget for the derived
// session title. Longer than the sidebar can show, but truncate() will
// ellipsize it there — keeping more characters here means the full
// title is preserved in the header and in /v1/sessions.
const autoRenameTitleMaxLen = 60

// autoRenameTitle decides whether the just-posted user message should
// trigger an auto-rename. Returns (newTitle, true) when yes; the
// caller then dispatches a PATCH via patchSessionTitleCmd.
//
// Rules:
//  1. Session must be findable in a.session.sessions (we need its ID + title).
//  2. Session title must still look default: empty, or starts with
//     "new session " (the prefix sessions get at creation time).
//  3. Session must have no prior user messages. We approximate this
//     by checking that the loaded a.conversation.messages contains at most one
//     user message (the one we just posted, which may already have
//     been reflected via SSE by the time we get here — or may not,
//     so the "at most one" bound covers both orderings).
//
// Returns ok=false if any check fails; the caller treats that as "no
// rename this round." False negatives are fine — it just means the
// title stays at "new session HH:MM:SS", which is today's behaviour.
func autoRenameTitle(a *App, sessionID, text string) (string, bool) {
	if text == "" {
		return "", false
	}
	idx := -1
	for i, s := range a.session.sessions {
		if s.ID == sessionID {
			idx = i
			break
		}
	}
	if idx < 0 {
		return "", false
	}
	curr := a.session.sessions[idx].Title
	if curr != "" && !strings.HasPrefix(curr, "new session ") {
		return "", false
	}
	// Count user messages. If there's already more than one, this is a
	// later message in an ongoing conversation and rename is stale.
	userMessageCount := 0
	for _, m := range a.conversation.messages {
		if m.Role == gact.RoleUser {
			userMessageCount++
		}
	}
	if userMessageCount > 1 {
		return "", false
	}
	return derivedTitle(text), true
}

// derivedTitle turns a prompt into a plausible session title: first
// line, collapse whitespace, truncate at autoRenameTitleMaxLen with
// ellipsis. Keeps the helper exported at package scope so tests can
// cover it without booting an App.
func derivedTitle(text string) string {
	if i := strings.IndexByte(text, '\n'); i >= 0 {
		text = text[:i]
	}
	text = strings.Join(strings.Fields(text), " ")
	if text == "" {
		return "untitled"
	}
	runes := []rune(text)
	if len(runes) <= autoRenameTitleMaxLen {
		return text
	}
	return string(runes[:autoRenameTitleMaxLen-1]) + "…"
}

// patchSessionTitleCmd dispatches PATCH /v1/sessions/{id} with the
// new title. Returns sessionTitleRenamedMsg so the Update handler can
// mirror the change into a.session.sessions without a full list refetch.
// Silent on failure because this path is used for auto-rename, which
// is a nicety rather than an explicit user action.
func patchSessionTitleCmd(c *client.Client, sessionID, title string) tea.Cmd {
	return patchSessionTitleCmdWithOptions(c, sessionID, title, false, "")
}

func patchManualSessionTitleCmd(c *client.Client, sessionID, title, previousTitle string) tea.Cmd {
	return patchSessionTitleCmdWithOptions(c, sessionID, title, true, previousTitle)
}

func patchSessionTitleCmdWithOptions(c *client.Client, sessionID, title string, manual bool, previousTitle string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_, err := c.PatchSession(ctx, sessionID, client.PatchSessionRequest{
			Title: &title,
		})
		if err != nil {
			return sessionTitleRenamedMsg{
				sessionID:     sessionID,
				title:         "",
				err:           err,
				manual:        manual,
				previousTitle: previousTitle,
			}
		}
		return sessionTitleRenamedMsg{sessionID: sessionID, title: title, manual: manual}
	}
}

type sessionTitleRenamedMsg struct {
	sessionID     string
	title         string
	err           error
	manual        bool
	previousTitle string
}

func (c *sessionComponent) handleTitleRenamed(m sessionTitleRenamedMsg) (tea.Model, tea.Cmd) {
	if m.err != nil {
		if !m.manual {
			// Auto-rename failed: keep the default title silently because
			// this is background polish, not the user's explicit action.
			return c.app, nil
		}
		if m.previousTitle != "" {
			for i, s := range c.sessions {
				if s.ID == m.sessionID {
					c.sessions[i].Title = m.previousTitle
					break
				}
			}
		}
		c.app.setHint("rename failed: " + operatorErrorMessage(m.err))
		return c.app, scheduleHintExpire(c.app.transientHint)
	}
	// Mirror the new title into c.sessions so the sidebar updates
	// without a full list refetch.
	for i, s := range c.sessions {
		if s.ID == m.sessionID {
			c.sessions[i].Title = m.title
			break
		}
	}
	return c.app, nil
}
