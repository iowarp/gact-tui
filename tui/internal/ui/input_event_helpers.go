package ui

// input_event_helpers.go provides mouse-wheel delta and key-message helpers shared by input handling.

import tea "charm.land/bubbletea/v2"

func mouseWheelDelta(button tea.MouseButton) int {
	switch button {
	case tea.MouseWheelUp:
		return -1
	case tea.MouseWheelDown:
		return 1
	default:
		return 0
	}
}

func moveSelectionByWheel(sel int, count int, button tea.MouseButton) int {
	return moveSelection(sel, count, mouseWheelDelta(button))
}

func moveScrollOffsetByWheel(scroll int, button tea.MouseButton) int {
	return moveScrollOffset(scroll, mouseWheelDelta(button))
}

func keyMsg(s string) tea.KeyPressMsg {
	switch s {
	case "enter":
		return tea.KeyPressMsg{Code: tea.KeyEnter}
	case "esc":
		return tea.KeyPressMsg{Code: tea.KeyEsc}
	case "up":
		return tea.KeyPressMsg{Code: tea.KeyUp}
	case "down":
		return tea.KeyPressMsg{Code: tea.KeyDown}
	case "left":
		return tea.KeyPressMsg{Code: tea.KeyLeft}
	case "right":
		return tea.KeyPressMsg{Code: tea.KeyRight}
	case "tab":
		return tea.KeyPressMsg{Code: tea.KeyTab}
	case "backspace":
		return tea.KeyPressMsg{Code: tea.KeyBackspace}
	case " ":
		return tea.KeyPressMsg{Code: ' ', Text: " "}
	default:
		if len(s) == 1 {
			return tea.KeyPressMsg{Code: []rune(s)[0], Text: s}
		}
		return tea.KeyPressMsg{Text: s}
	}
}

func textKeyMsg(s string) tea.KeyPressMsg {
	return tea.KeyPressMsg{Text: s}
}
