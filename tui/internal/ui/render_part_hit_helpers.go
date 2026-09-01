package ui

// render_part_hit_helpers.go computes per-part hit affordances and diff action hits.

import (
	"strings"

	xansi "github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func detailAffordanceLine(rendered string) int {
	lines := strings.Split(xansi.Strip(rendered), "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		line := lines[i]
		if strings.Contains(line, "Ctrl+E") ||
			strings.Contains(line, "raw detail") ||
			strings.Contains(line, "error detail") ||
			strings.Contains(line, "full summary") {
			return i
		}
	}
	return -1
}

func pendingFileDiff(p gact.Part) bool {
	if p.Type != gact.PartTypeFileDiff || p.Applied {
		return false
	}
	if p.Metadata != nil {
		if rejected, ok := p.Metadata["rejected"].(bool); ok && rejected {
			return false
		}
	}
	return strings.TrimSpace(p.Path) != ""
}

func diffActionHits(path string, rendered string) []conversationDiffActionHit {
	path = strings.TrimSpace(path)
	if path == "" {
		return nil
	}
	lines := strings.Split(xansi.Strip(rendered), "\n")
	for row, line := range lines {
		applyCol := strings.LastIndex(line, "apply")
		rejectCol := strings.LastIndex(line, "reject")
		if applyCol < 0 || rejectCol < 0 {
			continue
		}
		return []conversationDiffActionHit{
			{path: path, action: "apply", row: row, col: applyCol, width: len("apply")},
			{path: path, action: "reject", row: row, col: rejectCol, width: len("reject")},
		}
	}
	return nil
}

func renderedStringLineCount(s string) int {
	if s == "" {
		return 0
	}
	return strings.Count(s, "\n") + 1
}

// matchEditFileDiffs walks parts and pairs each edit_file tool_call
// with a sibling file_diff for the same path. Returns:
//
//	byCall[call_id]        — diff to render under this call's header
//	suppressed[part_id]    — file_diff parts to NOT render standalone
//
// Match by path: the tool_call's Input["path"] ↔ file_diff.Path. This
// is loose on purpose — a one-shot edit flow that emits a diff and
// then the matching call (or vice versa) both get paired regardless
// of order.
func matchEditFileDiffs(parts []gact.Part) (byCall map[string]gact.Part, suppressed map[string]bool) {
	byCall = map[string]gact.Part{}
	suppressed = map[string]bool{}
	type callInfo struct {
		id   string
		path string
	}
	var calls []callInfo
	for _, p := range parts {
		if p.Type != gact.PartTypeToolCall || p.ToolName != "edit_file" {
			continue
		}
		path := ""
		if s, ok := p.Input["path"].(string); ok {
			path = s
		}
		if path == "" || p.CallID == "" {
			continue
		}
		calls = append(calls, callInfo{p.CallID, path})
	}
	if len(calls) == 0 {
		return byCall, suppressed
	}
	used := map[string]bool{} // callID set
	for _, p := range parts {
		if p.Type != gact.PartTypeFileDiff {
			continue
		}
		for _, c := range calls {
			if used[c.id] {
				continue
			}
			if c.path != p.Path {
				continue
			}
			byCall[c.id] = p
			suppressed[p.ID] = true
			used[c.id] = true
			break
		}
	}
	return byCall, suppressed
}
