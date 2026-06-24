package ui

// help_layout.go computes help-modal tab/column layout and group descriptions.

import "strings"

// helpTabIndex returns the slice position of the tab with the given
// title, or 0 (Global) if not found. Lets slash-command handlers
// jump to a named tab without hard-coding indexes that drift when
// tabs are added or reordered.
func helpTabIndex(title string) int {
	for i, tab := range helpTabs {
		if tab.title == title {
			return i
		}
	}
	return 0
}

func helpCommandGroupDescription(group string, rows []helpCommandEntry) string {
	switch group {
	case "Runtime":
		for _, row := range rows {
			if strings.TrimSpace(row.key) == "/prompts" {
				return "actions, connections, prompts"
			}
		}
		return "actions and connections"
	case "Experts":
		return "expert workflows"
	default:
		return paletteCommandGroupDescription(group)
	}
}

func helpListColumns(title string, width int) int {
	if title == "Commands" && width >= 72 {
		return 2
	}
	return 1
}
