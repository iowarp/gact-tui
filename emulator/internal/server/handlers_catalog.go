package server

// Static catalog data — providers, tools, agents, MCP, commands. The
// emulator returns hard-coded values that exercise the wire shapes; real
// backends would compute these from runtime state.

import (
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/events"
	"github.com/JaimeCernuda/gact-tui/emulator/internal/store"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// --- §6.12 Providers + Models ----------------------------------------------

func (s *Server) handleListProviders(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"providers": staticProviders(),
	})
}

func (s *Server) handleGetProvider(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	for _, p := range staticProviders() {
		if p.ID == id {
			writeJSON(w, http.StatusOK, p)
			return
		}
	}
	writeError(w, http.StatusNotFound, "provider_not_found", "no provider with id "+id)
}

func (s *Server) handleListProviderModels(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if s.cfg.ProviderEdgeStates {
		switch id {
		case "local":
			writeJSON(w, http.StatusOK, map[string]any{
				"models": []gact.Model{},
				"source": "unavailable",
				"error":  "local model catalog unavailable: connection refused on 127.0.0.1:11434",
			})
			return
		case "argonne_sophia":
			if s.providerAuthed[id] {
				writeJSON(w, http.StatusOK, map[string]any{
					"models": []gact.Model{{
						ID:              "openai/gpt-oss-120b",
						Name:            "GPT OSS 120B",
						ContextWindow:   131072,
						MaxOutputTokens: 32768,
						Supports:        gact.ModelSupports{Tools: true, Thinking: true},
					}},
					"source": "live",
				})
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{
				"models": []gact.Model{},
				"source": "unavailable",
				"error":  "ALCF token expired; authenticate before loading Sophia models",
			})
			return
		}
	}
	models, ok := staticModels()[id]
	if !ok {
		writeError(w, http.StatusNotFound, "provider_not_found", "no provider with id "+id)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"models": models})
}

type lmProviderPreset struct {
	ID                  string `json:"id"`
	Label               string `json:"label"`
	Provider            string `json:"provider"`
	APIBase             string `json:"api_base"`
	SuggestedModel      string `json:"suggested_model"`
	RequiresAPIKey      bool   `json:"requires_api_key"`
	APIKeyEnv           string `json:"api_key_env,omitempty"`
	AuthMethod          string `json:"auth_method,omitempty"`
	IsAuthenticated     bool   `json:"is_authenticated,omitempty"`
	Description         string `json:"description"`
	Status              string `json:"status,omitempty"`
	StatusMessage       string `json:"status_message,omitempty"`
	SupportsLiveCatalog bool   `json:"supports_live_catalog,omitempty"`
}

type lmProviderInfo struct {
	Configured     bool               `json:"configured"`
	Provider       string             `json:"provider,omitempty"`
	APIBase        string             `json:"api_base,omitempty"`
	Model          string             `json:"model,omitempty"`
	Temperature    float64            `json:"temperature,omitempty"`
	MaxTokens      int                `json:"max_tokens,omitempty"`
	ContextLength  int                `json:"context_length,omitempty"`
	ThinkingBudget int                `json:"thinking_budget,omitempty"`
	State          string             `json:"state,omitempty"`
	StatusMessage  string             `json:"status_message,omitempty"`
	Presets        []lmProviderPreset `json:"presets,omitempty"`
}

type lmProviderRequest struct {
	Provider       string  `json:"provider"`
	APIBase        string  `json:"api_base"`
	Model          string  `json:"model"`
	Temperature    float64 `json:"temperature,omitempty"`
	MaxTokens      int     `json:"max_tokens,omitempty"`
	ContextLength  int     `json:"context_length,omitempty"`
	ThinkingBudget int     `json:"thinking_budget,omitempty"`
}

func (s *Server) handleGetLMProvider(w http.ResponseWriter, r *http.Request) {
	if s.cfg.ProviderEdgeStates {
		writeJSON(w, http.StatusOK, edgeLMProviderInfo())
		return
	}
	writeJSON(w, http.StatusOK, staticLMProviderInfo("anthropic", "claude-opus-4-7"))
}

func (s *Server) handlePutLMProvider(w http.ResponseWriter, r *http.Request) {
	var req lmProviderRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	req.Provider = strings.TrimSpace(req.Provider)
	req.Model = strings.TrimSpace(req.Model)
	if req.Provider == "" || req.Model == "" {
		writeError(w, http.StatusBadRequest, "invalid_body", "provider and model required")
		return
	}
	models, ok := staticModels()[req.Provider]
	if !ok {
		writeError(w, http.StatusBadRequest, "provider_not_found", "no provider with id "+req.Provider)
		return
	}
	found := false
	for _, model := range models {
		if model.ID == req.Model {
			found = true
			break
		}
	}
	if !found {
		writeError(w, http.StatusBadRequest, "model_not_found", "no model "+req.Model+" for provider "+req.Provider)
		return
	}
	info := staticLMProviderInfo(req.Provider, req.Model)
	info.APIBase = strings.TrimSpace(req.APIBase)
	info.Temperature = req.Temperature
	info.MaxTokens = req.MaxTokens
	info.ContextLength = req.ContextLength
	info.ThinkingBudget = req.ThinkingBudget
	writeJSON(w, http.StatusOK, info)
}

func (s *Server) handleProviderAuth(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	if s.cfg.ProviderEdgeStates && id == "argonne_sophia" {
		if s.cfg.ProviderAuthSucceeds {
			s.providerAuthed[id] = true
			writeJSON(w, http.StatusOK, map[string]any{
				"is_authenticated": true,
				"provider_id":      id,
				"instructions":     "ALCF Globus token ready",
			})
			return
		}
		writeError(w, http.StatusUnauthorized, "auth_failed", "Globus token expired; run clio auth login for ALCF and retry")
		return
	}
	for _, p := range staticProviders() {
		if p.ID == id {
			writeJSON(w, http.StatusOK, map[string]any{
				"is_authenticated": true,
				"provider_id":      id,
				"instructions":     "provider authenticated in emulator",
			})
			return
		}
	}
	writeError(w, http.StatusNotFound, "provider_not_found", "no provider with id "+id)
}

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
		Configured:    true,
		Provider:      provider,
		Model:         model,
		Temperature:   1.0,
		MaxTokens:     32000,
		ContextLength: 200000,
		State:         "ready",
		StatusMessage: "emulator provider catalog ready",
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
				Supports: support(true, true, true, true, true),
				Pricing:  &gact.ModelPricing{InputPerMTok: 15, OutputPerMTok: 75, CacheReadPerMTok: 1.5, CacheWritePerMTok: 18.75}},
			{ID: "claude-sonnet-4-6", Name: "Claude Sonnet 4.6", ContextWindow: 200_000, MaxOutputTokens: 8192,
				Supports: support(true, true, true, false, true),
				Pricing:  &gact.ModelPricing{InputPerMTok: 3, OutputPerMTok: 15, CacheReadPerMTok: 0.3, CacheWritePerMTok: 3.75}},
			{ID: "claude-haiku-4-5", Name: "Claude Haiku 4.5", ContextWindow: 200_000, MaxOutputTokens: 8192,
				Supports: support(true, true, false, false, true),
				Pricing:  &gact.ModelPricing{InputPerMTok: 0.8, OutputPerMTok: 4}},
		},
		"openai": {
			{ID: "gpt-5", Name: "GPT-5", ContextWindow: 256_000, MaxOutputTokens: 16384, Supports: support(true, true, false, false, false)},
			{ID: "gpt-5-mini", Name: "GPT-5 Mini", ContextWindow: 128_000, MaxOutputTokens: 8192, Supports: support(true, true, false, false, false)},
		},
		"local": {
			{ID: "llama3.3", Name: "Llama 3.3 70B", ContextWindow: 32_000, MaxOutputTokens: 4096, Supports: support(true, false, false, false, false)},
			{ID: "qwen3-coder", Name: "Qwen 3 Coder 32B", ContextWindow: 64_000, MaxOutputTokens: 8192, Supports: support(true, false, false, false, false)},
		},
	}
}

// --- CLIO prompt registry extension ---------------------------------------

func (s *Server) handleListPrompts(w http.ResponseWriter, r *http.Request) {
	sessionID := strings.TrimSpace(r.URL.Query().Get("session_id"))
	rows := make([]gact.PromptDefinition, 0, len(s.prompts))
	for _, row := range s.prompts {
		if !promptDefinitionMatchesScope(row, sessionID) {
			continue
		}
		rows = append(rows, row)
	}
	sort.SliceStable(rows, func(i, j int) bool { return rows[i].ID < rows[j].ID })
	writeJSON(w, http.StatusOK, map[string]any{"prompts": rows})
}

func promptDefinitionMatchesScope(row gact.PromptDefinition, sessionID string) bool {
	if !strings.EqualFold(strings.TrimSpace(row.Scope), "session") {
		return true
	}
	if sessionID == "" {
		return false
	}
	if scopedID := promptDefinitionSessionID(row); scopedID != "" {
		return scopedID == sessionID
	}
	return true
}

func promptDefinitionSessionID(row gact.PromptDefinition) string {
	if id := stringFromAnyMap(row.Metadata, "session_id"); id != "" {
		return id
	}
	for _, profile := range row.Profiles {
		if id := stringFromAnyMap(profile.Metadata, "session_id"); id != "" {
			return id
		}
	}
	return ""
}

func stringFromAnyMap(values map[string]any, key string) string {
	if len(values) == 0 {
		return ""
	}
	value, ok := values[key]
	if !ok {
		return ""
	}
	return strings.TrimSpace(fmt.Sprint(value))
}

func (s *Server) handleGetPrompt(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	row, ok := s.prompts[id]
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "prompt not found: "+id)
		return
	}
	profile := r.URL.Query().Get("profile")
	resolved, ok := resolvePromptDefinition(row, profile)
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "prompt has no profiles: "+id)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"prompt": resolved})
}

