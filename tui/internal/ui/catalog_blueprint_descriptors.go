package ui

// catalog_blueprint_descriptors.go formats agent-blueprint MCP/descriptor metadata into catalog descriptions and detail fields.

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func agentBlueprintMCPDescription(descriptor map[string]any) string {
	fields := make([]detailField, 0, 16)
	if command := stringValue(descriptor["command"]); command != "" {
		fields = append(fields, detailField{"server command", command})
	}
	if args := stringListFromAny(descriptor["args"]); len(args) > 0 {
		fields = append(fields, detailField{"server arguments", strings.Join(args, " ")})
	}
	if enabled := scalarText(descriptor["enabled"]); enabled != "" {
		fields = append(fields, detailField{"activation", enabledStateLabel(enabled)})
	}
	for _, key := range []string{"transport", "url", "source_blueprint_id", "server_id"} {
		fields = appendDescriptorMetadataFields(fields, key, descriptor[key])
	}
	for _, key := range []string{"runtime", "install", "trust", "env_policy", "verification"} {
		fields = appendDescriptorMetadataFields(fields, key, descriptor[key])
	}
	rows := appendDetailSection(nil, "MCP access", fields...)
	if warnings := stringListFromAny(descriptor["validation_warnings"]); len(warnings) > 0 {
		rows = appendDetailSection(rows, "Warnings", detailField{"", strings.Join(warnings, "\n")})
	}
	if errors := stringListFromAny(descriptor["validation_errors"]); len(errors) > 0 {
		rows = appendDetailSection(rows, "Errors", detailField{"", strings.Join(errors, "\n")})
	}
	return strings.Join(rows, "\n")
}

func agentBlueprintMCPInlineSummary(descriptor map[string]any) string {
	parts := make([]string, 0, 6)
	if command := stringValue(descriptor["command"]); command != "" {
		parts = append(parts, "calls "+command)
	}
	if enabled := scalarText(descriptor["enabled"]); enabled != "" {
		parts = append(parts, enabledStateLabel(enabled))
	}
	if trust := mapValue(descriptor["trust"]); len(trust) > 0 {
		if trusted := scalarText(trust["trusted"]); strings.EqualFold(trusted, "false") {
			parts = append(parts, "needs approval")
		}
	}
	if transport := firstNonEmpty(stringValue(descriptor["transport"]), stringValue(mapValue(descriptor["runtime"])["transport"])); transport != "" {
		parts = append(parts, transport)
	}
	if serverID := firstNonEmpty(stringValue(descriptor["server_id"]), stringValue(mapValue(descriptor["runtime"])["server_id"])); serverID != "" {
		parts = append(parts, serverID)
	}
	if len(stringListFromAny(descriptor["validation_errors"])) > 0 {
		parts = append(parts, "errors")
	} else if len(stringListFromAny(descriptor["validation_warnings"])) > 0 {
		parts = append(parts, "warnings")
	}
	return strings.Join(parts, " · ")
}

func appendDescriptorMetadataFields(fields []detailField, key string, value any) []detailField {
	if text := descriptorMetadataValueText(value); text != "" {
		return append(fields, detailField{descriptorMetadataLabel(key, ""), text})
	}
	m := mapValue(value)
	if len(m) == 0 {
		return fields
	}
	keys := make([]string, 0, len(m))
	for subkey := range m {
		if descriptorMetadataValueText(m[subkey]) != "" {
			keys = append(keys, subkey)
		}
	}
	sort.Strings(keys)
	for _, subkey := range keys {
		label := descriptorMetadataLabel(key, subkey)
		fields = append(fields, detailField{label, descriptorMetadataValueText(m[subkey])})
	}
	return fields
}

func enabledStateLabel(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "true", "yes", "on", "enabled":
		return "enabled"
	case "false", "no", "off", "disabled":
		return "disabled"
	default:
		return raw
	}
}

func descriptorMetadataLabel(key, subkey string) string {
	if subkey == "" {
		switch key {
		case "source":
			return "provided by"
		case "env_policy":
			return "environment policy"
		case "source_blueprint_id":
			return "blueprint id"
		case "server_id":
			return "server id"
		default:
			return strings.ReplaceAll(key, "_", " ")
		}
	}
	switch key {
	case "install":
		return "install " + strings.ReplaceAll(subkey, "_", " ")
	case "runtime":
		return "runtime " + strings.ReplaceAll(subkey, "_", " ")
	case "verification":
		return "verification " + strings.ReplaceAll(subkey, "_", " ")
	case "trust":
		switch subkey {
		case "policy":
			return "trust policy"
		case "trusted":
			return "trusted"
		case "source":
			return "trust source"
		}
	case "env_policy":
		switch subkey {
		case "mode", "policy":
			return "environment policy"
		}
		return "environment policy " + strings.ReplaceAll(subkey, "_", " ")
	}
	return strings.ReplaceAll(key+" "+subkey, "_", " ")
}

func descriptorMetadataValueText(value any) string {
	switch v := value.(type) {
	case nil:
		return ""
	case string:
		return strings.TrimSpace(v)
	case []string:
		return strings.Join(v, ", ")
	case []any:
		values := make([]string, 0, len(v))
		for _, item := range v {
			if text := descriptorMetadataValueText(item); text != "" {
				values = append(values, text)
			}
		}
		return strings.Join(values, ", ")
	case map[string]any:
		return ""
	default:
		return strings.TrimSpace(fmt.Sprint(v))
	}
}

func compactJSONDescription(value map[string]any) string {
	if len(value) == 0 {
		return ""
	}
	payload, err := json.Marshal(value)
	if err != nil {
		return ""
	}
	return string(payload)
}

func agentCapabilityRefDescription(ref gact.AgentCapabilityRef) string {
	parts := make([]string, 0, 5)
	if ref.Kind != "" {
		parts = append(parts, "kind: "+ref.Kind)
	}
	if ref.Status != "" {
		parts = append(parts, "status: "+ref.Status)
	}
	if ref.Source != "" {
		parts = append(parts, "source: "+ref.Source)
	}
	if ref.Description != "" {
		parts = append(parts, ref.Description)
	}
	if text := compactJSONDescription(ref.Metadata); text != "" {
		parts = append(parts, "metadata: "+text)
	}
	return strings.Join(parts, " · ")
}
