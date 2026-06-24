package ui

// render_duplicate_tools.go detects and collapses duplicate consecutive tool runs.

import (
	"fmt"
	"strings"

	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func compactDuplicateToolRuns(parts []gact.Part, inlineResults map[string]gact.Part) (map[string]bool, map[string]int) {
	skip := map[string]bool{}
	notice := map[string]int{}
	for i := 0; i < len(parts); {
		call, result, next, ok := toolPairAt(parts, i, inlineResults)
		if !ok {
			i++
			continue
		}
		key := duplicateToolPairKey(call, result)
		runEnd := next
		runCount := 1
		var duplicateIDs []string
		for runEnd < len(parts) {
			nextCall, nextResult, after, ok := toolPairAt(parts, runEnd, inlineResults)
			if !ok || duplicateToolPairKey(nextCall, nextResult) != key {
				break
			}
			runCount++
			if nextCall.ID != "" {
				duplicateIDs = append(duplicateIDs, nextCall.ID)
			}
			if nextResult.ID != "" {
				duplicateIDs = append(duplicateIDs, nextResult.ID)
			}
			runEnd = after
		}
		if runCount >= 3 {
			for _, id := range duplicateIDs {
				skip[id] = true
			}
			noticeID := result.ID
			if noticeID == "" {
				noticeID = call.ID
			}
			if noticeID != "" {
				notice[noticeID] = runCount - 1
			}
		}
		i = runEnd
	}
	return skip, notice
}

func toolPairAt(parts []gact.Part, index int, inlineResults map[string]gact.Part) (gact.Part, gact.Part, int, bool) {
	if index < 0 || index >= len(parts) {
		return gact.Part{}, gact.Part{}, index, false
	}
	call := parts[index]
	if call.Type != gact.PartTypeToolCall || call.CallID == "" {
		return gact.Part{}, gact.Part{}, index, false
	}
	if index+1 < len(parts) {
		result := parts[index+1]
		if result.Type == gact.PartTypeToolResult && result.CallID == call.CallID {
			return call, result, index + 2, true
		}
	}
	if inlineResults != nil {
		if result, ok := inlineResults[call.CallID]; ok {
			return call, result, index + 1, true
		}
	}
	return gact.Part{}, gact.Part{}, index, false
}

func duplicateToolPairKey(call, result gact.Part) string {
	return call.ToolName + "\x00" + toolCallSummary(call) + "\x00" +
		strings.Join(strings.Fields(flattenToolResult(result)), " ")
}

func (t Theme) renderDuplicateToolNotice(toolName string, repeat int) string {
	if repeat <= 0 {
		return ""
	}
	name := capitalizeToolName(toolName)
	text := fmt.Sprintf("↻ %s repeated %d more time%s with the same call/result", name, repeat, plural(repeat))
	return lipgloss.NewStyle().Foreground(t.FgMuted).Italic(true).Render("   " + text)
}
