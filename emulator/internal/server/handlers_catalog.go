package server

// Static catalog data — providers, tools, agents, MCP, commands. The
// emulator returns hard-coded values that exercise the wire shapes; real
// backends would compute these from runtime state.

import (
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/events"
	"github.com/JaimeCernuda/gact-tui/emulator/internal/store"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// --- §6.12 Providers + Models ----------------------------------------------

func (s *Server) handleListProviders(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"providers": staticProviders(),
	})
}

func (s *Server) handleGetProvider(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	for _, p := range staticProviders() {
		if p.ID == id {
			writeJSON(w, http.StatusOK, p)
			return
		}
	}
	writeError(w, http.StatusNotFound, "provider_not_found", "no provider with id "+id)
}

func (s *Server) handleListProviderModels(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	models, ok := staticModels()[id]
	if !ok {
		writeError(w, http.StatusNotFound, "provider_not_found", "no provider with id "+id)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"models": models})
}

type lmProviderPreset struct {
	ID                  string `json:"id"`
	Label               string `json:"label"`
	Provider            string `json:"provider"`
	APIBase             string `json:"api_base"`
	SuggestedModel      string `json:"suggested_model"`
	RequiresAPIKey      bool   `json:"requires_api_key"`
	APIKeyEnv           string `json:"api_key_env,omitempty"`
	AuthMethod          string `json:"auth_method,omitempty"`
	IsAuthenticated     bool   `json:"is_authenticated,omitempty"`
	Description         string `json:"description"`
	Status              string `json:"status,omitempty"`
	StatusMessage       string `json:"status_message,omitempty"`
	SupportsLiveCatalog bool   `json:"supports_live_catalog,omitempty"`
}

type lmProviderInfo struct {
	Configured     bool               `json:"configured"`
	Provider       string             `json:"provider,omitempty"`
	APIBase        string             `json:"api_base,omitempty"`
	Model          string             `json:"model,omitempty"`
	Temperature    float64            `json:"temperature,omitempty"`
	MaxTokens      int                `json:"max_tokens,omitempty"`
	ContextLength  int                `json:"context_length,omitempty"`
	ThinkingBudget int                `json:"thinking_budget,omitempty"`
	State          string             `json:"state,omitempty"`
	StatusMessage  string             `json:"status_message,omitempty"`
	Presets        []lmProviderPreset `json:"presets,omitempty"`
}

type lmProviderRequest struct {
	Provider       string  `json:"provider"`
	APIBase        string  `json:"api_base"`
	Model          string  `json:"model"`
	Temperature    float64 `json:"temperature,omitempty"`
	MaxTokens      int     `json:"max_tokens,omitempty"`
	ContextLength  int     `json:"context_length,omitempty"`
	ThinkingBudget int     `json:"thinking_budget,omitempty"`
}

func (s *Server) handleGetLMProvider(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, staticLMProviderInfo("anthropic", "claude-opus-4-7"))
}

func (s *Server) handlePutLMProvider(w http.ResponseWriter, r *http.Request) {
	var req lmProviderRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	req.Provider = strings.TrimSpace(req.Provider)
	req.Model = strings.TrimSpace(req.Model)
	if req.Provider == "" || req.Model == "" {
		writeError(w, http.StatusBadRequest, "invalid_body", "provider and model required")
		return
	}
	models, ok := staticModels()[req.Provider]
	if !ok {
		writeError(w, http.StatusBadRequest, "provider_not_found", "no provider with id "+req.Provider)
		return
	}
	found := false
	for _, model := range models {
		if model.ID == req.Model {
			found = true
			break
		}
	}
	if !found {
		writeError(w, http.StatusBadRequest, "model_not_found", "no model "+req.Model+" for provider "+req.Provider)
		return
	}
	info := staticLMProviderInfo(req.Provider, req.Model)
	info.APIBase = strings.TrimSpace(req.APIBase)
	info.Temperature = req.Temperature
	info.MaxTokens = req.MaxTokens
	info.ContextLength = req.ContextLength
	info.ThinkingBudget = req.ThinkingBudget
	writeJSON(w, http.StatusOK, info)
}

func staticLMProviderInfo(provider, model string) lmProviderInfo {
	return lmProviderInfo{
		Configured:    true,
		Provider:      provider,
		Model:         model,
		Temperature:   1.0,
		MaxTokens:     32000,
		ContextLength: 200000,
		State:         "ready",
		StatusMessage: "emulator provider catalog ready",
		Presets: []lmProviderPreset{
			{
				ID:                  "anthropic",
				Label:               "Anthropic",
				Provider:            "anthropic",
				APIBase:             "https://api.anthropic.com/v1",
				SuggestedModel:      "claude-opus-4-7",
				RequiresAPIKey:      false,
				AuthMethod:          "oauth",
				IsAuthenticated:     true,
				Description:         "Hosted Claude models with tool and thinking support.",
				Status:              "ready",
				StatusMessage:       "authenticated",
				SupportsLiveCatalog: true,
			},
			{
				ID:                  "openai",
				Label:               "OpenAI",
				Provider:            "openai",
				APIBase:             "https://api.openai.com/v1",
				SuggestedModel:      "gpt-5",
				RequiresAPIKey:      true,
				APIKeyEnv:           "OPENAI_API_KEY",
				AuthMethod:          "api_key",
				Description:         "OpenAI API models with direct API-key authentication.",
				Status:              "needs_api_key",
				StatusMessage:       "paste an API key before saving",
				SupportsLiveCatalog: true,
			},
			{
				ID:                  "local",
				Label:               "Local emulator",
				Provider:            "local",
				APIBase:             "http://127.0.0.1:11434/v1",
				SuggestedModel:      "llama3.3",
				RequiresAPIKey:      false,
				AuthMethod:          "none",
				IsAuthenticated:     true,
				Description:         "Local no-auth model endpoint for visual-loop testing.",
				Status:              "ready",
				StatusMessage:       "static emulator catalog",
				SupportsLiveCatalog: true,
			},
		},
	}
}

