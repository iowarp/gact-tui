package ui

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"

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

// openWorkspaceDiff runs `git diff --stat` in the current working directory
// (or in a parent if CWD isn't a repo root) and stuffs the output into the
// transientHint. The full diff is also written to /tmp/clio-diff-<ts>.patch
// for users who want the full content (the toast pointer is included in
// the hint). Long-term this should pop a scrollable modal — short-term, a
// single-line toast + tmp file already beats nothing.
func (a *App) openWorkspaceDiff() string {
	cwd, err := os.Getwd()
	if err != nil {
		return "git diff: " + err.Error()
	}
	if _, err := exec.LookPath("git"); err != nil {
		return "git diff: git not on PATH"
	}

	// Detect whether CWD is inside a git work tree first. Without
	// this the "workspace clean" path also fires when CWD has no
	// .git at all — confusing because "clean" implies a known repo.
	check := exec.Command("git", "-C", cwd, "rev-parse", "--is-inside-work-tree")
	if checkOut, checkErr := check.CombinedOutput(); checkErr != nil ||
		strings.TrimSpace(string(checkOut)) != "true" {
		return "git diff: " + cwd + " is not a git repo"
	}

	stat := exec.Command("git", "-C", cwd, "diff", "--stat")
	statOut, statErr := stat.CombinedOutput()
	if statErr != nil {
		return "git diff: " + strings.TrimSpace(string(statOut))
	}
	if len(strings.TrimSpace(string(statOut))) == 0 {
		return "git diff: workspace clean"
	}

	full := exec.Command("git", "-C", cwd, "diff")
	fullOut, fullErr := full.CombinedOutput()
	if fullErr == nil {
		stamp := time.Now().Format("20060102-150405")
		path := filepath.Join(os.TempDir(), fmt.Sprintf("clio-diff-%s.patch", stamp))
		_ = os.WriteFile(path, fullOut, 0o600)
		summary := strings.TrimSpace(string(statOut))
		// Keep the toast on one line by collapsing the stat to the
		// summary row (last non-empty line).
		lines := strings.Split(summary, "\n")
		summaryLine := lines[len(lines)-1]
		return fmt.Sprintf("git diff: %s · full patch at %s", summaryLine, path)
	}
	return "git diff: " + strings.TrimSpace(string(statOut))
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

// requestCompactCmd POSTs to a (provisional) backend endpoint that asks the
// server to summarise the conversation and reclaim context. CLIO doesn't
// expose this endpoint yet — call returns 501/404 — but plumbing the
// command + dispatch path now means turning it on later is a one-line
// backend swap, not another TUI release.
func requestCompactCmd(c *client.Client, sessionID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
		defer cancel()
		req, _ := http.NewRequestWithContext(
			ctx,
			http.MethodPost,
			c.BaseURL()+"/v1/sessions/"+sessionID+"/compact",
			nil,
		)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return errMsg{err: err, stage: "compact"}
		}
		defer resp.Body.Close()
		if resp.StatusCode >= 400 {
			return errMsg{
				err:   fmt.Errorf("backend %d (compact endpoint not yet wired on this backend)", resp.StatusCode),
				stage: "compact",
			}
		}
		return nil
	}
}
