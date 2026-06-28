package ui

// live_message_tool_evidence.go normalizes tool-evidence metadata on a message.

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// normalizeMessageToolEvidence promotes CLIO's metadata-only tool telemetry
// into first-class tool_call/tool_result parts so conversation order matches
// execution order and the body cursor can focus/expand the tool details.
func normalizeMessageToolEvidence(m *gact.Message) {
	if m == nil || m.Role != gact.RoleAssistant || assistantCarriedToolCall(m) {
		return
	}
	rows := normalizeToolEvidenceRows(m.Metadata["tools_called"])
	if len(rows) == 0 {
		return
	}
	var synthetic []gact.Part
	for i, row := range rows {
		if row.Name == "" {
			continue
		}
		callID := fmt.Sprintf("tool_evidence_%d", i+1)
		synthetic = append(synthetic, gact.Part{
			ID:       "synthetic_" + callID + "_call",
			Type:     gact.PartTypeToolCall,
			CallID:   callID,
			ToolName: row.Name,
			Input:    toolEvidenceInput(row.Args),
			Metadata: map[string]any{
				"synthetic_from": "tools_called_metadata",
			},
		})
		resultText := toolEvidenceResultText(row.Name, row.Result)
		if row.RepeatCount > 0 {
			repeatNotice := "trace repeated " + strconv.Itoa(row.RepeatCount) + " more time" + plural(row.RepeatCount) + " with the same call/result"
			if strings.TrimSpace(resultText) == "" {
				resultText = repeatNotice
			} else {
				resultText += "\n" + repeatNotice
			}
		}
		resultPart := gact.Part{
			ID:       "synthetic_" + callID + "_result",
			Type:     gact.PartTypeToolResult,
			CallID:   callID,
			ToolName: row.Name,
			IsError:  toolEvidenceRowIsError(row),
			Content: []gact.Part{{
				ID:   "synthetic_" + callID + "_result_text",
				Type: gact.PartTypeText,
				Text: resultText,
			}},
			Metadata: map[string]any{
				"synthetic_from": "tools_called_metadata",
				"raw_result":     row.Result,
			},
		}
		if row.DurationMS != nil {
			resultPart.DurationMS = *row.DurationMS
		}
		if row.Cached != nil {
			resultPart.Cached = *row.Cached
		}
		synthetic = append(synthetic, resultPart)
	}
	if len(synthetic) == 0 {
		return
	}
	insertAt := len(m.Parts)
	for i, part := range m.Parts {
		if part.Type == gact.PartTypeText {
			insertAt = i
			break
		}
	}
	parts := make([]gact.Part, 0, len(m.Parts)+len(synthetic))
	parts = append(parts, m.Parts[:insertAt]...)
	parts = append(parts, synthetic...)
	parts = append(parts, m.Parts[insertAt:]...)
	m.Parts = parts
}

func toolEvidenceInput(raw any) map[string]any {
	if raw == nil {
		return nil
	}
	if input, ok := raw.(map[string]any); ok {
		return input
	}
	return map[string]any{"args": raw}
}