func staticProviders() []gact.Provider {
	return []gact.Provider{
		{ID: "anthropic", Name: "Anthropic", AuthMethods: []string{"api_key", "oauth"}, IsAuthenticated: true, DefaultModel: "claude-opus-4-7"},
		{ID: "openai", Name: "OpenAI", AuthMethods: []string{"api_key"}, IsAuthenticated: false, DefaultModel: "gpt-5"},
		{ID: "local", Name: "Local (Ollama)", AuthMethods: []string{"none"}, IsAuthenticated: true, DefaultModel: "llama3.3"},
	}
}

func staticModels() map[string][]gact.Model {
	support := func(tools, vision, think, cu, cache bool) gact.ModelSupports {
		return gact.ModelSupports{
			Tools: tools, Vision: vision, Thinking: think, ComputerUse: cu, PromptCaching: cache,
		}
	}
	return map[string][]gact.Model{
		"anthropic": {
			{ID: "claude-opus-4-7", Name: "Claude Opus 4.7", ContextWindow: 1_000_000, MaxOutputTokens: 8192,
				Supports: support(true, true, true, true, true),
				Pricing:  &gact.ModelPricing{InputPerMTok: 15, OutputPerMTok: 75, CacheReadPerMTok: 1.5, CacheWritePerMTok: 18.75}},
			{ID: "claude-sonnet-4-6", Name: "Claude Sonnet 4.6", ContextWindow: 200_000, MaxOutputTokens: 8192,
				Supports: support(true, true, true, false, true),
				Pricing:  &gact.ModelPricing{InputPerMTok: 3, OutputPerMTok: 15, CacheReadPerMTok: 0.3, CacheWritePerMTok: 3.75}},
			{ID: "claude-haiku-4-5", Name: "Claude Haiku 4.5", ContextWindow: 200_000, MaxOutputTokens: 8192,
				Supports: support(true, true, false, false, true),
				Pricing:  &gact.ModelPricing{InputPerMTok: 0.8, OutputPerMTok: 4}},
		},
		"openai": {
			{ID: "gpt-5", Name: "GPT-5", ContextWindow: 256_000, MaxOutputTokens: 16384, Supports: support(true, true, false, false, false)},
			{ID: "gpt-5-mini", Name: "GPT-5 Mini", ContextWindow: 128_000, MaxOutputTokens: 8192, Supports: support(true, true, false, false, false)},
		},
		"local": {
			{ID: "llama3.3", Name: "Llama 3.3 70B", ContextWindow: 32_000, MaxOutputTokens: 4096, Supports: support(true, false, false, false, false)},
			{ID: "qwen3-coder", Name: "Qwen 3 Coder 32B", ContextWindow: 64_000, MaxOutputTokens: 8192, Supports: support(true, false, false, false, false)},
		},
	}
}

// --- §6.6 Tools ------------------------------------------------------------

func (s *Server) handleListTools(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"tools": staticTools()})
}

func (s *Server) handleGetTool(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	for _, t := range staticTools() {
		if t.ID == id {
			writeJSON(w, http.StatusOK, t)
			return
		}
	}
	writeError(w, http.StatusNotFound, "tool_not_found", "no tool with id "+id)
}

func staticTools() []gact.Tool {
	stringSchema := func() map[string]any {
		return map[string]any{"type": "string"}
	}
	return []gact.Tool{
		{
			ID: "bash", Source: "builtin", Name: "bash", Title: "Run shell command",
			Description: "Execute a bash command in the workspace.",
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"command": stringSchema(),
				},
				"required": []string{"command"},
			},
			Annotations:       &gact.ToolAnnotations{Title: "Run shell command", DestructiveHint: true, OpenWorldHint: false},
			PermissionDefault: "ask",
		},
		{
			ID: "read_file", Source: "builtin", Name: "read_file", Title: "Read file",
			Description: "Read the contents of a file.",
			InputSchema: map[string]any{
				"type":       "object",
				"properties": map[string]any{"path": stringSchema()},
				"required":   []string{"path"},
			},
			Annotations:       &gact.ToolAnnotations{Title: "Read file", ReadOnlyHint: true},
			PermissionDefault: "allow",
		},
		{
			ID: "edit_file", Source: "builtin", Name: "edit_file", Title: "Edit file",
			Description: "Modify a file in place. Returns a diff.",
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"path":  stringSchema(),
					"patch": stringSchema(),
				},
				"required": []string{"path", "patch"},
			},
			Annotations:       &gact.ToolAnnotations{Title: "Edit file", DestructiveHint: true},
			PermissionDefault: "ask",
		},
		{
			ID: "web_search", Source: "builtin", Name: "web_search", Title: "Search the web",
			Description: "Search the web for relevant pages.",
			InputSchema: map[string]any{
				"type":       "object",
				"properties": map[string]any{"query": stringSchema()},
				"required":   []string{"query"},
			},
			Annotations:       &gact.ToolAnnotations{Title: "Web search", ReadOnlyHint: true, OpenWorldHint: true},
			PermissionDefault: "allow",
		},
		{
			ID: "fake-mcp.fetch", Source: "mcp", ServerID: "mcp_fake", Name: "fetch", Title: "Fetch URL",
			Description: "(MCP) Download a URL and return its contents.",
			InputSchema: map[string]any{
				"type":       "object",
				"properties": map[string]any{"url": stringSchema()},
				"required":   []string{"url"},
			},
			PermissionDefault: "allow",
		},
		{
			ID: "fake-mcp.dbquery", Source: "mcp", ServerID: "mcp_fake", Name: "dbquery", Title: "Database query",
			Description: "(MCP) Run a read-only query against the demo database.",
			InputSchema: map[string]any{
				"type":       "object",
				"properties": map[string]any{"sql": stringSchema()},
				"required":   []string{"sql"},
			},
			PermissionDefault: "allow",
		},
	}
}

