package server

import (
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/store"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// handleMemoryStats serves GET /v1/memory/stats (SPEC §6.19, v0.2 —
// CLIO-BBBBBBBBBB3). Used by the TUI to render a cache-hit-rate
// footer, per-session context-budget pressure, and global counters.
//
// The emulator has no real memory backend, so the numbers are
// synthesised: scenario code calls BumpMemoryHit / BumpMemoryMiss to
// nudge the counters, and session/invocation totals come from the
// store. A real backend would plug in ARC-style stats instead.
func (s *Server) handleMemoryStats(w http.ResponseWriter, r *http.Request) {
	sessionID := r.URL.Query().Get("session_id")

	hits := int(atomic.LoadInt64(&s.memHits))
	misses := int(atomic.LoadInt64(&s.memMisses))
	total := hits + misses
	hitRate := 0.0
	if total > 0 {
		hitRate = float64(hits) / float64(total)
	}

	// Global counters — derived from the store.
	allSessions := s.store.ListSessions(store.SessionFilter{})
	invocationsTotal := 0
	for _, sess := range allSessions {
		invocationsTotal += sess.MessageCount
	}

	stats := gact.MemoryStats{
		Cache: gact.CacheStats{
			Hits:     hits,
			Misses:   misses,
			HitRate:  hitRate,
			Capacity: 1000,
		},
		Global: gact.GlobalMemoryStats{
			ConversationsTotal: len(allSessions),
			InvocationsTotal:   invocationsTotal,
		},
	}

	if sessionID != "" {
		if _, err := s.store.GetSession(sessionID); err == nil {
			msgs, _, _ := s.store.ListMessages(store.MessageFilter{
				SessionID: sessionID,
				Limit:     10000,
			})
			tokensRetained := 0
			for _, m := range msgs {
				tokensRetained += m.Tokens.Input + m.Tokens.Output
			}
			budget := 4000
			stats.Session = &gact.SessionMemoryStats{
				SessionID:        sessionID,
				MessagesRetained: len(msgs),
				TokensRetained:   tokensRetained,
				TokensBudget:     &budget,
				ProfilesAttached: 0,
			}
		}
	}

	writeJSON(w, http.StatusOK, stats)
}

func (s *Server) handleMemorySearch(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	query := strings.TrimSpace(q.Get("query"))
	sessionID := q.Get("session_id")
	workspaceID := q.Get("workspace_id")
	includeCross := q.Get("include_cross_session") == "true"
	limit := 20
	if raw := q.Get("limit"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			limit = parsed
		}
	}
	terms := memorySearchTerms(query)
	if len(terms) == 0 {
		writeError(w, http.StatusUnprocessableEntity, "invalid_request", "memory search requires query")
		return
	}
	if sessionID == "" && !includeCross {
		writeError(w, http.StatusUnprocessableEntity, "invalid_request", "set include_cross_session=true or pass session_id")
		return
	}
	if sessionID != "" {
		if _, err := s.store.GetSession(sessionID); err != nil {
			writeError(w, http.StatusNotFound, "not_found", "session not found: "+sessionID)
			return
		}
	}

	sessions := s.store.ListSessions(store.SessionFilter{})
	hits := make([]gact.MemorySearchHit, 0)
	searched := make([]string, 0)
	for _, sess := range sessions {
		if workspaceID != "" && sess.WorkspaceID != workspaceID {
			continue
		}
		if !includeCross && sessionID != "" && sess.ID != sessionID {
			continue
		}
		searched = append(searched, sess.ID)
		msgs, _, _ := s.store.ListMessages(store.MessageFilter{SessionID: sess.ID, Limit: 10000})
		for _, msg := range msgs {
			for _, part := range msg.Parts {
				text := strings.TrimSpace(part.Text)
				if text == "" {
					text = strings.TrimSpace(part.Summary)
				}
				matched := memoryMatchedTerms(text, terms)
				if len(matched) == 0 {
					continue
				}
				hits = append(hits, gact.MemorySearchHit{
					SessionID:    sess.ID,
					SessionTitle: sess.Title,
					WorkspaceID:  sess.WorkspaceID,
					MessageID:    msg.ID,
					PartID:       part.ID,
					Role:         string(msg.Role),
					CreatedAt:    msg.CreatedAt.Format(time.RFC3339),
					UpdatedAt:    msg.UpdatedAt.Format(time.RFC3339),
					Text:         memoryExcerpt(text, matched),
					Score:        float64(len(matched)) / float64(len(terms)),
					MatchTerms:   matched,
					Metadata: map[string]any{
						"source":        "gact_transcript",
						"cross_session": sess.ID != sessionID,
					},
				})
			}
		}
	}
	sort.SliceStable(hits, func(i, j int) bool {
		if hits[i].Score != hits[j].Score {
			return hits[i].Score > hits[j].Score
		}
		return hits[i].CreatedAt > hits[j].CreatedAt
	})
	if len(hits) > limit {
		hits = hits[:limit]
	}
	writeJSON(w, http.StatusOK, gact.MemorySearchResponse{
		Query:               query,
		IncludeCrossSession: includeCross,
		SearchedSessions:    searched,
		Hits:                hits,
		Metadata: map[string]any{
			"scope": "session",
		},
	})
}

func memorySearchTerms(query string) []string {
	fields := strings.Fields(strings.ToLower(query))
	out := make([]string, 0, len(fields))
	seen := map[string]bool{}
	for _, field := range fields {
		field = strings.Trim(field, ".,:;!?()[]{}\"'")
		if len(field) < 3 || seen[field] {
			continue
		}
		seen[field] = true
		out = append(out, field)
	}
	return out
}

func memoryMatchedTerms(text string, terms []string) []string {
	lower := strings.ToLower(text)
	out := make([]string, 0, len(terms))
	for _, term := range terms {
		if strings.Contains(lower, term) {
			out = append(out, term)
		}
	}
	return out
}

func memoryExcerpt(text string, matched []string) string {
	text = strings.Join(strings.Fields(text), " ")
	if len(text) <= 240 {
		return text
	}
	lower := strings.ToLower(text)
	idx := -1
	for _, term := range matched {
		if pos := strings.Index(lower, term); pos >= 0 {
			idx = pos
			break
		}
	}
	if idx < 0 {
		return text[:240] + "..."
	}
	start := idx - 80
	if start < 0 {
		start = 0
	}
	end := start + 240
	if end > len(text) {
		end = len(text)
		start = max(0, end-240)
	}
	prefix := ""
	if start > 0 {
		prefix = "..."
	}
	suffix := ""
	if end < len(text) {
		suffix = "..."
	}
	return prefix + text[start:end] + suffix
}

// BumpMemoryHit / BumpMemoryMiss nudge the synthetic cache counters
// so /v1/memory/stats has realistic-looking numbers without a real
// cache backend. Called from scenario code + anywhere a tool result
// could plausibly be cached.
func (s *Server) BumpMemoryHit()  { atomic.AddInt64(&s.memHits, 1) }
func (s *Server) BumpMemoryMiss() { atomic.AddInt64(&s.memMisses, 1) }
