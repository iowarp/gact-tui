package scenario

import (
	"context"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/events"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// QQQQQQQQ1: variants for the default happy-path so repeated
// "read main.go" prompts produce visibly different output.
// Cycled per-session via NextCallIndex (same pattern PPPPP1 + GGGGG1
// + RRRRR1 already use). Length parity is intentional — three of
// each, lined up so [i] of every slice forms a coherent turn.
var defaultThinkingVariants = []string{
	"The user wants me to investigate. Let me consider tools that fit.\n",
	"Let me start by reading the file so I can ground my response in what's actually there.\n",
	"Quick context-gather first — I'll inspect main.go before commenting.\n",
}

var defaultIntroVariants = []string{
	"I'll take a look. First, I'm going to inspect the current state with a tool call.",
	"Let me peek at the file before I say anything substantive.",
	"Reading the source now so my advice is based on what's actually there.",
}

var defaultResultVariants = []string{
	"package main\n\nfunc main() {\n\tprintln(\"hello\")\n}\n",
	"package main\n\nimport \"fmt\"\n\nfunc main() {\n\tfmt.Println(\"hello, world\")\n}\n",
	"package main\n\nimport (\n\t\"fmt\"\n\t\"os\"\n)\n\nfunc main() {\n\tname := \"world\"\n\tif len(os.Args) > 1 {\n\t\tname = os.Args[1]\n\t}\n\tfmt.Printf(\"hello, %s\\n\", name)\n}\n",
}

var defaultFinalVariants = []string{
	"**Done.** I read `main.go` and it's a small Go program — its `main` function just calls `println(\"hello\")`. A few things you might want next:\n\n- add a `package` doc comment\n- introduce a `cmd/` layout if this grows\n- wire `flag` for arguments\n\nWant me to start with one of those?",
	"**Done.** It's a one-file program that uses `fmt.Println` to print `hello, world`. If you'd like to extend it, common next steps are:\n\n- factor out a small `greet()` function so it's testable\n- add a `go.mod` if you don't have one yet\n- consider where logs/errors should go (stderr is the convention)\n\nWhich direction interests you?",
	"**Done.** It already takes a positional CLI arg and falls back to \"world\" — slightly more capable than I expected. Sensible next steps would be:\n\n- introduce `flag` so `-name=alice` reads more naturally than positional args\n- write a quick test for the arg-parsing branch\n- add a `--version` flag once you tag a release\n\nHappy to wire any of those.",
}

// DefaultScript synthesizes a realistic-feeling assistant turn:
//  1. session.status_changed → running
//  2. Assistant message #1: thinking + text intro + tool_call
//  3. tool.call.started, optionally permission.requested → resolved
//  4. tool.call.completed
//  5. Tool message: tool_result
//  6. Assistant message #2: text response + finish (stop_reason)
//  7. session.status_changed → idle
//
// Triggers:
//   - "delete" / "rm " / "drop " / "truncate" → permission flow
//   - "split" / "with help" / "subagent"      → spawn a subagent inline
//   - "long" / "explain" / "writeup"          → long assistant message (~60 lines)
//   - "log" / "dump" / "traceback" / "logs"   → large tool output (~80 lines)
//   - "many tools" / "multi tool"             → sequence of 3 tool calls
func DefaultScript(ctx context.Context, e *Engine, sessionID, userMsgID string) {
	userMsg, err := e.store.GetMessage(userMsgID)
	if err != nil {
		return
	}
	userText := strings.ToLower(extractFirstText(userMsg))
	dangerous := containsAny(userText, "delete", "rm ", "drop ", "truncate")
	wantsSubagent := containsAny(userText, "split", "with help", "subagent")
	wantsDiff := containsAny(userText, " diff", " edit", " patch", "propose")
	wantsLong := containsAny(userText, "long", "explain", "writeup")
	wantsBigTool := containsAny(userText, "log", "dump", "traceback", "logs")
	wantsMultiTool := containsAny(userText, "many tools", "multi tool")
	// CLIO-BBBBBBBBBB3: v0.2 routing demo — triggers the script that
	// emits a routing_decision part + session.agent_routed event.
	wantsRouting := containsAny(userText,
		"route this", "pick an agent", "agent routing",
		"analyze", "profile", "inspect",
		"refactor", "review",
		"search the web", "look up", "research")

	// Subagent path takes precedence and demonstrates the multi-agent flow.
	if wantsSubagent {
		runSubagentScript(ctx, e, sessionID, userMsg)
		return
	}
	if wantsDiff {
		runDiffScript(ctx, e, sessionID, userMsg)
		return
	}
	if wantsLong {
		runLongScript(ctx, e, sessionID, userMsg)
		return
	}
	if wantsBigTool {
		runBigToolScript(ctx, e, sessionID, userMsg)
		return
	}
	if wantsMultiTool {
		runMultiToolScript(ctx, e, sessionID, userMsg)
		return
	}
	if wantsRouting {
		runRoutingScript(ctx, e, sessionID, userMsg)
		return
	}

	e.publishStatus(sessionID, gact.StatusRunning)

	// CLIO-BBBBBBBBBB4: every default-script turn counts as a single
	// cache lookup (miss on first turn, hit on subsequent repeated
	// queries) so /v1/memory/stats has something to chart. Real
	// backends will have genuine hit/miss bookkeeping; this keeps
	// the emulator's footer chip non-zero.
	if e.NextCallIndex(sessionID, "default_cache_seed") == 0 {
		e.NoteMemoryMiss()
	} else {
		e.NoteMemoryHit()
	}

	// QQQQQQQQ1: pick variant index once per turn so all four
	// strings (thinking, intro, result, final) line up — gives the
	// turn a coherent "voice" instead of mixing-and-matching.
	// Dangerous path uses the existing single string; only the
	// happy path varies (it's the one the user actually replays).
	variantIdx := e.NextCallIndex(sessionID, "default") % len(defaultThinkingVariants)

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
		defaultThinkingVariants[variantIdx],
		"thinking"); err != nil {
		return
	}
	e.completePart(sessionID, asst.ID, thinking.ID)
	if err := sleep(ctx, e.cfg.Timing.BetweenParts); err != nil {
		return
	}

	// Text intro
	intro, err := e.addPart(sessionID, asst.ID, gact.NewTextPart(""))
	if err != nil {
		return
	}
	introText := defaultIntroVariants[variantIdx]
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
	toolPart, err := e.addPart(sessionID, asst.ID, gact.NewToolCallPart(callID, toolName, nil))
	if err != nil {
		return
	}
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
			toolMsg, terr := e.store.AppendMessage(gact.Message{
				SessionID: sessionID,
				Role:      gact.RoleTool,
				Parts: []gact.Part{
					gact.NewToolResultPart(callID, []gact.Part{
						gact.NewTextPart("permission denied by user"),
					}, true),
				},
			})
			if terr != nil {
				return
			}
			e.bus.Publish(events.Event{
				Type:      "message.created",
				SessionID: sessionID,
				Payload:   toolMsg,
			})
			finalMsg, ferr := e.createAssistantMessage(sessionID)
			if ferr != nil {
				return
			}
			finalText, fterr := e.addPart(sessionID, finalMsg.ID, gact.NewTextPart(""))
			if fterr != nil {
				return
			}
			_ = e.streamText(ctx, sessionID, finalMsg.ID, finalText.ID,
				"OK — I won't run that command. Let me know if you'd like to try something else.",
				"text")
			e.completePart(sessionID, finalMsg.ID, finalText.ID)
			e.completeMessage(sessionID, finalMsg.ID, gact.StopReasonPermissionDenied)
			e.publishStatus(sessionID, gact.StatusIdle)
			return
		}
	}

	// Charge for the pre-tool-call assistant message now that it's
	// fully assembled. completeMessage handles cost.updated emission.
	e.completeMessage(sessionID, asst.ID, gact.StopReasonToolUse)

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

	// Tool result message — happy path varies by per-session
	// variantIdx so repeat reads of "main.go" return the matching
	// source for the chosen turn voice. Dangerous path stays
	// singular (different shape, different output altogether).
	resultText := defaultResultVariants[variantIdx]
	if dangerous {
		resultText = "removed: /tmp/scratch (3 files, 2 dirs)"
	}
	toolMsg, terr := e.store.AppendMessage(gact.Message{
		SessionID: sessionID,
		Role:      gact.RoleTool,
		Parts: []gact.Part{
			gact.NewToolResultPart(callID, []gact.Part{
				gact.NewTextPart(resultText),
			}, false),
		},
	})
	if terr != nil {
		return
	}
	e.bus.Publish(events.Event{
		Type:      "message.created",
		SessionID: sessionID,
		Payload:   toolMsg,
	})
	if err := sleep(ctx, e.cfg.Timing.BetweenParts); err != nil {
		return
	}

	// --- Assistant message #2 (final) --------------------------------------
	final, ferr := e.createAssistantMessage(sessionID)
	if ferr != nil {
		return
	}
	finalP, fperr := e.addPart(sessionID, final.ID, gact.NewTextPart(""))
	if fperr != nil {
		return
	}
	finalText := defaultFinalVariants[variantIdx]
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