// --- §6.5 Agents -----------------------------------------------------------

func (s *Server) handleListAgents(w http.ResponseWriter, r *http.Request) {
	agents := staticAgents()
	// v0.2 — SPEC §4.3.1: `?tier=N` filters to a specific tier.
	// Absent = return all tiers (backwards-compat with v0.1).
	if tierStr := r.URL.Query().Get("tier"); tierStr != "" {
		var filtered []gact.AgentDef
		for _, a := range agents {
			if atoi(tierStr) == a.Tier {
				filtered = append(filtered, a)
			}
		}
		agents = filtered
	}
	writeJSON(w, http.StatusOK, map[string]any{"agents": agents})
}

// atoi is a small helper for query-string int parsing — returns 0 on
// anything we don't like so `?tier=bogus` silently returns no tier-0
// matches (i.e. no results) rather than 500ing.
func atoi(s string) int {
	n := 0
	for _, r := range s {
		if r < '0' || r > '9' {
			return 0
		}
		n = n*10 + int(r-'0')
	}
	return n
}

func (s *Server) handleGetAgent(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	for _, a := range staticAgents() {
		if a.ID == id {
			writeJSON(w, http.StatusOK, a)
			return
		}
	}
	writeError(w, http.StatusNotFound, "agent_not_found", "no agent with id "+id)
}

// agent_write is false — these are 501s.
func (s *Server) handleAgentNotImplemented(w http.ResponseWriter, r *http.Request) {
	writeError(w, http.StatusNotImplemented, "not_implemented",
		"this emulator's capabilities.agent_write is false; agent write API not supported")
}

func staticAgents() []gact.AgentDef {
	return []gact.AgentDef{
		{
			ID: "default", Source: "builtin", Title: "Default Agent",
			Description:  "General-purpose coding agent with full tool access.",
			DefaultModel: &gact.ModelRef{ProviderID: "anthropic", ModelID: "claude-opus-4-7"},
			Tools:        []string{"bash", "read_file", "edit_file", "web_search"},
		},
		{
			ID: "code_reviewer", Source: "builtin", Title: "Code Reviewer",
			Description:  "Reviews diffs without modifying files. Read-only.",
			DefaultModel: &gact.ModelRef{ProviderID: "anthropic", ModelID: "claude-sonnet-4-6"},
			Tools:        []string{"read_file"},
		},
		// Two skill-source agents so the /skills catalog browser has
		// real data to render (LLL3). Per SPEC §6.5 line 807, skills
		// are agents with source="skill" — no separate namespace.
		{
			ID: "test_writer", Source: "skill", Title: "Test Writer",
			Description:  "Writes table-driven Go tests for a target package.",
			DefaultModel: &gact.ModelRef{ProviderID: "anthropic", ModelID: "claude-sonnet-4-6"},
			Tools:        []string{"read_file", "edit_file"},
		},
		{
			ID: "release_notes", Source: "skill", Title: "Release Notes",
			Description:  "Summarizes git diffs since a tag into changelog entries.",
			DefaultModel: &gact.ModelRef{ProviderID: "anthropic", ModelID: "claude-haiku-4-5"},
			Tools:        []string{"bash", "read_file"},
		},

		// v0.2 — SPEC §4.3.1: three tier-2 specialists wired with
		// tier/specialization/keywords so clients can exercise the
		// multi-tier agent catalog without a CLIO backend handy.
		// Names stay generic (code / research / data) — not domain-
		// specific.
		{
			ID: "code_expert", Source: "builtin", Title: "Code Expert",
			Description:    "Source-level editing, review, refactoring.",
			DefaultModel:   &gact.ModelRef{ProviderID: "anthropic", ModelID: "claude-sonnet-4-6"},
			Tools:          []string{"read_file", "edit_file", "grep"},
			Tier:           2,
			Specialization: "code_editing",
			Keywords:       []string{"edit", "refactor", "fix", "review", "patch"},
		},
		{
			ID: "research_expert", Source: "builtin", Title: "Research Expert",
			Description:    "Web search + document retrieval + synthesis.",
			DefaultModel:   &gact.ModelRef{ProviderID: "anthropic", ModelID: "claude-sonnet-4-6"},
			Tools:          []string{"web_search", "read_file"},
			Tier:           2,
			Specialization: "knowledge_retrieval",
			Keywords:       []string{"search", "find", "look up", "research", "citations"},
		},
		{
			ID: "data_expert", Source: "builtin", Title: "Data Expert",
			Description:    "Profile and analyse structured data files.",
			DefaultModel:   &gact.ModelRef{ProviderID: "anthropic", ModelID: "claude-sonnet-4-6"},
			Tools:          []string{"read_file", "bash"},
			Tier:           2,
			Specialization: "data_analysis",
			Keywords:       []string{"analyze", "profile", "inspect", "data", "csv", "parquet"},
		},
	}
}

// --- §6.7 MCP --------------------------------------------------------------

func (s *Server) handleListMcpServers(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"servers": staticMcpServers()})
}

func (s *Server) handleGetMcpServer(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	for _, srv := range staticMcpServers() {
		if srv.ID == id {
			writeJSON(w, http.StatusOK, srv)
			return
		}
	}
	writeError(w, http.StatusNotFound, "mcp_not_found", "no MCP server with id "+id)
}

