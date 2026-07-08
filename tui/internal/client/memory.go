package client

import (
	"context"
	"net/http"
	"net/url"
	"strconv"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// MemoryStats calls GET /v1/memory/stats (v0.2 §6.19).
// sessionID is optional; pass "" for global-only stats. Backends without
// capabilities.memory return 501 — the caller should gate on that flag.
func (c *Client) MemoryStats(ctx context.Context, sessionID string) (gact.MemoryStats, error) {
	return c.MemoryStatsScoped(ctx, RuntimeScope{SessionID: sessionID})
}

func (c *Client) MemoryStatsScoped(ctx context.Context, scope RuntimeScope) (gact.MemoryStats, error) {
	path := "/v1/memory/stats"
	q := url.Values{}
	scope.appendTo(q)
	path += queryString(q)
	var out gact.MemoryStats
	err := c.do(ctx, http.MethodGet, path, nil, &out)
	return out, err
}

type MemorySearchRequest struct {
	Query               string
	SessionID           string
	WorkspaceID         string
	IncludeCrossSession bool
	Limit               int
}

func (c *Client) MemorySearch(ctx context.Context, req MemorySearchRequest) (gact.MemorySearchResponse, error) {
	q := url.Values{}
	q.Set("query", req.Query)
	if req.SessionID != "" {
		q.Set("session_id", req.SessionID)
	}
	if req.WorkspaceID != "" {
		q.Set("workspace_id", req.WorkspaceID)
	}
	if req.IncludeCrossSession {
		q.Set("include_cross_session", "true")
	}
	if req.Limit > 0 {
		q.Set("limit", strconv.Itoa(req.Limit))
	}
	var out gact.MemorySearchResponse
	err := c.do(ctx, http.MethodGet, "/v1/memory/search?"+q.Encode(), nil, &out)
	return out, err
}

func (c *Client) MemoryToolSearchSessions(ctx context.Context, sessionID string, req gact.MemoryToolSearchSessionsRequest) (gact.MemoryToolSearchSessionsResponse, error) {
	var out gact.MemoryToolSearchSessionsResponse
	err := c.do(ctx, http.MethodPost, "/v1/sessions/"+url.PathEscape(sessionID)+"/memory/tools/search-sessions", req, &out)
	return out, err
}

func (c *Client) MemoryToolReadSessionSummary(ctx context.Context, sessionID string, req gact.MemoryToolReadSessionSummaryRequest) (gact.MemoryToolReadSessionSummaryResponse, error) {
	var out gact.MemoryToolReadSessionSummaryResponse
	err := c.do(ctx, http.MethodPost, "/v1/sessions/"+url.PathEscape(sessionID)+"/memory/tools/read-session-summary", req, &out)
	return out, err
}

func (c *Client) MemoryToolReadContextFrame(ctx context.Context, sessionID string, req gact.MemoryToolReadContextFrameRequest) (gact.MemoryToolReadContextFrameResponse, error) {
	var out gact.MemoryToolReadContextFrameResponse
	err := c.do(ctx, http.MethodPost, "/v1/sessions/"+url.PathEscape(sessionID)+"/memory/tools/read-context-frame", req, &out)
	return out, err
}
