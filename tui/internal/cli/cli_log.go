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

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// runLog dumps a session's conversation to stdout in a human-readable
// shape — `[role] message text` per turn, with one-line summaries of
// tool_call / tool_result parts. Exits 0 on success. Useful to read
// what happened in a session without launching the TUI.
//
// Output is intentionally plain (no ANSI) so it's grep-friendly. If
// users want JSON, they should use `gact export <sid>` which already
// returns the raw blob.
func runLog(args []string) int {
	var (
		limit  *int
		since  *time.Duration
		format *string
		role   *string
		grep   *string
	)
	cc, rest, code := newCmdCtx("log", args, withFlags(func(fs *flag.FlagSet) {
		limit = fs.Int("limit", 100, "max messages to print")
		since = fs.Duration("since", 0, "only print messages with created_at within the last DUR (e.g. 5m, 1h); 0 = unset")
		// --format json emits NDJSON (one message per line) so
		// callers can pipe to jq. Default stays text for back-compat.
		format = fs.String("format", "text", "text | json (NDJSON, one message per line)")
		// --role filter narrows to one or more roles
		// (comma-separated). Accepted: user|assistant|tool|system. Empty
		// = show everything (back-compat).
		role = fs.String("role", "", "comma-separated role filter: user|assistant|tool|system")
		// --grep PATTERN drops messages whose flattened text
		// doesn't match the regex (case-insensitive by default — prepend
		// `(?-i)` to override). Composes with --role/--since/--limit.
		grep = fs.String("grep", "", "regex: drop messages whose flattened text doesn't match (case-insensitive)")
	}))
	if cc == nil {
		return code
	}
	if len(rest) != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact log <session_id> [--limit N] [--since DUR] [--role user,assistant,...] [--grep REGEX] [--format text|json] [--backend URL]")
		return 2
	}
	if *format != "text" && *format != "json" {
		fmt.Fprintf(os.Stderr, "gact log: unknown format %q (want text|json)\n", *format)
		return 2
	}
	// Compile the regex up-front so a bad pattern errors
	// fast instead of silently producing an empty log. Default to
	// case-insensitive; callers who need case-sensitive can prefix
	// the pattern with `(?-i)`.
	var grepRE *regexp.Regexp
	if *grep != "" {
		re, err := regexp.Compile("(?i)" + *grep)
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact log: bad --grep pattern %q: %v\n", *grep, err)
			return 2
		}
		grepRE = re
	}
	// Validate + build the role keep-set up front so a
	// typo in --role errors fast instead of silently returning an
	// empty log.
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
				fmt.Fprintf(os.Stderr, "gact log: unknown --role %q (want user|assistant|tool|system)\n", r)
				return 2
			}
		}
	}
	sid := rest[0]

	c := cc.client
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	msgs, _, err := c.ListMessages(ctx, client.MessageFilter{SessionID: sid, Limit: *limit, IncludeSystem: true})
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact log: %v\n", err)
		return 1
	}
	// --since drops messages older than the cutoff. Computed
	// once vs each message's CreatedAt; missing timestamps survive
	// (unprintable to filter).
	if *since > 0 {
		cutoff := time.Now().UTC().Add(-*since)
		filtered := msgs[:0]
		for _, m := range msgs {
			if m.CreatedAt.IsZero() || !m.CreatedAt.Before(cutoff) {
				filtered = append(filtered, m)
			}
		}
		msgs = filtered
	}
	// Drop messages whose role isn't in the keep-set.
	// Applied after --since so both filters stack cleanly.
	if keepRole != nil {
		kept := msgs[:0]
		for _, m := range msgs {
			if keepRole[string(m.Role)] {
				kept = append(kept, m)
			}
		}
		msgs = kept
	}
	// Drop messages whose flattened text doesn't match
	// the --grep regex. Uses the same messageText() helper the
	// clipboard path uses so the search target matches what the
	// user actually sees in the rendered log (text + thinking, tool
	// calls + results excluded). Messages with no text content
	// (e.g. pure tool_call assistant turns) never match.
	if grepRE != nil {
		kept := msgs[:0]
		for _, m := range msgs {
			txt, ok := flattenMessageForGrep(m)
			if !ok {
				continue
			}
			if grepRE.MatchString(txt) {
				kept = append(kept, m)
			}
		}
		msgs = kept
	}
	if *format == "json" {
		enc := json.NewEncoder(os.Stdout)
		// One message per line — explicit no-indent so it's true
		// NDJSON, not pretty-printed JSON-Lines.
		for _, m := range msgs {
			if err := enc.Encode(m); err != nil {
				fmt.Fprintf(os.Stderr, "gact log: encode: %v\n", err)
				return 1
			}
		}
		return 0
	}
	for _, m := range msgs {
		printLogMessage(m)
	}
	return 0
}
