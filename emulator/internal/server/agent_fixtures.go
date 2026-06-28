package server

import "github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"

func staticAgents(emptySkills bool) []gact.AgentDef {
	agents := []gact.AgentDef{
		{
			ID: "default", Source: "builtin", Title: "Default Agent",
			Description:  "General-purpose coding agent with full tool access.",
			DefaultModel: &gact.ModelRef{ProviderID: "anthropic", ModelID: "claude-opus-4-7"},
			Tools:        []string{"bash", "read_file", "edit_file", "web_search"},
			Enabled:      true,
		},
		{
			ID: "code_reviewer", Source: "builtin", Title: "Code Reviewer",
			Description:  "Reviews diffs without modifying files. Read-only.",
			DefaultModel: &gact.ModelRef{ProviderID: "anthropic", ModelID: "claude-sonnet-4-6"},
			Tools:        []string{"read_file"},
			ParentID:     "code_expert",
			Enabled:      true,
		},
		// v0.2 — SPEC §4.3.1: three tier-2 specialists wired with
		// tier/specialization/keywords so clients can exercise the
		// multi-tier agent catalog without a CLIO backend handy.
		// Names stay generic (code / research / data) — not domain-
		// specific.
		{
			ID: "code_expert", Source: "builtin", Title: "Code Expert",
			Description:    "Source-level editing, review, refactoring.",
			DefaultModel:   &gact.ModelRef{ProviderID: "anthropic", ModelID: "claude-sonnet-4-6"},
			Tools:          []string{"read_file", "edit_file", "grep"},
			ParentID:       "default",
			Tier:           2,
			Specialization: "code_editing",
			Keywords:       []string{"edit", "refactor", "fix", "review", "patch"},
			Enabled:        true,
		},
		{
			ID: "research_expert", Source: "builtin", Title: "Research Expert",
			Description:    "Web search + document retrieval + synthesis.",
			DefaultModel:   &gact.ModelRef{ProviderID: "anthropic", ModelID: "claude-sonnet-4-6"},
			Tools:          []string{"web_search", "read_file"},
			ParentID:       "default",
			Tier:           2,
			Specialization: "knowledge_retrieval",
			Keywords:       []string{"search", "find", "look up", "research", "citations"},
			Enabled:        true,
		},
		{
			ID: "data_expert", Source: "builtin", Title: "Data Expert",
			Description:    "Profile and analyse structured data files.",
			DefaultModel:   &gact.ModelRef{ProviderID: "anthropic", ModelID: "claude-sonnet-4-6"},
			Tools:          []string{"read_file", "bash"},
			ParentID:       "default",
			Tier:           2,
			Specialization: "data_analysis",
			Keywords:       []string{"analyze", "profile", "inspect", "data", "csv", "parquet"},
			Enabled:        true,
		},
	}
	if emptySkills {
		return agents
	}
	// Two skill-source agents so the /skills catalog browser has real data to
	// render (LLL3). Per SPEC §6.5 line 807, skills are agents with
	// source="skill"; --empty-skills suppresses only this operator catalog.
	return append(agents,
		gact.AgentDef{
			ID: "test_writer", Source: "skill", Title: "Test Writer",
			Description:  "Writes table-driven Go tests for a target package.",
			DefaultModel: &gact.ModelRef{ProviderID: "anthropic", ModelID: "claude-sonnet-4-6"},
			Tools:        []string{"read_file", "edit_file"},
			Enabled:      true,
		},
		gact.AgentDef{
			ID: "release_notes", Source: "skill", Title: "Release Notes",
			Description:  "Summarizes git diffs since a tag into changelog entries.",
			DefaultModel: &gact.ModelRef{ProviderID: "anthropic", ModelID: "claude-haiku-4-5"},
			Tools:        []string{"bash", "read_file"},
			Enabled:      true,
		},
	)
}

