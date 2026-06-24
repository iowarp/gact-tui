package gact

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
	PartTypeRoutingDecision  = "routing_decision" // v0.2 §4.5
	PartTypeExpertHandoff    = "expert_handoff"
	PartTypeAgentQuestion    = "agent_question"
	PartTypeRetryAttempt     = "retry_attempt"
)

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

	// v0.2 — tool_result telemetry (capabilities.tool_telemetry)
	Cached     bool    `json:"cached,omitempty"`      // result came from a memory cache hit
	DurationMS float64 `json:"duration_ms,omitempty"` // wall-clock ms including cache lookup

	// v0.2 — routing_decision part (capabilities.agent_routing)
	SelectedAgent string  `json:"selected_agent,omitempty"` // matches AgentDef.id
	Rationale     string  `json:"rationale,omitempty"`
	Confidence    float64 `json:"confidence,omitempty"` // 0..1
	Heuristic     bool    `json:"heuristic,omitempty"`  // true = keyword match, false = LM router

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

	// agent_question, retry_attempt
	Question     *AgentQuestion `json:"question,omitempty"`
	RetryAttempt *RetryAttempt  `json:"retry_attempt,omitempty"`
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

// PartCitations toggles whether the model should produce citations from a
// document part (SPEC §4.5).
type PartCitations struct {
	Enabled bool `json:"enabled"`
}
