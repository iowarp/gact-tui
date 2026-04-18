// Package gact contains the wire types for the GACT v0.1 contract.
// See contract/SPEC.md in the repo root for the authoritative spec.
package gact

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

// Error is the canonical error response shape (SPEC §6.0).
type Error struct {
	Error ErrorBody `json:"error"`
}

type ErrorBody struct {
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Details map[string]any `json:"details,omitempty"`
}
