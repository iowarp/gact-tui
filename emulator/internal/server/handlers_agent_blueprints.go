package server

import (
	"net/http"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func (s *Server) handleListAgentBlueprints(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"agent_blueprints": s.agentBlueprints()})
}

func (s *Server) handleGetAgentBlueprint(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	for _, blueprint := range s.agentBlueprints() {
		if blueprint.ID == id {
			agents := staticAgentBlueprintAgents(blueprint.ID)
			if s.cfg.LongAgentBlueprints && blueprint.ID == longAgentBlueprintID {
				agents = staticLongAgentBlueprintAgents(blueprint.ID)
			}
			writeJSON(w, http.StatusOK, gact.AgentBlueprintDetail{
				AgentBlueprint:  blueprint,
				Agents:          agents,
				MCPDescriptors:  staticAgentBlueprintMCPDescriptors(blueprint.ID),
				HookDescriptors: staticAgentBlueprintHookDescriptors(blueprint.ID),
			})
			return
		}
	}
	writeError(w, http.StatusNotFound, "not_found", "agent blueprint not found: "+id)
}

func (s *Server) handleValidateAgentBlueprint(w http.ResponseWriter, r *http.Request) {
	var req gact.AgentBlueprintValidateRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.Path) == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "path is required")
		return
	}
	blueprint := gact.AgentBlueprintDefinition{
		ID:             "validated-blueprint",
		Version:        "0.1.0",
		Title:          "Validated Blueprint",
		Scope:          firstNonEmptyString(req.Scope, "session"),
		Root:           req.Path,
		RootPath:       req.Path + "/AGENT.md",
		DefinitionPath: req.Path + "/AGENT.md",
		RootExpert:     "main",
		Enabled:        true,
	}
	if s.cfg.AgentBlueprintFailures && strings.Contains(strings.ToLower(req.Path), "warning") {
		blueprint.ID = "validated-warning-blueprint"
		blueprint.Title = "Validated Warning Blueprint"
		writeJSON(w, http.StatusOK, gact.AgentBlueprintValidationResult{
			Enabled:            true,
			AgentBlueprint:     blueprint,
			Agents:             staticAgentBlueprintAgents(blueprint.ID),
			MCPDescriptors:     staticAgentBlueprintMCPDescriptors(blueprint.ID),
			HookDescriptors:    staticAgentBlueprintHookDescriptors(blueprint.ID),
			ValidationWarnings: []string{"descriptor references optional MCP server not installed"},
		})
		return
	}
	if s.cfg.AgentBlueprintFailures && strings.Contains(strings.ToLower(req.Path), "invalid") {
		blueprint.ID = "validated-invalid-blueprint"
		blueprint.Title = "Validated Invalid Blueprint"
		blueprint.Enabled = false
		blueprint.ValidationErrors = []string{"root_expert not found: missing"}
		writeJSON(w, http.StatusOK, gact.AgentBlueprintValidationResult{
			Enabled:          false,
			AgentBlueprint:   blueprint,
			ValidationErrors: []string{"root_expert not found: missing"},
		})
		return
	}
	writeJSON(w, http.StatusOK, gact.AgentBlueprintValidationResult{
		Enabled:         true,
		AgentBlueprint:  blueprint,
		Agents:          staticAgentBlueprintAgents(blueprint.ID),
		MCPDescriptors:  staticAgentBlueprintMCPDescriptors(blueprint.ID),
		HookDescriptors: staticAgentBlueprintHookDescriptors(blueprint.ID),
	})
}

