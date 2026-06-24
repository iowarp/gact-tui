package server

import (
	"net/http"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func (s *Server) handleListExpertPacks(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"expert_packs": s.expertPacks()})
}

func (s *Server) handleGetExpertPack(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	for _, pack := range s.expertPacks() {
		if pack.ID == id {
			writeJSON(w, http.StatusOK, gact.ExpertPackDetail{
				ExpertPack: pack,
				Agents:     staticExpertPackAgents(pack.ID),
			})
			return
		}
	}
	writeError(w, http.StatusNotFound, "not_found", "expert pack not found: "+id)
}

func (s *Server) handleValidateExpertPack(w http.ResponseWriter, r *http.Request) {
	var req gact.ExpertPackValidateRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.Path) == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "path is required")
		return
	}
	pack := gact.ExpertPackDefinition{
		ID:             "validated-pack",
		Version:        "0.1.0",
		Title:          "Validated Expert Pack",
		Scope:          firstNonEmptyString(req.Scope, "session"),
		Root:           req.Path,
		DefinitionPath: req.Path + "/clio-pack.yaml",
		Enabled:        true,
	}
	writeJSON(w, http.StatusOK, gact.ExpertPackValidationResult{
		Enabled: true,
		Pack:    pack,
		Agents:  staticExpertPackAgents(pack.ID),
	})
}

func (s *Server) handleInstallExpertPack(w http.ResponseWriter, r *http.Request) {
	var req gact.ExpertPackInstallRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	source := firstNonEmptyString(req.Source, req.SourceID, req.URL, req.Path)
	if strings.TrimSpace(source) == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "source, url, or path is required")
		return
	}
	if s.cfg.ExpertPackFailures && strings.Contains(strings.ToLower(source), "install-fail") {
		writeError(w, http.StatusBadGateway, "install_failed", "expert pack install failed: manifest clio-pack.yaml was not found")
		return
	}
	pack := s.expertPacks()[0]
	writeJSON(w, http.StatusOK, map[string]any{
		"installed": map[string]any{
			"id":     pack.ID,
			"scope":  firstNonEmptyString(req.Scope, pack.Scope, "workspace"),
			"source": source,
			"status": "installed",
		},
	})
}

func (s *Server) handleUpdateExpertPack(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if s.cfg.ExpertPackFailures && id == "data-semantics" {
		writeError(w, http.StatusConflict, "update_failed", "expert pack update failed: marketplace source has validation errors")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"updated": map[string]any{"id": id, "scope": "workspace", "status": "updated"},
	})
}

func (s *Server) handleDeleteExpertPack(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if s.cfg.ExpertPackFailures && id == "data-semantics" {
		writeError(w, http.StatusConflict, "delete_failed", "expert pack delete failed: pack is active in the selected session")
		return
	}
	for _, pack := range s.expertPacks() {
		if pack.ID == id {
			w.WriteHeader(http.StatusNoContent)
			return
		}
	}
	writeError(w, http.StatusNotFound, "not_found", "expert pack not found: "+id)
}

func (s *Server) handleGetSessionExpertPack(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	sess, err := s.store.GetSession(id)
	if err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	state := s.sessionExpertPackState(sess)
	writeJSON(w, http.StatusOK, state)
}

func (s *Server) handleSetSessionExpertPack(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	sess, err := s.store.GetSession(id)
	if err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	var req gact.SetSessionExpertPackRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	packID := strings.TrimSpace(req.PackID)
	if packID == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "pack_id or path is required")
		return
	}
	var pack *gact.ExpertPackDefinition
	for _, row := range s.expertPacks() {
		if row.ID == packID {
			copy := row
			pack = &copy
			break
		}
	}
	if pack == nil {
		writeError(w, http.StatusNotFound, "not_found", "expert pack not found: "+packID)
		return
	}
	if sess.Metadata == nil {
		sess.Metadata = map[string]any{}
	}
	sess.Metadata["active_expert_pack_id"] = pack.ID
	sess.Metadata["active_expert_pack_version"] = pack.Version
	sess.Metadata["active_expert_pack_scope"] = pack.Scope
	updated, err := s.store.UpdateSession(id, func(row *gact.Session) {
		row.Metadata = sess.Metadata
	})
	if err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	state := s.sessionExpertPackState(updated)
	writeJSON(w, http.StatusOK, state)
}

func (s *Server) sessionExpertPackState(sess *gact.Session) gact.SessionExpertPackState {
	if sess == nil {
		return gact.SessionExpertPackState{}
	}
	packID, _ := sess.Metadata["active_expert_pack_id"].(string)
	var pack *gact.ExpertPackDefinition
	for _, row := range s.expertPacks() {
		if row.ID == packID {
			copy := row
			pack = &copy
			break
		}
	}
	return gact.SessionExpertPackState{
		SessionID:          sess.ID,
		WorkspaceID:        sess.WorkspaceID,
		ActiveExpertPackID: packID,
		ExpertPack:         pack,
		Session:            sess,
	}
}

func (s *Server) expertPacks() []gact.ExpertPackDefinition {
	if s != nil && s.cfg.EmptyExpertPacks {
		return nil
	}
	return staticExpertPacks()
}

func staticExpertPacks() []gact.ExpertPackDefinition {
	return []gact.ExpertPackDefinition{{
		ID:             "data-semantics",
		Version:        "0.1.0",
		Title:          "Data Semantics",
		Description:    "Data, analysis, visualization, and utility experts for scientific datasets.",
		Scope:          "workspace",
		Root:           ".clio/expert-packs/data-semantics",
		DefinitionPath: ".clio/expert-packs/data-semantics/clio-pack.yaml",
		Enabled:        true,
		Defaults:       map[string]any{"prompt_profile": "heavy"},
		Metadata: map[string]any{"install": map[string]any{
			"source":         "git@github.com:example/data-semantics-agents.git",
			"source_kind":    "git",
			"ref":            "main",
			"commit":         "fedcba98765432100123456789abcdef",
			"installed_at":   "2026-06-05T14:00:00Z",
			"last_synced_at": "2026-06-06T08:30:00Z",
			"status":         "installed",
			"trust":          "explicit",
		}},
	}, {
		ID:               "broken-pack",
		Version:          "0.0.1",
		Title:            "Broken Pack",
		Description:      "Invalid pack kept visible for validation diagnostics.",
		Scope:            "workspace",
		Root:             ".clio/expert-packs/broken-pack",
		DefinitionPath:   ".clio/expert-packs/broken-pack/clio-pack.yaml",
		Enabled:          false,
		ValidationErrors: []string{"parent_id references missing expert"},
	}}
}

func staticExpertPackAgents(packID string) []gact.AgentDef {
	if packID == "broken-pack" {
		return []gact.AgentDef{{
			ID: "broken", Source: "expert_pack", Title: "Broken Expert", ParentID: "missing",
			Enabled: false, ValidationErrors: []string{"missing parent: missing"},
		}}
	}
	return []gact.AgentDef{{
		ID: "main", Source: "expert_pack", Title: "Main Expert", PromptID: "clio.main.planner",
		PromptProfile: "heavy", Enabled: true, Commands: []string{"/analyze"},
	}, {
		ID: "analysis", Source: "expert_pack", Title: "Analysis Expert", ParentID: "main",
		PromptID: "clio.expert.analysis", PromptProfile: "heavy", Tools: []string{"memory_search_sessions"},
		Keywords: []string{"statistics", "quality"}, Enabled: true,
	}}
}
