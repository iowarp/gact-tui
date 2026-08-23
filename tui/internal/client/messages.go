package client

import (
	"context"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

// PostMessageRequest mirrors the server type.
type PostMessageRequest struct {
	Parts []gact.Part    `json:"parts"`
	Model *gact.ModelRef `json:"model,omitempty"`
	// AgentID is CLIO's one-turn agent override. It must not mutate the
	// session default agent; the backend records requested/effective agent
	// provenance on the resulting turn.
	AgentID string `json:"agent_id,omitempty"`
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

type ContextFramesResponse struct {
	Frames []map[string]any `json:"frames"`
}

func (c *Client) ListContextFrames(ctx context.Context, sessionID string, limit int) (ContextFramesResponse, error) {
	return c.ListContextFramesScoped(ctx, RuntimeScope{SessionID: sessionID}, limit)
}

func (c *Client) ListContextFramesScoped(ctx context.Context, scope RuntimeScope, limit int) (ContextFramesResponse, error) {
	var out ContextFramesResponse
	path := "/v1/sessions/" + url.PathEscape(scope.SessionID) + "/context/frames"
	q := url.Values{}
	if limit > 0 {
		q.Set("limit", strconv.Itoa(limit))
	}
	if scope.WorkspaceID != "" {
		q.Set("workspace_id", scope.WorkspaceID)
	}
	path += queryString(q)
	err := c.do(ctx, http.MethodGet, path, nil, &out)
	return out, err
}

func (c *Client) GetContextFrame(ctx context.Context, sessionID, frameID string) (map[string]any, error) {
	return c.GetContextFrameScoped(ctx, RuntimeScope{SessionID: sessionID}, frameID)
}

func (c *Client) GetContextFrameScoped(ctx context.Context, scope RuntimeScope, frameID string) (map[string]any, error) {
	var out struct {
		Frame map[string]any `json:"frame"`
	}
	path := "/v1/sessions/" + url.PathEscape(scope.SessionID) + "/context/frames/" + url.PathEscape(frameID)
	q := url.Values{}
	if scope.WorkspaceID != "" {
		q.Set("workspace_id", scope.WorkspaceID)
	}
	err := c.do(ctx, http.MethodGet, path+queryString(q), nil, &out)
	return out.Frame, err
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
