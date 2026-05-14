package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// CLIO-BBBBBBBBBB3: `GET /v1/agents` returns all tiers (unfiltered
// keeps v0.1 back-compat); `?tier=2` filters to specialists.
func TestListAgents_TierFilter(t *testing.T) {
	s := New(Config{})
	fetch := func(query string) []gact.AgentDef {
		rec := httptest.NewRecorder()
		url := "/v1/agents"
		if query != "" {
			url += "?" + query
		}
		req := httptest.NewRequest(http.MethodGet, url, nil)
		s.Handler().ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", rec.Code)
		}
		var body struct {
			Agents []gact.AgentDef `json:"agents"`
		}
		if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
			t.Fatalf("decode: %v", err)
		}
		return body.Agents
	}

	all := fetch("")
	tier2 := fetch("tier=2")

	if len(all) < len(tier2) {
		t.Fatalf("unfiltered list (%d) shorter than tier=2 list (%d)", len(all), len(tier2))
	}
	if len(tier2) == 0 {
		t.Fatalf("tier=2 list empty; v0.2 reference expected 3 specialists")
	}
	// Every row returned by tier=2 carries Tier=2 + a specialization.
	for _, a := range tier2 {
		if a.Tier != 2 {
			t.Errorf("agent %q has tier=%d, want 2", a.ID, a.Tier)
		}
		if a.Specialization == "" {
			t.Errorf("agent %q has empty specialization", a.ID)
		}
		if len(a.Keywords) == 0 {
			t.Errorf("agent %q has no keywords", a.ID)
		}
	}
	// v0.1 tier-1/untagged agents still show up in the unfiltered
	// list.
	hasDefault := false
	for _, a := range all {
		if a.ID == "default" && a.Tier == 0 {
			hasDefault = true
		}
	}
	if !hasDefault {
		t.Errorf("unfiltered list should still contain the tier-0 'default' agent for v0.1 back-compat")
	}
}
