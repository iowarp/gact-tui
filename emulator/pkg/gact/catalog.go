package gact

import (
	"bytes"
	"encoding/json"
	"sort"
)

// Catalog types — providers, models, tools, MCP servers, agents, commands.
// These reflect SPEC §6.5 (agents), §6.6 (tools), §6.7 (MCP), §6.12
// (providers), §6.13 (commands), §6.16 (metrics).

// Provider is an LLM provider (SPEC §6.12).
type Provider struct {
	ID              string         `json:"id"`
	Name            string         `json:"name"`
	AuthMethods     []string       `json:"auth_methods"`
	IsAuthenticated bool           `json:"is_authenticated"`
	DefaultModel    string         `json:"default_model,omitempty"`
	Metadata        map[string]any `json:"metadata,omitempty"`
}

// AuthMethod is one of the spec's enumerated authentication schemes
// for §6.12 providers. The wire is a string so future schemes (device
// codes, mTLS, …) Just Work; the constants below are the cases the
// TUI knows how to drive interactively today.
type AuthMethod string

const (
	// AuthMethodNone — provider needs no credentials (lm_studio /
	// ollama on localhost, codex via the CLI subscription, and local
	// OpenAI-compatible vLLM servers that accept the literal "EMPTY" key).
	AuthMethodNone AuthMethod = "none"

	// AuthMethodAPIKey — user pastes a long-lived API key (Anthropic,
	// OpenAI, OpenRouter, and any other cloud provider behind a
	// static bearer).
	AuthMethodAPIKey AuthMethod = "api_key"

	// AuthMethodOAuth — backend drives a multi-step browser flow on
	// the user's behalf (ALCF Sophia / Polaris via Globus Auth).
	AuthMethodOAuth AuthMethod = "oauth"
)

// AuthProvider wraps Provider with typed helpers for the auth flow.
// Embeds Provider so every wire field stays accessible by direct
// field access; method dispatch (NeedsLogin, Method) keeps the
// modal's render code free of slice-scanning.
type AuthProvider struct {
	Provider
}

// WrapProvider lifts a wire Provider into an AuthProvider.
func WrapProvider(p Provider) AuthProvider {
	return AuthProvider{Provider: p}
}

// Method returns the primary auth method this provider declares.
// Falls back to AuthMethodNone when the slice is empty or contains
// only unknown values, so the settings modal never crashes on a
// malformed catalog.
func (a AuthProvider) Method() AuthMethod {
	for _, raw := range a.AuthMethods {
		switch m := AuthMethod(raw); m {
		case AuthMethodOAuth, AuthMethodAPIKey, AuthMethodNone:
			return m
		}
	}
	return AuthMethodNone
}

// NeedsLogin reports whether the user must take action before the
// provider can serve traffic. Always false for AuthMethodNone, false
// when IsAuthenticated, true otherwise.
func (a AuthProvider) NeedsLogin() bool {
	if a.IsAuthenticated {
		return false
	}
	switch a.Method() {
	case AuthMethodOAuth, AuthMethodAPIKey:
		return true
	default:
		return false
	}
}

// Model is one LLM offered by a provider (SPEC §6.12).
type Model struct {
	ID              string         `json:"id"`
	Name            string         `json:"name"`
	Description     string         `json:"description,omitempty"`
	ContextWindow   int            `json:"context_window"`
	MaxOutputTokens int            `json:"max_output_tokens"`
	ChosenContext   int            `json:"chosen_context,omitempty"`
	ContextSource   string         `json:"context_source,omitempty"`
	IsReasoning     bool           `json:"is_reasoning,omitempty"`
	NativeToolCalls bool           `json:"native_tool_calling,omitempty"`
	Supports        ModelSupports  `json:"supports"`
	Pricing         *ModelPricing  `json:"pricing,omitempty"`
	Metadata        map[string]any `json:"metadata,omitempty"`
}

// ModelSupports captures capability flags for a model.
type ModelSupports struct {
	Tools         bool `json:"tools"`
	Vision        bool `json:"vision"`
	Thinking      bool `json:"thinking"`
	ComputerUse   bool `json:"computer_use"`
	PromptCaching bool `json:"prompt_caching"`
}

