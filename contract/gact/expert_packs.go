package gact

type ExpertPackDefinition struct {
	ID               string         `json:"id"`
	Version          string         `json:"version,omitempty"`
	Title            string         `json:"title,omitempty"`
	Description      string         `json:"description,omitempty"`
	Scope            string         `json:"scope,omitempty"`
	Root             string         `json:"root,omitempty"`
	ManifestPath     string         `json:"manifest_path,omitempty"`
	DefinitionPath   string         `json:"definition_path,omitempty"`
	Enabled          bool           `json:"enabled"`
	ValidationErrors []string       `json:"validation_errors,omitempty"`
	Defaults         map[string]any `json:"defaults,omitempty"`
	Metadata         map[string]any `json:"metadata,omitempty"`
}

type ExpertPackDetail struct {
	ExpertPack ExpertPackDefinition `json:"expert_pack"`
	Agents     []AgentDef           `json:"agents,omitempty"`
}

type ExpertPackValidateRequest struct {
	Path  string `json:"path,omitempty"`
	Scope string `json:"scope,omitempty"`
}

type ExpertPackInstallRequest struct {
	Source      string `json:"source,omitempty"`
	SourceID    string `json:"source_id,omitempty"`
	URL         string `json:"url,omitempty"`
	Path        string `json:"path,omitempty"`
	Scope       string `json:"scope,omitempty"`
	WorkspaceID string `json:"workspace_id,omitempty"`
	Ref         string `json:"ref,omitempty"`
}

type ExpertPackValidationResult struct {
	Enabled          bool                 `json:"enabled"`
	ValidationErrors []string             `json:"validation_errors,omitempty"`
	Pack             ExpertPackDefinition `json:"pack,omitempty"`
	Agents           []AgentDef           `json:"agents,omitempty"`
}

type SessionExpertPackState struct {
	SessionID            string                `json:"session_id"`
	WorkspaceID          string                `json:"workspace_id,omitempty"`
	ActiveExpertPackID   string                `json:"active_expert_pack_id,omitempty"`
	ActiveExpertPackPath string                `json:"active_expert_pack_path,omitempty"`
	ExpertPack           *ExpertPackDefinition `json:"expert_pack,omitempty"`
	Session              *Session              `json:"session,omitempty"`
}

type SetSessionExpertPackRequest struct {
	PackID   string `json:"pack_id,omitempty"`
	Path     string `json:"path,omitempty"`
	PackPath string `json:"pack_path,omitempty"`
}
