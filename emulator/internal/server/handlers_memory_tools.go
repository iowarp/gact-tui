package server

import (
	"net/http"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func (s *Server) handleMemoryToolSearchSessions(w http.ResponseWriter, r *http.Request) {
	if s.cfg.MemoryUnavailable {
		writeError(w, http.StatusNotImplemented, "memory_unavailable", "memory backend is unavailable in this emulator scenario")
		return
	}
	sessionID := r.PathValue("id")
	sess, err := s.store.GetSession(sessionID)
	if err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	var req gact.MemoryToolSearchSessionsRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	query := strings.TrimSpace(req.Query)
	if query == "" {
		writeError(w, http.StatusUnprocessableEntity, "invalid_request", "query is required")
		return
	}
	scope := firstNonEmptyString(req.Scope, "session")
	limit := req.Limit
	if limit <= 0 {
		limit = 10
	}
	if limit > 50 {
		limit = 50
	}
	userIntent := firstNonEmptyString(req.UserIntent, req.Reason)
	includeCross := false
	workspaceID := ""
	policyDecision := "allow_same_session"
	policyScope := "session"
	switch scope {
	case "current_workspace", "workspace", "cross_session":
		if !req.AllowCrossSession && userIntent == "" {
			writeMemoryToolDenied(w, "memory_search_sessions", sessionID, "", "current_workspace", "deny_cross_session_requires_intent")
			return
		}
		includeCross = true
		workspaceID = sess.WorkspaceID
		policyDecision = "allow_same_workspace_user_intent"
		policyScope = "current_workspace"
	case "global", "user", "user_global":
		if !req.AllowGlobal && userIntent == "" {
			writeMemoryToolDenied(w, "memory_search_sessions", sessionID, "", "global", "deny_global_requires_intent")
			return
		}
		includeCross = true
		workspaceID = "ws_global"
		policyDecision = "allow_global_user_intent"
		policyScope = "global"
	}
	resp := s.memorySearchResponse(query, sessionID, workspaceID, includeCross, limit)
	metadata := resp.Metadata
	if metadata == nil {
		metadata = map[string]any{}
	}
	metadata["policy_decision"] = policyDecision
	metadata["policy_scope"] = policyScope
	metadata["audit_id"] = memoryToolAuditID("memory_search_sessions", sessionID)
	metadata["caller"] = map[string]any(req.Caller)
	metadata["provenance"] = map[string]any{
		"source":       "gact_memory_tool",
		"tool_name":    "memory_search_sessions",
		"session_id":   sessionID,
		"workspace_id": sess.WorkspaceID,
	}
	writeJSON(w, http.StatusOK, gact.MemoryToolSearchSessionsResponse{
		Tool:             "memory_search_sessions",
		Query:            resp.Query,
		SearchedSessions: resp.SearchedSessions,
		Hits:             resp.Hits,
		Metadata:         metadata,
	})
}

func (s *Server) handleMemoryToolReadSessionSummary(w http.ResponseWriter, r *http.Request) {
	if s.cfg.MemoryUnavailable {
		writeError(w, http.StatusNotImplemented, "memory_unavailable", "memory backend is unavailable in this emulator scenario")
		return
	}
	sessionID := r.PathValue("id")
	var req gact.MemoryToolReadSessionSummaryRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	targetID := firstNonEmptyString(req.TargetSessionID, sessionID)
	policy, ok := s.memoryToolPolicy(sessionID, targetID, firstNonEmptyString(req.Scope, "session"), firstNonEmptyString(req.UserIntent, req.Reason), req.AllowCrossSession, req.AllowGlobal)
	if !ok {
		writeMemoryToolDenied(w, "memory_read_session_summary", sessionID, targetID, policy["scope"].(string), policy["decision"].(string))
		return
	}
	summary, err := s.memorySessionSummary(targetID)
	if err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	writeJSON(w, http.StatusOK, gact.MemoryToolReadSessionSummaryResponse{
		Tool:     "memory_read_session_summary",
		Summary:  summary,
		Metadata: memoryToolMetadata("memory_read_session_summary", sessionID, targetID, policy, map[string]any(req.Caller)),
	})
}

func (s *Server) handleMemoryToolReadContextFrame(w http.ResponseWriter, r *http.Request) {
	if s.cfg.MemoryUnavailable {
		writeError(w, http.StatusNotImplemented, "memory_unavailable", "memory backend is unavailable in this emulator scenario")
		return
	}
	sessionID := r.PathValue("id")
	var req gact.MemoryToolReadContextFrameRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	targetID := firstNonEmptyString(req.TargetSessionID, sessionID)
	frameID := strings.TrimSpace(req.FrameID)
	if frameID == "" {
		writeError(w, http.StatusUnprocessableEntity, "invalid_request", "frame_id is required")
		return
	}
	policy, ok := s.memoryToolPolicy(sessionID, targetID, firstNonEmptyString(req.Scope, "session"), firstNonEmptyString(req.UserIntent, req.Reason), req.AllowCrossSession, req.AllowGlobal)
	if !ok {
		writeMemoryToolDenied(w, "memory_read_context_frame", sessionID, targetID, policy["scope"].(string), policy["decision"].(string))
		return
	}
	frame, err := s.latestContextFrame(targetID, 10000)
	if err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	gotFrameID, _ := frame["id"].(string)
	if gotFrameID != frameID {
		writeError(w, http.StatusNotFound, "not_found", "context frame not found: "+frameID)
		return
	}
	frame["metadata"] = map[string]any{
		"source":                  "gact_context_frame",
		"raw_transcript_included": false,
		"items_returned":          len(contextFrameItemsFromMap(frame)),
	}
	writeJSON(w, http.StatusOK, gact.MemoryToolReadContextFrameResponse{
		Tool:     "memory_read_context_frame",
		Frame:    frame,
		Metadata: memoryToolMetadata("memory_read_context_frame", sessionID, targetID, policy, map[string]any(req.Caller)),
	})
}

func (s *Server) memoryToolPolicy(sessionID, targetID, scope, userIntent string, allowCross, allowGlobal bool) (map[string]any, bool) {
	active, err := s.store.GetSession(sessionID)
	if err != nil {
		return map[string]any{"scope": "session", "decision": "deny_missing_session"}, false
	}
	target, err := s.store.GetSession(targetID)
	if err != nil {
		return map[string]any{"scope": "session", "decision": "deny_missing_target"}, false
	}
	if sessionID == targetID {
		return map[string]any{
			"scope":               "session",
			"decision":            "allow_same_session",
			"workspace_id":        active.WorkspaceID,
			"target_workspace_id": target.WorkspaceID,
		}, true
	}
	if target.WorkspaceID == "ws_global" {
		if allowGlobal || userIntent != "" || scope == "global" || scope == "user" || scope == "user_global" {
			return map[string]any{"scope": "global", "decision": "allow_global_user_intent", "workspace_id": active.WorkspaceID, "target_workspace_id": target.WorkspaceID}, true
		}
		return map[string]any{"scope": "global", "decision": "deny_global_requires_intent"}, false
	}
	if active.WorkspaceID != "" && active.WorkspaceID == target.WorkspaceID {
		if allowCross || userIntent != "" {
			return map[string]any{"scope": "current_workspace", "decision": "allow_same_workspace_user_intent", "workspace_id": active.WorkspaceID, "target_workspace_id": target.WorkspaceID}, true
		}
		return map[string]any{"scope": "current_workspace", "decision": "deny_cross_session_requires_intent", "workspace_id": active.WorkspaceID, "target_workspace_id": target.WorkspaceID}, false
	}
	return map[string]any{"scope": "other_workspace", "decision": "deny_other_workspace", "workspace_id": active.WorkspaceID, "target_workspace_id": target.WorkspaceID}, false
}

func writeMemoryToolDenied(w http.ResponseWriter, toolName, sessionID, targetID, scope, decision string) {
	writeJSON(w, http.StatusForbidden, map[string]any{
		"error": map[string]any{
			"error":   "memory_policy_denied",
			"message": "memory tool call is outside the permitted session/workspace scope",
			"details": map[string]any{
				"tool_name":         toolName,
				"session_id":        sessionID,
				"target_session_id": targetID,
				"scope":             scope,
				"policy_decision":   decision,
				"audit_id":          memoryToolAuditID(toolName, sessionID),
			},
			"recoverable": true,
		},
	})
}

func memoryToolMetadata(toolName, sessionID, targetID string, policy map[string]any, caller map[string]any) map[string]any {
	provenance := map[string]any{
		"source":            "gact_memory_tool",
		"tool_name":         toolName,
		"session_id":        sessionID,
		"target_session_id": targetID,
	}
	return map[string]any{
		"policy_decision": policy["decision"],
		"policy_scope":    policy["scope"],
		"audit_id":        memoryToolAuditID(toolName, sessionID),
		"caller":          caller,
		"provenance":      provenance,
	}
}

func memoryToolAuditID(toolName, sessionID string) string {
	base := strings.NewReplacer("/", "_", " ", "_").Replace(toolName + "_" + sessionID)
	return "memtool_" + base
}
