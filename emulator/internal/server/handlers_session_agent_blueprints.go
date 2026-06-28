package server

import (
	"net/http"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func (s *Server) handleGetSessionAgentBlueprint(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	sess, err := s.store.GetSession(id)
	if err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	writeJSON(w, http.StatusOK, s.sessionAgentBlueprintState(sess))
}

func (s *Server) handleSetSessionAgentBlueprint(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	sess, err := s.store.GetSession(id)
	if err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	var req gact.SetSessionAgentBlueprintRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	blueprintID := firstNonEmptyString(strings.TrimSpace(req.BlueprintID), strings.TrimSpace(req.AgentBlueprintID))
	if blueprintID == "" && strings.TrimSpace(req.Path) == "" && strings.TrimSpace(req.BlueprintPath) == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "blueprint_id or path is required")
		return
	}
	var blueprint *gact.AgentBlueprintDefinition
	for _, row := range s.agentBlueprints() {
		if row.ID == blueprintID {
			copy := row
			blueprint = &copy
			break
		}
	}
	if blueprint == nil && blueprintID != "" {
		writeError(w, http.StatusNotFound, "not_found", "agent blueprint not found: "+blueprintID)
		return
	}
	if blueprint == nil {
		row := gact.AgentBlueprintDefinition{
			ID:             "session-blueprint",
			Version:        "0.1.0",
			Title:          "Session Blueprint",
			Scope:          "session",
			Root:           firstNonEmptyString(req.Path, req.BlueprintPath),
			RootPath:       firstNonEmptyString(req.Path, req.BlueprintPath) + "/AGENT.md",
			DefinitionPath: firstNonEmptyString(req.Path, req.BlueprintPath) + "/AGENT.md",
			RootExpert:     "main",
			Enabled:        true,
		}
		blueprint = &row
	}
	if sess.Metadata == nil {
		sess.Metadata = map[string]any{}
	}
	sess.Metadata["active_agent_blueprint_id"] = blueprint.ID
	sess.Metadata["active_agent_blueprint_version"] = blueprint.Version
	sess.Metadata["active_agent_blueprint_scope"] = blueprint.Scope
	sess.Metadata["active_agent_blueprint_definition_path"] = firstNonEmptyString(blueprint.DefinitionPath, blueprint.RootPath)
	sess.Metadata["active_agent_blueprint_path"] = ""
	sess.Metadata["active_expert_pack_id"] = ""
	sess.Metadata["active_expert_pack_path"] = ""
	updated, err := s.store.UpdateSession(id, func(row *gact.Session) {
		row.Metadata = sess.Metadata
	})
	if err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	state := s.sessionAgentBlueprintState(updated)
	state.AgentBlueprint = blueprint
	writeJSON(w, http.StatusOK, state)
}

func (s *Server) handleGetSessionAgentOverlay(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	sess, err := s.store.GetSession(id)
	if err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	writeJSON(w, http.StatusOK, gact.SessionAgentOverlayResponse{
		SessionID:    id,
		AgentOverlay: mapFromAny(sess.Metadata["agent_blueprint_overlay"]),
	})
}

func (s *Server) handlePutSessionAgentOverlay(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var overlay map[string]any
	if !decodeJSON(w, r, &overlay) {
		return
	}
	updated, err := s.store.UpdateSession(id, func(row *gact.Session) {
		if row.Metadata == nil {
			row.Metadata = map[string]any{}
		}
		row.Metadata["agent_blueprint_overlay"] = overlay
	})
	if err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	writeJSON(w, http.StatusOK, gact.SessionAgentOverlayResponse{
		SessionID:    id,
		AgentOverlay: overlay,
		Session:      updated,
	})
}

func (s *Server) sessionAgentBlueprintState(sess *gact.Session) gact.SessionAgentBlueprintState {
	if sess == nil {
		return gact.SessionAgentBlueprintState{}
	}
	blueprintID, _ := sess.Metadata["active_agent_blueprint_id"].(string)
	var blueprint *gact.AgentBlueprintDefinition
	for _, row := range s.agentBlueprints() {
		if row.ID == blueprintID {
			copy := row
			blueprint = &copy
			break
		}
	}
	return gact.SessionAgentBlueprintState{
		SessionID:                sess.ID,
		WorkspaceID:              sess.WorkspaceID,
		ActiveAgentBlueprintID:   blueprintID,
		ActiveAgentBlueprintPath: stringFromAny(sess.Metadata["active_agent_blueprint_path"]),
		AgentBlueprint:           blueprint,
		AgentOverlay:             mapFromAny(sess.Metadata["agent_blueprint_overlay"]),
		Session:                  sess,
	}
}
