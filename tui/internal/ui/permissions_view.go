package ui

// permissionComponent: the permission-request banner rendering and hit geometry (requests live on sessionComponent).

import (
	"context"
	"fmt"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

type permissionInspectorRespondedMsg struct {
	sessionID    string
	permissionID string
	action       gact.PermissionAction
	text         string
	err          error
}

// permissionComponent owns the pending-permission domain: the approval-banner
// keybindings (a/d/s/w), the inspector-response message handler, and the
// conversation-pane banner rendering + hit geometry. It carries no state of its
// own — the pending requests live on sessionComponent — and reaches shared
// services through its app back-reference.
type permissionComponent struct {
	app *App
}

func (p *permissionComponent) handleInspectorResponded(m permissionInspectorRespondedMsg) (tea.Model, tea.Cmd) {
	a := p.app
	if m.err != nil {
		a.setHint("permission " + permissionActionLabel(m.action) + " failed: " + m.err.Error())
		return a, scheduleHintExpire(a.transientHint)
	}
	if m.permissionID != "" {
		a.conversation.removePendingPermission(m.permissionID)
	}
	text := m.text
	if strings.TrimSpace(text) == "" {
		text = "(permissions refreshed)"
	}
	a.catalog.openDetail("Permissions", text)
	a.setHint("permission " + permissionActionLabel(m.action) + " applied")
	return a, scheduleHintExpire(a.transientHint)
}

func loadPermissionsInspectorCmd(c *client.Client, sessionID string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		perms, err := c.ListPermissions(ctx, sessionID, false)
		if err != nil {
			return catalogDetailLoadedMsg{title: "Permissions", err: err, standalone: true}
		}
		policies, _ := c.ListPolicies(ctx)
		return catalogDetailLoadedMsg{
			title:      "Permissions",
			text:       formatPermissionsInspector(perms, policies, sessionID),
			standalone: true,
		}
	}
}

func respondPermissionInspectorCmd(c *client.Client, sessionID string, action gact.PermissionAction) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		perms, err := c.ListPermissions(ctx, sessionID, true)
		if err != nil {
			return permissionInspectorRespondedMsg{sessionID: sessionID, action: action, err: err}
		}
		var pending client.PermissionWire
		found := false
		for _, p := range perms {
			if strings.EqualFold(firstNonEmpty(p.Status, string(p.Action)), "pending") {
				pending = p
				found = true
				break
			}
		}
		if !found || pending.ID == "" {
			return permissionInspectorRespondedMsg{sessionID: sessionID, action: action, err: fmt.Errorf("no pending permission requests")}
		}
		if err := c.RespondPermission(ctx, pending.ID, action); err != nil {
			return permissionInspectorRespondedMsg{sessionID: sessionID, permissionID: pending.ID, action: action, err: err}
		}
		refreshed, err := c.ListPermissions(ctx, sessionID, false)
		if err != nil {
			return permissionInspectorRespondedMsg{sessionID: sessionID, permissionID: pending.ID, action: action, err: err}
		}
		policies, _ := c.ListPolicies(ctx)
		return permissionInspectorRespondedMsg{
			sessionID:    sessionID,
			permissionID: pending.ID,
			action:       action,
			text:         formatPermissionsInspector(refreshed, policies, sessionID),
		}
	}
}

// handleKey processes a/d/s/w on a pending permission.
func (p *permissionComponent) handleKey(k tea.KeyPressMsg) (tea.Cmd, bool) {
	a := p.app
	if len(a.session.pendingPermissions) == 0 {
		return nil, false
	}
	id := a.session.pendingPermissions[0].ID
	switch k.String() {
	case "a":
		return respondPermissionCmd(a.c, id, gact.PermAllow), true
	case "d":
		return respondPermissionCmd(a.c, id, gact.PermDeny), true
	case "s":
		return respondPermissionCmd(a.c, id, gact.PermAllowSession), true
	case "w":
		return respondPermissionCmd(a.c, id, gact.PermAllowWorkspace), true
	}
	return nil, false
}
