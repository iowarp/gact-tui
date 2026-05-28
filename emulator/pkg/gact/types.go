// Package gact contains the wire types for the GACT v0.1 contract.
// See contract/SPEC.md in the repo root for the authoritative spec.
package gact

import "time"

// HealthResponse is returned by GET /v1/health (SPEC §3.4).
//
// v0.2: OverallStatus + Integrations are optional fields. Backends
// advertising capabilities.integration_health = true SHOULD populate
// them; clients that don't understand them ignore harmlessly.
type HealthResponse struct {
	Healthy       bool          `json:"healthy"`
	UptimeS       int           `json:"uptime_s"`
	OverallStatus string        `json:"overall_status,omitempty"` // v0.2 — "ready" | "degraded" | "unavailable"
	Integrations  []Integration `json:"integrations,omitempty"`   // v0.2
}

// Integration is one subsystem status row in /v1/health (v0.2).
// Name is free-form (e.g. "lm", "gateway", "memory", "file_policy",
// "api"); unknown names render as a generic row in the TUI.
type Integration struct {
	Name   string `json:"name"`
	Status string `json:"status"` // "ready" | "degraded" | "unavailable"
	Detail string `json:"detail,omitempty"`
}

// MemoryStats is returned by GET /v1/memory/stats (SPEC §6.19, v0.2).
// Backends without an introspectable memory layer set
// capabilities.memory = false and return 501 instead.
type MemoryStats struct {
	Cache    CacheStats          `json:"cache"`
	Session  *SessionMemoryStats `json:"session,omitempty"` // only set when ?session_id= was supplied
	Global   GlobalMemoryStats   `json:"global"`
	Metadata map[string]any      `json:"metadata,omitempty"`
}

// MemorySearchHit is one provenance-heavy transcript memory match returned by
// CLIO's /v1/memory/search endpoint.
type MemorySearchHit struct {
	SessionID    string         `json:"session_id"`
	SessionTitle string         `json:"session_title,omitempty"`
	WorkspaceID  string         `json:"workspace_id,omitempty"`
	MessageID    string         `json:"message_id"`
	PartID       string         `json:"part_id,omitempty"`
	Role         string         `json:"role"`
	CreatedAt    string         `json:"created_at"`
	UpdatedAt    string         `json:"updated_at,omitempty"`
	Text         string         `json:"text"`
	Score        float64        `json:"score,omitempty"`
	MatchTerms   []string       `json:"match_terms,omitempty"`
	Metadata     map[string]any `json:"metadata,omitempty"`
}

// MemorySearchResponse is returned by GET /v1/memory/search.
type MemorySearchResponse struct {
	Query               string            `json:"query"`
	IncludeCrossSession bool              `json:"include_cross_session"`
	SearchedSessions    []string          `json:"searched_sessions,omitempty"`
	Hits                []MemorySearchHit `json:"hits,omitempty"`
	Metadata            map[string]any    `json:"metadata,omitempty"`
}

type CacheStats struct {
	Hits     int     `json:"hits"`
	Misses   int     `json:"misses"`
	HitRate  float64 `json:"hit_rate"` // [0..1]
	Capacity int     `json:"capacity"`
}

type SessionMemoryStats struct {
	SessionID        string `json:"session_id"`
	MessagesRetained int    `json:"messages_retained"`
	TokensRetained   int    `json:"tokens_retained"`
	TokensBudget     *int   `json:"tokens_budget,omitempty"` // null = unbounded
	ProfilesAttached int    `json:"profiles_attached"`       // opaque to the TUI
}

type GlobalMemoryStats struct {
	ConversationsTotal int `json:"conversations_total"`
	InvocationsTotal   int `json:"invocations_total"`
}

// Capabilities is returned by GET /v1/capabilities (SPEC §3.3).
type Capabilities struct {
	ContractVersion string          `json:"contract_version"`
	Backend         BackendInfo     `json:"backend"`
	Capabilities    CapabilityFlags `json:"capabilities"`
	Transports      TransportFlags  `json:"transports"`
	Auth            AuthInfo        `json:"auth"`
	Extensions      []Extension     `json:"extensions"`
}

type BackendInfo struct {
	Name     string `json:"name"`
	Version  string `json:"version"`
	Vendor   string `json:"vendor"`
	Homepage string `json:"homepage,omitempty"`
}

