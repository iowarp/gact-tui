package server

import (
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/store"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

const contextFrameInlineFileBudgetBytes int64 = 64 * 1024

// handleMemoryStats serves GET /v1/memory/stats (SPEC §6.19, v0.2 —
// CLIO-BBBBBBBBBB3). Used by the TUI to render a cache-hit-rate
// footer, per-session context-budget pressure, and global counters.
//
// The emulator has no real memory backend, so the numbers are
// synthesised: scenario code calls BumpMemoryHit / BumpMemoryMiss to
// nudge the counters, and session/invocation totals come from the
// store. A real backend would plug in ARC-style stats instead.
func (s *Server) handleMemoryStats(w http.ResponseWriter, r *http.Request) {
	if s.cfg.MemoryUnavailable {
		writeError(w, http.StatusNotImplemented, "memory_unavailable", "memory backend is unavailable in this emulator scenario")
		return
	}
	sessionID := r.URL.Query().Get("session_id")

	hits := int(atomic.LoadInt64(&s.memHits))
	misses := int(atomic.LoadInt64(&s.memMisses))
	total := hits + misses
	hitRate := 0.0
	if total > 0 {
		hitRate = float64(hits) / float64(total)
	}

	// Global counters — derived from the store.
	allSessions := s.store.ListSessions(store.SessionFilter{})
	invocationsTotal := 0
	for _, sess := range allSessions {
		invocationsTotal += sess.MessageCount
	}

	stats := gact.MemoryStats{
		Cache: gact.CacheStats{
			Hits:     hits,
			Misses:   misses,
			HitRate:  hitRate,
			Capacity: 1000,
		},
		Global: gact.GlobalMemoryStats{
			ConversationsTotal: len(allSessions),
			InvocationsTotal:   invocationsTotal,
		},
	}

	if sessionID != "" {
		if _, err := s.store.GetSession(sessionID); err == nil {
			msgs, _, _ := s.store.ListMessages(store.MessageFilter{
				SessionID: sessionID,
				Limit:     10000,
			})
			tokensRetained := 0
			for _, m := range msgs {
				tokensRetained += m.Tokens.Input + m.Tokens.Output
			}
			budget := 4000
			stats.Session = &gact.SessionMemoryStats{
				SessionID:        sessionID,
				MessagesRetained: len(msgs),
				TokensRetained:   tokensRetained,
				TokensBudget:     &budget,
				ProfilesAttached: 0,
			}
		}
	}

	writeJSON(w, http.StatusOK, stats)
}

func (s *Server) handleMemorySearch(w http.ResponseWriter, r *http.Request) {
	if s.cfg.MemoryUnavailable {
		writeError(w, http.StatusNotImplemented, "memory_unavailable", "memory backend is unavailable in this emulator scenario")
		return
	}
	q := r.URL.Query()
	query := strings.TrimSpace(q.Get("query"))
	sessionID := q.Get("session_id")
	workspaceID := q.Get("workspace_id")
	includeCross := q.Get("include_cross_session") == "true"
	limit := 20
	if raw := q.Get("limit"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			limit = parsed
		}
	}
	terms := memorySearchTerms(query)
	if len(terms) == 0 {
		writeError(w, http.StatusUnprocessableEntity, "invalid_request", "memory search requires query")
		return
	}
	if sessionID == "" && !includeCross {
		writeError(w, http.StatusUnprocessableEntity, "invalid_request", "set include_cross_session=true or pass session_id")
		return
	}
	if sessionID != "" {
		if _, err := s.store.GetSession(sessionID); err != nil {
			writeError(w, http.StatusNotFound, "not_found", "session not found: "+sessionID)
			return
		}
	}
	resp := s.memorySearchResponse(query, sessionID, workspaceID, includeCross, limit)
	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) memorySearchResponse(query, sessionID, workspaceID string, includeCross bool, limit int) gact.MemorySearchResponse {
	terms := memorySearchTerms(query)
	sessions := s.store.ListSessions(store.SessionFilter{})
	hits := make([]gact.MemorySearchHit, 0)
	searched := make([]string, 0)
	for _, sess := range sessions {
		if workspaceID != "" && sess.WorkspaceID != workspaceID {
			continue
		}
		if !includeCross && sessionID != "" && sess.ID != sessionID {
			continue
		}
		searched = append(searched, sess.ID)
		msgs, _, _ := s.store.ListMessages(store.MessageFilter{SessionID: sess.ID, Limit: 10000})
		for _, msg := range msgs {
			for _, part := range msg.Parts {
				text := strings.TrimSpace(part.Text)
				if text == "" {
					text = strings.TrimSpace(part.Summary)
				}
				matched := memoryMatchedTerms(text, terms)
				if len(matched) == 0 {
					continue
				}
				hits = append(hits, gact.MemorySearchHit{
					SessionID:    sess.ID,
					SessionTitle: sess.Title,
					WorkspaceID:  sess.WorkspaceID,
					MessageID:    msg.ID,
					PartID:       part.ID,
					Role:         string(msg.Role),
					CreatedAt:    msg.CreatedAt.Format(time.RFC3339),
					UpdatedAt:    msg.UpdatedAt.Format(time.RFC3339),
					Text:         memoryExcerpt(text, matched),
					Score:        float64(len(matched)) / float64(len(terms)),
					MatchTerms:   matched,
					Metadata: map[string]any{
						"source":        "gact_transcript",
						"cross_session": sess.ID != sessionID,
					},
				})
			}
		}
	}
	sort.SliceStable(hits, func(i, j int) bool {
		if hits[i].Score != hits[j].Score {
			return hits[i].Score > hits[j].Score
		}
		return hits[i].CreatedAt > hits[j].CreatedAt
	})
	if len(hits) > limit {
		hits = hits[:limit]
	}
	scope := "session"
	if includeCross {
		scope = "current_workspace"
	}
	return gact.MemorySearchResponse{
		Query:               query,
		IncludeCrossSession: includeCross,
		SearchedSessions:    searched,
		Hits:                hits,
		Metadata: map[string]any{
			"scope": scope,
		},
	}
}

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

