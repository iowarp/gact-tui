package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
	"github.com/JaimeCernuda/gact-tui/tui/internal/config"
)

// runStream is `gact tail` with a human-friendly one-liner format:
//
//	14:32:01  message.created          msg=msg_abc role=user
//	14:32:01  message.part.added       part=text
//	14:32:01  message.part.delta       text+=I'll take a look. First, ...
//	14:32:02  message.part.completed
//	14:32:02  message.completed
//
// One row per event so a long stream remains scannable. JSON-line
// output stays available via `gact tail`.
func runStream(args []string) int {
	fs := flag.NewFlagSet("stream", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	wsID := fs.String("workspace", "", "workspace-scoped stream when no session_id")
	// UUUU1: --filter mirrors `gact tail --filter` (RRR1) so the
	// human-readable view can drop noise (e.g. message.part.delta
	// floods) just as easily as the JSON view.
	filter := fs.String("filter", "", "comma-separated event types to keep; empty = all")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--workspace": true, "-workspace": true,
		"--filter": true, "-filter": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	var keep map[string]bool
	if *filter != "" {
		keep = map[string]bool{}
		for _, t := range strings.Split(*filter, ",") {
			if t = strings.TrimSpace(t); t != "" {
				keep[t] = true
			}
		}
	}
	scope := client.EventStreamScope{WorkspaceID: *wsID}
	if fs.NArg() == 1 {
		scope.SessionID = fs.Arg(0)
	} else if fs.NArg() > 1 {
		fmt.Fprintln(os.Stderr, "usage: gact stream [session_id] [--workspace WS_ID] [--filter type1,type2]")
		return 2
	}
	if scope.SessionID == "" && scope.WorkspaceID == "" {
		fmt.Fprintln(os.Stderr, "gact stream: pass <session_id> or --workspace WS_ID")
		return 2
	}

	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	events, errs, err := c.StreamEvents(ctx, scope)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact stream: connect: %v\n", err)
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
			if keep != nil && !keep[e.Type] {
				continue
			}
			fmt.Println(streamRow(e))
		case err, ok := <-errs:
			if !ok {
				return 0
			}
			if err != nil {
				fmt.Fprintf(os.Stderr, "gact stream: %v\n", err)
				return 1
			}
		}
	}
}

// streamRow formats a single SSEEvent as `HH:MM:SS type summary`. The
// summary is event-type-specific: message events show role / part
// type / delta preview; status changes show old → new; errors show
// the message. Unknown types fall through to "type=name" only.
func streamRow(e client.SSEEvent) string {
	now := time.Now().UTC().Format("15:04:05")
	pl, _ := e.Payload["payload"].(map[string]any)
	summary := ""
	switch e.Type {
	case "message.created":
		role, _ := pickPath(pl, "role").(string)
		mid, _ := pickPath(pl, "id").(string)
		summary = fmt.Sprintf("msg=%s role=%s", mid, role)
	case "message.part.added":
		ptype, _ := pickPath(pl, "part", "type").(string)
		summary = "part=" + ptype
	case "message.part.delta":
		delta, _ := pickPath(pl, "delta").(map[string]any)
		if t, ok := delta["text_append"].(string); ok && t != "" {
			summary = "text+=" + truncateForRow(t)
		} else if th, ok := delta["thinking_append"].(string); ok && th != "" {
			summary = "thinking+=" + truncateForRow(th)
		} else if ji, ok := delta["input_json_append"].(string); ok && ji != "" {
			summary = "tool_input+=" + truncateForRow(ji)
		}
	case "session.status_changed":
		st, _ := pickPath(pl, "status").(string)
		reason, _ := pickPath(pl, "reason").(string)
		summary = "status=" + st
		if reason != "" {
			summary += " reason=" + reason
		}
	case "permission.requested":
		sum, _ := pickPath(pl, "summary").(string)
		summary = truncateForRow(sum)
	case "cost.updated":
		cost, _ := pickPath(pl, "cost_usd").(float64)
		summary = fmt.Sprintf("cost=$%.4f", cost)
	case "notification":
		// MMM1: backend-pushed banner-worthy message.
		level, _ := pickPath(pl, "level").(string)
		title, _ := pickPath(pl, "title").(string)
		body, _ := pickPath(pl, "body").(string)
		if level == "" {
			level = "info"
		}
		summary = fmt.Sprintf("[%s] %s", level, title)
		if body != "" {
			summary += " — " + truncateForRow(body)
		}
	}
	return fmt.Sprintf("%s  %-30s %s", now, e.Type, summary)
}

// pickPath traverses a nested map by string keys, returning the leaf
// value or nil. Avoids a chain of nested-cast guards in streamRow.
func pickPath(m map[string]any, keys ...string) any {
	cur := any(m)
	for _, k := range keys {
		mm, ok := cur.(map[string]any)
		if !ok {
			return nil
		}
		cur = mm[k]
	}
	return cur
}

// truncateForRow caps a string at 60 chars so the one-liner stays
// scannable even for fat text deltas. Replaces newlines with `↵`
// so a paragraph delta renders as a single visual row.
func truncateForRow(s string) string {
	s = strings.ReplaceAll(s, "\n", "↵")
	if len(s) > 60 {
		s = s[:57] + "..."
	}
	return s
}
