package server

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/events"
	"github.com/JaimeCernuda/gact-tui/emulator/internal/store"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// PostMessageRequest is the body for POST /v1/sessions/{id}/messages (SPEC §6.3).
type PostMessageRequest struct {
	Parts   []gact.Part    `json:"parts"`
	Model   *gact.ModelRef `json:"model,omitempty"`
	AgentID string         `json:"agent_id,omitempty"`
}

// PostMessageResponse is the body returned from a 202-accepted POST.
type PostMessageResponse struct {
	MessageID  string    `json:"message_id"`
	AcceptedAt time.Time `json:"accepted_at"`
}

// ListMessagesResponse is the body for GET /v1/sessions/{id}/messages.
type ListMessagesResponse struct {
	Messages   []gact.Message `json:"messages"`
	NextCursor string         `json:"next_cursor,omitempty"`
}

// SearchMatch is one hit from message search (SPEC §6.3).
type SearchMatch struct {
	MessageID string    `json:"message_id"`
	PartID    string    `json:"part_id"`
	Snippet   string    `json:"snippet"`
	Score     float64   `json:"score"`
	CreatedAt time.Time `json:"created_at"`
}

// SearchResponse is the body for GET /v1/sessions/{id}/messages/search.
type SearchResponse struct {
	Matches    []SearchMatch `json:"matches"`
	NextCursor string        `json:"next_cursor,omitempty"`
}

func (s *Server) handleListMessages(w http.ResponseWriter, r *http.Request) {
	sid := r.PathValue("id")
	q := r.URL.Query()
	// SPEC §6.3: all query params optional. Omitting `limit` yields the historical
	// full-ledger (no truncation, next_cursor null). A PRESENT `limit` must be a
	// positive integer — `<=0` (or non-numeric) is 422 validation_error, matching
	// clio (routes/messages.py). Absent → 0 = "no limit" to the store.
	limit := 0
	if raw := q.Get("limit"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n <= 0 {
			writeError(w, http.StatusUnprocessableEntity, "validation_error", "limit must be a positive integer")
			return
		}
		limit = n
	}
	// include_system defaults to true; only an explicit `false` drops system rows.
	// A present-but-unparseable value is 422 (clio's FastAPI bool coercion rejects
	// it too) — do NOT silently coerce garbage to false via the lenient parseBool.
	includeSystem := true
	if raw := q.Get("include_system"); raw != "" {
		v, err := strconv.ParseBool(raw)
		if err != nil {
			writeError(w, http.StatusUnprocessableEntity, "validation_error", "include_system must be a boolean")
			return
		}
		includeSystem = v
	}
	msgs, next, err := s.store.ListMessages(store.MessageFilter{
		SessionID:     sid,
		Before:        q.Get("before"),
		Limit:         limit,
		IncludeSystem: includeSystem,
	})
	if err != nil {
		// An unknown session OR an unknown `before` cursor is a 404 (SPEC §6.3:
		// "unknown id → 404", like GET a single message); a malformed query is 422.
		writeStoreError(w, err, "not_found", "validation_error")
		return
	}
	writeJSON(w, http.StatusOK, ListMessagesResponse{Messages: msgs, NextCursor: next})
}

func (s *Server) handleGetMessage(w http.ResponseWriter, r *http.Request) {
	mid := r.PathValue("msg_id")
	m, err := s.store.GetMessage(mid)
	if err != nil {
		writeStoreError(w, err, "message_not_found", "invalid_message")
		return
	}
	writeJSON(w, http.StatusOK, m)
}

func (s *Server) handlePostMessage(w http.ResponseWriter, r *http.Request) {
	sid := r.PathValue("id")
	var req PostMessageRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if len(req.Parts) == 0 {
		writeError(w, http.StatusBadRequest, "invalid_body", "parts must be non-empty")
		return
	}
	now := time.Now().UTC()
	metadata := map[string]any{}
	if agentID := strings.TrimSpace(req.AgentID); agentID != "" {
		metadata["requested_agent_id"] = agentID
		metadata["effective_agent_id"] = agentID
	}
	user, err := s.store.AppendMessage(gact.Message{
		SessionID: sid,
		Role:      gact.RoleUser,
		Parts:     req.Parts,
		Model:     req.Model,
		Metadata:  metadata,
	})
	if err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	// Notify the rest of the system: a user message was created. The
	// scenario engine listens for these and produces an assistant response.
	s.bus.Publish(events.Event{
		Type:      "message.created",
		SessionID: sid,
		Payload:   user,
	})

	// Hook for scenario engines. This indirection lets a test or cmd swap
	// behavior without touching the handler. A nil handler is a no-op (the
	// emulator just stores the user message and returns 202).
	if s.onUserMessage != nil {
		s.onUserMessage(sid, user.ID)
	}

	writeJSON(w, http.StatusAccepted, PostMessageResponse{
		MessageID:  user.ID,
		AcceptedAt: now,
	})
}