// ModelPricing is per-million-token pricing.
type ModelPricing struct {
	InputPerMTok      float64 `json:"input_per_mtok"`
	OutputPerMTok     float64 `json:"output_per_mtok"`
	CacheReadPerMTok  float64 `json:"cache_read_per_mtok,omitempty"`
	CacheWritePerMTok float64 `json:"cache_write_per_mtok,omitempty"`
}

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

// AgentDef is a reusable agent persona/recipe (SPEC §6.5).
//
// v0.2 (SPEC §4.3.1): Tier, Specialization, Keywords are optional
// fields that let a backend advertise a multi-tier agent hierarchy.
// Backends with capabilities.agent_routing = true populate them on
// tier-2 specialists so the TUI can render a routing badge and
// colour it by specialization.
type AgentDef struct {
	ID                 string               `json:"id"`
	Source             string               `json:"source"` // builtin|user|recipe|skill
	Title              string               `json:"title"`
	Description        string               `json:"description,omitempty"`
	ParentID           string               `json:"parent_id,omitempty"`
	SystemPrompt       string               `json:"system_prompt,omitempty"`
	PromptID           string               `json:"prompt_id,omitempty"`
	PromptProfile      string               `json:"prompt_profile,omitempty"`
	DefaultProvider    string               `json:"default_provider,omitempty"`
	Parameters         []AgentParameter     `json:"parameters,omitempty"`
	DefaultModel       *ModelRef            `json:"default_model,omitempty"`
	DefaultModelName   string               `json:"-"`
	Module             map[string]any       `json:"module,omitempty"`
	Signature          map[string]any       `json:"signature,omitempty"`
	StructuredOutputs  map[string]any       `json:"structured_outputs,omitempty"`
	Fanout             map[string]any       `json:"fanout,omitempty"`
	Tools              []string             `json:"tools,omitempty"`
	Skills             []string             `json:"skills,omitempty"`
	Commands           []string             `json:"commands,omitempty"`
	CapabilityRefs     []AgentCapabilityRef `json:"capability_refs,omitempty"`
	Metadata           map[string]any       `json:"metadata,omitempty"`
	Enabled            bool                 `json:"enabled,omitempty"`
	ValidationWarnings []string             `json:"validation_warnings,omitempty"`
	ValidationErrors   []string             `json:"validation_errors,omitempty"`

	// v0.2 — multi-tier routing (optional; absent = tier-1 or untagged)
	Tier           int      `json:"tier,omitempty"`           // 1 = orchestrator, 2 = specialist, 3 = nanoagent
	Specialization string   `json:"specialization,omitempty"` // free-form tag — UI palette hint (code_editing, data_analysis, research, …)
	Keywords       []string `json:"keywords,omitempty"`       // intent tokens the tier-1 router matches
}

type AgentCapabilityRef struct {
	Kind        string         `json:"kind,omitempty"`
	ID          string         `json:"id,omitempty"`
	Title       string         `json:"title,omitempty"`
	Description string         `json:"description,omitempty"`
	Source      string         `json:"source,omitempty"`
	Status      string         `json:"status,omitempty"`
	Metadata    map[string]any `json:"metadata,omitempty"`
}

type AgentExtractRequest struct {
	SessionIDs []string `json:"session_ids"`
	AgentID    string   `json:"agent_id"`
}

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

