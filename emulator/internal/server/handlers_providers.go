package server

import (
	"net/http"
	"strings"
	"time"

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
	SupportsVision      bool   `json:"supports_vision,omitempty"`
}

type lmProviderInfo struct {
	Configured     bool               `json:"configured"`
	Provider       string             `json:"provider,omitempty"`
	APIBase        string             `json:"api_base,omitempty"`
	Model          string             `json:"model,omitempty"`
	Temperature    float64            `json:"temperature,omitempty"`
	MaxTokens      int                `json:"max_tokens,omitempty"`
	ContextLength  int                `json:"context_length,omitempty"`
	ChosenContext  int                `json:"chosen_context,omitempty"`
	ContextWindow  int                `json:"context_window,omitempty"`
	IsReasoning    bool               `json:"is_reasoning,omitempty"`
	NativeToolCall bool               `json:"native_tool_calling,omitempty"`
	ThinkingBudget int                `json:"thinking_budget,omitempty"`
	Transport      string             `json:"transport,omitempty"`
	State          string             `json:"state,omitempty"`
	StatusMessage  string             `json:"status_message,omitempty"`
	Error          string             `json:"error,omitempty"`
	OperationID    string             `json:"operation_id,omitempty"`
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
	Parallel       int     `json:"parallel,omitempty"`
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

func (s *Server) handleWaitLMProvider(w http.ResponseWriter, r *http.Request) {
	if s.cfg.ProviderEdgeStates {
		writeJSON(w, http.StatusOK, edgeLMProviderInfo())
		return
	}
	writeJSON(w, http.StatusOK, staticLMProviderInfo("anthropic", "claude-opus-4-7"))
}

func (s *Server) handleProviderHandshake(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		writeError(w, http.StatusBadRequest, "provider_required", "provider id required")
		return
	}
	source := "live"
	connectivity := "ok"
	auth := "ok"
	errText := ""
	models, ok := staticModels()[id]
	if !ok && id == "argonne_sophia" {
		models = []gact.Model{{
			ID:              "openai/gpt-oss-120b",
			Name:            "GPT OSS 120B",
			ContextWindow:   131072,
			MaxOutputTokens: 32768,
			ChosenContext:   131072,
			ContextSource:   "provider_handshake",
			IsReasoning:     true,
			NativeToolCalls: true,
			Supports:        gact.ModelSupports{Tools: true, Thinking: true},
		}}
		ok = true
	}
	if !ok {
		writeError(w, http.StatusNotFound, "provider_not_found", "no provider with id "+id)
		return
	}
	if s.cfg.ProviderEdgeStates && id == "local" {
		source = "unavailable"
		connectivity = "error"
		auth = "unknown"
		errText = "local model catalog unavailable: connection refused on 127.0.0.1:11434"
		models = nil
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"models":        models,
		"source":        source,
		"error":         errText,
		"connectivity":  connectivity,
		"auth":          auth,
		"latency_ms":    12.4,
		"generated_at":  time.Now().UTC().Format(time.RFC3339Nano),
		"provider_id":   id,
		"provider_kind": id,
	})
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
