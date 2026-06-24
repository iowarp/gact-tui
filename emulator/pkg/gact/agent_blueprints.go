package gact

type AgentBlueprintDefinition struct {
	ID                 string         `json:"id"`
	Version            string         `json:"version,omitempty"`
	Title              string         `json:"title,omitempty"`
	Description        string         `json:"description,omitempty"`
	Scope              string         `json:"scope,omitempty"`
	Root               string         `json:"root,omitempty"`
	RootPath           string         `json:"root_path,omitempty"`
	DefinitionPath     string         `json:"definition_path,omitempty"`
	RootExpert         string         `json:"root_expert,omitempty"`
	Kind               string         `json:"kind,omitempty"` // "blueprint" | "pack"
	Enabled            bool           `json:"enabled"`
	ValidationWarnings []string       `json:"validation_warnings,omitempty"`
	ValidationErrors   []string       `json:"validation_errors,omitempty"`
	Defaults           map[string]any `json:"defaults,omitempty"`
	Metadata           map[string]any `json:"metadata,omitempty"`
}

type AgentBlueprintDetail struct {
	AgentBlueprint  AgentBlueprintDefinition `json:"agent_blueprint"`
	Agents          []AgentDef               `json:"agents,omitempty"`
	MCPDescriptors  []map[string]any         `json:"mcp_descriptors,omitempty"`
	HookDescriptors []map[string]any         `json:"hook_descriptors,omitempty"`
}

type AgentBlueprintValidateRequest struct {
	Path  string `json:"path,omitempty"`
	Scope string `json:"scope,omitempty"`
}

type AgentBlueprintValidationResult struct {
	Enabled            bool                     `json:"enabled"`
	ValidationWarnings []string                 `json:"validation_warnings,omitempty"`
	ValidationErrors   []string                 `json:"validation_errors,omitempty"`
	AgentBlueprint     AgentBlueprintDefinition `json:"agent_blueprint,omitempty"`
	Agents             []AgentDef               `json:"agents,omitempty"`
	MCPDescriptors     []map[string]any         `json:"mcp_descriptors,omitempty"`
	HookDescriptors    []map[string]any         `json:"hook_descriptors,omitempty"`
}

type AgentBlueprintInstallRequest struct {
	Source       string `json:"source,omitempty"`
	SourceID     string `json:"source_id,omitempty"`
	URL          string `json:"url,omitempty"`
	Path         string `json:"path,omitempty"`
	Scope        string `json:"scope,omitempty"`
	WorkspaceID  string `json:"workspace_id,omitempty"`
	Ref          string `json:"ref,omitempty"`
	BlueprintID  string `json:"blueprint_id,omitempty"`
	PinnedCommit string `json:"pinned_commit,omitempty"`
}

type AgentBlueprintSource struct {
	ID                  string                     `json:"id"`
	Name                string                     `json:"name,omitempty"`
	Source              string                     `json:"source,omitempty"`
	Ref                 string                     `json:"ref,omitempty"`
	PinnedCommit        string                     `json:"pinned_commit,omitempty"`
	SourceKind          string                     `json:"source_kind,omitempty"`
	Status              string                     `json:"status,omitempty"`
	Error               string                     `json:"error,omitempty"`
	Commit              string                     `json:"commit,omitempty"`
	AddedAt             string                     `json:"added_at,omitempty"`
	UpdatedAt           string                     `json:"updated_at,omitempty"`
	AvailableBlueprints []AgentBlueprintDefinition `json:"available_blueprints,omitempty"`
}

type AgentBlueprintSourceRequest struct {
	ID           string `json:"id,omitempty"`
	Name         string `json:"name,omitempty"`
	Source       string `json:"source,omitempty"`
	URL          string `json:"url,omitempty"`
	Ref          string `json:"ref,omitempty"`
	PinnedCommit string `json:"pinned_commit,omitempty"`
	Refresh      bool   `json:"refresh,omitempty"`
}

type AgentBlueprintUpdateRequest struct {
	Scope       string `json:"scope,omitempty"`
	WorkspaceID string `json:"workspace_id,omitempty"`
}

type SessionAgentBlueprintState struct {
	SessionID                string                    `json:"session_id"`
	WorkspaceID              string                    `json:"workspace_id,omitempty"`
	ActiveAgentBlueprintID   string                    `json:"active_agent_blueprint_id,omitempty"`
	ActiveAgentBlueprintPath string                    `json:"active_agent_blueprint_path,omitempty"`
	AgentBlueprint           *AgentBlueprintDefinition `json:"agent_blueprint,omitempty"`
	AgentOverlay             map[string]any            `json:"agent_overlay,omitempty"`
	Session                  *Session                  `json:"session,omitempty"`
}

type SetSessionAgentBlueprintRequest struct {
	BlueprintID      string `json:"blueprint_id,omitempty"`
	AgentBlueprintID string `json:"agent_blueprint_id,omitempty"`
	Path             string `json:"path,omitempty"`
	BlueprintPath    string `json:"blueprint_path,omitempty"`
}

type SessionAgentOverlayResponse struct {
	SessionID    string         `json:"session_id"`
	AgentOverlay map[string]any `json:"agent_overlay,omitempty"`
	Session      *Session       `json:"session,omitempty"`
}

type AgentBlueprintMCPEnableRequest struct {
	WorkspaceID string `json:"workspace_id,omitempty"`
}

type AgentBlueprintHookEnableRequest struct {
	WorkspaceID string `json:"workspace_id,omitempty"`
	Trust       bool   `json:"trust,omitempty"`
}
