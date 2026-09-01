package ui

// live_permissions.go applies permission requested/resolved SSE events and labels permission actions.

import (
	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func (c *conversationComponent) applyPermissionRequested(e client.SSEEvent) {
	pl, _ := e.Payload["payload"].(map[string]any)
	if pl == nil {
		return
	}
	id, _ := pl["id"].(string)
	summary, _ := pl["summary"].(string)
	if id == "" {
		return
	}
	c.app.session.addPendingPermission(client.PermissionWire{
		PermissionRequest: gact.PermissionRequest{ID: id, Summary: summary},
		Status:            "pending",
	})
}

func (c *conversationComponent) applyPermissionResolved(e client.SSEEvent) {
	pl, _ := e.Payload["payload"].(map[string]any)
	if pl == nil {
		return
	}
	id, _ := pl["permission_id"].(string)
	c.removePendingPermission(id)
}

func (c *conversationComponent) removePendingPermission(id string) {
	c.app.session.removePendingPermission(id)
}

func permissionActionLabel(action gact.PermissionAction) string {
	switch action {
	case gact.PermAllow:
		return "allow once"
	case gact.PermDeny:
		return "deny"
	case gact.PermAllowSession:
		return "allow session"
	case gact.PermAllowWorkspace:
		return "allow workspace"
	default:
		return string(action)
	}
}