func (s *Server) handleSavePrompt(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req gact.PromptSaveRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if s.cfg.PromptSaveFailures {
		writeError(w, http.StatusConflict, "save_failed", "workspace prompt registry is read-only in this demo")
		return
	}
	text := strings.TrimSpace(req.Text)
	if text == "" {
		writeError(w, http.StatusUnprocessableEntity, "bad_request", "missing required field: text")
		return
	}
	profile := strings.TrimSpace(req.Profile)
	if profile == "" {
		profile = "default"
	}
	if strings.Contains(profile, "/") || strings.Contains(profile, ".") && strings.Contains(profile, "..") {
		writeError(w, http.StatusUnprocessableEntity, "bad_request", "invalid profile")
		return
	}
	row, ok := s.prompts[id]
	if !ok {
		row = gact.PromptDefinition{ID: id, Title: id, DefaultProfile: profile, Enabled: true, Profiles: map[string]gact.PromptProfile{}}
	}
	if row.Profiles == nil {
		row.Profiles = map[string]gact.PromptProfile{}
	}
	if req.Title != "" {
		row.Title = req.Title
	}
	if req.Description != "" {
		row.Description = req.Description
	}
	row.Scope = "global"
	row.Enabled = true
	row.Profiles[profile] = gact.PromptProfile{
		Name:       profile,
		Text:       req.Text,
		Scope:      "global",
		SourcePath: "~/.config/clio-agent/prompts/" + id + "--" + profile + ".md",
		Provider:   req.Provider,
		Model:      req.Model,
		Checksum:   promptChecksum(req.Text),
		Metadata:   req.Metadata,
	}
	s.prompts[id] = row
	writeJSON(w, http.StatusOK, map[string]any{"prompt": row})
}

func (s *Server) handleRenderPrompt(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req gact.PromptRenderRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	row, ok := s.prompts[id]
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "prompt not found: "+id)
		return
	}
	resolved, ok := resolvePromptDefinition(row, req.Profile)
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "prompt has no profiles: "+id)
		return
	}
	resolved.Text = resolved.Text + "\n\nRuntime context:\n" +
		"session_id: " + req.SessionID + "\nworkspace_id: " + req.WorkspaceID
	if resolved.Metadata == nil {
		resolved.Metadata = map[string]any{}
	}
	resolved.Metadata["rendered"] = true
	resolved.Metadata["session_id"] = req.SessionID
	resolved.Metadata["workspace_id"] = req.WorkspaceID
	writeJSON(w, http.StatusOK, map[string]any{"prompt": resolved})
}

func (s *Server) handleValidatePrompt(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req gact.PromptValidateRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	row, ok := s.prompts[id]
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "prompt not found: "+id)
		return
	}
	errors := append([]string(nil), row.ValidationErrors...)
	if strings.Contains(req.Text, "{{missing") {
		errors = append(errors, "unknown placeholder: missing")
	}
	row.Enabled = len(errors) == 0
	row.ValidationErrors = errors
	writeJSON(w, http.StatusOK, gact.PromptValidationResult{
		Enabled:          row.Enabled,
		ValidationErrors: errors,
		Prompt:           row,
	})
}

func (s *Server) handleReloadPrompts(w http.ResponseWriter, r *http.Request) {
	rows := make([]string, 0, len(s.prompts))
	for id := range s.prompts {
		rows = append(rows, id)
	}
	sort.Strings(rows)
	writeJSON(w, http.StatusOK, map[string]any{"reload": gact.PromptReloadResult{
		PromptCount: len(rows),
		PromptIDs:   rows,
		Sources: []gact.PromptSource{{
			Scope: "builtin",
			Root:  "emulator://prompts",
		}},
	}})
}

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

func (s *Server) handleListExpertPacks(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"expert_packs": s.expertPacks()})
}

func (s *Server) handleGetExpertPack(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	for _, pack := range s.expertPacks() {
		if pack.ID == id {
			writeJSON(w, http.StatusOK, gact.ExpertPackDetail{
				ExpertPack: pack,
				Agents:     staticExpertPackAgents(pack.ID),
			})
			return
		}
	}
	writeError(w, http.StatusNotFound, "not_found", "expert pack not found: "+id)
}

func (s *Server) handleValidateExpertPack(w http.ResponseWriter, r *http.Request) {
	var req gact.ExpertPackValidateRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.Path) == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "path is required")
		return
	}
	pack := gact.ExpertPackDefinition{
		ID:             "validated-pack",
		Version:        "0.1.0",
		Title:          "Validated Expert Pack",
		Scope:          firstNonEmptyString(req.Scope, "session"),
		Root:           req.Path,
		DefinitionPath: req.Path + "/clio-pack.yaml",
		Enabled:        true,
	}
	writeJSON(w, http.StatusOK, gact.ExpertPackValidationResult{
		Enabled: true,
		Pack:    pack,
		Agents:  staticExpertPackAgents(pack.ID),
	})
}

func (s *Server) handleInstallExpertPack(w http.ResponseWriter, r *http.Request) {
	var req gact.ExpertPackInstallRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	source := firstNonEmptyString(req.Source, req.SourceID, req.URL, req.Path)
	if strings.TrimSpace(source) == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "source, url, or path is required")
		return
	}
	if s.cfg.ExpertPackFailures && strings.Contains(strings.ToLower(source), "install-fail") {
		writeError(w, http.StatusBadGateway, "install_failed", "expert pack install failed: manifest clio-pack.yaml was not found")
		return
	}
	pack := s.expertPacks()[0]
	writeJSON(w, http.StatusOK, map[string]any{
		"installed": map[string]any{
			"id":     pack.ID,
			"scope":  firstNonEmptyString(req.Scope, pack.Scope, "workspace"),
			"source": source,
			"status": "installed",
		},
	})
}

func (s *Server) handleUpdateExpertPack(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if s.cfg.ExpertPackFailures && id == "data-semantics" {
		writeError(w, http.StatusConflict, "update_failed", "expert pack update failed: marketplace source has validation errors")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"updated": map[string]any{"id": id, "scope": "workspace", "status": "updated"},
	})
}

func (s *Server) handleDeleteExpertPack(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if s.cfg.ExpertPackFailures && id == "data-semantics" {
		writeError(w, http.StatusConflict, "delete_failed", "expert pack delete failed: pack is active in the selected session")
		return
	}
	for _, pack := range s.expertPacks() {
		if pack.ID == id {
			w.WriteHeader(http.StatusNoContent)
			return
		}
	}
	writeError(w, http.StatusNotFound, "not_found", "expert pack not found: "+id)
}

func (s *Server) handleGetSessionExpertPack(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	sess, err := s.store.GetSession(id)
	if err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	state := s.sessionExpertPackState(sess)
	writeJSON(w, http.StatusOK, state)
}

func (s *Server) handleSetSessionExpertPack(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	sess, err := s.store.GetSession(id)
	if err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	var req gact.SetSessionExpertPackRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	packID := strings.TrimSpace(req.PackID)
	if packID == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "pack_id or path is required")
		return
	}
	var pack *gact.ExpertPackDefinition
	for _, row := range s.expertPacks() {
		if row.ID == packID {
			copy := row
			pack = &copy
			break
		}
	}
	if pack == nil {
		writeError(w, http.StatusNotFound, "not_found", "expert pack not found: "+packID)
		return
	}
	if sess.Metadata == nil {
		sess.Metadata = map[string]any{}
	}
	sess.Metadata["active_expert_pack_id"] = pack.ID
	sess.Metadata["active_expert_pack_version"] = pack.Version
	sess.Metadata["active_expert_pack_scope"] = pack.Scope
	updated, err := s.store.UpdateSession(id, func(row *gact.Session) {
		row.Metadata = sess.Metadata
	})
	if err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	state := s.sessionExpertPackState(updated)
	writeJSON(w, http.StatusOK, state)
}

func (s *Server) sessionExpertPackState(sess *gact.Session) gact.SessionExpertPackState {
	if sess == nil {
		return gact.SessionExpertPackState{}
	}
	packID, _ := sess.Metadata["active_expert_pack_id"].(string)
	var pack *gact.ExpertPackDefinition
	for _, row := range s.expertPacks() {
		if row.ID == packID {
			copy := row
			pack = &copy
			break
		}
	}
	return gact.SessionExpertPackState{
		SessionID:          sess.ID,
		WorkspaceID:        sess.WorkspaceID,
		ActiveExpertPackID: packID,
		ExpertPack:         pack,
		Session:            sess,
	}
}

func (s *Server) expertPacks() []gact.ExpertPackDefinition {
	if s != nil && s.cfg.EmptyExpertPacks {
		return nil
	}
	return staticExpertPacks()
}

func staticExpertPacks() []gact.ExpertPackDefinition {
	return []gact.ExpertPackDefinition{{
		ID:             "data-semantics",
		Version:        "0.1.0",
		Title:          "Data Semantics",
		Description:    "Data, analysis, visualization, and utility experts for scientific datasets.",
		Scope:          "workspace",
		Root:           ".clio/expert-packs/data-semantics",
		DefinitionPath: ".clio/expert-packs/data-semantics/clio-pack.yaml",
		Enabled:        true,
		Defaults:       map[string]any{"prompt_profile": "heavy"},
		Metadata: map[string]any{"install": map[string]any{
			"source":         "git@github.com:example/data-semantics-agents.git",
			"source_kind":    "git",
			"ref":            "main",
			"commit":         "fedcba98765432100123456789abcdef",
			"installed_at":   "2026-06-05T14:00:00Z",
			"last_synced_at": "2026-06-06T08:30:00Z",
			"status":         "installed",
			"trust":          "explicit",
		}},
	}, {
		ID:               "broken-pack",
		Version:          "0.0.1",
		Title:            "Broken Pack",
		Description:      "Invalid pack kept visible for validation diagnostics.",
		Scope:            "workspace",
		Root:             ".clio/expert-packs/broken-pack",
		DefinitionPath:   ".clio/expert-packs/broken-pack/clio-pack.yaml",
		Enabled:          false,
		ValidationErrors: []string{"parent_id references missing expert"},
	}}
}

func staticExpertPackAgents(packID string) []gact.AgentDef {
	if packID == "broken-pack" {
		return []gact.AgentDef{{
			ID: "broken", Source: "expert_pack", Title: "Broken Expert", ParentID: "missing",
			Enabled: false, ValidationErrors: []string{"missing parent: missing"},
		}}
	}
	return []gact.AgentDef{{
		ID: "main", Source: "expert_pack", Title: "Main Expert", PromptID: "clio.main.planner",
		PromptProfile: "heavy", Enabled: true, Commands: []string{"/analyze"},
	}, {
		ID: "analysis", Source: "expert_pack", Title: "Analysis Expert", ParentID: "main",
		PromptID: "clio.expert.analysis", PromptProfile: "heavy", Tools: []string{"memory_search_sessions"},
		Keywords: []string{"statistics", "quality"}, Enabled: true,
	}}
}

