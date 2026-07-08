package ui

// conversation_part_cursor.go tracks the selected addressable part and steps the part cursor.

import (
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/render"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// addressablePartsOf returns the indexes into m.Parts that count as navigable
// logical blocks for body-cursor stepping.
func addressablePartsOf(m gact.Message) []int {
	out := make([]int, 0, len(m.Parts))
	for i, p := range m.Parts {
		switch p.Type {
		case gact.PartTypeThinking:
			// Provider-native thinking renders as a one-row disclosure
			// (`thinking · N chars · Ctrl+E` — #233 box 3), so the row is
			// addressable: the cursor can land on it and Ctrl+E opens the full
			// prose. Regular ReAct next_thought renders inline inside its step
			// and stays cursor-transparent.
			if !isProviderThinkingPart(p) {
				continue
			}
		case gact.PartTypeText:
			if strings.TrimSpace(p.Text) == "" {
				continue
			}
		}
		out = append(out, i)
	}
	return out
}

// selectedPartID returns the gact.Part.ID for the block the body cursor points
// at, or "" when no addressable part is selected.
func (c *conversationComponent) selectedPartID() string {
	if c.bodySelMsgIdx < 0 || c.bodySelMsgIdx >= len(c.messages) {
		return ""
	}
	if c.bodySelPartIdx < 0 {
		return ""
	}
	m := c.messages[c.bodySelMsgIdx]
	addr := addressablePartsOf(m)
	if len(addr) == 0 || c.bodySelPartIdx >= len(addr) {
		return ""
	}
	pi := addr[c.bodySelPartIdx]
	if pi < 0 || pi >= len(m.Parts) {
		return ""
	}
	return m.Parts[pi].ID
}

// stepPartCursor walks the body cursor one addressable part forward (dir=+1)
// or backward (dir=-1), crossing message boundaries as needed.
func (c *conversationComponent) stepPartCursor(dir int) {
	if c.stepPartCursorSelection(dir) {
		c.scrollToSelectedMessage()
		return
	}
	if dir > 0 {
		c.scrollOffset = 0
		c.stickyToBottom = true
		c.pendingPartScroll = false
	}
}

func (c *conversationComponent) stepPartCursorSelection(dir int) bool {
	if len(c.messages) == 0 {
		return false
	}
	if dir == 0 {
		dir = 1
	}
	if c.bodySelMsgIdx < 0 {
		if dir < 0 {
			c.bodySelMsgIdx = c.snapToVisibleMsg(len(c.messages)-1, -1)
			c.bodySelPartIdx = lastAddressablePartIdx(c.messages[c.bodySelMsgIdx])
		} else {
			c.bodySelMsgIdx = c.snapToVisibleMsg(0, 1)
			c.bodySelPartIdx = firstAddressablePartIdx(c.messages[c.bodySelMsgIdx])
		}
		return true
	}

	_, absorbed := render.PairToolResults(c.messages)
	msgIdx := c.bodySelMsgIdx
	partIdx := c.bodySelPartIdx
	addr := addressablePartsOf(c.messages[msgIdx])

	if partIdx < 0 && len(addr) > 0 {
		if dir < 0 {
			partIdx = 0
		} else {
			partIdx = len(addr) - 1
		}
	}

	next := partIdx + dir
	if next >= 0 && next < len(addr) {
		c.bodySelPartIdx = next
		return true
	}

	ni := msgIdx + dir
	for ni >= 0 && ni < len(c.messages) {
		if absorbed[ni] {
			ni += dir
			continue
		}
		newAddr := addressablePartsOf(c.messages[ni])
		if len(newAddr) == 0 {
			ni += dir
			continue
		}
		c.bodySelMsgIdx = ni
		if dir > 0 {
			c.bodySelPartIdx = 0
		} else {
			c.bodySelPartIdx = len(newAddr) - 1
		}
		return true
	}
	return false
}

// firstAddressablePartIdx returns the index into m's addressable parts of the
// first one. It returns -1 when none exist.
func firstAddressablePartIdx(m gact.Message) int {
	if len(addressablePartsOf(m)) == 0 {
		return -1
	}
	return 0
}

// lastAddressablePartIdx returns the index of the last addressable part. It
// returns -1 when none exist.
func lastAddressablePartIdx(m gact.Message) int {
	addr := addressablePartsOf(m)
	if len(addr) == 0 {
		return -1
	}
	return len(addr) - 1
}
