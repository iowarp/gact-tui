package server

import (
	"net/http"
	"strings"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/events"
	"github.com/JaimeCernuda/gact-tui/emulator/internal/store"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func (s *Server) handleListQuestions(w http.ResponseWriter, r *http.Request) {
	sid := r.PathValue("id")
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	questions, err := s.sessionQuestions(sid, status)
	if err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"questions": questions})
}

func (s *Server) handleCreateQuestion(w http.ResponseWriter, r *http.Request) {
	sid := r.PathValue("id")
	sess, err := s.store.GetSession(sid)
	if err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	var req gact.CreateUserQuestionRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	prompt := strings.TrimSpace(req.Prompt)
	if prompt == "" {
		writeError(w, http.StatusUnprocessableEntity, "bad_request", "missing required field: prompt")
		return
	}
	now := time.Now().UTC()
	q := gact.UserQuestion{
		ID:        "question_" + shortOpaqueID(sid, now),
		SessionID: sid,
		Prompt:    prompt,
		Status:    "pending",
		Kind:      firstNonEmptyString(req.Kind, "freeform"),
		Options:   append([]gact.UserQuestionOption(nil), req.Options...),
		CreatedAt: now,
		UpdatedAt: now,
		ExpiresAt: req.ExpiresAt,
		Source:    firstNonEmptyString(req.Source, "orchestrator"),
		TurnID:    req.TurnID,
		AttemptID: req.AttemptID,
		Metadata:  req.Metadata,
	}
	if q.Kind == "confirmation" && len(q.Options) == 0 {
		q.Options = []gact.UserQuestionOption{{Label: "Yes", Value: "yes"}, {Label: "No", Value: "no"}}
	}
	s.userQuestions[q.ID] = q
	_, _ = s.store.UpdateSession(sid, func(row *gact.Session) {
		row.Status = gact.StatusWaitingUser
		if row.Metadata == nil {
			row.Metadata = map[string]any{}
		}
		row.Metadata["pending_user_question_id"] = q.ID
	})
	s.bus.Publish(events.Event{Type: "session.status_changed", SessionID: sid, Payload: map[string]any{
		"session_id":  sid,
		"status":      gact.StatusWaitingUser,
		"prev_status": sess.Status,
	}})
	s.bus.Publish(events.Event{Type: "user_question.created", SessionID: sid, Payload: q})
	writeJSON(w, http.StatusCreated, q)
}

func (s *Server) handleAnswerQuestion(w http.ResponseWriter, r *http.Request) {
	sid := r.PathValue("id")
	qid := r.PathValue("question_id")
	var req gact.AnswerUserQuestionRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	q, err := s.findSessionQuestion(sid, qid)
	if err != nil {
		writeStoreError(w, err, "question_not_found", "invalid_question")
		return
	}
	q.Status = "answered"
	q.Answer = strings.TrimSpace(req.Answer)
	q.SelectedOptions = append([]string(nil), req.SelectedOptions...)
	if len(q.SelectedOptions) == 0 && req.ChoiceID != "" {
		q.SelectedOptions = []string{req.ChoiceID}
	}
	q.AnswerMetadata = req.Metadata
	q.UpdatedAt = time.Now().UTC()
	s.userQuestions[q.ID] = q

	text := "Answered question " + q.ID
	if q.Answer != "" {
		text += ": " + q.Answer
	} else if len(q.SelectedOptions) > 0 {
		text += ": " + strings.Join(q.SelectedOptions, ", ")
	}
	msg, err := s.store.AppendMessage(gact.Message{
		SessionID: sid,
		Role:      gact.RoleUser,
		Parts: []gact.Part{{
			Type: gact.PartTypeText,
			Text: text,
			Metadata: map[string]any{
				"question_id":      q.ID,
				"selected_options": q.SelectedOptions,
			},
		}},
		Metadata: map[string]any{"question_id": q.ID},
	})
	if err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	s.bus.Publish(events.Event{Type: "message.created", SessionID: sid, Payload: msg})
	_, _ = s.store.UpdateSession(sid, func(row *gact.Session) {
		row.Status = gact.StatusIdle
		if row.Metadata != nil {
			row.Metadata["pending_user_question_id"] = ""
		}
	})
	s.bus.Publish(events.Event{Type: "user_question.answered", SessionID: sid, Payload: q})
	writeJSON(w, http.StatusOK, q)
}

func (s *Server) handleCancelQuestion(w http.ResponseWriter, r *http.Request) {
	sid := r.PathValue("id")
	qid := r.PathValue("question_id")
	q, err := s.findSessionQuestion(sid, qid)
	if err != nil {
		writeStoreError(w, err, "question_not_found", "invalid_question")
		return
	}
	q.Status = "cancelled"
	q.UpdatedAt = time.Now().UTC()
	s.userQuestions[q.ID] = q
	_, _ = s.store.UpdateSession(sid, func(row *gact.Session) {
		row.Status = gact.StatusIdle
		if row.Metadata != nil {
			row.Metadata["pending_user_question_id"] = ""
		}
	})
	s.bus.Publish(events.Event{Type: "user_question.cancelled", SessionID: sid, Payload: q})
	writeJSON(w, http.StatusOK, q)
}

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

func (s *Server) sessionQuestions(sid, status string) ([]gact.UserQuestion, error) {
	msgs, _, err := s.store.ListMessages(store.MessageFilter{SessionID: sid, IncludeSystem: true})
	if err != nil {
		return nil, err
	}
	questions := make([]gact.UserQuestion, 0)
	seen := map[string]bool{}
	for _, q := range s.userQuestions {
		if q.SessionID != sid {
			continue
		}
		if status != "" && q.Status != status {
			continue
		}
		questions = append(questions, q)
		seen[q.ID] = true
	}
	for i := len(msgs) - 1; i >= 0; i-- {
		for _, part := range msgs[i].Parts {
			if part.Question == nil {
				continue
			}
			q := *part.Question
			if q.SessionID == "" {
				q.SessionID = sid
			}
			if q.MessageID == "" {
				q.MessageID = msgs[i].ID
			}
			if q.Status == "" {
				q.Status = "pending"
			}
			if seen[q.ID] {
				continue
			}
			if status != "" && q.Status != status {
				continue
			}
			questions = append(questions, q)
		}
	}
	return questions, nil
}

func (s *Server) findSessionQuestion(sid, qid string) (gact.UserQuestion, error) {
	questions, err := s.sessionQuestions(sid, "")
	if err != nil {
		return gact.UserQuestion{}, err
	}
	for _, q := range questions {
		if q.ID == qid {
			return q, nil
		}
	}
	return gact.UserQuestion{}, store.ErrNotFound
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

func shortOpaqueID(seed string, now time.Time) string {
	seed = strings.TrimPrefix(strings.TrimSpace(seed), "msg_")
	if len(seed) > 8 {
		seed = seed[:8]
	}
	if seed == "" {
		seed = "manual"
	}
	return seed + "_" + now.Format("150405")
}