func resolvePromptDefinition(row gact.PromptDefinition, requested string) (gact.ResolvedPrompt, bool) {
	profile := strings.TrimSpace(requested)
	if profile == "" {
		profile = firstNonEmptyString(row.DefaultProfile, "default")
	}
	selected, ok := row.Profiles[profile]
	fallback := ""
	if !ok && profile != row.DefaultProfile {
		selected, ok = row.Profiles[row.DefaultProfile]
		fallback = row.DefaultProfile
	}
	if !ok {
		for _, p := range row.Profiles {
			selected = p
			ok = true
			fallback = p.Name
			break
		}
	}
	if !ok {
		return gact.ResolvedPrompt{}, false
	}
	return gact.ResolvedPrompt{
		ID:               row.ID,
		Profile:          selected.Name,
		Text:             selected.Text,
		Title:            row.Title,
		Description:      row.Description,
		Scope:            firstNonEmptyString(selected.Scope, row.Scope),
		SourcePath:       firstNonEmptyString(selected.SourcePath, row.SourcePath),
		Provider:         selected.Provider,
		Model:            selected.Model,
		Checksum:         selected.Checksum,
		FallbackProfile:  fallback,
		ValidationErrors: row.ValidationErrors,
		Metadata:         selected.Metadata,
	}, true
}

func promptChecksum(text string) string {
	sum := sha256.Sum256([]byte(text))
	return fmt.Sprintf("%x", sum[:])[:12]
}

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func (s *Server) handleListAgentBlueprints(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"agent_blueprints": s.agentBlueprints()})
}

func (s *Server) handleListAgentBlueprintSources(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"sources": s.agentBlueprintSources()})
}

func (s *Server) handleRefreshAgentBlueprintSource(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if s.cfg.AgentBlueprintFailures && id == "data-semantics-agents" {
		writeError(w, http.StatusServiceUnavailable, "source_refresh_failed", "marketplace source refresh failed: unable to fetch remote refs")
		return
	}
	for _, source := range s.agentBlueprintSources() {
		if source.ID == id {
			source.Status = "ready"
			source.UpdatedAt = "2026-06-04T12:30:00Z"
			writeJSON(w, http.StatusOK, map[string]any{"source": source})
			return
		}
	}
	writeError(w, http.StatusNotFound, "not_found", "agent blueprint source not found: "+id)
}

func (s *Server) handleDeleteAgentBlueprintSource(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	for _, source := range s.agentBlueprintSources() {
		if source.ID == id {
			w.WriteHeader(http.StatusNoContent)
			return
		}
	}
	writeError(w, http.StatusNotFound, "not_found", "agent blueprint source not found: "+id)
}

func (s *Server) handleGetAgentBlueprint(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	for _, blueprint := range s.agentBlueprints() {
		if blueprint.ID == id {
			agents := staticAgentBlueprintAgents(blueprint.ID)
			if s.cfg.LongAgentBlueprints && blueprint.ID == longAgentBlueprintID {
				agents = staticLongAgentBlueprintAgents(blueprint.ID)
			}
			writeJSON(w, http.StatusOK, gact.AgentBlueprintDetail{
				AgentBlueprint:  blueprint,
				Agents:          agents,
				MCPDescriptors:  staticAgentBlueprintMCPDescriptors(blueprint.ID),
				HookDescriptors: staticAgentBlueprintHookDescriptors(blueprint.ID),
			})
			return
		}
	}
	writeError(w, http.StatusNotFound, "not_found", "agent blueprint not found: "+id)
}

func (s *Server) handleValidateAgentBlueprint(w http.ResponseWriter, r *http.Request) {
	var req gact.AgentBlueprintValidateRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.Path) == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "path is required")
		return
	}
	blueprint := gact.AgentBlueprintDefinition{
		ID:             "validated-blueprint",
		Version:        "0.1.0",
		Title:          "Validated Blueprint",
		Scope:          firstNonEmptyString(req.Scope, "session"),
		Root:           req.Path,
		RootPath:       req.Path + "/AGENT.md",
		DefinitionPath: req.Path + "/AGENT.md",
		RootExpert:     "main",
		Enabled:        true,
	}
	if s.cfg.AgentBlueprintFailures && strings.Contains(strings.ToLower(req.Path), "warning") {
		blueprint.ID = "validated-warning-blueprint"
		blueprint.Title = "Validated Warning Blueprint"
		writeJSON(w, http.StatusOK, gact.AgentBlueprintValidationResult{
			Enabled:            true,
			AgentBlueprint:     blueprint,
			Agents:             staticAgentBlueprintAgents(blueprint.ID),
			MCPDescriptors:     staticAgentBlueprintMCPDescriptors(blueprint.ID),
			HookDescriptors:    staticAgentBlueprintHookDescriptors(blueprint.ID),
			ValidationWarnings: []string{"descriptor references optional MCP server not installed"},
		})
		return
	}
	if s.cfg.AgentBlueprintFailures && strings.Contains(strings.ToLower(req.Path), "invalid") {
		blueprint.ID = "validated-invalid-blueprint"
		blueprint.Title = "Validated Invalid Blueprint"
		blueprint.Enabled = false
		blueprint.ValidationErrors = []string{"root_expert not found: missing"}
		writeJSON(w, http.StatusOK, gact.AgentBlueprintValidationResult{
			Enabled:          false,
			AgentBlueprint:   blueprint,
			ValidationErrors: []string{"root_expert not found: missing"},
		})
		return
	}
	writeJSON(w, http.StatusOK, gact.AgentBlueprintValidationResult{
		Enabled:         true,
		AgentBlueprint:  blueprint,
		Agents:          staticAgentBlueprintAgents(blueprint.ID),
		MCPDescriptors:  staticAgentBlueprintMCPDescriptors(blueprint.ID),
		HookDescriptors: staticAgentBlueprintHookDescriptors(blueprint.ID),
	})
}

func (s *Server) handleInstallAgentBlueprint(w http.ResponseWriter, r *http.Request) {
	var req gact.AgentBlueprintInstallRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	source := firstNonEmptyString(req.Source, req.SourceID, req.URL, req.Path)
	if strings.TrimSpace(source) == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "source, url, or path is required")
		return
	}
	if s.cfg.AgentBlueprintFailures && strings.Contains(strings.ToLower(source), "install-fail") {
		writeError(w, http.StatusBadGateway, "install_failed", "agent blueprint install failed: source archive is missing AGENT.md")
		return
	}
	blueprints := s.agentBlueprints()
	blueprint := blueprints[0]
	if req.BlueprintID != "" {
		blueprint.ID = req.BlueprintID
		blueprint.Title = req.BlueprintID
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"installed": []map[string]any{{
			"id":    blueprint.ID,
			"title": blueprint.Title,
			"scope": firstNonEmptyString(req.Scope, "workspace"),
			"install": map[string]any{
				"source": source,
				"ref":    req.Ref,
				"status": "installed",
			},
		}},
	})
}

func (s *Server) handleUpdateAgentBlueprint(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if s.cfg.AgentBlueprintFailures && id == "broken-blueprint" {
		writeError(w, http.StatusConflict, "update_failed", "agent blueprint update failed: validation errors must be fixed first")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"updated": map[string]any{"id": id, "scope": "workspace", "status": "updated"},
	})
}

func (s *Server) handleDeleteAgentBlueprint(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if s.cfg.AgentBlueprintFailures && id == "broken-blueprint" {
		writeError(w, http.StatusConflict, "delete_failed", "agent blueprint delete failed: workspace policy is locking this blueprint")
		return
	}
	if id == "data-exploration" && r.URL.Query().Get("scope") == "builtin" {
		writeError(w, http.StatusBadRequest, "bad_request", "built-in agent blueprints cannot be deleted")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"uninstalled": map[string]any{"id": id, "scope": firstNonEmptyString(r.URL.Query().Get("scope"), "workspace")},
	})
}

func (s *Server) handleEnableAgentBlueprintHook(w http.ResponseWriter, r *http.Request) {
	blueprintID := r.PathValue("id")
	hookID := r.PathValue("hook_id")
	for _, descriptor := range staticAgentBlueprintHookDescriptors(blueprintID) {
		if descriptor["id"] == hookID {
			writeJSON(w, http.StatusOK, map[string]any{
				"id":                 "agent_blueprint_hook_" + blueprintID + "_" + hookID,
				"hook_id":            hookID,
				"event":              descriptor["event"],
				"status":             "enabled",
				"enabled":            true,
				"source":             "agent_blueprint",
				"agent_blueprint_id": blueprintID,
				"definition_path":    descriptor["definition_path"],
				"installed_path":     "/tmp/gact-hooks/blueprints/" + blueprintID + "/" + hookID + ".py",
				"checksum":           descriptor["checksum"],
				"trust": map[string]any{
					"policy":  "explicit",
					"trusted": true,
					"source":  "request",
				},
			})
			return
		}
	}
	writeError(w, http.StatusNotFound, "not_found", "agent blueprint hook descriptor not found: "+hookID)
}

func (s *Server) handleEnableAgentBlueprintMCP(w http.ResponseWriter, r *http.Request) {
	blueprintID := r.PathValue("id")
	descriptorID := r.PathValue("descriptor_id")
	for _, descriptor := range staticAgentBlueprintMCPDescriptors(blueprintID) {
		if descriptor["id"] == descriptorID {
			writeJSON(w, http.StatusOK, map[string]any{
				"id":                 "agent_blueprint_mcp_" + blueprintID + "_" + descriptorID,
				"name":               firstNonEmptyString(stringFromAny(descriptor["name"]), descriptorID),
				"status":             "enabled_pending_probe",
				"transport":          firstNonEmptyString(stringFromAny(descriptor["transport"]), "unknown"),
				"tools_count":        0,
				"tools":              []any{},
				"spec":               map[string]any{"transport": descriptor["transport"], "command": descriptor["command"], "args": descriptor["args"]},
				"source":             "agent_blueprint",
				"agent_blueprint_id": blueprintID,
				"descriptor_id":      descriptorID,
			})
			return
		}
	}
	writeError(w, http.StatusNotFound, "not_found", "MCP descriptor not found: "+descriptorID)
}

func (s *Server) handleGetSessionAgentBlueprint(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	sess, err := s.store.GetSession(id)
	if err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	writeJSON(w, http.StatusOK, s.sessionAgentBlueprintState(sess))
}