type CapabilityFlags struct {
	Workspaces        bool `json:"workspaces"`
	Sessions          bool `json:"sessions"`
	Subagents         bool `json:"subagents"`
	MCP               bool `json:"mcp"`
	LSP               bool `json:"lsp"`
	Files             bool `json:"files"`
	Diffs             bool `json:"diffs"`
	Permissions       bool `json:"permissions"`
	Providers         bool `json:"providers"`
	Commands          bool `json:"commands"`
	Voice             bool `json:"voice"`
	ScheduledSessions bool `json:"scheduled_sessions"`
	Hooks             bool `json:"hooks"`         // §6.17 — MMM3
	SessionTasks      bool `json:"session_tasks"` // §6.18 — MMM5
	Metrics           bool `json:"metrics"`
	SessionBranching  bool `json:"session_branching"`
	SessionSharing    bool `json:"session_sharing"`
	SessionExport     bool `json:"session_export"`
	CostTracking      bool `json:"cost_tracking"`
	ThinkingBlocks    bool `json:"thinking_blocks"`
	EditModes         bool `json:"edit_modes"`
	PlanMode          bool `json:"plan_mode"`
	SearchMessages    bool `json:"search_messages"`
	AgentWrite        bool `json:"agent_write"`
	SkillsExtraction  bool `json:"skills_extraction"`

	// v0.2 additions — SPEC §3.2.1
	AgentRouting      bool `json:"agent_routing"`      // multi-tier agents + routing_decision part + session.agent_routed event
	Memory            bool `json:"memory"`             // /v1/memory/stats endpoint (§6.19)
	StructuredErrors  bool `json:"structured_errors"`  // §14 typed error_info taxonomy
	IntegrationHealth bool `json:"integration_health"` // /v1/health integrations[] + overall_status
	ToolTelemetry     bool `json:"tool_telemetry"`     // tool_result.cached + duration_ms

	// CLIO vendor extension: prompt registry browse/resolve/save surface.
	XClioPromptRegistry bool `json:"x_clio_prompt_registry"`
}

type TransportFlags struct {
	EventsSSE       bool `json:"events_sse"`
	EventsWebSocket bool `json:"events_websocket"`
}

type AuthInfo struct {
	Schemes []string `json:"schemes"`
	Current string   `json:"current"`
}

type Extension struct {
	ID      string `json:"id"`
	Version string `json:"version"`
	Docs    string `json:"docs,omitempty"`
}

type CapabilityGap struct {
	Status           string         `json:"status,omitempty"`
	Advertised       bool           `json:"advertised"`
	Category         string         `json:"category,omitempty"`
	ClientBehavior   string         `json:"client_behavior,omitempty"`
	RelatedEndpoints []string       `json:"related_endpoints,omitempty"`
	RelatedCommands  []string       `json:"related_commands,omitempty"`
	RecoveryActions  []string       `json:"recovery_actions,omitempty"`
	Metadata         map[string]any `json:"metadata,omitempty"`
}

// Policy is a permission auto-resolution rule (SPEC §6.11). When a
// permission request comes in, the backend walks the policy list in
// order and applies the first one whose patterns match. Glob-style
// patterns: `*` matches any chars except `/`, `**` matches across
// path segments. (MMM4)
type Policy struct {
	Scope             string         `json:"scope"`              // "workspace" | "session"
	ScopeID           string         `json:"scope_id,omitempty"` // empty = any scope
	ToolNamePattern   string         `json:"tool_name_pattern"`  // e.g. "shell" or "*"
	PathPattern       string         `json:"path_pattern,omitempty"`
	Action            string         `json:"action"` // "allow" | "deny" | "ask"
	AnnotationsFilter map[string]any `json:"annotations_filter,omitempty"`
}

// SessionTask is a unit of in-flight work tracked at the session
// level (SPEC §6.18 — MMM5). Backends that fan out subagents or
// plan multi-step turns can publish tasks so TUIs and shell scripts
// can show progress without parsing message history.
type SessionTask struct {
	ID        string         `json:"id"`
	SessionID string         `json:"session_id"`
	Title     string         `json:"title"`
	Status    string         `json:"status"` // pending|running|completed|failed
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	Metadata  map[string]any `json:"metadata,omitempty"`
}

// Hook is a side-effect registration (SPEC §6.17 — MMM3). When the
// backend publishes an event whose Type matches Hook.Event (or
// Event=="*"), it runs Command (or POSTs to URL if set) with the
// event JSON. Optional scope fields restrict matches to a session
// or workspace.
type Hook struct {
	ID          string `json:"id"`
	Event       string `json:"event"`
	Command     string `json:"command,omitempty"`
	URL         string `json:"url,omitempty"`
	SessionID   string `json:"session_id,omitempty"`
	WorkspaceID string `json:"workspace_id,omitempty"`
}

// Error is the canonical error response shape (SPEC §6.0).
type Error struct {
	Error ErrorBody `json:"error"`
}

type ErrorBody struct {
	Code    string         `json:"code"`
	Error   string         `json:"error,omitempty"`
	Message string         `json:"message"`
	Details map[string]any `json:"details,omitempty"`
}
