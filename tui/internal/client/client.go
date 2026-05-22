// Package client is a typed HTTP + SSE client for a GACT v0.1 backend.
//
// Wire types come from the shared github.com/JaimeCernuda/gact-tui/emulator/pkg/gact
// module. The TUI never depends on emulator implementation details — only
// on the wire types, which are normative per contract/SPEC.md.
package client

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// Client is a GACT v0.1 client.
type Client struct {
	baseURL    string
	httpClient *http.Client
	bearer     string
}

// New constructs a Client. baseURL is e.g. "http://localhost:7777".
// httpClient defaults to http.DefaultClient with a 30s timeout.
func New(baseURL string, opts ...Option) *Client {
	c := &Client{
		baseURL:    baseURL,
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
	for _, o := range opts {
		o(c)
	}
	return c
}

// Option configures a Client.
type Option func(*Client)

// WithHTTPClient overrides the underlying http.Client. Note that streaming
// methods (e.g. EventStream) need a client without a Timeout — pass one
// configured for long-lived connections.
func WithHTTPClient(h *http.Client) Option { return func(c *Client) { c.httpClient = h } }

// WithBearerToken sets the Authorization header for every request.
func WithBearerToken(token string) Option { return func(c *Client) { c.bearer = token } }

// BaseURL returns the configured base URL.
func (c *Client) BaseURL() string { return c.baseURL }

// --- Low-level helpers -----------------------------------------------------

func (c *Client) req(ctx context.Context, method, path string, body any) (*http.Request, error) {
	var rd io.Reader
	if body != nil {
		buf := new(bytes.Buffer)
		if err := json.NewEncoder(buf).Encode(body); err != nil {
			return nil, fmt.Errorf("encode: %w", err)
		}
		rd = buf
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, rd)
	if err != nil {
		return nil, err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.bearer != "" {
		req.Header.Set("Authorization", "Bearer "+c.bearer)
	}
	return req, nil
}

// do executes a request and decodes the JSON response into out (if non-nil).
// On non-2xx, returns an *Error.
func (c *Client) do(ctx context.Context, method, path string, body, out any) error {
	req, err := c.req(ctx, method, path, body)
	if err != nil {
		return err
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		var e gact.Error
		_ = json.NewDecoder(resp.Body).Decode(&e)
		code := e.Error.Code
		if code == "" {
			code = e.Error.Error
		}
		return &Error{
			Status:  resp.StatusCode,
			Code:    code,
			Message: e.Error.Message,
		}
	}
	if out != nil && resp.StatusCode != http.StatusNoContent {
		if err := json.NewDecoder(resp.Body).Decode(out); err != nil && err != io.EOF {
			return fmt.Errorf("decode: %w", err)
		}
	}
	return nil
}

// Error is a typed error returned from the server.
type Error struct {
	Status  int
	Code    string
	Message string
}

func (e *Error) Error() string {
	return fmt.Sprintf("gact: %d %s: %s", e.Status, e.Code, e.Message)
}

// --- §3 capabilities + health ----------------------------------------------

// Health calls GET /v1/health.
func (c *Client) Health(ctx context.Context) (gact.HealthResponse, error) {
	var out gact.HealthResponse
	err := c.do(ctx, http.MethodGet, "/v1/health", nil, &out)
	return out, err
}

// Capabilities calls GET /v1/capabilities.
func (c *Client) Capabilities(ctx context.Context) (gact.Capabilities, error) {
	var out gact.Capabilities
	err := c.do(ctx, http.MethodGet, "/v1/capabilities", nil, &out)
	return out, err
}

// MemoryStats calls GET /v1/memory/stats (v0.2 §6.19 — CLIO-BBBBBBBBBB4).
// sessionID is optional; pass "" for global-only stats. Backends without
// capabilities.memory return 501 — the caller should gate on that flag.
func (c *Client) MemoryStats(ctx context.Context, sessionID string) (gact.MemoryStats, error) {
	path := "/v1/memory/stats"
	if sessionID != "" {
		path += "?session_id=" + sessionID
	}
	var out gact.MemoryStats
	err := c.do(ctx, http.MethodGet, path, nil, &out)
	return out, err
}

// --- §6.1 workspaces -------------------------------------------------------

// ListWorkspacesResponse is the response shape for GET /v1/workspaces.
type ListWorkspacesResponse struct {
	Workspaces []gact.Workspace `json:"workspaces"`
	NextCursor string           `json:"next_cursor,omitempty"`
}

func (c *Client) ListWorkspaces(ctx context.Context) ([]gact.Workspace, error) {
	var out ListWorkspacesResponse
	err := c.do(ctx, http.MethodGet, "/v1/workspaces", nil, &out)
	return out.Workspaces, err
}

// --- §6.2 sessions ---------------------------------------------------------

// CreateSessionRequest matches server.CreateSessionRequest (kept here to
// avoid pulling in server internals).
type CreateSessionRequest struct {
	WorkspaceID     string         `json:"workspace_id"`
	Title           string         `json:"title,omitempty"`
	Agent           *gact.AgentRef `json:"agent,omitempty"`
	Model           *gact.ModelRef `json:"model,omitempty"`
	ParentSessionID string         `json:"parent_session_id,omitempty"`
	ForkAtMessageID string         `json:"fork_at_message_id,omitempty"`
	Metadata        map[string]any `json:"metadata,omitempty"`
}

// ListSessionsResponse is the response shape for GET /v1/sessions.
type ListSessionsResponse struct {
	Sessions   []gact.Session `json:"sessions"`
	NextCursor string         `json:"next_cursor,omitempty"`
}

// SessionFilter narrows ListSessions.
type SessionFilter struct {
	WorkspaceID     string
	ParentSessionID string
	Archived        bool
}

func (c *Client) ListSessions(ctx context.Context, f SessionFilter) ([]gact.Session, error) {
	q := url.Values{}
	if f.WorkspaceID != "" {
		q.Set("workspace_id", f.WorkspaceID)
	}
	if f.ParentSessionID != "" {
		q.Set("parent_session_id", f.ParentSessionID)
	}
	if f.Archived {
		q.Set("archived", "true")
	}
	var out ListSessionsResponse
	err := c.do(ctx, http.MethodGet, "/v1/sessions?"+q.Encode(), nil, &out)
	return out.Sessions, err
}

func (c *Client) CreateSession(ctx context.Context, req CreateSessionRequest) (gact.Session, error) {
	var out gact.Session
	err := c.do(ctx, http.MethodPost, "/v1/sessions", req, &out)
	return out, err
}

func (c *Client) GetSession(ctx context.Context, id string) (gact.Session, error) {
	var out gact.Session
	err := c.do(ctx, http.MethodGet, "/v1/sessions/"+id, nil, &out)
	return out, err
}

func (c *Client) DeleteSession(ctx context.Context, id string) error {
	return c.do(ctx, http.MethodDelete, "/v1/sessions/"+id, nil, nil)
}

func (c *Client) CancelSession(ctx context.Context, id string) error {
	return c.do(ctx, http.MethodPost, "/v1/sessions/"+id+"/cancel", nil, nil)
}

// --- §6.3 messages ---------------------------------------------------------

// PostMessageRequest mirrors the server type.
type PostMessageRequest struct {
	Parts []gact.Part    `json:"parts"`
	Model *gact.ModelRef `json:"model,omitempty"`
}

// PostMessageResponse mirrors the server type.
type PostMessageResponse struct {
	MessageID  string    `json:"message_id"`
	AcceptedAt time.Time `json:"accepted_at"`
}

// ListMessagesResponse is the response for GET /v1/sessions/{id}/messages.
type ListMessagesResponse struct {
	Messages   []gact.Message `json:"messages"`
	NextCursor string         `json:"next_cursor,omitempty"`
}

// MessageFilter narrows the ListMessages query.
type MessageFilter struct {
	SessionID     string
	Before        string
	Limit         int
	IncludeSystem bool
}

func (c *Client) ListMessages(ctx context.Context, f MessageFilter) ([]gact.Message, string, error) {
	q := url.Values{}
	if f.Before != "" {
		q.Set("before", f.Before)
	}
	if f.Limit > 0 {
		q.Set("limit", strconv.Itoa(f.Limit))
	}
	if f.IncludeSystem {
		q.Set("include_system", "true")
	}
	var out ListMessagesResponse
	err := c.do(ctx, http.MethodGet,
		"/v1/sessions/"+f.SessionID+"/messages?"+q.Encode(), nil, &out)
	return out.Messages, out.NextCursor, err
}

func (c *Client) PostMessage(ctx context.Context, sessionID string, req PostMessageRequest) (PostMessageResponse, error) {
	var out PostMessageResponse
	err := c.do(ctx, http.MethodPost, "/v1/sessions/"+sessionID+"/messages", req, &out)
	return out, err
}

// SearchMatch mirrors SPEC §6.3 — one hit from /messages/search.
type SearchMatch struct {
	MessageID string  `json:"message_id"`
	PartID    string  `json:"part_id"`
	Snippet   string  `json:"snippet"`
	Score     float64 `json:"score"`
}

// SearchMessages issues GET /v1/sessions/{id}/messages/search?q=...
// and returns the matches in score order. Empty query returns no
// matches — callers should validate that before dispatching.
// DeleteMessage issues DELETE /v1/sessions/{sid}/messages/{id}. If
// sessionID is empty it falls back to the legacy global route for older
// backends. Callers that care about immediate UI follow-up can still drop
// the local entry optimistically after a successful call.
func (c *Client) DeleteMessage(ctx context.Context, sessionID, messageID string) error {
	if sessionID == "" {
		return c.do(ctx, http.MethodDelete, "/v1/messages/"+url.PathEscape(messageID), nil, nil)
	}
	path := "/v1/sessions/" + url.PathEscape(sessionID) + "/messages/" + url.PathEscape(messageID)
	return c.do(ctx, http.MethodDelete, path, nil, nil)
}

func (c *Client) SearchMessages(ctx context.Context, sessionID, query string) ([]SearchMatch, error) {
	q := url.Values{}
	q.Set("q", query)
	var out struct {
		Matches []SearchMatch `json:"matches"`
	}
	err := c.do(ctx, http.MethodGet,
		"/v1/sessions/"+sessionID+"/messages/search?"+q.Encode(), nil, &out)
	return out.Matches, err
}

// --- §6.5 agents -----------------------------------------------------------

func (c *Client) ListAgents(ctx context.Context) ([]gact.AgentDef, error) {
	var out struct {
		Agents []gact.AgentDef `json:"agents"`
	}
	err := c.do(ctx, http.MethodGet, "/v1/agents", nil, &out)
	return out.Agents, err
}

// --- §6.6 tools ------------------------------------------------------------

func (c *Client) ListTools(ctx context.Context) ([]gact.Tool, error) {
	var out struct {
		Tools []gact.Tool `json:"tools"`
	}
	err := c.do(ctx, http.MethodGet, "/v1/tools", nil, &out)
	return out.Tools, err
}

// --- §6.11 permissions -----------------------------------------------------

// PermissionWire is the wire shape returned from GET /v1/permissions; it
// embeds gact.PermissionRequest plus status fields. The store wraps this
// internally; the TUI sees this shape over the wire.
type PermissionWire struct {
	gact.PermissionRequest
	Status     string                `json:"status"`
	Action     gact.PermissionAction `json:"action,omitempty"`
	ResolvedAt time.Time             `json:"resolved_at,omitempty"`
}

func (c *Client) ListPermissions(ctx context.Context, sessionID string, onlyPending bool) ([]PermissionWire, error) {
	q := url.Values{}
	if sessionID != "" {
		q.Set("session_id", sessionID)
	}
	if onlyPending {
		q.Set("status", "pending")
	}
	var out struct {
		Permissions []PermissionWire `json:"permissions"`
	}
	err := c.do(ctx, http.MethodGet, "/v1/permissions?"+q.Encode(), nil, &out)
	return out.Permissions, err
}

func (c *Client) RespondPermission(ctx context.Context, permissionID string, action gact.PermissionAction) error {
	return c.do(ctx, http.MethodPost, "/v1/permissions/"+permissionID,
		map[string]any{"action": string(action)}, nil)
}

// --- §6.12 providers + models ----------------------------------------------

func (c *Client) ListProviders(ctx context.Context) ([]gact.Provider, error) {
	var out struct {
		Providers []gact.Provider `json:"providers"`
	}
	err := c.do(ctx, http.MethodGet, "/v1/providers", nil, &out)
	return out.Providers, err
}

// LMProviderPreset is a row in CLIO's provider picker. “RequiresAPIKey“
// tells the TUI's modal whether to render the api_key field.
type LMProviderPreset struct {
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

// LMProviderInfo is the GET /v1/providers/lm body — current LM
// config + presets to populate the picker. Backends that don't
// expose this surface (every non-CLIO backend today) return 404,
// which the TUI handles as "no in-app config available".
type LMProviderInfo struct {
	Configured     bool               `json:"configured"`
	Provider       string             `json:"provider,omitempty"`
	APIBase        string             `json:"api_base,omitempty"`
	Model          string             `json:"model,omitempty"`
	Temperature    float64            `json:"temperature,omitempty"`
	MaxTokens      int                `json:"max_tokens,omitempty"`
	ContextLength  int                `json:"context_length,omitempty"`
	ThinkingBudget int                `json:"thinking_budget,omitempty"`
	Presets        []LMProviderPreset `json:"presets,omitempty"`
}

// LMProviderRequest is the PUT /v1/providers/lm body.
//
// Temperature + MaxTokens are forwarded to the upstream LM. Sending
// 0/0 means "use server defaults" — the JSON omitempty drops the
// fields so the Python side falls back to LMProviderRequest's
// defaults (temperature=1.0, max_tokens=32000).
//
// ThinkingBudget controls reasoning effort/budget (0 = disabled). On
// Anthropic it maps to thinking.budget_tokens; on OpenAI/Codex it's
// bucketed into reasoning_effort low/medium/high.
type LMProviderRequest struct {
	Provider       string  `json:"provider"`
	APIBase        string  `json:"api_base"`
	Model          string  `json:"model"`
	APIKey         string  `json:"api_key"`
	Temperature    float64 `json:"temperature,omitempty"`
	MaxTokens      int     `json:"max_tokens,omitempty"`
	ContextLength  int     `json:"context_length,omitempty"`
	ThinkingBudget int     `json:"thinking_budget,omitempty"`
}

// GetLMProvider fetches /v1/providers/lm. Returns nil + nil error
// when the endpoint isn't supported by this backend (404) so the
// caller can decide whether to show the modal or skip it.
func (c *Client) GetLMProvider(ctx context.Context) (*LMProviderInfo, error) {
	var out LMProviderInfo
	err := c.do(ctx, http.MethodGet, "/v1/providers/lm", nil, &out)
	if err != nil {
		if strings.Contains(err.Error(), "404") || strings.Contains(err.Error(), "501") {
			return nil, nil
		}
		return nil, err
	}
	return &out, nil
}

// PutLMProvider PUTs the user's LM choice, returning the updated
// LMProviderInfo. The backend builds the LM + agent in-place;
// errors come back as the v0.2 envelope (HTTP 400 with detail).
func (c *Client) PutLMProvider(ctx context.Context, req LMProviderRequest) (*LMProviderInfo, error) {
	var out LMProviderInfo
	err := c.do(ctx, http.MethodPut, "/v1/providers/lm", req, &out)
	if err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *Client) ListProviderModels(ctx context.Context, providerID string) ([]gact.Model, error) {
	var out struct {
		Models []gact.Model `json:"models"`
	}
	err := c.do(ctx, http.MethodGet, "/v1/providers/"+providerID+"/models", nil, &out)
	return out.Models, err
}

// ProviderModelsResponse is the full /v1/providers/{id}/models body —
// includes Source ("live"/"static_catalog"/"unavailable") and a human-readable
// Error string when the backend fell back. Lets the TUI render an
// actionable banner ("token expired, run …") instead of silently
// pretending a stale catalog is the truth.
type ProviderModelsResponse struct {
	Models []gact.Model `json:"models"`
	Source string       `json:"source,omitempty"`
	Error  string       `json:"error,omitempty"`
}

// ListProviderModelsDetailed returns the full response so callers
// can surface fallback warnings. Newer call sites should prefer this
// over ListProviderModels (which discards the source/error fields
// for backward compat).
func (c *Client) ListProviderModelsDetailed(
	ctx context.Context,
	providerID string,
	apiBaseOverride string,
) (ProviderModelsResponse, error) {
	var out ProviderModelsResponse
	path := "/v1/providers/" + providerID + "/models"
	if strings.TrimSpace(apiBaseOverride) != "" {
		q := url.Values{}
		q.Set("api_base", apiBaseOverride)
		path += "?" + q.Encode()
	}
	err := c.do(ctx, http.MethodGet, path, nil, &out)
	return out, err
}

// ProviderAuthRequest is the body of POST /v1/providers/{id}/auth.
// Both fields are optional and provider-specific:
//
//   - Force re-drives the OAuth handshake even if a cached token is
//     still valid.
//   - APIKey carries a user-pasted API key for AuthMethodAPIKey
//     providers; the backend persists it on the running process.
type ProviderAuthRequest struct {
	Force  bool   `json:"force,omitempty"`
	APIKey string `json:"api_key,omitempty"`
}

// ProviderAuthResponse is what the backend returns after an auth
// attempt. RedirectURL is set when the backend wants the TUI to open
// a browser tab; Instructions is a human-readable fallback when the
// backend can only print to its own terminal.
type ProviderAuthResponse struct {
	IsAuthenticated bool   `json:"is_authenticated"`
	ProviderID      string `json:"provider_id"`
	RedirectURL     string `json:"redirect_url,omitempty"`
	Instructions    string `json:"instructions,omitempty"`
}

// AuthProvider drives POST /v1/providers/{id}/auth. The caller's
// responsibility to gate on AuthProvider.NeedsLogin() before invoking.
func (c *Client) AuthProvider(
	ctx context.Context, providerID string, req ProviderAuthRequest,
) (ProviderAuthResponse, error) {
	var out ProviderAuthResponse
	err := c.do(ctx, http.MethodPost, "/v1/providers/"+providerID+"/auth", req, &out)
	return out, err
}

// --- §6.13 commands --------------------------------------------------------

func (c *Client) ListCommands(ctx context.Context) ([]gact.Command, error) {
	var out struct {
		Commands []gact.Command `json:"commands"`
	}
	err := c.do(ctx, http.MethodGet, "/v1/commands", nil, &out)
	return out.Commands, err
}

// RunCommand triggers POST /v1/sessions/{id}/commands/{cmd_id}.
// cmdID may include a leading slash; it's URL-escaped automatically.
func (c *Client) RunCommand(ctx context.Context, sessionID, cmdID string) error {
	escaped := strings.ReplaceAll(cmdID, "/", "%2F")
	return c.do(ctx, http.MethodPost,
		"/v1/sessions/"+sessionID+"/commands/"+escaped, nil, nil)
}

// PatchSessionRequest mirrors server.UpdateSessionRequest fields the TUI
// needs (avoids importing server internals into the client).
type PatchSessionRequest struct {
	Title    *string        `json:"title,omitempty"`
	Archived *bool          `json:"archived,omitempty"`
	Agent    *gact.AgentRef `json:"agent,omitempty"`
	Model    *gact.ModelRef `json:"model,omitempty"`
	Status   *string        `json:"status,omitempty"`
	Metadata map[string]any `json:"metadata,omitempty"`
	// RoutingMode toggles the agent's routing override per session.
	// "auto" = LM-based router; "chat" = force chat path (no /chat
	// prefix needed); "experts" = reject chat/none routes.
	RoutingMode *string `json:"routing_mode,omitempty"`
}

// --- §6.9 context files ----------------------------------------------------

// ListContextFiles returns the files currently in a session's context.
func (c *Client) ListContextFiles(ctx context.Context, sessionID string) ([]gact.ContextFile, error) {
	var out struct {
		Files []gact.ContextFile `json:"files"`
	}
	err := c.do(ctx, http.MethodGet, "/v1/sessions/"+sessionID+"/context/files", nil, &out)
	return out.Files, err
}

// AddContextFile pins a file into a session's context. Mode is one of
// "edit" | "read" | "pin"; defaults server-side to "read" if blank.
func (c *Client) AddContextFile(ctx context.Context, sessionID, path, mode string) (gact.ContextFile, error) {
	var out gact.ContextFile
	body := map[string]any{"path": path, "mode": mode}
	err := c.do(ctx, http.MethodPost, "/v1/sessions/"+sessionID+"/context/files", body, &out)
	return out, err
}

// RemoveContextFile drops a file from a session's context.
func (c *Client) RemoveContextFile(ctx context.Context, sessionID, path string) error {
	body := map[string]any{"path": path}
	return c.do(ctx, http.MethodDelete, "/v1/sessions/"+sessionID+"/context/files", body, nil)
}

// ListMcpServers returns all MCP servers known to the backend. Powers
// the /mcp slash-command modal.
func (c *Client) ListMcpServers(ctx context.Context) ([]gact.McpServer, error) {
	var out struct {
		Servers []gact.McpServer `json:"servers"`
	}
	err := c.do(ctx, http.MethodGet, "/v1/mcp/servers", nil, &out)
	return out.Servers, err
}

// ListWorkspaceFiles returns the workspace-rooted file tree. The server
// returns a flat list of FileEntry (some may be type="dir"). Used by the
// M6 @-picker to let users reference files by path.
func (c *Client) ListWorkspaceFiles(ctx context.Context, workspaceID string) ([]gact.FileEntry, error) {
	var out struct {
		Entries []gact.FileEntry `json:"entries"`
	}
	err := c.do(ctx, http.MethodGet, "/v1/workspaces/"+workspaceID+"/files", nil, &out)
	return out.Entries, err
}

// GetAgent fetches one agent definition by id (full def incl.
// system_prompt and parameters) via /v1/agents/{id}. Used by
// `gact agent show` for shell scripting symmetric to `gact tool show`.
func (c *Client) GetAgent(ctx context.Context, id string) (gact.AgentDef, error) {
	var out gact.AgentDef
	err := c.do(ctx, http.MethodGet, "/v1/agents/"+id, nil, &out)
	return out, err
}

// GetTool fetches one tool by id (full definition incl. input/output
// schemas) via /v1/tools/{id}. Used by `gact tool show` to surface
// the schema for shell scripts that want to call the tool directly.
func (c *Client) GetTool(ctx context.Context, id string) (gact.Tool, error) {
	var out gact.Tool
	err := c.do(ctx, http.MethodGet, "/v1/tools/"+id, nil, &out)
	return out, err
}

// McpResourceRead POSTs /v1/mcp/servers/{id}/resources/read with
// `{uri: ...}` and returns the contents slice. Each entry has the
// URI plus either a `text` body or a base64 `data` blob.
func (c *Client) McpResourceRead(ctx context.Context, serverID, uri string) ([]gact.McpContent, error) {
	body := map[string]any{"uri": uri}
	var out struct {
		Contents []gact.McpContent `json:"contents"`
	}
	err := c.do(ctx, http.MethodPost, "/v1/mcp/servers/"+serverID+"/resources/read", body, &out)
	return out.Contents, err
}

// McpReconnect POSTs /v1/mcp/servers/{id}/reconnect — forces the
// backend to re-establish its connection to a previously-disconnected
// MCP server. Returns nil on 2xx (server may respond 204).
func (c *Client) McpReconnect(ctx context.Context, serverID string) error {
	return c.do(ctx, http.MethodPost, "/v1/mcp/servers/"+serverID+"/reconnect", nil, nil)
}

// McpInstall POSTs /v1/mcp/servers with a stdio or http transport spec.
// Body shape (stdio): {name, transport:"stdio", command, args:[...], env:{...}}
// Body shape (http):  {name, transport:"http",  url}
// Returns the installed server's ID + tools list.
func (c *Client) McpInstall(ctx context.Context, body map[string]any) (map[string]any, error) {
	var out map[string]any
	err := c.do(ctx, http.MethodPost, "/v1/mcp/servers", body, &out)
	return out, err
}

// McpUninstall DELETEs /v1/mcp/servers/{id}. Bundled in-process servers
// (mcp_fs/hdf5/parquet) cannot be removed and return 404.
func (c *Client) McpUninstall(ctx context.Context, serverID string) error {
	return c.do(ctx, http.MethodDelete, "/v1/mcp/servers/"+serverID, nil, nil)
}

// McpServerTools fetches the tools advertised by one MCP server via
// /v1/mcp/servers/{id}/tools.
func (c *Client) McpServerTools(ctx context.Context, serverID string) ([]gact.Tool, error) {
	var out struct {
		Tools []gact.Tool `json:"tools"`
	}
	err := c.do(ctx, http.MethodGet, "/v1/mcp/servers/"+serverID+"/tools", nil, &out)
	return out.Tools, err
}

// McpServerResources fetches the resources advertised by one MCP server
// via /v1/mcp/servers/{id}/resources.
func (c *Client) McpServerResources(ctx context.Context, serverID string) ([]gact.McpResource, error) {
	var out struct {
		Resources []gact.McpResource `json:"resources"`
	}
	err := c.do(ctx, http.MethodGet, "/v1/mcp/servers/"+serverID+"/resources", nil, &out)
	return out.Resources, err
}

// McpServerPrompts fetches the prompt templates advertised by one MCP
// server via /v1/mcp/servers/{id}/prompts.
func (c *Client) McpServerPrompts(ctx context.Context, serverID string) ([]gact.McpPrompt, error) {
	var out struct {
		Prompts []gact.McpPrompt `json:"prompts"`
	}
	err := c.do(ctx, http.MethodGet, "/v1/mcp/servers/"+serverID+"/prompts", nil, &out)
	return out.Prompts, err
}

// RepoMapResponse is the full response of /v1/workspaces/{id}/repo_map
// — the tree plus the backend's estimate of how many tokens
// it would cost to ship to the model as context.
type RepoMapResponse struct {
	Tree   *gact.RepoMapNode `json:"tree"`
	Tokens int               `json:"tokens"`
}

// WorkspaceRepoMap fetches the workspace's repo map — a tree of files
// and (optionally) symbol outlines per file. Used by both the @-picker
// and the CLI repo-map subcommand.
func (c *Client) WorkspaceRepoMap(ctx context.Context, workspaceID string) (RepoMapResponse, error) {
	var out RepoMapResponse
	err := c.do(ctx, http.MethodGet, "/v1/workspaces/"+workspaceID+"/repo_map", nil, &out)
	return out, err
}

// ReadWorkspaceFile fetches the raw bytes of a workspace-rooted file
// via /v1/workspaces/{id}/files/read?path=... Used for the M6 file
// preview and for shell scripts that want to pipe a file's content
// without round-tripping through the local filesystem.
func (c *Client) ReadWorkspaceFile(ctx context.Context, workspaceID, path string) ([]byte, error) {
	req, err := c.req(ctx, http.MethodGet,
		"/v1/workspaces/"+workspaceID+"/files/read?path="+url.QueryEscape(path), nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		var e gact.Error
		_ = json.NewDecoder(resp.Body).Decode(&e)
		return nil, &Error{
			Status:  resp.StatusCode,
			Code:    e.Error.Code,
			Message: e.Error.Message,
		}
	}
	return io.ReadAll(resp.Body)
}

// SessionExportBlob mirrors emulator/internal/server.SessionExport so the
// TUI can use the export/import endpoints without depending on emulator
// internals.
type SessionExportBlob struct {
	Format     string         `json:"format"`
	ExportedAt time.Time      `json:"exported_at"`
	Session    gact.Session   `json:"session"`
	Messages   []gact.Message `json:"messages"`
}

// ExportSession GET /v1/sessions/{id}/export.
func (c *Client) ExportSession(ctx context.Context, sessionID string) (SessionExportBlob, error) {
	var out SessionExportBlob
	err := c.do(ctx, http.MethodGet, "/v1/sessions/"+sessionID+"/export", nil, &out)
	return out, err
}

// ImportSession POST /v1/sessions/import. Returns the newly-created session.
func (c *Client) ImportSession(ctx context.Context, blob SessionExportBlob) (gact.Session, error) {
	var out gact.Session
	err := c.do(ctx, http.MethodPost, "/v1/sessions/import", blob, &out)
	return out, err
}

// ApplyDiffs POST /v1/sessions/{id}/diffs/apply. paths is optional —
// nil/empty means "apply all pending diffs". Returns (applied, write_errors)
// so the caller can surface per-path failures (workspace-scope refusals,
// disk-full, permission errors etc) to the user instead of silently
// dropping them.
func (c *Client) ApplyDiffs(ctx context.Context, sessionID string, paths []string) ([]string, map[string]string, error) {
	body := map[string]any{}
	if len(paths) > 0 {
		body["paths"] = paths
	}
	var out struct {
		Applied     []string          `json:"applied"`
		WriteErrors map[string]string `json:"write_errors,omitempty"`
	}
	err := c.do(ctx, http.MethodPost, "/v1/sessions/"+sessionID+"/diffs/apply", body, &out)
	return out.Applied, out.WriteErrors, err
}

// RejectDiffs POST /v1/sessions/{id}/diffs/reject.
func (c *Client) RejectDiffs(ctx context.Context, sessionID string, paths []string) ([]string, error) {
	body := map[string]any{}
	if len(paths) > 0 {
		body["paths"] = paths
	}
	var out struct {
		Rejected []string `json:"rejected"`
	}
	err := c.do(ctx, http.MethodPost, "/v1/sessions/"+sessionID+"/diffs/reject", body, &out)
	return out.Rejected, err
}

// SummarizeSession POSTs /v1/sessions/{id}/summarize. The backend
// generates (or pre-fills) a summary; the updated session struct is
// fetched on a subsequent GetSession to read it. MMM6: pass-through
// `instructions` for backends that take a custom summarizer prompt.
func (c *Client) SummarizeSession(ctx context.Context, id string, auto bool, instructions string) error {
	body := map[string]any{"auto": auto}
	if instructions != "" {
		body["instructions"] = instructions
	}
	return c.do(ctx, http.MethodPost, "/v1/sessions/"+id+"/summarize", body, nil)
}

// RewindSession POSTs /v1/sessions/{id}/rewind, deleting every
// message in the session newer than `toMessageID`. With
// `includeTarget`, also deletes the target itself. Returns the list
// of deleted message ids. (MMM7)
func (c *Client) RewindSession(ctx context.Context, sessionID, toMessageID string, includeTarget bool) ([]string, error) {
	body := map[string]any{
		"to_message_id":  toMessageID,
		"include_target": includeTarget,
	}
	var out struct {
		Deleted []string `json:"deleted_messages"`
	}
	err := c.do(ctx, http.MethodPost, "/v1/sessions/"+sessionID+"/rewind", body, &out)
	return out.Deleted, err
}

// UndoSession POSTs /v1/sessions/{id}/undo. Reverts the last `count`
// messages (default 1) and returns their ids. Mirrors the `/undo`
// slash command.
func (c *Client) UndoSession(ctx context.Context, id string, count int) ([]string, error) {
	body := map[string]any{}
	if count > 0 {
		body["count"] = count
	}
	var out struct {
		Reverted []string `json:"reverted_messages"`
	}
	err := c.do(ctx, http.MethodPost, "/v1/sessions/"+id+"/undo", body, &out)
	return out.Reverted, err
}

// PatchSession PATCH /v1/sessions/{id}. Returns the updated session.
func (c *Client) PatchSession(ctx context.Context, id string, req PatchSessionRequest) (gact.Session, error) {
	var out gact.Session
	err := c.do(ctx, http.MethodPatch, "/v1/sessions/"+id, req, &out)
	return out, err
}

// --- §6.14 voice -----------------------------------------------------------

// VoiceTranscribeResponse mirrors the server type.
type VoiceTranscribeResponse struct {
	Text       string `json:"text"`
	DurationMs int    `json:"duration_ms"`
}

// VoiceTranscribe POSTs raw audio bytes to /v1/sessions/{id}/voice/transcribe.
// mimeType examples: "audio/wav", "audio/webm", "audio/mp3". Returns the
// recognised text + claimed duration.
func (c *Client) VoiceTranscribe(ctx context.Context, sessionID string, audio []byte, mimeType string) (VoiceTranscribeResponse, error) {
	url := c.baseURL + "/v1/sessions/" + sessionID + "/voice/transcribe"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(audio))
	if err != nil {
		return VoiceTranscribeResponse{}, err
	}
	req.Header.Set("Content-Type", mimeType)
	if c.bearer != "" {
		req.Header.Set("Authorization", "Bearer "+c.bearer)
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return VoiceTranscribeResponse{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		var e gact.Error
		_ = json.NewDecoder(resp.Body).Decode(&e)
		return VoiceTranscribeResponse{}, &Error{
			Status: resp.StatusCode, Code: e.Error.Code, Message: e.Error.Message,
		}
	}
	var out VoiceTranscribeResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return VoiceTranscribeResponse{}, err
	}
	return out, nil
}

// --- §6.16 metrics ---------------------------------------------------------

func (c *Client) Metrics(ctx context.Context) (gact.Metrics, error) {
	var out gact.Metrics
	err := c.do(ctx, http.MethodGet, "/v1/metrics", nil, &out)
	return out, err
}

// --- §6.18 session tasks (MMM5) --------------------------------------------

// ListSessionTasks returns all tracked tasks for a session.
func (c *Client) ListSessionTasks(ctx context.Context, sessionID string) ([]gact.SessionTask, error) {
	var out struct {
		Tasks []gact.SessionTask `json:"tasks"`
	}
	err := c.do(ctx, http.MethodGet, "/v1/sessions/"+sessionID+"/tasks", nil, &out)
	return out.Tasks, err
}

// CreateSessionTask adds a task to a session. Server fills id, timestamps,
// and defaults status to "pending" if empty.
func (c *Client) CreateSessionTask(ctx context.Context, sessionID string, task gact.SessionTask) (gact.SessionTask, error) {
	var out gact.SessionTask
	err := c.do(ctx, http.MethodPost, "/v1/sessions/"+sessionID+"/tasks", task, &out)
	return out, err
}

// PatchTask updates title/status/metadata (PATCH semantics — empty
// fields ignored). The server bumps UpdatedAt unconditionally.
func (c *Client) PatchTask(ctx context.Context, taskID string, patch gact.SessionTask) (gact.SessionTask, error) {
	var out gact.SessionTask
	err := c.do(ctx, http.MethodPatch, "/v1/tasks/"+taskID, patch, &out)
	return out, err
}

// DeleteTask removes a task by id.
func (c *Client) DeleteTask(ctx context.Context, taskID string) error {
	return c.do(ctx, http.MethodDelete, "/v1/tasks/"+taskID, nil, nil)
}

// --- §6.11 policies (MMM4) -------------------------------------------------

// ListPolicies returns every registered permission policy.
func (c *Client) ListPolicies(ctx context.Context) ([]gact.Policy, error) {
	var out struct {
		Policies []gact.Policy `json:"policies"`
	}
	err := c.do(ctx, http.MethodGet, "/v1/policies", nil, &out)
	return out.Policies, err
}

// PutPolicies replaces the whole policy list. Returns the canonical
// list as the server stored it.
func (c *Client) PutPolicies(ctx context.Context, policies []gact.Policy) ([]gact.Policy, error) {
	body := map[string]any{"policies": policies}
	var out struct {
		Policies []gact.Policy `json:"policies"`
	}
	err := c.do(ctx, http.MethodPut, "/v1/policies", body, &out)
	return out.Policies, err
}

// --- §6.17 hooks (MMM3) ----------------------------------------------------

// ListHooks returns every registered hook.
func (c *Client) ListHooks(ctx context.Context) ([]gact.Hook, error) {
	var out struct {
		Hooks []gact.Hook `json:"hooks"`
	}
	err := c.do(ctx, http.MethodGet, "/v1/hooks", nil, &out)
	return out.Hooks, err
}

// CreateHook registers a hook. Server fills in the id; caller may
// leave Hook.ID empty.
func (c *Client) CreateHook(ctx context.Context, h gact.Hook) (gact.Hook, error) {
	var out gact.Hook
	err := c.do(ctx, http.MethodPost, "/v1/hooks", h, &out)
	return out, err
}

// DeleteHook removes a hook by id. 204 on success, 404 if missing.
func (c *Client) DeleteHook(ctx context.Context, id string) error {
	return c.do(ctx, http.MethodDelete, "/v1/hooks/"+id, nil, nil)
}