func staticAgentStressDefinitions() []gact.AgentDef {
	model := func(name string) *gact.ModelRef {
		return &gact.ModelRef{ProviderID: "argonne_sophia", ModelID: name}
	}
	routeMeta := func(routes ...string) map[string]any {
		return map[string]any{
			"routes_to":      routes,
			"source_path":    "/workspace/.clio/agents/stress/AGENT.md",
			"storage_scope":  "workspace",
			"visual_fixture": "agent-stress",
		}
	}
	return []gact.AgentDef{
		{
			ID: "clio-live-benchmark-orchestrator-with-long-routing-title", Source: "recipe",
			Title:          "CLIO Live Benchmark Orchestrator With Long Routing Title",
			Description:    "Routes NDP, EarthScope, weather, warning, and visualization demo workflows while keeping operators aware of expert responsibility.",
			DefaultModel:   model("openai/gpt-oss-120b"),
			Tier:           1,
			Specialization: "workflow_orchestration",
			Tools:          []string{"ndp_search_datasets", "delegate_expert", "artifact_manifest"},
			Keywords:       []string{"benchmark", "ndp", "earthscope", "demo"},
			Commands:       []string{"/benchmark-san-diego", "/benchmark-wildfire", "/benchmark-cimis"},
			Enabled:        true,
			Metadata:       routeMeta("geo_region_resolver", "earthscope_catalog_expert", "california_warning_normalizer", "cimis_weather_profiler"),
		},
		{
			ID: "geo_region_resolver", Source: "recipe", Title: "Geographic Region Resolver",
			Description:    "Normalizes place names, bounding boxes, and nearby seismic station context before catalog discovery.",
			ParentID:       "clio-live-benchmark-orchestrator-with-long-routing-title",
			DefaultModel:   model("openai/gpt-oss-20b"),
			Tier:           2,
			Specialization: "geospatial_resolution",
			Tools:          []string{"geocode_location", "ndp_search_datasets"},
			Keywords:       []string{"region", "bbox", "station"},
			Enabled:        true,
			Metadata:       routeMeta("earthscope_catalog_expert", "california_warning_normalizer"),
		},
		{
			ID: "earthscope_catalog_expert", Source: "recipe", Title: "EarthScope Catalog Expert",
			Description:    "Discovers waveform candidates, station channels, and SAC trace staging options.",
			ParentID:       "geo_region_resolver",
			DefaultModel:   model("openai/gpt-oss-120b"),
			Tier:           3,
			Specialization: "earthscope_catalog",
			Tools:          []string{"sac_discover_earthscope_region_waveform", "sac_inspect_archive", "sac_compute_trace_statistics"},
			Skills:         []string{"seismic-waveform-review"},
			Enabled:        true,
			Metadata:       routeMeta("sac_trace_quality_reviewer", "waveform_visualization_publisher"),
		},
		{
			ID: "sac_trace_quality_reviewer", Source: "recipe", Title: "SAC Trace Quality Reviewer",
			Description:    "Checks SAC headers, sample counts, basic statistics, and operator-readable trace evidence.",
			ParentID:       "earthscope_catalog_expert",
			DefaultModel:   model("openai/gpt-oss-20b"),
			Tier:           4,
			Specialization: "seismic_analysis",
			Tools:          []string{"sac_inspect_archive", "sac_compute_trace_statistics"},
			Keywords:       []string{"sac", "trace", "statistics"},
			Enabled:        true,
			Metadata:       routeMeta("waveform_visualization_publisher"),
		},
		{
			ID: "waveform_visualization_publisher", Source: "recipe", Title: "Waveform Visualization Publisher",
			Description:    "Publishes discussion-ready SAC waveform plots and verifies the artifact path is visible to the operator.",
			ParentID:       "sac_trace_quality_reviewer",
			DefaultModel:   model("openai/gpt-oss-20b"),
			Tier:           5,
			Specialization: "visualization",
			Tools:          []string{"sac_plot_traces", "artifact_manifest"},
			Enabled:        true,
			Metadata:       routeMeta(),
		},
		{
			ID: "california_warning_normalizer", Source: "recipe", Title: "California Warning Normalizer",
			Description:    "Converts live National Weather Service warning epochs to ISO timestamps and compact JSON evidence.",
			ParentID:       "clio-live-benchmark-orchestrator-with-long-routing-title",
			DefaultModel:   model("openai/gpt-oss-20b"),
			Tier:           2,
			Specialization: "weather_warnings",
			Tools:          []string{"ndp_search_datasets", "arcgis_query_features", "json_normalize_timestamps"},
			Enabled:        true,
			Metadata:       routeMeta("warning_artifact_reviewer"),
		},
		{
			ID: "warning_artifact_reviewer", Source: "recipe", Title: "Warning Artifact Reviewer",
			Description:    "Validates warning count, affected areas, ISO timestamps, and JSON artifact readability.",
			ParentID:       "california_warning_normalizer",
			DefaultModel:   model("openai/gpt-oss-20b"),
			Tier:           3,
			Specialization: "artifact_review",
			Tools:          []string{"read_file", "json_schema_validate"},
			Enabled:        true,
			Metadata:       routeMeta(),
		},
		{
			ID: "cimis_weather_profiler", Source: "recipe", Title: "Fresno CIMIS Weather Profiler",
			Description:    "Profiles temperature, humidity, wind fields, and plot-ready weather timeseries from staged CIMIS data.",
			ParentID:       "clio-live-benchmark-orchestrator-with-long-routing-title",
			DefaultModel:   model("openai/gpt-oss-20b"),
			Tier:           2,
			Specialization: "weather_profile",
			Tools:          []string{"ndp_stage_resource", "csv_profile_columns", "plot_weather_timeseries"},
			ValidationWarnings: []string{
				"station feed freshness must be checked before demo",
			},
			Enabled:  true,
			Metadata: routeMeta("weather_plot_publisher"),
		},
		{
			ID: "weather_plot_publisher", Source: "recipe", Title: "Weather Plot Publisher",
			Description:    "Produces the final Fresno CIMIS visualization and stores artifact provenance.",
			ParentID:       "cimis_weather_profiler",
			DefaultModel:   model("openai/gpt-oss-20b"),
			Tier:           3,
			Specialization: "visualization",
			Tools:          []string{"plot_weather_timeseries", "artifact_manifest"},
			Enabled:        true,
			Metadata:       routeMeta(),
		},
		{
			ID: "fragile-user-expert", Source: "user", Title: "Fragile User Expert",
			Description:  "User-owned fixture for edit/delete failure handling in the TUI.",
			SystemPrompt: "Keep this expert visible so write failures can be inspected without modifying real CLIO state.",
			Tools:        []string{"read_file", "ndp_search_datasets"},
			Keywords:     []string{"failure", "write", "demo"},
			Enabled:      true,
			Metadata: map[string]any{
				"storage_scope":  "workspace",
				"source_path":    "/workspace/.clio/agents/fragile-user-expert.md",
				"visual_fixture": "agent-failures",
			},
		},
		{
			ID: "invalid-disabled-demo-expert", Source: "recipe", Title: "Invalid Disabled Demo Expert",
			Description: "Disabled recipe with validation errors so the agent catalog can prove visible invalid states.",
			ValidationErrors: []string{
				"missing required tool: ndp_stage_resource",
				"parent agent not installed: missing_parent",
			},
			Enabled:  false,
			Metadata: map[string]any{"visual_fixture": "agent-stress"},
		},
	}
}
