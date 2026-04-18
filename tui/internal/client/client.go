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
		return &Error{
			Status:  resp.StatusCode,
			Code:    e.Error.Code,
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
	MessageID string `json:"message_id"`
	PartID    string `json:"part_id"`
	Snippet   string `json:"snippet"`
	Score     float64 `json:"score"`
}

// SearchMessages issues GET /v1/sessions/{id}/messages/search?q=...
// and returns the matches in score order. Empty query returns no
// matches — callers should validate that before dispatching.
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
	Status     string                 `json:"status"`
	Action     gact.PermissionAction  `json:"action,omitempty"`
	ResolvedAt time.Time              `json:"resolved_at,omitempty"`
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

func (c *Client) ListProviderModels(ctx context.Context, providerID string) ([]gact.Model, error) {
	var out struct {
		Models []gact.Model `json:"models"`
	}
	err := c.do(ctx, http.MethodGet, "/v1/providers/"+providerID+"/models", nil, &out)
	return out.Models, err
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
	Title    *string         `json:"title,omitempty"`
	Archived *bool           `json:"archived,omitempty"`
	Agent    *gact.AgentRef  `json:"agent,omitempty"`
	Model    *gact.ModelRef  `json:"model,omitempty"`
	Status   *string         `json:"status,omitempty"`
	Metadata map[string]any  `json:"metadata,omitempty"`
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
// nil/empty means "apply all pending diffs".
func (c *Client) ApplyDiffs(ctx context.Context, sessionID string, paths []string) ([]string, error) {
	body := map[string]any{}
	if len(paths) > 0 {
		body["paths"] = paths
	}
	var out struct {
		Applied []string `json:"applied"`
	}
	err := c.do(ctx, http.MethodPost, "/v1/sessions/"+sessionID+"/diffs/apply", body, &out)
	return out.Applied, err
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
