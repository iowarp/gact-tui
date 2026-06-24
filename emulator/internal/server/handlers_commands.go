package server

import (
	"net/http"
	"net/url"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/events"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// --- §6.13 Commands --------------------------------------------------------

func (s *Server) handleListCommands(w http.ResponseWriter, r *http.Request) {
	agentID := strings.TrimSpace(r.URL.Query().Get("agent_id"))
	plannerOnly := r.URL.Query().Get("planner") == "true"
	sessionID := strings.TrimSpace(r.URL.Query().Get("session_id"))
	rows := staticCommands()
	if s.cfg.LongCommands {
		rows = append(rows, staticLongPaletteCommands()...)
	}
	if sessionID != "" {
		if sess, err := s.store.GetSession(sessionID); err == nil {
			if blueprintID := stringFromAny(sess.Metadata["active_agent_blueprint_id"]); blueprintID != "" {
				rows = append(rows, staticAgentBlueprintPackagedCommands(blueprintID)...)
			}
		}
	}
	if agentID != "" || plannerOnly {
		filtered := make([]gact.Command, 0, len(rows))
		for _, row := range rows {
			if agentID != "" && row.AgentID != "" && row.AgentID != agentID {
				continue
			}
			if agentID != "" && row.AgentID == "" && row.Source != "builtin" {
				continue
			}
			if plannerOnly && (row.PlannerVisible == nil || !*row.PlannerVisible) {
				continue
			}
			filtered = append(filtered, row)
		}
		rows = filtered
	}
	writeJSON(w, http.StatusOK, map[string]any{"commands": rows})
}

// handleSessionCommand executes a slash-command against a session.
//
// For built-in commands we implement the side-effect directly:
//
//   - /clear — drop every message in the session and reset derived counters,
//     then emit a session.cleared event so the TUI can reload its view.
//   - /cancel — same effect as POST /v1/sessions/{id}/cancel: call the cancel
//     hook so the scenario engine halts any in-flight script and flip the
//     status to idle.
//   - /help — echo a short help message back as an assistant text part so
//     the user sees something beyond "command 204 OK".
//   - /undo, /diff — stub with an assistant message for discoverability;
//     the real apply/reject/undo flow is via the diff viewer (a/r keys).
//
// Unknown IDs return 404. Commands that legitimately take arguments but
// received none return 400. Everything else returns 204 so the client can
// ignore the response body.
func (s *Server) handleSessionCommand(w http.ResponseWriter, r *http.Request) {
	cmd := r.PathValue("cmd_id")
	cmd, _ = url.PathUnescape(cmd)
	sessionID := r.PathValue("id")

	known := false
	for _, c := range staticCommands() {
		if c.ID == cmd {
			known = true
			break
		}
	}
	if !known {
		writeError(w, http.StatusNotFound, "command_not_found", "no command "+cmd)
		return
	}

	if _, err := s.store.GetSession(sessionID); err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}

	switch cmd {
	case "/clear":
		n, err := s.store.ClearSessionMessages(sessionID)
		if err != nil {
			writeStoreError(w, err, "session_not_found", "invalid_session")
			return
		}
		// Non-standard but useful: emit a session.cleared event so the
		// TUI knows to drop its local message cache. SSE subscribers can
		// ignore unknown event types, so this is forward-compatible.
		s.bus.Publish(events.Event{
			Type:      "session.cleared",
			SessionID: sessionID,
			Payload: map[string]any{
				"session_id":       sessionID,
				"messages_cleared": n,
			},
		})
		// Emit a zeroed cost.updated so the TUI's footer meter drops
		// back to $0.0000 (0 in / 0 out) in lockstep with the message
		// wipe. Otherwise the meter stays at the pre-clear value until
		// the next assistant turn rolls in new totals.
		s.bus.Publish(events.Event{
			Type:      "cost.updated",
			SessionID: sessionID,
			Payload: map[string]any{
				"session_id": sessionID,
				"cost_usd":   0.0,
				"tokens":     gact.Tokens{},
			},
		})
		writeJSON(w, http.StatusOK, map[string]any{"messages_cleared": n})
		return

	case "/cancel":
		if s.cfg.CancelFailures {
			writeError(w, http.StatusBadGateway, "cancel_failed", "cancel failed: runtime supervisor did not acknowledge the request")
			return
		}
		if s.onCancel != nil {
			s.onCancel(sessionID)
		}
		if _, err := s.store.UpdateSession(sessionID, func(sess *gact.Session) {
			sess.Status = gact.StatusIdle
		}); err != nil {
			writeStoreError(w, err, "session_not_found", "invalid_session")
			return
		}
		s.bus.Publish(events.Event{
			Type:      "session.status_changed",
			SessionID: sessionID,
			Payload: map[string]any{
				"session_id": sessionID,
				"status":     gact.StatusIdle,
				"reason":     "cancelled",
			},
		})
		w.WriteHeader(http.StatusNoContent)
		return

	case "/help":
		s.emitAssistantNote(sessionID, helpCommandMessage())
		w.WriteHeader(http.StatusNoContent)
		return

	case "/diff":
		s.emitAssistantNote(sessionID,
			"No pending diffs. When a diff is active use `a` to apply or `r` to reject from the body pane.")
		w.WriteHeader(http.StatusNoContent)
		return

	case "/undo":
		s.emitAssistantNote(sessionID,
			"Undo not implemented in the emulator. Real backends expose it via /v1/diffs/:id/undo.")
		w.WriteHeader(http.StatusNoContent)
		return
	}

	// Every other built-in (e.g. /model, /agent, /add, /drop, /summarize)
	// requires arguments we don't parse here — record the invocation and
	// hand control back.
	w.WriteHeader(http.StatusNoContent)
}

