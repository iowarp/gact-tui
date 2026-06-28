package server

import "github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"

func edgeLMProviderInfo() lmProviderInfo {
	info := staticLMProviderInfo("anthropic", "claude-opus-4-7")
	info.StatusMessage = "provider edge-state fixture"
	info.Presets = append(info.Presets, lmProviderPreset{
		ID:                  "argonne_sophia",
		Label:               "ALCF Sophia (Globus Auth)",
		Provider:            "argonne",
		APIBase:             "https://inference-api.alcf.anl.gov/resource_server/sophia/vllm/v1",
		SuggestedModel:      "openai/gpt-oss-120b",
		AuthMethod:          "oauth",
		IsAuthenticated:     false,
		Description:         "Argonne Sophia inference endpoint using Globus authentication.",
		Status:              "auth_required",
		StatusMessage:       "ALCF token expired; authenticate before loading Sophia models",
		SupportsLiveCatalog: true,
	})
	for i := range info.Presets {
		switch info.Presets[i].ID {
		case "local":
			info.Presets[i].Status = "unavailable"
			info.Presets[i].StatusMessage = "local model catalog unavailable: connection refused on 127.0.0.1:11434"
		case "openai":
			info.Presets[i].Status = "missing_key"
			info.Presets[i].StatusMessage = "OPENAI_API_KEY is not configured on the backend host"
		}
	}
	return info
}

func staticLMProviderInfo(provider, model string) lmProviderInfo {
	return lmProviderInfo{
		Configured:     true,
		Provider:       provider,
		Model:          model,
		Temperature:    0.0,
		MaxTokens:      0,
		ContextLength:  0,
		ChosenContext:  200000,
		ContextWindow:  200000,
		IsReasoning:    true,
		NativeToolCall: true,
		Transport:      "http",
		State:          "ready",
		StatusMessage:  "emulator provider catalog ready",
		Presets: []lmProviderPreset{
			{
				ID:                  "anthropic",
				Label:               "Anthropic",
				Provider:            "anthropic",
				APIBase:             "https://api.anthropic.com/v1",
				SuggestedModel:      "claude-opus-4-7",
				RequiresAPIKey:      false,
				AuthMethod:          "oauth",
				IsAuthenticated:     true,
				Description:         "Hosted Claude models with tool and thinking support.",
				Status:              "ready",
				StatusMessage:       "authenticated",
				SupportsLiveCatalog: true,
				SupportsVision:      true,
			},
			{
				ID:                  "openai",
				Label:               "OpenAI",
				Provider:            "openai",
				APIBase:             "https://api.openai.com/v1",
				SuggestedModel:      "gpt-5",
				RequiresAPIKey:      true,
				APIKeyEnv:           "OPENAI_API_KEY",
				AuthMethod:          "api_key",
				Description:         "OpenAI API models with direct API-key authentication.",
				Status:              "needs_api_key",
				StatusMessage:       "paste an API key before saving",
				SupportsLiveCatalog: true,
				SupportsVision:      true,
			},
			{
				ID:                  "local",
				Label:               "Local emulator",
				Provider:            "local",
				APIBase:             "http://127.0.0.1:11434/v1",
				SuggestedModel:      "llama3.3",
				RequiresAPIKey:      false,
				AuthMethod:          "none",
				IsAuthenticated:     true,
				Description:         "Local no-auth model endpoint for visual-loop testing.",
				Status:              "ready",
				StatusMessage:       "static emulator catalog",
				SupportsLiveCatalog: true,
			},
		},
	}
}

func staticProviders() []gact.Provider {
	return []gact.Provider{
		{ID: "anthropic", Name: "Anthropic", AuthMethods: []string{"api_key", "oauth"}, IsAuthenticated: true, DefaultModel: "claude-opus-4-7"},
		{ID: "openai", Name: "OpenAI", AuthMethods: []string{"api_key"}, IsAuthenticated: false, DefaultModel: "gpt-5"},
		{ID: "local", Name: "Local (Ollama)", AuthMethods: []string{"none"}, IsAuthenticated: true, DefaultModel: "llama3.3"},
	}
}

func staticModels() map[string][]gact.Model {
	support := func(tools, vision, think, cu, cache bool) gact.ModelSupports {
		return gact.ModelSupports{
			Tools: tools, Vision: vision, Thinking: think, ComputerUse: cu, PromptCaching: cache,
		}
	}
	return map[string][]gact.Model{
		"anthropic": {
			{ID: "claude-opus-4-7", Name: "Claude Opus 4.7", ContextWindow: 1_000_000, MaxOutputTokens: 8192,
				ChosenContext: 200_000, ContextSource: "server_default", IsReasoning: true, NativeToolCalls: true,
				Supports: support(true, true, true, true, true),
				Pricing:  &gact.ModelPricing{InputPerMTok: 15, OutputPerMTok: 75, CacheReadPerMTok: 1.5, CacheWritePerMTok: 18.75}},
			{ID: "claude-sonnet-4-6", Name: "Claude Sonnet 4.6", ContextWindow: 200_000, MaxOutputTokens: 8192,
				ChosenContext: 200_000, ContextSource: "model_limit", IsReasoning: true, NativeToolCalls: true,
				Supports: support(true, true, true, false, true),
				Pricing:  &gact.ModelPricing{InputPerMTok: 3, OutputPerMTok: 15, CacheReadPerMTok: 0.3, CacheWritePerMTok: 3.75}},
			{ID: "claude-haiku-4-5", Name: "Claude Haiku 4.5", ContextWindow: 200_000, MaxOutputTokens: 8192,
				Supports: support(true, true, false, false, true),
				Pricing:  &gact.ModelPricing{InputPerMTok: 0.8, OutputPerMTok: 4}},
		},
		"openai": {
			{ID: "gpt-5", Name: "GPT-5", ContextWindow: 256_000, MaxOutputTokens: 16384,
				ChosenContext: 256_000, ContextSource: "model_limit", NativeToolCalls: true,
				Supports: support(true, true, false, false, false)},
			{ID: "gpt-5-mini", Name: "GPT-5 Mini", ContextWindow: 128_000, MaxOutputTokens: 8192,
				ChosenContext: 128_000, ContextSource: "model_limit", NativeToolCalls: true,
				Supports: support(true, true, false, false, false)},
		},
		"local": {
			{ID: "llama3.3", Name: "Llama 3.3 70B", ContextWindow: 32_000, MaxOutputTokens: 4096,
				ChosenContext: 32_000, ContextSource: "local_model_limit",
				Supports: support(true, false, false, false, false)},
			{ID: "qwen3-coder", Name: "Qwen 3 Coder 32B", ContextWindow: 64_000, MaxOutputTokens: 8192,
				ChosenContext: 64_000, ContextSource: "local_model_limit", IsReasoning: true,
				Supports: support(true, false, true, false, false)},
		},
	}
}