func (s *Server) handleMcpReconnect(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !mcpExists(id) {
		writeError(w, http.StatusNotFound, "mcp_not_found", "no MCP server with id "+id)
		return
	}
	// MMM1: surface a notification SSE event so connected clients see
	// the reconnect succeeded without polling. Workspace-scoped so
	// every TUI/SSE listener picks it up.
	s.bus.Publish(events.Event{
		Type: "notification",
		Payload: map[string]any{
			"level": "info",
			"title": "MCP server reconnected",
			"body":  id,
		},
	})
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleMcpServerTools(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !mcpExists(id) {
		writeError(w, http.StatusNotFound, "mcp_not_found", "no MCP server with id "+id)
		return
	}
	tools := []gact.Tool{}
	for _, t := range staticTools() {
		if t.Source == "mcp" && t.ServerID == id {
			tools = append(tools, t)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"tools": tools})
}

func (s *Server) handleMcpServerResources(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !mcpExists(id) {
		writeError(w, http.StatusNotFound, "mcp_not_found", "no MCP server with id "+id)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"resources": staticMcpResources(id)})
}

func (s *Server) handleMcpServerResourceTemplates(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !mcpExists(id) {
		writeError(w, http.StatusNotFound, "mcp_not_found", "no MCP server with id "+id)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"templates": []gact.McpResourceTemplate{
		{ServerID: id, URITemplate: "file:///docs/{name}.md", Name: "doc", Description: "Demo doc by name"},
	}})
}

type mcpReadRequest struct {
	URI string `json:"uri"`
}

func (s *Server) handleMcpResourceRead(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !mcpExists(id) {
		writeError(w, http.StatusNotFound, "mcp_not_found", "no MCP server with id "+id)
		return
	}
	var req mcpReadRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.URI == "" {
		writeError(w, http.StatusBadRequest, "invalid_body", "uri required")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"contents": []gact.McpContent{
			{URI: req.URI, MimeType: "text/plain", Text: "demo content for " + req.URI},
		},
	})
}

func (s *Server) handleMcpResourceSubscribe(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !mcpExists(id) {
		writeError(w, http.StatusNotFound, "mcp_not_found", "no MCP server with id "+id)
		return
	}
	var req mcpReadRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleMcpServerPrompts(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !mcpExists(id) {
		writeError(w, http.StatusNotFound, "mcp_not_found", "no MCP server with id "+id)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"prompts": staticMcpPrompts(id)})
}

type mcpPromptGetRequest struct {
	Name      string         `json:"name"`
	Arguments map[string]any `json:"arguments,omitempty"`
}

func (s *Server) handleMcpPromptGet(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !mcpExists(id) {
		writeError(w, http.StatusNotFound, "mcp_not_found", "no MCP server with id "+id)
		return
	}
	var req mcpPromptGetRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"description": "Demo prompt for " + req.Name,
		"messages": []gact.McpMessage{
			{Role: gact.RoleUser, Content: []gact.Part{
				gact.NewTextPart("Demo body for prompt " + req.Name),
			}},
		},
	})
}

func mcpExists(id string) bool {
	for _, s := range staticMcpServers() {
		if s.ID == id {
			return true
		}
	}
	return false
}

func staticMcpServers() []gact.McpServer {
	return []gact.McpServer{
		{
			ID: "mcp_fake", Name: "fake-mcp", Version: "0.1.0",
			Transport: "stdio", ProtocolVersion: "2025-06-18", Status: "ready",
			ServerInfo:   map[string]any{"name": "fake-mcp", "version": "0.1.0"},
			Instructions: "Demo MCP server. Two tools (fetch, dbquery), one resource, one prompt.",
			DeclaredCapabilities: gact.McpCapabilities{
				Tools:     true,
				Resources: &gact.McpResourcesCapability{Subscribe: true, ListChanged: true},
				Prompts:   &gact.McpPromptsCapability{ListChanged: false},
				Logging:   true,
			},
		},
	}
}

func staticMcpResources(serverID string) []gact.McpResource {
	return []gact.McpResource{
		{ServerID: serverID, URI: "file:///docs/welcome.md", Name: "welcome",
			Title: "Welcome", Description: "Intro doc", MimeType: "text/markdown", Size: 256},
	}
}

func staticMcpPrompts(serverID string) []gact.McpPrompt {
	return []gact.McpPrompt{
		{ServerID: serverID, Name: "summarize", Title: "Summarize",
			Description: "Summarize a chunk of text",
			Arguments: []gact.McpPromptArg{
				{Name: "text", Required: true, Description: "Text to summarize"},
			}},
	}
}

// --- §6.13 Commands --------------------------------------------------------

func (s *Server) handleListCommands(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"commands": staticCommands()})
}

