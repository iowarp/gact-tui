package ui

// conversation_view.go renders the conversation pane body with body-offset hit-test threading.

import (
	"strings"

	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// renderWithBodyOffset renders the conversation/input pane with an explicit
// body-pane X offset for this frame's hit-test math. The offset is the
// sidebar's *rendered* width, known only to the layout, so it is threaded in
// as a parameter rather than read back from geometry. It is scoped to this
// render via bodyHitOffsetX and restored on return so the field stays at its
// "unset" default (0) outside the frame — paneOffsetX falls back to computed
// geometry when unset, which the hit-geometry tests rely on.
func (c *conversationComponent) renderWithBodyOffset(width, height, bodyOffsetX int) string {
	prev := c.app.sidebar.setBodyHitOffset(bodyOffsetX)
	defer func() { c.app.sidebar.setBodyHitOffset(prev) }()
	return c.render(width, height)
}

func (c *conversationComponent) render(width, height int) string {
	t := c.app.Theme
	// Input pane grows with multi-line content up to a cap so users
	// can actually see what they're composing. 3 rows is the floor
	// (1 border top + 1 content + 1 border bottom ≈ 1 visible line)
	// and we cap at ~1/3 the viewport so a long paste doesn't crowd
	// out the conversation. lineCount here is 1-based (a 3-line buffer
	// reports 3); we give the pane one extra row for the cursor.
	//
	// LLL5: the conv-height math also lives in conversationPaneHeight
	// so renderSidebar can match. Re-derive inputH/hintH from the same
	// formula here (kept inline so renderBody keeps its single-pass
	// shape and doesn't traverse the helper twice).
	inputTextW := c.app.inputComposer.textWidthForBody(width)
	msgH := c.app.inputComposer.conversationPaneHeightForWidth(height, inputTextW)
	hintH := 0
	if c.app.transientHint != "" {
		hintH = 1
	}
	inputH := height - msgH - hintH
	if c.app.MouseEnabled {
		c.registerFocusSurface(msgH, width)
		c.app.inputComposer.registerFocusSurface(msgH, hintH, inputH, width)
	}

	// Conversation pane. CCCCC1: lipgloss .Height(N) is OUTER (border
	// included); the previous Height(msgH-2) made the bordered region
	// 2 rows shorter than its allotment.
	msgStyle := t.Pane.Width(width - 2).Height(msgH)
	if c.app.focus == FocusBody {
		msgStyle = t.PaneFoc.Width(width - 2).Height(msgH)
	}

	titleLine := lipgloss.NewStyle().Bold(true).Foreground(t.Primary).
		Render(c.app.localizer.t(msgConversationTitle, nil))
	statusLine := ""
	if c.app.session.currentStatus != "" && c.app.session.currentStatus != gact.StatusIdle {
		// Running sessions get the animated spinner; waiting_permission
		// gets a static ⚠ so it doesn't compete for attention with the
		// actual running turns. Idle never reaches this branch.
		glyph := c.app.ticker.spinnerChar()
		if c.app.session.currentStatus == gact.StatusWaitingPermission {
			glyph = "⚠"
		}
		statusLine = lipgloss.NewStyle().Foreground(t.Warning).Italic(true).
			Render(glyph + " " + c.app.session.currentStatus)
	}
	headerRow := titleLine
	if statusLine != "" {
		headerRow = lipgloss.JoinHorizontal(lipgloss.Top, titleLine, "  ", statusLine)
	}

	// Permission banner takes priority
	permBanner := ""
	var permActions []permissionBannerAction
	if len(c.app.session.pendingPermissions) > 0 {
		p := c.app.session.pendingPermissions[0]
		permBanner, permActions = c.app.permission.renderBanner(p, width-4)
		c.app.interaction.registerPermissionBannerHits(permActions, width)
	}

	var body string
	conversationH := msgH - 2 - 1 - 1
	if permBanner != "" {
		conversationH--
	}
	if conversationH < 1 {
		conversationH = 1
	}
	if c.app.session.selected < 0 || c.app.session.selected >= len(c.app.session.sessions) {
		body = c.renderNoSessionBody(t)
	} else if len(c.messages) == 0 {
		body = c.renderEmptySessionBody(t)
	} else {
		// #233 phase 1: ONE transcript render — the parts-only projection
		// (execution.renderConversation), for every session shape. The former
		// flat per-message fallback loop is retired (web precedent 09240c4c);
		// part-level hit blocks now come back from the projected render.
		//
		// Width contract: the pane style is Width(width-2) OUTER with a rounded
		// border (2) + Padding(0,1) (2), so exactly width-6 content columns fit.
		// Rendering wider makes overlong lines soft-wrap INSIDE the pane, which
		// silently grows the body past the fixed-height viewport and pushes the
		// bottom rows (and the hit-geometry line math) off screen.
		projected, hitBlocks, _ := c.app.execution.renderConversation(t, width-6)
		rows := []string{}
		if projected != "" {
			rows = append(rows, projected)
		}
		// Pending-turn indicator: when the session is running but the latest
		// message hasn't produced any visible parts yet (e.g. user just
		// pressed Enter and the assistant hasn't streamed a delta), show a
		// "● thinking…" stub so the user knows the system isn't dead.
		if c.app.conversation.shouldShowThinkingIndicator() {
			thinkLine := lipgloss.NewStyle().Foreground(t.Warning).Bold(true).
				Render(c.app.ticker.spinnerChar()) + " " +
				lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).
					Render(c.app.localizer.t(msgConversationThinking, nil))
			rows = append(rows, "", thinkLine)
		}
		body = strings.Join(rows, "\n")
		// VVVVVVVVV1: one-shot scroll adjustment — if a nav handler
		// flagged pendingPartScroll, find the ▌ marker in the full
		// body and bump scrollOffset so it falls within the viewport
		// (ideally at ~1/3 from top for context). Clear the flag so
		// subsequent renders (e.g. SSE streaming a new message in)
		// don't re-thrash the scroll.
		if c.pendingPartScroll {
			c.adjustScrollForSelectedPart(body, conversationH)
			c.pendingPartScroll = false
		}
		c.registerWheelHit(conversationH, width, permBanner != "")
		c.registerPartHits(hitBlocks, body, conversationH, width, permBanner != "")
		body = c.scrollClip(body, conversationH, t)
	}
	c.app.clipboard.setConversationSnapshot(body, conversationH, width, permBanner != "")
	body = c.app.clipboard.renderConversationDragHighlight(body)

	pieces := []string{headerRow}
	if permBanner != "" {
		pieces = append(pieces, permBanner)
	}
	pieces = append(pieces, "", body)
	if c.app.audit != nil {
		c.app.audit.RecordConversation(lipgloss.JoinVertical(lipgloss.Left, pieces...), map[string]any{
			"stage":             tuiAuditStageLabel(c.app.stage),
			"session_id":        c.app.session.currentID(),
			"width":             width,
			"height":            msgH,
			"conversation_rows": conversationH,
			"message_count":     len(c.messages),
			"current_status":    c.app.session.currentStatus,
			"scroll_offset":     c.scrollOffset,
			"sticky_to_bottom":  c.stickyToBottom,
		})
	}
	msgPane := msgStyle.Render(lipgloss.JoinVertical(lipgloss.Left, pieces...))
	// CCCCC1: hard-fit to msgH (truncate AND pad). The previous
	// clamp-only path let lipgloss render a short pane when content
	// was sparse — that left the conversation `╰╯` floating up while
	// the input box stayed pinned to bodyH-inputH, making the bottom
	// of the layout look broken whenever the conversation grew past
	// the original short content.
	msgPane = fitLinesWithBackground(msgPane, msgH, t.Bg)

	inputPane := c.app.inputComposer.renderPane(width, inputTextW, inputH, msgH, hintH)

	// Surface a transient hint (e.g. config-reload result) above the
	// input so the user sees the outcome without losing their place.
	if c.app.transientHint != "" {
		hint := lipgloss.NewStyle().
			Foreground(t.Secondary).
			Italic(true).
			Render("· " + c.app.transientHint)
		return lipgloss.JoinVertical(lipgloss.Left, msgPane, hint, inputPane)
	}
	return lipgloss.JoinVertical(lipgloss.Left, msgPane, inputPane)
}
