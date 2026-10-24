package ui

// catalog_browser_hints.go computes catalog-browser hint text, item status tags, and detail text/title.

import "strings"

func catalogBrowserHintText(cb *catalogBrowserState) string {
	if cb == nil {
		return "↑/↓ navigate · Esc close"
	}
	switch cb.kind {
	case catalogKindTools:
		if cb.sel >= 0 && cb.sel < len(cb.items) && cb.items[cb.sel].id == "none" {
			return modalKeyHint("no callable actions yet", "i add connection", "add plugins to the agent", "Esc close")
		}
		if cb.sel >= 0 && cb.sel < len(cb.items) && strings.HasPrefix(cb.items[cb.sel].id, "mcpserver/") {
			return modalKeyHint("↑/↓ navigate", "Enter connection detail", "r reconnect", "i add connection", "d remove connection", "Esc close")
		}
		if cb.sel >= 0 && cb.sel < len(cb.items) && strings.HasPrefix(cb.items[cb.sel].id, "toolsource/") {
			return modalKeyHint("↑/↓ navigate", "Enter group summary", "i add connection", "Esc close")
		}
		return modalKeyHint("↑/↓ navigate", "Enter details", "Space hide/show selected tool", "i add connection", "Esc close")
	case catalogKindMcp:
		return modalKeyHint("↑/↓ navigate", "Enter detail", "i add connection", "d remove connection", "Esc close")
	case catalogKindSkills:
		if cb.sel >= 0 && cb.sel < len(cb.items) && cb.items[cb.sel].id == "none" {
			return modalKeyHint("no skills yet", "add plugins with skills to the agent", "Esc close")
		}
		return modalKeyHint("↑/↓ navigate", "Enter details", "Esc close")
	case catalogKindAgents:
		return modalKeyHint("↑/↓ navigate", "Enter details", "o set next turn", "Esc close")
	case catalogKindMcpDetail:
		return modalKeyHint("↑/↓ navigate", "Enter details", "r reconnect", "Esc/Backspace back")
	case catalogKindPrompts:
		if catalogBrowserItemsAreEmptyState(cb.items) {
			return modalKeyHint("add plugins with prompts to the agent", "reopen /prompts", "Esc close")
		}
		if cb.sel >= 0 && cb.sel < len(cb.items) && strings.HasPrefix(cb.items[cb.sel].id, "provider/") {
			return modalKeyHint("↑/↓ navigate", "Enter provider summary", "Esc close")
		}
		return modalKeyHint("↑/↓ navigate", "Enter prompt profiles", "Esc close")
	case catalogKindPromptDetail:
		return modalKeyHint("↑/↓ nav", "Enter details", "r render", "v validate", "u reload", "e edit", "s save->codex", "Esc back")
	default:
		return modalKeyHint("↑/↓ navigate", "Esc close")
	}
}

func catalogItemDetailText(item catalogItem) string {
	text := strings.TrimSpace(item.desc)
	if text == "" {
		text = strings.TrimSpace(item.inlineDesc)
	}
	if text == "" {
		text = strings.TrimSpace(item.title)
	}
	return text
}

func catalogItemDetailTitle(item catalogItem) string {
	title := strings.TrimSpace(item.title)
	for {
		trimmed := strings.TrimLeft(title, " │")
		if strings.HasPrefix(trimmed, "└─ ") {
			return strings.TrimSpace(strings.TrimPrefix(trimmed, "└─ "))
		}
		if trimmed == title {
			break
		}
		title = trimmed
	}
	return strings.TrimSpace(strings.TrimPrefix(title, "└─ "))
}

func catalogBrowserItemsAreEmptyState(items []catalogItem) bool {
	if len(items) == 0 {
		return false
	}
	for _, item := range items {
		if item.id != "none" {
			return false
		}
	}
	return true
}

func catalogStatusTagLabel(tag string) string {
	tag = strings.TrimSpace(tag)
	if tag == "" {
		return ""
	}
	return operatorSourceValueLabel(tag)
}
