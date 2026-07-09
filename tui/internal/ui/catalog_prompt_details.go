package ui

// catalog_prompt_details.go formats resolved/rendered prompt detail text and validation/reload results.

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

func formatResolvedPrompt(p gact.ResolvedPrompt) string {
	summary := []detailField{
		{"id", p.ID},
		{"profile", p.Profile},
		{"scope", p.Scope},
		{"status", promptResolutionStatus(p)},
	}
	if p.FallbackProfile != "" {
		summary = append(summary, detailField{"fallback profile", p.FallbackProfile})
	}
	if p.Provider != "" {
		summary = append(summary, detailField{"provider", p.Provider})
	}
	if p.Model != "" {
		summary = append(summary, detailField{"model", p.Model})
	}
	if p.Checksum != "" {
		summary = append(summary, detailField{"checksum", p.Checksum})
	}
	if p.SourcePath != "" {
		summary = append(summary, detailField{"source", p.SourcePath})
	}
	rows := appendDetailSection(nil, "Resolution", summary...)
	rows = appendDetailSection(rows, "Operator paths",
		detailField{"render preview", "inspect the runtime prompt with session and workspace substitutions applied"},
		detailField{"validate", "check an edited profile before using it in a session"},
		detailField{"customize", "edit a profile or save the current profile as a codex override"},
	)
	if p.Description != "" {
		rows = appendDetailSection(rows, "Description", detailField{"", p.Description})
	}
	if len(p.ValidationErrors) > 0 {
		rows = appendDetailSection(rows, "Validation", detailField{"errors", strings.Join(p.ValidationErrors, "\n")})
	}
	if len(p.Metadata) > 0 {
		if payload, err := json.MarshalIndent(p.Metadata, "", "  "); err == nil {
			rows = appendDetailSection(rows, "Metadata", detailField{"", string(payload)})
		}
	}
	rows = appendDetailSection(rows, "Text", detailField{"", p.Text})
	return strings.Join(rows, "\n")
}

func promptResolutionStatus(p gact.ResolvedPrompt) string {
	if len(p.ValidationErrors) > 0 {
		return fmt.Sprintf("invalid · %d error%s", len(p.ValidationErrors), plural(len(p.ValidationErrors)))
	}
	if p.FallbackProfile != "" {
		return "fallback profile used"
	}
	return "ready"
}

func formatRenderedPrompt(p gact.ResolvedPrompt) string {
	rows := appendDetailSection(nil, "Rendered body", detailField{"", p.Text})
	rows = appendDetailSection(rows, "Operator context",
		detailField{"prompt", p.ID},
		detailField{"profile", p.Profile},
		detailField{"scope", p.Scope},
		detailField{"provider", p.Provider},
		detailField{"model", p.Model},
	)
	if p.FallbackProfile != "" {
		rows = append(rows, detailFieldRows("fallback profile", p.FallbackProfile)...)
	}
	rows = appendDetailSection(rows, "Technical provenance",
		detailField{"source file", p.SourcePath},
		detailField{"checksum", p.Checksum},
	)
	if len(p.ValidationErrors) > 0 {
		rows = appendDetailSection(rows, "Validation", detailField{"errors", strings.Join(p.ValidationErrors, "\n")})
	}
	if len(p.Metadata) > 0 {
		rows = appendPromptMetadataSection(rows, "Render provenance", p.Metadata)
	}
	return strings.Join(rows, "\n")
}

func appendPromptMetadataSection(rows []string, title string, metadata map[string]any) []string {
	fields := make([]detailField, 0, len(metadata))
	for _, key := range sortedPromptMetadataKeys(metadata) {
		if promptMetadataHidden(key, metadata[key]) {
			continue
		}
		value := promptMetadataValue(metadata[key])
		if strings.TrimSpace(value) == "" || strings.TrimSpace(value) == `""` {
			continue
		}
		fields = append(fields, detailField{promptMetadataLabel(key), value})
	}
	if len(fields) == 0 {
		return rows
	}
	return appendDetailSection(rows, title, fields...)
}

func promptMetadataHidden(key string, value any) bool {
	switch key {
	case "rendered":
		if b, ok := value.(bool); ok && b {
			return true
		}
		if strings.EqualFold(strings.TrimSpace(fmt.Sprint(value)), "true") {
			return true
		}
	}
	return false
}

func promptMetadataLabel(key string) string {
	switch key {
	case "agent_id":
		return "agent"
	case "behavior_profile":
		return "behavior profile"
	case "blueprint_id":
		return "blueprint"
	case "prompt_family":
		return "prompt family"
	case "prompt_id":
		return "prompt"
	case "prompt_profile":
		return "prompt profile"
	case "session_id":
		return "session"
	case "workspace_id":
		return "workspace"
	default:
		return strings.ReplaceAll(key, "_", " ")
	}
}

func sortedPromptMetadataKeys(metadata map[string]any) []string {
	keys := make([]string, 0, len(metadata))
	for key := range metadata {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func promptMetadataValue(value any) string {
	if text := scalarText(value); text != "" {
		return text
	}
	if payload, err := json.MarshalIndent(value, "", "  "); err == nil {
		return string(payload)
	}
	return fmt.Sprint(value)
}

func formatPromptValidation(result gact.PromptValidationResult) string {
	status := "valid"
	if !result.Enabled || len(result.ValidationErrors) > 0 {
		status = "invalid"
	}
	rows := appendDetailSection(nil, "Validation",
		detailField{"status", status},
		detailField{"enabled", fmt.Sprintf("%t", result.Enabled)},
		detailField{"prompt", result.Prompt.ID},
		detailField{"scope", result.Prompt.Scope},
		detailField{"source file", result.Prompt.SourcePath},
	)
	if len(result.ValidationErrors) > 0 {
		rows = appendDetailSection(rows, "Errors", detailField{"", strings.Join(result.ValidationErrors, "\n")})
	}
	return strings.Join(rows, "\n")
}

func formatPromptReload(result gact.PromptReloadResult) string {
	rows := appendDetailSection(nil, "Reload",
		detailField{"prompts loaded", fmt.Sprintf("%d", result.PromptCount)},
		detailField{"prompt ids", strings.Join(result.PromptIDs, ", ")},
	)
	for _, source := range result.Sources {
		label := valuefmt.FirstNonEmpty(source.Scope, "source")
		rows = append(rows, detailFieldRows(label, source.Root)...)
	}
	if len(result.Metadata) > 0 {
		if payload, err := json.MarshalIndent(result.Metadata, "", "  "); err == nil {
			rows = appendDetailSection(rows, "Metadata", detailField{"", string(payload)})
		}
	}
	return strings.Join(rows, "\n")
}
