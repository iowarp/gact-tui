package gact

// Command is one slash command available in the catalog (SPEC §6.13).
type Command struct {
	ID                 string           `json:"id"`
	Title              string           `json:"title"`
	Description        string           `json:"description,omitempty"`
	Source             string           `json:"source"` // builtin|mcp_prompt|recipe|user
	ServerID           string           `json:"server_id,omitempty"`
	Arguments          []AgentParameter `json:"arguments,omitempty"`
	Shortcut           string           `json:"shortcut,omitempty"`
	Status             string           `json:"status,omitempty"`
	Enabled            bool             `json:"enabled,omitempty"`
	Error              string           `json:"error,omitempty"`
	DisabledReason     string           `json:"disabled_reason,omitempty"`
	AgentID            string           `json:"agent_id,omitempty"`
	AgentSource        string           `json:"agent_source,omitempty"`
	CommandSource      string           `json:"command_source,omitempty"`
	CommandPath        string           `json:"command_path,omitempty"`
	CommandScope       string           `json:"command_scope,omitempty"`
	AgentBlueprintID   string           `json:"agent_blueprint_id,omitempty"`
	AgentBlueprintRoot string           `json:"agent_blueprint_root,omitempty"`
	Invocation         string           `json:"invocation,omitempty"`
	UserInvocable      *bool            `json:"user_invocable,omitempty"`
	AgentInvocable     *bool            `json:"agent_invocable,omitempty"`
	PlannerVisible     *bool            `json:"planner_visible,omitempty"`
	ArgumentHint       string           `json:"argument_hint,omitempty"`
	PromptTemplate     string           `json:"prompt_template,omitempty"`
}
