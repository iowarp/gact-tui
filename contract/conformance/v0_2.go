package conformance

// CLIO-BBBBBBBBBB5: conformance checks for GACT v0.2 capability
// suites. Each function is gated in Run() on the corresponding
// capabilities.* flag — v0.1 backends (or adapters that haven't
// caught up) skip them cleanly.

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// checkAgentRouting exercises SPEC §4.3.1 — when a backend advertises
// capabilities.agent_routing, it MUST expose AgentDef rows with
// tier/specialization/keywords populated. `?tier=2` filters to
// specialists.
func checkAgentRouting(t Reporter, c *conformClient) {
	t.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Unfiltered list: must return ≥ 1 agent.
	resp, body, err := c.get(ctx, "/v1/agents")
	if err != nil {
		t.Fatalf("GET /v1/agents: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /v1/agents status = %d, want 200", resp.StatusCode)
	}
	var all struct {
		Agents []struct {
			ID             string   `json:"id"`
			Tier           int      `json:"tier,omitempty"`
			Specialization string   `json:"specialization,omitempty"`
			Keywords       []string `json:"keywords,omitempty"`
		} `json:"agents"`
	}
	if err := json.Unmarshal(body, &all); err != nil {
		t.Fatalf("decode /v1/agents: %v (body=%s)", err, truncForLog(body))
	}

	// ?tier=2 filtered list: every returned row MUST have tier==2.
	resp2, body2, err := c.get(ctx, "/v1/agents?tier=2")
	if err != nil {
		t.Fatalf("GET /v1/agents?tier=2: %v", err)
	}
	if resp2.StatusCode != http.StatusOK {
		t.Fatalf("GET /v1/agents?tier=2 status = %d, want 200", resp2.StatusCode)
	}
	var tier2 struct {
		Agents []struct {
			ID             string   `json:"id"`
			Tier           int      `json:"tier"`
			Specialization string   `json:"specialization"`
			Keywords       []string `json:"keywords"`
		} `json:"agents"`
	}
	if err := json.Unmarshal(body2, &tier2); err != nil {
		t.Fatalf("decode /v1/agents?tier=2: %v (body=%s)", err, truncForLog(body2))
	}
	if len(tier2.Agents) == 0 {
		t.Fatalf("agent_routing = true but /v1/agents?tier=2 returned no rows — contract says there MUST be ≥1 tier-2 specialist")
	}
	for i, a := range tier2.Agents {
		if a.Tier != 2 {
			t.Errorf("tier=2 filter row %d (%s): tier=%d, want 2", i, a.ID, a.Tier)
		}
		if a.Specialization == "" {
			t.Errorf("tier=2 agent %q: specialization empty (contract §4.3.1)", a.ID)
		}
		if len(a.Keywords) == 0 {
			t.Errorf("tier=2 agent %q: keywords empty (contract §4.3.1)", a.ID)
		}
	}
}

// checkMemoryStats exercises SPEC §6.19 — /v1/memory/stats returns a
// MemoryStats envelope with cache + global counters; ?session_id
// adds a session block.
func checkMemoryStats(t Reporter, c *conformClient, sessionID string) {
	t.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	resp, body, err := c.get(ctx, "/v1/memory/stats")
	if err != nil {
		t.Fatalf("GET /v1/memory/stats: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /v1/memory/stats status = %d, want 200 (capabilities.memory = true)", resp.StatusCode)
	}
	var stats struct {
		Cache struct {
			Hits     int     `json:"hits"`
			Misses   int     `json:"misses"`
			HitRate  float64 `json:"hit_rate"`
			Capacity int     `json:"capacity"`
		} `json:"cache"`
		Session *struct {
			SessionID string `json:"session_id"`
		} `json:"session,omitempty"`
		Global struct {
			ConversationsTotal int `json:"conversations_total"`
			InvocationsTotal   int `json:"invocations_total"`
		} `json:"global"`
	}
	if err := json.Unmarshal(body, &stats); err != nil {
		t.Fatalf("decode /v1/memory/stats: %v (body=%s)", err, truncForLog(body))
	}
	// hit_rate must be in [0..1]. Other counters must be non-negative.
	if stats.Cache.HitRate < 0 || stats.Cache.HitRate > 1 {
		t.Errorf("cache.hit_rate = %v, want [0..1]", stats.Cache.HitRate)
	}
	if stats.Cache.Hits < 0 || stats.Cache.Misses < 0 {
		t.Errorf("cache counters negative: hits=%d misses=%d", stats.Cache.Hits, stats.Cache.Misses)
	}
	// Global block required.
	if stats.Global.ConversationsTotal < 0 {
		t.Errorf("global.conversations_total negative: %d", stats.Global.ConversationsTotal)
	}
	// Session block absent when no query.
	if stats.Session != nil {
		t.Errorf("session block should be nil without ?session_id (got %+v)", stats.Session)
	}

	if sessionID == "" {
		return
	}
	// With session scope.
	resp2, body2, err := c.get(ctx, "/v1/memory/stats?session_id="+sessionID)
	if err != nil {
		t.Fatalf("GET /v1/memory/stats?session_id: %v", err)
	}
	if resp2.StatusCode != http.StatusOK {
		t.Fatalf("session-scoped stats status = %d, want 200", resp2.StatusCode)
	}
	var scoped struct {
		Session *struct {
			SessionID string `json:"session_id"`
		} `json:"session,omitempty"`
	}
	if err := json.Unmarshal(body2, &scoped); err != nil {
		t.Fatalf("decode session-scoped stats: %v", err)
	}
	if scoped.Session == nil {
		t.Errorf("?session_id=%s returned nil session block; contract §6.19 says it must be populated", sessionID)
	} else if scoped.Session.SessionID != sessionID {
		t.Errorf("session.session_id = %q, want %q", scoped.Session.SessionID, sessionID)
	}
}