func (s *Server) handleSetSessionAgentBlueprint(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	sess, err := s.store.GetSession(id)
	if err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	var req gact.SetSessionAgentBlueprintRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	blueprintID := firstNonEmptyString(strings.TrimSpace(req.BlueprintID), strings.TrimSpace(req.AgentBlueprintID))
	if blueprintID == "" && strings.TrimSpace(req.Path) == "" && strings.TrimSpace(req.BlueprintPath) == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "blueprint_id or path is required")
		return
	}
	var blueprint *gact.AgentBlueprintDefinition
	for _, row := range s.agentBlueprints() {
		if row.ID == blueprintID {
			copy := row
			blueprint = &copy
			break
		}
	}
	if blueprint == nil && blueprintID != "" {
		writeError(w, http.StatusNotFound, "not_found", "agent blueprint not found: "+blueprintID)
		return
	}
	if blueprint == nil {
		row := gact.AgentBlueprintDefinition{
			ID:             "session-blueprint",
			Version:        "0.1.0",
			Title:          "Session Blueprint",
			Scope:          "session",
			Root:           firstNonEmptyString(req.Path, req.BlueprintPath),
			RootPath:       firstNonEmptyString(req.Path, req.BlueprintPath) + "/AGENT.md",
			DefinitionPath: firstNonEmptyString(req.Path, req.BlueprintPath) + "/AGENT.md",
			RootExpert:     "main",
			Enabled:        true,
		}
		blueprint = &row
	}
	if sess.Metadata == nil {
		sess.Metadata = map[string]any{}
	}
	sess.Metadata["active_agent_blueprint_id"] = blueprint.ID
	sess.Metadata["active_agent_blueprint_version"] = blueprint.Version
	sess.Metadata["active_agent_blueprint_scope"] = blueprint.Scope
	sess.Metadata["active_agent_blueprint_definition_path"] = firstNonEmptyString(blueprint.DefinitionPath, blueprint.RootPath)
	sess.Metadata["active_agent_blueprint_path"] = ""
	sess.Metadata["active_expert_pack_id"] = ""
	sess.Metadata["active_expert_pack_path"] = ""
	updated, err := s.store.UpdateSession(id, func(row *gact.Session) {
		row.Metadata = sess.Metadata
	})
	if err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	state := s.sessionAgentBlueprintState(updated)
	state.AgentBlueprint = blueprint
	writeJSON(w, http.StatusOK, state)
}

func (s *Server) handleGetSessionAgentOverlay(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	sess, err := s.store.GetSession(id)
	if err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	writeJSON(w, http.StatusOK, gact.SessionAgentOverlayResponse{
		SessionID:    id,
		AgentOverlay: mapFromAny(sess.Metadata["agent_blueprint_overlay"]),
	})
}

func (s *Server) handlePutSessionAgentOverlay(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var overlay map[string]any
	if !decodeJSON(w, r, &overlay) {
		return
	}
	updated, err := s.store.UpdateSession(id, func(row *gact.Session) {
		if row.Metadata == nil {
			row.Metadata = map[string]any{}
		}
		row.Metadata["agent_blueprint_overlay"] = overlay
	})
	if err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	writeJSON(w, http.StatusOK, gact.SessionAgentOverlayResponse{
		SessionID:    id,
		AgentOverlay: overlay,
		Session:      updated,
	})
}

func (s *Server) sessionAgentBlueprintState(sess *gact.Session) gact.SessionAgentBlueprintState {
	if sess == nil {
		return gact.SessionAgentBlueprintState{}
	}
	blueprintID, _ := sess.Metadata["active_agent_blueprint_id"].(string)
	var blueprint *gact.AgentBlueprintDefinition
	for _, row := range s.agentBlueprints() {
		if row.ID == blueprintID {
			copy := row
			blueprint = &copy
			break
		}
	}
	return gact.SessionAgentBlueprintState{
		SessionID:                sess.ID,
		WorkspaceID:              sess.WorkspaceID,
		ActiveAgentBlueprintID:   blueprintID,
		ActiveAgentBlueprintPath: stringFromAny(sess.Metadata["active_agent_blueprint_path"]),
		AgentBlueprint:           blueprint,
		AgentOverlay:             mapFromAny(sess.Metadata["agent_blueprint_overlay"]),
		Session:                  sess,
	}
}

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
	return rows
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

// --- §6.6 Tools ------------------------------------------------------------

func (s *Server) handleListTools(w http.ResponseWriter, r *http.Request) {
	if s.cfg.EmptyTools {
		writeJSON(w, http.StatusOK, map[string]any{"tools": []gact.Tool{}})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"tools": staticTools()})
}

func (s *Server) handleGetTool(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "legacy_waveform_fetch" {
		writeError(w, http.StatusServiceUnavailable, "tool_unavailable", "tool unavailable: the EarthScope connector is not loaded in this workspace")
		return
	}
	for _, t := range staticTools() {
		if t.ID == id {
			writeJSON(w, http.StatusOK, t)
			return
		}
	}
	writeError(w, http.StatusNotFound, "tool_not_found", "no tool with id "+id)
}

func staticTools() []gact.Tool {
	stringSchema := func() map[string]any {
		return map[string]any{"type": "string"}
	}
	return []gact.Tool{
		{
			ID: "bash", Source: "builtin", Name: "bash", Title: "Run shell command",
			Description: "Execute a bash command in the workspace.",
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"command": stringSchema(),
				},
				"required": []string{"command"},
			},
			Annotations:       &gact.ToolAnnotations{Title: "Run shell command", DestructiveHint: true, OpenWorldHint: false},
			PermissionDefault: "ask",
		},
		{
			ID: "read_file", Source: "builtin", Name: "read_file", Title: "Read file",
			Description: "Read the contents of a file.",
			InputSchema: map[string]any{
				"type":       "object",
				"properties": map[string]any{"path": stringSchema()},
				"required":   []string{"path"},
			},
			Annotations:       &gact.ToolAnnotations{Title: "Read file", ReadOnlyHint: true},
			PermissionDefault: "allow",
		},
		{
			ID: "edit_file", Source: "builtin", Name: "edit_file", Title: "Edit file",
			Description: "Modify a file in place. Returns a diff.",
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"path":  stringSchema(),
					"patch": stringSchema(),
				},
				"required": []string{"path", "patch"},
			},
			Annotations:       &gact.ToolAnnotations{Title: "Edit file", DestructiveHint: true},
			PermissionDefault: "ask",
		},
		{
			ID: "web_search", Source: "builtin", Name: "web_search", Title: "Search the web",
			Description: "Search the web for relevant pages.",
			InputSchema: map[string]any{
				"type":       "object",
				"properties": map[string]any{"query": stringSchema()},
				"required":   []string{"query"},
			},
			Annotations:       &gact.ToolAnnotations{Title: "Web search", ReadOnlyHint: true, OpenWorldHint: true},
			PermissionDefault: "allow",
		},
		{
			ID: "legacy_waveform_fetch", Source: "extension", Name: "legacy_waveform_fetch", Title: "Legacy waveform fetch",
			Description: "Stale extension entry used to exercise unavailable tool handling.",
			InputSchema: map[string]any{
				"type":       "object",
				"properties": map[string]any{"station": stringSchema()},
				"required":   []string{"station"},
			},
			PermissionDefault: "ask",
			Tags:              []string{"seismic", "unavailable"},
		},
		{
			ID: "fake-mcp.fetch", Source: "mcp", ServerID: "mcp_fake", Name: "fetch", Title: "Fetch URL",
			Description: "(MCP) Download a URL and return its contents.",
			InputSchema: map[string]any{
				"type":       "object",
				"properties": map[string]any{"url": stringSchema()},
				"required":   []string{"url"},
			},
			PermissionDefault: "allow",
		},
		{
			ID: "fake-mcp.dbquery", Source: "mcp", ServerID: "mcp_fake", Name: "dbquery", Title: "Database query",
			Description: "(MCP) Run a read-only query against the demo database.",
			InputSchema: map[string]any{
				"type":       "object",
				"properties": map[string]any{"sql": stringSchema()},
				"required":   []string{"sql"},
			},
			PermissionDefault: "allow",
		},
	}
}

// --- §6.5 Agents -----------------------------------------------------------

func (s *Server) handleListAgents(w http.ResponseWriter, r *http.Request) {
	agents := s.allAgents()
	// v0.2 — SPEC §4.3.1: `?tier=N` filters to a specific tier.
	// Absent = return all tiers (backwards-compat with v0.1).
	if tierStr := r.URL.Query().Get("tier"); tierStr != "" {
		var filtered []gact.AgentDef
		for _, a := range agents {
			if atoi(tierStr) == a.Tier {
				filtered = append(filtered, a)
			}
		}
		agents = filtered
	}
	writeJSON(w, http.StatusOK, map[string]any{"agents": agents})
}

// atoi is a small helper for query-string int parsing — returns 0 on
// anything we don't like so `?tier=bogus` silently returns no tier-0
// matches (i.e. no results) rather than 500ing.
func atoi(s string) int {
	n := 0
	for _, r := range s {
		if r < '0' || r > '9' {
			return 0
		}
		n = n*10 + int(r-'0')
	}
	return n
}

func (s *Server) handleGetAgent(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	s.agentsMu.Lock()
	if agent, ok := s.agents[id]; ok {
		s.agentsMu.Unlock()
		writeJSON(w, http.StatusOK, agent)
		return
	}
	s.agentsMu.Unlock()
	for _, a := range s.allAgents() {
		if a.ID == id {
			writeJSON(w, http.StatusOK, a)
			return
		}
	}
	writeError(w, http.StatusNotFound, "agent_not_found", "no agent with id "+id)
}

func (s *Server) handleCreateAgent(w http.ResponseWriter, r *http.Request) {
	var agent gact.AgentDef
	if !decodeJSON(w, r, &agent) {
		return
	}
	if strings.TrimSpace(agent.ID) == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "agent id is required")
		return
	}
	if s.cfg.AgentFailures && strings.HasPrefix(agent.ID, "agent-write-fail") {
		writeError(w, http.StatusConflict, "agent_create_failed", "agent create failed: workspace registry rejected this id")
		return
	}
	agent.Source = firstNonEmptyString(agent.Source, "user")
	if agent.Title == "" {
		agent.Title = agent.ID
	}
	if !agent.Enabled {
		agent.Enabled = true
	}
	if agent.Metadata == nil {
		agent.Metadata = map[string]any{}
	}
	agent.Metadata["storage_scope"] = "workspace"
	agent.Metadata["source_path"] = "/workspace/.clio/agents/" + agent.ID + ".md"
	s.agentsMu.Lock()
	s.agents[agent.ID] = agent
	s.agentsMu.Unlock()
	writeJSON(w, http.StatusCreated, agent)
}

