package ui

// detail_permissions.go handles permission-inspector keys and decision buttons in the detail modal.

import (
	"strings"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func (m *detailViewModal) handlePermissionInspectorKey(k tea.KeyPressMsg) (tea.Cmd, bool) {
	if m.ref == nil || !strings.HasPrefix(m.ref.title, "Permissions") {
		return nil, false
	}
	var action gact.PermissionAction
	switch k.String() {
	case "a":
		action = gact.PermAllow
	case "d":
		action = gact.PermDeny
	case "s":
		action = gact.PermAllowSession
	case "w":
		action = gact.PermAllowWorkspace
	default:
		return nil, false
	}
	return respondPermissionInspectorCmd(m.app.c, m.app.session.currentID(), action), true
}

func (m *detailViewModal) permissionInspectorDecisionButtons(title string) []menuButton {
	if !strings.HasPrefix(title, "Permissions") {
		return nil
	}
	if m.ref == nil || strings.Contains(strings.ToLower(m.ref.fullText), "no pending requests") {
		return nil
	}
	button := func(id string, label string, action gact.PermissionAction) menuButton {
		return menuButton{
			id:    id,
			label: label,
			action: func(app *App) tea.Cmd {
				return respondPermissionInspectorCmd(app.c, app.session.currentID(), action)
			},
		}
	}
	return []menuButton{
		button("permissions:allow", "allow", gact.PermAllow),
		button("permissions:deny", "deny", gact.PermDeny),
		button("permissions:session", "session", gact.PermAllowSession),
		button("permissions:workspace", "workspace", gact.PermAllowWorkspace),
	}
}