func staticCommands() []gact.Command {
	return []gact.Command{
		{ID: "/clear", Title: "Clear chat history", Source: "builtin", Shortcut: "ctrl+l"},
		{ID: "/cancel", Title: "Cancel current run", Source: "builtin", Shortcut: "ctrl+c"},
		{ID: "/model", Title: "Switch model", Source: "builtin",
			Arguments: []gact.AgentParameter{{Name: "model_id", Type: "string", Required: true}}},
		{ID: "/agent", Title: "Switch agent", Source: "builtin",
			Arguments: []gact.AgentParameter{{Name: "agent_id", Type: "string", Required: true}}},
		{ID: "/add", Title: "Add file to context", Source: "builtin",
			Arguments: []gact.AgentParameter{{Name: "path", Type: "string", Required: true}}},
		{ID: "/drop", Title: "Drop file from context", Source: "builtin",
			Arguments: []gact.AgentParameter{{Name: "path", Type: "string", Required: true}}},
		{ID: "/diff", Title: "Show pending diffs", Source: "builtin"},
		{ID: "/undo", Title: "Undo last assistant change", Source: "builtin"},
		{ID: "/help", Title: "Show help", Source: "builtin", Shortcut: "?"},
		{ID: "/mcp", Title: "List connected MCP servers", Source: "builtin"},
		{ID: "/tools", Title: "List available tools", Source: "builtin"},
		{ID: "/skills", Title: "List available skills", Source: "builtin"},
		{ID: "/agents", Title: "Pick an agent for this session", Source: "builtin"},
		{ID: "/scenarios", Title: "Show scenario trigger keywords", Source: "builtin"},
		{ID: "/new", Title: "Create a new session", Source: "builtin"},
		{ID: "/rename", Title: "Rename the current session", Source: "builtin"},
		{ID: "/sessions", Title: "Focus sidebar + filter sessions by title", Source: "builtin"},
		{ID: "/theme", Title: "Pick a colour theme (live preview)", Source: "builtin"},
		{ID: "/theme-export", Title: "Export current palette to ~/.config/gact/theme.json", Source: "builtin"},
		{ID: "/metrics", Title: "Open backend metrics modal", Source: "builtin"},
		{ID: "/doctor", Title: "Open backend health + integrations modal", Source: "builtin"},
		{ID: "/theme-next", Title: "Cycle to the next colour theme", Source: "builtin"},
		{ID: "/theme-prev", Title: "Cycle to the previous colour theme", Source: "builtin"},
		{ID: "/duplicate", Title: "Copy current session's title/model/agent to a fresh session", Source: "builtin"},
		{ID: "/summarize", Title: "Summarize fake-mcp text",
			Source: "mcp_prompt", ServerID: "mcp_fake",
			Arguments: []gact.AgentParameter{{Name: "text", Type: "multiline", Required: true}}},
	}
}

// handleSessionCommand executes a slash-command against a session.
//
// For built-in commands we implement the side-effect directly:
//
//   - /clear — drop every message in the session and reset derived counters,
//     then emit a session.cleared event so the TUI can reload its view.
//   - /cancel — same effect as POST /v1/sessions/{id}/cancel: call the cancel
//     hook so the scenario engine halts any in-flight script and flip the
//     status to idle.
//   - /help — echo a short help message back as an assistant text part so
//     the user sees something beyond "command 204 OK".
//   - /undo, /diff — stub with an assistant message for discoverability;
//     the real apply/reject/undo flow is via the diff viewer (a/r keys).
//
// Unknown IDs return 404. Commands that legitimately take arguments but
// received none return 400. Everything else returns 204 so the client can
// ignore the response body.
func (s *Server) handleSessionCommand(w http.ResponseWriter, r *http.Request) {
	cmd := r.PathValue("cmd_id")
	cmd, _ = url.PathUnescape(cmd)
	sessionID := r.PathValue("id")

	known := false
	for _, c := range staticCommands() {
		if c.ID == cmd {
			known = true
			break
		}
	}
	if !known {
		writeError(w, http.StatusNotFound, "command_not_found", "no command "+cmd)
		return
	}

	if _, err := s.store.GetSession(sessionID); err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}

	switch cmd {
	case "/clear":
		n, err := s.store.ClearSessionMessages(sessionID)
		if err != nil {
			writeStoreError(w, err, "session_not_found", "invalid_session")
			return
		}
		// Non-standard but useful: emit a session.cleared event so the
		// TUI knows to drop its local message cache. SSE subscribers can
		// ignore unknown event types, so this is forward-compatible.
		s.bus.Publish(events.Event{
			Type:      "session.cleared",
			SessionID: sessionID,
			Payload: map[string]any{
				"session_id":       sessionID,
				"messages_cleared": n,
			},
		})
		// Emit a zeroed cost.updated so the TUI's footer meter drops
		// back to $0.0000 (0 in / 0 out) in lockstep with the message
		// wipe. Otherwise the meter stays at the pre-clear value until
		// the next assistant turn rolls in new totals.
		s.bus.Publish(events.Event{
			Type:      "cost.updated",
			SessionID: sessionID,
			Payload: map[string]any{
				"session_id": sessionID,
				"cost_usd":   0.0,
				"tokens":     gact.Tokens{},
			},
		})
		writeJSON(w, http.StatusOK, map[string]any{"messages_cleared": n})
		return

	case "/cancel":
		if s.onCancel != nil {
			s.onCancel(sessionID)
		}
		if _, err := s.store.UpdateSession(sessionID, func(sess *gact.Session) {
			sess.Status = gact.StatusIdle
		}); err != nil {
			writeStoreError(w, err, "session_not_found", "invalid_session")
			return
		}
		s.bus.Publish(events.Event{
			Type:      "session.status_changed",
			SessionID: sessionID,
			Payload: map[string]any{
				"session_id": sessionID,
				"status":     gact.StatusIdle,
				"reason":     "cancelled",
			},
		})
		w.WriteHeader(http.StatusNoContent)
		return

	case "/help":
		s.emitAssistantNote(sessionID, helpCommandMessage())
		w.WriteHeader(http.StatusNoContent)
		return

	case "/diff":
		s.emitAssistantNote(sessionID,
			"No pending diffs. When a diff is active use `a` to apply or `r` to reject from the body pane.")
		w.WriteHeader(http.StatusNoContent)
		return

	case "/undo":
		s.emitAssistantNote(sessionID,
			"Undo not implemented in the emulator. Real backends expose it via /v1/diffs/:id/undo.")
		w.WriteHeader(http.StatusNoContent)
		return
	}

	// Every other built-in (e.g. /model, /agent, /add, /drop, /summarize)
	// requires arguments we don't parse here — record the invocation and
	// hand control back.
	w.WriteHeader(http.StatusNoContent)
}