// emitAssistantNote appends a single assistant-text message to a session so
// users see a visible response to a slash command beyond "204 OK". The part
// is emitted as a complete message (no streaming) so a single SSE cycle
// delivers everything subscribers need.
//
// Event shape matches the scenario engine's convention: message.created
// carries the Message struct directly as Payload (not wrapped), and
// message.part.added wraps {message_id, part} so the TUI's existing SSE
// handlers pick it up without changes.
func (s *Server) emitAssistantNote(sessionID, body string) {
	saved, err := s.store.AppendMessage(gact.Message{
		SessionID: sessionID,
		Role:      gact.RoleAssistant,
		Parts:     []gact.Part{gact.NewTextPart(body)},
	})
	if err != nil {
		return
	}

	s.bus.Publish(events.Event{
		Type:      "message.created",
		SessionID: sessionID,
		Payload:   saved,
	})
	// Also emit message.part.added for the single text part. Some clients
	// build their message view from part events rather than the message
	// snapshot, so both paths should deliver the body.
	if len(saved.Parts) > 0 {
		s.bus.Publish(events.Event{
			Type:      "message.part.added",
			SessionID: sessionID,
			Payload: map[string]any{
				"message_id": saved.ID,
				"part":       saved.Parts[0],
			},
		})
	}
	s.bus.Publish(events.Event{
		Type:      "message.completed",
		SessionID: sessionID,
		Payload: map[string]any{
			"message_id": saved.ID,
		},
	})
}

// helpCommandMessage returns the markdown body shown when a user runs
// /help. Kept out-of-line so it can be reused by tests.
func helpCommandMessage() string {
	return "**GACT slash commands**\n\n" +
		"- `/clear` — wipe the current session's messages\n" +
		"- `/cancel` — halt the current assistant turn\n" +
		"- `/diff` — show pending diffs (use `a`/`r` in the body pane)\n" +
		"- `/help` — this message\n" +
		"- `/undo` — revert the last assistant change (if backend supports it)\n" +
		"- `/model`, `/agent` — switch model/agent (use Settings via Ctrl+S for the picker)\n\n" +
		"**Input**: `Enter` sends, `Shift+Enter` / `\\<Enter>` inserts a newline."
}
