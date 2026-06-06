package ui

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// copyLastAssistantReplyToClipboard scans backwards through a.messages for
// the most recent assistant message and writes it through the shared
// clipboard adapter. Returns a toast describing the outcome; caller renders
// it as a transientHint.
func (a *App) copyLastAssistantReplyToClipboard() string {
	text, ok := lastAssistantText(a.messages)
	if !ok {
		return "no assistant reply to copy"
	}
	return copyExactTextToClipboard(text, "no assistant reply to copy", func(chars int) string {
		return fmt.Sprintf("copied %d chars to clipboard", chars)
	})
}

// copySelectedConversationOrLastAssistantToClipboard mirrors what operators
// expect from a visible transcript: copy the selected semantic block when the
// body cursor points at one, otherwise fall back to the selected message and
// finally to the newest assistant reply for the classic /copy behavior.
func (a *App) copySelectedConversationOrLastAssistantToClipboard() string {
	if a.bodySelMsgIdx >= 0 && a.bodySelMsgIdx < len(a.messages) {
		if text, ok := selectedConversationBlockText(a.messages, a.bodySelMsgIdx, a.bodySelPartIdx); ok {
			return copyExactTextToClipboard(text, "nothing to copy - selected block has no text", func(chars int) string {
				return fmt.Sprintf("copied selected block (%d chars) to clipboard", chars)
			})
		}
		if text, ok := messageText(a.messages[a.bodySelMsgIdx]); ok {
			return copyExactTextToClipboard(text, "nothing to copy - selected message has no text", func(chars int) string {
				return fmt.Sprintf("copied selected message (%d chars) to clipboard", chars)
			})
		}
		return "nothing to copy - selected block has no text"
	}
	return a.copyLastAssistantReplyToClipboard()
}

// openWorkspaceDiff opens a scrollable in-TUI detail view for the current git
// workspace. The operator should not have to chase a temp file just to inspect
// what CLIO is about to touch.
func (a *App) openWorkspaceDiff() string {
	cwd, err := os.Getwd()
	if err != nil {
		a.openWorkspaceDiffDetail("Workspace diff", "Could not resolve current directory.\n\n"+err.Error())
		return "workspace diff unavailable"
	}
	if _, err := exec.LookPath("git"); err != nil {
		a.openWorkspaceDiffDetail("Workspace diff", "Git is not available on PATH.\n\nInstall git or open this workspace in an environment with git available.")
		return "workspace diff unavailable"
	}

	// Detect whether CWD is inside a git work tree first. Without
	// this the "workspace clean" path also fires when CWD has no
	// .git at all — confusing because "clean" implies a known repo.
	check := exec.Command("git", "-C", cwd, "rev-parse", "--is-inside-work-tree")
	if checkOut, checkErr := check.CombinedOutput(); checkErr != nil ||
		strings.TrimSpace(string(checkOut)) != "true" {
		a.openWorkspaceDiffDetail("Workspace diff", strings.Join([]string{
			"Not a git repository.",
			"",
			"directory:",
			"  " + cwd,
			"",
			"Open a git workspace or use the workspace switcher before running /diff.",
		}, "\n"))
		return "workspace is not a git repo"
	}

	stat := exec.Command("git", "-C", cwd, "diff", "--stat")
	statOut, statErr := stat.CombinedOutput()
	if statErr != nil {
		body := strings.TrimSpace(string(statOut))
		if body == "" {
			body = statErr.Error()
		}
		a.openWorkspaceDiffDetail("Workspace diff", "Could not read git diff summary.\n\n"+body)
		return "workspace diff failed"
	}
	if len(strings.TrimSpace(string(statOut))) == 0 {
		a.openWorkspaceDiffDetail("Workspace diff · clean", strings.Join([]string{
			"No unstaged workspace changes.",
			"",
			"repository:",
			"  " + cwd,
		}, "\n"))
		return "workspace clean"
	}

	full := exec.Command("git", "-C", cwd, "diff")
	fullOut, fullErr := full.CombinedOutput()
	summary := strings.TrimSpace(string(statOut))
	body := strings.Join([]string{
		"Repository",
		"  " + cwd,
		"",
		"Summary",
		indentBlock(summary, "  "),
	}, "\n")
	if fullErr == nil {
		body += "\n\nPatch\n" + indentBlock(strings.TrimRight(string(fullOut), "\n"), "  ")
	} else {
		body += "\n\nPatch\n  Could not read full patch: " + fullErr.Error()
	}
	a.openWorkspaceDiffDetail("Workspace diff", body)
	lines := strings.Split(summary, "\n")
	return "workspace diff: " + strings.TrimSpace(lines[len(lines)-1])
}

func (a *App) openWorkspaceDiffDetail(title string, body string) {
	a.detailView = &bulkyPartRef{
		messageID: "workspace-diff",
		partID:    "git",
		title:     title,
		fullText:  strings.TrimSpace(body),
	}
	a.detailViewOpen = true
	a.detailScroll = 0
}

func indentBlock(text string, prefix string) string {
	text = strings.TrimRight(text, "\n")
	if strings.TrimSpace(text) == "" {
		return prefix + "(empty)"
	}
	lines := strings.Split(text, "\n")
	for i := range lines {
		lines[i] = prefix + lines[i]
	}
	return strings.Join(lines, "\n")
}

// currentRoutingMode reads the active session's routing_mode field, falling
// back to "auto" when unset or no session is selected. Used by the /mode
// cycle so each invocation moves to the next mode in sequence.
func (a *App) currentRoutingMode() string {
	if a.selected < 0 || a.selected >= len(a.sessions) {
		return "auto"
	}
	mode := a.sessions[a.selected].RoutingMode
	if mode == "" {
		return "auto"
	}
	return mode
}

// nextRoutingMode rotates auto → chat → experts → auto. Three states is
// enough that a quick cycle reaches the desired one without modal UI.
func nextRoutingMode(cur string) string {
	switch cur {
	case "auto":
		return "chat"
	case "chat":
		return "experts"
	default:
		return "auto"
	}
}

// patchRoutingModeCmd PATCHes /v1/sessions/{id} with the new routing_mode.
// On success the backend publishes session.updated which the SSE handler
// already mirrors back into a.sessions.
func patchRoutingModeCmd(c *client.Client, sessionID, mode string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_, err := c.PatchSession(ctx, sessionID, client.PatchSessionRequest{
			RoutingMode: &mode,
		})
		if err != nil {
			return errMsg{err: err, stage: "patch-routing-mode"}
		}
		return nil
	}
}

// requestCompactCmd asks the backend to summarize the current session.
// CLIO's current GACT surface is /summarize; older /compact wiring was
// provisional and would truthfully fail on current CLIO.
func requestCompactCmd(c *client.Client, sessionID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
		defer cancel()
		if err := c.SummarizeSession(ctx, sessionID, true, ""); err != nil {
			return sessionSummarizedMsg{sessionID: sessionID, err: err}
		}
		session, err := c.GetSession(ctx, sessionID)
		if err != nil {
			return sessionSummarizedMsg{sessionID: sessionID, err: err}
		}
		return sessionSummarizedMsg{sessionID: sessionID, session: session}
	}
}

type sessionSummarizedMsg struct {
	sessionID string
	session   gact.Session
	err       error
}
