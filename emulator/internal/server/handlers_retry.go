package server

import (
	"net/http"
	"strings"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/events"
	"github.com/JaimeCernuda/gact-tui/emulator/internal/store"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func (s *Server) handleListAttempts(w http.ResponseWriter, r *http.Request) {
	sid := r.PathValue("id")
	attempts, err := s.sessionAttempts(sid)
	if err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"attempts": attempts})
}

func (s *Server) handleRetryMessage(w http.ResponseWriter, r *http.Request) {
	sid := r.PathValue("id")
	mid := r.PathValue("msg_id")
	if _, err := s.store.GetMessage(mid); err != nil {
		writeStoreError(w, err, "message_not_found", "invalid_message")
		return
	}
	var req gact.RetryTurnRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	now := time.Now().UTC()
	attempt := gact.TurnAttempt{
		ID:                "attempt_" + shortOpaqueID(mid, now),
		SessionID:         sid,
		SourceMessageID:   mid,
		OriginalMessageID: mid,
		Status:            "queued",
		CreatedAt:         now,
		UpdatedAt:         now,
		Notes:             strings.TrimSpace(req.Notes),
		Model:             req.Model,
		Metadata:          req.Metadata,
	}
	if attempt.Model == nil && (strings.TrimSpace(req.ProviderID) != "" || strings.TrimSpace(req.ModelID) != "") {
		attempt.Model = &gact.ModelRef{ProviderID: strings.TrimSpace(req.ProviderID), ModelID: strings.TrimSpace(req.ModelID)}
	}
	if attempt.Model != nil && (strings.TrimSpace(attempt.Model.ProviderID) != "" || strings.TrimSpace(attempt.Model.ModelID) != "") {
		attempt.Warning = "Retrying with a different model may recompute provider-side KV cache and increase time-to-first-token, latency, and cost."
		if attempt.Metadata == nil {
			attempt.Metadata = map[string]any{}
		}
		attempt.Metadata["retry_mode"] = "model"
		attempt.Metadata["warning_ack"] = true
	}
	msg, err := s.store.AppendMessage(gact.Message{
		SessionID: sid,
		Role:      gact.RoleAssistant,
		Parts: []gact.Part{{
			Type:         gact.PartTypeRetryAttempt,
			Text:         attempt.Notes,
			RetryAttempt: &attempt,
		}},
		Metadata: map[string]any{
			"retry_attempt_id":        attempt.ID,
			"retry_source_message_id": mid,
		},
	})
	if err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	attempt.AttemptMessageID = msg.ID
	s.bus.Publish(events.Event{Type: "message.created", SessionID: sid, Payload: msg})
	writeJSON(w, http.StatusAccepted, attempt)
}

func (s *Server) sessionAttempts(sid string) ([]gact.TurnAttempt, error) {
	msgs, _, err := s.store.ListMessages(store.MessageFilter{SessionID: sid, IncludeSystem: true})
	if err != nil {
		return nil, err
	}
	attempts := make([]gact.TurnAttempt, 0)
	for i := len(msgs) - 1; i >= 0; i-- {
		for _, part := range msgs[i].Parts {
			if part.RetryAttempt == nil {
				continue
			}
			attempt := *part.RetryAttempt
			if attempt.SessionID == "" {
				attempt.SessionID = sid
			}
			if attempt.AttemptMessageID == "" {
				attempt.AttemptMessageID = msgs[i].ID
			}
			attempts = append(attempts, attempt)
		}
	}
	return attempts, nil
}
