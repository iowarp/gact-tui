package ui

// app_commands.go defines App.Init plus the backend connect command, connected message, and startup-workspace selection.

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

type connectedMsg struct {
	caps     gact.Capabilities
	wss      []gact.Workspace
	wsID     string
	sessions []gact.Session
	commands []gact.Command
}

// Init returns the initial Cmd: connect.
func (a *App) Init() tea.Cmd {
	// Defer the connect handshake until the splash dismisses.
	// Without this, connectedMsg can arrive before the user sees the
	// splash and flip straight to StageReady.
	if a.stage == StageIntro {
		// Start the frame-advance tick as soon as the
		// splash renders, so the animation runs while the user
		// reads "press any key to continue".
		return a.ticker.introTickCmd()
	}
	return a.connection.connectCmd()
}

func (c *connectionComponent) connectCmd() tea.Cmd {
	return connectCmd(c.app.c, c.connectWorkspaceSelector())
}

func (c *connectionComponent) connectWorkspaceSelector() string {
	selector := strings.TrimSpace(c.app.session.wsID)
	if selector == "" {
		selector = c.app.InitialWorkspaceSelector
	}
	return strings.TrimSpace(selector)
}

func connectCmd(c *client.Client, workspaceSelector string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		caps, err := c.Capabilities(ctx)
		if err != nil {
			return errMsg{err: err, stage: "capabilities"}
		}
		// Only hit /v1/workspaces when the backend advertises the
		// capability. Backends that don't model workspaces (e.g.
		// clio-agent-gact) advertise workspaces=false and 501 on
		// the endpoint; the TUI used to blow up on the error
		// before gating.
		var wss []gact.Workspace
		if caps.Capabilities.Workspaces {
			wss, err = c.ListWorkspaces(ctx)
			if err != nil {
				return errMsg{err: err, stage: "workspaces"}
			}
		}
		var sessions []gact.Session
		var wsID string
		if len(wss) > 0 {
			wsID, err = selectStartupWorkspaceID(wss, workspaceSelector)
			if err != nil {
				return errMsg{err: err, stage: "workspaces"}
			}
			sessions, err = c.ListSessions(ctx, client.SessionFilter{WorkspaceID: wsID})
			if err != nil {
				return errMsg{err: err, stage: "sessions"}
			}
		} else if caps.Capabilities.Sessions {
			// No workspace dimension — list sessions scoped only
			// by backend. ListSessions with empty WorkspaceID
			// omits the filter.
			sessions, err = c.ListSessions(ctx, client.SessionFilter{})
			if err != nil {
				return errMsg{err: err, stage: "sessions"}
			}
		}
		commands, _ := c.ListCommandsScoped(ctx, client.CommandFilter{
			RuntimeScope: client.RuntimeScope{WorkspaceID: wsID},
		})
		return connectedMsg{caps: caps, wss: wss, wsID: wsID, sessions: sessions, commands: commands}
	}
}

func (c *connectionComponent) handleConnected(m connectedMsg) (tea.Model, tea.Cmd) {
	a := c.app
	a.stage = StageReady
	c.connectRetryAttempts = 0
	a.session.applyConnected(m.caps, m.wss, m.wsID, m.sessions)
	a.fileViewer.syncRootToWorkspace()
	a.cmdPalette.loadCommands(m.commands)

	cmds := []tea.Cmd{spinnerCmd()}
	if !a.fileViewer.fileTreeRefresh {
		a.fileViewer.fileTreeRefresh = true
		cmds = append(cmds, fileViewerRefreshCmd())
	}
	if a.session.caps.Capabilities.Memory {
		cmds = append(cmds, memoryStatsScopedCmd(a.c, client.RuntimeScope{WorkspaceID: a.session.wsID}))
	}
	if a.session.caps.Capabilities.XClioContextFrames {
		cmds = append(cmds, footerContextStateCmd(a.c, a.session.runtimeScope(), a.agent.nextTurnAgentID))
	}
	cmds = append(cmds, loadAgentHierarchyCmd(a.c, a.session.runtimeScope()))
	cmds = append(cmds, lmConfigFetchCmd(a.c))
	if len(a.session.sessions) > 0 {
		pick, missing := a.session.pickAttachIndex()
		a.session.selectSessionIndex(pick)
		if missing {
			a.setHint("attach: session " + a.AttachSessionID + " not found; showing first row")
			cmds = append(cmds, scheduleHintExpire(a.transientHint))
		}
		cmds = append(cmds, a.session.selectIndex(pick))
	}
	return a, tea.Batch(cmds...)
}

func selectStartupWorkspaceID(workspaces []gact.Workspace, selector string) (string, error) {
	if len(workspaces) == 0 {
		return "", nil
	}
	selector = strings.TrimSpace(selector)
	if selector == "" {
		return workspaces[0].ID, nil
	}
	for _, ws := range workspaces {
		if ws.ID == selector {
			return ws.ID, nil
		}
	}
	if id, err := selectWorkspaceByField(workspaces, selector, func(ws gact.Workspace) string {
		return ws.Name
	}, "name"); id != "" || err != nil {
		return id, err
	}
	if id, err := selectWorkspaceByField(workspaces, selector, func(ws gact.Workspace) string {
		return filepath.Clean(ws.RootPath)
	}, "root"); id != "" || err != nil {
		return id, err
	}
	return "", fmt.Errorf("workspace %q not found", selector)
}

func selectWorkspaceByField(
	workspaces []gact.Workspace,
	selector string,
	field func(gact.Workspace) string,
	fieldName string,
) (string, error) {
	selector = filepath.Clean(strings.TrimSpace(selector))
	var matches []gact.Workspace
	for _, ws := range workspaces {
		value := strings.TrimSpace(field(ws))
		if value == "" {
			continue
		}
		if value == selector {
			matches = append(matches, ws)
		}
	}
	switch len(matches) {
	case 0:
		return "", nil
	case 1:
		return matches[0].ID, nil
	default:
		return "", fmt.Errorf("workspace %s %q is ambiguous; use workspace id", fieldName, selector)
	}
}
