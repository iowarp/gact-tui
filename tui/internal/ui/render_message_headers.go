package ui

// render_message_headers.go renders message role/headers and decides header visibility/part suppression.

import (
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/render"
	"strings"

	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func shouldHideConversationHeader(m gact.Message, prev *gact.Message) bool {
	if isSemanticLiveMessage(m) {
		return true
	}
	if prev == nil {
		return false
	}
	// Tool results and semantic live events are part of the surrounding
	// assistant turn. Keep the technical message split available in detail
	// metadata, but do not promote it to a separate visible actor.
	if m.Role == gact.RoleTool &&
		(prev.Role == gact.RoleTool ||
			(prev.Role == gact.RoleAssistant && assistantCarriedToolCall(prev))) {
		return true
	}
	return false
}

func isSemanticLiveMessage(m gact.Message) bool {
	return m.Metadata != nil && m.Metadata["semantic_live_message"] == true
}

// assistantCarriedToolCall reports whether m has any tool_call part.
func assistantCarriedToolCall(m *gact.Message) bool {
	if m == nil {
		return false
	}
	for _, p := range m.Parts {
		if p.Type == gact.PartTypeToolCall {
			return true
		}
	}
	return false
}

func (t Theme) renderRoleHeader(role string) string {
	col := t.RoleAssistant
	label := "ASSISTANT"
	switch role {
	case gact.RoleUser:
		col = t.RoleUser
		label = "USER"
	case gact.RoleSystem:
		col = t.RoleSystem
		label = "SYSTEM"
	case gact.RoleTool:
		col = t.RoleTool
		label = "TOOL"
	}
	return lipgloss.NewStyle().
		Foreground(col).
		Bold(true).
		Render("● " + label)
}

func (t Theme) renderMessageHeader(m gact.Message) string {
	if isSemanticLiveMessage(m) {
		return t.renderRoleHeader(gact.RoleAssistant)
	}
	if m.Role == gact.RoleTool {
		if label := standaloneToolHeaderLabel(m.Parts); label != "" {
			return lipgloss.NewStyle().
				Foreground(t.RoleTool).
				Bold(true).
				Render("● " + label)
		}
	}
	return t.renderRoleHeader(m.Role)
}

func standaloneToolHeaderLabel(parts []gact.Part) string {
	for _, part := range parts {
		if part.Type != gact.PartTypeToolResult {
			continue
		}
		name := strings.TrimSpace(part.ToolName)
		if name == "" {
			return "TOOL RESULT"
		}
		status := "RESULT"
		if part.IsError {
			status = "ERROR"
		}
		return "TOOL · " + render.CapitalizeToolName(name) + " " + status
	}
	return ""
}

func partHiddenFromTranscript(p gact.Part) bool {
	return p.Metadata != nil && p.Metadata["transcript_hidden"] == true
}
