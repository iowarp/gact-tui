package ui

// live_message_expert_handoffs.go normalizes and filters expert-handoff parts/rows on a message.

import (
	"fmt"
	"strings"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

func normalizeMessageExpertHandoffs(m *gact.Message) {
	if m == nil || m.Role != gact.RoleAssistant {
		return
	}
	tools := normalizeToolEvidenceRows(m.Metadata["tools_called"])
	if messageHasPartType(m, gact.PartTypeExpertHandoff) {
		filterExistingExpertHandoffParts(m, tools)
		return
	}
	rows := normalizeExpertHandoffRows(m.Metadata["expert_handoffs"])
	rows = filterRedundantDirectToolHandoffRows(rows, tools)
	rows = filterNoisyExpertHandoffRows(rows)
	if len(rows) == 0 {
		return
	}
	synthetic := make([]gact.Part, 0, len(rows))
	for i, row := range rows {
		md := map[string]any{}
		for k, v := range row {
			md[k] = v
		}
		md["synthetic_from"] = "expert_handoffs_metadata"
		synthetic = append(synthetic, gact.Part{
			ID:       fmt.Sprintf("synthetic_expert_handoff_%d", i+1),
			Type:     gact.PartTypeExpertHandoff,
			Text:     expertHandoffSummary(row),
			Metadata: md,
		})
	}
	insertAt := len(m.Parts)
	for i, part := range m.Parts {
		if part.Type == gact.PartTypeThinking || part.Type == gact.PartTypeText {
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

func filterExistingExpertHandoffParts(m *gact.Message, tools []toolEvidenceRow) {
	if m == nil {
		return
	}
	filtered := m.Parts[:0]
	for _, part := range m.Parts {
		if part.Type == gact.PartTypeExpertHandoff && (isNoisyExpertHandoff(part.Metadata) || (len(tools) > 0 && isRedundantDirectToolHandoff(part.Metadata))) {
			continue
		}
		filtered = append(filtered, part)
	}
	m.Parts = filtered
}

func normalizeExpertHandoffRows(raw any) []map[string]any {
	items, ok := raw.([]any)
	if !ok {
		return nil
	}
	rows := make([]map[string]any, 0, len(items))
	for _, item := range items {
		if row, ok := item.(map[string]any); ok {
			rows = append(rows, row)
		}
	}
	return rows
}

func filterRedundantDirectToolHandoffRows(rows []map[string]any, tools []toolEvidenceRow) []map[string]any {
	if len(rows) == 0 || len(tools) == 0 {
		return rows
	}
	filtered := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		if isRedundantDirectToolHandoff(row) {
			continue
		}
		filtered = append(filtered, row)
	}
	return filtered
}

func filterNoisyExpertHandoffRows(rows []map[string]any) []map[string]any {
	if len(rows) == 0 {
		return rows
	}
	filtered := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		if isNoisyExpertHandoff(row) {
			continue
		}
		filtered = append(filtered, row)
	}
	return filtered
}

func isNoisyExpertHandoff(row map[string]any) bool {
	if len(row) == 0 {
		return false
	}
	status := strings.ToLower(strings.TrimSpace(valuefmt.FirstNonEmpty(valuefmt.StringValue(row["status"]), "observed")))
	if status == "failed" || status == "failure" || status == "error" {
		return false
	}
	stage := strings.ToLower(strings.TrimSpace(valuefmt.FirstNonEmpty(
		valuefmt.StringValue(row["stage"]),
		valuefmt.StringValue(row["dispatch_target"]),
		valuefmt.StringValue(row["event_type"]),
	)))
	switch stage {
	case "parent.resumed", "parent_resumed", "blueprint.delegation.parent_resumed":
		return true
	}
	summary := strings.ToLower(strings.TrimSpace(valuefmt.FirstNonEmpty(
		valuefmt.StringValue(row["output_summary"]),
		valuefmt.StringValue(row["summary"]),
		valuefmt.StringValue(row["text"]),
	)))
	return strings.Contains(summary, " resumed after ") && !strings.Contains(summary, "error")
}

func isRedundantDirectToolHandoff(row map[string]any) bool {
	stage := strings.ToLower(strings.TrimSpace(valuefmt.FirstNonEmpty(
		valuefmt.StringValue(row["stage"]),
		valuefmt.StringValue(row["dispatch_target"]),
	)))
	if stage != "direct_tool" {
		return false
	}
	status := strings.ToLower(strings.TrimSpace(valuefmt.FirstNonEmpty(valuefmt.StringValue(row["status"]), "observed")))
	if status != "success" && status != "ok" {
		return false
	}
	return valuefmt.FirstNonEmpty(
		valuefmt.StringValue(row["output_summary"]),
		valuefmt.StringValue(row["summary"]),
		valuefmt.StringValue(row["error"]),
	) == ""
}

func expertHandoffSummary(row map[string]any) string {
	agent := valuefmt.FirstNonEmpty(
		valuefmt.StringValue(row["agent_id"]),
		valuefmt.StringValue(row["expert"]),
		"expert",
	)
	parent := valuefmt.FirstNonEmpty(
		valuefmt.StringValue(row["parent_id"]),
		valuefmt.StringValue(row["parent"]),
	)
	stage := valuefmt.FirstNonEmpty(
		valuefmt.StringValue(row["stage"]),
		valuefmt.StringValue(row["dispatch_target"]),
	)
	status := valuefmt.FirstNonEmpty(valuefmt.StringValue(row["status"]), "observed")
	output := valuefmt.FirstNonEmpty(
		valuefmt.StringValue(row["output_summary"]),
		valuefmt.StringValue(row["summary"]),
	)
	route := agent
	if parent != "" {
		route = parent + " -> " + agent
	}
	bits := []string{route, status}
	if stage != "" {
		bits = append(bits, stage)
	}
	if output != "" {
		bits = append(bits, output)
	}
	return strings.Join(bits, " | ")
}
