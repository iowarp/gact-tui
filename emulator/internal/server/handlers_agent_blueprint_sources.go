package server

import (
	"net/http"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func (s *Server) handleListAgentBlueprintSources(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"sources": s.agentBlueprintSources()})
}

func (s *Server) handleAddAgentBlueprintSource(w http.ResponseWriter, r *http.Request) {
	var req gact.AgentBlueprintSourceRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	source := strings.TrimSpace(firstNonEmptyString(req.Source, req.URL))
	if source == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "source or url is required")
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = sourceDisplayName(source)
	}
	id := strings.TrimSpace(req.ID)
	if id == "" {
		id = sourceRegistryID(source, req.Ref)
	}
	now := "2026-06-11T12:00:00Z"
	row := gact.AgentBlueprintSource{
		ID:           id,
		Name:         name,
		Source:       source,
		Ref:          strings.TrimSpace(req.Ref),
		PinnedCommit: strings.TrimSpace(req.PinnedCommit),
		SourceKind:   sourceKind(source),
		Status:       "ready",
		Commit:       "1234567890abcdef",
		AddedAt:      now,
		UpdatedAt:    now,
	}
	s.blueprintMu.Lock()
	defer s.blueprintMu.Unlock()
	filtered := s.blueprintSources[:0]
	for _, existing := range s.blueprintSources {
		if existing.ID != id {
			filtered = append(filtered, existing)
		}
	}
	s.blueprintSources = append(filtered, row)
	writeJSON(w, http.StatusCreated, map[string]any{"source": row})
}

func (s *Server) handleRefreshAgentBlueprintSource(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if s.cfg.AgentBlueprintFailures && id == "data-semantics-agents" {
		writeError(w, http.StatusServiceUnavailable, "source_refresh_failed", "marketplace source refresh failed: unable to fetch remote refs")
		return
	}
	for _, source := range s.agentBlueprintSources() {
		if source.ID == id {
			source.Status = "ready"
			source.UpdatedAt = "2026-06-04T12:30:00Z"
			writeJSON(w, http.StatusOK, map[string]any{"source": source})
			return
		}
	}
	writeError(w, http.StatusNotFound, "not_found", "agent blueprint source not found: "+id)
}

func (s *Server) handleDeleteAgentBlueprintSource(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	s.blueprintMu.Lock()
	for i, source := range s.blueprintSources {
		if source.ID == id {
			s.blueprintSources = append(s.blueprintSources[:i], s.blueprintSources[i+1:]...)
			s.blueprintMu.Unlock()
			w.WriteHeader(http.StatusNoContent)
			return
		}
	}
	s.blueprintMu.Unlock()
	for _, source := range s.agentBlueprintSources() {
		if source.ID == id {
			w.WriteHeader(http.StatusNoContent)
			return
		}
	}
	writeError(w, http.StatusNotFound, "not_found", "agent blueprint source not found: "+id)
}