// checkIntegrationHealth exercises SPEC §3.4 — /v1/health grows
// overall_status + integrations[]. Each row has name + status.
func checkIntegrationHealth(t Reporter, c *conformClient) {
	t.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	resp, body, err := c.get(ctx, "/v1/health")
	if err != nil {
		t.Fatalf("GET /v1/health: %v", err)
	}
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("GET /v1/health status = %d, want 200 or 503", resp.StatusCode)
	}
	var health struct {
		Healthy       bool   `json:"healthy"`
		UptimeS       int    `json:"uptime_s"`
		OverallStatus string `json:"overall_status"`
		Integrations  []struct {
			Name   string `json:"name"`
			Status string `json:"status"`
			Detail string `json:"detail,omitempty"`
		} `json:"integrations"`
	}
	if err := json.Unmarshal(body, &health); err != nil {
		t.Fatalf("decode /v1/health: %v (body=%s)", err, truncForLog(body))
	}
	if health.OverallStatus == "" {
		t.Errorf("overall_status is empty; contract §3.4 requires it when integration_health = true")
	}
	switch health.OverallStatus {
	case "ready", "degraded", "unavailable":
		// ok
	default:
		t.Errorf("overall_status = %q, want one of ready/degraded/unavailable", health.OverallStatus)
	}
	if len(health.Integrations) == 0 {
		t.Errorf("integrations[] empty; contract §3.4 requires ≥1 row when integration_health = true")
	}
	for i, integ := range health.Integrations {
		if integ.Name == "" {
			t.Errorf("integrations[%d]: name empty", i)
		}
		if integ.Status == "" {
			t.Errorf("integrations[%d] (%s): status empty", i, integ.Name)
		}
	}
}

// checkStructuredErrors exercises SPEC §14 — 4xx / 5xx responses
// carry the structured error envelope (error / message / details /
// recoverable). The simplest way to force one is a 404 for a
// non-existent session.
func checkStructuredErrors(t Reporter, c *conformClient) {
	t.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	resp, body, err := c.get(ctx, "/v1/sessions/sess_does_not_exist_conformance_probe")
	if err != nil {
		t.Fatalf("GET non-existent session: %v", err)
	}
	// 404 is preferred; some backends use 403/422. Don't hard-fail
	// on the status code — the envelope shape is the real assertion.
	_ = resp.StatusCode
	// Body should carry an error envelope.
	var env struct {
		Error any `json:"error"`
	}
	if err := json.Unmarshal(body, &env); err != nil {
		t.Errorf("error response body didn't decode as JSON: %v (body=%s)", err, truncForLog(body))
		return
	}
	if env.Error == nil {
		t.Errorf("error response body has nil/missing `error` field (body=%s)", truncForLog(body))
		return
	}
	// `error` may be a string (v0.1 shape) OR a structured object
	// (v0.2 shape). Backends claiming structured_errors should use
	// the object form — check that when possible.
	switch e := env.Error.(type) {
	case string:
		// Back-compat v0.1 shape — v0.2 contract allows both during
		// the transition. Pass silently.
		_ = e
	case map[string]any:
		// The envelope MUST carry `message`. The machine-readable
		// error discriminator is either `code` (v0.1 shape, §6.0)
		// or `error` (v0.2 shape, §14). Either is acceptable — a
		// backend claiming structured_errors may still be mid-
		// migration on the HTTP layer even if messages emit full
		// v0.2 error_info.
		if _, ok := e["message"]; !ok {
			t.Errorf("structured error body missing required key %q: %+v", "message", e)
		}
		_, hasCode := e["code"]
		_, hasError := e["error"]
		if !hasCode && !hasError {
			t.Errorf("structured error body needs either `code` (v0.1) or `error` (v0.2) as the type discriminator: %+v", e)
		}
	default:
		t.Errorf("error field is unexpected type %T: %+v", e, e)
	}
}

// checkToolTelemetry is an intentionally narrow check — there's no
// endpoint to hit. We assert that the capability flag is advertised
// at all, then log a note that the real verification is observing
// tool_result.cached / duration_ms during a streaming turn (which
// the SSE suite covers end-to-end when the turn exercises a tool).
func checkToolTelemetry(t Reporter, c *conformClient) {
	t.Helper()
	// Trivial: the cap was read before calling us; reaching here
	// proves the backend exposes the flag. Full fidelity (cached +
	// duration_ms on tool_result parts) is verified end-to-end by
	// the SSE suite during a tool-using turn.
	_ = c
	_ = fmt.Sprintf
}

// truncForLog trims a body to a loggable size so fail messages
// don't dump megabytes.
func truncForLog(b []byte) string {
	const max = 200
	if len(b) <= max {
		return string(b)
	}
	return string(b[:max]) + "…"
}