func (s *Server) handleUpdateAgent(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var patch gact.AgentDef
	if !decodeJSON(w, r, &patch) {
		return
	}
	if s.cfg.AgentFailures && id == "fragile-user-expert" {
		writeError(w, http.StatusConflict, "agent_update_failed", "agent update failed: source file changed on disk")
		return
	}
	s.agentsMu.Lock()
	defer s.agentsMu.Unlock()
	agent, ok := s.agents[id]
	if !ok {
		writeError(w, http.StatusNotFound, "agent_not_found", "user agent not found: "+id)
		return
	}
	if patch.Title != "" {
		agent.Title = patch.Title
	}
	agent.Description = patch.Description
	agent.SystemPrompt = patch.SystemPrompt
	agent.Tools = append([]string(nil), patch.Tools...)
	agent.Keywords = append([]string(nil), patch.Keywords...)
	if patch.Metadata != nil {
		agent.Metadata = patch.Metadata
	}
	if agent.Metadata == nil {
		agent.Metadata = map[string]any{}
	}
	agent.Metadata["updated_by"] = "gact-emulator"
	agent.Enabled = patch.Enabled
	s.agents[id] = agent
	writeJSON(w, http.StatusOK, agent)
}

func (s *Server) handleDeleteAgent(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if s.cfg.AgentFailures && id == "fragile-user-expert" {
		writeError(w, http.StatusConflict, "agent_delete_failed", "agent delete failed: expert is referenced by active session routing")
		return
	}
	s.agentsMu.Lock()
	defer s.agentsMu.Unlock()
	if _, ok := s.agents[id]; !ok {
		writeError(w, http.StatusNotFound, "agent_not_found", "user agent not found: "+id)
		return
	}
	delete(s.agents, id)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleExtractAgent(w http.ResponseWriter, r *http.Request) {
	var req gact.AgentExtractRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.AgentID) == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "agent_id is required")
		return
	}
	if s.cfg.AgentFailures && req.AgentID == "extract-fail" {
		writeError(w, http.StatusBadGateway, "agent_extract_failed", "agent extraction failed: session transcript is unavailable")
		return
	}
	agent := gact.AgentDef{
		ID:          req.AgentID,
		Source:      "user",
		Title:       req.AgentID,
		Description: "Extracted from " + strings.Join(req.SessionIDs, ", "),
		SystemPrompt: "Use the observed session goals, tool evidence, and routing decisions as the starting point for this " +
			"extracted agent.",
		Tools:    []string{"read_file", "mcp.parquet.read"},
		Keywords: []string{"extracted", "session"},
		Enabled:  true,
		Metadata: map[string]any{
			"created_by":     "gact-emulator",
			"extracted_from": req.SessionIDs,
			"source_path":    "/workspace/.clio/agents/" + req.AgentID + ".md",
		},
	}
	s.agentsMu.Lock()
	s.agents[agent.ID] = agent
	s.agentsMu.Unlock()
	writeJSON(w, http.StatusCreated, agent)
}

func (s *Server) allAgents() []gact.AgentDef {
	agents := staticAgents()
	s.agentsMu.Lock()
	for _, agent := range s.agents {
		agents = append(agents, agent)
	}
	s.agentsMu.Unlock()
	return agents
}

func staticAgents() []gact.AgentDef {
	return []gact.AgentDef{
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
		// Two skill-source agents so the /skills catalog browser has
		// real data to render (LLL3). Per SPEC §6.5 line 807, skills
		// are agents with source="skill" — no separate namespace.
		{
			ID: "test_writer", Source: "skill", Title: "Test Writer",
			Description:  "Writes table-driven Go tests for a target package.",
			DefaultModel: &gact.ModelRef{ProviderID: "anthropic", ModelID: "claude-sonnet-4-6"},
			Tools:        []string{"read_file", "edit_file"},
			Enabled:      true,
		},
		{
			ID: "release_notes", Source: "skill", Title: "Release Notes",
			Description:  "Summarizes git diffs since a tag into changelog entries.",
			DefaultModel: &gact.ModelRef{ProviderID: "anthropic", ModelID: "claude-haiku-4-5"},
			Tools:        []string{"bash", "read_file"},
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

// --- §6.7 MCP --------------------------------------------------------------

func (s *Server) handleListMcpServers(w http.ResponseWriter, r *http.Request) {
	if s.cfg.EmptyMcpConnections {
		writeJSON(w, http.StatusOK, map[string]any{"servers": []gact.McpServer{}})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"servers": staticMcpServers()})
}

func (s *Server) handleGetMcpServer(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	for _, srv := range staticMcpServers() {
		if srv.ID == id {
			writeJSON(w, http.StatusOK, srv)
			return
		}
	}
	writeError(w, http.StatusNotFound, "mcp_not_found", "no MCP server with id "+id)
}

func (s *Server) handleDeleteMcpServer(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !mcpExists(id) {
		writeError(w, http.StatusNotFound, "mcp_not_found", "no MCP server with id "+id)
		return
	}
	if id == "mcp_docs" {
		writeError(w, http.StatusConflict, "mcp_remove_failed", "remove failed: connection is still referenced by a workspace profile")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleMcpReconnect(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !mcpExists(id) {
		writeError(w, http.StatusNotFound, "mcp_not_found", "no MCP server with id "+id)
		return
	}
	if id == "mcp_docs" {
		writeError(w, http.StatusBadGateway, "mcp_reconnect_failed", "probe failed: connection refused")
		return
	}
	// MMM1: surface a notification SSE event so connected clients see
	// the reconnect succeeded without polling. Workspace-scoped so
	// every TUI/SSE listener picks it up.
	s.bus.Publish(events.Event{
		Type: "notification",
		Payload: map[string]any{
			"level": "info",
			"title": "MCP server reconnected",
			"body":  id,
		},
	})
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleMcpServerTools(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !mcpExists(id) {
		writeError(w, http.StatusNotFound, "mcp_not_found", "no MCP server with id "+id)
		return
	}
	tools := []gact.Tool{}
	for _, t := range staticTools() {
		if t.Source == "mcp" && t.ServerID == id {
			tools = append(tools, t)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"tools": tools})
}

func (s *Server) handleMcpServerResources(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !mcpExists(id) {
		writeError(w, http.StatusNotFound, "mcp_not_found", "no MCP server with id "+id)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"resources": staticMcpResources(id)})
}

func (s *Server) handleMcpServerResourceTemplates(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !mcpExists(id) {
		writeError(w, http.StatusNotFound, "mcp_not_found", "no MCP server with id "+id)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"templates": []gact.McpResourceTemplate{
		{ServerID: id, URITemplate: "file:///docs/{name}.md", Name: "doc", Description: "Demo doc by name"},
	}})
}

type mcpReadRequest struct {
	URI string `json:"uri"`
}

func (s *Server) handleMcpResourceRead(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !mcpExists(id) {
		writeError(w, http.StatusNotFound, "mcp_not_found", "no MCP server with id "+id)
		return
	}
	var req mcpReadRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.URI == "" {
		writeError(w, http.StatusBadRequest, "invalid_body", "uri required")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"contents": []gact.McpContent{
			{URI: req.URI, MimeType: "text/plain", Text: "demo content for " + req.URI},
		},
	})
}

func (s *Server) handleMcpResourceSubscribe(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !mcpExists(id) {
		writeError(w, http.StatusNotFound, "mcp_not_found", "no MCP server with id "+id)
		return
	}
	var req mcpReadRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleMcpServerPrompts(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !mcpExists(id) {
		writeError(w, http.StatusNotFound, "mcp_not_found", "no MCP server with id "+id)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"prompts": staticMcpPrompts(id)})
}

type mcpPromptGetRequest struct {
	Name      string         `json:"name"`
	Arguments map[string]any `json:"arguments,omitempty"`
}

func (s *Server) handleMcpPromptGet(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !mcpExists(id) {
		writeError(w, http.StatusNotFound, "mcp_not_found", "no MCP server with id "+id)
		return
	}
	var req mcpPromptGetRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"description": "Demo prompt for " + req.Name,
		"messages": []gact.McpMessage{
			{Role: gact.RoleUser, Content: []gact.Part{
				gact.NewTextPart("Demo body for prompt " + req.Name),
			}},
		},
	})
}

func mcpExists(id string) bool {
	for _, s := range staticMcpServers() {
		if s.ID == id {
			return true
		}
	}
	return false
}

func staticMcpServers() []gact.McpServer {
	return []gact.McpServer{
		{
			ID: "mcp_docs", Name: "docs-mcp", Version: "0.1.0",
			Transport: "http", ProtocolVersion: "2025-06-18", Status: "error",
			LastError:    "connection refused",
			ServerInfo:   map[string]any{"name": "docs-mcp", "version": "0.1.0"},
			Instructions: "Demo disconnected MCP server used to exercise repair flows.",
			DeclaredCapabilities: gact.McpCapabilities{
				Tools: true,
			},
		},
		{
			ID: "mcp_fake", Name: "fake-mcp", Version: "0.1.0",
			Transport: "stdio", ProtocolVersion: "2025-06-18", Status: "ready",
			ServerInfo:   map[string]any{"name": "fake-mcp", "version": "0.1.0"},
			Instructions: "Demo MCP server. Two tools (fetch, dbquery), one resource, one prompt.",
			DeclaredCapabilities: gact.McpCapabilities{
				Tools:     true,
				Resources: &gact.McpResourcesCapability{Subscribe: true, ListChanged: true},
				Prompts:   &gact.McpPromptsCapability{ListChanged: false},
				Logging:   true,
			},
		},
	}
}

func staticMcpResources(serverID string) []gact.McpResource {
	return []gact.McpResource{
		{ServerID: serverID, URI: "file:///docs/welcome.md", Name: "welcome",
			Title: "Welcome", Description: "Intro doc", MimeType: "text/markdown", Size: 256},
	}
}

func staticMcpPrompts(serverID string) []gact.McpPrompt {
	return []gact.McpPrompt{
		{ServerID: serverID, Name: "summarize", Title: "Summarize",
			Description: "Summarize a chunk of text",
			Arguments: []gact.McpPromptArg{
				{Name: "text", Required: true, Description: "Text to summarize"},
			}},
	}
}

// --- §6.13 Commands --------------------------------------------------------

