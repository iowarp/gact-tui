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
			return modalKeyHint("no callable actions yet", "i add connection", "open /agent-blueprints", "activate workflow", "Esc close")
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
			return modalKeyHint("no skills yet", "open /agent-blueprints", "install workflow with skills", "Esc close")
		}
		return modalKeyHint("↑/↓ navigate", "Enter details", "Esc close")
	case catalogKindAgents:
		return modalKeyHint("↑/↓ navigate", "Enter details", "c create expert", "x extract expert", "o set next turn", "Esc close")
	case catalogKindMcpDetail:
		return modalKeyHint("↑/↓ navigate", "Enter details", "r reconnect", "Esc/Backspace back")
	case catalogKindAgentDetail:
		if cb.pendingDeleteAgentID == cb.agentID && cb.agentID != "" {
			return modalKeyHint("confirm delete armed", "d/Enter confirm delete", "any other key cancels", "Esc/Backspace back")
		}
		parts := []string{"↑/↓ navigate structure", "Enter details", "c clone"}
		if catalogBrowserAgentIsUserOwned(cb) {
			parts = append(parts, "e edit")
			parts = append(parts, "d delete")
		}
		parts = append(parts, "o set next turn", "Esc/Backspace back")
		return modalKeyHint(parts...)
	case catalogKindPrompts:
		if catalogBrowserItemsAreEmptyState(cb.items) {
			return modalKeyHint("open /agent-blueprints", "activate workflow", "reopen /prompts", "Esc close")
		}
		if cb.sel >= 0 && cb.sel < len(cb.items) && strings.HasPrefix(cb.items[cb.sel].id, "provider/") {
			return modalKeyHint("↑/↓ navigate", "Enter provider summary", "Esc close")
		}
		return modalKeyHint("↑/↓ navigate", "Enter prompt profiles", "Esc close")
	case catalogKindPromptDetail:
		return modalKeyHint("↑/↓ nav", "Enter details", "r render", "v validate", "u reload", "e edit", "s save->codex", "Esc back")
	case catalogKindExpertPacks:
		if catalogBrowserItemsAreEmptyState(cb.items) {
			return modalKeyHint("open /agent-blueprints", "install workflow pack", "reopen /expert-packs", "Esc close")
		}
		return modalKeyHint("↑/↓ navigate", "Enter details", "Esc close")
	case catalogKindExpertPackDetail:
		if cb.pendingDeleteExpertPackID == cb.expertPackID && cb.expertPackID != "" {
			return modalKeyHint("confirm delete armed", "d/Enter confirm delete", "any other key cancels", "Esc back")
		}
		return modalKeyHint("↑/↓ structure", "Enter details/activate", "u update", "d delete", "Esc back")
	case catalogKindAgentBlueprints:
		return modalKeyHint("↑/↓ nav", "Enter", "s sources", "i manual install", "v validate file", "Esc close")
	case catalogKindAgentBlueprintDetail:
		if cb.pendingDeleteBlueprintID == cb.blueprintID && cb.blueprintID != "" {
			return modalKeyHint("confirm delete armed", "d/Enter confirm delete", "any other key cancels", "Esc back")
		}
		if catalogItemDisabled(cb.items, "activate") {
			return modalKeyHint("↑/↓ structure", "Enter details/enable", "activation blocked", "u update", "d delete", "Esc back")
		}
		if catalogItemStatusTag(cb.items, "activate") == "active" {
			return modalKeyHint("↑/↓ structure", "Enter details", "u update", "d delete", "Esc back")
		}
		return modalKeyHint("↑/↓ structure", "Enter details/enable", "a activate", "u update", "d delete", "Esc back")
	case catalogKindAgentBlueprintSources:
		if cb.sel >= 0 && cb.sel < len(cb.items) && strings.HasPrefix(cb.items[cb.sel].id, "source-blueprint/") {
			return modalKeyHint("↑/↓ navigate", "Enter install selected blueprint", "a add source", "Esc back")
		}
		if cb.pendingDeleteSourceID != "" && cb.sel >= 0 && cb.sel < len(cb.items) && cb.items[cb.sel].id == "source/"+cb.pendingDeleteSourceID {
			return modalKeyHint("confirm remove armed", "d confirm remove source", "a add source", "any other key cancels", "Esc back")
		}
		return modalKeyHint("↑/↓ navigate", "Enter source details", "a add source", "r refresh", "d remove", "Esc back")
	default:
		return modalKeyHint("↑/↓ navigate", "Esc close")
	}
}

func catalogItemDisabled(items []catalogItem, id string) bool {
	for _, item := range items {
		if item.id == id {
			return item.disabled
		}
	}
	return false
}

func catalogItemStatusTag(items []catalogItem, id string) string {
	for _, item := range items {
		if item.id == id {
			return strings.TrimSpace(item.statusTag)
		}
	}
	return ""
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
