package ui

// memoryComponent: the memory-stats inspector and footer-chip handler (state lives on sessionComponent).

import (
	"context"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
)

// memoryStatsMsg carries a fresh /v1/memory/stats
// snapshot. Fired after connect + after every session.status_changed
// -> idle event for backends with capabilities.memory = true.
type memoryStatsMsg struct {
	stats gact.MemoryStats
}

// memoryComponent owns the memory-stats domain: it caches the latest
// /v1/memory/stats snapshot (handler below) that the footer chip renders. State
// itself lives on sessionComponent (memoryStats); the component reaches it via
// its app back-reference.
type memoryComponent struct {
	app *App
}

func (mc *memoryComponent) handleStats(m memoryStatsMsg) (tea.Model, tea.Cmd) {
	// Cache the latest snapshot; the footer's render path reads this
	// each frame.
	mc.app.session.setMemoryStats(m.stats)
	return mc.app, nil
}

func memoryStatsScopedCmd(c *client.Client, scope client.RuntimeScope) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		stats, err := c.MemoryStatsScoped(ctx, scope)
		if err != nil {
			return errMsg{err: err, stage: "memory_stats"}
		}
		return memoryStatsMsg{stats: stats}
	}
}

func loadMemoryInspectorCmd(theme Theme, c *client.Client, scope client.RuntimeScope, messages []gact.Message) tea.Cmd {
	sessionMessages := append([]gact.Message(nil), messages...)
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		stats, err := c.MemoryStatsScoped(ctx, scope)
		if err != nil {
			return catalogDetailLoadedMsg{title: "Memory", err: err, standalone: true}
		}
		var search *gact.MemorySearchResponse
		if query := memoryInspectorSearchQuery(sessionMessages); query != "" && scope.SessionID != "" {
			if resp, searchErr := c.MemorySearch(ctx, client.MemorySearchRequest{
				Query: query, SessionID: scope.SessionID, WorkspaceID: scope.WorkspaceID, Limit: 5,
			}); searchErr == nil {
				search = &resp
			}
		}
		var frames []map[string]any
		if scope.SessionID != "" {
			if resp, frameErr := c.ListContextFramesScoped(ctx, scope, 5); frameErr == nil {
				frames = resp.Frames
				if latestID := latestContextFrameID(frames); latestID != "" {
					if frame, detailErr := c.GetContextFrameScoped(ctx, scope, latestID); detailErr == nil && len(frame) > 0 {
						frames = append(frames[:len(frames)-1], frame)
					} else if detailErr != nil {
						frames = append(frames, map[string]any{
							"id":     latestID,
							"status": "detail_error",
							"metadata": map[string]any{
								"detail_error": detailErr.Error(),
							},
						})
					}
				}
			}
		}
		var toolEvidence *memoryToolEvidence
		if scope.SessionID != "" {
			toolEvidence = loadMemoryToolEvidence(ctx, c, scope, sessionMessages, frames)
		}
		// Best-effort per-expert context state for the segmented bar. A 501
		// (backend doesn't support it) or any error just omits the bar; the
		// rest of the inspector still renders.
		var contextState *client.ContextState
		if scope.SessionID != "" {
			if cs, csErr := c.GetContextStateScoped(ctx, scope); csErr == nil {
				contextState = &cs
			}
		}
		return catalogDetailLoadedMsg{
			title:      "Memory · context",
			text:       formatMemoryInspectorFull(theme, stats, sessionMessages, search, frames, toolEvidence, contextState),
			standalone: true,
		}
	}
}

func latestContextFrameID(frames []map[string]any) string {
	if len(frames) == 0 {
		return ""
	}
	return valuefmt.StringValue(frames[len(frames)-1]["id"])
}

type memoryToolEvidence struct {
	search  *gact.MemoryToolSearchSessionsResponse
	summary *gact.MemoryToolReadSessionSummaryResponse
	frame   *gact.MemoryToolReadContextFrameResponse
	errors  []string
}

func loadMemoryToolEvidence(ctx context.Context, c *client.Client, scope client.RuntimeScope, messages []gact.Message, frames []map[string]any) *memoryToolEvidence {
	out := &memoryToolEvidence{}
	caller := gact.MemoryToolCaller{"type": "tui", "surface": "memory_inspector"}
	if query := memoryInspectorSearchQuery(messages); query != "" {
		if resp, err := c.MemoryToolSearchSessions(ctx, scope.SessionID, gact.MemoryToolSearchSessionsRequest{
			Query:  query,
			Scope:  "session",
			Limit:  5,
			Caller: caller,
		}); err != nil {
			out.errors = append(out.errors, "search-sessions: "+err.Error())
		} else {
			out.search = &resp
		}
	}
	if resp, err := c.MemoryToolReadSessionSummary(ctx, scope.SessionID, gact.MemoryToolReadSessionSummaryRequest{
		Scope:  "session",
		Caller: caller,
	}); err != nil {
		out.errors = append(out.errors, "read-session-summary: "+err.Error())
	} else {
		out.summary = &resp
	}
	if len(frames) > 0 {
		frameID := valuefmt.StringValue(frames[len(frames)-1]["id"])
		if frameID != "" {
			if resp, err := c.MemoryToolReadContextFrame(ctx, scope.SessionID, gact.MemoryToolReadContextFrameRequest{
				FrameID: frameID,
				Scope:   "session",
				Caller:  caller,
			}); err != nil {
				out.errors = append(out.errors, "read-context-frame: "+err.Error())
			} else {
				out.frame = &resp
			}
		}
	}
	if out.search == nil && out.summary == nil && out.frame == nil && len(out.errors) == 0 {
		return nil
	}
	return out
}
