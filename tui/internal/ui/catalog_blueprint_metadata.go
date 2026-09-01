package ui

// catalog_blueprint_metadata.go assembles install/display/provenance metadata for agent blueprints.

import (
	"strings"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

func agentBlueprintInstallMetadata(blueprint gact.AgentBlueprintDefinition) map[string]any {
	install := valuefmt.MapValue(blueprint.Metadata["install"])
	if len(install) > 0 {
		return install
	}
	return blueprint.Metadata
}

func agentBlueprintDisplayMetadata(blueprint gact.AgentBlueprintDefinition) map[string]any {
	if len(blueprint.Metadata) == 0 {
		return nil
	}
	out := make(map[string]any, len(blueprint.Metadata))
	for key, value := range blueprint.Metadata {
		if key == "install" {
			continue
		}
		out[key] = value
	}
	return out
}

func agentBlueprintProvenanceLine(blueprint gact.AgentBlueprintDefinition) string {
	install := agentBlueprintInstallMetadata(blueprint)
	parts := make([]string, 0, 5)
	if kind := valuefmt.FirstNonEmpty(valuefmt.StringValue(install["source_kind"]), valuefmt.StringValue(install["kind"])); kind != "" {
		parts = append(parts, "source: "+kind)
	}
	if source := valuefmt.FirstNonEmpty(valuefmt.StringValue(install["source"]), valuefmt.StringValue(install["url"]), valuefmt.StringValue(install["path"])); source != "" {
		parts = append(parts, "from: "+source)
	}
	if ref := valuefmt.StringValue(install["ref"]); ref != "" {
		parts = append(parts, "ref: "+ref)
	}
	if commit := shortHash(valuefmt.StringValue(install["commit"])); commit != "" {
		parts = append(parts, "commit: "+commit)
	}
	if checksum := shortHash(valuefmt.StringValue(install["checksum"])); checksum != "" {
		parts = append(parts, "checksum: "+checksum)
	}
	return strings.Join(parts, " · ")
}

func appendAgentBlueprintProvenanceSection(rows []string, blueprint gact.AgentBlueprintDefinition) []string {
	install := agentBlueprintInstallMetadata(blueprint)
	if len(install) == 0 {
		return rows
	}
	fields := []detailField{
		{"source url", valuefmt.FirstNonEmpty(valuefmt.StringValue(install["source"]), valuefmt.StringValue(install["url"]), valuefmt.StringValue(install["path"]))},
		{"source type", valuefmt.FirstNonEmpty(valuefmt.StringValue(install["source_kind"]), valuefmt.StringValue(install["kind"]))},
		{"ref", valuefmt.StringValue(install["ref"])},
		{"commit", valuefmt.StringValue(install["commit"])},
		{"checksum", valuefmt.StringValue(install["checksum"])},
		{"status", valuefmt.StringValue(install["status"])},
		{"status message", valuefmt.FirstNonEmpty(valuefmt.StringValue(install["status_message"]), valuefmt.StringValue(install["message"]))},
		{"trust", valuefmt.FirstNonEmpty(valuefmt.StringValue(install["trust"]), valuefmt.StringValue(install["trust_policy"]))},
		{"installed", valuefmt.StringValue(install["installed_at"])},
		{"last synced", valuefmt.FirstNonEmpty(valuefmt.StringValue(install["last_sync"]), valuefmt.StringValue(install["last_synced_at"]), valuefmt.StringValue(install["synced_at"]))},
		{"installed scope", valuefmt.FirstNonEmpty(valuefmt.StringValue(install["scope"]), blueprint.Scope)},
	}
	hasValue := false
	for _, field := range fields {
		if strings.TrimSpace(field.value) != "" {
			hasValue = true
			break
		}
	}
	if !hasValue {
		return rows
	}
	rows = appendDetailSection(rows, "Source provenance", fields...)
	warnings := appendUniqueStrings(nil, stringListFromAny(install["warnings"])...)
	warnings = appendUniqueStrings(warnings, stringListFromAny(install["validation_warnings"])...)
	if len(warnings) > 0 {
		rows = appendDetailSection(rows, "Source warnings", detailField{"warnings", strings.Join(warnings, "\n")})
	}
	errors := appendUniqueStrings(nil, stringListFromAny(install["errors"])...)
	errors = appendUniqueStrings(errors, stringListFromAny(install["validation_errors"])...)
	if errText := valuefmt.FirstNonEmpty(valuefmt.StringValue(install["error"]), valuefmt.StringValue(install["last_error"])); errText != "" {
		errors = appendUniqueStrings(errors, errText)
	}
	if len(errors) > 0 {
		rows = appendDetailSection(rows, "Source errors", detailField{"errors", strings.Join(errors, "\n")})
	}
	return rows
}

func agentBlueprintLifecycleActionDescription(blueprint gact.AgentBlueprintDefinition, action string, manageable bool) string {
	install := agentBlueprintInstallMetadata(blueprint)
	fields := make([]string, 0, 6)
	if !manageable {
		fields = append(fields, "protected scope: "+valuefmt.FirstNonEmpty(blueprint.Scope, "unknown"))
	} else if action == "update" {
		fields = append(fields, "refresh this installed blueprint through "+brandName())
	} else {
		fields = append(fields, "remove this installed blueprint through "+brandName())
	}
	if source := valuefmt.FirstNonEmpty(valuefmt.StringValue(install["source"]), valuefmt.StringValue(install["url"]), valuefmt.StringValue(install["path"])); source != "" {
		fields = append(fields, "source: "+source)
	}
	if status := valuefmt.StringValue(install["status"]); status != "" {
		fields = append(fields, "status: "+status)
	}
	if message := valuefmt.FirstNonEmpty(valuefmt.StringValue(install["status_message"]), valuefmt.StringValue(install["message"])); message != "" {
		fields = append(fields, "status message: "+message)
	}
	if syncedAt := valuefmt.FirstNonEmpty(valuefmt.StringValue(install["last_sync"]), valuefmt.StringValue(install["last_synced_at"]), valuefmt.StringValue(install["synced_at"])); syncedAt != "" {
		fields = append(fields, "last synced: "+syncedAt)
	}
	if trust := valuefmt.FirstNonEmpty(valuefmt.StringValue(install["trust"]), valuefmt.StringValue(install["trust_policy"])); trust != "" {
		fields = append(fields, "trust: "+trust)
	}
	if len(fields) == 0 {
		return "lifecycle action"
	}
	return strings.Join(fields, " · ")
}

func shortHash(value string) string {
	value = strings.TrimSpace(value)
	if len(value) > 12 {
		return value[:12]
	}
	return value
}

func appendUniqueStrings(values []string, extra ...string) []string {
	seen := make(map[string]bool, len(values)+len(extra))
	for _, value := range values {
		seen[value] = true
	}
	for _, value := range extra {
		value = strings.TrimSpace(value)
		if value == "" || seen[value] {
			continue
		}
		values = append(values, value)
		seen[value] = true
	}
	return values
}

func stringListFromAny(value any) []string {
	switch v := value.(type) {
	case []string:
		return v
	case []any:
		out := make([]string, 0, len(v))
		for _, item := range v {
			if s := valuefmt.StringValue(item); s != "" {
				out = append(out, s)
			}
		}
		return out
	default:
		return nil
	}
}
