package server

import (
	"net/http"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func (s *Server) handleListAgents(w http.ResponseWriter, r *http.Request) {
	agents := s.allAgents()
	// v0.2 — SPEC §4.3.1: `?tier=N` filters to a specific tier.
	// Absent = return all tiers (backwards-compat with v0.1).
	if tierStr := r.URL.Query().Get("tier"); tierStr != "" {
		var filtered []gact.AgentDef
		for _, a := range agents {
			if atoi(tierStr) == a.Tier {
				filtered = append(filtered, a)
			}
		}
		agents = filtered
	}
	writeJSON(w, http.StatusOK, map[string]any{"agents": agents})
}

// atoi is a small helper for query-string int parsing — returns 0 on
// anything we don't like so `?tier=bogus` silently returns no tier-0
// matches (i.e. no results) rather than 500ing.
func atoi(s string) int {
	n := 0
	for _, r := range s {
		if r < '0' || r > '9' {
			return 0
		}
		n = n*10 + int(r-'0')
	}
	return n
}

func (s *Server) handleGetAgent(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	s.agentsMu.Lock()
	if agent, ok := s.agents[id]; ok {
		s.agentsMu.Unlock()
		writeJSON(w, http.StatusOK, agent)
		return
	}
	s.agentsMu.Unlock()
	for _, a := range s.allAgents() {
		if a.ID == id {
			writeJSON(w, http.StatusOK, a)
			return
		}
	}
	writeError(w, http.StatusNotFound, "agent_not_found", "no agent with id "+id)
}

func (s *Server) handleCreateAgent(w http.ResponseWriter, r *http.Request) {
	var agent gact.AgentDef
	if !decodeJSON(w, r, &agent) {
		return
	}
	if strings.TrimSpace(agent.ID) == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "agent id is required")
		return
	}
	if s.cfg.AgentFailures && strings.HasPrefix(agent.ID, "agent-write-fail") {
		writeError(w, http.StatusConflict, "agent_create_failed", "agent create failed: workspace registry rejected this id")
		return
	}
	agent.Source = firstNonEmptyString(agent.Source, "user")
	if agent.Title == "" {
		agent.Title = agent.ID
	}
	if !agent.Enabled {
		agent.Enabled = true
	}
	if agent.Metadata == nil {
		agent.Metadata = map[string]any{}
	}
	agent.Metadata["storage_scope"] = "workspace"
	agent.Metadata["source_path"] = "/workspace/.clio/agents/" + agent.ID + ".md"
	s.agentsMu.Lock()
	s.agents[agent.ID] = agent
	s.agentsMu.Unlock()
	writeJSON(w, http.StatusCreated, agent)
}

func (s *Server) handleUpdateAgent(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var patch gact.AgentDef
	if !decodeJSON(w, r, &patch) {
		return
	}
	if s.cfg.AgentFailures && id == "fragile-user-expert" {
		writeError(w, http.StatusConflict, "agent_update_failed", "agent update failed: source file changed on disk")
		return
	}
	s.agentsMu.Lock()
	defer s.agentsMu.Unlock()
	agent, ok := s.agents[id]
	if !ok {
		writeError(w, http.StatusNotFound, "agent_not_found", "user agent not found: "+id)
		return
	}
	if patch.Title != "" {
		agent.Title = patch.Title
	}
	agent.Description = patch.Description
	agent.SystemPrompt = patch.SystemPrompt
	agent.Tools = append([]string(nil), patch.Tools...)
	agent.Keywords = append([]string(nil), patch.Keywords...)
	if patch.Metadata != nil {
		agent.Metadata = patch.Metadata
	}
	if agent.Metadata == nil {
		agent.Metadata = map[string]any{}
	}
	agent.Metadata["updated_by"] = "gact-emulator"
	agent.Enabled = patch.Enabled
	s.agents[id] = agent
	writeJSON(w, http.StatusOK, agent)
}

func (s *Server) handleDeleteAgent(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if s.cfg.AgentFailures && id == "fragile-user-expert" {
		writeError(w, http.StatusConflict, "agent_delete_failed", "agent delete failed: expert is referenced by active session routing")
		return
	}
	s.agentsMu.Lock()
	defer s.agentsMu.Unlock()
	if _, ok := s.agents[id]; !ok {
		writeError(w, http.StatusNotFound, "agent_not_found", "user agent not found: "+id)
		return
	}
	delete(s.agents, id)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleExtractAgent(w http.ResponseWriter, r *http.Request) {
	var req gact.AgentExtractRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.AgentID) == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "agent_id is required")
		return
	}
	if s.cfg.AgentFailures && req.AgentID == "extract-fail" {
		writeError(w, http.StatusBadGateway, "agent_extract_failed", "agent extraction failed: session transcript is unavailable")
		return
	}
	agent := gact.AgentDef{
		ID:          req.AgentID,
		Source:      "user",
		Title:       req.AgentID,
		Description: "Extracted from " + strings.Join(req.SessionIDs, ", "),
		SystemPrompt: "Use the observed session goals, tool evidence, and routing decisions as the starting point for this " +
			"extracted agent.",
		Tools:    []string{"read_file", "mcp.parquet.read"},
		Keywords: []string{"extracted", "session"},
		Enabled:  true,
		Metadata: map[string]any{
			"created_by":     "gact-emulator",
			"extracted_from": req.SessionIDs,
			"source_path":    "/workspace/.clio/agents/" + req.AgentID + ".md",
		},
	}
	s.agentsMu.Lock()
	s.agents[agent.ID] = agent
	s.agentsMu.Unlock()
	writeJSON(w, http.StatusCreated, agent)
}

func (s *Server) allAgents() []gact.AgentDef {
	agents := staticAgents(s.cfg.EmptySkills)
	s.agentsMu.Lock()
	for _, agent := range s.agents {
		agents = append(agents, agent)
	}
	s.agentsMu.Unlock()
	return agents
}
