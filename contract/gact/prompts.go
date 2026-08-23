package gact

// PromptProfile is one resolved profile body for a CLIO prompt registry
// definition. It is a vendor extension, advertised by
// capabilities.x_clio_prompt_registry.
type PromptProfile struct {
	Name       string         `json:"name"`
	Text       string         `json:"text"`
	Scope      string         `json:"scope"`
	SourcePath string         `json:"source_path,omitempty"`
	Provider   string         `json:"provider,omitempty"`
	Model      string         `json:"model,omitempty"`
	Checksum   string         `json:"checksum,omitempty"`
	Metadata   map[string]any `json:"metadata,omitempty"`
}

// PromptDefinition is returned by GET /v1/prompts.
type PromptDefinition struct {
	ID               string                   `json:"id"`
	Title            string                   `json:"title,omitempty"`
	Description      string                   `json:"description,omitempty"`
	DefaultProfile   string                   `json:"default_profile,omitempty"`
	Profiles         map[string]PromptProfile `json:"profiles,omitempty"`
	Scope            string                   `json:"scope,omitempty"`
	SourcePath       string                   `json:"source_path,omitempty"`
	Enabled          bool                     `json:"enabled"`
	ValidationErrors []string                 `json:"validation_errors,omitempty"`
	Metadata         map[string]any           `json:"metadata,omitempty"`
}

// ResolvedPrompt is returned by GET /v1/prompts/{id}?profile=...
type ResolvedPrompt struct {
	ID               string         `json:"id"`
	Profile          string         `json:"profile"`
	Text             string         `json:"text"`
	Title            string         `json:"title,omitempty"`
	Description      string         `json:"description,omitempty"`
	Scope            string         `json:"scope,omitempty"`
	SourcePath       string         `json:"source_path,omitempty"`
	Provider         string         `json:"provider,omitempty"`
	Model            string         `json:"model,omitempty"`
	Checksum         string         `json:"checksum,omitempty"`
	FallbackProfile  string         `json:"fallback_profile,omitempty"`
	ValidationErrors []string       `json:"validation_errors,omitempty"`
	Metadata         map[string]any `json:"metadata,omitempty"`
}

// PromptSaveRequest is accepted by PUT /v1/prompts/{id}.
type PromptSaveRequest struct {
	Profile     string         `json:"profile,omitempty"`
	Title       string         `json:"title,omitempty"`
	Description string         `json:"description,omitempty"`
	Text        string         `json:"text"`
	Provider    string         `json:"provider,omitempty"`
	Model       string         `json:"model,omitempty"`
	Metadata    map[string]any `json:"metadata,omitempty"`
}

type PromptRenderRequest struct {
	Profile     string            `json:"profile,omitempty"`
	SessionID   string            `json:"session_id,omitempty"`
	WorkspaceID string            `json:"workspace_id,omitempty"`
	Context     map[string]string `json:"context,omitempty"`
}

type PromptValidateRequest struct {
	Profile     string `json:"profile,omitempty"`
	Text        string `json:"text,omitempty"`
	SessionID   string `json:"session_id,omitempty"`
	WorkspaceID string `json:"workspace_id,omitempty"`
}

type PromptValidationResult struct {
	Enabled          bool             `json:"enabled"`
	ValidationErrors []string         `json:"validation_errors,omitempty"`
	Prompt           PromptDefinition `json:"prompt,omitempty"`
}

type PromptReloadResult struct {
	PromptCount int            `json:"prompt_count"`
	PromptIDs   []string       `json:"prompt_ids,omitempty"`
	Sources     []PromptSource `json:"sources,omitempty"`
	Metadata    map[string]any `json:"metadata,omitempty"`
}

type PromptSource struct {
	Scope string `json:"scope,omitempty"`
	Root  string `json:"root,omitempty"`
}
