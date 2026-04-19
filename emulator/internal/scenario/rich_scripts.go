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
	e.publishStatus(sessionID, gact.StatusRunning)
	asst, err := e.createAssistantMessage(sessionID)
	if err != nil {
		return
	}
	// Short thinking — this variant is about reply length, not
	// thinking length.
	thinking, _ := e.addPart(sessionID, asst.ID, gact.NewThinkingPart(""))
	_ = e.streamText(ctx, sessionID, asst.ID, thinking.ID,
		"The user wants a longform writeup. Let me lay it out in sections.\n",
		"thinking")
	e.completePart(sessionID, asst.ID, thinking.ID)
	if err := sleep(ctx, e.cfg.Timing.BetweenParts); err != nil {
		return
	}

	body, _ := e.addPart(sessionID, asst.ID, gact.NewTextPart(""))
	_ = e.streamText(ctx, sessionID, asst.ID, body.ID, longReplyText, "text")
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
	e.publishStatus(sessionID, gact.StatusRunning)
	asst, err := e.createAssistantMessage(sessionID)
	if err != nil {
		return
	}
	intro, _ := e.addPart(sessionID, asst.ID, gact.NewTextPart(""))
	_ = e.streamText(ctx, sessionID, asst.ID, intro.ID,
		"I'll investigate in three steps: read the file, grep for the "+
			"problematic pattern, then propose an edit.", "text")
	e.completePart(sessionID, asst.ID, intro.ID)

	tools := []struct {
		name   string
		input  string
		result string
	}{
		{"read_file", `{"path":"main.go"}`, "package main\n\nfunc main() { println(\"hello\") }\n"},
		{"grep", `{"pattern":"println","path":"."}`, "main.go:3:\tprintln(\"hello\")\n"},
		{"edit_file", `{"path":"main.go","line":3,"new":"\tlog.Println(\"hello\")"}`, "ok"},
	}
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
	e.completeMessage(sessionID, asst.ID, gact.StopReasonToolUse)

	final, _ := e.createAssistantMessage(sessionID)
	finalP, _ := e.addPart(sessionID, final.ID, gact.NewTextPart(""))
	_ = e.streamText(ctx, sessionID, final.ID, finalP.ID,
		"Done. Three steps: read the file, found the `println`, swapped "+
			"it for `log.Println`. Want a diff view instead?", "text")
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
