package ui

// runtime_provenance_detail.go builds the detailed runtime-provenance text (tools/skills/delegation/context).

import (
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
	"strings"
)

func runtimeProvenanceDetailText(rp map[string]any) string {
	rows := appendRuntimeOperatorView(nil, rp)
	rows = appendDetailSection(rows, "Execution summary",
		detailField{"workflow", runtimeProvenanceInlineSummary(rp)},
	)
	rows = appendRuntimeMapSection(rows, "Turn", runtimeProvenanceTurnMap(rp), "trace_id", "turn_id", "status")
	rows = appendRuntimeMapSection(rows, "Workspace", valuefmt.MapValue(rp["workspace"]), "workspace_id", "root_path", "scope")
	rows = appendRuntimeMapSection(rows, "Agent", valuefmt.MapValue(rp["agent"]), "selected_agent_id", "active_agent_id", "active_expert_id", "route_source", "route_reason", "source", "tier", "parent_id")
	rows = appendRuntimeMapSection(rows, "Workflow", valuefmt.MapValue(rp["blueprint"]), "id", "version", "scope")
	rows = appendRuntimeMapSection(rows, "Provider", valuefmt.MapValue(rp["provider"]), "provider_id", "model_id", "model", "source")
	rows = appendRuntimeMapSection(rows, "Prompt", valuefmt.MapValue(rp["prompt"]), "prompt_id", "profile", "source", "source_path", "checksum")
	rows = appendRuntimeToolsSection(rows, valuefmt.MapValue(rp["tools"]))
	rows = appendRuntimeSkillsSection(rows, valuefmt.MapValue(rp["skills"]))
	rows = appendRuntimeDelegationSection(rows, valuefmt.MapValue(rp["delegation"]))
	rows = appendRuntimeMapSection(rows, "Memory", valuefmt.MapValue(rp["memory"]), "policy", "policy_summary", "search_count", "context_frame_count")
	rows = appendRuntimeContextSection(rows, valuefmt.MapValue(rp["context"]))
	rows = appendRuntimeAnyRowsSection(rows, "Artifacts", rp["artifacts"], "path", "output_path", "artifact", "kind", "type", "status", "size_bytes", "exists", "sha256")
	rows = appendRuntimeAnyRowsSection(rows, "Errors", rp["errors"], "code", "type", "message", "stage", "recoverable", "agent_id", "tool_name")
	return strings.Join(rows, "\n")
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
