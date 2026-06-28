package server

import (
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func staticAgentBlueprints() []gact.AgentBlueprintDefinition {
	return []gact.AgentBlueprintDefinition{{
		ID:             "data-exploration",
		Version:        "1.0.0",
		Title:          "Data Exploration",
		Description:    "Markdown agent blueprint with a root data expert and optional MCP descriptor.",
		Scope:          "builtin",
		Root:           "/opt/clio/agent_blueprints/data-exploration",
		RootPath:       "/opt/clio/agent_blueprints/data-exploration/AGENT.md",
		DefinitionPath: "/opt/clio/agent_blueprints/data-exploration/AGENT.md",
		RootExpert:     "data",
		Enabled:        true,
		Defaults:       map[string]any{"prompt_profile": "heavy"},
		Metadata:       map[string]any{"layout": "agent_blueprint"},
	}, {
		ID:             "seismic-market",
		Version:        "1.2.0",
		Title:          "Seismic Marketplace",
		Description:    "Community marketplace Agent Blueprint for seismic waveform review.",
		Scope:          "workspace",
		Root:           "/workspace/.clio/agent-blueprints/seismic-market",
		RootPath:       "/workspace/.clio/agent-blueprints/seismic-market/AGENT.md",
		DefinitionPath: "/workspace/.clio/agent-blueprints/seismic-market/AGENT.md",
		RootExpert:     "orchestrator",
		Enabled:        true,
		Metadata: map[string]any{"install": map[string]any{
			"source":       "https://example.org/community/seismic-agents.git",
			"source_kind":  "git",
			"ref":          "main",
			"commit":       "0123456789abcdef",
			"checksum":     "abcdef0123456789",
			"installed_at": "2026-06-02T20:00:00Z",
			"scope":        "workspace",
		}},
	}, {
		ID:               "broken-blueprint",
		Version:          "0.1.0",
		Title:            "Broken Blueprint",
		Scope:            "workspace",
		Root:             "/workspace/.clio/agent-blueprints/broken-blueprint",
		RootPath:         "/workspace/.clio/agent-blueprints/broken-blueprint/AGENT.md",
		DefinitionPath:   "/workspace/.clio/agent-blueprints/broken-blueprint/AGENT.md",
		RootExpert:       "missing",
		Enabled:          false,
		ValidationErrors: []string{"root_expert not found: missing"},
	}}
}

const longAgentBlueprintID = "san-diego-earthscope-and-ndp-live-benchmark-review-with-very-long-name"

func (s *Server) agentBlueprints() []gact.AgentBlueprintDefinition {
	rows := staticAgentBlueprints()
	if s != nil && s.cfg.LongAgentBlueprints {
		rows = append(rows, staticLongAgentBlueprints()...)
	}
	return rows
}

func staticAgentBlueprintSources() []gact.AgentBlueprintSource {
	return []gact.AgentBlueprintSource{{
		ID:           "data-semantics-agents",
		Name:         "Data Semantics Agents",
		Source:       "git@github.com:example/data-semantics-agents.git",
		Ref:          "main",
		PinnedCommit: "0123456789abcdef",
		SourceKind:   "git",
		Status:       "ready",
		Commit:       "0123456789abcdef",
		AddedAt:      "2026-06-02T20:00:00Z",
		UpdatedAt:    "2026-06-04T12:00:00Z",
		AvailableBlueprints: []gact.AgentBlueprintDefinition{{
			ID:          "seismic-waveform-review",
			Version:     "0.1.0",
			Title:       "Seismic Waveform Review",
			Description: "Geospatial and EarthScope waveform review graph for the San Diego NDP demo.",
			Scope:       "marketplace",
			RootExpert:  "orchestrator",
			Enabled:     true,
		}, {
			ID:          "wildfire-feature-review",
			Version:     "0.1.0",
			Title:       "Wildfire Feature Review",
			Description: "NDP and ArcGIS feature workflow for current California wildfire records.",
			Scope:       "marketplace",
			RootExpert:  "orchestrator",
			Enabled:     true,
		}},
	}}
}

func (s *Server) agentBlueprintSources() []gact.AgentBlueprintSource {
	rows := staticAgentBlueprintSources()
	if s != nil && s.cfg.LongAgentBlueprints {
		rows = append(rows, staticLongAgentBlueprintSources()...)
	}
	if s != nil {
		s.blueprintMu.Lock()
		rows = append(rows, s.blueprintSources...)
		s.blueprintMu.Unlock()
	}
	return rows
}

func sourceRegistryID(source string, ref string) string {
	base := sourceDisplayName(source)
	base = strings.ToLower(base)
	base = strings.TrimSuffix(base, ".git")
	base = strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z':
			return r
		case r >= '0' && r <= '9':
			return r
		case r == '-' || r == '_':
			return '-'
		default:
			return '-'
		}
	}, base)
	base = strings.Trim(base, "-")
	if base == "" {
		base = "source"
	}
	if ref = strings.TrimSpace(ref); ref != "" {
		base += "-" + strings.ToLower(strings.ReplaceAll(ref, "/", "-"))
	}
	return base
}

func sourceKind(source string) string {
	switch {
	case strings.HasPrefix(source, "git@"), strings.HasPrefix(source, "http://"), strings.HasPrefix(source, "https://"):
		return "git"
	case strings.HasPrefix(source, "/"), strings.HasPrefix(source, "."):
		return "path"
	default:
		return "source"
	}
}

