package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"strings"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
	"github.com/JaimeCernuda/gact-tui/tui/internal/config"
)

// runTail streams SSE events for a session (or workspace) to stdout
// as newline-delimited JSON. Each line contains {"type", "seq",
// "payload"}. Exits when the connection closes or Ctrl+C fires.
//
// Usage examples:
//
//	gact tail sess_abc123              # one session
//	gact tail --workspace ws_default   # workspace-scoped stream
//	gact tail SID | jq '.type'         # filter on event type
func runTail(args []string) int {
	fs := flag.NewFlagSet("tail", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	wsID := fs.String("workspace", "", "workspace-scoped stream (when no session_id)")
	filter := fs.String("filter", "", "comma-separated event types to keep (e.g. permission.requested,tool.call.completed); empty = all")
	// TTTT1: --format text reuses the runStream `streamRow()`
	// human-readable formatter. Default kept as json (NDJSON) for
	// back-compat with existing scripting callers.
	format := fs.String("format", "json", "json (NDJSON) | text (one human-readable line per event, like `gact stream`)")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--workspace": true, "-workspace": true,
		"--filter": true, "-filter": true,
		"--format": true, "-format": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if *format != "json" && *format != "text" {
		fmt.Fprintf(os.Stderr, "gact tail: unknown format %q (want json|text)\n", *format)
		return 2
	}
	// RRR1: parse --filter into a quick-lookup set; nil means "all".
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
		fmt.Fprintln(os.Stderr, "usage: gact tail [session_id] [--workspace WS_ID] [--backend URL]")
		return 2
	}
	if scope.SessionID == "" && scope.WorkspaceID == "" {
		fmt.Fprintln(os.Stderr, "gact tail: specify either <session_id> or --workspace WS_ID")
		return 2
	}

	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)

	// Signal handling: Ctrl+C cleanly closes the stream.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	events, errs, err := c.StreamEvents(ctx, scope)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact tail: connect: %v\n", err)
		return 1
	}

	enc := json.NewEncoder(os.Stdout)
	for {
		select {
		case <-ctx.Done():
			return 0
		case e, ok := <-events:
			if !ok {
				return 0
			}
			// RRR1: when --filter is set, drop events whose type
			// isn't in the keep set. nil keep = passthrough.
			if keep != nil && !keep[e.Type] {
				continue
			}
			// TTTT1: --format text reuses streamRow() so the human-
			// readable view matches `gact stream` exactly.
			if *format == "text" {
				fmt.Println(streamRow(e))
				continue
			}
			record := map[string]any{
				"type":    e.Type,
				"seq":     e.SeqID(),
				"payload": e.Payload,
			}
			if err := enc.Encode(record); err != nil {
				fmt.Fprintf(os.Stderr, "gact tail: encode: %v\n", err)
				return 1
			}
		case err, ok := <-errs:
			if !ok {
				return 0
			}
			if err != nil {
				fmt.Fprintf(os.Stderr, "gact tail: stream: %v\n", err)
				return 1
			}
		}
	}
}
