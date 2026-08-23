package ui

// render_tool_evidence.go renders tool-evidence rows and detects error results.

import (
	"fmt"
	"strconv"
	"strings"

	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/textutil"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

type toolEvidenceRow struct {
	Name            string
	Args            any
	Result          any
	OK              *bool
	DurationMS      *float64
	Cached          *bool
	TelemetrySource string
	RepeatCount     int
}

func (t Theme) renderToolEvidence(m gact.Message, width int) string {
	if m.Role != gact.RoleAssistant || assistantCarriedToolCall(&m) {
		return ""
	}
	rows := normalizeToolEvidenceRows(m.Metadata["tools_called"])
	if len(rows) == 0 {
		return ""
	}

	wrapW := width - 2
	if wrapW < 20 {
		wrapW = width
	}
	title := lipgloss.NewStyle().Foreground(t.RoleTool).Bold(true).
		Render("Tool evidence")
	sourceNote := lipgloss.NewStyle().Foreground(t.FgMuted).
		Render("summary metadata; no live tool transcript was sent")
	out := []string{title + lipgloss.NewStyle().Foreground(t.FgFaint).Render(" · ") + sourceNote}
	for _, row := range rows {
		status := "seen"
		if toolEvidenceRowIsError(row) {
			status = "error"
		} else if row.OK != nil {
			if *row.OK {
				status = "ok"
			} else {
				status = "error"
			}
		}
		head := status + " " + row.Name
		if args := valuefmt.CompactJSON(row.Args); args != "" {
			head += "(" + textutil.Truncate(args, 120) + ")"
		}
		var meta []string
		if row.TelemetrySource != "" {
			meta = append(meta, row.TelemetrySource)
		}
		if row.DurationMS != nil {
			meta = append(meta, fmt.Sprintf("%.0fms", *row.DurationMS))
		}
		if row.Cached != nil && *row.Cached {
			meta = append(meta, "cached")
		}
		if len(meta) > 0 {
			head += " · " + strings.Join(meta, " · ")
		}
		if row.RepeatCount > 0 {
			head += " · repeated " + strconv.Itoa(row.RepeatCount) + " more time" + plural(row.RepeatCount)
		}
		out = append(out, lipgloss.NewStyle().Foreground(t.RoleTool).
			Render(indent(textutil.Wrap(head, wrapW-2), "  ")))
		if result := valuefmt.CompactJSON(row.Result); result != "" {
			out = append(out, lipgloss.NewStyle().Foreground(t.FgMuted).
				Render(indent(textutil.Wrap("result: "+textutil.Truncate(result, 180), wrapW-4), "    ")))
		}
	}
	return lipgloss.JoinVertical(lipgloss.Left, out...)
}

func normalizeToolEvidenceRows(raw any) []toolEvidenceRow {
	items, ok := raw.([]any)
	if !ok {
		return nil
	}
	rows := make([]toolEvidenceRow, 0, len(items))
	seen := map[string]int{}
	for _, item := range items {
		rowMap, ok := item.(map[string]any)
		if !ok {
			continue
		}
		name, _ := rowMap["name"].(string)
		if name == "" {
			name, _ = rowMap["tool"].(string)
		}
		if name == "" {
			continue
		}
		row := toolEvidenceRow{
			Name:            name,
			Args:            rowMap["args"],
			Result:          rowMap["result"],
			TelemetrySource: valuefmt.StringValue(rowMap["telemetry_source"]),
		}
		if row.Args == nil {
			row.Args = rowMap["arguments"]
		}
		if row.Args == nil {
			row.Args = rowMap["params"]
		}
		if okValue, ok := rowMap["ok"].(bool); ok {
			row.OK = &okValue
		}
		if duration, ok := valuefmt.FloatValue(rowMap["duration_ms"]); ok {
			row.DurationMS = &duration
		}
		if cached, ok := rowMap["cached"].(bool); ok {
			row.Cached = &cached
		}
		key := toolEvidenceRowKey(row)
		if prior, ok := seen[key]; ok {
			rows[prior].RepeatCount++
			continue
		}
		seen[key] = len(rows)
		rows = append(rows, row)
	}
	return rows
}

func toolEvidenceRowKey(row toolEvidenceRow) string {
	return row.Name + "\x00" + valuefmt.CompactJSON(row.Args) + "\x00" + valuefmt.CompactJSON(row.Result)
}

func toolEvidenceRowIsError(row toolEvidenceRow) bool {
	if row.OK != nil && !*row.OK {
		return true
	}
	return toolEvidenceResultIsError(row.Result)
}

func toolEvidenceResultIsError(raw any) bool {
	result, ok := raw.(map[string]any)
	if !ok {
		return false
	}
	if okValue, ok := result["ok"].(bool); ok && !okValue {
		return true
	}
	switch errValue := result["error"].(type) {
	case map[string]any:
		return len(errValue) > 0
	case string:
		return strings.TrimSpace(errValue) != ""
	default:
		return errValue != nil
	}
}