func sourceDisplayName(source string) string {
	source = strings.TrimSpace(source)
	if source == "" {
		return "Marketplace source"
	}
	source = strings.TrimSuffix(source, "/")
	source = strings.TrimSuffix(source, ".git")
	if idx := strings.LastIndexAny(source, "/:"); idx >= 0 && idx < len(source)-1 {
		return source[idx+1:]
	}
	return source
}

func staticAgentBlueprintAgents(blueprintID string) []gact.AgentDef {
	return []gact.AgentDef{{
		ID:          "data",
		Title:       "Data Root",
		Description: "Routes data exploration tasks to blueprint specialists.",
		Source:      "agent_blueprint",
		Enabled:     true,
		Tier:        1,
		Tools:       []string{"mcp.parquet.read", "mcp.adios.inspect"},
		Commands:    []string{"/validate-dataset"},
		Metadata: map[string]any{
			"agent_blueprint_id":          blueprintID,
			"agent_blueprint_root_expert": "data",
		},
	}, {
		ID:          "variant",
		Title:       "Variant Expert",
		Description: "Specialist child expert from the markdown blueprint.",
		Source:      "agent_blueprint",
		Enabled:     true,
		ParentID:    "data",
		Tier:        2,
		Tools:       []string{"mcp.parquet.read"},
		Metadata:    map[string]any{"agent_blueprint_id": blueprintID},
	}}
}

func staticLongAgentBlueprintAgents(blueprintID string) []gact.AgentDef {
	meta := func() map[string]any {
		return map[string]any{"agent_blueprint_id": blueprintID}
	}
	return []gact.AgentDef{{
		ID:             "orchestrator",
		Title:          "San Diego Demo Orchestrator With Long Routing Context",
		Description:    "Routes benchmark work across geospatial, catalog, waveform analysis, and visualization experts.",
		Source:         "agent_blueprint",
		Enabled:        true,
		Tier:           1,
		Specialization: "workflow_orchestration",
		Tools:          []string{"ndp_search_datasets"},
		Commands:       []string{"/run-san-diego-demo"},
		Metadata:       meta(),
	}, {
		ID:             "geospatial",
		Title:          "Geospatial Region Resolver For Southern California",
		ParentID:       "orchestrator",
		Description:    "Resolves the San Diego geography and bounding query context.",
		Source:         "agent_blueprint",
		Enabled:        true,
		Tier:           2,
		Specialization: "geospatial",
		Tools:          []string{"ndp_search_datasets", "arcgis_query_features"},
		Metadata:       meta(),
	}, {
		ID:             "earthscope_catalog",
		Title:          "EarthScope Catalog Discovery Specialist",
		ParentID:       "geospatial",
		Description:    "Finds public EarthScope station and waveform evidence.",
		Source:         "agent_blueprint",
		Enabled:        true,
		Tier:           3,
		Specialization: "waveform_catalog",
		Tools:          []string{"sac_discover_earthscope_region_waveform", "sac_inspect_archive"},
		Metadata:       meta(),
	}, {
		ID:             "seismic_analysis",
		Title:          "SAC Trace Analysis Specialist With Long Name",
		ParentID:       "earthscope_catalog",
		Description:    "Computes SAC statistics and station trace inspection output.",
		Source:         "agent_blueprint",
		Enabled:        true,
		Tier:           4,
		Specialization: "seismic_analysis",
		Tools:          []string{"sac_compute_trace_statistics", "sac_inspect_archive"},
		Metadata:       meta(),
	}, {
		ID:                 "visualization",
		Title:              "Waveform Visualization And Artifact Publisher",
		ParentID:           "seismic_analysis",
		Description:        "Publishes waveform plots for the live benchmark discussion.",
		Source:             "agent_blueprint",
		Enabled:            true,
		Tier:               5,
		Specialization:     "visualization",
		Tools:              []string{"sac_plot_traces"},
		ValidationWarnings: []string{"falls back to static plot style when display backend is unavailable"},
		Metadata:           meta(),
	}}
}

func staticAgentBlueprintMCPDescriptors(blueprintID string) []map[string]any {
	return []map[string]any{{
		"id":                 "earthscope",
		"name":               "EarthScope MCP",
		"transport":          "stdio",
		"command":            "earthscope-mcp",
		"args":               []any{"serve"},
		"enabled":            false,
		"status":             "disabled",
		"source":             "agent_blueprint",
		"agent_blueprint_id": blueprintID,
	}}
}

func staticAgentBlueprintHookDescriptors(blueprintID string) []map[string]any {
	return []map[string]any{{
		"id":                 "pre_message",
		"name":               "pre_message",
		"title":              "Pre Message",
		"event":              "pre_message",
		"enabled":            false,
		"status":             "disabled",
		"source":             "agent_blueprint",
		"scope":              "workspace",
		"agent_blueprint_id": blueprintID,
		"definition_path":    "/opt/clio/agent_blueprints/data-exploration/hooks/pre_message.py",
		"checksum":           "0123456789abcdef",
		"trust": map[string]any{
			"policy":  "explicit",
			"trusted": false,
		},
		"validation_warnings": []any{"Blueprint packaged hooks are disabled until explicitly enabled and trusted"},
	}}
}

func stringFromAny(v any) string {
	if value, ok := v.(string); ok {
		return value
	}
	return ""
}

func mapFromAny(v any) map[string]any {
	if value, ok := v.(map[string]any); ok {
		return value
	}
	return nil
}
