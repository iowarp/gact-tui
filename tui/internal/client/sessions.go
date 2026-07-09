package client

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

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

// PatchSession PATCH /v1/sessions/{id}. Returns the updated session.
func (c *Client) PatchSession(ctx context.Context, id string, req PatchSessionRequest) (gact.Session, error) {
	var out gact.Session
	err := c.do(ctx, http.MethodPatch, "/v1/sessions/"+url.PathEscape(id), req, &out)
	return out, err
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

// CompactFallbackLegacySummarize is the structured degradation reason
// reported when the backend does not serve POST /v1/sessions/{id}/compact
// and the client fell back to the legacy /summarize route (the emulator
// and pre-/compact backends). Mirrors clio's stream_fallback reason
// catalog style: every degraded path carries a machine-readable reason.
const CompactFallbackLegacySummarize = "compact_route_missing_legacy_summarize"

// CompactSession POSTs /v1/sessions/{id}/compact with an optional
// `focus` instruction — the contract CLIO actually serves
// (clio gact/routes/sessions.py; the /summarize route never existed
// there, see iowarp/gact-tui#224). Backends that predate /compact
// (including the emulator) still serve the legacy
// POST /v1/sessions/{id}/summarize; on a 404 from /compact the client
// retries that route once, mapping focus into its legacy `instructions`
// key, and reports the degradation via the returned fallback reason so
// callers can surface it (never silently). When the backend supports
// neither route, the returned error carries both failures.
func (c *Client) CompactSession(ctx context.Context, id string, focus string) (string, error) {
	body := map[string]any{}
	if focus != "" {
		body["focus"] = focus
	}
	base := "/v1/sessions/" + url.PathEscape(id)
	err := c.do(ctx, http.MethodPost, base+"/compact", body, nil)
	if err == nil {
		return "", nil
	}
	var gerr *Error
	if !errors.As(err, &gerr) || gerr.Status != http.StatusNotFound {
		return "", err
	}
	legacy := map[string]any{"auto": true}
	if focus != "" {
		legacy["instructions"] = focus
	}
	if legacyErr := c.do(ctx, http.MethodPost, base+"/summarize", legacy, nil); legacyErr != nil {
		return "", fmt.Errorf("compact: %w (legacy /summarize fallback also failed: %v)", err, legacyErr)
	}
	return CompactFallbackLegacySummarize, nil
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
