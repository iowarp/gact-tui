package ui

// catalog_blueprint_hook_descriptors.go formats agent-blueprint hook descriptor titles, summaries, and field labels.

import "strings"

func agentBlueprintHookDescription(descriptor map[string]any) string {
	fields := make([]detailField, 0, 12)
	for _, key := range []string{"event", "source", "scope", "agent_blueprint_id", "definition_path", "installed_path", "checksum"} {
		if value := stringValue(descriptor[key]); value != "" {
			if key == "event" {
				value = agentBlueprintHookEventLabel(value)
			} else if key == "source" {
				value = operatorSourceValueLabel(value)
			}
			fields = append(fields, detailField{agentBlueprintHookFieldLabel(key), value})
		}
	}
	if trust := mapValue(descriptor["trust"]); len(trust) > 0 {
		if policy := stringValue(trust["policy"]); policy != "" {
			fields = append(fields, detailField{"trust policy", policy})
		}
		if trusted := scalarText(trust["trusted"]); trusted != "" {
			fields = append(fields, detailField{"trusted", trusted})
		}
		if source := stringValue(trust["source"]); source != "" {
			fields = append(fields, detailField{"trust source", source})
		}
	} else if trust := stringValue(descriptor["trust"]); trust != "" {
		fields = append(fields, detailField{"trust", trust})
	}
	if enabled := scalarText(descriptor["enabled"]); enabled != "" {
		fields = append(fields, detailField{"activation", enabledStateLabel(enabled)})
	}
	rows := appendDetailSection(nil, "Message automation", fields...)
	if warnings := stringListFromAny(descriptor["validation_warnings"]); len(warnings) > 0 {
		rows = appendDetailSection(rows, "Warnings", detailField{"", strings.Join(warnings, "\n")})
	}
	if errors := stringListFromAny(descriptor["validation_errors"]); len(errors) > 0 {
		rows = appendDetailSection(rows, "Errors", detailField{"", strings.Join(errors, "\n")})
	}
	return strings.Join(rows, "\n")
}

func agentBlueprintHookInlineSummary(descriptor map[string]any) string {
	parts := make([]string, 0, 6)
	if event := stringValue(descriptor["event"]); event != "" {
		parts = append(parts, agentBlueprintHookEventLabel(event))
	}
	if enabled := scalarText(descriptor["enabled"]); enabled != "" {
		parts = append(parts, enabledStateLabel(enabled))
	}
	if trust := mapValue(descriptor["trust"]); len(trust) > 0 {
		if trusted := scalarText(trust["trusted"]); strings.EqualFold(trusted, "false") {
			parts = append(parts, "needs approval")
		}
	}
	if scope := stringValue(descriptor["scope"]); scope != "" {
		parts = append(parts, scope)
	}
	if source := stringValue(descriptor["source"]); source != "" {
		parts = append(parts, "provided by "+operatorSourceValueLabel(source))
	}
	if len(stringListFromAny(descriptor["validation_errors"])) > 0 {
		parts = append(parts, "errors")
	} else if len(stringListFromAny(descriptor["validation_warnings"])) > 0 {
		parts = append(parts, "warnings")
	}
	return strings.Join(parts, " · ")
}

func agentBlueprintHookTitle(descriptor map[string]any) string {
	if event := stringValue(descriptor["event"]); event != "" {
		return agentBlueprintHookEventLabel(event)
	}
	title := firstNonEmpty(stringValue(descriptor["title"]), stringValue(descriptor["name"]), stringValue(descriptor["id"]))
	if title == "" {
		return "Message automation"
	}
	return title
}

func agentBlueprintHookEventLabel(event string) string {
	switch strings.ToLower(strings.TrimSpace(event)) {
	case "pre_message":
		return "Before each user message"
	case "post_message":
		return "After each assistant response"
	default:
		return humanizeAgentLabel(event)
	}
}

func agentBlueprintHookFieldLabel(key string) string {
	switch key {
	case "event":
		return "when"
	case "source":
		return "provided by"
	case "agent_blueprint_id":
		return "blueprint id"
	case "definition_path":
		return "hook file"
	case "installed_path":
		return "installed file"
	default:
		return strings.ReplaceAll(key, "_", " ")
	}
}
