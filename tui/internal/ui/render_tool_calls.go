package ui

// render_tool_calls.go pairs tool calls with results, suppresses redundant status, and summarizes calls.

import (
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

func toolCallWithResultStatusSuppressed(p gact.Part, inlineResults map[string]gact.Part) gact.Part {
	if p.Type != gact.PartTypeToolCall || p.CallID == "" || inlineResults == nil {
		return p
	}
	if _, ok := inlineResults[p.CallID]; !ok || p.Metadata == nil {
		return p
	}
	clone := p
	metadata := make(map[string]any, len(p.Metadata))
	for key, value := range p.Metadata {
		if key == "status" {
			continue
		}
		metadata[key] = value
	}
	clone.Metadata = metadata
	if len(clone.Metadata) == 0 {
		clone.Metadata = nil
	}
	return clone
}

func pairedToolResultsInParts(parts []gact.Part, inlineResults map[string]gact.Part) (map[string]gact.Part, map[int]bool) {
	paired := map[string]gact.Part{}
	for callID, result := range inlineResults {
		if callID != "" {
			paired[callID] = result
		}
	}
	callSeen := map[string]bool{}
	resultIndexes := map[int]bool{}
	for i, part := range parts {
		switch part.Type {
		case gact.PartTypeToolCall:
			if part.CallID != "" {
				callSeen[part.CallID] = true
			}
		case gact.PartTypeToolResult:
			if part.CallID != "" && callSeen[part.CallID] {
				if _, exists := paired[part.CallID]; !exists {
					paired[part.CallID] = part
				}
				resultIndexes[i] = true
			}
		}
	}
	if len(paired) == 0 {
		paired = nil
	}
	return paired, resultIndexes
}

func toolCallStatusLabel(p gact.Part) string {
	if p.Metadata == nil {
		return ""
	}
	status := strings.ToLower(strings.TrimSpace(valuefmt.StringValue(p.Metadata["status"])))
	switch status {
	case "running", "started", "pending":
		return "running now"
	default:
		return ""
	}
}

// toolCallSummary produces the "arg summary" that goes inside the
// parentheses of a Claude-Code-style tool-call header. Well-known
// tools get their primary arg pulled up inline (Bash: `command`,
// Read: `path`, Grep: `pattern`) so the header reads naturally.
// Anything else falls back to a compact JSON-oneline.
func toolCallSummary(p gact.Part) string {
	if len(p.Input) == 0 {
		if p.Metadata != nil {
			preview := strings.TrimSpace(valuefmt.StringValue(p.Metadata["args_preview"]))
			if semanticPreviewIsInlineRedaction(preview) {
				return ""
			}
			return preview
		}
		return ""
	}
	tool := strings.ToLower(p.ToolName)
	primary := ""
	switch tool {
	case "bash", "shell", "shell_bash", "exec":
		if v, ok := p.Input["command"].(string); ok {
			primary = v
		} else if v, ok := p.Input["cmd"].(string); ok {
			primary = v
		}
		if tool == "shell_bash" && primary != "" {
			primary = summarizeShellCommandIntent(primary)
		}
	case "read", "read_file", "cat":
		if v, ok := p.Input["path"].(string); ok {
			primary = valuefmt.ShortenPathForInline(v)
		}
	case "write", "write_file", "edit", "edit_file":
		if v, ok := p.Input["path"].(string); ok {
			primary = valuefmt.ShortenPathForInline(v)
		}
	case "grep", "search":
		if v, ok := p.Input["pattern"].(string); ok {
			primary = v
		}
	case "web_search":
		if v, ok := p.Input["query"].(string); ok {
			primary = v
		}
	}
	if primary == "" {
		primary = scientificToolCallSummary(tool, p.Input)
	}
	if primary != "" {
		return primary
	}
	return jsonOneLine(p.Input)
}
