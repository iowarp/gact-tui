package ui

// live_events.go is the entry point for applying SSE events (single and batched) to the conversation.

import (
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// applySSE folds an incoming event into local state.
//
// SSE wire shape (per emulator's writeSSE): the data: line is a JSON object
// with top-level {type, occurred_at, payload}. The payload subobject carries
// the actual event data, so handlers must read e.Payload["payload"][...].
func (c *conversationComponent) applySSE(e client.SSEEvent) {
	if c.app.audit != nil {
		c.app.audit.RecordReceived("sse."+firstNonEmpty(e.Type, "event"), e)
		defer c.app.audit.RecordReceived("state.after_sse", map[string]any{
			"session_id":     c.app.session.currentID(),
			"event_type":     e.Type,
			"messages":       auditMessageStateSummary(c.messages),
			"current_status": c.app.session.currentStatus,
		})
	}
	c.app.execution.recordSSE(e)
	pl, _ := e.Payload["payload"].(map[string]any)
	switch e.Type {
	case "message.created":
		c.applyMessageCreated(e)
	case "message.part.added":
		c.applyPartAdded(e)
	case "message.part.delta":
		c.applyPartDelta(e)
	case "message.part.completed":
		c.applyPartCompleted(e)
	case "message.completed":
		// Final part-state already in store; the assistant turn is done.
		// CLIO embeds tokens + cost_usd in the completed payload, but
		// doesn't emit a dedicated cost.updated event — promote those
		// fields into the cost-updated path so the footer's $ meter
		// catches up live without waiting for a session reload.
		c.applyMessageCompleted(e)
		c.applyCostUpdated(e)
		c.settleTerminalMessageCompletion(e)
	case "session.status_changed":
		if pl != nil {
			v, _ := pl["status"].(string)
			if v != "" {
				targetSID, _ := pl["session_id"].(string)
				if targetSID == "" {
					targetSID = c.app.session.currentID()
				}
				if c.shouldIgnoreStatusReplay(targetSID, v, e) {
					return
				}
				// Mirror into c.app.session.sessions so the sidebar status dots match
				// reality. Events can arrive for the currently-selected
				// session OR for a sibling (a subagent running elsewhere),
				// so key on session_id from the payload.
				c.app.session.updateSessionStatus(targetSID, v)
				if targetSID == c.app.session.currentID() {
					c.app.session.setCurrentStatus(v)
				}
			}
		}
	case "user_question.created":
		c.app.askUser.applyUserQuestionCreated(e)
	case "user_question.answered", "user_question.cancelled", "user_question.expired":
		c.app.askUser.applyUserQuestionResolved(e)
	case "permission.requested":
		c.applyPermissionRequested(e)
	case "permission.resolved":
		c.applyPermissionResolved(e)
	case "semantic.event":
		c.applySemanticEvent(e)
	case "tool.call.started":
		c.applyToolCallStarted(e)
	case "tool.call.completed":
		c.applyToolCallCompleted(e)
	case "subagent.started", "subagent.completed":
		// Refresh sidebar so the new subsession appears (or its status updates).
		c.app.sidebar.markPendingRefresh()
	case "cost.updated":
		c.applyCostUpdated(e)
	case "notification":
		// MMM1: backend-pushed banner-worthy message. Surface as a
		// transient hint with the level prefixed, so the user sees
		// "info: MCP connection reconnected" / "warning: ..." in the
		// reserved hint row above the input. Best-effort — payload
		// is structured but optional fields can be missing.
		if pl != nil {
			level, _ := pl["level"].(string)
			title, _ := pl["title"].(string)
			body, _ := pl["body"].(string)
			if level == "" {
				level = "info"
			}
			title = operatorNotificationTitle(title)
			text := level + ": " + title
			if body != "" {
				text += " — " + body
			}
			c.app.setHint(text)
		}
	case "session.cleared":
		// /clear wiped the backend's messages for this session — drop
		// the local cache so the conversation pane matches. The event
		// carries session_id so we can ignore hits for other sessions.
		if pl != nil {
			sid, _ := pl["session_id"].(string)
			if sid != "" && sid == c.app.session.currentID() {
				c.clearMessages()
				c.scrollOffset = 0
				c.stickyToBottom = true
				// Reload to be safe — the SSE ring may have stale
				// replay events the emulator hasn't pruned, and a
				// fresh ListMessages is the source of truth.
				c.app.sidebar.markPendingReload()
			}
		}
	}
}

func (c *conversationComponent) applySSEBatch(events []client.SSEEvent) tea.Cmd {
	if len(events) == 0 {
		return waitForSSE(c.app.connection.sseEvents, c.app.connection.sseErrs)
	}
	// Event arrival means the stream is healthy — reset the reconnect backoff
	// so the NEXT disconnect waits 250 ms, not whatever the attempts counter
	// had climbed to.
	c.app.connection.sseBackoffAttempts = 0
	c.app.connection.sseDownSince = time.Time{} // DDDDD1: clear outage clock

	prevRunning := c.app.session.anyRunning()
	prevStatus := c.app.session.currentStatus
	for _, event := range events {
		// Track the highest SeqID we've processed so a reconnect can resume via
		// Last-Event-ID rather than silently dropping events published during an
		// outage. Monotonic under normal operation; max() guards against a late
		// replay event dragging us backwards.
		if seq := event.SeqID(); seq > c.app.connection.lastSeenSeqID {
			c.app.connection.lastSeenSeqID = seq
		}
		if seq := event.SeqID(); seq > 0 {
			if sid := c.eventSessionID(event); sid != "" {
				if c.app.connection.lastSeenSeqIDBySession == nil {
					c.app.connection.lastSeenSeqIDBySession = map[string]uint64{}
				}
				if seq > c.app.connection.lastSeenSeqIDBySession[sid] {
					c.app.connection.lastSeenSeqIDBySession[sid] = seq
				}
			}
		}
		c.applySSE(event)
	}
	if c.app.sidebar.hasEnabledModule(sidebarModuleFiles) {
		c.app.fileViewer.refreshFromWorkspace()
	}
	cmds := []tea.Cmd{waitForSSE(c.app.connection.sseEvents, c.app.connection.sseErrs)}
	// CLIO-BBBBBBBBBB4 (v0.2 §6.19): when a turn just settled back to idle
	// AND the backend has memory, refresh the cache stats. Piggy-backs on the
	// status_changed event loop — one fetch per turn completion, no extra
	// polling.
	if c.app.session.caps.Capabilities.Memory &&
		prevStatus != c.app.session.currentStatus && c.app.session.currentStatus == gact.StatusIdle {
		cmds = append(cmds, memoryStatsScopedCmd(c.app.c, c.app.session.runtimeScope()))
	}
	if c.app.sidebar.pendingSidebarRefresh && c.app.session.wsID != "" {
		c.app.sidebar.takePendingRefresh()
		cmds = append(cmds, reloadSessionsCmd(c.app.c, c.app.session.wsID))
	}
	if c.app.sidebar.takePendingReload() {
		if sid := c.app.session.currentID(); sid != "" {
			cmds = append(cmds, loadMessagesCmd(c.app.c, sid))
		}
	}
	// Restart the spinner loop if this batch flipped a session into a running
	// state. The spinnerTickMsg handler drains itself when nothing's running.
	if !prevRunning && c.app.session.anyRunning() {
		cmds = append(cmds, spinnerCmd())
	}
	return tea.Batch(cmds...)
}

func auditMessageStateSummary(messages []gact.Message) []map[string]any {
	out := make([]map[string]any, 0, len(messages))
	for _, msg := range messages {
		row := map[string]any{
			"id":         msg.ID,
			"role":       msg.Role,
			"part_count": len(msg.Parts),
		}
		if len(msg.Parts) > 0 {
			part := msg.Parts[len(msg.Parts)-1]
			row["last_part"] = map[string]any{
				"id":            part.ID,
				"type":          part.Type,
				"text_len":      len(part.Text),
				"call_id":       part.CallID,
				"tool_name":     part.ToolName,
				"metadata_keys": sortedAnyMapKeys(part.Metadata),
			}
		}
		out = append(out, row)
	}
	return out
}
