package ui

// catalog_blueprint_metadata.go assembles install/display/provenance metadata for agent blueprints.

import (
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func agentBlueprintInstallMetadata(blueprint gact.AgentBlueprintDefinition) map[string]any {
	install := mapValue(blueprint.Metadata["install"])
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
	if kind := firstNonEmpty(stringValue(install["source_kind"]), stringValue(install["kind"])); kind != "" {
		parts = append(parts, "source: "+kind)
	}
	if source := firstNonEmpty(stringValue(install["source"]), stringValue(install["url"]), stringValue(install["path"])); source != "" {
		parts = append(parts, "from: "+source)
	}
	if ref := stringValue(install["ref"]); ref != "" {
		parts = append(parts, "ref: "+ref)
	}
	if commit := shortHash(stringValue(install["commit"])); commit != "" {
		parts = append(parts, "commit: "+commit)
	}
	if checksum := shortHash(stringValue(install["checksum"])); checksum != "" {
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
		{"source url", firstNonEmpty(stringValue(install["source"]), stringValue(install["url"]), stringValue(install["path"]))},
		{"source type", firstNonEmpty(stringValue(install["source_kind"]), stringValue(install["kind"]))},
		{"ref", stringValue(install["ref"])},
		{"commit", stringValue(install["commit"])},
		{"checksum", stringValue(install["checksum"])},
		{"status", stringValue(install["status"])},
		{"status message", firstNonEmpty(stringValue(install["status_message"]), stringValue(install["message"]))},
		{"trust", firstNonEmpty(stringValue(install["trust"]), stringValue(install["trust_policy"]))},
		{"installed", stringValue(install["installed_at"])},
		{"last synced", firstNonEmpty(stringValue(install["last_sync"]), stringValue(install["last_synced_at"]), stringValue(install["synced_at"]))},
		{"installed scope", firstNonEmpty(stringValue(install["scope"]), blueprint.Scope)},
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
	if errText := firstNonEmpty(stringValue(install["error"]), stringValue(install["last_error"])); errText != "" {
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
		fields = append(fields, "protected scope: "+firstNonEmpty(blueprint.Scope, "unknown"))
	} else if action == "update" {
		fields = append(fields, "refresh this installed blueprint through CLIO")
	} else {
		fields = append(fields, "remove this installed blueprint through CLIO")
	}
	if source := firstNonEmpty(stringValue(install["source"]), stringValue(install["url"]), stringValue(install["path"])); source != "" {
		fields = append(fields, "source: "+source)
	}
	if status := stringValue(install["status"]); status != "" {
		fields = append(fields, "status: "+status)
	}
	if message := firstNonEmpty(stringValue(install["status_message"]), stringValue(install["message"])); message != "" {
		fields = append(fields, "status message: "+message)
	}
	if syncedAt := firstNonEmpty(stringValue(install["last_sync"]), stringValue(install["last_synced_at"]), stringValue(install["synced_at"])); syncedAt != "" {
		fields = append(fields, "last synced: "+syncedAt)
	}
	if trust := firstNonEmpty(stringValue(install["trust"]), stringValue(install["trust_policy"])); trust != "" {
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
			if s := stringValue(item); s != "" {
				out = append(out, s)
			}
		}
		return out
	default:
		return nil
	}
}
