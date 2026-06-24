package ui

// render_tool_results.go renders tool results for a tool and summarizes their text.

import (
	"encoding/json"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func (t Theme) renderToolResultForTool(p gact.Part, width int, toolName string) string {
	if toolName == "grep" {
		if out := t.renderGrepResult(p, width); out != "" {
			return out
		}
	}
	if !p.IsError {
		if summary := summarizeToolResultText(toolName, flattenToolResult(p)); summary != "" {
			preview := p
			rawText := flattenToolResult(p)
			if strings.TrimSpace(summary) != strings.TrimSpace(rawText) {
				preview.Metadata = clonePartMetadata(preview.Metadata)
				preview.Metadata["raw_result"] = rawText
			}
			preview.Content = []gact.Part{{
				Type: gact.PartTypeText,
				Text: summary,
			}}
			return t.renderPart(preview, width)
		}
	}
	return t.renderPart(p, width)
}

func clonePartMetadata(metadata map[string]any) map[string]any {
	clone := make(map[string]any, len(metadata)+1)
	for key, value := range metadata {
		clone[key] = value
	}
	return clone
}

func summarizeToolResultText(toolName string, rawText string) string {
	rawText = strings.TrimSpace(rawText)
	if rawText == "" {
		return ""
	}
	var payload any
	if err := json.Unmarshal([]byte(rawText), &payload); err != nil {
		return summarizeNonJSONToolResultText(toolName, rawText)
	}
	return summarizeToolResult(toolName, payload)
}
