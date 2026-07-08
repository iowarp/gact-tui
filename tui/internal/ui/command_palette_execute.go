package ui

// command_palette_execute.go executes a selected palette command (backend or local).

import (
	"fmt"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

func (c *commandPaletteComponent) executeCommand(cmd gact.Command) tea.Cmd {
	if kind, ok := catalogCommandForID(cmd.ID); ok {
		return c.app.catalog.openKind(kind)
	}
	if cmd.Status != "" && cmd.Status != "available" {
		reason := valuefmt.FirstNonEmpty(cmd.DisabledReason, cmd.Error, "command unavailable")
		c.app.setHint(cmd.ID + ": " + reason)
		return scheduleHintExpire(c.app.transientHint)
	}
	if cmd.ID == "/agent" || cmd.ID == "/agents" {
		c.app.settings.openState(settingsState{tab: 1})
		return loadSettingsCmd(c.app.c, c.app.session.runtimeScope())
	}
	if cmd.ID == "/theme-next" {
		return c.cycleTheme(+1)
	}
	if cmd.ID == "/theme-prev" {
		return c.cycleTheme(-1)
	}
	if cmd.ID == "/metrics" {
		return c.app.metrics.openLoad()
	}
	if cmd.ID == "/memory" {
		if !c.app.session.caps.Capabilities.Memory {
			c.app.setHint("memory inspector unsupported by this backend")
			return scheduleHintExpire(c.app.transientHint)
		}
		return loadMemoryInspectorCmd(c.app.Theme, c.app.c, c.app.session.runtimeScope(), c.app.conversation.messages)
	}
	if cmd.ID == "/mouse" {
		c.app.MouseEnabled = !c.app.MouseEnabled
		c.app.setHint(c.app.clipboard.mouseSelectionModeHint())
		c.app.settings.persistPrefs()
		return scheduleHintExpire(c.app.transientHint)
	}
	if cmd.ID == "/permissions" {
		if !c.app.session.caps.Capabilities.Permissions {
			c.app.setHint("permission audit unsupported by this backend")
			return scheduleHintExpire(c.app.transientHint)
		}
		return loadPermissionsInspectorCmd(c.app.c, c.app.session.currentID())
	}
	if cmd.ID == "/doctor" {
		if !c.app.session.caps.Capabilities.IntegrationHealth {
			c.app.setHint("doctor view unsupported by this backend (v0.1)")
			return scheduleHintExpire(c.app.transientHint)
		}
		return c.app.doctor.openModal(doctorTabHealth)
	}
	if cmd.ID == "/theme-export" {
		return c.app.settings.exportCurrentTheme()
	}
	if cmd.ID == "/theme" || cmd.ID == "/themes" {
		cur := ThemeModeFor(c.app.Theme)
		sel := 0
		for i, m := range AllThemeModes {
			if m == cur {
				sel = i
				break
			}
		}
		c.app.settings.openState(settingsState{tab: 2, themeSel: sel})
		return nil
	}
	if cmd.ID == "/new" {
		return c.app.session.openSetup(false)
	}
	if cmd.ID == "/duplicate" {
		if c.app.session.selected < 0 || c.app.session.selected >= len(c.app.session.sessions) {
			c.app.setHint("no selected session to duplicate")
			return scheduleHintExpire(c.app.transientHint)
		}
		src := c.app.session.sessions[c.app.session.selected]
		return duplicateSessionCmd(c.app.c, c.app.session.wsID, src)
	}
	if cmd.ID == "/sessions" {
		c.close()
		c.app.session.enterFilter(true)
		return nil
	}
	if cmd.ID == "/rename" {
		if c.app.session.selected >= 0 && c.app.session.selected < len(c.app.session.sessions) {
			c.app.rename.openModal(c.app.session.sessions[c.app.session.selected].Title)
		}
		return nil
	}

	sid := c.app.session.currentID()
	local, handled := c.executeLocalCommand(cmd.ID, sid)
	if handled {
		return local
	}
	extraCmds := []tea.Cmd{}
	if local != nil {
		extraCmds = append(extraCmds, local)
	}
	if cmd.ID != "/clear" {
		c.pendingClearSessionID = ""
	}
	if cmd.Source == "plugin" {
		if pc := c.app.plugins.findCommand(cmd.ID); pc != nil {
			c.app.setHint("running plugin: " + cmd.ID + "…")
			extraCmds = append(extraCmds, runPluginCmd(*pc, sid, c.app.BackendURL))
			return tea.Batch(extraCmds...)
		}
	}
	extraCmds = append(extraCmds, runCommandCmd(c.app.c, sid, cmd.ID))
	return tea.Batch(extraCmds...)
}

func (c *commandPaletteComponent) executeLocalCommand(id, sid string) (tea.Cmd, bool) {
	var extraCmds []tea.Cmd
	switch id {
	case "/clear":
		if sid == "" {
			c.app.setHint("no active session to clear")
			extraCmds = append(extraCmds, scheduleHintExpire(c.app.transientHint))
			return tea.Batch(extraCmds...), true
		}
		if c.pendingClearSessionID != sid {
			c.pendingClearSessionID = sid
			c.app.setHint("press /clear again to confirm wipe")
			extraCmds = append(extraCmds, scheduleHintExpire(c.app.transientHint))
			return tea.Batch(extraCmds...), true
		}
		c.pendingClearSessionID = ""
		n := len(c.app.conversation.messages)
		c.app.conversation.clearForCommand()
		if n > 0 {
			c.app.setHint(fmt.Sprintf("cleared %d messages", n))
		} else {
			c.app.setHint("session already empty")
		}
		extraCmds = append(extraCmds, scheduleHintExpire(c.app.transientHint))
	case "/cancel":
		if sid == "" {
			c.app.setHint("no active session to cancel")
			extraCmds = append(extraCmds, scheduleHintExpire(c.app.transientHint))
			return tea.Batch(extraCmds...), true
		}
		if c.app.session.currentStatus != gact.StatusRunning &&
			c.app.session.currentStatus != gact.StatusWaitingPermission {
			c.app.setHint("nothing running in selected session")
			extraCmds = append(extraCmds, scheduleHintExpire(c.app.transientHint))
			return tea.Batch(extraCmds...), true
		}
		c.app.setHint("cancelling run…")
		extraCmds = append(extraCmds, scheduleHintExpire(c.app.transientHint))
	case "/copy":
		toast := c.app.clipboard.copySelectedOrLastAssistant()
		c.app.setHint(toast)
		extraCmds = append(extraCmds, scheduleHintExpire(toast))
		return tea.Batch(extraCmds...), true
	case "/mode":
		if sid == "" {
			c.app.setHint("no active session — open or create one first")
			extraCmds = append(extraCmds, scheduleHintExpire(c.app.transientHint))
			return tea.Batch(extraCmds...), true
		}
		next := nextRoutingMode(c.app.session.currentRoutingMode())
		c.app.setHint("routing mode → " + next)
		extraCmds = append(extraCmds,
			scheduleHintExpire(c.app.transientHint),
			patchRoutingModeCmd(c.app.c, sid, next),
		)
		return tea.Batch(extraCmds...), true
	case "/diff":
		toast := c.app.workspace.openWorkspaceDiff()
		c.app.setHint(toast)
		extraCmds = append(extraCmds, scheduleHintExpire(toast))
		return tea.Batch(extraCmds...), true
	case "/add":
		if sid == "" {
			c.app.setHint("no active session to add context")
			extraCmds = append(extraCmds, scheduleHintExpire(c.app.transientHint))
			return tea.Batch(extraCmds...), true
		}
		c.app.contextAdd.openModal()
		return tea.Batch(extraCmds...), true
	case "/drop":
		if sid == "" {
			c.app.setHint("no active session to drop context")
			extraCmds = append(extraCmds, scheduleHintExpire(c.app.transientHint))
			return tea.Batch(extraCmds...), true
		}
		cf, ok := c.app.contextActions.selectedFile()
		if !ok {
			c.app.setHint("no context file selected to drop")
			extraCmds = append(extraCmds, scheduleHintExpire(c.app.transientHint))
			return tea.Batch(extraCmds...), true
		}
		return removeContextFileCmd(c.app.c, sid, cf.Path), true
	case "/compact":
		if sid == "" {
			c.app.setHint("no active session to compact")
		} else {
			c.app.setHint("session summary requested")
			extraCmds = append(extraCmds, requestCompactCmd(c.app.c, sid))
		}
		extraCmds = append(extraCmds, scheduleHintExpire(c.app.transientHint))
		return tea.Batch(extraCmds...), true
	case "/mcp-install":
		c.app.mcpInstall.openModal()
		return tea.Batch(extraCmds...), true
	case "/mcp-remove":
		extraCmds = append(extraCmds, c.app.mcpRemove.openPicker())
		return tea.Batch(extraCmds...), true
	default:
		return nil, false
	}
	return tea.Batch(extraCmds...), false
}
