package gact

import "time"

// ID prefixes used by the emulator for opaque resource IDs.
const (
	IDPrefixWorkspace  = "ws_"
	IDPrefixSession    = "sess_"
	IDPrefixMessage    = "msg_"
	IDPrefixPart       = "part_"
	IDPrefixPermission = "perm_"
	IDPrefixToolCall   = "call_"
	IDPrefixAgent      = "agent_"
	IDPrefixMcpServer  = "mcp_"
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

// Part.type values (SPEC §4.5). New types may be added per the open
// discriminated-union rule (§8.3) — clients must tolerate unknown types.
const (
	PartTypeText             = "text"
	PartTypeThinking         = "thinking"
	PartTypeRedactedThinking = "redacted_thinking"
	PartTypeImage            = "image"
	PartTypeDocument         = "document"
	PartTypeToolCall         = "tool_call"
	PartTypeToolResult       = "tool_result"
	PartTypeSubagentCall     = "subagent_call"
	PartTypeSubagentResult   = "subagent_result"
	PartTypeResourceLink     = "resource_link"
	PartTypeResource         = "resource"
	PartTypeFileDiff         = "file_diff"
	PartTypeCitation         = "citation"
	PartTypeError            = "error"
	PartTypeCompaction       = "compaction"
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
}

// Message is a turn in a session (SPEC §4.4).
type Message struct {
	ID         string         `json:"id"`
	SessionID  string         `json:"session_id"`
	Role       string         `json:"role"`
	CreatedAt  time.Time      `json:"created_at"`
	UpdatedAt  time.Time      `json:"updated_at"`
	Model      *ModelRef      `json:"model,omitempty"`
	Tokens     Tokens         `json:"tokens"`
	CostUSD    float64        `json:"cost_usd"`
	StopReason string         `json:"stop_reason,omitempty"`
	Parts      []Part         `json:"parts"`
	Metadata   map[string]any `json:"metadata,omitempty"`
}

// Part is a single content block within a Message (SPEC §4.5).
//
// Strategy: one struct holds every spec-defined field, all marked omitempty.
// The Type discriminator says which fields are meaningful for a given part.
// Polymorphic fields (Source, Citations, Annotations) use `any` to accept
// different shapes per Type. Per SPEC §8.3, unknown Type values must be
// preserved on round-trip — this struct does that as long as upstream
// clients send only fields known here. For full unknown-field preservation
// the wire layer would need RawMessage capture; not implemented in v0.1.
type Part struct {
	ID       string         `json:"id"`
	Type     string         `json:"type"`
	Metadata map[string]any `json:"metadata,omitempty"`

	// text, citation
	Text string `json:"text,omitempty"`

	// thinking
	Thinking string `json:"thinking,omitempty"`

	// redacted_thinking
	Data string `json:"data,omitempty"`

	// thinking, redacted_thinking
	Signature string `json:"signature,omitempty"`

	// image, document, citation (different shapes per Type)
	Source any `json:"source,omitempty"`

	// document
	Title     string `json:"title,omitempty"`
	Context   string `json:"context,omitempty"`
	Citations any    `json:"citations,omitempty"`

	// tool_call, tool_result
	CallID string `json:"call_id,omitempty"`

	// tool_call
	ToolName    string         `json:"tool_name,omitempty"`
	Input       map[string]any `json:"input,omitempty"`
	ServerID    string         `json:"server_id,omitempty"`
	Annotations any            `json:"annotations,omitempty"`

	// tool_result (recursive; can hold text, image, resource, ...)
	Content []Part `json:"content,omitempty"`
	IsError bool   `json:"is_error,omitempty"`

	// subagent_call, subagent_result
	SubsessionID string `json:"subsession_id,omitempty"`

	// subagent_call
	AgentID string         `json:"agent_id,omitempty"`
	Prompt  string         `json:"prompt,omitempty"`
	Params  map[string]any `json:"params,omitempty"`

	// subagent_result, compaction
	Summary string `json:"summary,omitempty"`

	// subagent_result
	FinalMessageID string `json:"final_message_id,omitempty"`

	// resource_link, resource
	URI      string `json:"uri,omitempty"`
	MimeType string `json:"mime_type,omitempty"`

	// resource_link
	Name        string `json:"name,omitempty"`
	Description string `json:"description,omitempty"`

	// file_diff
	Path     string  `json:"path,omitempty"`
	Before   *string `json:"before,omitempty"`
	After    *string `json:"after,omitempty"`
	Language string  `json:"language,omitempty"`
	Applied  bool    `json:"applied,omitempty"`

	// citation
	TextRange *TextRange `json:"text_range,omitempty"`

	// error
	Code        string `json:"code,omitempty"`
	Message     string `json:"message,omitempty"`
	Recoverable bool   `json:"recoverable,omitempty"`

	// compaction
	CompactedMessageIDs []string `json:"compacted_message_ids,omitempty"`
	Auto                bool     `json:"auto,omitempty"`
}

// TextRange identifies a substring within a Text part (SPEC §4.5 citation).
type TextRange struct {
	Start int `json:"start"`
	End   int `json:"end"`
}

// PartSource describes the source of an image or document (SPEC §4.5).
// Used as the value of Part.Source for image/document parts.
type PartSource struct {
	Kind      string `json:"kind"` // "base64" | "url" | "file_id"
	MediaType string `json:"media_type,omitempty"`
	Data      string `json:"data,omitempty"`
	URL       string `json:"url,omitempty"`
	FileID    string `json:"file_id,omitempty"`
}

// CitationSource identifies the origin of a cited claim (SPEC §4.5).
// Used as the value of Part.Source for citation parts.
type CitationSource struct {
	Type      string         `json:"type"` // "document" | "web" | "resource"
	Reference string         `json:"reference"`
	Location  map[string]any `json:"location,omitempty"`
}

// ToolAnnotations are MCP-aligned safety hints (SPEC §4.6).
type ToolAnnotations struct {
	Title           string `json:"title,omitempty"`
	ReadOnlyHint    bool   `json:"readOnlyHint,omitempty"`
	DestructiveHint bool   `json:"destructiveHint,omitempty"`
	IdempotentHint  bool   `json:"idempotentHint,omitempty"`
	OpenWorldHint   bool   `json:"openWorldHint,omitempty"`
}

// PartCitations toggles whether the model should produce citations from a
// document part (SPEC §4.5).
type PartCitations struct {
	Enabled bool `json:"enabled"`
}

// --- Convenience constructors -----------------------------------------------

// NewTextPart constructs a text part.
func NewTextPart(text string) Part {
	return Part{Type: PartTypeText, Text: text}
}

// NewThinkingPart constructs a thinking part.
func NewThinkingPart(thinking string) Part {
	return Part{Type: PartTypeThinking, Thinking: thinking}
}

// NewToolCallPart constructs a tool_call part. Input may be nil.
func NewToolCallPart(callID, toolName string, input map[string]any) Part {
	return Part{
		Type:     PartTypeToolCall,
		CallID:   callID,
		ToolName: toolName,
		Input:    input,
	}
}

// NewToolResultPart constructs a tool_result part wrapping arbitrary content.
func NewToolResultPart(callID string, content []Part, isError bool) Part {
	return Part{
		Type:    PartTypeToolResult,
		CallID:  callID,
		Content: content,
		IsError: isError,
	}
}

// NewFileDiffPart constructs a file_diff part. Use nil for before to mean
// "new file"; nil for after to mean "deleted".
func NewFileDiffPart(path string, before, after *string, language string) Part {
	return Part{
		Type:     PartTypeFileDiff,
		Path:     path,
		Before:   before,
		After:    after,
		Language: language,
	}
}

// NewErrorPart constructs an error part.
func NewErrorPart(code, message string, recoverable bool) Part {
	return Part{
		Type:        PartTypeError,
		Code:        code,
		Message:     message,
		Recoverable: recoverable,
	}
}

// NewCompactionPart constructs a compaction part recording that the given
// messages were summarized away.
func NewCompactionPart(summary string, compactedIDs []string, auto bool) Part {
	return Part{
		Type:                PartTypeCompaction,
		Summary:             summary,
		CompactedMessageIDs: compactedIDs,
		Auto:                auto,
	}
}
