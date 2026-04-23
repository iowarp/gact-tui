package scenario

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/JaimeCernuda/gact-tui/emulator/internal/events"
	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// runLongScript produces an assistant turn with a very long text
// reply — about 60 lines of prose split into several paragraphs.
// Used to drive the "long message should compact with expand-on-
// demand" rendering work (feedback L3).
//
// Triggered by "long" / "explain" / "writeup" substrings in the user
// prompt.
func runLongScript(ctx context.Context, e *Engine, sessionID string, _ *gact.Message) {
	// PPPPP1: cycle through longReplyVariants per session so repeat
	// "long explain" turns produce visibly different writeups —
	// pairs with FFFFF1's cursor-aware Ctrl+E. Same NextCallIndex
	// pattern as GGGGG1's bigtool variants.
	idx := e.NextCallIndex(sessionID, "long")
	v := longReplyVariants[idx%len(longReplyVariants)]

	e.publishStatus(sessionID, gact.StatusRunning)
	asst, err := e.createAssistantMessage(sessionID)
	if err != nil {
		return
	}
	// Short thinking — this variant is about reply length, not
	// thinking length.
	thinking, _ := e.addPart(sessionID, asst.ID, gact.NewThinkingPart(""))
	_ = e.streamText(ctx, sessionID, asst.ID, thinking.ID,
		v.thinking, "thinking")
	e.completePart(sessionID, asst.ID, thinking.ID)
	if err := sleep(ctx, e.cfg.Timing.BetweenParts); err != nil {
		return
	}

	body, _ := e.addPart(sessionID, asst.ID, gact.NewTextPart(""))
	_ = e.streamText(ctx, sessionID, asst.ID, body.ID, v.body, "text")
	e.completePart(sessionID, asst.ID, body.ID)
	e.completeMessage(sessionID, asst.ID, gact.StopReasonEndTurn)
	e.publishStatus(sessionID, gact.StatusIdle)
}