// emitAssistantNote appends a single assistant-text message to a session so
// users see a visible response to a slash command beyond "204 OK". The part
// is emitted as a complete message (no streaming) so a single SSE cycle
// delivers everything subscribers need.
//
// Event shape matches the scenario engine's convention: message.created
// carries the Message struct directly as Payload (not wrapped), and
// message.part.added wraps {message_id, part} so the TUI's existing SSE
// handlers pick it up without changes.
func (s *Server) emitAssistantNote(sessionID, body string) {
	saved, err := s.store.AppendMessage(gact.Message{
		SessionID: sessionID,
		Role:      gact.RoleAssistant,
		Parts:     []gact.Part{gact.NewTextPart(body)},
	})
	if err != nil {
		return
	}

	s.bus.Publish(events.Event{
		Type:      "message.created",
		SessionID: sessionID,
		Payload:   saved,
	})
	// Also emit message.part.added for the single text part. Some clients
	// build their message view from part events rather than the message
	// snapshot, so both paths should deliver the body.
	if len(saved.Parts) > 0 {
		s.bus.Publish(events.Event{
			Type:      "message.part.added",
			SessionID: sessionID,
			Payload: map[string]any{
				"message_id": saved.ID,
				"part":       saved.Parts[0],
			},
		})
	}
	s.bus.Publish(events.Event{
		Type:      "message.completed",
		SessionID: sessionID,
		Payload: map[string]any{
			"message_id": saved.ID,
		},
	})
}

// helpCommandMessage returns the markdown body shown when a user runs
// /help. Kept out-of-line so it can be reused by tests.
func helpCommandMessage() string {
	return "**GACT slash commands**\n\n" +
		"- `/clear` — wipe the current session's messages\n" +
		"- `/cancel` — halt the current assistant turn\n" +
		"- `/diff` — show pending diffs (use `a`/`r` in the body pane)\n" +
		"- `/help` — this message\n" +
		"- `/undo` — revert the last assistant change (if backend supports it)\n" +
		"- `/model`, `/agent` — switch model/agent (use Settings via Ctrl+S for the picker)\n\n" +
		"**Input**: `Enter` sends, `Shift+Enter` / `\\<Enter>` inserts a newline."
}

// --- §6.16 Metrics ---------------------------------------------------------

func (s *Server) handleMetrics(w http.ResponseWriter, r *http.Request) {
	sessions := s.store.ListSessions(store.SessionFilter{IncludeArchived: true})
	byStatus := map[string]int{}
	active := 0
	totalMsg := 0
	byRole := map[string]int{
		gact.RoleUser:      0,
		gact.RoleAssistant: 0,
		gact.RoleTool:      0,
		gact.RoleSystem:    0,
	}
	tokens := gact.MetricsTokens{}
	costByProvider := map[string]float64{}
	totalCost := 0.0

	for _, sess := range sessions {
		byStatus[sess.Status]++
		if sess.Status != gact.StatusIdle {
			active++
		}
		totalMsg += sess.MessageCount
		tokens.InputTotal += sess.Tokens.Input
		tokens.OutputTotal += sess.Tokens.Output
		tokens.CacheReadTotal += sess.Tokens.CacheRead
		tokens.CacheWriteTotal += sess.Tokens.CacheWrite
		totalCost += sess.CostUSD
		if sess.Model.ProviderID != "" {
			costByProvider[sess.Model.ProviderID] += sess.CostUSD
		}
	}

	// Walk per-session messages to fill byRole counts cheaply.
	for _, sess := range sessions {
		msgs, _, _ := s.store.ListMessages(store.MessageFilter{
			SessionID: sess.ID, Limit: 100000, IncludeSystem: true,
		})
		for _, m := range msgs {
			byRole[m.Role]++
		}
	}

	latencies := map[string]gact.MetricsLatencyStat{}
	for pat, st := range s.latency.Snapshot() {
		latencies[pat] = gact.MetricsLatencyStat{
			Count: st.Count, P50Ms: st.P50Ms, P95Ms: st.P95Ms, MaxMs: st.MaxMs,
		}
	}

	writeJSON(w, http.StatusOK, gact.Metrics{
		UptimeS: int(time.Since(s.started).Seconds()),
		Sessions: gact.MetricsSessions{
			Total: len(sessions), Active: active, ByStatus: byStatus,
		},
		Messages:  gact.MetricsMessages{Total: totalMsg, ByRole: byRole},
		Tokens:    tokens,
		Cost:      gact.MetricsCost{TotalUSD: totalCost, ByProvider: costByProvider},
		Latencies: latencies,
	})
}

// --- §6.9 Files / context / repo_map ---------------------------------------

// In-memory context-files storage (per-session). Lives on Server because
// it's emulator-specific (not part of store, since store is the message DB).
// Would move to its own package if we built persistence later.
type contextFileSet struct {
	files map[string][]gact.ContextFile // sessionID -> files
}

func (s *Server) handleListContextFiles(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, err := s.store.GetSession(id); err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"files": s.contextFiles.get(id)})
}

type contextFileRequest struct {
	Path string `json:"path"`
	Mode string `json:"mode"`
}

func (s *Server) handleAddContextFile(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, err := s.store.GetSession(id); err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	var req contextFileRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Path == "" {
		writeError(w, http.StatusBadRequest, "invalid_body", "path required")
		return
	}
	if req.Mode == "" {
		req.Mode = "read"
	}
	cf := gact.ContextFile{Path: req.Path, Mode: req.Mode, AddedAt: time.Now().UTC().Format(time.RFC3339)}
	s.contextFiles.add(id, cf)
	writeJSON(w, http.StatusCreated, cf)
}