// UnmarshalJSON accepts both the shared GACT array shape for
// parameters and CLIO's current object/map shape. Settings must not
// fail the whole agent catalog because one backend serializes
// parameters as {"name": value} instead of [{"name": "..."}].
func (a *AgentDef) UnmarshalJSON(data []byte) error {
	type alias AgentDef
	var raw struct {
		alias
		Parameters   json.RawMessage `json:"parameters,omitempty"`
		DefaultModel json.RawMessage `json:"default_model,omitempty"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	out := AgentDef(raw.alias)
	if len(raw.Parameters) > 0 && !bytes.Equal(raw.Parameters, []byte("null")) {
		params, err := decodeAgentParameters(raw.Parameters)
		if err != nil {
			return err
		}
		out.Parameters = params
	}
	if len(raw.DefaultModel) > 0 && !bytes.Equal(raw.DefaultModel, []byte("null")) {
		var ref ModelRef
		if err := json.Unmarshal(raw.DefaultModel, &ref); err == nil && (ref.ProviderID != "" || ref.ModelID != "" || ref.Variant != "") {
			out.DefaultModel = &ref
		} else {
			var model string
			if err := json.Unmarshal(raw.DefaultModel, &model); err == nil {
				out.DefaultModelName = model
			}
		}
	}
	*a = out
	return nil
}

func decodeAgentParameters(data []byte) ([]AgentParameter, error) {
	var list []AgentParameter
	if err := json.Unmarshal(data, &list); err == nil {
		return list, nil
	}
	var obj map[string]any
	if err := json.Unmarshal(data, &obj); err != nil {
		return nil, err
	}
	keys := make([]string, 0, len(obj))
	for key := range obj {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	out := make([]AgentParameter, 0, len(keys))
	for _, key := range keys {
		param := AgentParameter{Name: key, Type: "string"}
		if spec, ok := obj[key].(map[string]any); ok {
			if typ, ok := spec["type"].(string); ok && typ != "" {
				param.Type = typ
			}
			if desc, ok := spec["description"].(string); ok {
				param.Description = desc
			}
			if required, ok := spec["required"].(bool); ok {
				param.Required = required
			}
			if opts, ok := spec["options"].([]any); ok {
				for _, opt := range opts {
					if s, ok := opt.(string); ok {
						param.Options = append(param.Options, s)
					}
				}
			}
		}
		out = append(out, param)
	}
	return out, nil
}

// AgentParameter is a fillable input on an agent recipe.
type AgentParameter struct {
	Name        string   `json:"name"`
	Type        string   `json:"type"` // string|number|select|multiline
	Required    bool     `json:"required,omitempty"`
	Description string   `json:"description,omitempty"`
	Options     []string `json:"options,omitempty"`
}

// McpServer is one connected MCP server (SPEC §6.7).
type McpServer struct {
	ID                   string          `json:"id"`
	Name                 string          `json:"name"`
	Version              string          `json:"version,omitempty"`
	Transport            string          `json:"transport"` // "stdio" | "http"
	ProtocolVersion      string          `json:"protocol_version"`
	Status               string          `json:"status"` // connecting|ready|error|disconnected
	ServerInfo           map[string]any  `json:"server_info,omitempty"`
	Instructions         string          `json:"instructions,omitempty"`
	DeclaredCapabilities McpCapabilities `json:"declared_capabilities"`
	LastError            string          `json:"last_error,omitempty"`
}

// McpCapabilities describes which MCP capabilities a server declares.
type McpCapabilities struct {
	Tools     bool                    `json:"tools"`
	Resources *McpResourcesCapability `json:"resources,omitempty"`
	Prompts   *McpPromptsCapability   `json:"prompts,omitempty"`
	Logging   bool                    `json:"logging"`
}

type McpResourcesCapability struct {
	Subscribe   bool `json:"subscribe"`
	ListChanged bool `json:"list_changed"`
}

type McpPromptsCapability struct {
	ListChanged bool `json:"list_changed"`
}

// McpResource is a resource exposed by an MCP server (SPEC §6.7).
type McpResource struct {
	ServerID    string         `json:"server_id"`
	URI         string         `json:"uri"`
	Name        string         `json:"name,omitempty"`
	Title       string         `json:"title,omitempty"`
	Description string         `json:"description,omitempty"`
	MimeType    string         `json:"mime_type,omitempty"`
	Size        int64          `json:"size,omitempty"`
	Annotations map[string]any `json:"annotations,omitempty"`
}

// McpResourceTemplate is a parameterized resource URI template.
type McpResourceTemplate struct {
	ServerID    string `json:"server_id"`
	URITemplate string `json:"uri_template"`
	Name        string `json:"name,omitempty"`
	Description string `json:"description,omitempty"`
	MimeType    string `json:"mime_type,omitempty"`
}

// McpContent is the content returned from resources/read.
type McpContent struct {
	URI      string `json:"uri"`
	MimeType string `json:"mime_type,omitempty"`
	Text     string `json:"text,omitempty"`
	Data     string `json:"data,omitempty"` // base64
}

// McpPrompt is a templated prompt exposed by a server (SPEC §6.7).
type McpPrompt struct {
	ServerID    string         `json:"server_id"`
	Name        string         `json:"name"`
	Title       string         `json:"title,omitempty"`
	Description string         `json:"description,omitempty"`
	Arguments   []McpPromptArg `json:"arguments,omitempty"`
}

type McpPromptArg struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Required    bool   `json:"required,omitempty"`
}

// McpMessage is one message returned from prompts/get.
type McpMessage struct {
	Role    string `json:"role"`
	Content []Part `json:"content"`
}

// ContextFile is a file pinned into a session's context (SPEC §6.9).
type ContextFile struct {
	Path         string `json:"path"`
	Mode         string `json:"mode"` // "edit"|"read"|"pin"
	AddedAt      string `json:"added_at"`
	LastModified string `json:"last_modified,omitempty"`
	Size         int64  `json:"size,omitempty"`
	Language     string `json:"language,omitempty"`
	Uploaded     bool   `json:"uploaded,omitempty"`
}

type ContextFileContent struct {
	Path        string `json:"path"`
	DisplayPath string `json:"display_path,omitempty"`
	Size        int64  `json:"size,omitempty"`
	MediaType   string `json:"media_type,omitempty"`
	Encoding    string `json:"encoding,omitempty"`
	Data        string `json:"data,omitempty"`
}

// FileEntry is one entry from a directory listing.
type FileEntry struct {
	Path     string `json:"path"`
	Type     string `json:"type"` // "file" | "dir"
	Size     int64  `json:"size,omitempty"`
	Modified string `json:"modified,omitempty"`
}

// RepoMapNode is one node in the repo map tree.
type RepoMapNode struct {
	Path     string         `json:"path"`
	Type     string         `json:"type"` // "file" | "dir"
	Children []*RepoMapNode `json:"children,omitempty"`
	// Symbols is a brief code outline if available (e.g. tree-sitter).
	Symbols []string `json:"symbols,omitempty"`
}

// FileDiff is a proposed file change (also a Part type via Part.Path/Before/After).
type FileDiff struct {
	Path     string  `json:"path"`
	Before   *string `json:"before"`
	After    *string `json:"after"`
	Language string  `json:"language,omitempty"`
	Applied  bool    `json:"applied"`
}

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

// Metrics is the body of GET /v1/metrics (SPEC §6.16).
type Metrics struct {
	UptimeS   int                           `json:"uptime_s"`
	Sessions  MetricsSessions               `json:"sessions"`
	Messages  MetricsMessages               `json:"messages"`
	Tokens    MetricsTokens                 `json:"tokens"`
	Cost      MetricsCost                   `json:"cost"`
	Latencies map[string]MetricsLatencyStat `json:"latencies,omitempty"`
}

// MetricsLatencyStat is one row of per-route timing — keyed by mux
// pattern (e.g. "GET /v1/sessions/{id}"). count is total samples ever
// observed; the percentiles come from a recent-1024-sample reservoir.
type MetricsLatencyStat struct {
	Count int     `json:"count"`
	P50Ms float64 `json:"p50_ms"`
	P95Ms float64 `json:"p95_ms"`
	MaxMs float64 `json:"max_ms"`
}

type MetricsSessions struct {
	Total    int            `json:"total"`
	Active   int            `json:"active"`
	ByStatus map[string]int `json:"by_status"`
}

type MetricsMessages struct {
	Total  int            `json:"total"`
	ByRole map[string]int `json:"by_role"`
}

type MetricsTokens struct {
	InputTotal      int `json:"input_total"`
	OutputTotal     int `json:"output_total"`
	CacheReadTotal  int `json:"cache_read_total"`
	CacheWriteTotal int `json:"cache_write_total"`
}

type MetricsCost struct {
	TotalUSD   float64            `json:"total_usd"`
	ByProvider map[string]float64 `json:"by_provider"`
}
