package gact

import "time"

// PermissionAction is the user's response to a permission request.
type PermissionAction string

// Valid PermissionAction values.
const (
	PermAllow          PermissionAction = "allow"
	PermDeny           PermissionAction = "deny"
	PermAllowSession   PermissionAction = "allow_session"
	PermAllowWorkspace PermissionAction = "allow_workspace"
)

// PermissionRequest is the wire-level shape of a pending permission request
// (SPEC §4.7). The server's store wraps this with status + resolution.
type PermissionRequest struct {
	ID           string             `json:"id"`
	SessionID    string             `json:"session_id"`
	SubsessionID string             `json:"subsession_id,omitempty"`
	ToolCall     PermissionToolCall `json:"tool_call"`
	Summary      string             `json:"summary,omitempty"`
	CreatedAt    time.Time          `json:"created_at"`
}

// PermissionToolCall is the subset of a tool call that needs user approval.
type PermissionToolCall struct {
	CallID      string          `json:"call_id"`
	ToolName    string          `json:"tool_name"`
	ServerID    string          `json:"server_id,omitempty"`
	Input       map[string]any  `json:"input,omitempty"`
	Annotations ToolAnnotations `json:"annotations"`
}
