package ui

// workspaceModal diff command: the /diff path that renders the current git
// workspace into the in-TUI detail overlay instead of a temp file.

import (
	"os"
	"os/exec"
	"strings"
)

// openWorkspaceDiff opens a scrollable in-TUI detail view for the current git
// workspace. The operator should not have to chase a temp file just to inspect
// what CLIO is about to touch.
func (m *workspaceModal) openWorkspaceDiff() string {
	cwd, err := os.Getwd()
	if err != nil {
		m.openWorkspaceDiffDetail("Workspace diff", "Could not resolve current directory.\n\n"+err.Error())
		return "workspace diff unavailable"
	}
	if _, err := exec.LookPath("git"); err != nil {
		m.openWorkspaceDiffDetail("Workspace diff", "Git is not available on PATH.\n\nInstall git or open this workspace in an environment with git available.")
		return "workspace diff unavailable"
	}

	// Detect whether CWD is inside a git work tree first. Without
	// this the "workspace clean" path also fires when CWD has no
	// .git at all — confusing because "clean" implies a known repo.
	check := exec.Command("git", "-C", cwd, "rev-parse", "--is-inside-work-tree")
	if checkOut, checkErr := check.CombinedOutput(); checkErr != nil ||
		strings.TrimSpace(string(checkOut)) != "true" {
		m.openWorkspaceDiffDetail("Workspace diff", strings.Join([]string{
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
		m.openWorkspaceDiffDetail("Workspace diff", "Could not read git diff summary.\n\n"+body)
		return "workspace diff failed"
	}
	if len(strings.TrimSpace(string(statOut))) == 0 {
		m.openWorkspaceDiffDetail("Workspace diff · clean", strings.Join([]string{
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
	m.openWorkspaceDiffDetail("Workspace diff", body)
	lines := strings.Split(summary, "\n")
	return "workspace diff: " + strings.TrimSpace(lines[len(lines)-1])
}

func (m *workspaceModal) openWorkspaceDiffDetail(title string, body string) {
	a := m.app
	a.detail.open(&bulkyPartRef{
		messageID: "workspace-diff",
		partID:    "git",
		title:     title,
		fullText:  strings.TrimSpace(body),
	})
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