func (s *Server) handleInstallAgentBlueprint(w http.ResponseWriter, r *http.Request) {
	var req gact.AgentBlueprintInstallRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	source := firstNonEmptyString(req.Source, req.SourceID, req.URL, req.Path)
	if strings.TrimSpace(source) == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "source, url, or path is required")
		return
	}
	if s.cfg.AgentBlueprintFailures && strings.Contains(strings.ToLower(source), "install-fail") {
		writeError(w, http.StatusBadGateway, "install_failed", "agent blueprint install failed: source archive is missing AGENT.md")
		return
	}
	blueprints := s.agentBlueprints()
	blueprint := blueprints[0]
	if req.BlueprintID != "" {
		blueprint.ID = req.BlueprintID
		blueprint.Title = req.BlueprintID
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"installed": []map[string]any{{
			"id":    blueprint.ID,
			"title": blueprint.Title,
			"scope": firstNonEmptyString(req.Scope, "workspace"),
			"install": map[string]any{
				"source": source,
				"ref":    req.Ref,
				"status": "installed",
			},
		}},
	})
}

func (s *Server) handleUpdateAgentBlueprint(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if s.cfg.AgentBlueprintFailures && id == "broken-blueprint" {
		writeError(w, http.StatusConflict, "update_failed", "agent blueprint update failed: validation errors must be fixed first")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"updated": map[string]any{"id": id, "scope": "workspace", "status": "updated"},
	})
}

func (s *Server) handleDeleteAgentBlueprint(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if s.cfg.AgentBlueprintFailures && id == "broken-blueprint" {
		writeError(w, http.StatusConflict, "delete_failed", "agent blueprint delete failed: workspace policy is locking this blueprint")
		return
	}
	if id == "data-exploration" && r.URL.Query().Get("scope") == "builtin" {
		writeError(w, http.StatusBadRequest, "bad_request", "built-in agent blueprints cannot be deleted")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"uninstalled": map[string]any{"id": id, "scope": firstNonEmptyString(r.URL.Query().Get("scope"), "workspace")},
	})
}

func (s *Server) handleEnableAgentBlueprintHook(w http.ResponseWriter, r *http.Request) {
	blueprintID := r.PathValue("id")
	hookID := r.PathValue("hook_id")
	for _, descriptor := range staticAgentBlueprintHookDescriptors(blueprintID) {
		if descriptor["id"] == hookID {
			writeJSON(w, http.StatusOK, map[string]any{
				"id":                 "agent_blueprint_hook_" + blueprintID + "_" + hookID,
				"hook_id":            hookID,
				"event":              descriptor["event"],
				"status":             "enabled",
				"enabled":            true,
				"source":             "agent_blueprint",
				"agent_blueprint_id": blueprintID,
				"definition_path":    descriptor["definition_path"],
				"installed_path":     "/tmp/gact-hooks/blueprints/" + blueprintID + "/" + hookID + ".py",
				"checksum":           descriptor["checksum"],
				"trust": map[string]any{
					"policy":  "explicit",
					"trusted": true,
					"source":  "request",
				},
			})
			return
		}
	}
	writeError(w, http.StatusNotFound, "not_found", "agent blueprint hook descriptor not found: "+hookID)
}

func (s *Server) handleEnableAgentBlueprintMCP(w http.ResponseWriter, r *http.Request) {
	blueprintID := r.PathValue("id")
	descriptorID := r.PathValue("descriptor_id")
	for _, descriptor := range staticAgentBlueprintMCPDescriptors(blueprintID) {
		if descriptor["id"] == descriptorID {
			writeJSON(w, http.StatusOK, map[string]any{
				"id":                 "agent_blueprint_mcp_" + blueprintID + "_" + descriptorID,
				"name":               firstNonEmptyString(stringFromAny(descriptor["name"]), descriptorID),
				"status":             "enabled_pending_probe",
				"transport":          firstNonEmptyString(stringFromAny(descriptor["transport"]), "unknown"),
				"tools_count":        0,
				"tools":              []any{},
				"spec":               map[string]any{"transport": descriptor["transport"], "command": descriptor["command"], "args": descriptor["args"]},
				"source":             "agent_blueprint",
				"agent_blueprint_id": blueprintID,
				"descriptor_id":      descriptorID,
			})
			return
		}
	}
	writeError(w, http.StatusNotFound, "not_found", "MCP descriptor not found: "+descriptorID)
}
