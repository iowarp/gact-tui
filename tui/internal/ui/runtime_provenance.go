package ui

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

const partTypeRuntimeProvenance = "runtime_provenance"

func normalizeMessageRuntimeProvenance(m *gact.Message) {
	if m == nil || m.Role != gact.RoleAssistant || messageHasPartType(m, partTypeRuntimeProvenance) {
		return
	}
	rp := mapValue(m.Metadata["runtime_provenance"])
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
	return len(mapValue(m.Metadata["runtime_provenance"])) > 0
}

func runtimeProvenanceInlineSummary(rp map[string]any) string {
	parts := []string{"runtime provenance"}
	if trace := stringValue(runtimeProvenanceTurnMap(rp)["trace_id"]); trace != "" {
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
	agent := mapValue(rp["agent"])
	active := firstNonEmpty(
		stringValue(agent["active_expert_id"]),
		stringValue(agent["active_agent_id"]),
		stringValue(agent["selected_agent_id"]),
		stringValue(agent["id"]),
	)
	parent := firstNonEmpty(stringValue(agent["parent_id"]), stringValue(agent["root_id"]))
	if active == "" {
		return ""
	}
	if parent != "" && parent != active {
		return parent + " -> " + active
	}
	return "agent: " + active
}

func runtimeProvenanceToolSummary(rp map[string]any) string {
	tools := mapValue(rp["tools"])
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
	delegation := mapValue(rp["delegation"])
	rows := runtimeRowMaps(delegation["events"])
	if len(rows) == 0 {
		return ""
	}
	out := make([]string, 0, minInt(len(rows), 3))
	for _, row := range rows {
		stage := firstNonEmpty(stringValue(row["stage"]), stringValue(row["event_type"]))
		stage = expertHandoffStageLabel(stage)
		parent := stringValue(row["parent_id"])
		agent := firstNonEmpty(stringValue(row["agent_id"]), stringValue(row["child_id"]))
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
				name := firstNonEmpty(
					stringValue(row["name"]),
					stringValue(row["tool_name"]),
					stringValue(row["id"]),
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
		if m := mapValue(row); len(m) > 0 {
			out = append(out, m)
		}
	}
	return out
}

func runtimeProvenanceDetailText(rp map[string]any) string {
	rows := appendRuntimeOperatorView(nil, rp)
	rows = appendDetailSection(rows, "Execution summary",
		detailField{"workflow", runtimeProvenanceInlineSummary(rp)},
	)
	rows = appendRuntimeMapSection(rows, "Turn", runtimeProvenanceTurnMap(rp), "trace_id", "turn_id", "status")
	rows = appendRuntimeMapSection(rows, "Workspace", mapValue(rp["workspace"]), "workspace_id", "root_path", "scope")
	rows = appendRuntimeMapSection(rows, "Agent", mapValue(rp["agent"]), "selected_agent_id", "active_agent_id", "active_expert_id", "route_source", "route_reason", "source", "tier", "parent_id")
	rows = appendRuntimeMapSection(rows, "Workflow", mapValue(rp["blueprint"]), "id", "version", "scope")
	rows = appendRuntimeMapSection(rows, "Provider", mapValue(rp["provider"]), "provider_id", "model_id", "model", "source")
	rows = appendRuntimeMapSection(rows, "Prompt", mapValue(rp["prompt"]), "prompt_id", "profile", "source", "source_path", "checksum")
	rows = appendRuntimeToolsSection(rows, mapValue(rp["tools"]))
	rows = appendRuntimeSkillsSection(rows, mapValue(rp["skills"]))
	rows = appendRuntimeDelegationSection(rows, mapValue(rp["delegation"]))
	rows = appendRuntimeMapSection(rows, "Memory", mapValue(rp["memory"]), "policy", "policy_summary", "search_count", "context_frame_count")
	rows = appendRuntimeContextSection(rows, mapValue(rp["context"]))
	rows = appendRuntimeAnyRowsSection(rows, "Artifacts", rp["artifacts"], "path", "output_path", "artifact", "kind", "type", "status", "size_bytes", "exists", "sha256")
	rows = appendRuntimeAnyRowsSection(rows, "Errors", rp["errors"], "code", "type", "message", "stage", "recoverable", "agent_id", "tool_name")
	return strings.Join(rows, "\n")
}

func appendRuntimeOperatorView(rows []string, rp map[string]any) []string {
	fields := []detailField{}
	if route := runtimeProvenanceRouteSummary(rp); route != "" {
		fields = append(fields, detailField{"active path", route})
	}
	if workflow := runtimeScalar(mapValue(rp["blueprint"])["id"]); workflow != "" {
		fields = append(fields, detailField{"workflow", workflow})
	}
	if tools := runtimeProvenanceToolSummary(rp); tools != "" {
		fields = append(fields, detailField{"tools used", tools})
	}
	if delegation := runtimeProvenanceDelegationSummary(rp); delegation != "" {
		fields = append(fields, detailField{"handoffs", delegation})
	}
	if artifacts := runtimeProvenanceOperatorRows(rp["artifacts"], "path", "output_path", "artifact"); artifacts != "" {
		fields = append(fields, detailField{"artifacts", artifacts})
	}
	if errors := runtimeProvenanceOperatorRows(rp["errors"], "message", "code", "type"); errors != "" {
		fields = append(fields, detailField{"errors", errors})
	}
	if len(fields) == 0 {
		fields = append(fields, detailField{"status", "runtime provenance captured"})
	}
	return appendDetailSection(rows, "Operator view", fields...)
}

func runtimeProvenanceOperatorRows(raw any, preferred ...string) string {
	rows := runtimeRowMaps(raw)
	if len(rows) == 0 {
		if m := mapValue(raw); len(m) > 0 {
			rows = runtimeRowMaps(firstNonEmptyAny(m["rows"], m["items"], m["artifacts"], m["errors"]))
		}
	}
	if len(rows) == 0 {
		if names := orderedRuntimeNames(raw); len(names) > 0 {
			return strings.Join(limitRuntimeOperatorStrings(names, 3), ", ")
		}
		return runtimeScalar(raw)
	}
	out := make([]string, 0, minInt(len(rows), 3))
	for _, row := range rows {
		value := ""
		for _, key := range preferred {
			if candidate := runtimeScalar(row[key]); candidate != "" {
				value = candidate
				break
			}
		}
		if value == "" {
			value = compactRuntimeObject(row)
		}
		out = append(out, value)
		if len(out) == 3 {
			break
		}
	}
	if hidden := len(rows) - len(out); hidden > 0 {
		out = append(out, fmt.Sprintf("+%d more", hidden))
	}
	return strings.Join(out, ", ")
}

func limitRuntimeOperatorStrings(values []string, limit int) []string {
	if limit <= 0 || len(values) <= limit {
		return values
	}
	out := append([]string(nil), values[:limit]...)
	out = append(out, fmt.Sprintf("+%d more", len(values)-limit))
	return out
}

func runtimeProvenanceTurnMap(rp map[string]any) map[string]any {
	if len(rp) == 0 {
		return nil
	}
	turn := mapValue(rp["turn"])
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

func appendRuntimeMapSection(rows []string, title string, m map[string]any, keys ...string) []string {
	if len(m) == 0 {
		return rows
	}
	fields := make([]detailField, 0, len(keys))
	for _, key := range keys {
		if value := runtimeScalar(m[key]); value != "" {
			fields = append(fields, detailField{runtimeProvenanceLabel(key), value})
		}
	}
	if len(fields) == 0 {
		return rows
	}
	return appendDetailSection(rows, title, fields...)
}

func appendRuntimeToolsSection(rows []string, tools map[string]any) []string {
	if len(tools) == 0 {
		return rows
	}
	fields := []detailField{}
	if declared := orderedRuntimeNames(tools["declared"]); len(declared) > 0 {
		fields = append(fields, detailField{"declared", strings.Join(declared, ", ")})
	}
	if observed := orderedRuntimeNames(tools["observed"]); len(observed) > 0 {
		fields = append(fields, detailField{"observed", strings.Join(observed, ", ")})
	}
	if rowsText := runtimeRowsText(tools["calls"], "tool_name", "name", "status", "duration_ms", "server_id", "descriptor_id"); rowsText != "" {
		fields = append(fields, detailField{"calls", rowsText})
	}
	if rowsText := runtimeRowsText(tools["mcp"], "server_id", "descriptor_id", "agent_blueprint_id", "status", "trust"); rowsText != "" {
		fields = append(fields, detailField{"mcp", rowsText})
	}
	if len(fields) == 0 {
		return rows
	}
	return appendDetailSection(rows, "Tools", fields...)
}

func appendRuntimeSkillsSection(rows []string, skills map[string]any) []string {
	if len(skills) == 0 {
		return rows
	}
	fields := []detailField{}
	if declared := orderedRuntimeNames(skills["declared"]); len(declared) > 0 {
		fields = append(fields, detailField{"declared", strings.Join(declared, ", ")})
	}
	if resolved := runtimeRowsText(firstNonEmptyAny(skills["resolved"], skills["resolved_skills"]), "id", "name", "status", "source_path", "path"); resolved != "" {
		fields = append(fields, detailField{"resolved", resolved})
	}
	if missing := orderedRuntimeNames(skills["missing"]); len(missing) > 0 {
		fields = append(fields, detailField{"missing", strings.Join(missing, ", ")})
	}
	if len(fields) == 0 {
		return rows
	}
	return appendDetailSection(rows, "Skills", fields...)
}

func appendRuntimeDelegationSection(rows []string, delegation map[string]any) []string {
	if len(delegation) == 0 {
		return rows
	}
	if text := runtimeRowsText(delegation["events"], "stage", "parent_id", "agent_id", "return_to", "depth", "execution_mode", "duration_ms"); text != "" {
		return appendDetailSection(rows, "Delegation", detailField{"events", text})
	}
	return rows
}

func appendRuntimeContextSection(rows []string, context map[string]any) []string {
	if len(context) == 0 {
		return rows
	}
	fields := []detailField{}
	for _, key := range []string{"files_count", "context_files_count", "count", "status", "policy", "max_inline_bytes"} {
		if value := runtimeScalar(context[key]); value != "" {
			fields = append(fields, detailField{runtimeProvenanceLabel(key), value})
		}
	}
	if files := runtimeRowsText(firstNonEmptyAny(context["files"], context["context_files"]), "path", "mode", "status", "inline_policy", "language", "size", "bytes", "tokens"); files != "" {
		fields = append(fields, detailField{"files", files})
	}
	if len(fields) == 0 {
		return rows
	}
	return appendDetailSection(rows, "Context", fields...)
}

func appendRuntimeAnyRowsSection(rows []string, title string, raw any, preferred ...string) []string {
	switch v := raw.(type) {
	case nil:
		return rows
	case map[string]any:
		if len(v) == 0 {
			return rows
		}
		if text := runtimeRowsText(firstNonEmptyAny(v["rows"], v["items"], v[strings.ToLower(title)]), preferred...); text != "" {
			return appendDetailSection(rows, title, detailField{strings.ToLower(title), text})
		}
		return appendRuntimeRowsSection(rows, title, v)
	case []any, []string, string:
		if text := runtimeRowsText(raw, preferred...); text != "" {
			return appendDetailSection(rows, title, detailField{strings.ToLower(title), text})
		}
	default:
		if text := runtimeScalar(raw); text != "" {
			return appendDetailSection(rows, title, detailField{strings.ToLower(title), text})
		}
	}
	return rows
}

func appendRuntimeRowsSection(rows []string, title string, m map[string]any) []string {
	if len(m) == 0 {
		return rows
	}
	fields := []detailField{}
	for _, key := range sortedAnyMapKeys(m) {
		if text := runtimeScalar(m[key]); text != "" {
			fields = append(fields, detailField{runtimeProvenanceLabel(key), text})
		}
	}
	if len(fields) == 0 {
		return rows
	}
	return appendDetailSection(rows, title, fields...)
}

func runtimeRowsText(raw any, preferred ...string) string {
	rows := runtimeRowMaps(raw)
	if len(rows) == 0 {
		if names := orderedRuntimeNames(raw); len(names) > 0 {
			return strings.Join(names, "\n")
		}
		return runtimeScalar(raw)
	}
	lines := make([]string, 0, len(rows))
	for _, row := range rows {
		parts := make([]string, 0, len(preferred))
		for _, key := range preferred {
			if value := runtimeScalar(row[key]); value != "" {
				parts = append(parts, runtimeProvenanceLabel(key)+"="+value)
			}
		}
		if len(parts) == 0 {
			parts = append(parts, compactRuntimeObject(row))
		}
		lines = append(lines, "- "+strings.Join(parts, " · "))
	}
	return strings.Join(lines, "\n")
}

func runtimeProvenanceLabel(key string) string {
	switch key {
	case "agent_blueprint_id":
		return "workflow"
	case "agent_id":
		return "agent"
	case "assistant_message_id":
		return "assistant message"
	case "active_agent_id":
		return "active agent"
	case "active_expert_id":
		return "active expert"
	case "context_files_count":
		return "context files"
	case "context_frame_count":
		return "context frames"
	case "definition_path":
		return "definition file"
	case "descriptor_id":
		return "descriptor"
	case "duration_ms":
		return "duration"
	case "execution_mode":
		return "execution mode"
	case "files_count":
		return "files"
	case "inline_policy":
		return "inline policy"
	case "max_inline_bytes":
		return "inline limit"
	case "model_id":
		return "model"
	case "output_path":
		return "output path"
	case "parent_id":
		return "parent"
	case "policy_summary":
		return "policy summary"
	case "prompt_id":
		return "prompt"
	case "provider_id":
		return "provider"
	case "recoverable":
		return "recoverable"
	case "return_to":
		return "return to"
	case "route_reason":
		return "routing reason"
	case "route_source":
		return "routing source"
	case "root_path":
		return "workspace root"
	case "schema_version":
		return "format"
	case "search_count":
		return "searches"
	case "selected_agent_id":
		return "selected agent"
	case "server_id":
		return "connection"
	case "sha256":
		return "checksum"
	case "size_bytes":
		return "size"
	case "source_path":
		return "source file"
	case "storage_root":
		return "storage root"
	case "tool_name":
		return "tool"
	case "trace_id":
		return "trace"
	case "turn_id":
		return "turn"
	case "user_message_id":
		return "user message"
	case "workspace_id":
		return "workspace"
	default:
		return strings.ReplaceAll(key, "_", " ")
	}
}

func runtimeScalar(v any) string {
	switch value := v.(type) {
	case nil:
		return ""
	case string:
		return strings.TrimSpace(value)
	case bool:
		return fmt.Sprintf("%t", value)
	case float64, float32, int, int64, int32, json.Number:
		return fmt.Sprint(value)
	case []string:
		return strings.Join(value, ", ")
	case []any:
		if names := orderedRuntimeNames(value); len(names) > 0 {
			return strings.Join(names, ", ")
		}
		return compactRuntimeObject(value)
	case map[string]any:
		return compactRuntimeObject(value)
	default:
		return fmt.Sprint(value)
	}
}

func compactRuntimeObject(v any) string {
	if v == nil {
		return ""
	}
	if body, err := json.Marshal(v); err == nil {
		return truncateString(string(body), 240)
	}
	return truncateString(fmt.Sprint(v), 240)
}

func firstNonEmptyAny(values ...any) any {
	for _, value := range values {
		switch v := value.(type) {
		case nil:
			continue
		case string:
			if strings.TrimSpace(v) != "" {
				return value
			}
		case []any:
			if len(v) > 0 {
				return value
			}
		case []string:
			if len(v) > 0 {
				return value
			}
		case map[string]any:
			if len(v) > 0 {
				return value
			}
		default:
			return value
		}
	}
	return nil
}
