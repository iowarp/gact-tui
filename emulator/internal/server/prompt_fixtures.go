package server

import "github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"

func staticPromptDefinitions() map[string]gact.PromptDefinition {
	def := func(id, title, desc, text string, profiles ...string) gact.PromptDefinition {
		if len(profiles) == 0 {
			profiles = []string{"default"}
		}
		ps := make(map[string]gact.PromptProfile, len(profiles))
		for _, profile := range profiles {
			body := text
			if profile != "default" {
				body += "\n\nProfile: " + profile + " keeps the same grounded CLIO behavior with profile-specific latency and detail tradeoffs."
			}
			ps[profile] = gact.PromptProfile{
				Name:     profile,
				Text:     body,
				Scope:    "builtin",
				Checksum: promptChecksum(body),
				Metadata: map[string]any{"behavior_profile": profile, "prompt_family": id},
			}
		}
		return gact.PromptDefinition{
			ID:             id,
			Title:          title,
			Description:    desc,
			DefaultProfile: "default",
			Profiles:       ps,
			Scope:          "builtin",
			Enabled:        true,
			Metadata: map[string]any{
				"source":       "emulator",
				"alignment":    "visual_loop",
				"profiles":     profiles,
				"requirements": []string{"declared capabilities only", "visible provenance", "no hidden fallback"},
			},
		}
	}
	rows := []gact.PromptDefinition{
		def("clio.chat", "Chat agent", "General CLIO conversation prompt.", "Handle ordinary conversation without inventing file-specific facts. Ask a structured follow-up question when user intent is underspecified.", "default", "light", "debug"),
		def("clio.main.planner", "Main planner", "Routes work to declared tools and experts.", "Return only the required planner schema. Choose only declared tools and experts. Surface unsupported capability gaps honestly.", "default", "heavy", "small_model"),
		def("clio.expert.data", "Data expert", "Data-format, storage, NDP catalog, and discovery scope.", "Use data-format tools as source of truth. Preserve exact paths, dataset ids, shapes, compression, and caveats.", "default", "heavy"),
	}
	out := make(map[string]gact.PromptDefinition, len(rows))
	for _, row := range rows {
		out[row.ID] = row
	}
	return out
}

func staticPromptStressDefinitions() map[string]gact.PromptDefinition {
	profile := func(name, scope, provider, model, text, source string, metadata map[string]any) gact.PromptProfile {
		return gact.PromptProfile{
			Name:       name,
			Text:       text,
			Scope:      scope,
			Provider:   provider,
			Model:      model,
			SourcePath: source,
			Checksum:   promptChecksum(text),
			Metadata:   metadata,
		}
	}
	return map[string]gact.PromptDefinition{
		"workspace.seismic.main": {
			ID:             "workspace.seismic.main",
			Title:          "Seismic blueprint orchestrator",
			Description:    "Packaged prompt from the active seismic waveform blueprint.",
			DefaultProfile: "heavy",
			Scope:          "workspace",
			SourcePath:     "/workspace/.clio/agent-blueprints/seismic-waveform-review/experts/main.md",
			Enabled:        true,
			Profiles: map[string]gact.PromptProfile{
				"heavy": profile("heavy", "workspace", "argonne_sophia", "openai/gpt-oss-120b",
					"Resolve San Diego geography, delegate NDP and EarthScope discovery, and require SAC visualization before final answer.",
					"/workspace/.clio/agent-blueprints/seismic-waveform-review/experts/main.md",
					map[string]any{"blueprint_id": "seismic-waveform-review", "agent_id": "main", "prompt_family": "benchmark"}),
				"small": profile("small", "workspace", "argonne_sophia", "openai/gpt-oss-20b",
					"Use the compact seismic routing profile and preserve artifact paths.",
					"/workspace/.clio/agent-blueprints/seismic-waveform-review/experts/main.small.md",
					map[string]any{"blueprint_id": "seismic-waveform-review", "agent_id": "main", "prompt_family": "benchmark"}),
			},
			Metadata: map[string]any{
				"blueprint_id": "seismic-waveform-review",
				"agent_id":     "main",
				"provider":     "argonne_sophia",
			},
		},
		"session.nws.warning": {
			ID:             "session.nws.warning",
			Title:          "NWS warning session override",
			Description:    "Session prompt override for the California NWS warning benchmark case.",
			DefaultProfile: "codex",
			Scope:          "session",
			SourcePath:     "session://prompt-overrides/session.nws.warning/codex.md",
			Enabled:        true,
			Profiles: map[string]gact.PromptProfile{
				"codex": profile("codex", "session", "argonne_sophia", "openai/gpt-oss-120b",
					"Normalize warning timestamps to ISO strings and keep source URLs in the compact JSON artifact.",
					"session://prompt-overrides/session.nws.warning/codex.md",
					map[string]any{"prompt_profile": "codex", "session_id": "ses_seed_ws_default_1"}),
			},
			Metadata: map[string]any{"session_id": "ses_seed_ws_default_1", "artifact": "california_nws_warnings.json"},
		},
		"workspace.invalid.placeholder": {
			ID:             "workspace.invalid.placeholder",
			Title:          "Invalid placeholder diagnostic",
			Description:    "Invalid prompt kept visible so operators can inspect validation errors before demo.",
			DefaultProfile: "default",
			Scope:          "workspace",
			SourcePath:     "/workspace/.clio/prompts/invalid-placeholder.md",
			Enabled:        false,
			ValidationErrors: []string{
				"unknown placeholder: {{missing_dataset_id}}",
				"requires active blueprint variable: agent.root_id",
			},
			Profiles: map[string]gact.PromptProfile{
				"default": profile("default", "workspace", "argonne_metis", "gpt-oss-120b",
					"Use {{missing_dataset_id}} before it is defined.",
					"/workspace/.clio/prompts/invalid-placeholder.md",
					map[string]any{"validation_state": "invalid"}),
			},
			Metadata: map[string]any{"validation_state": "invalid", "source": "workspace"},
		},
	}
}
