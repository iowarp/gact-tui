package client

import (
	"context"
	"net/http"
	"net/url"
)

// ContextSegment is one attributed row inside the per-scope working set.
// The backend keeps the shape open-ended; these are the fields the UIs read.
type ContextSegment struct {
	ID     string `json:"id,omitempty"`
	Kind   string `json:"kind,omitempty"`
	Tokens int    `json:"tokens,omitempty"`
	Label  string `json:"label,omitempty"`
}

// ContextState mirrors the vendor GET /v1/sessions/{id}/context/state and the
// POST .../context/compact response (SPEC §6.9, gated by
// capabilities.x_clio_context_state). Nullable backend fields are pointers so
// callers can tell "absent/between-turns" from a real zero.
//
//   - LiveTokens is the segment-store attribution sum (always present).
//   - UsedTokens is the REAL prompt-token count from the last LM call, nil
//     between turns; prefer UsedPct over PctUsed for fullness when present.
//   - AutocompactPct is the auto-compaction trigger fraction in (0,1].
//   - Categories are the /context-style buckets, including the synthetic
//     "framing" key (= used_tokens - live_tokens) when used_tokens > 0.
type ContextState struct {
	SessionID      string           `json:"session_id"`
	Scope          string           `json:"scope"`
	AsOf           *int64           `json:"as_of"`
	WindowTokens   int              `json:"window_tokens"`
	LiveTokens     int              `json:"live_tokens"`
	PctUsed        *float64         `json:"pct_used"`
	UsedTokens     *int             `json:"used_tokens"`
	UsedPct        *float64         `json:"used_pct"`
	AutocompactPct *float64         `json:"autocompact_pct"`
	LiveBlockCount int              `json:"live_block_count"`
	TokensByKind   map[string]int   `json:"tokens_by_kind"`
	Categories     map[string]int   `json:"categories"`
	Segments       []ContextSegment `json:"segments"`
	RenderText     string           `json:"render_text"`
	RenderKeys     map[string]any   `json:"render_keys"`
}

// GetContextState issues GET /v1/sessions/{id}/context/state[?scope=<expert>].
// scope names the per-expert lane; pass "" for the session default. Backends
// without capabilities.x_clio_context_state return 501 — gate on that flag.
func (c *Client) GetContextState(ctx context.Context, sessionID, scope string) (ContextState, error) {
	return c.GetContextStateScoped(ctx, RuntimeScope{SessionID: sessionID, Scope: scope})
}

// GetContextStateScoped is the RuntimeScope-aware variant; the per-expert lane
// comes from scope.Scope and the workspace (if any) from scope.WorkspaceID.
func (c *Client) GetContextStateScoped(ctx context.Context, scope RuntimeScope) (ContextState, error) {
	var out ContextState
	path := "/v1/sessions/" + url.PathEscape(scope.SessionID) + "/context/state"
	path += queryString(contextScopeQuery(scope))
	err := c.do(ctx, http.MethodGet, path, nil, &out)
	return out, err
}

// CompactContext issues POST /v1/sessions/{id}/context/compact[?scope=<expert>]
// and returns the post-compaction ContextState. The typed error envelopes
// (409 nothing_to_compact / 503 compaction_unavailable / 404 session_not_found)
// surface through the standard *Error with Code set to that token.
func (c *Client) CompactContext(ctx context.Context, sessionID, scope string) (ContextState, error) {
	return c.CompactContextScoped(ctx, RuntimeScope{SessionID: sessionID, Scope: scope})
}

// CompactContextScoped is the RuntimeScope-aware variant of CompactContext.
func (c *Client) CompactContextScoped(ctx context.Context, scope RuntimeScope) (ContextState, error) {
	var out ContextState
	path := "/v1/sessions/" + url.PathEscape(scope.SessionID) + "/context/compact"
	path += queryString(contextScopeQuery(scope))
	err := c.do(ctx, http.MethodPost, path, struct{}{}, &out)
	return out, err
}

// contextScopeQuery builds the query for the context/state + context/compact
// routes: the per-expert lane rides `scope` (NOT `session_id`, which is already
// in the path), plus the optional workspace id.
func contextScopeQuery(scope RuntimeScope) url.Values {
	q := url.Values{}
	if scope.Scope != "" {
		q.Set("scope", scope.Scope)
	}
	if scope.WorkspaceID != "" {
		q.Set("workspace_id", scope.WorkspaceID)
	}
	return q
}
