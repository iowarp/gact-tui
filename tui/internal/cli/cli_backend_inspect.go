package cli

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

// runWatch polls GetSession every --interval and prints one TSV row
// per status change: time<TAB>status<TAB>messages<TAB>tokens_out.
// Different from `gact wait` (which exits on first idle): this
// surfaces transitions, useful for "what's the agent doing?" tail.
// Stops after status hits idle and stays idle for one extra interval.
func runWatch(args []string) int {
	var (
		interval *time.Duration
		format   *string
	)
	cc, rest, code := newCmdCtx("watch", args,
		withTimeout(5*time.Minute, "abandon after this long"),
		withFlags(func(fs *flag.FlagSet) {
			interval = fs.Duration("interval", time.Second, "polling cadence")
			// SSSS1: --format json emits one NDJSON record per state change
			// for jq pipelines. Default tsv kept for back-compat.
			format = fs.String("format", "tsv", "tsv | json (NDJSON, one record per state change)")
		}),
	)
	if cc == nil {
		return code
	}
	if len(rest) != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact watch <session_id> [--interval DUR] [--timeout DUR] [--format tsv|json]")
		return 2
	}
	if *format != "tsv" && *format != "json" {
		fmt.Fprintf(os.Stderr, "gact watch: unknown format %q (want tsv|json)\n", *format)
		return 2
	}
	sid := rest[0]
	c := cc.client
	ctx, cancel := context.WithTimeout(context.Background(), cc.timeout)
	defer cancel()
	prevStatus, prevMessages, prevTokens := "", -1, -1
	sawActivity := false
	idleStreak := 0
	tick := time.NewTicker(*interval)
	defer tick.Stop()
	emit := func(s gact.Session) {
		now := time.Now().UTC()
		if *format == "json" {
			rec := map[string]any{
				"ts":            now.Format(time.RFC3339Nano),
				"sid":           s.ID,
				"status":        s.Status,
				"message_count": s.MessageCount,
				"tokens_out":    s.Tokens.Output,
			}
			b, err := json.Marshal(rec)
			if err != nil {
				return
			}
			os.Stdout.Write(b)
			os.Stdout.Write([]byte{'\n'})
			return
		}
		fmt.Printf("%s\t%s\t%d\t%d\n",
			now.Format("15:04:05"),
			s.Status, s.MessageCount, s.Tokens.Output)
	}
	for {
		s, err := c.GetSession(ctx, sid)
		if err != nil {
			if ctx.Err() != nil {
				fmt.Fprintln(os.Stderr, "gact watch: timeout")
				return 1
			}
			fmt.Fprintf(os.Stderr, "gact watch: %v\n", err)
			return 1
		}
		// Activity = any non-idle status, or any change in message/token
		// counts after the first poll. Either signal means we've seen
		// the session do something — without it, --timeout is the only
		// exit. The first poll itself never counts (prevMessages == -1).
		if s.Status != "idle" {
			sawActivity = true
		}
		if prevMessages != -1 && (s.MessageCount != prevMessages || s.Tokens.Output != prevTokens) {
			sawActivity = true
		}
		if s.Status != prevStatus || s.MessageCount != prevMessages || s.Tokens.Output != prevTokens {
			emit(s)
			prevStatus = s.Status
			prevMessages = s.MessageCount
			prevTokens = s.Tokens.Output
			idleStreak = 0
		} else if s.Status == "idle" && sawActivity {
			idleStreak++
			if idleStreak >= 2 {
				return 0
			}
		}
		select {
		case <-tick.C:
		case <-ctx.Done():
			fmt.Fprintln(os.Stderr, "gact watch: timeout")
			return 1
		}
	}
}

// runTool dispatches the `gact tool <verb>` family. Right now only
// `show` is implemented (list is covered by `gact catalog tools`):
//
//	gact tool show <id> [--format text|json]
func runTool(args []string) int {
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, "usage: gact tool show <id> [--format text|json]")
		return 2
	}
	verb := args[0]
	if verb != "show" {
		fmt.Fprintf(os.Stderr, "gact tool: unknown verb %q (want show — list is `gact catalog tools`)\n", verb)
		return 2
	}
	var format *string
	cc, rest, code := newCmdCtx("tool show", args[1:], withFlags(func(fs *flag.FlagSet) {
		format = fs.String("format", "text", "text | json")
	}))
	if cc == nil {
		return code
	}
	if len(rest) != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact tool show <id> [--format text|json]")
		return 2
	}
	if *format != "text" && *format != "json" {
		fmt.Fprintf(os.Stderr, "gact tool show: unknown format %q\n", *format)
		return 2
	}
	c := cc.client
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	t, err := c.GetTool(ctx, rest[0])
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact tool show: %v\n", err)
		return 1
	}
	if *format == "json" {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		_ = enc.Encode(t)
		return 0
	}
	fmt.Printf("id:                 %s\n", t.ID)
	fmt.Printf("source:             %s\n", t.Source)
	if t.ServerID != "" {
		fmt.Printf("server_id:          %s\n", t.ServerID)
	}
	fmt.Printf("name:               %s\n", t.Name)
	if t.Title != "" {
		fmt.Printf("title:              %s\n", t.Title)
	}
	if t.Description != "" {
		fmt.Printf("description:        %s\n", t.Description)
	}
	if t.PermissionDefault != "" {
		fmt.Printf("permission_default: %s\n", t.PermissionDefault)
	}
	if len(t.InputSchema) > 0 {
		schema, _ := json.MarshalIndent(t.InputSchema, "", "  ")
		fmt.Printf("input_schema:\n%s\n", schema)
	}
	if len(t.OutputSchema) > 0 {
		schema, _ := json.MarshalIndent(t.OutputSchema, "", "  ")
		fmt.Printf("output_schema:\n%s\n", schema)
	}
	return 0
}