func (s *Server) handleListCommands(w http.ResponseWriter, r *http.Request) {
	agentID := strings.TrimSpace(r.URL.Query().Get("agent_id"))
	plannerOnly := r.URL.Query().Get("planner") == "true"
	sessionID := strings.TrimSpace(r.URL.Query().Get("session_id"))
	rows := staticCommands()
	if s.cfg.LongCommands {
		rows = append(rows, staticLongPaletteCommands()...)
	}
	if sessionID != "" {
		if sess, err := s.store.GetSession(sessionID); err == nil {
			if blueprintID := stringFromAny(sess.Metadata["active_agent_blueprint_id"]); blueprintID != "" {
				rows = append(rows, staticAgentBlueprintPackagedCommands(blueprintID)...)
			}
		}
	}
	if agentID != "" || plannerOnly {
		filtered := make([]gact.Command, 0, len(rows))
		for _, row := range rows {
			if agentID != "" && row.AgentID != "" && row.AgentID != agentID {
				continue
			}
			if agentID != "" && row.AgentID == "" && row.Source != "builtin" {
				continue
			}
			if plannerOnly && (row.PlannerVisible == nil || !*row.PlannerVisible) {
				continue
			}
			filtered = append(filtered, row)
		}
		rows = filtered
	}
	writeJSON(w, http.StatusOK, map[string]any{"commands": rows})
}

func staticLongPaletteCommands() []gact.Command {
	out := make([]gact.Command, 0, 24)
	for i := 1; i <= 24; i++ {
		out = append(out, gact.Command{
			ID:          fmt.Sprintf("/runtime-demo-%02d", i),
			Title:       fmt.Sprintf("Runtime demo action %02d", i),
			Description: "Synthetic runtime command used to exercise palette overflow and scrolling.",
			Source:      "builtin",
		})
	}
	return out
}

func staticAgentBlueprintPackagedCommands(blueprintID string) []gact.Command {
	trueValue := true
	return []gact.Command{{
		ID:                 "/validate-dataset",
		Title:              "Validate Dataset",
		Description:        "Validate a dataset before analysis",
		Source:             "agent_blueprint",
		AgentID:            "data",
		AgentSource:        "agent_blueprint",
		CommandSource:      "agent_blueprint",
		CommandScope:       "agent_blueprint",
		CommandPath:        "/workspace/.clio/agent-blueprints/" + blueprintID + "/commands/validate-dataset.md",
		AgentBlueprintID:   blueprintID,
		AgentBlueprintRoot: "/workspace/.clio/agent-blueprints/" + blueprintID,
		Invocation:         "agent",
		UserInvocable:      &trueValue,
		AgentInvocable:     &trueValue,
		PlannerVisible:     &trueValue,
		ArgumentHint:       "<path>",
		Arguments:          []gact.AgentParameter{{Name: "path", Type: "string", Required: true}},
	}}
}

func staticCommands() []gact.Command {
	trueValue := true
	falseValue := false
	return []gact.Command{
		{ID: "/clear", Title: "Clear chat history", Source: "builtin", Shortcut: "ctrl+l", UserInvocable: &trueValue, AgentInvocable: &falseValue, PlannerVisible: &falseValue},
		{ID: "/cancel", Title: "Cancel current run", Source: "builtin", Shortcut: "ctrl+c"},
		{ID: "/model", Title: "Switch model", Source: "builtin",
			Arguments: []gact.AgentParameter{{Name: "model_id", Type: "string", Required: true}}},
		{ID: "/agent", Title: "Expert settings", Description: "Pick the session expert", Source: "builtin",
			Arguments: []gact.AgentParameter{{Name: "agent_id", Type: "string", Required: true}}},
		{ID: "/add", Title: "Add file to context", Source: "builtin",
			Arguments: []gact.AgentParameter{{Name: "path", Type: "string", Required: true}}},
		{ID: "/drop", Title: "Drop file from context", Source: "builtin",
			Arguments: []gact.AgentParameter{{Name: "path", Type: "string", Required: true}}},
		{ID: "/diff", Title: "Show pending diffs", Source: "builtin"},
		{ID: "/undo", Title: "Undo last assistant change", Source: "builtin"},
		{ID: "/help", Title: "Show help", Source: "builtin", Shortcut: "?"},
		{ID: "/mcp", Title: "MCP connections", Description: "Inspect MCP source health, resources, prompts, and management actions", Source: "builtin"},
		{ID: "/tools", Title: "Capabilities", Description: "Unified catalog of built-in, recipe, extension, and MCP-provided tools", Source: "builtin"},
		{ID: "/skills", Title: "List available skills", Source: "builtin"},
		{ID: "/agents", Title: "Expert settings", Description: "Pick the session expert", Source: "builtin"},
		{ID: "/scenarios", Title: "Show scenario trigger keywords", Source: "builtin"},
		{ID: "/new", Title: "Create a new session", Source: "builtin"},
		{ID: "/rename", Title: "Rename the current session", Source: "builtin"},
		{ID: "/sessions", Title: "Focus sidebar + filter sessions by title", Source: "builtin"},
		{ID: "/theme", Title: "Pick a colour theme (live preview)", Source: "builtin"},
		{ID: "/theme-export", Title: "Export current palette to ~/.config/gact/theme.json", Source: "builtin"},
		{ID: "/metrics", Title: "Open backend metrics modal", Source: "builtin"},
		{ID: "/doctor", Title: "Open backend health + integrations modal", Source: "builtin"},
		{ID: "/theme-next", Title: "Cycle to the next colour theme", Source: "builtin"},
		{ID: "/theme-prev", Title: "Cycle to the previous colour theme", Source: "builtin"},
		{ID: "/duplicate", Title: "Duplicate session", Description: "Copy title and expert", Source: "builtin"},
		{ID: "/summarize", Title: "Summarize fake-mcp text",
			Source: "mcp_prompt", ServerID: "mcp_fake",
			AgentID: "clio.expert.data", AgentSource: "builtin", CommandSource: "mcp_prompt", Invocation: "mcp_prompt",
			UserInvocable: &trueValue, AgentInvocable: &trueValue, PlannerVisible: &trueValue,
			ArgumentHint: "text required",
			Arguments:    []gact.AgentParameter{{Name: "text", Type: "multiline", Required: true}}},
	}
}

// handleSessionCommand executes a slash-command against a session.
//
// For built-in commands we implement the side-effect directly:
//
//   - /clear — drop every message in the session and reset derived counters,
//     then emit a session.cleared event so the TUI can reload its view.
//   - /cancel — same effect as POST /v1/sessions/{id}/cancel: call the cancel
//     hook so the scenario engine halts any in-flight script and flip the
//     status to idle.
//   - /help — echo a short help message back as an assistant text part so
//     the user sees something beyond "command 204 OK".
//   - /undo, /diff — stub with an assistant message for discoverability;
//     the real apply/reject/undo flow is via the diff viewer (a/r keys).
//
// Unknown IDs return 404. Commands that legitimately take arguments but
// received none return 400. Everything else returns 204 so the client can
// ignore the response body.
func (s *Server) handleSessionCommand(w http.ResponseWriter, r *http.Request) {
	cmd := r.PathValue("cmd_id")
	cmd, _ = url.PathUnescape(cmd)
	sessionID := r.PathValue("id")

	known := false
	for _, c := range staticCommands() {
		if c.ID == cmd {
			known = true
			break
		}
	}
	if !known {
		writeError(w, http.StatusNotFound, "command_not_found", "no command "+cmd)
		return
	}

	if _, err := s.store.GetSession(sessionID); err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}

	switch cmd {
	case "/clear":
		n, err := s.store.ClearSessionMessages(sessionID)
		if err != nil {
			writeStoreError(w, err, "session_not_found", "invalid_session")
			return
		}
		// Non-standard but useful: emit a session.cleared event so the
		// TUI knows to drop its local message cache. SSE subscribers can
		// ignore unknown event types, so this is forward-compatible.
		s.bus.Publish(events.Event{
			Type:      "session.cleared",
			SessionID: sessionID,
			Payload: map[string]any{
				"session_id":       sessionID,
				"messages_cleared": n,
			},
		})
		// Emit a zeroed cost.updated so the TUI's footer meter drops
		// back to $0.0000 (0 in / 0 out) in lockstep with the message
		// wipe. Otherwise the meter stays at the pre-clear value until
		// the next assistant turn rolls in new totals.
		s.bus.Publish(events.Event{
			Type:      "cost.updated",
			SessionID: sessionID,
			Payload: map[string]any{
				"session_id": sessionID,
				"cost_usd":   0.0,
				"tokens":     gact.Tokens{},
			},
		})
		writeJSON(w, http.StatusOK, map[string]any{"messages_cleared": n})
		return

	case "/cancel":
		if s.cfg.CancelFailures {
			writeError(w, http.StatusBadGateway, "cancel_failed", "cancel failed: runtime supervisor did not acknowledge the request")
			return
		}
		if s.onCancel != nil {
			s.onCancel(sessionID)
		}
		if _, err := s.store.UpdateSession(sessionID, func(sess *gact.Session) {
			sess.Status = gact.StatusIdle
		}); err != nil {
			writeStoreError(w, err, "session_not_found", "invalid_session")
			return
		}
		s.bus.Publish(events.Event{
			Type:      "session.status_changed",
			SessionID: sessionID,
			Payload: map[string]any{
				"session_id": sessionID,
				"status":     gact.StatusIdle,
				"reason":     "cancelled",
			},
		})
		w.WriteHeader(http.StatusNoContent)
		return

	case "/help":
		s.emitAssistantNote(sessionID, helpCommandMessage())
		w.WriteHeader(http.StatusNoContent)
		return

	case "/diff":
		s.emitAssistantNote(sessionID,
			"No pending diffs. When a diff is active use `a` to apply or `r` to reject from the body pane.")
		w.WriteHeader(http.StatusNoContent)
		return

	case "/undo":
		s.emitAssistantNote(sessionID,
			"Undo not implemented in the emulator. Real backends expose it via /v1/diffs/:id/undo.")
		w.WriteHeader(http.StatusNoContent)
		return
	}

	// Every other built-in (e.g. /model, /agent, /add, /drop, /summarize)
	// requires arguments we don't parse here — record the invocation and
	// hand control back.
	w.WriteHeader(http.StatusNoContent)
}

