package ui

// runtime_provenance.go normalizes and summarizes runtime-provenance metadata on a message.

import (
	"fmt"
	"sort"
	"strings"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

const partTypeRuntimeProvenance = "runtime_provenance"

func normalizeMessageRuntimeProvenance(m *gact.Message) {
	if m == nil || m.Role != gact.RoleAssistant || messageHasPartType(m, partTypeRuntimeProvenance) {
		return
	}
	rp := valuefmt.MapValue(m.Metadata["runtime_provenance"])
	if len(rp) == 0 {
		return
	}
	m.Parts = append(m.Parts, gact.Part{
		ID:   "synthetic_runtime_provenance",
		Type: partTypeRuntimeProvenance,
		Text: runtimeProvenanceInlineSummary(rp),
		Metadata: map[string]any{
			"synthetic_from":     "message_runtime_provenance",
			"runtime_provenance": rp,
		},
	})
}

func hasRuntimeProvenance(m gact.Message) bool {
	return len(valuefmt.MapValue(m.Metadata["runtime_provenance"])) > 0
}

func runtimeProvenanceInlineSummary(rp map[string]any) string {
	parts := []string{"runtime provenance"}
	if trace := valuefmt.StringValue(runtimeProvenanceTurnMap(rp)["trace_id"]); trace != "" {
		parts = append(parts, "trace "+trace)
	}
	if route := runtimeProvenanceRouteSummary(rp); route != "" {
		parts = append(parts, route)
	}
	if tools := runtimeProvenanceToolSummary(rp); tools != "" {
		parts = append(parts, "tools: "+tools)
	}
	if delegation := runtimeProvenanceDelegationSummary(rp); delegation != "" {
		parts = append(parts, "delegation: "+delegation)
	}
	return strings.Join(parts, " · ")
}

func runtimeProvenanceRouteSummary(rp map[string]any) string {
	agent := valuefmt.MapValue(rp["agent"])
	active := valuefmt.FirstNonEmpty(
		valuefmt.StringValue(agent["active_expert_id"]),
		valuefmt.StringValue(agent["active_agent_id"]),
		valuefmt.StringValue(agent["selected_agent_id"]),
		valuefmt.StringValue(agent["id"]),
	)
	parent := valuefmt.FirstNonEmpty(valuefmt.StringValue(agent["parent_id"]), valuefmt.StringValue(agent["root_id"]))
	if active == "" {
		return ""
	}
	if parent != "" && parent != active {
		return parent + " -> " + active
	}
	return "agent: " + active
}

func runtimeProvenanceToolSummary(rp map[string]any) string {
	tools := valuefmt.MapValue(rp["tools"])
	names := orderedRuntimeNames(tools["observed"])
	if len(names) == 0 {
		names = orderedRuntimeNames(tools["declared"])
	}
	if len(names) == 0 {
		return ""
	}
	if len(names) > 3 {
		return strings.Join(names[:3], ", ") + fmt.Sprintf(" +%d", len(names)-3)
	}
	return strings.Join(names, ", ")
}

func runtimeProvenanceDelegationSummary(rp map[string]any) string {
	delegation := valuefmt.MapValue(rp["delegation"])
	rows := runtimeRowMaps(delegation["events"])
	if len(rows) == 0 {
		return ""
	}
	out := make([]string, 0, valuefmt.MinInt(len(rows), 3))
	for _, row := range rows {
		stage := valuefmt.FirstNonEmpty(valuefmt.StringValue(row["stage"]), valuefmt.StringValue(row["event_type"]))
		stage = expertHandoffStageLabel(stage)
		parent := valuefmt.StringValue(row["parent_id"])
		agent := valuefmt.FirstNonEmpty(valuefmt.StringValue(row["agent_id"]), valuefmt.StringValue(row["child_id"]))
		if parent != "" && agent != "" {
			out = append(out, parent+" -> "+agent+" "+stage)
		} else if agent != "" || stage != "" {
			out = append(out, strings.TrimSpace(agent+" "+stage))
		}
		if len(out) == 3 {
			break
		}
	}
	if len(out) == 0 {
		return ""
	}
	if len(rows) > len(out) {
		return strings.Join(out, ", ") + fmt.Sprintf(" +%d", len(rows)-len(out))
	}
	return strings.Join(out, ", ")
}

func orderedRuntimeNames(raw any) []string {
	switch v := raw.(type) {
	case []string:
		out := append([]string(nil), v...)
		sort.Strings(out)
		return out
	case []any:
		out := make([]string, 0, len(v))
		for _, item := range v {
			switch row := item.(type) {
			case string:
				if strings.TrimSpace(row) != "" {
					out = append(out, row)
				}
			case map[string]any:
				name := valuefmt.FirstNonEmpty(
					valuefmt.StringValue(row["name"]),
					valuefmt.StringValue(row["tool_name"]),
					valuefmt.StringValue(row["id"]),
				)
				if name != "" {
					out = append(out, name)
				}
			}
		}
		sort.Strings(out)
		return out
	default:
		return nil
	}
}

func runtimeRowMaps(raw any) []map[string]any {
	rows, ok := raw.([]any)
	if !ok {
		return nil
	}
	out := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		if m := valuefmt.MapValue(row); len(m) > 0 {
			out = append(out, m)
		}
	}
	return out
}

func runtimeProvenanceTurnMap(rp map[string]any) map[string]any {
	if len(rp) == 0 {
		return nil
	}
	turn := valuefmt.MapValue(rp["turn"])
	out := make(map[string]any, len(turn)+2)
	for key, value := range turn {
		out[key] = value
	}
	for _, key := range []string{"trace_id", "turn_id"} {
		if runtimeScalar(out[key]) == "" && runtimeScalar(rp[key]) != "" {
			out[key] = rp[key]
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}
