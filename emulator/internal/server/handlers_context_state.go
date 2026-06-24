package server

import (
	"net/http"
	"sync"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/store"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// contextStateStore tracks per-(session,scope) compaction so a compact call has
// a visible effect on the next state read (the live working set collapses into
// one summary segment). Keyed by session+scope.
type contextStateStore struct {
	mu        sync.Mutex
	compacted map[string]bool
}

func newContextStateStore() *contextStateStore {
	return &contextStateStore{compacted: map[string]bool{}}
}

func (c *contextStateStore) key(session, scope string) string { return session + "::" + scope }

func (c *contextStateStore) isCompacted(session, scope string) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.compacted[c.key(session, scope)]
}

func (c *contextStateStore) markCompacted(session, scope string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.compacted[c.key(session, scope)] = true
}

// handleContextState serves GET /v1/sessions/{id}/context/state?scope=<expert>.
// It derives a per-scope ContextStateResponse from the session transcript:
// categorising message/tool tokens into the /context-style buckets, projecting a
// model window, and marking the auto-compaction fraction.
func (s *Server) handleContextState(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	scope := r.URL.Query().Get("scope")
	state, ok := s.buildContextState(w, id, scope)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, state)
}

// handleContextCompact serves POST /v1/sessions/{id}/context/compact. It
// summarises the live working set into a single summary segment and returns the
// post-compaction state. Errors mirror the contract: 409 nothing_to_compact when
// there is no live working set, 404 when the session is unknown.
func (s *Server) handleContextCompact(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	scope := r.URL.Query().Get("scope")
	pre, ok := s.buildContextState(w, id, scope)
	if !ok {
		return
	}
	if liveBlockCount(pre) == 0 {
		writeError(w, http.StatusConflict, "nothing_to_compact", "no live segments to compact")
		return
	}
	s.contextState.markCompacted(id, scope)
	post, ok := s.buildContextState(w, id, scope)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, post)
}

func liveBlockCount(state map[string]any) int {
	if n, ok := state["live_block_count"].(int); ok {
		return n
	}
	return 0
}

// buildContextState derives the ContextStateResponse map for a session+scope. It
// returns ok=false (after writing an error) when the session is unknown.
func (s *Server) buildContextState(w http.ResponseWriter, id, scope string) (map[string]any, bool) {
	if _, err := s.store.GetSession(id); err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return nil, false
	}
	msgs, _, err := s.store.ListMessages(store.MessageFilter{SessionID: id, Limit: 200, IncludeSystem: true})
	if err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return nil, false
	}

	compacted := s.contextState.isCompacted(id, scope)
	categories, segments, liveBlocks := categorizeTranscript(msgs, compacted)
	live := 0
	for _, v := range categories {
		live += v
	}
	window := 200000
	// Real prompt tokens from the last LM call: model framing on top of the
	// attributed working set. Adds the synthetic "framing" bucket.
	used := live + 1800
	framing := used - live
	if framing > 0 && used > 0 {
		categories["framing"] = framing
	}
	pctUsed := float64(live) / float64(window)
	usedPct := float64(used) / float64(window)
	autocompact := 0.85

	state := map[string]any{
		"session_id":       id,
		"scope":            scope,
		"as_of":            nil,
		"window_tokens":    window,
		"live_tokens":      live,
		"pct_used":         pctUsed,
		"used_tokens":      used,
		"used_pct":         usedPct,
		"autocompact_pct":  autocompact,
		"live_block_count": liveBlocks,
		"tokens_by_kind":   tokensByKindFromSegments(segments),
		"categories":       categories,
		"segments":         segments,
		"render_text":      "",
		"render_keys":      map[string]any{},
	}
	return state, true
}

// contextSegment mirrors the contract segment shape the TUI client decodes.
type contextSegment struct {
	ID     string `json:"id,omitempty"`
	Kind   string `json:"kind,omitempty"`
	Tokens int    `json:"tokens,omitempty"`
	Label  string `json:"label,omitempty"`
}

// categorizeTranscript buckets transcript tokens into /context-style categories
// and builds the per-segment list. When compacted, the message/tool working set
// collapses into a single "summary" segment, mirroring a real compaction.
func categorizeTranscript(msgs []gact.Message, compacted bool) (map[string]int, []contextSegment, int) {
	categories := map[string]int{}
	var segments []contextSegment
	liveBlocks := 0

	add := func(category, kind, label string, tokens int) {
		if tokens <= 0 {
			return
		}
		categories[category] += tokens
		segments = append(segments, contextSegment{ID: label, Kind: kind, Tokens: tokens, Label: label})
		liveBlocks++
	}

	if compacted {
		summaryTokens := 0
		for _, msg := range msgs {
			summaryTokens += estimateMessageTokens(msg)
		}
		summaryTokens = max(1, summaryTokens/4) // compaction shrinks the working set
		add("system", "system", "system_prompt", 1200)
		add("summary", "summary", "compaction_summary", summaryTokens)
		return categories, segments, liveBlocks
	}

	add("system", "system", "system_prompt", 1200)
	for _, msg := range msgs {
		tokens := estimateMessageTokens(msg)
		switch msg.Role {
		case gact.RoleAssistant:
			add("messages", "assistant_message", "assistant:"+msg.ID, tokens)
			for _, part := range msg.Parts {
				switch part.Type {
				case gact.PartTypeToolCall:
					add("tool_calls", "tool_call", "tool_call:"+msg.ID, max(1, len(part.Text)/4+40))
				case gact.PartTypeThinking, gact.PartTypeRedactedThinking:
					add("reasoning", "reasoning", "reasoning:"+msg.ID, max(1, len(part.Text)/4))
				}
			}
		case gact.RoleTool:
			add("tools", "tool_result", "tool_result:"+msg.ID, tokens)
			add("observations", "observation", "observation:"+msg.ID, max(1, tokens/3))
		default:
			add("messages", "user_message", "user:"+msg.ID, tokens)
		}
	}
	return categories, segments, liveBlocks
}

func estimateMessageTokens(msg gact.Message) int {
	chars := 0
	for _, part := range msg.Parts {
		chars += len(part.Text) + len(part.Summary)
	}
	return max(20, chars/4)
}

func tokensByKindFromSegments(segments []contextSegment) map[string]int {
	out := map[string]int{}
	for _, seg := range segments {
		if seg.Kind == "" {
			continue
		}
		out[seg.Kind] += seg.Tokens
	}
	return out
}
