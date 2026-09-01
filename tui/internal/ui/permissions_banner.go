package ui

// permissions_banner.go renders the inline permission-request banner and registers its action hits.

import (
	"context"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
)

type permissionBannerAction struct {
	id     string
	label  string
	action gact.PermissionAction
	col    int
	width  int
}

func respondPermissionCmd(c *client.Client, permID string, action gact.PermissionAction) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = c.RespondPermission(ctx, permID, action)
		return nil
	}
}

func permissionBannerActions() []permissionBannerAction {
	return []permissionBannerAction{
		{id: "allow", label: "A:allow", action: gact.PermAllow},
		{id: "deny", label: "D:deny", action: gact.PermDeny},
		{id: "session", label: "S:sess", action: gact.PermAllowSession},
		{id: "workspace", label: "W:work", action: gact.PermAllowWorkspace},
	}
}

func permissionBannerSummaryFallback(summary string) string {
	summary = strings.TrimSpace(summary)
	lower := strings.ToLower(summary)
	for _, prefix := range []string{"run shell command:", "shell command:"} {
		if strings.HasPrefix(lower, prefix) {
			cmd := strings.TrimSpace(summary[len(prefix):])
			if cmd != "" {
				return "Shell(" + cmd + ")"
			}
		}
	}
	return summary
}

func permissionBannerMessage(p client.PermissionWire) string {
	toolName := strings.TrimSpace(p.ToolCall.ToolName)
	if toolName != "" || len(p.ToolCall.Input) > 0 {
		summary := strings.TrimSpace(permissionToolCallSummary(p.ToolCall))
		if summary != "" {
			if risk := permissionSafetyHints(p.ToolCall.Annotations); risk != "" && risk != "none supplied" {
				return "⚠ Approval needed: " + summary + " · " + risk
			}
			return "⚠ Approval needed: " + summary
		}
	}
	summary := permissionBannerSummaryFallback(p.Summary)
	if summary == "" {
		summary = "operator decision"
	}
	return "⚠ Approval needed: " + summary
}

func (pc *permissionComponent) renderBanner(p client.PermissionWire, contentWidth int) (string, []permissionBannerAction) {
	t := pc.app.Theme
	if contentWidth < 1 {
		contentWidth = 1
	}
	actions := permissionBannerActions()
	actionLabels := make([]string, 0, len(actions))
	for _, action := range actions {
		actionLabels = append(actionLabels, action.label)
	}
	actionText := strings.Join(actionLabels, " ")
	separator := "  "
	message := permissionBannerMessage(p)
	// Keep a small gutter because the conversation pane's outer fitting can
	// wrap styled banner text a few cells before the raw content width.
	messageWidth := contentWidth - 10 - lipgloss.Width(separator) - lipgloss.Width(actionText)
	if messageWidth < 0 {
		messageWidth = 0
	}
	message = textutil.Truncate(message, messageWidth)
	col := lipgloss.Width(message + separator)
	for i := range actions {
		actions[i].col = col
		actions[i].width = lipgloss.Width(actions[i].label)
		col += actions[i].width + 1
	}
	rendered := message + separator
	for i, action := range actions {
		if i > 0 {
			rendered += " "
		}
		rendered += action.label
	}
	return lipgloss.NewStyle().
		Foreground(t.Bg).
		Background(t.Warning).
		Padding(0, 1).
		Bold(true).
		Render(rendered), actions
}

func (c *interactionComponent) registerPermissionBannerHits(actions []permissionBannerAction, bodyWidth int) {
	if len(actions) == 0 || len(c.app.session.pendingPermissions) == 0 {
		return
	}
	permissionID := c.app.session.pendingPermissions[0].ID
	for _, action := range actions {
		c.registerPermissionBannerActionHit(action, bodyWidth, permissionID)
	}
}

func (pc *permissionComponent) bannerActionRect(action permissionBannerAction, bodyWidth int) (mouseRect, bool) {
	contentW := bodyWidth - 4
	if contentW < 1 {
		contentW = 1
	}
	if action.width <= 0 || action.col >= contentW {
		return mouseRect{}, false
	}
	bodyX := pc.app.conversation.paneOffsetX()
	label := action.label
	if label == "" {
		label = strings.Repeat("x", action.width)
	}
	line := strings.Repeat(" ", action.col) + label
	rect, ok := screenTextSpanRect(bodyX+3, 3, line, action.col, label)
	if !ok {
		return mouseRect{}, false
	}
	if rect.x+rect.w > bodyX+3+contentW {
		rect.w = bodyX + 3 + contentW - rect.x
	}
	if rect.w < 1 {
		return mouseRect{}, false
	}
	return rect, true
}

func (c *interactionComponent) registerPermissionBannerActionHit(action permissionBannerAction, bodyWidth int, permissionID string) {
	contentW := bodyWidth - 4
	if contentW < 1 {
		contentW = 1
	}
	if action.width <= 0 || action.col >= contentW {
		return
	}
	actionCopy := action
	bodyX := c.app.conversation.paneOffsetX()
	line := strings.Repeat(" ", action.col) + action.label
	c.registerClippedScreenTextSpanHit("permission:"+action.id, bodyX+3, 3, line, action.col, action.label, bodyX+3+contentW, func(app *App) tea.Cmd {
		return respondPermissionCmd(app.c, permissionID, actionCopy.action)
	})
}
