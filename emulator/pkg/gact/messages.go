package gact

import "time"

// Message is a turn in a session (SPEC §4.4).
//
// v0.2 (§14): ErrorInfo carries structured error context for backends
// advertising capabilities.structured_errors. Null on success;
// populated when stop_reason == "error" or the turn degraded mid-stream.
type Message struct {
	ID         string         `json:"id"`
	SessionID  string         `json:"session_id"`
	TurnID     string         `json:"turn_id,omitempty"`
	Role       string         `json:"role"`
	CreatedAt  time.Time      `json:"created_at"`
	UpdatedAt  time.Time      `json:"updated_at"`
	Model      *ModelRef      `json:"model,omitempty"`
	Tokens     Tokens         `json:"tokens"`
	CostUSD    float64        `json:"cost_usd"`
	StopReason string         `json:"stop_reason,omitempty"`
	Parts      []Part         `json:"parts"`
	ErrorInfo  *ErrorInfo     `json:"error_info,omitempty"` // v0.2 §14
	Metadata   map[string]any `json:"metadata,omitempty"`
}

// ErrorInfo is the v0.2 structured error envelope (SPEC §14). Flows
// through Message.ErrorInfo, the body of an error Part, or the HTTP
// response body on 4xx/5xx.
//
// Error is a machine-readable taxonomy tag:
//
//	"provider_error" · "routing_error" · "agent_error" · "tool_error"
//	"permission_error" · "config_error" · "cancelled" · "rate_limited"
//	"internal_error" · "x_<vendor>_<custom>"
//
// Recoverable hints whether a retry could succeed (true) or whether
// user/operator intervention is required (false).
type ErrorInfo struct {
	Error       string         `json:"error"`
	Message     string         `json:"message"`
	Details     map[string]any `json:"details,omitempty"`
	Recoverable bool           `json:"recoverable"`
	RetryAfterS *int           `json:"retry_after_s,omitempty"`
}

type UserQuestionOption struct {
	ID          string `json:"id,omitempty"`
	Label       string `json:"label"`
	Value       string `json:"value,omitempty"`
	Description string `json:"description,omitempty"`
}

type UserQuestion struct {
	ID              string               `json:"id"`
	SessionID       string               `json:"session_id,omitempty"`
	MessageID       string               `json:"message_id,omitempty"`
	Prompt          string               `json:"prompt"`
	Status          string               `json:"status,omitempty"`
	Kind            string               `json:"kind,omitempty"`
	Options         []UserQuestionOption `json:"options,omitempty"`
	CreatedAt       time.Time            `json:"created_at,omitempty"`
	UpdatedAt       time.Time            `json:"updated_at,omitempty"`
	ExpiresAt       *time.Time           `json:"expires_at,omitempty"`
	Source          string               `json:"source,omitempty"`
	TurnID          string               `json:"turn_id,omitempty"`
	AttemptID       string               `json:"attempt_id,omitempty"`
	Answer          string               `json:"answer,omitempty"`
	SelectedOptions []string             `json:"selected_options,omitempty"`
	AnswerMetadata  map[string]any       `json:"answer_metadata,omitempty"`
	Metadata        map[string]any       `json:"metadata,omitempty"`

	// Compatibility with the initial TUI-side protocol draft.
	Choices            []UserQuestionOption `json:"choices,omitempty"`
	AllowFreeform      bool                 `json:"allow_freeform,omitempty"`
	Reason             string               `json:"reason,omitempty"`
	Category           string               `json:"category,omitempty"`
	ExpectedAnswerType string               `json:"expected_answer_type,omitempty"`
	AgentID            string               `json:"agent_id,omitempty"`
}

type AnswerUserQuestionRequest struct {
	Answer          string         `json:"answer,omitempty"`
	SelectedOptions []string       `json:"selected_options,omitempty"`
	Metadata        map[string]any `json:"metadata,omitempty"`

	// Compatibility with the initial TUI-side protocol draft.
	ChoiceID string `json:"choice_id,omitempty"`
}

type CreateUserQuestionRequest struct {
	Prompt    string               `json:"prompt"`
	Kind      string               `json:"kind,omitempty"`
	Options   []UserQuestionOption `json:"options,omitempty"`
	Source    string               `json:"source,omitempty"`
	TurnID    string               `json:"turn_id,omitempty"`
	AttemptID string               `json:"attempt_id,omitempty"`
	ExpiresAt *time.Time           `json:"expires_at,omitempty"`
	Metadata  map[string]any       `json:"metadata,omitempty"`
}

type RetryTurnRequest struct {
	Notes      string         `json:"notes,omitempty"`
	Execute    bool           `json:"execute"`
	ProviderID string         `json:"provider_id,omitempty"`
	ModelID    string         `json:"model_id,omitempty"`
	Model      *ModelRef      `json:"model,omitempty"`
	Metadata   map[string]any `json:"metadata,omitempty"`
}

type TurnAttempt struct {
	ID              string         `json:"id"`
	SessionID       string         `json:"session_id,omitempty"`
	SourceMessageID string         `json:"source_message_id,omitempty"`
	Status          string         `json:"status,omitempty"`
	CreatedAt       time.Time      `json:"created_at,omitempty"`
	UpdatedAt       time.Time      `json:"updated_at,omitempty"`
	Notes           string         `json:"notes,omitempty"`
	Model           *ModelRef      `json:"model,omitempty"`
	Warning         string         `json:"warning,omitempty"`
	Metadata        map[string]any `json:"metadata,omitempty"`

	// Compatibility with the initial TUI-side protocol draft.
	OriginalMessageID string `json:"original_message_id,omitempty"`
	AttemptMessageID  string `json:"attempt_message_id,omitempty"`
}

type AgentQuestionChoice = UserQuestionOption
type AgentQuestion = UserQuestion
type AgentQuestionAnswerRequest = AnswerUserQuestionRequest
type RetryRequest = RetryTurnRequest
type RetryAttempt = TurnAttempt
