package claudecode

import (
	"net/http"
	"time"
)

func (s *Server) handleMetrics(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	sessionsCopy := make([]*sessionState, 0, len(s.sessions))
	for _, sess := range s.sessions {
		sessionsCopy = append(sessionsCopy, sess)
	}
	s.mu.Unlock()

	byStatus := map[string]int{
		"idle": 0, "running": 0, "waiting_permission": 0, "error": 0,
	}
	byRole := map[string]int{"user": 0, "assistant": 0, "system": 0, "tool": 0}
	var inputTot, outputTot, cacheReadTot, cacheWriteTot int64
	var msgTotal, active int
	for _, sess := range sessionsCopy {
		sess.mu.Lock()
		st := sess.status
		msgs := append([]map[string]any{}, sess.cachedMessages...)
		sess.mu.Unlock()
		if _, ok := byStatus[st]; ok {
			byStatus[st]++
		}
		if st == "running" || st == "waiting_permission" {
			active++
		}
		for _, m := range msgs {
			msgTotal++
			if role, _ := m["role"].(string); byRole[role] >= 0 {
				byRole[role]++
			}
			usage, _ := m["usage"].(map[string]any)
			inputTot += int64Of(usage["input_tokens"])
			outputTot += int64Of(usage["output_tokens"])
			cacheReadTot += int64Of(usage["cache_read_input_tokens"])
			cacheWriteTot += int64Of(usage["cache_creation_input_tokens"])
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"uptime_s": int(time.Since(s.started).Seconds()),
		"sessions": map[string]any{
			"total":     len(sessionsCopy),
			"active":    active,
			"by_status": byStatus,
		},
		"messages": map[string]any{
			"total":   msgTotal,
			"by_role": byRole,
		},
		"tokens": map[string]any{
			"input_total":       inputTot,
			"output_total":      outputTot,
			"cache_read_total":  cacheReadTot,
			"cache_write_total": cacheWriteTot,
		},
	})
}

// handleExportSession serialises a session as a SPEC §6.2 export

func int64Of(v any) int64 {
	switch x := v.(type) {
	case float64:
		return int64(x)
	case int:
		return int64(x)
	case int64:
		return x
	}
	return 0
}
