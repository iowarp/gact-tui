package scenario

import (
	"context"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/events"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// DefaultScript synthesizes a realistic-feeling assistant turn:
//  1. session.status_changed → running
//  2. Assistant message #1: thinking + text intro + tool_call
//  3. tool.call.started, optionally permission.requested → resolved
//  4. tool.call.completed
//  5. Tool message: tool_result
//  6. Assistant message #2: text response + finish (stop_reason)
//  7. session.status_changed → idle
//
// If the user message text contains a danger keyword (delete, rm, drop,
// truncate), the tool call requires permission. Otherwise it auto-allows.
func DefaultScript(ctx context.Context, e *Engine, sessionID, userMsgID string) {
	// Look at the user message to choose tool + permission behaviour.
	userMsg, err := e.store.GetMessage(userMsgID)
	if err != nil {
		return
	}
	userText := strings.ToLower(extractFirstText(userMsg))
	dangerous := containsAny(userText, "delete", "rm ", "drop ", "truncate")

	e.publishStatus(sessionID, gact.StatusRunning)

	// --- Assistant message #1 ----------------------------------------------
	asst, err := e.createAssistantMessage(sessionID)
	if err != nil {
		return
	}

	// Thinking
	thinking, err := e.addPart(sessionID, asst.ID, gact.NewThinkingPart(""))
	if err != nil {
		return
	}
	if err := e.streamText(ctx, sessionID, asst.ID, thinking.ID,
		"The user wants me to investigate. Let me consider tools that fit.\n",
		"thinking"); err != nil {
		return
	}
	e.completePart(sessionID, asst.ID, thinking.ID)
	if err := sleep(ctx, e.cfg.Timing.BetweenParts); err != nil {
		return
	}

	// Text intro
	intro, _ := e.addPart(sessionID, asst.ID, gact.NewTextPart(""))
	introText := "I'll take a look. First, I'm going to inspect the current state with a tool call."
	if err := e.streamText(ctx, sessionID, asst.ID, intro.ID, introText, "text"); err != nil {
		return
	}
	e.completePart(sessionID, asst.ID, intro.ID)
	if err := sleep(ctx, e.cfg.Timing.BetweenParts); err != nil {
		return
	}

	// Tool call
	callID := "call_" + asst.ID[len(asst.ID)-8:]
	toolName := "read_file"
	if dangerous {
		toolName = "shell"
	}
	toolPart, _ := e.addPart(sessionID, asst.ID, gact.NewToolCallPart(callID, toolName, nil))
	// Stream the input as a single chunk (input_json_append).
	toolInputRaw := `{"path":"main.go"}`
	if dangerous {
		toolInputRaw = `{"command":"rm -rf /tmp/scratch"}`
	}
	_, _ = e.store.UpdateMessagePart(asst.ID, toolPart.ID, func(p *gact.Part) {
		p.Input = map[string]any{}
	})
	e.bus.Publish(events.Event{
		Type:      "message.part.delta",
		SessionID: sessionID,
		Payload: map[string]any{
			"message_id": asst.ID,
			"part_id":    toolPart.ID,
			"delta":      map[string]any{"input_json_append": toolInputRaw},
		},
	})
	// Persist the parsed input.
	_, _ = e.store.UpdateMessagePart(asst.ID, toolPart.ID, func(p *gact.Part) {
		if dangerous {
			p.Input = map[string]any{"command": "rm -rf /tmp/scratch"}
		} else {
			p.Input = map[string]any{"path": "main.go"}
		}
	})
	e.completePart(sessionID, asst.ID, toolPart.ID)
	if err := sleep(ctx, e.cfg.Timing.BetweenParts); err != nil {
		return
	}

	// Tool execution lifecycle
	e.bus.Publish(events.Event{
		Type:      "tool.call.started",
		SessionID: sessionID,
		Payload: map[string]any{
			"call_id":   callID,
			"tool_name": toolName,
		},
	})

	if dangerous {
		// Request permission and wait.
		e.publishStatus(sessionID, gact.StatusWaitingPermission)
		req := e.perms.Create(gact.PermissionRequest{
			SessionID: sessionID,
			ToolCall: gact.PermissionToolCall{
				CallID:   callID,
				ToolName: toolName,
				Input:    map[string]any{"command": "rm -rf /tmp/scratch"},
				Annotations: gact.ToolAnnotations{
					DestructiveHint: true,
					OpenWorldHint:   false,
				},
			},
			Summary: "Run shell command: rm -rf /tmp/scratch",
		})
		e.bus.Publish(events.Event{
			Type:      "permission.requested",
			SessionID: sessionID,
			Payload:   req,
		})

		// Block until resolved or context cancelled. Watch both via a goroutine.
		resCh := make(chan struct{})
		var action gact.PermissionAction = gact.PermDeny
		go func() {
			action = e.perms.WaitFor(req.ID)
			close(resCh)
		}()
		select {
		case <-ctx.Done():
			return
		case <-resCh:
		}
		e.publishStatus(sessionID, gact.StatusRunning)

		if action == gact.PermDeny {
			// Tool denied. Emit tool result with error, then finish.
			e.bus.Publish(events.Event{
				Type:      "tool.call.completed",
				SessionID: sessionID,
				Payload: map[string]any{
					"call_id":  callID,
					"is_error": true,
				},
			})
			toolMsg, _ := e.store.AppendMessage(gact.Message{
				SessionID: sessionID,
				Role:      gact.RoleTool,
				Parts: []gact.Part{
					gact.NewToolResultPart(callID, []gact.Part{
						gact.NewTextPart("permission denied by user"),
					}, true),
				},
			})
			e.bus.Publish(events.Event{
				Type:      "message.created",
				SessionID: sessionID,
				Payload:   toolMsg,
			})
			finalMsg, _ := e.createAssistantMessage(sessionID)
			finalText, _ := e.addPart(sessionID, finalMsg.ID, gact.NewTextPart(""))
			_ = e.streamText(ctx, sessionID, finalMsg.ID, finalText.ID,
				"OK — I won't run that command. Let me know if you'd like to try something else.",
				"text")
			e.completePart(sessionID, finalMsg.ID, finalText.ID)
			e.completeMessage(sessionID, finalMsg.ID, gact.StopReasonPermissionDenied)
			e.publishStatus(sessionID, gact.StatusIdle)
			return
		}
	}

	// "Tool execution"
	if err := sleep(ctx, e.cfg.Timing.ToolThink); err != nil {
		return
	}
	e.bus.Publish(events.Event{
		Type:      "tool.call.completed",
		SessionID: sessionID,
		Payload: map[string]any{
			"call_id":  callID,
			"is_error": false,
		},
	})

	// Tool result message
	resultText := "package main\n\nfunc main() {\n\tprintln(\"hello\")\n}\n"
	if dangerous {
		resultText = "removed: /tmp/scratch (3 files, 2 dirs)"
	}
	toolMsg, _ := e.store.AppendMessage(gact.Message{
		SessionID: sessionID,
		Role:      gact.RoleTool,
		Parts: []gact.Part{
			gact.NewToolResultPart(callID, []gact.Part{
				gact.NewTextPart(resultText),
			}, false),
		},
	})
	e.bus.Publish(events.Event{
		Type:      "message.created",
		SessionID: sessionID,
		Payload:   toolMsg,
	})
	if err := sleep(ctx, e.cfg.Timing.BetweenParts); err != nil {
		return
	}

	// --- Assistant message #2 (final) --------------------------------------
	final, _ := e.createAssistantMessage(sessionID)
	finalP, _ := e.addPart(sessionID, final.ID, gact.NewTextPart(""))
	finalText := "**Done.** I read `main.go` and it's a small Go program — its `main` function just calls `println(\"hello\")`. A few things you might want next:\n\n- add a `package` doc comment\n- introduce a `cmd/` layout if this grows\n- wire `flag` for arguments\n\nWant me to start with one of those?"
	if dangerous {
		finalText = "**Removed.** Cleared `/tmp/scratch` (3 files, 2 dirs). Anything else?"
	}
	if err := e.streamText(ctx, sessionID, final.ID, finalP.ID, finalText, "text"); err != nil {
		return
	}
	e.completePart(sessionID, final.ID, finalP.ID)
	e.completeMessage(sessionID, final.ID, gact.StopReasonEndTurn)
	e.publishStatus(sessionID, gact.StatusIdle)
}

// extractFirstText returns the first text-bearing part's text, or "".
func extractFirstText(m *gact.Message) string {
	for _, p := range m.Parts {
		if p.Type == gact.PartTypeText && p.Text != "" {
			return p.Text
		}
	}
	return ""
}

func containsAny(s string, needles ...string) bool {
	for _, n := range needles {
		if strings.Contains(s, n) {
			return true
		}
	}
	return false
}
