package client

import (
	"context"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

// --- §6.12 providers + models ----------------------------------------------

func (c *Client) ListProviders(ctx context.Context) ([]gact.Provider, error) {
	var out struct {
		Providers []gact.Provider `json:"providers"`
	}
	err := c.do(ctx, http.MethodGet, "/v1/providers", nil, &out)
	return out.Providers, err
}

// LMProviderPreset is a row in CLIO's provider picker. “RequiresAPIKey“
// tells the TUI's modal whether to render the api_key field.
type LMProviderPreset struct {
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

// LMProviderInfo is the GET /v1/providers/lm body — current LM
// config + presets to populate the picker. Backends that don't
// expose this surface (every non-CLIO backend today) return 404,
// which the TUI handles as "no in-app config available".
type LMProviderInfo struct {
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
	Presets        []LMProviderPreset `json:"presets,omitempty"`
}

// LMProviderRequest is the PUT /v1/providers/lm body. Provider is
// the selected provider/preset id accepted by CLIO, for example
// "openai", "lm_studio", or an ALCF profile such as
// "argonne_metis".
//
// Temperature + MaxTokens are forwarded to the upstream LM. Sending
// 0/0 means "use server defaults" — the JSON omitempty drops the
// fields so CLIO falls back to LMProviderRequest defaults
// (temperature=0.0, max_tokens=0 so the server picks a context-aware
// default).
//
// ThinkingBudget controls reasoning effort/budget (0 = disabled). On
// Anthropic it maps to thinking.budget_tokens; on OpenAI/Codex it's
// bucketed into reasoning_effort low/medium/high.
type LMProviderRequest struct {
	Provider       string  `json:"provider"`
	APIBase        string  `json:"api_base"`
	Model          string  `json:"model"`
	APIKey         string  `json:"api_key"`
	Temperature    float64 `json:"temperature,omitempty"`
	MaxTokens      int     `json:"max_tokens,omitempty"`
	ContextLength  int     `json:"context_length,omitempty"`
	ThinkingBudget int     `json:"thinking_budget,omitempty"`
	Parallel       int     `json:"parallel,omitempty"`
}

// GetLMProvider fetches /v1/providers/lm. Returns nil + nil error
// when the endpoint isn't supported by this backend (404) so the
// caller can decide whether to show the modal or skip it.
func (c *Client) GetLMProvider(ctx context.Context) (*LMProviderInfo, error) {
	var out LMProviderInfo
	err := c.do(ctx, http.MethodGet, "/v1/providers/lm", nil, &out)
	if err != nil {
		if strings.Contains(err.Error(), "404") || strings.Contains(err.Error(), "501") {
			return nil, nil
		}
		return nil, err
	}
	return &out, nil
}

// PutLMProvider PUTs the user's LM choice, returning the updated
// LMProviderInfo. The backend builds the LM + agent in-place;
// errors come back as the v0.2 envelope (HTTP 400 with detail).
func (c *Client) PutLMProvider(ctx context.Context, req LMProviderRequest) (*LMProviderInfo, error) {
	var out LMProviderInfo
	err := c.do(ctx, http.MethodPut, "/v1/providers/lm", req, &out)
	if err != nil {
		return nil, err
	}
	return &out, nil
}

// WaitLMProvider long-polls CLIO until an async provider reconfiguration
// reaches a terminal state. Older backends return 404/501; callers should
// treat that as "wait unsupported" and use the PUT response they already have.
func (c *Client) WaitLMProvider(ctx context.Context, timeoutSeconds float64) (*LMProviderInfo, error) {
	var out LMProviderInfo
	q := url.Values{}
	if timeoutSeconds > 0 {
		q.Set("timeout", strconv.FormatFloat(timeoutSeconds, 'f', -1, 64))
	}
	err := c.do(ctx, http.MethodGet, "/v1/providers/lm/wait"+queryString(q), nil, &out)
	if err != nil {
		if strings.Contains(err.Error(), "404") || strings.Contains(err.Error(), "501") {
			return nil, nil
		}
		return nil, err
	}
	return &out, nil
}

func (c *Client) ListProviderModels(ctx context.Context, providerID string) ([]gact.Model, error) {
	var out struct {
		Models []gact.Model `json:"models"`
	}
	err := c.do(ctx, http.MethodGet, "/v1/providers/"+providerID+"/models", nil, &out)
	return out.Models, err
}

// ProviderModelsResponse is the full /v1/providers/{id}/models body —
// includes Source ("live"/"static_catalog"/"unavailable") and a human-readable
// Error string when the backend fell back. Lets the TUI render an
// actionable banner ("token expired, run …") instead of silently
// pretending a stale catalog is the truth.
type ProviderModelsResponse struct {
	Models []gact.Model `json:"models"`
	Source string       `json:"source,omitempty"`
	Error  string       `json:"error,omitempty"`
}

// ProviderHandshakeResponse is CLIO's report-only provider probe. It does not
// mutate the active LM config; it reports connectivity/auth/catalog health and
// per-model runtime metadata such as chosen context.
type ProviderHandshakeResponse struct {
	Models       []gact.Model `json:"models"`
	Source       string       `json:"source,omitempty"`
	Error        string       `json:"error,omitempty"`
	Connectivity string       `json:"connectivity,omitempty"`
	Auth         string       `json:"auth,omitempty"`
	LatencyMS    float64      `json:"latency_ms,omitempty"`
	GeneratedAt  string       `json:"generated_at,omitempty"`
	ProviderID   string       `json:"provider_id,omitempty"`
	ProviderKind string       `json:"provider_kind,omitempty"`
}

// ListProviderModelsDetailed returns the full response so callers
// can surface fallback warnings. Newer call sites should prefer this
// over ListProviderModels (which discards the source/error fields
// for backward compat).
func (c *Client) ListProviderModelsDetailed(
	ctx context.Context,
	providerID string,
	apiBaseOverride string,
) (ProviderModelsResponse, error) {
	var out ProviderModelsResponse
	path := "/v1/providers/" + providerID + "/models"
	if strings.TrimSpace(apiBaseOverride) != "" {
		q := url.Values{}
		q.Set("api_base", apiBaseOverride)
		path += "?" + q.Encode()
	}
	err := c.do(ctx, http.MethodGet, path, nil, &out)
	return out, err
}

func (c *Client) ProviderHandshake(
	ctx context.Context,
	providerID string,
	apiBaseOverride string,
	refresh bool,
) (ProviderHandshakeResponse, error) {
	var out ProviderHandshakeResponse
	path := "/v1/providers/" + url.PathEscape(providerID) + "/handshake"
	q := url.Values{}
	if strings.TrimSpace(apiBaseOverride) != "" {
		q.Set("api_base", apiBaseOverride)
	}
	if refresh {
		q.Set("refresh", "true")
	}
	path += queryString(q)
	err := c.do(ctx, http.MethodGet, path, nil, &out)
	return out, err
}

// ProviderAuthRequest is the body of POST /v1/providers/{id}/auth.
// Both fields are optional and provider-specific:
//
//   - Force re-drives the OAuth handshake even if a cached token is
//     still valid.
//   - APIKey carries a user-pasted API key for AuthMethodAPIKey
//     providers; the backend persists it on the running process.
type ProviderAuthRequest struct {
	Force  bool   `json:"force,omitempty"`
	APIKey string `json:"api_key,omitempty"`
}

// ProviderAuthResponse is what the backend returns after an auth
// attempt. RedirectURL is set when the backend wants the TUI to open
// a browser tab; Instructions is a human-readable fallback when the
// backend can only print to its own terminal.
type ProviderAuthResponse struct {
	IsAuthenticated bool   `json:"is_authenticated"`
	ProviderID      string `json:"provider_id"`
	RedirectURL     string `json:"redirect_url,omitempty"`
	Instructions    string `json:"instructions,omitempty"`
}

// AuthProvider drives POST /v1/providers/{id}/auth. The caller's
// responsibility to gate on AuthProvider.NeedsLogin() before invoking.
func (c *Client) AuthProvider(
	ctx context.Context, providerID string, req ProviderAuthRequest,
) (ProviderAuthResponse, error) {
	var out ProviderAuthResponse
	err := c.do(ctx, http.MethodPost, "/v1/providers/"+providerID+"/auth", req, &out)
	return out, err
}
