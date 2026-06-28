package ui

// catalog_blueprint_sources.go groups blueprints into source summaries keyed by their origin.

import (
	"sort"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

type agentBlueprintSourceSummary struct {
	key         string
	source      string
	kind        string
	ref         string
	commit      string
	checksum    string
	status      string
	statusMsg   string
	trust       string
	installedAt string
	syncedAt    string
	scope       string
	blueprints  []string
	states      []string
	warnings    []string
	errors      []string
}

func agentBlueprintSourceSummaries(blueprints []gact.AgentBlueprintDefinition) ([]*agentBlueprintSourceSummary, map[string][]gact.AgentBlueprintDefinition) {
	byKey := map[string]*agentBlueprintSourceSummary{}
	groups := map[string][]gact.AgentBlueprintDefinition{}
	for _, blueprint := range blueprints {
		key := agentBlueprintSourceKey(blueprint)
		if key == "" {
			continue
		}
		install := agentBlueprintInstallMetadata(blueprint)
		source := firstNonEmpty(stringValue(install["source"]), stringValue(install["url"]), stringValue(install["path"]))
		kind := firstNonEmpty(stringValue(install["source_kind"]), stringValue(install["kind"]), "source")
		ref := stringValue(install["ref"])
		summary := byKey[key]
		if summary == nil {
			summary = &agentBlueprintSourceSummary{
				key:         key,
				source:      source,
				kind:        kind,
				ref:         ref,
				commit:      stringValue(install["commit"]),
				checksum:    stringValue(install["checksum"]),
				status:      stringValue(install["status"]),
				statusMsg:   firstNonEmpty(stringValue(install["status_message"]), stringValue(install["message"])),
				trust:       firstNonEmpty(stringValue(install["trust"]), stringValue(install["trust_policy"])),
				installedAt: stringValue(install["installed_at"]),
				syncedAt:    firstNonEmpty(stringValue(install["last_sync"]), stringValue(install["last_synced_at"]), stringValue(install["synced_at"])),
				scope:       firstNonEmpty(stringValue(install["scope"]), blueprint.Scope),
			}
			byKey[key] = summary
		}
		groups[key] = append(groups[key], blueprint)
		blueprintName := firstNonEmpty(blueprint.Title, blueprint.ID)
		summary.blueprints = append(summary.blueprints, blueprintName)
		if state := agentBlueprintMarketplaceState(blueprint); state != "" {
			summary.states = appendUniqueStrings(summary.states, blueprintName+" ("+state+")")
		}
		if scope := firstNonEmpty(stringValue(install["scope"]), blueprint.Scope); scope != "" {
			summary.scope = strings.Join(appendUniqueStrings(splitCommaList(summary.scope), scope), ", ")
		}
		summary.warnings = appendUniqueStrings(summary.warnings, stringListFromAny(install["warnings"])...)
		summary.warnings = appendUniqueStrings(summary.warnings, stringListFromAny(install["validation_warnings"])...)
		summary.errors = appendUniqueStrings(summary.errors, stringListFromAny(install["errors"])...)
		summary.errors = appendUniqueStrings(summary.errors, stringListFromAny(install["validation_errors"])...)
		if errText := firstNonEmpty(stringValue(install["error"]), stringValue(install["last_error"])); errText != "" {
			summary.errors = appendUniqueStrings(summary.errors, errText)
		}
		if len(blueprint.ValidationErrors) > 0 {
			summary.errors = appendUniqueStrings(summary.errors, blueprint.ID+": "+strings.Join(blueprint.ValidationErrors, "; "))
		}
		if len(blueprint.ValidationWarnings) > 0 {
			summary.warnings = appendUniqueStrings(summary.warnings, blueprint.ID+": "+strings.Join(blueprint.ValidationWarnings, "; "))
		}
	}
	keys := make([]string, 0, len(byKey))
	for key := range byKey {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	summaries := make([]*agentBlueprintSourceSummary, 0, len(keys))
	for _, key := range keys {
		summary := byKey[key]
		sort.Strings(summary.blueprints)
		sort.Strings(summary.states)
		summaries = append(summaries, summary)
	}
	return summaries, groups
}

func agentBlueprintSourceKey(blueprint gact.AgentBlueprintDefinition) string {
	install := agentBlueprintInstallMetadata(blueprint)
	source := firstNonEmpty(stringValue(install["source"]), stringValue(install["url"]), stringValue(install["path"]))
	if source == "" {
		return ""
	}
	kind := firstNonEmpty(stringValue(install["source_kind"]), stringValue(install["kind"]), "source")
	ref := stringValue(install["ref"])
	return strings.Join([]string{kind, source, ref}, "\x00")
}
