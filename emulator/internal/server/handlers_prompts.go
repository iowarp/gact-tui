package server

import (
	"crypto/sha256"
	"fmt"
	"net/http"
	"sort"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// --- CLIO prompt registry extension ---------------------------------------

func (s *Server) handleListPrompts(w http.ResponseWriter, r *http.Request) {
	sessionID := strings.TrimSpace(r.URL.Query().Get("session_id"))
	rows := make([]gact.PromptDefinition, 0, len(s.prompts))
	for _, row := range s.prompts {
		if !promptDefinitionMatchesScope(row, sessionID) {
			continue
		}
		rows = append(rows, row)
	}
	sort.SliceStable(rows, func(i, j int) bool { return rows[i].ID < rows[j].ID })
	writeJSON(w, http.StatusOK, map[string]any{"prompts": rows})
}

func promptDefinitionMatchesScope(row gact.PromptDefinition, sessionID string) bool {
	if !strings.EqualFold(strings.TrimSpace(row.Scope), "session") {
		return true
	}
	if sessionID == "" {
		return false
	}
	if scopedID := promptDefinitionSessionID(row); scopedID != "" {
		return scopedID == sessionID
	}
	return true
}

func promptDefinitionSessionID(row gact.PromptDefinition) string {
	if id := stringFromAnyMap(row.Metadata, "session_id"); id != "" {
		return id
	}
	for _, profile := range row.Profiles {
		if id := stringFromAnyMap(profile.Metadata, "session_id"); id != "" {
			return id
		}
	}
	return ""
}

func stringFromAnyMap(values map[string]any, key string) string {
	if len(values) == 0 {
		return ""
	}
	value, ok := values[key]
	if !ok {
		return ""
	}
	return strings.TrimSpace(fmt.Sprint(value))
}

func (s *Server) handleGetPrompt(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	row, ok := s.prompts[id]
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "prompt not found: "+id)
		return
	}
	profile := r.URL.Query().Get("profile")
	resolved, ok := resolvePromptDefinition(row, profile)
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "prompt has no profiles: "+id)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"prompt": resolved})
}

func (s *Server) handleSavePrompt(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req gact.PromptSaveRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if s.cfg.PromptSaveFailures {
		writeError(w, http.StatusConflict, "save_failed", "workspace prompt registry is read-only in this demo")
		return
	}
	text := strings.TrimSpace(req.Text)
	if text == "" {
		writeError(w, http.StatusUnprocessableEntity, "bad_request", "missing required field: text")
		return
	}
	profile := strings.TrimSpace(req.Profile)
	if profile == "" {
		profile = "default"
	}
	if strings.Contains(profile, "/") || strings.Contains(profile, ".") && strings.Contains(profile, "..") {
		writeError(w, http.StatusUnprocessableEntity, "bad_request", "invalid profile")
		return
	}
	row, ok := s.prompts[id]
	if !ok {
		row = gact.PromptDefinition{ID: id, Title: id, DefaultProfile: profile, Enabled: true, Profiles: map[string]gact.PromptProfile{}}
	}
	if row.Profiles == nil {
		row.Profiles = map[string]gact.PromptProfile{}
	}
	if req.Title != "" {
		row.Title = req.Title
	}
	if req.Description != "" {
		row.Description = req.Description
	}
	row.Scope = "global"
	row.Enabled = true
	row.Profiles[profile] = gact.PromptProfile{
		Name:       profile,
		Text:       req.Text,
		Scope:      "global",
		SourcePath: "~/.config/clio-agent/prompts/" + id + "--" + profile + ".md",
		Provider:   req.Provider,
		Model:      req.Model,
		Checksum:   promptChecksum(req.Text),
		Metadata:   req.Metadata,
	}
	s.prompts[id] = row
	writeJSON(w, http.StatusOK, map[string]any{"prompt": row})
}

func (s *Server) handleRenderPrompt(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req gact.PromptRenderRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	row, ok := s.prompts[id]
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "prompt not found: "+id)
		return
	}
	resolved, ok := resolvePromptDefinition(row, req.Profile)
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "prompt has no profiles: "+id)
		return
	}
	resolved.Text = resolved.Text + "\n\nRuntime context:\n" +
		"session_id: " + req.SessionID + "\nworkspace_id: " + req.WorkspaceID
	if resolved.Metadata == nil {
		resolved.Metadata = map[string]any{}
	}
	resolved.Metadata["rendered"] = true
	resolved.Metadata["session_id"] = req.SessionID
	resolved.Metadata["workspace_id"] = req.WorkspaceID
	writeJSON(w, http.StatusOK, map[string]any{"prompt": resolved})
}

func (s *Server) handleValidatePrompt(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req gact.PromptValidateRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	row, ok := s.prompts[id]
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "prompt not found: "+id)
		return
	}
	errors := append([]string(nil), row.ValidationErrors...)
	if strings.Contains(req.Text, "{{missing") {
		errors = append(errors, "unknown placeholder: missing")
	}
	row.Enabled = len(errors) == 0
	row.ValidationErrors = errors
	writeJSON(w, http.StatusOK, gact.PromptValidationResult{
		Enabled:          row.Enabled,
		ValidationErrors: errors,
		Prompt:           row,
	})
}

func (s *Server) handleReloadPrompts(w http.ResponseWriter, r *http.Request) {
	rows := make([]string, 0, len(s.prompts))
	for id := range s.prompts {
		rows = append(rows, id)
	}
	sort.Strings(rows)
	writeJSON(w, http.StatusOK, map[string]any{"reload": gact.PromptReloadResult{
		PromptCount: len(rows),
		PromptIDs:   rows,
		Sources: []gact.PromptSource{{
			Scope: "builtin",
			Root:  "emulator://prompts",
		}},
	}})
}

func resolvePromptDefinition(row gact.PromptDefinition, requested string) (gact.ResolvedPrompt, bool) {
	profile := strings.TrimSpace(requested)
	if profile == "" {
		profile = firstNonEmptyString(row.DefaultProfile, "default")
	}
	selected, ok := row.Profiles[profile]
	fallback := ""
	if !ok && profile != row.DefaultProfile {
		selected, ok = row.Profiles[row.DefaultProfile]
		fallback = row.DefaultProfile
	}
	if !ok {
		for _, p := range row.Profiles {
			selected = p
			ok = true
			fallback = p.Name
			break
		}
	}
	if !ok {
		return gact.ResolvedPrompt{}, false
	}
	return gact.ResolvedPrompt{
		ID:               row.ID,
		Profile:          selected.Name,
		Text:             selected.Text,
		Title:            row.Title,
		Description:      row.Description,
		Scope:            firstNonEmptyString(selected.Scope, row.Scope),
		SourcePath:       firstNonEmptyString(selected.SourcePath, row.SourcePath),
		Provider:         selected.Provider,
		Model:            selected.Model,
		Checksum:         selected.Checksum,
		FallbackProfile:  fallback,
		ValidationErrors: row.ValidationErrors,
		Metadata:         selected.Metadata,
	}, true
}

func promptChecksum(text string) string {
	sum := sha256.Sum256([]byte(text))
	return fmt.Sprintf("%x", sum[:])[:12]
}

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}
