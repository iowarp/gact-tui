package server

import (
	"net/http"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/store"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// --- §6.16 Metrics ---------------------------------------------------------

func (s *Server) handleMetrics(w http.ResponseWriter, r *http.Request) {
	sessions := s.store.ListSessions(store.SessionFilter{IncludeArchived: true})
	byStatus := map[string]int{}
	active := 0
	totalMsg := 0
	byRole := map[string]int{
		gact.RoleUser:      0,
		gact.RoleAssistant: 0,
		gact.RoleTool:      0,
		gact.RoleSystem:    0,
	}
	tokens := gact.MetricsTokens{}
	costByProvider := map[string]float64{}
	totalCost := 0.0

	for _, sess := range sessions {
		byStatus[sess.Status]++
		if sess.Status != gact.StatusIdle {
			active++
		}
		totalMsg += sess.MessageCount
		tokens.InputTotal += sess.Tokens.Input
		tokens.OutputTotal += sess.Tokens.Output
		tokens.CacheReadTotal += sess.Tokens.CacheRead
		tokens.CacheWriteTotal += sess.Tokens.CacheWrite
		totalCost += sess.CostUSD
		if sess.Model.ProviderID != "" {
			costByProvider[sess.Model.ProviderID] += sess.CostUSD
		}
	}

	// Walk per-session messages to fill byRole counts cheaply.
	for _, sess := range sessions {
		msgs, _, _ := s.store.ListMessages(store.MessageFilter{
			SessionID: sess.ID, Limit: 100000, IncludeSystem: true,
		})
		for _, m := range msgs {
			byRole[m.Role]++
		}
	}

	latencies := map[string]gact.MetricsLatencyStat{}
	for pat, st := range s.latency.Snapshot() {
		latencies[pat] = gact.MetricsLatencyStat{
			Count: st.Count, P50Ms: st.P50Ms, P95Ms: st.P95Ms, MaxMs: st.MaxMs,
		}
	}

	writeJSON(w, http.StatusOK, gact.Metrics{
		UptimeS: int(time.Since(s.started).Seconds()),
		Sessions: gact.MetricsSessions{
			Total: len(sessions), Active: active, ByStatus: byStatus,
		},
		Messages:  gact.MetricsMessages{Total: totalMsg, ByRole: byRole},
		Tokens:    tokens,
		Cost:      gact.MetricsCost{TotalUSD: totalCost, ByProvider: costByProvider},
		Latencies: latencies,
	})
}
