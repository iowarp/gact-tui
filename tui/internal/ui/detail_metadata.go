package ui

// detail_metadata.go computes the remaining (unhandled) part metadata and route-source label for detail views.

import "github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"

func detailMetadataRemainder(p gact.Part) map[string]any {
	if len(p.Metadata) == 0 {
		return nil
	}
	used := map[string]bool{}
	used["partial_after_error"] = true
	if promotedEvidenceLabel(p) != "" {
		used["synthetic_from"] = true
	}
	switch p.Type {
	case gact.PartTypeRoutingDecision:
		for _, key := range []string{
			"route_source",
			"selected_agent",
		} {
			used[key] = true
		}
	case gact.PartTypeToolResult:
		used["raw_result"] = true
	case gact.PartTypeThinking:
	case gact.PartTypeExpertHandoff:
		for _, key := range []string{
			"agent_id",
			"parent_id",
			"parent",
			"expert",
			"status",
			"stage",
			"dispatch_target",
			"duration_ms",
			"input_summary",
			"output_summary",
			"summary",
		} {
			used[key] = true
		}
	case gact.PartTypeCompaction:
		used["synthetic_from"] = true
		used["synthetic"] = true
	case partTypeRuntimeProvenance:
		used["synthetic_from"] = true
		used["runtime_provenance"] = true
	}
	remaining := map[string]any{}
	for key, value := range p.Metadata {
		if used[key] || value == nil {
			continue
		}
		remaining[key] = value
	}
	if len(remaining) == 0 {
		return nil
	}
	return remaining
}

func routeSourceLabel(p gact.Part) string {
	if p.Heuristic {
		return "heuristic"
	}
	if source, ok := p.Metadata["route_source"].(string); ok && source != "" {
		return source
	}
	return "LM-routed"
}
