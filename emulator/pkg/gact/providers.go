package gact

// Provider is an LLM provider (SPEC §6.12).
type Provider struct {
	ID              string         `json:"id"`
	Name            string         `json:"name"`
	AuthMethods     []string       `json:"auth_methods"`
	IsAuthenticated bool           `json:"is_authenticated"`
	DefaultModel    string         `json:"default_model,omitempty"`
	Metadata        map[string]any `json:"metadata,omitempty"`
}

// AuthMethod is one of the spec's enumerated authentication schemes
// for §6.12 providers. The wire is a string so future schemes (device
// codes, mTLS, …) Just Work; the constants below are the cases the
// TUI knows how to drive interactively today.
type AuthMethod string

const (
	// AuthMethodNone — provider needs no credentials (lm_studio /
	// ollama on localhost, codex via the CLI subscription, and local
	// OpenAI-compatible vLLM servers that accept the literal "EMPTY" key).
	AuthMethodNone AuthMethod = "none"

	// AuthMethodAPIKey — user pastes a long-lived API key (Anthropic,
	// OpenAI, OpenRouter, and any other cloud provider behind a
	// static bearer).
	AuthMethodAPIKey AuthMethod = "api_key"

	// AuthMethodOAuth — backend drives a multi-step browser flow on
	// the user's behalf (ALCF Sophia / Polaris via Globus Auth).
	AuthMethodOAuth AuthMethod = "oauth"
)

// AuthProvider wraps Provider with typed helpers for the auth flow.
// Embeds Provider so every wire field stays accessible by direct
// field access; method dispatch (NeedsLogin, Method) keeps the
// modal's render code free of slice-scanning.
type AuthProvider struct {
	Provider
}

// WrapProvider lifts a wire Provider into an AuthProvider.
func WrapProvider(p Provider) AuthProvider {
	return AuthProvider{Provider: p}
}

// Method returns the primary auth method this provider declares.
// Falls back to AuthMethodNone when the slice is empty or contains
// only unknown values, so the settings modal never crashes on a
// malformed catalog.
func (a AuthProvider) Method() AuthMethod {
	for _, raw := range a.AuthMethods {
		switch m := AuthMethod(raw); m {
		case AuthMethodOAuth, AuthMethodAPIKey, AuthMethodNone:
			return m
		}
	}
	return AuthMethodNone
}

// NeedsLogin reports whether the user must take action before the
// provider can serve traffic. Always false for AuthMethodNone, false
// when IsAuthenticated, true otherwise.
func (a AuthProvider) NeedsLogin() bool {
	if a.IsAuthenticated {
		return false
	}
	switch a.Method() {
	case AuthMethodOAuth, AuthMethodAPIKey:
		return true
	default:
		return false
	}
}

// Model is one LLM offered by a provider (SPEC §6.12).
type Model struct {
	ID              string         `json:"id"`
	Name            string         `json:"name"`
	Description     string         `json:"description,omitempty"`
	ContextWindow   int            `json:"context_window"`
	MaxOutputTokens int            `json:"max_output_tokens"`
	ChosenContext   int            `json:"chosen_context,omitempty"`
	ContextSource   string         `json:"context_source,omitempty"`
	IsReasoning     bool           `json:"is_reasoning,omitempty"`
	NativeToolCalls bool           `json:"native_tool_calling,omitempty"`
	Supports        ModelSupports  `json:"supports"`
	Pricing         *ModelPricing  `json:"pricing,omitempty"`
	Metadata        map[string]any `json:"metadata,omitempty"`
}

// ModelSupports captures capability flags for a model.
type ModelSupports struct {
	Tools         bool `json:"tools"`
	Vision        bool `json:"vision"`
	Thinking      bool `json:"thinking"`
	ComputerUse   bool `json:"computer_use"`
	PromptCaching bool `json:"prompt_caching"`
}

// ModelPricing is per-million-token pricing.
type ModelPricing struct {
	InputPerMTok      float64 `json:"input_per_mtok"`
	OutputPerMTok     float64 `json:"output_per_mtok"`
	CacheReadPerMTok  float64 `json:"cache_read_per_mtok,omitempty"`
	CacheWritePerMTok float64 `json:"cache_write_per_mtok,omitempty"`
}