// emitAssistantNote appends a single assistant-text message to a session so
// users see a visible response to a slash command beyond "204 OK". The part
// is emitted as a complete message (no streaming) so a single SSE cycle
// delivers everything subscribers need.
//
// Event shape matches the scenario engine's convention: message.created
// carries the Message struct directly as Payload (not wrapped), and
// message.part.added wraps {message_id, part} so the TUI's existing SSE
// handlers pick it up without changes.
func (s *Server) emitAssistantNote(sessionID, body string) {
	saved, err := s.store.AppendMessage(gact.Message{
		SessionID: sessionID,
		Role:      gact.RoleAssistant,
		Parts:     []gact.Part{gact.NewTextPart(body)},
	})
	if err != nil {
		return
	}

	s.bus.Publish(events.Event{
		Type:      "message.created",
		SessionID: sessionID,
		Payload:   saved,
	})
	// Also emit message.part.added for the single text part. Some clients
	// build their message view from part events rather than the message
	// snapshot, so both paths should deliver the body.
	if len(saved.Parts) > 0 {
		s.bus.Publish(events.Event{
			Type:      "message.part.added",
			SessionID: sessionID,
			Payload: map[string]any{
				"message_id": saved.ID,
				"part":       saved.Parts[0],
			},
		})
	}
	s.bus.Publish(events.Event{
		Type:      "message.completed",
		SessionID: sessionID,
		Payload: map[string]any{
			"message_id": saved.ID,
		},
	})
}

// helpCommandMessage returns the markdown body shown when a user runs
// /help. Kept out-of-line so it can be reused by tests.
func helpCommandMessage() string {
	return "**GACT slash commands**\n\n" +
		"- `/clear` — wipe the current session's messages\n" +
		"- `/cancel` — halt the current assistant turn\n" +
		"- `/diff` — show pending diffs (use `a`/`r` in the body pane)\n" +
		"- `/help` — this message\n" +
		"- `/undo` — revert the last assistant change (if backend supports it)\n" +
		"- `/model`, `/agent` — switch model/agent (use Settings via Ctrl+S for the picker)\n\n" +
		"**Input**: `Enter` sends, `Shift+Enter` / `\\<Enter>` inserts a newline."
}

// --- §6.16 Metrics ---------------------------------------------------------

func (s *Server) handleMetrics(w http.ResponseWriter, r *http.Request) {
	sessions := s.store.ListSessions(store.SessionFilter{IncludeArchived: true})
	byStatus := map[string]int{}
	active := 0
	totalMsg := 0
	byRole := map[string]int{
		gact.RoleUser:      0,
		gact.RoleAssistant: 0,
		gact.RoleTool:      0,
		gact.RoleSystem:    0,
	}
	tokens := gact.MetricsTokens{}
	costByProvider := map[string]float64{}
	totalCost := 0.0

	for _, sess := range sessions {
		byStatus[sess.Status]++
		if sess.Status != gact.StatusIdle {
			active++
		}
		totalMsg += sess.MessageCount
		tokens.InputTotal += sess.Tokens.Input
		tokens.OutputTotal += sess.Tokens.Output
		tokens.CacheReadTotal += sess.Tokens.CacheRead
		tokens.CacheWriteTotal += sess.Tokens.CacheWrite
		totalCost += sess.CostUSD
		if sess.Model.ProviderID != "" {
			costByProvider[sess.Model.ProviderID] += sess.CostUSD
		}
	}

	// Walk per-session messages to fill byRole counts cheaply.
	for _, sess := range sessions {
		msgs, _, _ := s.store.ListMessages(store.MessageFilter{
			SessionID: sess.ID, Limit: 100000, IncludeSystem: true,
		})
		for _, m := range msgs {
			byRole[m.Role]++
		}
	}

	latencies := map[string]gact.MetricsLatencyStat{}
	for pat, st := range s.latency.Snapshot() {
		latencies[pat] = gact.MetricsLatencyStat{
			Count: st.Count, P50Ms: st.P50Ms, P95Ms: st.P95Ms, MaxMs: st.MaxMs,
		}
	}

	writeJSON(w, http.StatusOK, gact.Metrics{
		UptimeS: int(time.Since(s.started).Seconds()),
		Sessions: gact.MetricsSessions{
			Total: len(sessions), Active: active, ByStatus: byStatus,
		},
		Messages:  gact.MetricsMessages{Total: totalMsg, ByRole: byRole},
		Tokens:    tokens,
		Cost:      gact.MetricsCost{TotalUSD: totalCost, ByProvider: costByProvider},
		Latencies: latencies,
	})
}

// --- §6.9 Files / context / repo_map ---------------------------------------

// In-memory context-files storage (per-session). Lives on Server because
// it's emulator-specific (not part of store, since store is the message DB).
// Would move to its own package if we built persistence later.
type contextFileSet struct {
	files map[string][]gact.ContextFile // sessionID -> files
}

func (s *Server) handleListContextFiles(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, err := s.store.GetSession(id); err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"files": s.contextFiles.get(id)})
}

type contextFileRequest struct {
	Path string `json:"path"`
	Mode string `json:"mode"`
}

type attachmentUploadRequest struct {
	File     string `json:"file"`
	Filename string `json:"filename"`
	MimeType string `json:"mime_type"`
	Mode     string `json:"mode"`
}

func (s *Server) handleAddContextFile(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, err := s.store.GetSession(id); err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	if s.cfg.ContextAddFailures {
		writeError(w, http.StatusBadGateway, "context_add_failed", "context add failed: workspace file index is temporarily unavailable")
		return
	}
	var req contextFileRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Path == "" {
		writeError(w, http.StatusBadRequest, "invalid_body", "path required")
		return
	}
	if req.Mode == "" {
		req.Mode = "read"
	}
	cf := gact.ContextFile{Path: req.Path, Mode: req.Mode, AddedAt: time.Now().UTC().Format(time.RFC3339)}
	if info, err := os.Stat(req.Path); err == nil && info.Mode().IsRegular() {
		cf.Size = info.Size()
		cf.LastModified = info.ModTime().UTC().Format(time.RFC3339)
		cf.Language = contextFileLanguage(req.Path)
	}
	s.contextFiles.add(id, cf)
	writeJSON(w, http.StatusCreated, cf)
}

func (s *Server) handleUploadAttachment(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, err := s.store.GetSession(id); err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	var req attachmentUploadRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.File) == "" {
		writeError(w, http.StatusBadRequest, "invalid_body", "file required")
		return
	}
	data, err := base64.StdEncoding.DecodeString(req.File)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", "file must be valid base64")
		return
	}
	name := path.Base(strings.ReplaceAll(strings.TrimSpace(req.Filename), "\\", "/"))
	if name == "." || name == "/" || name == "" {
		writeError(w, http.StatusBadRequest, "invalid_body", "filename required")
		return
	}
	mode := req.Mode
	if mode == "" {
		mode = "read"
	}
	if mode != "read" && mode != "pin" {
		writeError(w, http.StatusBadRequest, "invalid_body", "mode must be read or pin")
		return
	}
	dir, err := os.MkdirTemp("", "gact-attachment-"+id+"-")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "attachment_error", err.Error())
		return
	}
	dest := filepath.Join(dir, name)
	if err := os.WriteFile(dest, data, 0o600); err != nil {
		writeError(w, http.StatusInternalServerError, "attachment_error", err.Error())
		return
	}
	cf := gact.ContextFile{
		Path:     dest,
		Mode:     mode,
		AddedAt:  time.Now().UTC().Format(time.RFC3339),
		Size:     int64(len(data)),
		Language: contextFileLanguage(name),
		Uploaded: true,
	}
	s.contextFiles.add(id, cf)
	s.bus.Publish(events.Event{
		Type:      "context.file.added",
		SessionID: id,
		Payload:   map[string]any{"session_id": id, "file": cf},
	})
	writeJSON(w, http.StatusOK, cf)
}

func (s *Server) handleContextFileContent(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, err := s.store.GetSession(id); err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	rawPath := strings.TrimSpace(r.URL.Query().Get("path"))
	if rawPath == "" {
		writeError(w, http.StatusBadRequest, "invalid_query", "path required")
		return
	}
	var cf gact.ContextFile
	found := false
	for _, candidate := range s.contextFiles.get(id) {
		if candidate.Path == rawPath {
			cf = candidate
			found = true
			break
		}
	}
	if !found {
		writeError(w, http.StatusNotFound, "file_not_in_context", "no such file in context")
		return
	}
	data, err := os.ReadFile(cf.Path)
	if err != nil {
		writeError(w, http.StatusNotFound, "file_not_found", "context file not found on disk")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"file": gact.ContextFileContent{
			Path:        cf.Path,
			DisplayPath: cf.Path,
			Size:        int64(len(data)),
			MediaType:   contextFileMediaType(cf.Path, data),
			Encoding:    "base64",
			Data:        base64.StdEncoding.EncodeToString(data),
		},
	})
}

