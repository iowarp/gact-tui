package server

import "github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"

func staticLongAgentBlueprints() []gact.AgentBlueprintDefinition {
	install := func(source, status string) map[string]any {
		return map[string]any{"install": map[string]any{
			"source":         source,
			"source_kind":    "git",
			"ref":            "main",
			"commit":         "fedcba98765432100123456789abcdef",
			"checksum":       "abcdef9876543210",
			"installed_at":   "2026-06-05T14:00:00Z",
			"last_synced_at": "2026-06-06T08:30:00Z",
			"scope":          "workspace",
			"status":         status,
			"trust":          "explicit",
		}}
	}
	return []gact.AgentBlueprintDefinition{{
		ID:             longAgentBlueprintID,
		Version:        "0.9.0",
		Title:          "San Diego EarthScope and NDP Live Benchmark Review With Very Long Name",
		Description:    "Stress fixture for long marketplace titles, active markers, and nested seismic workflow experts.",
		Scope:          "workspace",
		Root:           "/workspace/.clio/agent-blueprints/san-diego-earthscope-long",
		RootPath:       "/workspace/.clio/agent-blueprints/san-diego-earthscope-long/AGENT.md",
		DefinitionPath: "/workspace/.clio/agent-blueprints/san-diego-earthscope-long/AGENT.md",
		RootExpert:     "orchestrator",
		Enabled:        true,
		Metadata:       install("https://aaa.example.org/clio-marketplace/earthscope-and-ndp-demo-blueprints-with-a-very-long-source-name.git", "installed"),
	}, {
		ID:          "california-wildfire-current-features-review-and-map-ready-summary",
		Version:     "0.9.0",
		Title:       "California Wildfire Current Features Review And Map Ready Summary",
		Description: "Long source group sibling used to prove source grouping and tree prefix rendering.",
		Scope:       "workspace",
		RootExpert:  "orchestrator",
		Enabled:     true,
		Metadata:    install("https://aaa.example.org/clio-marketplace/earthscope-and-ndp-demo-blueprints-with-a-very-long-source-name.git", "update_available"),
	}, {
		ID:                 "disabled-benchmark-blueprint-with-long-title",
		Version:            "0.8.0",
		Title:              "Disabled Benchmark Blueprint With Long Title And Missing Optional Tools",
		Description:        "Disabled fixture used to prove activation blocked and narrow truncation behavior.",
		Scope:              "workspace",
		RootExpert:         "orchestrator",
		Enabled:            false,
		ValidationWarnings: []string{"optional visualization package is not installed"},
		Metadata:           install("https://example.org/clio-marketplace/disabled-blueprints-with-long-names.git", "disabled"),
	}, {
		ID:          "california-nws-warning-normalization-and-advisory-review",
		Version:     "0.9.0",
		Title:       "California NWS Warning Normalization And Advisory Review",
		Description: "Second source fixture for source grouping pressure.",
		Scope:       "workspace",
		RootExpert:  "orchestrator",
		Enabled:     true,
		Metadata:    install("https://example.org/clio-marketplace/weather-and-nws-review-blueprints.git", "installed"),
	}, {
		ID:          "fresno-cimis-hourly-weather-profile-and-visualization",
		Version:     "0.9.0",
		Title:       "Fresno CIMIS Hourly Weather Profile And Visualization",
		Description: "Third source fixture for source grouping pressure.",
		Scope:       "workspace",
		RootExpert:  "orchestrator",
		Enabled:     true,
		Metadata:    install("https://example.org/clio-marketplace/weather-and-nws-review-blueprints.git", "installed"),
	}, {
		ID:          "local-lab-blueprint-with-extremely-specific-scratch-analysis-name",
		Version:     "0.1.0",
		Title:       "Local Lab Blueprint With Extremely Specific Scratch Analysis Name",
		Description: "Local path source fixture for long source names.",
		Scope:       "workspace",
		RootExpert:  "main",
		Enabled:     true,
		Metadata:    map[string]any{"install": map[string]any{"source": "/workspace/.clio/agent-blueprints/local-lab-blueprint-with-extremely-specific-scratch-analysis-name", "source_kind": "path", "status": "installed", "scope": "workspace", "trust": "explicit"}},
	}}
}

func staticLongAgentBlueprintSources() []gact.AgentBlueprintSource {
	return []gact.AgentBlueprintSource{{
		ID:           "earthscope-ndp-long-source",
		Name:         "EarthScope NDP Demo Marketplace Source With A Very Long Human Name",
		Source:       "https://aaa.example.org/clio-marketplace/earthscope-and-ndp-demo-blueprints-with-a-very-long-source-name.git",
		Ref:          "main",
		PinnedCommit: "fedcba98765432100123456789abcdef",
		SourceKind:   "git",
		Status:       "ready",
		Commit:       "fedcba98765432100123456789abcdef",
		AddedAt:      "2026-06-05T14:00:00Z",
		UpdatedAt:    "2026-06-06T08:30:00Z",
		AvailableBlueprints: []gact.AgentBlueprintDefinition{{
			ID:          longAgentBlueprintID,
			Version:     "0.9.0",
			Title:       "San Diego EarthScope and NDP Live Benchmark Review With Very Long Name",
			Description: "Geospatial, EarthScope, SAC, and visualization workflow for the San Diego live demo.",
			Scope:       "marketplace",
			RootExpert:  "orchestrator",
			Enabled:     true,
		}, {
			ID:          "california-wildfire-current-features-review-and-map-ready-summary",
			Version:     "0.9.0",
			Title:       "California Wildfire Current Features Review And Map Ready Summary",
			Description: "Current wildfire feature workflow.",
			Scope:       "marketplace",
			RootExpert:  "orchestrator",
			Enabled:     true,
		}},
	}, {
		ID:         "weather-long-source",
		Name:       "Weather And NWS Advisory Marketplace Source With Long Branch Metadata",
		Source:     "https://example.org/clio-marketplace/weather-and-nws-review-blueprints.git",
		Ref:        "release/demo-2026-06-06",
		SourceKind: "git",
		Status:     "needs_refresh",
		Error:      "last refresh missed optional CIMIS station metadata",
		AddedAt:    "2026-06-05T16:00:00Z",
		UpdatedAt:  "2026-06-05T18:00:00Z",
		AvailableBlueprints: []gact.AgentBlueprintDefinition{{
			ID:         "california-nws-warning-normalization-and-advisory-review",
			Version:    "0.9.0",
			Title:      "California NWS Warning Normalization And Advisory Review",
			Scope:      "marketplace",
			RootExpert: "orchestrator",
			Enabled:    true,
		}, {
			ID:         "fresno-cimis-hourly-weather-profile-and-visualization",
			Version:    "0.9.0",
			Title:      "Fresno CIMIS Hourly Weather Profile And Visualization",
			Scope:      "marketplace",
			RootExpert: "orchestrator",
			Enabled:    true,
		}},
	}}
}
