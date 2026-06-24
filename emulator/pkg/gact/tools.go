package gact

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
	Owner             string           `json:"owner,omitempty"`
	Tags              []string         `json:"tags,omitempty"`
	VisibleTo         []string         `json:"visible_to,omitempty"`
}

// ToolAnnotations are MCP-aligned safety hints (SPEC §4.6).
type ToolAnnotations struct {
	Title           string `json:"title,omitempty"`
	ReadOnlyHint    bool   `json:"readOnlyHint,omitempty"`
	DestructiveHint bool   `json:"destructiveHint,omitempty"`
	IdempotentHint  bool   `json:"idempotentHint,omitempty"`
	OpenWorldHint   bool   `json:"openWorldHint,omitempty"`
}
