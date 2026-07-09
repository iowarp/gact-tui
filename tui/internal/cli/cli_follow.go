package cli

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// runFollow is `tail -f` for a session's conversation log. Prints
// the existing messages, then subscribes to SSE for the session and
// renders any newly-completed assistant/tool messages until Ctrl+C.
// (ZZZ1)
func runFollow(args []string) int {
	var (
		format *string
		role   *string
		grep   *string
		since  *time.Duration
	)
	cc, rest, code := newCmdCtx("follow", args, withFlags(func(fs *flag.FlagSet) {
		// --format json emits NDJSON (one message per line) for
		// both the snapshot and streamed messages. Default text mode
		// unchanged.
		format = fs.String("format", "text", "text | json (NDJSON)")
		// --role filter mirrors `gact log --role`.
		// Applied to both the snapshot and every streamed message so
		// `gact follow <sid> --role assistant` tails just the model's
		// replies.
		role = fs.String("role", "", "comma-separated role filter: user|assistant|tool|system")
		// --grep regex filter mirrors `gact log --grep`.
		// Applied to both the snapshot + every
		// streamed message.
		grep = fs.String("grep", "", "regex: drop messages whose flattened text doesn't match (case-insensitive)")
		// --since DUR trims the initial snapshot to messages
		// created within the last DUR. Streamed messages are live so the
		// cutoff doesn't apply to them.
		since = fs.Duration("since", 0, "trim snapshot to messages created within the last DUR (e.g. 5m, 1h); 0 = unset")
	}))
	if cc == nil {
		return code
	}
	if len(rest) != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact follow <session_id> [--role user,assistant,...] [--grep REGEX] [--since DUR] [--format text|json]")
		return 2
	}
	if *format != "text" && *format != "json" {
		fmt.Fprintf(os.Stderr, "gact follow: unknown format %q (want text|json)\n", *format)
		return 2
	}
	// Build + validate the keep-set up front so a typo
	// errors fast instead of silently producing an empty stream.
	var keepRole map[string]bool
	if *role != "" {
		keepRole = map[string]bool{}
		for _, r := range strings.Split(*role, ",") {
			r = strings.TrimSpace(r)
			switch r {
			case "":
			case "user", "assistant", "tool", "system":
				keepRole[r] = true
			default:
				fmt.Fprintf(os.Stderr, "gact follow: unknown --role %q (want user|assistant|tool|system)\n", r)
				return 2
			}
		}
	}
	// Compile the regex up-front so a bad pattern
	// errors fast before we subscribe to SSE.
	var grepRE *regexp.Regexp
	if *grep != "" {
		re, err := regexp.Compile("(?i)" + *grep)
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact follow: bad --grep pattern %q: %v\n", *grep, err)
			return 2
		}
		grepRE = re
	}
	emit := func(m gact.Message) {
		if keepRole != nil && !keepRole[string(m.Role)] {
			return
		}
		if grepRE != nil {
			txt, ok := flattenMessageForGrep(m)
			if !ok || !grepRE.MatchString(txt) {
				return
			}
		}
		if *format == "json" {
			b, err := json.Marshal(m)
			if err != nil {
				return
			}
			os.Stdout.Write(b)
			os.Stdout.Write([]byte{'\n'})
			return
		}
		printLogMessage(m)
	}
	sid := rest[0]
	c := cc.client

	// 1. Snapshot the existing log so the user lands on the latest
	//    state, not an empty pane. ListMessages returns newest-first;
	//    reverse for chronological display.
	listCtx, listCancel := context.WithTimeout(context.Background(), 10*time.Second)
	msgs, _, err := c.ListMessages(listCtx, client.MessageFilter{
		SessionID: sid, Limit: 200, IncludeSystem: true,
	})
	listCancel()
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact follow: list: %v\n", err)
		return 1
	}
	// --since DUR drops snapshot messages older than the
	// cutoff before emit. Mirrors `gact log --since`. Zero-
	// CreatedAt survives (defensive against backends that don't
	// stamp). Streamed messages are live so the cutoff doesn't
	// apply to them — seen-tracking below still uses the full
	// listing so SSE replay doesn't re-emit a message that was
	// older than --since but is still in the backend's history.
	snapshotEmit := msgs
	if *since > 0 {
		cutoff := time.Now().UTC().Add(-*since)
		trimmed := make([]gact.Message, 0, len(msgs))
		for _, m := range msgs {
			if m.CreatedAt.IsZero() || !m.CreatedAt.Before(cutoff) {
				trimmed = append(trimmed, m)
			}
		}
		snapshotEmit = trimmed
	}
	for i := len(snapshotEmit) - 1; i >= 0; i-- {
		emit(snapshotEmit[i])
	}
	// Track ids we've already printed so the SSE loop doesn't
	// re-render the snapshot (replay events arrive on every connect).
	// NB: seen is populated off the FULL msgs slice even when --since
	// trims the emit set, so the SSE loop doesn't re-emit older
	// messages on replay.
	seen := map[string]bool{}
	for _, m := range msgs {
		seen[m.ID] = true
	}

	// 2. Subscribe to SSE for the session. On message.completed, fetch
	//    the message (one quick ListMessages with that mid filter would
	//    be ideal but we just use limit=1+seen-tracking) and render.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	events, errs, err := c.StreamEvents(ctx, client.EventStreamScope{SessionID: sid})
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact follow: subscribe: %v\n", err)
		return 1
	}
	for {
		select {
		case <-ctx.Done():
			return 0
		case e, ok := <-events:
			if !ok {
				return 0
			}
			if e.Type != "message.completed" && e.Type != "message.created" {
				continue
			}
			pl, _ := e.Payload["payload"].(map[string]any)
			var mid string
			if msgID, ok := pl["message_id"].(string); ok {
				mid = msgID
			} else if msg, ok := pl["message"].(map[string]any); ok {
				if id, ok := msg["id"].(string); ok {
					mid = id
				}
			}
			if mid == "" || seen[mid] {
				continue
			}
			// Refetch the canonical message — we want the
			// completed parts, not the part-by-part deltas.
			fetchCtx, fetchCancel := context.WithTimeout(context.Background(), 5*time.Second)
			latest, _, ferr := c.ListMessages(fetchCtx, client.MessageFilter{
				SessionID: sid, Limit: 50, IncludeSystem: true,
			})
			fetchCancel()
			if ferr != nil {
				continue
			}
			for i := len(latest) - 1; i >= 0; i-- {
				m := latest[i]
				if seen[m.ID] {
					continue
				}
				emit(m)
				seen[m.ID] = true
			}
		case err, ok := <-errs:
			if !ok {
				return 0
			}
			if err != nil {
				fmt.Fprintf(os.Stderr, "gact follow: stream: %v\n", err)
				return 1
			}
		}
	}
}