func (s *Server) handleDeleteMessage(w http.ResponseWriter, r *http.Request) {
	mid := r.PathValue("msg_id")
	if err := s.store.DeleteMessage(mid); err != nil {
		writeStoreError(w, err, "message_not_found", "invalid_message")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// PatchPartRequest mirrors the Part shape, with all fields optional.
// Applied as a sparse update — non-zero fields overwrite, zero fields are
// left alone. (For maps and slices, "non-zero" means non-nil.)
type PatchPartRequest struct {
	Metadata    map[string]any `json:"metadata,omitempty"`
	Text        string         `json:"text,omitempty"`
	Thinking    string         `json:"thinking,omitempty"`
	Signature   string         `json:"signature,omitempty"`
	Input       map[string]any `json:"input,omitempty"`
	Annotations any            `json:"annotations,omitempty"`
	IsError     *bool          `json:"is_error,omitempty"`
	Summary     string         `json:"summary,omitempty"`
	Applied     *bool          `json:"applied,omitempty"`
}

func (s *Server) handlePatchPart(w http.ResponseWriter, r *http.Request) {
	mid := r.PathValue("msg_id")
	pid := r.PathValue("part_id")
	var req PatchPartRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	updated, err := s.store.UpdateMessagePart(mid, pid, func(p *gact.Part) {
		if req.Metadata != nil {
			p.Metadata = req.Metadata
		}
		if req.Text != "" {
			p.Text = req.Text
		}
		if req.Thinking != "" {
			p.Thinking = req.Thinking
		}
		if req.Signature != "" {
			p.Signature = req.Signature
		}
		if req.Input != nil {
			p.Input = req.Input
		}
		if req.Annotations != nil {
			p.Annotations = req.Annotations
		}
		if req.IsError != nil {
			p.IsError = *req.IsError
		}
		if req.Summary != "" {
			p.Summary = req.Summary
		}
		if req.Applied != nil {
			p.Applied = *req.Applied
		}
	})
	if err != nil {
		writeStoreError(w, err, "message_not_found", "invalid_part")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (s *Server) handleSearchMessages(w http.ResponseWriter, r *http.Request) {
	sid := r.PathValue("id")
	q := r.URL.Query().Get("q")
	if q == "" {
		writeError(w, http.StatusBadRequest, "invalid_query", "q is required")
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 {
		limit = 50
	}
	msgs, _, err := s.store.ListMessages(store.MessageFilter{
		SessionID:     sid,
		Limit:         100000, // search whole session
		IncludeSystem: true,
	})
	if err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_query")
		return
	}
	needle := strings.ToLower(q)
	matches := make([]SearchMatch, 0)
	for _, m := range msgs {
		for _, p := range m.Parts {
			text := partSearchText(p)
			if text == "" {
				continue
			}
			lower := strings.ToLower(text)
			idx := strings.Index(lower, needle)
			if idx < 0 {
				continue
			}
			matches = append(matches, SearchMatch{
				MessageID: m.ID,
				PartID:    p.ID,
				Snippet:   makeSnippet(text, idx, len(q)),
				Score:     1.0, // simple binary relevance; backend can do better
				CreatedAt: m.CreatedAt,
			})
			if len(matches) >= limit {
				break
			}
		}
		if len(matches) >= limit {
			break
		}
	}
	writeJSON(w, http.StatusOK, SearchResponse{Matches: matches})
}

// partSearchText returns the searchable text content of a part. Returns ""
// for parts without textual content.
func partSearchText(p gact.Part) string {
	switch p.Type {
	case gact.PartTypeText, gact.PartTypeCitation:
		return p.Text
	case gact.PartTypeThinking:
		return p.Thinking
	case gact.PartTypeError:
		return p.Code + ": " + p.Message
	case gact.PartTypeSubagentResult, gact.PartTypeCompaction:
		return p.Summary
	case gact.PartTypeResourceLink:
		return p.Name + " " + p.Description + " " + p.URI
	default:
		return ""
	}
}

// makeSnippet returns a substring around the match with up to ~30 chars on
// each side. Newlines are collapsed to spaces.
func makeSnippet(text string, idx, qlen int) string {
	const radius = 30
	start := idx - radius
	if start < 0 {
		start = 0
	}
	end := idx + qlen + radius
	if end > len(text) {
		end = len(text)
	}
	snip := text[start:end]
	snip = strings.ReplaceAll(snip, "\n", " ")
	if start > 0 {
		snip = "…" + snip
	}
	if end < len(text) {
		snip = snip + "…"
	}
	return snip
}
