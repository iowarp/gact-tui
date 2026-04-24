package server

import (
	"net/http"
	"sync/atomic"

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

// BumpMemoryHit / BumpMemoryMiss nudge the synthetic cache counters
// so /v1/memory/stats has realistic-looking numbers without a real
// cache backend. Called from scenario code + anywhere a tool result
// could plausibly be cached.
func (s *Server) BumpMemoryHit()  { atomic.AddInt64(&s.memHits, 1) }
func (s *Server) BumpMemoryMiss() { atomic.AddInt64(&s.memMisses, 1) }
