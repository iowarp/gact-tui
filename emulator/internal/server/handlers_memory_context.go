package server

import (
	"strings"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/store"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

const contextFrameInlineFileBudgetBytes int64 = 64 * 1024

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
