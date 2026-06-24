package ui

// workspace_create_commands.go defines workspace create/clone commands and their messages/errors.

import (
	"context"
	"os/exec"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

type workspaceCreatedMsg struct {
	workspace gact.Workspace
	err       error
}

type workspaceCloneError struct {
	message string
}

func (e workspaceCloneError) Error() string {
	if strings.TrimSpace(e.message) == "" {
		return "Git clone failed"
	}
	return "Git clone failed: " + e.message
}

func createWorkspaceCmd(c *client.Client, name, rootPath string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		ws, err := c.CreateWorkspace(ctx, client.CreateWorkspaceRequest{Name: name, RootPath: rootPath})
		return workspaceCreatedMsg{workspace: ws, err: err}
	}
}

func cloneAndCreateWorkspaceCmd(c *client.Client, name, rootPath, gitURL string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		defer cancel()
		cmd := exec.CommandContext(ctx, "git", "clone", gitURL, rootPath)
		out, err := cmd.CombinedOutput()
		if err != nil {
			return workspaceCreatedMsg{err: workspaceCloneError{message: gitCloneFailureMessage(err, string(out))}}
		}
		ws, err := c.CreateWorkspace(ctx, client.CreateWorkspaceRequest{
			Name:     name,
			RootPath: rootPath,
			Metadata: map[string]any{
				"source":  "git",
				"git_url": gitURL,
			},
		})
		return workspaceCreatedMsg{workspace: ws, err: err}
	}
}

func gitCloneFailureMessage(err error, output string) string {
	lines := strings.Split(strings.ReplaceAll(output, "\r\n", "\n"), "\n")
	interesting := make([]string, 0, len(lines))
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(strings.ToLower(line), "cloning into ") {
			continue
		}
		interesting = append(interesting, line)
	}
	msg := strings.Join(interesting, " ")
	if msg == "" && err != nil {
		msg = err.Error()
	}
	msg = strings.TrimSpace(msg)
	if msg == "" {
		return "git exited without diagnostic output"
	}
	return msg
}
