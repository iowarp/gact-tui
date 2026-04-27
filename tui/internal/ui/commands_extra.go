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

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// copyLastAssistantReplyToClipboard scans backwards through a.messages for
// the most recent assistant message, concatenates its text parts, and pipes
// the result into a platform clipboard tool. Falls back to writing
// /tmp/clio-copy-<timestamp>.txt when nothing on PATH can do it (e.g. SSH
// session with no clipboard daemon). Returns a toast describing the
// outcome — caller renders it as a transientHint.
func (a *App) copyLastAssistantReplyToClipboard() string {
	text := ""
	for i := len(a.messages) - 1; i >= 0; i-- {
		m := a.messages[i]
		if m.Role != gact.RoleAssistant {
			continue
		}
		var parts []string
		for _, p := range m.Parts {
			if p.Type == gact.PartTypeText && p.Text != "" {
				parts = append(parts, p.Text)
			}
		}
		if len(parts) > 0 {
			text = strings.Join(parts, "\n\n")
			break
		}
	}
	if text == "" {
		return "no assistant reply to copy"
	}

	candidates := [][]string{
		{"wl-copy"},                      // Wayland
		{"xclip", "-selection", "clipboard"},
		{"xsel", "--clipboard", "--input"},
		{"pbcopy"},                       // macOS
		{"clip.exe"},                     // Windows / WSL
	}
	for _, c := range candidates {
		if _, err := exec.LookPath(c[0]); err != nil {
			continue
		}
		cmd := exec.Command(c[0], c[1:]...)
		cmd.Stdin = strings.NewReader(text)
		if err := cmd.Run(); err == nil {
			return fmt.Sprintf("copied %d chars to clipboard via %s", len(text), c[0])
		}
	}

	// Fallback: write to a tmp file so the user can scp it / cat it.
	stamp := time.Now().Format("20060102-150405")
	path := filepath.Join(os.TempDir(), fmt.Sprintf("clio-copy-%s.txt", stamp))
	if err := os.WriteFile(path, []byte(text), 0o600); err != nil {
		return "copy failed: no clipboard tool + " + err.Error()
	}
	return "no clipboard tool found; wrote " + path
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
