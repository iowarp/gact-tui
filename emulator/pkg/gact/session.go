package gact

import (
	"bytes"
	"encoding/json"
	"time"
)

// Roles for messages (SPEC §4.4).
const (
	RoleUser      = "user"
	RoleAssistant = "assistant"
	RoleSystem    = "system"
	RoleTool      = "tool"
)

// Session.status values (SPEC §4.2).
const (
	StatusIdle              = "idle"
	StatusRunning           = "running"
	StatusWaitingPermission = "waiting_permission"
	StatusWaitingUser       = "waiting_user"
	StatusError             = "error"
)

// Message.stop_reason values (SPEC §4.4).
const (
	StopReasonEndTurn          = "end_turn"
	StopReasonToolUse          = "tool_use"
	StopReasonMaxTokens        = "max_tokens"
	StopReasonCancelled        = "cancelled"
	StopReasonError            = "error"
	StopReasonPermissionDenied = "permission_denied"
)

// Workspace is the parent of sessions (SPEC §4.1).
type Workspace struct {
	ID        string         `json:"id"`
	Name      string         `json:"name"`
	RootPath  string         `json:"root_path"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	Config    map[string]any `json:"config,omitempty"`
	Metadata  map[string]any `json:"metadata,omitempty"`
}

// ModelRef references a provider+model+variant (SPEC §4.2, §6.12).
type ModelRef struct {
	ProviderID string `json:"provider_id,omitempty"`
	ModelID    string `json:"model_id,omitempty"`
	Variant    string `json:"variant,omitempty"`
}

// UnmarshalJSON accepts both the structured ModelRef shape and older
// CLIO-style string model identifiers. Some backends historically
// emitted AgentDef.default_model as "model-id" while sessions used the
// structured {provider_id, model_id, variant} object; clients should
// not fail the entire agents catalog over that representation mismatch.
func (m *ModelRef) UnmarshalJSON(data []byte) error {
	if m == nil {
		return nil
	}
	if bytes.Equal(data, []byte("null")) {
		*m = ModelRef{}
		return nil
	}
	var modelID string
	if err := json.Unmarshal(data, &modelID); err == nil {
		*m = ModelRef{ModelID: modelID}
		return nil
	}
	type alias ModelRef
	var out alias
	if err := json.Unmarshal(data, &out); err != nil {
		return err
	}
	*m = ModelRef(out)
	return nil
}

// AgentRef identifies which agent persona/recipe is active in a session.
type AgentRef struct {
	ID   string `json:"id"`
	Mode string `json:"mode,omitempty"` // Aider-style edit modes if backend supports
}

// Tokens accounting (SPEC §4.4).
type Tokens struct {
	Input      int `json:"input"`
	Output     int `json:"output"`
	CacheRead  int `json:"cache_read"`
	CacheWrite int `json:"cache_write"`
}

// Session is a conversation thread (SPEC §4.2). SubSessions also use this
// type with ParentSessionID set (SPEC §4.3).
type Session struct {
	ID                 string         `json:"id"`
	WorkspaceID        string         `json:"workspace_id"`
	ParentSessionID    string         `json:"parent_session_id,omitempty"`
	SpawnedByMessageID string         `json:"spawned_by_message_id,omitempty"`
	SpawnedByPartID    string         `json:"spawned_by_part_id,omitempty"`
	Title              string         `json:"title"`
	Summary            string         `json:"summary,omitempty"`
	CreatedAt          time.Time      `json:"created_at"`
	UpdatedAt          time.Time      `json:"updated_at"`
	ArchivedAt         *time.Time     `json:"archived_at,omitempty"`
	MessageCount       int            `json:"message_count"`
	Tokens             Tokens         `json:"tokens"`
	CostUSD            float64        `json:"cost_usd"`
	Model              ModelRef       `json:"model"`
	Agent              AgentRef       `json:"agent"`
	Status             string         `json:"status"`
	Metadata           map[string]any `json:"metadata,omitempty"`
	// Mode + RoutingMode are CLIO-specific session knobs; other backends
	// are free to omit them. RoutingMode "auto" runs the LM router;
	// "chat" forces every turn through the chat path; "experts"
	// rejects chat/none routes.
	Mode        string `json:"mode,omitempty"`
	EditMode    string `json:"edit_mode,omitempty"`
	RoutingMode string `json:"routing_mode,omitempty"`
}
