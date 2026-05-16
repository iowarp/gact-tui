package gact

// Catalog types — providers, models, tools, MCP servers, agents, commands.
// These reflect SPEC §6.5 (agents), §6.6 (tools), §6.7 (MCP), §6.12
// (providers), §6.13 (commands), §6.16 (metrics).

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
	// ollama on localhost, codex via the CLI subscription, ALCF
	// compute-node vLLMs that accept the literal "EMPTY" key).
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
	ContextWindow   int            `json:"context_window"`
	MaxOutputTokens int            `json:"max_output_tokens"`
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

// Tool describes a callable tool (SPEC §4.6).
type Tool struct {
	ID                string           `json:"id"`
	Source            string           `json:"source"` // builtin|mcp|recipe|extension
	ServerID          string           `json:"server_id,omitempty"`
	Name              string           `json:"name"`
	Title             string           `json:"title,omitempty"`
	Description       string           `json:"description,omitempty"`
	InputSchema       map[string]any   `json:"input_schema"`
	OutputSchema      map[string]any   `json:"output_schema,omitempty"`
	Annotations       *ToolAnnotations `json:"annotations,omitempty"`
	PermissionDefault string           `json:"permission_default,omitempty"` // "allow"|"ask"|"deny"
}

// AgentDef is a reusable agent persona/recipe (SPEC §6.5).
//
// v0.2 (SPEC §4.3.1): Tier, Specialization, Keywords are optional
// fields that let a backend advertise a multi-tier agent hierarchy.
// Backends with capabilities.agent_routing = true populate them on
// tier-2 specialists so the TUI can render a routing badge and
// colour it by specialization.
type AgentDef struct {
	ID           string           `json:"id"`
	Source       string           `json:"source"` // builtin|user|recipe|skill
	Title        string           `json:"title"`
	Description  string           `json:"description,omitempty"`
	SystemPrompt string           `json:"system_prompt,omitempty"`
	Parameters   []AgentParameter `json:"parameters,omitempty"`
	DefaultModel *ModelRef        `json:"default_model,omitempty"`
	Tools        []string         `json:"tools,omitempty"`
	Metadata     map[string]any   `json:"metadata,omitempty"`

	// v0.2 — multi-tier routing (optional; absent = tier-1 or untagged)
	Tier           int      `json:"tier,omitempty"`           // 1 = orchestrator, 2 = specialist, 3 = nanoagent
	Specialization string   `json:"specialization,omitempty"` // free-form tag — UI palette hint (code_editing, data_analysis, research, …)
	Keywords       []string `json:"keywords,omitempty"`       // intent tokens the tier-1 router matches
}

// AgentParameter is a fillable input on an agent recipe.
type AgentParameter struct {
	Name        string   `json:"name"`
	Type        string   `json:"type"` // string|number|select|multiline
	Required    bool     `json:"required,omitempty"`
	Description string   `json:"description,omitempty"`
	Options     []string `json:"options,omitempty"`
}

// McpServer is one connected MCP server (SPEC §6.7).
type McpServer struct {
	ID                   string          `json:"id"`
	Name                 string          `json:"name"`
	Version              string          `json:"version,omitempty"`
	Transport            string          `json:"transport"` // "stdio" | "http"
	ProtocolVersion      string          `json:"protocol_version"`
	Status               string          `json:"status"` // connecting|ready|error|disconnected
	ServerInfo           map[string]any  `json:"server_info,omitempty"`
	Instructions         string          `json:"instructions,omitempty"`
	DeclaredCapabilities McpCapabilities `json:"declared_capabilities"`
	LastError            string          `json:"last_error,omitempty"`
}

// McpCapabilities describes which MCP capabilities a server declares.
type McpCapabilities struct {
	Tools     bool                    `json:"tools"`
	Resources *McpResourcesCapability `json:"resources,omitempty"`
	Prompts   *McpPromptsCapability   `json:"prompts,omitempty"`
	Logging   bool                    `json:"logging"`
}

type McpResourcesCapability struct {
	Subscribe   bool `json:"subscribe"`
	ListChanged bool `json:"list_changed"`
}

type McpPromptsCapability struct {
	ListChanged bool `json:"list_changed"`
}

// McpResource is a resource exposed by an MCP server (SPEC §6.7).
type McpResource struct {
	ServerID    string         `json:"server_id"`
	URI         string         `json:"uri"`
	Name        string         `json:"name,omitempty"`
	Title       string         `json:"title,omitempty"`
	Description string         `json:"description,omitempty"`
	MimeType    string         `json:"mime_type,omitempty"`
	Size        int64          `json:"size,omitempty"`
	Annotations map[string]any `json:"annotations,omitempty"`
}