func memorySearchTerms(query string) []string {
	fields := strings.Fields(strings.ToLower(query))
	out := make([]string, 0, len(fields))
	seen := map[string]bool{}
	for _, field := range fields {
		field = strings.Trim(field, ".,:;!?()[]{}\"'")
		if len(field) < 3 || seen[field] {
			continue
		}
		seen[field] = true
		out = append(out, field)
	}
	return out
}

func memoryMatchedTerms(text string, terms []string) []string {
	lower := strings.ToLower(text)
	out := make([]string, 0, len(terms))
	for _, term := range terms {
		if strings.Contains(lower, term) {
			out = append(out, term)
		}
	}
	return out
}

func memoryExcerpt(text string, matched []string) string {
	text = strings.Join(strings.Fields(text), " ")
	if len(text) <= 240 {
		return text
	}
	lower := strings.ToLower(text)
	idx := -1
	for _, term := range matched {
		if pos := strings.Index(lower, term); pos >= 0 {
			idx = pos
			break
		}
	}
	if idx < 0 {
		return text[:240] + "..."
	}
	start := idx - 80
	if start < 0 {
		start = 0
	}
	end := start + 240
	if end > len(text) {
		end = len(text)
		start = max(0, end-240)
	}
	prefix := ""
	if start > 0 {
		prefix = "..."
	}
	suffix := ""
	if end < len(text) {
		suffix = "..."
	}
	return prefix + text[start:end] + suffix
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

func (s *Server) memorySessionSummary(sessionID string) (map[string]any, error) {
	sess, err := s.store.GetSession(sessionID)
	if err != nil {
		return nil, err
	}
	msgs, _, err := s.store.ListMessages(store.MessageFilter{SessionID: sessionID, Limit: 10000, IncludeSystem: true})
	if err != nil {
		return nil, err
	}
	recent := make([]map[string]any, 0, min(5, len(msgs)))
	for i := len(msgs) - 1; i >= 0 && len(recent) < 5; i-- {
		msg := msgs[i]
		text := memoryExcerpt(messageTextForFrame(msg), nil)
		if strings.TrimSpace(text) == "" {
			continue
		}
		recent = append(recent, map[string]any{
			"message_id": msg.ID,
			"role":       msg.Role,
			"created_at": msg.CreatedAt.Format(time.RFC3339),
			"excerpt":    text,
		})
	}
	ids := make([]string, 0, len(msgs))
	for _, msg := range msgs {
		ids = append(ids, msg.ID)
	}
	return map[string]any{
		"session_id":          sess.ID,
		"title":               sess.Title,
		"workspace_id":        sess.WorkspaceID,
		"status":              sess.Status,
		"created_at":          sess.CreatedAt.Format(time.RFC3339),
		"updated_at":          sess.UpdatedAt.Format(time.RFC3339),
		"message_count":       len(msgs),
		"visible_message_ids": ids,
		"recent_excerpts":     recent,
		"metadata": map[string]any{
			"source":                  "gact_visible_transcript_summary",
			"raw_transcript_included": false,
			"excerpt_limit":           len(recent),
		},
	}, nil
}

func (s *Server) latestContextFrame(sessionID string, limit int) (map[string]any, error) {
	sess, err := s.store.GetSession(sessionID)
	if err != nil {
		return nil, err
	}
	msgs, _, err := s.store.ListMessages(store.MessageFilter{
		SessionID:     sessionID,
		Limit:         limit,
		IncludeSystem: true,
	})
	if err != nil {
		return nil, err
	}
	files := s.contextFiles.get(sessionID)
	items := make([]map[string]any, 0, len(msgs)+len(files))
	for i := len(msgs) - 1; i >= 0; i-- {
		msg := msgs[i]
		items = append(items, map[string]any{
			"kind":             "message",
			"source_id":        msg.ID,
			"role":             msg.Role,
			"included":         true,
			"reason":           "visible_transcript",
			"tokens_estimated": max(1, len(messageTextForFrame(msg))/4),
			"metadata":         map[string]any{"part_count": len(msg.Parts)},
		})
	}
	for _, file := range files {
		items = append(items, contextFileFrameItem(file))
	}
	now := time.Now().UTC().Format(time.RFC3339)
	return map[string]any{
		"id":                   "ctx_emulator_latest",
		"session_id":           sessionID,
		"turn_id":              latestMessageID(msgs),
		"user_message_id":      latestMessageID(msgs),
		"created_at":           now,
		"updated_at":           now,
		"status":               "completed",
		"model":                sess.Model,
		"agent":                sess.Agent,
		"prompt":               map[string]any{"profile": "default", "source": "emulator"},
		"items":                items,
		"tokens_estimated":     contextFrameTokenTotal(items),
		"metadata":             map[string]any{"retained_context_source": "visible_gact_transcript"},
		"assistant_message_id": latestAssistantMessageID(msgs),
	}, nil
}

func contextFileFrameItem(file gact.ContextFile) map[string]any {
	included := true
	reason := "attached_context_file"
	tokens := max(1, int(file.Size)/4)
	if file.Size > contextFrameInlineFileBudgetBytes {
		included = false
		reason = "context_file_excluded_too_large"
		tokens = 0
	}
	return map[string]any{
		"kind":             "context_file",
		"source_id":        file.Path,
		"path":             file.Path,
		"display_path":     file.Path,
		"included":         included,
		"reason":           reason,
		"tokens_estimated": tokens,
		"metadata": map[string]any{
			"mode":                file.Mode,
			"language":            file.Language,
			"size_bytes":          file.Size,
			"inline_budget_bytes": contextFrameInlineFileBudgetBytes,
		},
	}
}

func contextFrameItemsFromMap(frame map[string]any) []map[string]any {
	raw, _ := frame["items"].([]map[string]any)
	return raw
}

// BumpMemoryHit / BumpMemoryMiss nudge the synthetic cache counters
// so /v1/memory/stats has realistic-looking numbers without a real
// cache backend. Called from scenario code + anywhere a tool result
// could plausibly be cached.
func (s *Server) BumpMemoryHit()  { atomic.AddInt64(&s.memHits, 1) }
func (s *Server) BumpMemoryMiss() { atomic.AddInt64(&s.memMisses, 1) }