// runBigToolScript produces an assistant turn that invokes `tail`
// against a synthetic log file and gets back ~80 lines of output.
// Used to drive the "large tool output should compact with expand-
// on-demand" rendering work (feedback L3).
//
// Triggered by "log" / "dump" / "traceback" / "logs" in the user
// prompt.
func runBigToolScript(ctx context.Context, e *Engine, sessionID string, _ *gact.Message) {
	// GGGGG1: pick a different log payload + framing per call so
	// repeated "dump the log" turns produce visibly different bulky
	// outputs. Cycles through bigLogVariants by per-session counter.
	idx := e.NextCallIndex(sessionID, "bigtool")
	v := bigLogVariants[idx%len(bigLogVariants)]

	e.publishStatus(sessionID, gact.StatusRunning)
	asst, err := e.createAssistantMessage(sessionID)
	if err != nil {
		return
	}
	intro, _ := e.addPart(sessionID, asst.ID, gact.NewTextPart(""))
	_ = e.streamText(ctx, sessionID, asst.ID, intro.ID, v.intro, "text")
	e.completePart(sessionID, asst.ID, intro.ID)

	callID := "call_" + asst.ID[len(asst.ID)-8:]
	toolPart, _ := e.addPart(sessionID, asst.ID,
		gact.NewToolCallPart(callID, "shell", nil))
	toolInputRaw := v.commandJSON
	e.bus.Publish(events.Event{
		Type:      "message.part.delta",
		SessionID: sessionID,
		Payload: map[string]any{
			"message_id": asst.ID, "part_id": toolPart.ID,
			"delta": map[string]any{"input_json_append": toolInputRaw},
		},
	})
	_, _ = e.store.UpdateMessagePart(asst.ID, toolPart.ID, func(p *gact.Part) {
		var m map[string]any
		_ = json.Unmarshal([]byte(toolInputRaw), &m)
		p.Input = m
	})
	e.completePart(sessionID, asst.ID, toolPart.ID)
	e.completeMessage(sessionID, asst.ID, gact.StopReasonToolUse)

	e.bus.Publish(events.Event{
		Type:      "tool.call.started",
		SessionID: sessionID,
		Payload:   map[string]any{"call_id": callID, "tool_name": "shell"},
	})
	if err := sleep(ctx, e.cfg.Timing.ToolThink); err != nil {
		return
	}
	e.bus.Publish(events.Event{
		Type:      "tool.call.completed",
		SessionID: sessionID,
		Payload:   map[string]any{"call_id": callID, "is_error": false},
	})

	toolMsg, _ := e.store.AppendMessage(gact.Message{
		SessionID: sessionID,
		Role:      gact.RoleTool,
		Parts: []gact.Part{
			gact.NewToolResultPart(callID, []gact.Part{
				gact.NewTextPart(v.body),
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

	final, _ := e.createAssistantMessage(sessionID)
	finalP, _ := e.addPart(sessionID, final.ID, gact.NewTextPart(""))
	_ = e.streamText(ctx, sessionID, final.ID, finalP.ID, v.followup, "text")
	e.completePart(sessionID, final.ID, finalP.ID)
	e.completeMessage(sessionID, final.ID, gact.StopReasonEndTurn)
	e.publishStatus(sessionID, gact.StatusIdle)
}

// runMultiToolScript produces an assistant turn that invokes three
// tools in sequence (read → grep → edit), interleaved with short
// narrations. Useful for testing the conversation's visual density
// when tool calls pile up (feedback L4's demarcation).
//
// Triggered by "many tools" / "multi tool" in the user prompt.
func runMultiToolScript(ctx context.Context, e *Engine, sessionID string, _ *gact.Message) {
	// QQQQQ1: cycle multi-tool sequences per session, same pattern as
	// GGGGG1/PPPPP1. Three distinct 3-tool flows so repeated "many
	// tools" turns produce visibly different sequences.
	idx := e.NextCallIndex(sessionID, "multitool")
	v := multiToolVariants[idx%len(multiToolVariants)]

	e.publishStatus(sessionID, gact.StatusRunning)
	asst, err := e.createAssistantMessage(sessionID)
	if err != nil {
		return
	}
	intro, _ := e.addPart(sessionID, asst.ID, gact.NewTextPart(""))
	_ = e.streamText(ctx, sessionID, asst.ID, intro.ID, v.intro, "text")
	e.completePart(sessionID, asst.ID, intro.ID)

	tools := v.tools
	for i, tc := range tools {
		callID := fmt.Sprintf("call_%s_%d", asst.ID[len(asst.ID)-6:], i)
		toolPart, _ := e.addPart(sessionID, asst.ID,
			gact.NewToolCallPart(callID, tc.name, nil))
		e.bus.Publish(events.Event{
			Type:      "message.part.delta",
			SessionID: sessionID,
			Payload: map[string]any{
				"message_id": asst.ID, "part_id": toolPart.ID,
				"delta": map[string]any{"input_json_append": tc.input},
			},
		})
		_, _ = e.store.UpdateMessagePart(asst.ID, toolPart.ID, func(p *gact.Part) {
			var m map[string]any
			_ = json.Unmarshal([]byte(tc.input), &m)
			p.Input = m
		})
		e.completePart(sessionID, asst.ID, toolPart.ID)

		if err := sleep(ctx, e.cfg.Timing.ToolThink); err != nil {
			return
		}
		e.bus.Publish(events.Event{
			Type:      "tool.call.completed",
			SessionID: sessionID,
			Payload:   map[string]any{"call_id": callID, "is_error": false},
		})

		toolMsg, _ := e.store.AppendMessage(gact.Message{
			SessionID: sessionID,
			Role:      gact.RoleTool,
			Parts: []gact.Part{
				gact.NewToolResultPart(callID, []gact.Part{
					gact.NewTextPart(tc.result),
				}, false),
			},
		})
		e.bus.Publish(events.Event{
			Type: "message.created", SessionID: sessionID, Payload: toolMsg,
		})
		if err := sleep(ctx, e.cfg.Timing.BetweenParts); err != nil {
			return
		}
	}
	// SSSSSSSSS1: if the variant carries a file_diff payload, emit it
	// as a sibling part on the same assistant message before the
	// stop. This lets "many tools" demonstrate the full read → grep →
	// edit flow, so the body cursor has a real file_diff to target
	// with `a`/`r` apply/reject.
	if v.diffPath != "" {
		before, after := v.diffBefore, v.diffAfter
		_, _ = e.addPart(sessionID, asst.ID,
			gact.NewFileDiffPart(v.diffPath, &before, &after, v.diffLang))
	}
	e.completeMessage(sessionID, asst.ID, gact.StopReasonToolUse)

	final, _ := e.createAssistantMessage(sessionID)
	finalP, _ := e.addPart(sessionID, final.ID, gact.NewTextPart(""))
	_ = e.streamText(ctx, sessionID, final.ID, finalP.ID, v.followup, "text")
	e.completePart(sessionID, final.ID, finalP.ID)
	e.completeMessage(sessionID, final.ID, gact.StopReasonEndTurn)
	e.publishStatus(sessionID, gact.StatusIdle)
}

// longReplyText is the payload for runLongScript — a multi-section
// writeup long enough to exercise compact-vs-dump rendering choices.
var longReplyText = strings.Join([]string{
	"## Overview",
	"",
	"This is a writeup spread across multiple sections so the renderer has a",
	"non-trivial amount of prose to deal with. Each paragraph is intentionally",
	"narrow so line wrapping kicks in at typical TUI widths.",
	"",
	"## Background",
	"",
	"The GACT contract (v0.1) defines a REST + SSE surface for agentic coders.",
	"Backends implement the surface; a single TUI drives any conforming",
	"backend. The emulator in this repo is the reference implementation;",
	"adapters in adapters/opencode and adapters/crush front real products.",
	"",
	"## Rendering concerns",
	"",
	"Long messages like this one need a rendering strategy that doesn't blow",
	"up the conversation pane. Three options:",
	"",
	"- **Dump**: render the full text inline. Works at small scale, degrades",
	"  fast as messages get long. Current behaviour.",
	"- **Truncate**: show the first N lines with a \"… more\" indicator. The",
	"  user doesn't learn anything about what's below without scrolling.",
	"- **Compact + detail**: render the first N lines inline, attach a key",
	"  binding that opens the full message in a floating detail window.",
	"  Matches how Crush renders big tool outputs. This is the direction",
	"  feedback L3 asks for.",
	"",
	"## Tool outputs",
	"",
	"The same problem applies to tool outputs — a 200-line log, a 50-line",
	"diff, even a verbose stderr trace. Whatever strategy we pick for long",
	"assistant text should also cover tool_result parts; otherwise the TUI",
	"renders inconsistently depending on the part type.",
	"",
	"## Prior art",
	"",
	"- Crush's conversation display: inline Bash(cmd) headers, leading `⎿`",
	"  for tool output, expand-on-focus for big blocks.",
	"- Claude Code: `Bash(…)` / `Write(…)` headers, `⎿` indented output,",
	"  fold-by-default behaviour for verbose commands.",
	"- OpenCode: inline full rendering + scroll-off. Less refined.",
	"",
	"## Proposal",
	"",
	"Match Claude Code's density: per-part headers that name the tool and a",
	"single-line preview of the input, leading `⎿` with the first few lines",
	"of output, a keybinding (likely Ctrl+Enter while the cursor is on the",
	"part) to open a floating detail pane.",
	"",
	"## Open questions",
	"",
	"1. Where does the body-level message cursor come from? The TUI doesn't",
	"   track one yet; K10's copy and K13's retry both cheat and target \"the",
	"   latest\".",
	"2. Does the floating detail pane scroll independently? Probably yes",
	"   for tool outputs, but that means wiring a second scroll offset.",
	"3. How do we expose the expand/collapse state across re-renders? State",
	"   lives on App, not on the parts themselves.",
	"",
	"That's the shape of the work. Ready to pick it up in the next iteration.",
}, "\n")

// bigLogOutput is a synthetic 80-ish-line log snippet used by
// runBigToolScript to exercise tool-output rendering.
var bigLogOutput = strings.Join([]string{
	"2026-04-18T12:00:00Z INFO  server/main.go:42 server starting on :8080",
	"2026-04-18T12:00:00Z INFO  server/routes.go:17 registered 42 routes",
	"2026-04-18T12:00:01Z INFO  server/main.go:55 ready",
	"2026-04-18T12:00:12Z INFO  handler/users.go:89 GET /v1/users 200 18ms",
	"2026-04-18T12:00:13Z INFO  handler/users.go:89 GET /v1/users/42 200 22ms",
	"2026-04-18T12:00:14Z INFO  handler/sessions.go:112 POST /v1/sessions 201 41ms",
	"2026-04-18T12:00:14Z DEBUG db/query.go:203 SELECT * FROM sessions WHERE id=$1",
	"2026-04-18T12:00:15Z INFO  handler/messages.go:204 POST /v1/messages 202 8ms",
	"2026-04-18T12:00:16Z DEBUG bus/events.go:87 publishing session.status_changed",
	"2026-04-18T12:00:16Z DEBUG bus/events.go:87 publishing message.created",
	"2026-04-18T12:00:17Z INFO  handler/events.go:33 SSE subscriber connected",
	"2026-04-18T12:00:20Z DEBUG scenario/engine.go:94 starting script for session ses_abc",
	"2026-04-18T12:00:21Z DEBUG scenario/engine.go:128 publishing thinking delta",
	"2026-04-18T12:00:22Z DEBUG scenario/engine.go:131 publishing tool_call",
	"2026-04-18T12:00:23Z DEBUG tool/bash.go:45 shell command: ls -la /tmp",
	"2026-04-18T12:00:23Z DEBUG tool/bash.go:78 exit 0",
	"2026-04-18T12:00:24Z DEBUG scenario/engine.go:158 publishing tool_result",
	"2026-04-18T12:00:25Z DEBUG scenario/engine.go:172 publishing message.completed",
	"2026-04-18T12:00:25Z DEBUG scenario/engine.go:188 publishing session.status_changed idle",
	"2026-04-18T12:00:30Z INFO  handler/permissions.go:44 GET /v1/permissions 200 3ms",
	"2026-04-18T12:00:42Z WARN  handler/sessions.go:77 session ses_old expired",
	"2026-04-18T12:00:42Z INFO  store/cleanup.go:21 archived 1 expired sessions",
	"2026-04-18T12:00:50Z INFO  handler/metrics.go:24 GET /v1/metrics 200 12ms",
	"2026-04-18T12:01:00Z INFO  scheduler/tick.go:55 idle-ping",
	"2026-04-18T12:01:12Z ERROR handler/mcp.go:118 upstream tool returned non-JSON",
	"2026-04-18T12:01:12Z ERROR handler/mcp.go:119 body=<<<EOF\\n500 server error\\nEOF",
	"2026-04-18T12:01:13Z WARN  handler/mcp.go:142 reconnecting to mcp server 'tools'",
	"2026-04-18T12:01:14Z INFO  handler/mcp.go:160 reconnected; 3 tools available",
	"2026-04-18T12:01:30Z INFO  handler/users.go:89 GET /v1/users 200 18ms",
	"2026-04-18T12:01:45Z ERROR handler/sessions.go:203 panic recovered",
	"2026-04-18T12:01:45Z ERROR runtime/panic.go:844 runtime error: invalid memory address",
	"2026-04-18T12:01:45Z ERROR runtime/debug/stack.go:24 goroutine 142 [running]:",
	"2026-04-18T12:01:45Z ERROR runtime/debug/stack.go:24   main.handleSession(0x0, 0xc00)",
	"2026-04-18T12:01:45Z ERROR runtime/debug/stack.go:24     /src/server/main.go:201 +0x34",
	"2026-04-18T12:01:45Z ERROR runtime/debug/stack.go:24   net/http.(*Handler).ServeHTTP(…)",
	"2026-04-18T12:01:46Z WARN  middleware/recover.go:33 recovered from panic, returning 500",
	"2026-04-18T12:01:46Z INFO  middleware/recover.go:44 response sent 500 internal server error",
	"2026-04-18T12:02:00Z INFO  handler/users.go:89 GET /v1/users 200 18ms",
	"2026-04-18T12:02:12Z WARN  handler/retries.go:66 retry #1 for req_abc",
	"2026-04-18T12:02:14Z WARN  handler/retries.go:66 retry #2 for req_abc",
	"2026-04-18T12:02:18Z WARN  handler/retries.go:66 retry #3 for req_abc",
	"2026-04-18T12:02:22Z WARN  handler/retries.go:66 retry #4 for req_abc",
	"2026-04-18T12:02:26Z WARN  handler/retries.go:66 retry #5 for req_abc",
	"2026-04-18T12:02:30Z ERROR handler/retries.go:72 req_abc exhausted retries",
	"2026-04-18T12:02:31Z INFO  handler/users.go:89 GET /v1/users 200 18ms",
	"2026-04-18T12:03:00Z INFO  scheduler/tick.go:55 idle-ping",
	"2026-04-18T12:03:30Z INFO  handler/messages.go:204 POST /v1/messages 202 7ms",
	"2026-04-18T12:03:30Z DEBUG bus/events.go:87 publishing message.created",
	"2026-04-18T12:03:45Z INFO  handler/events.go:33 SSE subscriber connected",
	"2026-04-18T12:04:00Z INFO  scheduler/tick.go:55 idle-ping",
	"2026-04-18T12:04:30Z INFO  handler/sessions.go:112 POST /v1/sessions 201 38ms",
	"2026-04-18T12:04:31Z DEBUG db/query.go:203 INSERT INTO sessions",
	"2026-04-18T12:04:45Z INFO  handler/messages.go:204 POST /v1/messages 202 9ms",
	"2026-04-18T12:05:00Z INFO  scheduler/tick.go:55 idle-ping",
	"2026-04-18T12:05:15Z INFO  handler/users.go:89 GET /v1/users 200 20ms",
	"2026-04-18T12:05:30Z INFO  handler/users.go:89 GET /v1/users/42 200 19ms",
	"2026-04-18T12:05:45Z INFO  handler/sessions.go:112 POST /v1/sessions 201 44ms",
	"2026-04-18T12:06:00Z INFO  scheduler/tick.go:55 idle-ping",
	"2026-04-18T12:06:12Z INFO  handler/messages.go:204 POST /v1/messages 202 11ms",
	"2026-04-18T12:06:30Z WARN  store/cleanup.go:18 cleanup took 312ms",
	"2026-04-18T12:07:00Z INFO  scheduler/tick.go:55 idle-ping",
	"2026-04-18T12:07:01Z INFO  handler/metrics.go:24 GET /v1/metrics 200 14ms",
	"2026-04-18T12:07:15Z INFO  handler/events.go:33 SSE subscriber connected",
	"2026-04-18T12:07:45Z INFO  handler/users.go:89 GET /v1/users 200 19ms",
	"2026-04-18T12:08:00Z INFO  scheduler/tick.go:55 idle-ping",
	"2026-04-18T12:08:22Z INFO  handler/messages.go:204 POST /v1/messages 202 10ms",
	"2026-04-18T12:08:45Z DEBUG bus/events.go:87 publishing session.status_changed",
	"2026-04-18T12:09:00Z INFO  scheduler/tick.go:55 idle-ping",
	"2026-04-18T12:09:12Z INFO  handler/users.go:89 GET /v1/users 200 21ms",
	"2026-04-18T12:09:30Z INFO  handler/sessions.go:112 POST /v1/sessions 201 43ms",
	"2026-04-18T12:09:45Z INFO  handler/messages.go:204 POST /v1/messages 202 9ms",
	"2026-04-18T12:10:00Z INFO  scheduler/tick.go:55 idle-ping",
	"2026-04-18T12:10:15Z INFO  handler/users.go:89 GET /v1/users 200 18ms",
	"2026-04-18T12:10:30Z INFO  handler/events.go:33 SSE subscriber connected",
	"2026-04-18T12:10:45Z INFO  handler/messages.go:204 POST /v1/messages 202 8ms",
	"2026-04-18T12:11:00Z INFO  scheduler/tick.go:55 idle-ping",
	"2026-04-18T12:11:12Z INFO  handler/users.go:89 GET /v1/users 200 19ms",
	"2026-04-18T12:11:30Z INFO  handler/users.go:89 GET /v1/users/42 200 22ms",
	"2026-04-18T12:11:45Z INFO  handler/sessions.go:112 POST /v1/sessions 201 40ms",
	"2026-04-18T12:12:00Z INFO  scheduler/tick.go:55 idle-ping",
	"2026-04-18T12:12:12Z INFO  handler/messages.go:204 POST /v1/messages 202 7ms",
}, "\n")

// GGGGG1: bigLogVariants is the rotating cast of payloads runBigToolScript
// picks from. Each variant has a distinct intro / command / body /
// followup so multiple "dump the log" turns in the same session look
// genuinely different — exercising the cursor-aware Ctrl+E path
// (FFFFF1) where the user must be able to address each bulky output
// individually.
var bigLogVariants = []struct {
	intro       string
	commandJSON string
	body        string
	followup    string
}{
	{
		intro:       "I'll grep the last 80 lines of the server log.",
		commandJSON: `{"command":"tail -80 /var/log/app.log"}`,
		body:        bigLogOutput,
		followup: "**80 lines of logs** returned. The interesting parts are around the " +
			"panic at line 47 and the retry storm starting at line 62. Want me " +
			"to grep for a specific error class?",
	},
	{
		intro:       "Pulling the most recent Python traceback from the worker pod.",
		commandJSON: `{"command":"kubectl logs -n workers worker-7b9c --tail=80"}`,
		body:        pythonTracebackOutput,
		followup: "Two distinct **TypeError** chains, both originating in the same " +
			"`payload.normalize()` call. Top frames diverge after dispatch — looks " +
			"like a missing schema migration. Want me to diff against last week's pod?",
	},
	{
		intro:       "Tailing the nginx access log for the last 5 minutes.",
		commandJSON: `{"command":"tail -80 /var/log/nginx/access.log"}`,
		body:        nginxAccessOutput,
		followup: "Heavy `/api/v2/search` traffic from one IP — looks like a misbehaving " +
			"client retrying every 2s. Suggest rate-limiting at the gateway. Want me " +
			"to check the rate-limiter config next?",
	},
}

// pythonTracebackOutput is a synthetic but realistic interleaving of
// two TypeError chains, used as the second variant of "dump the log".
var pythonTracebackOutput = strings.Join([]string{
	"2026-04-19 09:14:02,118 INFO  worker.main  starting (pid=1, build=2026.04.19-r3)",
	"2026-04-19 09:14:02,341 INFO  worker.kafka subscribed: topic=ingest.v1 partitions=[0..7]",
	"2026-04-19 09:14:03,002 INFO  worker.normalize loaded schema=v17 (327 fields)",
	"2026-04-19 09:14:18,442 DEBUG worker.dispatch event_id=evt_8a31 type=user.profile.changed",
	"2026-04-19 09:14:18,447 ERROR worker.normalize Traceback (most recent call last):",
	`  File "/app/worker/dispatch.py", line 142, in dispatch`,
	"    handler(payload)",
	`  File "/app/worker/handlers/profile.py", line 88, in handle_profile_changed`,
	"    payload = normalize(payload, schema=PROFILE_V17)",
	`  File "/app/worker/normalize.py", line 314, in normalize`,
	"    out[field] = coerce(payload[field], spec)",
	`  File "/app/worker/normalize.py", line 401, in coerce`,
	`    return spec.cast(value)`,
	`TypeError: 'NoneType' object is not callable`,
	"2026-04-19 09:14:18,449 WARN  worker.dispatch evt_8a31 dead-lettered → ingest.dlq",
	"2026-04-19 09:14:21,008 DEBUG worker.dispatch event_id=evt_8a32 type=order.completed",
	"2026-04-19 09:14:21,012 ERROR worker.normalize Traceback (most recent call last):",
	`  File "/app/worker/dispatch.py", line 142, in dispatch`,
	"    handler(payload)",
	`  File "/app/worker/handlers/order.py", line 102, in handle_order_completed`,
	"    payload = normalize(payload, schema=ORDER_V9)",
	`  File "/app/worker/normalize.py", line 314, in normalize`,
	"    out[field] = coerce(payload[field], spec)",
	`  File "/app/worker/normalize.py", line 388, in coerce`,
	"    raise TypeError(f\"unexpected type {type(value).__name__} for {spec.name}\")",
	`TypeError: unexpected type dict for total_amount`,
	"2026-04-19 09:14:21,013 WARN  worker.dispatch evt_8a32 dead-lettered → ingest.dlq",
	"2026-04-19 09:14:24,772 DEBUG worker.dispatch event_id=evt_8a33 type=user.profile.changed",
	"2026-04-19 09:14:24,773 ERROR worker.normalize Traceback (most recent call last):",
	`  File "/app/worker/dispatch.py", line 142, in dispatch`,
	"    handler(payload)",
	`  File "/app/worker/handlers/profile.py", line 88, in handle_profile_changed`,
	"    payload = normalize(payload, schema=PROFILE_V17)",
	`  File "/app/worker/normalize.py", line 314, in normalize`,
	"    out[field] = coerce(payload[field], spec)",
	`  File "/app/worker/normalize.py", line 401, in coerce`,
	`    return spec.cast(value)`,
	`TypeError: 'NoneType' object is not callable`,
	"2026-04-19 09:14:24,774 WARN  worker.dispatch evt_8a33 dead-lettered → ingest.dlq",
	"2026-04-19 09:14:31,221 INFO  worker.metrics dlq_rate_5m=0.42 (was 0.01)",
	"2026-04-19 09:14:31,222 WARN  worker.metrics PROFILE_V17 schema_miss=87% in last 5m",
	"2026-04-19 09:14:35,118 DEBUG worker.dispatch event_id=evt_8a34 type=user.profile.changed",
	"2026-04-19 09:14:35,121 ERROR worker.normalize Traceback (most recent call last):",
	`  File "/app/worker/dispatch.py", line 142, in dispatch`,
	"    handler(payload)",
	`  File "/app/worker/handlers/profile.py", line 88, in handle_profile_changed`,
	"    payload = normalize(payload, schema=PROFILE_V17)",
	`  File "/app/worker/normalize.py", line 314, in normalize`,
	"    out[field] = coerce(payload[field], spec)",
	`  File "/app/worker/normalize.py", line 401, in coerce`,
	`    return spec.cast(value)`,
	`TypeError: 'NoneType' object is not callable`,
	"2026-04-19 09:14:35,122 WARN  worker.dispatch evt_8a34 dead-lettered → ingest.dlq",
	"2026-04-19 09:14:42,808 INFO  worker.heartbeat dlq=312 active=4 schema=v17",
	"2026-04-19 09:14:48,332 DEBUG worker.dispatch event_id=evt_8a35 type=order.completed",
	"2026-04-19 09:14:48,333 ERROR worker.normalize Traceback (most recent call last):",
	`  File "/app/worker/dispatch.py", line 142, in dispatch`,
	"    handler(payload)",
	`  File "/app/worker/handlers/order.py", line 102, in handle_order_completed`,
	"    payload = normalize(payload, schema=ORDER_V9)",
	`  File "/app/worker/normalize.py", line 314, in normalize`,
	"    out[field] = coerce(payload[field], spec)",
	`  File "/app/worker/normalize.py", line 388, in coerce`,
	"    raise TypeError(f\"unexpected type {type(value).__name__} for {spec.name}\")",
	`TypeError: unexpected type dict for total_amount`,
	"2026-04-19 09:14:48,334 WARN  worker.dispatch evt_8a35 dead-lettered → ingest.dlq",
	"2026-04-19 09:14:55,001 INFO  worker.heartbeat dlq=347 active=4 schema=v17",
	"2026-04-19 09:15:01,447 INFO  worker.metrics dlq_rate_5m=0.51 (was 0.42)",
	"2026-04-19 09:15:01,448 WARN  worker.metrics ORDER_V9 schema_miss=12% in last 5m",
	"2026-04-19 09:15:01,449 WARN  worker.metrics PROFILE_V17 schema_miss=89% in last 5m",
	"2026-04-19 09:15:01,500 INFO  worker.alerting page-on-call=true (dlq_rate_5m > 0.50)",
	"2026-04-19 09:15:08,221 DEBUG worker.dispatch event_id=evt_8a36 type=user.profile.changed",
	"2026-04-19 09:15:08,222 INFO  worker.normalize using fallback schema PROFILE_V16",
	"2026-04-19 09:15:08,224 DEBUG worker.dispatch evt_8a36 dispatched OK (fallback)",
	"2026-04-19 09:15:14,118 INFO  worker.runtime SIGUSR1 received → reload schemas",
	"2026-04-19 09:15:14,221 INFO  worker.normalize loaded schema=v18 (332 fields, +5)",
	"2026-04-19 09:15:14,222 INFO  worker.normalize PROFILE_V18 supersedes PROFILE_V17",
	"2026-04-19 09:15:18,001 DEBUG worker.dispatch event_id=evt_8a37 type=user.profile.changed",
	"2026-04-19 09:15:18,003 DEBUG worker.dispatch evt_8a37 dispatched OK",
	"2026-04-19 09:15:24,118 DEBUG worker.dispatch event_id=evt_8a38 type=order.completed",
	"2026-04-19 09:15:24,121 DEBUG worker.dispatch evt_8a38 dispatched OK",
	"2026-04-19 09:15:31,772 INFO  worker.metrics dlq_rate_5m=0.18 (was 0.51)",
	"2026-04-19 09:15:31,773 INFO  worker.alerting page-on-call=false",
}, "\n")

// nginxAccessOutput is the third variant — combined-format access
// log dominated by one misbehaving client retrying /api/v2/search.
var nginxAccessOutput = strings.Join([]string{
	`10.0.4.71 - - [19/Apr/2026:09:42:01 +0000] "GET /healthz HTTP/1.1" 200 2 "-" "kube-probe/1.31"`,
	`10.0.4.71 - - [19/Apr/2026:09:42:11 +0000] "GET /healthz HTTP/1.1" 200 2 "-" "kube-probe/1.31"`,
	`203.0.113.42 - - [19/Apr/2026:09:42:14 +0000] "GET /api/v2/search?q=widget HTTP/1.1" 200 1834 "-" "curl/8.4"`,
	`203.0.113.42 - - [19/Apr/2026:09:42:16 +0000] "GET /api/v2/search?q=widget HTTP/1.1" 200 1834 "-" "curl/8.4"`,
	`203.0.113.42 - - [19/Apr/2026:09:42:18 +0000] "GET /api/v2/search?q=widget HTTP/1.1" 200 1834 "-" "curl/8.4"`,
	`203.0.113.42 - - [19/Apr/2026:09:42:20 +0000] "GET /api/v2/search?q=widget HTTP/1.1" 200 1834 "-" "curl/8.4"`,
	`198.51.100.7 - - [19/Apr/2026:09:42:21 +0000] "GET /api/v1/users/me HTTP/2.0" 200 412 "https://app.example.com" "Mozilla/5.0"`,
	`203.0.113.42 - - [19/Apr/2026:09:42:22 +0000] "GET /api/v2/search?q=widget HTTP/1.1" 200 1834 "-" "curl/8.4"`,
	`203.0.113.42 - - [19/Apr/2026:09:42:24 +0000] "GET /api/v2/search?q=widget HTTP/1.1" 200 1834 "-" "curl/8.4"`,
	`10.0.4.71 - - [19/Apr/2026:09:42:21 +0000] "GET /healthz HTTP/1.1" 200 2 "-" "kube-probe/1.31"`,
	`203.0.113.42 - - [19/Apr/2026:09:42:26 +0000] "GET /api/v2/search?q=widget HTTP/1.1" 200 1834 "-" "curl/8.4"`,
	`203.0.113.42 - - [19/Apr/2026:09:42:28 +0000] "GET /api/v2/search?q=widget HTTP/1.1" 200 1834 "-" "curl/8.4"`,
	`198.51.100.7 - - [19/Apr/2026:09:42:30 +0000] "POST /api/v1/orders HTTP/2.0" 201 88 "https://app.example.com" "Mozilla/5.0"`,
	`203.0.113.42 - - [19/Apr/2026:09:42:30 +0000] "GET /api/v2/search?q=widget HTTP/1.1" 200 1834 "-" "curl/8.4"`,
	`203.0.113.42 - - [19/Apr/2026:09:42:32 +0000] "GET /api/v2/search?q=widget HTTP/1.1" 200 1834 "-" "curl/8.4"`,
	`10.0.4.71 - - [19/Apr/2026:09:42:31 +0000] "GET /healthz HTTP/1.1" 200 2 "-" "kube-probe/1.31"`,
	`203.0.113.42 - - [19/Apr/2026:09:42:34 +0000] "GET /api/v2/search?q=widget HTTP/1.1" 200 1834 "-" "curl/8.4"`,
	`203.0.113.42 - - [19/Apr/2026:09:42:36 +0000] "GET /api/v2/search?q=widget HTTP/1.1" 200 1834 "-" "curl/8.4"`,
	`192.0.2.55 - - [19/Apr/2026:09:42:37 +0000] "GET /api/v1/sessions HTTP/2.0" 200 2014 "https://app.example.com" "Mozilla/5.0"`,
	`203.0.113.42 - - [19/Apr/2026:09:42:38 +0000] "GET /api/v2/search?q=widget HTTP/1.1" 429 84 "-" "curl/8.4"`,
	`203.0.113.42 - - [19/Apr/2026:09:42:40 +0000] "GET /api/v2/search?q=widget HTTP/1.1" 429 84 "-" "curl/8.4"`,
	`10.0.4.71 - - [19/Apr/2026:09:42:41 +0000] "GET /healthz HTTP/1.1" 200 2 "-" "kube-probe/1.31"`,
	`203.0.113.42 - - [19/Apr/2026:09:42:42 +0000] "GET /api/v2/search?q=widget HTTP/1.1" 429 84 "-" "curl/8.4"`,
	`203.0.113.42 - - [19/Apr/2026:09:42:44 +0000] "GET /api/v2/search?q=widget HTTP/1.1" 429 84 "-" "curl/8.4"`,
	`203.0.113.42 - - [19/Apr/2026:09:42:46 +0000] "GET /api/v2/search?q=widget HTTP/1.1" 429 84 "-" "curl/8.4"`,
	`198.51.100.7 - - [19/Apr/2026:09:42:48 +0000] "GET /api/v1/orders/42 HTTP/2.0" 200 612 "https://app.example.com" "Mozilla/5.0"`,
	`203.0.113.42 - - [19/Apr/2026:09:42:48 +0000] "GET /api/v2/search?q=widget HTTP/1.1" 429 84 "-" "curl/8.4"`,
	`203.0.113.42 - - [19/Apr/2026:09:42:50 +0000] "GET /api/v2/search?q=widget HTTP/1.1" 429 84 "-" "curl/8.4"`,
	`10.0.4.71 - - [19/Apr/2026:09:42:51 +0000] "GET /healthz HTTP/1.1" 200 2 "-" "kube-probe/1.31"`,
	`203.0.113.42 - - [19/Apr/2026:09:42:52 +0000] "GET /api/v2/search?q=widget HTTP/1.1" 429 84 "-" "curl/8.4"`,
	`203.0.113.42 - - [19/Apr/2026:09:42:54 +0000] "GET /api/v2/search?q=widget HTTP/1.1" 429 84 "-" "curl/8.4"`,
	`203.0.113.42 - - [19/Apr/2026:09:42:56 +0000] "GET /api/v2/search?q=widget HTTP/1.1" 429 84 "-" "curl/8.4"`,
	`192.0.2.55 - - [19/Apr/2026:09:42:57 +0000] "POST /api/v1/messages HTTP/2.0" 202 41 "https://app.example.com" "Mozilla/5.0"`,
	`203.0.113.42 - - [19/Apr/2026:09:42:58 +0000] "GET /api/v2/search?q=widget HTTP/1.1" 429 84 "-" "curl/8.4"`,
	`203.0.113.42 - - [19/Apr/2026:09:43:00 +0000] "GET /api/v2/search?q=widget HTTP/1.1" 429 84 "-" "curl/8.4"`,
	`10.0.4.71 - - [19/Apr/2026:09:43:01 +0000] "GET /healthz HTTP/1.1" 200 2 "-" "kube-probe/1.31"`,
	`203.0.113.42 - - [19/Apr/2026:09:43:02 +0000] "GET /api/v2/search?q=widget HTTP/1.1" 429 84 "-" "curl/8.4"`,
	`203.0.113.42 - - [19/Apr/2026:09:43:04 +0000] "GET /api/v2/search?q=widget HTTP/1.1" 429 84 "-" "curl/8.4"`,
	`203.0.113.42 - - [19/Apr/2026:09:43:06 +0000] "GET /api/v2/search?q=widget HTTP/1.1" 429 84 "-" "curl/8.4"`,
	`198.51.100.7 - - [19/Apr/2026:09:43:08 +0000] "GET /api/v1/messages?session=ses_x HTTP/2.0" 200 4218 "https://app.example.com" "Mozilla/5.0"`,
	`203.0.113.42 - - [19/Apr/2026:09:43:08 +0000] "GET /api/v2/search?q=widget HTTP/1.1" 429 84 "-" "curl/8.4"`,
	`203.0.113.42 - - [19/Apr/2026:09:43:10 +0000] "GET /api/v2/search?q=widget HTTP/1.1" 429 84 "-" "curl/8.4"`,
	`10.0.4.71 - - [19/Apr/2026:09:43:11 +0000] "GET /healthz HTTP/1.1" 200 2 "-" "kube-probe/1.31"`,
	`203.0.113.42 - - [19/Apr/2026:09:43:12 +0000] "GET /api/v2/search?q=widget HTTP/1.1" 429 84 "-" "curl/8.4"`,
	`203.0.113.42 - - [19/Apr/2026:09:43:14 +0000] "GET /api/v2/search?q=widget HTTP/1.1" 429 84 "-" "curl/8.4"`,
	`192.0.2.55 - - [19/Apr/2026:09:43:16 +0000] "GET /api/v1/users/me HTTP/2.0" 200 412 "https://app.example.com" "Mozilla/5.0"`,
	`203.0.113.42 - - [19/Apr/2026:09:43:16 +0000] "GET /api/v2/search?q=widget HTTP/1.1" 429 84 "-" "curl/8.4"`,
	`203.0.113.42 - - [19/Apr/2026:09:43:18 +0000] "GET /api/v2/search?q=widget HTTP/1.1" 429 84 "-" "curl/8.4"`,
	`10.0.4.71 - - [19/Apr/2026:09:43:21 +0000] "GET /healthz HTTP/1.1" 200 2 "-" "kube-probe/1.31"`,
	`203.0.113.42 - - [19/Apr/2026:09:43:20 +0000] "GET /api/v2/search?q=widget HTTP/1.1" 429 84 "-" "curl/8.4"`,
	`203.0.113.42 - - [19/Apr/2026:09:43:22 +0000] "GET /api/v2/search?q=widget HTTP/1.1" 429 84 "-" "curl/8.4"`,
	`203.0.113.42 - - [19/Apr/2026:09:43:24 +0000] "GET /api/v2/search?q=widget HTTP/1.1" 429 84 "-" "curl/8.4"`,
	`198.51.100.7 - - [19/Apr/2026:09:43:25 +0000] "POST /api/v1/orders HTTP/2.0" 201 88 "https://app.example.com" "Mozilla/5.0"`,
	`203.0.113.42 - - [19/Apr/2026:09:43:26 +0000] "GET /api/v2/search?q=widget HTTP/1.1" 429 84 "-" "curl/8.4"`,
	`203.0.113.42 - - [19/Apr/2026:09:43:28 +0000] "GET /api/v2/search?q=widget HTTP/1.1" 429 84 "-" "curl/8.4"`,
	`10.0.4.71 - - [19/Apr/2026:09:43:31 +0000] "GET /healthz HTTP/1.1" 200 2 "-" "kube-probe/1.31"`,
	`203.0.113.42 - - [19/Apr/2026:09:43:30 +0000] "GET /api/v2/search?q=widget HTTP/1.1" 429 84 "-" "curl/8.4"`,
	`203.0.113.42 - - [19/Apr/2026:09:43:32 +0000] "GET /api/v2/search?q=widget HTTP/1.1" 429 84 "-" "curl/8.4"`,
}, "\n")

// QQQQQ1: multiToolVariants is the cycling cast of 3-tool sequences
// for runMultiToolScript. Each variant is a different
// investigate→action flow so repeat "many tools" turns produce
// visibly different sequences. Per-session counter via NextCallIndex.
type multiToolStep struct {
	name   string
	input  string
	result string
}

// SSSSSSSSS1: variants can optionally emit a sibling file_diff
// part after the tool loop so "many tools" demonstrates the real
// edit flow (a/r apply/reject on the diff). When diff fields are
// empty the script skips emitting it — variants 1 + 2 that don't
// centre on an edit keep their old shape.
var multiToolVariants = []struct {
	intro     string
	tools     []multiToolStep
	followup  string
	diffPath  string
	diffLang  string
	diffBefore string
	diffAfter  string
}{
	{
		// SSSSSSSSS1: variant 0 used to return a 2-line main.go and a
		// 1-line grep hit — too shallow to exercise the expand /
		// per-part navigation flows. It now reads TWO realistic Go
		// files back to back (main.go and handlers.go, each ~50
		// lines), runs a grep that hits both, and proposes an edit.
		// Gives the body cursor multiple bulky tool_results to
		// target with `[`/`]`+Ctrl+E.
		intro: "I'll audit the logging hygiene in two steps: read both the entry " +
			"point and the handlers module, then grep for stray `println` " +
			"calls, then propose an edit that swaps them for `log.Println`.",
		tools: []multiToolStep{
			{"read_file", `{"path":"main.go"}`, multiToolVariant0MainGo},
			{"read_file", `{"path":"internal/handlers/handlers.go"}`, multiToolVariant0HandlersGo},
			{"grep", `{"pattern":"println\\(","path":"."}`, multiToolVariant0GrepHits},
			{"edit_file", `{"path":"main.go"}`, "ok"},
		},
		followup: "Done. Two files read (main.go = 52 lines, handlers.go = 48 " +
			"lines), 14 `println` call sites found across three packages, and " +
			"an edit proposal applied to main.go line 38. The diff is staged " +
			"— select the edit_file block and press `a` to apply or `r` to " +
			"reject.",
		diffPath:   "main.go",
		diffLang:   "go",
		diffBefore: multiToolVariant0DiffBefore,
		diffAfter:  multiToolVariant0DiffAfter,
	},
	{
		intro: "Three-step migration check: list the schema, pull a sample row, " +
			"verify the type matches what the new code expects.",
		tools: []multiToolStep{
			{"shell", `{"command":"psql -c '\\d users'"}`,
				"                Table \"public.users\"\n" +
					" Column     | Type           | Nullable | Default\n" +
					"------------+----------------+----------+----------\n" +
					" id         | uuid           | not null |\n" +
					" email      | text           | not null |\n" +
					" created_at | timestamp tz   | not null | now()\n"},
			{"shell", `{"command":"psql -c 'SELECT * FROM users LIMIT 1'"}`,
				"                  id                  |       email       |       created_at\n" +
					"--------------------------------------+-------------------+------------------------\n" +
					" 8a31...d7c2                          | alice@example.com | 2025-12-04 19:42:01+00\n"},
			{"shell", `{"command":"go vet ./internal/users/..."}`, ""},
		},
		followup: "Schema looks healthy: uuid PK, email NOT NULL, created_at default. " +
			"`go vet` passed too — the new code's types line up with the existing " +
			"row shape. Migration should be safe to run.",
	},
	{
		intro: "Quick triage: pull the failing test name, find the file it lives in, " +
			"then run just that test verbose.",
		tools: []multiToolStep{
			{"shell", `{"command":"go test ./... 2>&1 | grep FAIL | head -3"}`,
				"--- FAIL: TestUserAuth_RejectsBadToken (0.02s)\n" +
					"--- FAIL: TestUserAuth_AcceptsValidJWT (0.01s)\n" +
					"FAIL\tinternal/auth\t0.043s"},
			{"grep", `{"pattern":"func TestUserAuth_","path":"./internal/auth"}`,
				"./internal/auth/middleware_test.go:42:func TestUserAuth_RejectsBadToken(t *testing.T) {\n" +
					"./internal/auth/middleware_test.go:71:func TestUserAuth_AcceptsValidJWT(t *testing.T) {"},
			{"shell", `{"command":"go test -v -run 'TestUserAuth_AcceptsValidJWT' ./internal/auth/"}`,
				"=== RUN   TestUserAuth_AcceptsValidJWT\n" +
					"    middleware_test.go:78: token validation: expected 200, got 403\n" +
					"--- FAIL: TestUserAuth_AcceptsValidJWT (0.01s)\n" +
					"FAIL"},
		},
		followup: "Test file is `internal/auth/middleware_test.go`. The valid-JWT case " +
			"is failing at line 78 — got 403 where it expected 200. Likely the " +
			"middleware's `claims.Audience` check changed; want me to diff the " +
			"middleware against last week?",
	},
}

// PPPPP1: cycling cast of long-reply payloads. Each variant has a
// distinct opening "thinking" line + body so multiple "long
// explain" turns produce visibly different writeups, exercising
// FFFFF1's cursor-aware Ctrl+E with real variety.
var longReplyVariants = []struct {
	thinking string
	body     string
}{
	{
		thinking: "The user wants a longform writeup. Let me lay it out in sections.\n",
		body:     longReplyText,
	},
	{
		thinking: "Architecture question. I'll trace the request path end-to-end.\n",
		body:     longArchitectureWriteup,
	},
	{
		thinking: "Performance audit. Let me walk through the hot paths I'd profile first.\n",
		body:     longPerfWriteup,
	},
}

// longArchitectureWriteup is the second long-reply variant — a
// request-path trace through a hypothetical service.
var longArchitectureWriteup = strings.Join([]string{
	"## Request lifecycle",
	"",
	"From the moment a request hits the load balancer to the moment the",
	"response is serialized back, here's what runs and in what order.",
	"",
	"## 1. Edge",
	"",
	"The L7 load balancer terminates TLS, applies a basic WAF rule set, and",
	"routes by host header. /api/* lands on the API gateway pool; /static/*",
	"goes to the CDN origin. Connection reuse is on (HTTP/2 frontside,",
	"HTTP/1.1 keep-alive backside) so we don't pay handshake cost per call.",
	"",
	"## 2. API gateway",
	"",
	"The gateway adds three things the upstream services don't see:",
	"",
	"- **Rate limiting**: token bucket per (route, api_key). 429 leaves the",
	"  gateway without ever reaching the service.",
	"- **Request signing**: HMAC of (method, path, ts, body) added to the",
	"  request as `X-Sig`. Services validate before processing.",
	"- **Tracing**: w3c traceparent generated if absent; propagated otherwise.",
	"",
	"## 3. Service router",
	"",
	"Inside each service container, a router (chi-style) maps method+path to",
	"a handler. Middleware: auth (verify JWT, populate request context),",
	"audit (log request shape minus PII), rate limit (per-user backstop in",
	"case the gateway misses).",
	"",
	"## 4. Handler",
	"",
	"Handlers are intentionally thin — parse + validate input, call into the",
	"service layer, marshal the result. The service layer holds business",
	"logic and is testable without HTTP plumbing.",
	"",
	"## 5. Persistence",
	"",
	"The service layer talks to the data layer via a thin repository",
	"interface. Reads can hit the read replica; writes go to the primary.",
	"Caching sits between the repository and the database — Redis, with a",
	"30-second TTL on hot keys.",
	"",
	"## 6. Async fanout",
	"",
	"Side effects (outbound webhooks, ML feature recomputation, audit log",
	"shipping) are enqueued on Kafka topics from the service layer, then",
	"processed by dedicated worker pools. The handler doesn't wait.",
	"",
	"## 7. Response",
	"",
	"On the way back: the handler returns a typed result, the marshaller",
	"emits JSON, the gateway adds CORS + cache headers, the LB compresses",
	"if accept-encoding allows it. End-to-end p50 hovers around 18ms when",
	"the cache is warm.",
	"",
	"That's the full trace. Want me to drill into any one stage?",
}, "\n")

// longPerfWriteup is the third long-reply variant — a profiling
// triage memo.
var longPerfWriteup = strings.Join([]string{
	"## Profiling triage",
	"",
	"If the service is slow and you don't know why, walk these in order.",
	"Each step takes minutes; together they catch ~80% of perf bugs.",
	"",
	"## 1. CPU profile (pprof)",
	"",
	"Pull a 30s CPU profile from production at peak. Look for:",
	"",
	"- One function dominating the flame graph (>30% self-time). Usually",
	"  a regex compile inside a hot path, an unbounded JSON unmarshal, or",
	"  a serial loop that should fan out.",
	"- Allocator overhead (runtime.mallocgc) above ~15%. Means you're",
	"  thrashing the GC — pool the buffers, switch to value receivers, or",
	"  pre-size the slices.",
	"- Lock contention (sync.Mutex.Lock above ~10%). Indicates a single",
	"  shared structure that's serialising the request fleet.",
	"",
	"## 2. Heap profile",
	"",
	"After CPU, take a heap snapshot. Look for:",
	"",
	"- A single allocator above ~25% of in-use space. Usually a cache",
	"  with no eviction, a sync.Map without periodic compaction, or a",
	"  goroutine leak holding onto request-scoped buffers.",
	"- Allocation rate (alloc_objects) higher than necessary — same fix",
	"  set as CPU's allocator overhead.",
	"",
	"## 3. Trace (runtime/trace)",
	"",
	"Capture a 5s trace under load. Open in `go tool trace`. Look for:",
	"",
	"- GC pauses spanning many goroutines. If pause > 5ms regularly, see",
	"  heap. If pauses are rare but huge, you have a fragmentation issue.",
	"- Long stretches of single-goroutine work. Suggests serial code that",
	"  could parallelise (errgroup with bounded concurrency is the easy",
	"  fix).",
	"- Network I/O dominating the wallclock. Means the bottleneck is",
	"  downstream, not in your service.",
	"",
	"## 4. Database",
	"",
	"If the above didn't pin it, the bottleneck is probably the DB:",
	"",
	"- pg_stat_statements: top 5 queries by total_time. Almost always one",
	"  is missing an index or is a Cartesian product.",
	"- Connection pool exhaustion: if pool wait time > 0, you're under-",
	"  provisioned (or holding connections too long inside transactions).",
	"- Lock waits: pg_locks joined to pg_stat_activity. Long waits on a",
	"  shared row mean a hot key — shard the writes or batch them.",
	"",
	"## 5. Network",
	"",
	"Last resort, but cheap to check: sar -n DEV 1, look at retransmits.",
	"If high, the LB↔service path has a flaky link. Move the service or",
	"raise it with the network team — there's nothing to fix in code.",
	"",
	"That's the full profiling pass. Most outages get caught in the first",
	"two steps; the rest of the list is the long tail.",
}, "\n")

// SSSSSSSSS1: realistic payloads for multiToolVariants[0] — the
// original 2-line main.go was too shallow to demo the expand /
// per-part navigation flows. These are hand-written to feel like
// a real small Go service so the splash scenario gives the viewer
// something actually worth paging through.

var multiToolVariant0MainGo = strings.Join([]string{
	"package main",
	"",
	"import (",
	"\t\"context\"",
	"\t\"errors\"",
	"\t\"flag\"",
	"\t\"fmt\"",
	"\t\"log\"",
	"\t\"net/http\"",
	"\t\"os\"",
	"\t\"os/signal\"",
	"\t\"syscall\"",
	"\t\"time\"",
	"",
	"\t\"example.com/svc/internal/handlers\"",
	"\t\"example.com/svc/internal/store\"",
	")",
	"",
	"func main() {",
	"\taddr := flag.String(\"addr\", \":8080\", \"listen address\")",
	"\tdbURL := flag.String(\"db\", os.Getenv(\"DB_URL\"), \"postgres URL\")",
	"\tflag.Parse()",
	"",
	"\tif *dbURL == \"\" {",
	"\t\tprintln(\"fatal: --db or DB_URL required\")",
	"\t\tos.Exit(2)",
	"\t}",
	"",
	"\tctx, cancel := context.WithCancel(context.Background())",
	"\tdefer cancel()",
	"",
	"\tdb, err := store.Open(ctx, *dbURL)",
	"\tif err != nil {",
	"\t\tprintln(\"fatal: db open:\", err.Error())",
	"\t\tos.Exit(1)",
	"\t}",
	"\tdefer db.Close()",
	"",
	"\th := handlers.New(db)",
	"\tsrv := &http.Server{Addr: *addr, Handler: h, ReadHeaderTimeout: 5 * time.Second}",
	"",
	"\tprintln(\"listening on\", *addr)",
	"\tgo func() {",
	"\t\tif err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {",
	"\t\t\tlog.Fatal(\"server:\", err)",
	"\t\t}",
	"\t}()",
	"",
	"\tsig := make(chan os.Signal, 1)",
	"\tsignal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)",
	"\t<-sig",
	"\tprintln(\"shutting down …\")",
	"",
	"\tshutdownCtx, shutdownCancel := context.WithTimeout(ctx, 10*time.Second)",
	"\tdefer shutdownCancel()",
	"\tif err := srv.Shutdown(shutdownCtx); err != nil {",
	"\t\tfmt.Fprintln(os.Stderr, \"shutdown:\", err)",
	"\t}",
	"\tprintln(\"done\")",
	"}",
}, "\n")

var multiToolVariant0HandlersGo = strings.Join([]string{
	"package handlers",
	"",
	"import (",
	"\t\"encoding/json\"",
	"\t\"net/http\"",
	"\t\"time\"",
	"",
	"\t\"example.com/svc/internal/store\"",
	")",
	"",
	"// New returns an http.Handler wired to the given store.",
	"func New(db *store.Store) http.Handler {",
	"\tmux := http.NewServeMux()",
	"\tmux.Handle(\"/health\", withLogging(http.HandlerFunc(healthHandler)))",
	"\tmux.Handle(\"/users\", withLogging(&usersHandler{db: db}))",
	"\tmux.Handle(\"/users/\", withLogging(&userByIDHandler{db: db}))",
	"\treturn mux",
	"}",
	"",
	"func withLogging(next http.Handler) http.Handler {",
	"\treturn http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {",
	"\t\tstart := time.Now()",
	"\t\tnext.ServeHTTP(w, r)",
	"\t\tprintln(\"[req]\", r.Method, r.URL.Path, time.Since(start).String())",
	"\t})",
	"}",
	"",
	"func healthHandler(w http.ResponseWriter, r *http.Request) {",
	"\tw.Header().Set(\"Content-Type\", \"application/json\")",
	"\tjson.NewEncoder(w).Encode(map[string]string{\"status\": \"ok\"})",
	"}",
	"",
	"type usersHandler struct{ db *store.Store }",
	"",
	"func (h *usersHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {",
	"\tswitch r.Method {",
	"\tcase http.MethodGet:",
	"\t\tus, err := h.db.ListUsers(r.Context())",
	"\t\tif err != nil {",
	"\t\t\tprintln(\"users list:\", err.Error())",
	"\t\t\thttp.Error(w, \"internal\", http.StatusInternalServerError)",
	"\t\t\treturn",
	"\t\t}",
	"\t\tjson.NewEncoder(w).Encode(us)",
	"\tcase http.MethodPost:",
	"\t\tvar u store.User",
	"\t\tif err := json.NewDecoder(r.Body).Decode(&u); err != nil {",
	"\t\t\thttp.Error(w, \"bad json\", http.StatusBadRequest)",
	"\t\t\treturn",
	"\t\t}",
	"\t\tif err := h.db.InsertUser(r.Context(), u); err != nil {",
	"\t\t\tprintln(\"users insert:\", err.Error())",
	"\t\t\thttp.Error(w, \"internal\", http.StatusInternalServerError)",
	"\t\t\treturn",
	"\t\t}",
	"\t\tw.WriteHeader(http.StatusCreated)",
	"\tdefault:",
	"\t\thttp.Error(w, \"method not allowed\", http.StatusMethodNotAllowed)",
	"\t}",
	"}",
}, "\n")

var multiToolVariant0GrepHits = strings.Join([]string{
	"main.go:26:\tprintln(\"fatal: --db or DB_URL required\")",
	"main.go:34:\tprintln(\"fatal: db open:\", err.Error())",
	"main.go:45:\tprintln(\"listening on\", *addr)",
	"main.go:56:\tprintln(\"shutting down …\")",
	"main.go:66:\tprintln(\"done\")",
	"internal/handlers/handlers.go:25:\t\tprintln(\"[req]\", r.Method, r.URL.Path, time.Since(start).String())",
	"internal/handlers/handlers.go:39:\t\t\tprintln(\"users list:\", err.Error())",
	"internal/handlers/handlers.go:51:\t\t\tprintln(\"users insert:\", err.Error())",
	"internal/store/store.go:18:\tprintln(\"store: opening\", url)",
	"internal/store/store.go:27:\tprintln(\"store: ping failed,\", err.Error())",
	"internal/store/store.go:62:\tprintln(\"store: closing\")",
	"internal/middleware/auth.go:14:\tprintln(\"[auth]\", r.Header.Get(\"Authorization\"))",
	"internal/middleware/auth.go:31:\tprintln(\"[auth] bypass for health check\")",
	"internal/middleware/ratelimit.go:22:\tprintln(\"[rate-limit] exceeded\", r.RemoteAddr)",
}, "\n")

// SSSSSSSSS1: diff payload for variant 0 — swaps every `println(...)`
// in main.go for `log.Println(...)` (and `log.Printf` where args are
// formatted). Scoped to main.go so the proposed edit matches the
// `{"path":"main.go"}` claim in the edit_file tool call.
var multiToolVariant0DiffBefore = multiToolVariant0MainGo

var multiToolVariant0DiffAfter = strings.Join([]string{
	"package main",
	"",
	"import (",
	"\t\"context\"",
	"\t\"errors\"",
	"\t\"flag\"",
	"\t\"fmt\"",
	"\t\"log\"",
	"\t\"net/http\"",
	"\t\"os\"",
	"\t\"os/signal\"",
	"\t\"syscall\"",
	"\t\"time\"",
	"",
	"\t\"example.com/svc/internal/handlers\"",
	"\t\"example.com/svc/internal/store\"",
	")",
	"",
	"func main() {",
	"\taddr := flag.String(\"addr\", \":8080\", \"listen address\")",
	"\tdbURL := flag.String(\"db\", os.Getenv(\"DB_URL\"), \"postgres URL\")",
	"\tflag.Parse()",
	"",
	"\tif *dbURL == \"\" {",
	"\t\tlog.Println(\"fatal: --db or DB_URL required\")",
	"\t\tos.Exit(2)",
	"\t}",
	"",
	"\tctx, cancel := context.WithCancel(context.Background())",
	"\tdefer cancel()",
	"",
	"\tdb, err := store.Open(ctx, *dbURL)",
	"\tif err != nil {",
	"\t\tlog.Printf(\"fatal: db open: %v\", err)",
	"\t\tos.Exit(1)",
	"\t}",
	"\tdefer db.Close()",
	"",
	"\th := handlers.New(db)",
	"\tsrv := &http.Server{Addr: *addr, Handler: h, ReadHeaderTimeout: 5 * time.Second}",
	"",
	"\tlog.Printf(\"listening on %s\", *addr)",
	"\tgo func() {",
	"\t\tif err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {",
	"\t\t\tlog.Fatal(\"server:\", err)",
	"\t\t}",
	"\t}()",
	"",
	"\tsig := make(chan os.Signal, 1)",
	"\tsignal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)",
	"\t<-sig",
	"\tlog.Println(\"shutting down …\")",
	"",
	"\tshutdownCtx, shutdownCancel := context.WithTimeout(ctx, 10*time.Second)",
	"\tdefer shutdownCancel()",
	"\tif err := srv.Shutdown(shutdownCtx); err != nil {",
	"\t\tfmt.Fprintln(os.Stderr, \"shutdown:\", err)",
	"\t}",
	"\tlog.Println(\"done\")",
	"}",
}, "\n")