// McpResourceTemplate is a parameterized resource URI template.
type McpResourceTemplate struct {
	ServerID    string `json:"server_id"`
	URITemplate string `json:"uri_template"`
	Name        string `json:"name,omitempty"`
	Description string `json:"description,omitempty"`
	MimeType    string `json:"mime_type,omitempty"`
}

// McpContent is the content returned from resources/read.
type McpContent struct {
	URI      string `json:"uri"`
	MimeType string `json:"mime_type,omitempty"`
	Text     string `json:"text,omitempty"`
	Data     string `json:"data,omitempty"` // base64
}

// McpPrompt is a templated prompt exposed by a server (SPEC §6.7).
type McpPrompt struct {
	ServerID    string         `json:"server_id"`
	Name        string         `json:"name"`
	Title       string         `json:"title,omitempty"`
	Description string         `json:"description,omitempty"`
	Arguments   []McpPromptArg `json:"arguments,omitempty"`
}

type McpPromptArg struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Required    bool   `json:"required,omitempty"`
}

// McpMessage is one message returned from prompts/get.
type McpMessage struct {
	Role    string `json:"role"`
	Content []Part `json:"content"`
}

// ContextFile is a file pinned into a session's context (SPEC §6.9).
type ContextFile struct {
	Path         string `json:"path"`
	Mode         string `json:"mode"` // "edit"|"read"|"pin"
	AddedAt      string `json:"added_at"`
	LastModified string `json:"last_modified,omitempty"`
	Size         int64  `json:"size,omitempty"`
	Language     string `json:"language,omitempty"`
}

// FileEntry is one entry from a directory listing.
type FileEntry struct {
	Path     string `json:"path"`
	Type     string `json:"type"` // "file" | "dir"
	Size     int64  `json:"size,omitempty"`
	Modified string `json:"modified,omitempty"`
}

// RepoMapNode is one node in the repo map tree.
type RepoMapNode struct {
	Path     string         `json:"path"`
	Type     string         `json:"type"` // "file" | "dir"
	Children []*RepoMapNode `json:"children,omitempty"`
	// Symbols is a brief code outline if available (e.g. tree-sitter).
	Symbols []string `json:"symbols,omitempty"`
}

// FileDiff is a proposed file change (also a Part type via Part.Path/Before/After).
type FileDiff struct {
	Path     string  `json:"path"`
	Before   *string `json:"before"`
	After    *string `json:"after"`
	Language string  `json:"language,omitempty"`
	Applied  bool    `json:"applied"`
}

// Command is one slash command available in the catalog (SPEC §6.13).
type Command struct {
	ID          string           `json:"id"`
	Title       string           `json:"title"`
	Description string           `json:"description,omitempty"`
	Source      string           `json:"source"` // builtin|mcp_prompt|recipe|user
	ServerID    string           `json:"server_id,omitempty"`
	Arguments   []AgentParameter `json:"arguments,omitempty"`
	Shortcut    string           `json:"shortcut,omitempty"`
}

// Metrics is the body of GET /v1/metrics (SPEC §6.16).
type Metrics struct {
	UptimeS   int                           `json:"uptime_s"`
	Sessions  MetricsSessions               `json:"sessions"`
	Messages  MetricsMessages               `json:"messages"`
	Tokens    MetricsTokens                 `json:"tokens"`
	Cost      MetricsCost                   `json:"cost"`
	Latencies map[string]MetricsLatencyStat `json:"latencies,omitempty"`
}

// MetricsLatencyStat is one row of per-route timing — keyed by mux
// pattern (e.g. "GET /v1/sessions/{id}"). count is total samples ever
// observed; the percentiles come from a recent-1024-sample reservoir.
type MetricsLatencyStat struct {
	Count int     `json:"count"`
	P50Ms float64 `json:"p50_ms"`
	P95Ms float64 `json:"p95_ms"`
	MaxMs float64 `json:"max_ms"`
}

type MetricsSessions struct {
	Total    int            `json:"total"`
	Active   int            `json:"active"`
	ByStatus map[string]int `json:"by_status"`
}

type MetricsMessages struct {
	Total  int            `json:"total"`
	ByRole map[string]int `json:"by_role"`
}

type MetricsTokens struct {
	InputTotal      int `json:"input_total"`
	OutputTotal     int `json:"output_total"`
	CacheReadTotal  int `json:"cache_read_total"`
	CacheWriteTotal int `json:"cache_write_total"`
}

type MetricsCost struct {
	TotalUSD   float64            `json:"total_usd"`
	ByProvider map[string]float64 `json:"by_provider"`
}