func (s *Server) handleDeleteContextFile(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req contextFileRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if !s.contextFiles.remove(id, req.Path) {
		writeError(w, http.StatusNotFound, "file_not_in_context", "no such file in context")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handlePatchContextFile(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req contextFileRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if cf, ok := s.contextFiles.update(id, req.Path, req.Mode); ok {
		writeJSON(w, http.StatusOK, cf)
		return
	}
	writeError(w, http.StatusNotFound, "file_not_in_context", "no such file in context")
}

// Workspace files: minimal listing of a tree on disk. Returns 200 with empty
// list if the workspace's root_path doesn't exist (emulator may not have
// the directory). This avoids surprising the TUI with errors.

func (s *Server) handleWorkspaceFiles(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	ws, err := s.store.GetWorkspace(id)
	if err != nil {
		writeStoreError(w, err, "workspace_not_found", "invalid_workspace")
		return
	}
	// T3: if the workspace's RootPath exists on disk as a real dir
	// AND the cfg.WalkWorkspaceFiles flag is on, walk it. Otherwise
	// return the static demo list so deterministic tests keep
	// passing without touching the filesystem.
	if s.cfg.WalkWorkspaceFiles && ws.RootPath != "" {
		if entries, ok := walkWorkspaceFiles(ws.RootPath); ok {
			writeJSON(w, http.StatusOK, map[string]any{"entries": entries})
			return
		}
	}
	// Static demo entries — the emulator doesn't walk a filesystem
	// by default to keep behaviour deterministic across CI
	// environments. The list is intentionally richer than the three
	// placeholders we started with so the TUI's @-file picker (M6)
	// has real material to fuzzy-match.
	const ts = "2026-04-15T10:00:00Z"
	writeJSON(w, http.StatusOK, map[string]any{"entries": []gact.FileEntry{
		{Path: "main.go", Type: "file", Size: 1024, Modified: ts},
		{Path: "README.md", Type: "file", Size: 512, Modified: ts},
		{Path: "go.mod", Type: "file", Size: 180, Modified: ts},
		{Path: "go.sum", Type: "file", Size: 4096, Modified: ts},
		{Path: "Makefile", Type: "file", Size: 320, Modified: ts},
		{Path: "internal", Type: "dir"},
		{Path: "internal/server/server.go", Type: "file", Size: 2400, Modified: ts},
		{Path: "internal/server/handlers.go", Type: "file", Size: 1800, Modified: ts},
		{Path: "internal/server/router.go", Type: "file", Size: 900, Modified: ts},
		{Path: "internal/store/store.go", Type: "file", Size: 3200, Modified: ts},
		{Path: "internal/store/store_test.go", Type: "file", Size: 2100, Modified: ts},
		{Path: "internal/events/bus.go", Type: "file", Size: 1500, Modified: ts},
		{Path: "pkg/gact/messaging.go", Type: "file", Size: 3600, Modified: ts},
		{Path: "pkg/gact/catalog.go", Type: "file", Size: 2800, Modified: ts},
		{Path: "cmd/server/main.go", Type: "file", Size: 1400, Modified: ts},
		{Path: "docs/architecture.md", Type: "file", Size: 5200, Modified: ts},
		{Path: "docs/contributing.md", Type: "file", Size: 1800, Modified: ts},
	}})
}

// walkWorkspaceFiles lists the real files under root. Returns
// (nil, false) if the root isn't a readable directory — callers fall
// back to the static list. Skips dotfiles + node_modules + .git to
// stay useful; a future flag could expose the full tree.
func walkWorkspaceFiles(root string) ([]gact.FileEntry, bool) {
	info, err := os.Stat(root)
	if err != nil || !info.IsDir() {
		return nil, false
	}
	var entries []gact.FileEntry
	walkErr := filepath.Walk(root, func(p string, fi os.FileInfo, err error) error {
		if err != nil {
			return nil // skip unreadable nodes
		}
		if p == root {
			return nil
		}
		name := fi.Name()
		if strings.HasPrefix(name, ".") || name == "node_modules" ||
			name == "vendor" || name == "target" {
			if fi.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		rel, relErr := filepath.Rel(root, p)
		if relErr != nil {
			return nil
		}
		entry := gact.FileEntry{
			Path:     filepath.ToSlash(rel),
			Modified: fi.ModTime().UTC().Format("2006-01-02T15:04:05Z"),
		}
		if fi.IsDir() {
			entry.Type = "dir"
		} else {
			entry.Type = "file"
			entry.Size = fi.Size()
		}
		entries = append(entries, entry)
		// Cap at 2000 entries — protects the TUI from 100K-file
		// monorepo floods, which would blow up the picker anyway.
		if len(entries) >= 2000 {
			return filepath.SkipAll
		}
		return nil
	})
	if walkErr != nil {
		return nil, false
	}
	return entries, true
}

func (s *Server) handleWorkspaceFileRead(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, err := s.store.GetWorkspace(id); err != nil {
		writeStoreError(w, err, "workspace_not_found", "invalid_workspace")
		return
	}
	p := r.URL.Query().Get("path")
	if p == "" {
		writeError(w, http.StatusBadRequest, "invalid_query", "path required")
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("// demo content of " + path.Base(p) + "\npackage main\n\nfunc main() {}\n"))
}

func (s *Server) handleRepoMap(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, err := s.store.GetWorkspace(id); err != nil {
		writeStoreError(w, err, "workspace_not_found", "invalid_workspace")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"tree": &gact.RepoMapNode{
			Path: "/", Type: "dir", Children: []*gact.RepoMapNode{
				{Path: "main.go", Type: "file", Symbols: []string{"main", "init"}},
				{Path: "README.md", Type: "file"},
				{Path: "internal", Type: "dir", Children: []*gact.RepoMapNode{
					{Path: "internal/handler.go", Type: "file", Symbols: []string{"Handler", "ServeHTTP"}},
				}},
			},
		},
		"tokens": 1024,
	})
}

// --- §6.10 Diffs -----------------------------------------------------------

// Diffs are stored in messages (file_diff parts). The handlers below scan
// the session's messages and aggregate.

func (s *Server) handleSessionDiffs(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, err := s.store.GetSession(id); err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	diffs := collectDiffs(s, id, "")
	writeJSON(w, http.StatusOK, map[string]any{"diffs": diffs})
}

func (s *Server) handleMessageDiffs(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	mid := r.PathValue("msg_id")
	if _, err := s.store.GetSession(id); err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	diffs := collectDiffs(s, id, mid)
	writeJSON(w, http.StatusOK, map[string]any{"diffs": diffs})
}

type applyRejectRequest struct {
	Paths []string `json:"paths,omitempty"`
}

func (s *Server) handleDiffApply(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, err := s.store.GetSession(id); err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	var req applyRejectRequest
	if !decodeJSONOptional(w, r, &req) {
		return
	}
	pathSet := setOf(req.Paths)
	applied := []string{}
	walkDiffParts(s, id, "", func(msgID, partID string, p *gact.Part) {
		if len(pathSet) > 0 && !pathSet[p.Path] {
			return
		}
		_, _ = s.store.UpdateMessagePart(msgID, partID, func(pp *gact.Part) {
			pp.Applied = true
		})
		applied = append(applied, p.Path)
	})
	writeJSON(w, http.StatusOK, map[string]any{"applied": applied})
}

func (s *Server) handleDiffReject(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, err := s.store.GetSession(id); err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	var req applyRejectRequest
	if !decodeJSONOptional(w, r, &req) {
		return
	}
	pathSet := setOf(req.Paths)
	rejected := []string{}
	walkDiffParts(s, id, "", func(msgID, partID string, p *gact.Part) {
		if len(pathSet) > 0 && !pathSet[p.Path] {
			return
		}
		_, _ = s.store.UpdateMessagePart(msgID, partID, func(pp *gact.Part) {
			pp.Applied = false
			if pp.Metadata == nil {
				pp.Metadata = map[string]any{}
			}
			pp.Metadata["rejected"] = true
		})
		rejected = append(rejected, p.Path)
	})
	writeJSON(w, http.StatusOK, map[string]any{"rejected": rejected})
}

type undoRequest struct {
	Count int `json:"count,omitempty"`
}

// rewindRequest is the body for POST /v1/sessions/{id}/rewind (MMM7).
type rewindRequest struct {
	ToMessageID   string `json:"to_message_id"`
	IncludeTarget bool   `json:"include_target,omitempty"`
}

func (s *Server) handleSessionRewind(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, err := s.store.GetSession(id); err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	var req rewindRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.ToMessageID == "" {
		writeError(w, http.StatusBadRequest, "invalid_body", "to_message_id required")
		return
	}
	// Pull the full ordered list (newest-first per ListMessages
	// contract). Find the target, then delete every message AFTER it
	// (= everything ahead of it in newest-first order, since "after"
	// in time is "before" in the slice).
	msgs, _, _ := s.store.ListMessages(store.MessageFilter{
		SessionID: id, Limit: 100000, IncludeSystem: true,
	})
	targetIdx := -1
	for i, m := range msgs {
		if m.ID == req.ToMessageID {
			targetIdx = i
			break
		}
	}
	if targetIdx < 0 {
		writeError(w, http.StatusNotFound, "message_not_found",
			"message "+req.ToMessageID+" not found in session "+id)
		return
	}
	deleted := []string{}
	// msgs[0..targetIdx-1] are newer than the target → delete them all.
	for i := 0; i < targetIdx; i++ {
		if err := s.store.DeleteMessage(msgs[i].ID); err == nil {
			deleted = append(deleted, msgs[i].ID)
		}
	}
	if req.IncludeTarget {
		if err := s.store.DeleteMessage(req.ToMessageID); err == nil {
			deleted = append(deleted, req.ToMessageID)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"deleted_messages": deleted})
}

func (s *Server) handleSessionUndo(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, err := s.store.GetSession(id); err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	var req undoRequest
	if !decodeJSONOptional(w, r, &req) {
		return
	}
	count := req.Count
	if count <= 0 {
		count = 1
	}
	msgs, _, _ := s.store.ListMessages(store.MessageFilter{
		SessionID: id, Limit: count, IncludeSystem: true,
	})
	reverted := []string{}
	for _, m := range msgs {
		if err := s.store.DeleteMessage(m.ID); err == nil {
			reverted = append(reverted, m.ID)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"reverted_messages": reverted})
}

func collectDiffs(s *Server, sessionID, onlyMsgID string) []gact.FileDiff {
	out := []gact.FileDiff{}
	walkDiffParts(s, sessionID, onlyMsgID, func(_, _ string, p *gact.Part) {
		out = append(out, gact.FileDiff{
			Path:     p.Path,
			Before:   p.Before,
			After:    p.After,
			Language: p.Language,
			Applied:  p.Applied,
		})
	})
	return out
}

func walkDiffParts(s *Server, sessionID, onlyMsgID string, fn func(msgID, partID string, p *gact.Part)) {
	msgs, _, _ := s.store.ListMessages(store.MessageFilter{
		SessionID: sessionID, Limit: 100000, IncludeSystem: true,
	})
	for _, m := range msgs {
		if onlyMsgID != "" && m.ID != onlyMsgID {
			continue
		}
		for i := range m.Parts {
			if m.Parts[i].Type == gact.PartTypeFileDiff {
				fn(m.ID, m.Parts[i].ID, &m.Parts[i])
			}
		}
	}
}

func setOf(s []string) map[string]bool {
	if len(s) == 0 {
		return nil
	}
	m := make(map[string]bool, len(s))
	for _, v := range s {
		m[v] = true
	}
	return m
}

// trim is unused but kept for future use / linter happy.
var _ = strings.TrimSpace