func (s *Server) handleDeleteContextFile(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req contextFileRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if !s.contextFiles.remove(id, req.Path) {
		writeError(w, http.StatusNotFound, "file_not_in_context", "no such file in context")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handlePatchContextFile(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req contextFileRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if cf, ok := s.contextFiles.update(id, req.Path, req.Mode); ok {
		writeJSON(w, http.StatusOK, cf)
		return
	}
	writeError(w, http.StatusNotFound, "file_not_in_context", "no such file in context")
}

func contextFileLanguage(filePath string) string {
	switch strings.ToLower(filepath.Ext(filePath)) {
	case ".md", ".markdown":
		return "markdown"
	case ".go":
		return "go"
	case ".py":
		return "python"
	case ".json":
		return "json"
	case ".yaml", ".yml":
		return "yaml"
	case ".txt", ".log":
		return "text"
	default:
		return ""
	}
}

func contextFileMediaType(filePath string, data []byte) string {
	if len(data) >= 8 && string(data[:8]) == "\x89PNG\r\n\x1a\n" {
		return "image/png"
	}
	switch strings.ToLower(filepath.Ext(filePath)) {
	case ".md", ".markdown":
		return "text/markdown; charset=utf-8"
	case ".json":
		return "application/json; charset=utf-8"
	case ".yaml", ".yml":
		return "application/yaml; charset=utf-8"
	case ".go":
		return "text/x-go; charset=utf-8"
	case ".py":
		return "text/x-python; charset=utf-8"
	case ".txt", ".log":
		return "text/plain; charset=utf-8"
	default:
		if utf8.Valid(data) {
			return "text/plain; charset=utf-8"
		}
		return "application/octet-stream"
	}
}

// Workspace files: minimal listing of a tree on disk. Returns 200 with empty
// list if the workspace's root_path doesn't exist (emulator may not have
// the directory). This avoids surprising the TUI with errors.

func (s *Server) handleWorkspaceFiles(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	ws, err := s.store.GetWorkspace(id)
	if err != nil {
		writeStoreError(w, err, "workspace_not_found", "invalid_workspace")
		return
	}
	// T3: if the workspace's RootPath exists on disk as a real dir
	// AND the cfg.WalkWorkspaceFiles flag is on, walk it. Otherwise
	// return the static demo list so deterministic tests keep
	// passing without touching the filesystem.
	if s.cfg.WalkWorkspaceFiles && ws.RootPath != "" {
		if entries, ok := walkWorkspaceFiles(ws.RootPath); ok {
			writeJSON(w, http.StatusOK, map[string]any{"entries": entries})
			return
		}
	}
	// Static demo entries — the emulator doesn't walk a filesystem
	// by default to keep behaviour deterministic across CI
	// environments. The list is intentionally richer than the three
	// placeholders we started with so the TUI's @-file picker (M6)
	// has real material to fuzzy-match.
	const ts = "2026-04-15T10:00:00Z"
	writeJSON(w, http.StatusOK, map[string]any{"entries": []gact.FileEntry{
		{Path: "main.go", Type: "file", Size: 1024, Modified: ts},
		{Path: "README.md", Type: "file", Size: 512, Modified: ts},
		{Path: "go.mod", Type: "file", Size: 180, Modified: ts},
		{Path: "go.sum", Type: "file", Size: 4096, Modified: ts},
		{Path: "Makefile", Type: "file", Size: 320, Modified: ts},
		{Path: "internal", Type: "dir"},
		{Path: "internal/server/server.go", Type: "file", Size: 2400, Modified: ts},
		{Path: "internal/server/handlers.go", Type: "file", Size: 1800, Modified: ts},
		{Path: "internal/server/router.go", Type: "file", Size: 900, Modified: ts},
		{Path: "internal/store/store.go", Type: "file", Size: 3200, Modified: ts},
		{Path: "internal/store/store_test.go", Type: "file", Size: 2100, Modified: ts},
		{Path: "internal/events/bus.go", Type: "file", Size: 1500, Modified: ts},
		{Path: "pkg/gact/messaging.go", Type: "file", Size: 3600, Modified: ts},
		{Path: "pkg/gact/catalog.go", Type: "file", Size: 2800, Modified: ts},
		{Path: "cmd/server/main.go", Type: "file", Size: 1400, Modified: ts},
		{Path: "docs/architecture.md", Type: "file", Size: 5200, Modified: ts},
		{Path: "docs/contributing.md", Type: "file", Size: 1800, Modified: ts},
	}})
}

// walkWorkspaceFiles lists the real files under root. Returns
// (nil, false) if the root isn't a readable directory — callers fall
// back to the static list. Skips dotfiles + node_modules + .git to
// stay useful; a future flag could expose the full tree.
func walkWorkspaceFiles(root string) ([]gact.FileEntry, bool) {
	info, err := os.Stat(root)
	if err != nil || !info.IsDir() {
		return nil, false
	}
	var entries []gact.FileEntry
	walkErr := filepath.Walk(root, func(p string, fi os.FileInfo, err error) error {
		if err != nil {
			return nil // skip unreadable nodes
		}
		if p == root {
			return nil
		}
		name := fi.Name()
		if strings.HasPrefix(name, ".") || name == "node_modules" ||
			name == "vendor" || name == "target" {
			if fi.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		rel, relErr := filepath.Rel(root, p)
		if relErr != nil {
			return nil
		}
		entry := gact.FileEntry{
			Path:     filepath.ToSlash(rel),
			Modified: fi.ModTime().UTC().Format("2006-01-02T15:04:05Z"),
		}
		if fi.IsDir() {
			entry.Type = "dir"
		} else {
			entry.Type = "file"
			entry.Size = fi.Size()
		}
		entries = append(entries, entry)
		// Cap at 2000 entries — protects the TUI from 100K-file
		// monorepo floods, which would blow up the picker anyway.
		if len(entries) >= 2000 {
			return filepath.SkipAll
		}
		return nil
	})
	if walkErr != nil {
		return nil, false
	}
	return entries, true
}

func (s *Server) handleWorkspaceFileRead(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, err := s.store.GetWorkspace(id); err != nil {
		writeStoreError(w, err, "workspace_not_found", "invalid_workspace")
		return
	}
	p := r.URL.Query().Get("path")
	if p == "" {
		writeError(w, http.StatusBadRequest, "invalid_query", "path required")
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("// demo content of " + path.Base(p) + "\npackage main\n\nfunc main() {}\n"))
}

func (s *Server) handleRepoMap(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, err := s.store.GetWorkspace(id); err != nil {
		writeStoreError(w, err, "workspace_not_found", "invalid_workspace")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"tree": &gact.RepoMapNode{
			Path: "/", Type: "dir", Children: []*gact.RepoMapNode{
				{Path: "main.go", Type: "file", Symbols: []string{"main", "init"}},
				{Path: "README.md", Type: "file"},
				{Path: "internal", Type: "dir", Children: []*gact.RepoMapNode{
					{Path: "internal/handler.go", Type: "file", Symbols: []string{"Handler", "ServeHTTP"}},
				}},
			},
		},
		"tokens": 1024,
	})
}

// --- §6.10 Diffs -----------------------------------------------------------

// Diffs are stored in messages (file_diff parts). The handlers below scan
// the session's messages and aggregate.

func (s *Server) handleSessionDiffs(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, err := s.store.GetSession(id); err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	diffs := collectDiffs(s, id, "")
	writeJSON(w, http.StatusOK, map[string]any{"diffs": diffs})
}

func (s *Server) handleMessageDiffs(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	mid := r.PathValue("msg_id")
	if _, err := s.store.GetSession(id); err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	diffs := collectDiffs(s, id, mid)
	writeJSON(w, http.StatusOK, map[string]any{"diffs": diffs})
}

type applyRejectRequest struct {
	Paths []string `json:"paths,omitempty"`
}

func (s *Server) handleDiffApply(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, err := s.store.GetSession(id); err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	var req applyRejectRequest
	if !decodeJSONOptional(w, r, &req) {
		return
	}
	pathSet := setOf(req.Paths)
	applied := []string{}
	walkDiffParts(s, id, "", func(msgID, partID string, p *gact.Part) {
		if len(pathSet) > 0 && !pathSet[p.Path] {
			return
		}
		_, _ = s.store.UpdateMessagePart(msgID, partID, func(pp *gact.Part) {
			pp.Applied = true
		})
		applied = append(applied, p.Path)
	})
	writeJSON(w, http.StatusOK, map[string]any{"applied": applied})
}

func (s *Server) handleDiffReject(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, err := s.store.GetSession(id); err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	var req applyRejectRequest
	if !decodeJSONOptional(w, r, &req) {
		return
	}
	pathSet := setOf(req.Paths)
	rejected := []string{}
	walkDiffParts(s, id, "", func(msgID, partID string, p *gact.Part) {
		if len(pathSet) > 0 && !pathSet[p.Path] {
			return
		}
		_, _ = s.store.UpdateMessagePart(msgID, partID, func(pp *gact.Part) {
			pp.Applied = false
			if pp.Metadata == nil {
				pp.Metadata = map[string]any{}
			}
			pp.Metadata["rejected"] = true
		})
		rejected = append(rejected, p.Path)
	})
	writeJSON(w, http.StatusOK, map[string]any{"rejected": rejected})
}

type undoRequest struct {
	Count int `json:"count,omitempty"`
}

// rewindRequest is the body for POST /v1/sessions/{id}/rewind (MMM7).
type rewindRequest struct {
	ToMessageID   string `json:"to_message_id"`
	IncludeTarget bool   `json:"include_target,omitempty"`
}

func (s *Server) handleSessionRewind(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, err := s.store.GetSession(id); err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	var req rewindRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.ToMessageID == "" {
		writeError(w, http.StatusBadRequest, "invalid_body", "to_message_id required")
		return
	}
	// Pull the full ordered list (newest-first per ListMessages
	// contract). Find the target, then delete every message AFTER it
	// (= everything ahead of it in newest-first order, since "after"
	// in time is "before" in the slice).
	msgs, _, _ := s.store.ListMessages(store.MessageFilter{
		SessionID: id, Limit: 100000, IncludeSystem: true,
	})
	targetIdx := -1
	for i, m := range msgs {
		if m.ID == req.ToMessageID {
			targetIdx = i
			break
		}
	}
	if targetIdx < 0 {
		writeError(w, http.StatusNotFound, "message_not_found",
			"message "+req.ToMessageID+" not found in session "+id)
		return
	}
	deleted := []string{}
	// msgs[0..targetIdx-1] are newer than the target → delete them all.
	for i := 0; i < targetIdx; i++ {
		if err := s.store.DeleteMessage(msgs[i].ID); err == nil {
			deleted = append(deleted, msgs[i].ID)
		}
	}
	if req.IncludeTarget {
		if err := s.store.DeleteMessage(req.ToMessageID); err == nil {
			deleted = append(deleted, req.ToMessageID)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"deleted_messages": deleted})
}

func (s *Server) handleSessionUndo(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, err := s.store.GetSession(id); err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	var req undoRequest
	if !decodeJSONOptional(w, r, &req) {
		return
	}
	count := req.Count
	if count <= 0 {
		count = 1
	}
	msgs, _, _ := s.store.ListMessages(store.MessageFilter{
		SessionID: id, Limit: count, IncludeSystem: true,
	})
	reverted := []string{}
	for _, m := range msgs {
		if err := s.store.DeleteMessage(m.ID); err == nil {
			reverted = append(reverted, m.ID)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"reverted_messages": reverted})
}

func collectDiffs(s *Server, sessionID, onlyMsgID string) []gact.FileDiff {
	out := []gact.FileDiff{}
	walkDiffParts(s, sessionID, onlyMsgID, func(_, _ string, p *gact.Part) {
		out = append(out, gact.FileDiff{
			Path:     p.Path,
			Before:   p.Before,
			After:    p.After,
			Language: p.Language,
			Applied:  p.Applied,
		})
	})
	return out
}

func walkDiffParts(s *Server, sessionID, onlyMsgID string, fn func(msgID, partID string, p *gact.Part)) {
	msgs, _, _ := s.store.ListMessages(store.MessageFilter{
		SessionID: sessionID, Limit: 100000, IncludeSystem: true,
	})
	for _, m := range msgs {
		if onlyMsgID != "" && m.ID != onlyMsgID {
			continue
		}
		for i := range m.Parts {
			if m.Parts[i].Type == gact.PartTypeFileDiff {
				fn(m.ID, m.Parts[i].ID, &m.Parts[i])
			}
		}
	}
}

func setOf(s []string) map[string]bool {
	if len(s) == 0 {
		return nil
	}
	m := make(map[string]bool, len(s))
	for _, v := range s {
		m[v] = true
	}
	return m
}

// trim is unused but kept for future use / linter happy.
var _ = strings.TrimSpace
