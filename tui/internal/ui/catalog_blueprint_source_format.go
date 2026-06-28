package ui

// catalog_blueprint_source_format.go formats blueprint source summaries, status tags, and attention indicators.

import "strings"

func sourceTitle(summary *agentBlueprintSourceSummary) string {
	if summary == nil {
		return "source"
	}
	return compactAgentBlueprintSourceName(summary.source)
}

func compactAgentBlueprintSourceName(source string) string {
	source = strings.TrimSpace(source)
	if source == "" {
		return "source"
	}
	source = strings.TrimSuffix(source, "/")
	source = strings.TrimSuffix(source, ".git")
	if idx := strings.Index(source, "://"); idx >= 0 {
		rest := source[idx+3:]
		if slash := strings.Index(rest, "/"); slash >= 0 && slash+1 < len(rest) {
			source = rest[slash+1:]
		} else {
			source = rest
		}
	}
	if idx := strings.Index(source, ":"); idx >= 0 && strings.Contains(source[:idx], "@") && idx+1 < len(source) {
		source = source[idx+1:]
	}
	parts := strings.Split(source, "/")
	if len(parts) > 2 {
		parts = parts[len(parts)-2:]
	}
	source = strings.Join(parts, "/")
	if source == "" {
		return "source"
	}
	return source
}

func agentBlueprintSourceInlineSummary(summary *agentBlueprintSourceSummary) string {
	if summary == nil {
		return "marketplace source"
	}
	parts := make([]string, 0, 8)
	if summary.ref != "" {
		parts = append(parts, "branch "+summary.ref)
	}
	if summary.status != "" {
		parts = append(parts, marketplaceSourceStatusLabel(summary.status))
	}
	if summary.statusMsg != "" {
		parts = append(parts, compactCatalogText(summary.statusMsg))
	}
	if len(summary.blueprints) > 0 {
		parts = append(parts, pluralizeCount(len(summary.blueprints), "blueprint"))
	}
	if len(summary.errors) > 0 {
		parts = append(parts, pluralizeCount(len(summary.errors), "error"))
	} else if len(summary.warnings) > 0 {
		parts = append(parts, pluralizeCount(len(summary.warnings), "warning"))
	}
	if len(parts) == 0 {
		return "source registry entry"
	}
	return strings.Join(parts, " · ")
}

func marketplaceSourceStatusTag(summary *agentBlueprintSourceSummary) string {
	if summary == nil {
		return "source"
	}
	if status := marketplaceSourceStatusLabel(summary.status); status != "" {
		return status
	}
	if len(summary.blueprints) > 0 {
		return "available"
	}
	return "source"
}

func marketplaceSourceStatusLabel(status string) string {
	status = strings.TrimSpace(status)
	if status == "" {
		return ""
	}
	switch compactStatusTag(status) {
	case "ready", "ok", "synced", "available":
		return "available"
	case "installed":
		return "installed"
	case "stale":
		return "needs refresh"
	case "error", "failed", "failure":
		return "error"
	default:
		return strings.ReplaceAll(status, "_", " ")
	}
}

func marketplaceBlueprintStateLabel(state string) string {
	switch compactStatusTag(state) {
	case "marketplace", "available":
		return "available to install"
	case "installed":
		return "installed"
	default:
		return strings.ReplaceAll(strings.TrimSpace(state), "_", " ")
	}
}

func formatAgentBlueprintSourceSummary(summary *agentBlueprintSourceSummary) string {
	if summary == nil {
		return ""
	}
	fields := []detailField{
		{"ref", summary.ref},
		{"commit", summary.commit},
		{"checksum", summary.checksum},
		{"status", summary.status},
		{"status message", summary.statusMsg},
		{"trust", summary.trust},
		{"installed", summary.installedAt},
		{"last synced", summary.syncedAt},
		{"scope", summary.scope},
		{"blueprints", strings.Join(summary.blueprints, ", ")},
		{"blueprint states", strings.Join(summary.states, "\n")},
	}
	rows := make([]string, 0, len(fields))
	for _, field := range fields {
		if strings.TrimSpace(field.value) == "" {
			continue
		}
		rows = append(rows, detailFieldRows(field.label, field.value)...)
	}
	if len(summary.warnings) > 0 {
		rows = appendDetailSection(rows, "Warnings", detailField{"warnings", strings.Join(summary.warnings, "\n")})
	}
	if len(summary.errors) > 0 {
		rows = appendDetailSection(rows, "Validation", detailField{"errors", strings.Join(summary.errors, "\n")})
	}
	return strings.Join(rows, "\n")
}

func agentBlueprintSourceNeedsAttention(summary *agentBlueprintSourceSummary) bool {
	if summary == nil {
		return false
	}
	if len(summary.errors) > 0 || len(summary.warnings) > 0 {
		return true
	}
	status := strings.ToLower(strings.TrimSpace(summary.status))
	return strings.Contains(status, "error") ||
		strings.Contains(status, "fail") ||
		strings.Contains(status, "stale") ||
		strings.Contains(status, "warning")
}
