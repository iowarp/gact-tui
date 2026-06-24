package ui

// render_messages.go renders a message (with prior context and inline tool results).

import (
	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// renderMessage formats one message for the conversation pane. Wraps to
// `width` cells and uses role-coloured headers so the user can scan flow
// at a glance. Assistant text is rendered as markdown via glamour;
// user/system/tool text is rendered literally so URLs and code don't get
// reformatted on the way in.
func (t Theme) renderMessage(m gact.Message, width int) string {
	return t.renderMessageInContext(m, nil, width)
}

// renderMessageInContext is like renderMessage but also takes the
// previous message in the conversation so it can suppress the
// `● TOOL` role header when a tool-result message follows an
// assistant-with-tool-call. That combination is the "output of the
// previous call" (Claude Code style — the output visually nests
// under the call, no separate role boundary) and the TOOL banner
// just adds noise.
func (t Theme) renderMessageInContext(m gact.Message, prev *gact.Message, width int) string {
	return t.renderMessageInContextWithResults(m, prev, width, nil)
}

// The conversation pane renders messages through renderMessageWithHits
// (render_message_hits.go), which produces the row and its mouse hit geometry
// in a single pass and applies the per-part `▸ ` selection marker.

// renderMessageInContextWithResults extends renderMessageInContext by
// inlining tool_result parts under their matching tool_call parts.
// `inlineResults` is keyed by Part.CallID; pass nil to disable.
func (t Theme) renderMessageInContextWithResults(m gact.Message, prev *gact.Message, width int, inlineResults map[string]gact.Part) string {
	normalizeMessagePresentation(&m)
	if isModelSwapMarker(m) {
		return t.renderModelSwapDivider(m, width)
	}
	hideHeader := shouldHideConversationHeader(m, prev)

	body := t.renderPartsForRoleWithResults(m.Parts, width, m.Role, inlineResults)
	evidence := t.renderToolEvidence(m, width)
	switch {
	case body != "" && evidence != "":
		body = lipgloss.JoinVertical(lipgloss.Left, body, evidence)
	case body == "" && evidence != "":
		body = evidence
	case body == "" && isSemanticLiveMessage(m):
		return ""
	case body == "":
		body = t.HintLabel.Render("(no parts)")
	}
	// Optional timestamp row (S1). Rendered in a faint style under the
	// role header so it doesn't fight for attention with the message
	// content. Skipped when the header itself is hidden (tool-result
	// nesting) — the timestamp would look orphaned there.
	ts := ""
	if t.ShowTimestamps && !m.CreatedAt.IsZero() && !hideHeader {
		ts = lipgloss.NewStyle().Foreground(t.FgFaint).Italic(true).
			Render("  " + m.CreatedAt.Format("2006-01-02 15:04:05"))
	}
	if hideHeader {
		return lipgloss.JoinVertical(lipgloss.Left, body, "")
	}
	header := t.renderMessageHeader(m)
	parts := []string{header}
	if ts != "" {
		parts = append(parts, ts)
	}
	parts = append(parts, body, "")
	return lipgloss.JoinVertical(lipgloss.Left, parts...)
}
