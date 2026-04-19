// Package gact contains the wire types for the GACT v0.1 contract.
// See contract/SPEC.md in the repo root for the authoritative spec.
package gact

import "time"

// HealthResponse is returned by GET /v1/health (SPEC §3.4).
type HealthResponse struct {
	Healthy bool `json:"healthy"`
	UptimeS int  `json:"uptime_s"`
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

// Policy is a permission auto-resolution rule (SPEC §6.11). When a
// permission request comes in, the backend walks the policy list in
// order and applies the first one whose patterns match. Glob-style
// patterns: `*` matches any chars except `/`, `**` matches across
// path segments. (MMM4)
type Policy struct {
	Scope             string         `json:"scope"`             // "workspace" | "session"
	ScopeID           string         `json:"scope_id,omitempty"` // empty = any scope
	ToolNamePattern   string         `json:"tool_name_pattern"` // e.g. "shell" or "*"
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
	Message string         `json:"message"`
	Details map[string]any `json:"details,omitempty"`
}
