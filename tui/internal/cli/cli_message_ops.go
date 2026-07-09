package cli

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// runDelete DELETEs /v1/sessions/{id}. Exits 0 on 204; 1 on
// transport / API error. Pairs with `gact new` so shell scripts
// can clean up scratch sessions.
func runDelete(args []string) int {
	cc, rest, code := newCmdCtx("delete", args)
	if cc == nil {
		return code
	}
	if len(rest) != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact delete <session_id> [--backend URL]")
		return 2
	}
	sid := rest[0]
	c := cc.client
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := c.DeleteSession(ctx, sid); err != nil {
		fmt.Fprintf(os.Stderr, "gact delete: %v\n", err)
		return 1
	}
	return 0
}

// runDiff dispatches the `gact diff <verb>` family for managing
// file diffs the agent has produced. The contract has apply/reject
// endpoints but no list endpoint, so `list` walks the session's
// messages and aggregates file_diff parts client-side — same logic
// the TUI uses to gate the `a` / `r` keys.
//
//	gact diff list <sid>                — path  status (pending/applied/rejected)
//	gact diff apply <sid> [paths...]    — POST apply
//	gact diff reject <sid> [paths...]   — POST reject
//
// With no paths, apply/reject act on every pending diff.
func runDiff(args []string) int {
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, "usage: gact diff list|apply|reject <session_id> [paths...]")
		return 2
	}
	verb := args[0]
	rest := args[1:]
	switch verb {
	case "list":
		return runDiffList(rest)
	case "apply":
		return runDiffApplyReject(rest, true)
	case "reject":
		return runDiffApplyReject(rest, false)
	default:
		fmt.Fprintf(os.Stderr, "gact diff: unknown verb %q (want list|apply|reject)\n", verb)
		return 2
	}
}

func runDiffList(args []string) int {
	cc, rest, code := newCmdCtx("diff list", args)
	if cc == nil {
		return code
	}
	if len(rest) != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact diff list <session_id>")
		return 2
	}
	sid := rest[0]
	c := cc.client
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	msgs, _, err := c.ListMessages(ctx, client.MessageFilter{SessionID: sid, Limit: 10000})
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact diff list: %v\n", err)
		return 1
	}
	for _, m := range msgs {
		for _, p := range m.Parts {
			if p.Type != gact.PartTypeFileDiff {
				continue
			}
			status := "pending"
			if p.Applied {
				status = "applied"
			}
			if rj, ok := p.Metadata["rejected"].(bool); ok && rj {
				status = "rejected"
			}
			fmt.Printf("%s\t%s\n", p.Path, status)
		}
	}
	return 0
}

func runDiffApplyReject(args []string, apply bool) int {
	verb := "apply"
	if !apply {
		verb = "reject"
	}
	cc, rest, code := newCmdCtx("diff "+verb, args)
	if cc == nil {
		return code
	}
	if len(rest) < 1 {
		fmt.Fprintf(os.Stderr, "usage: gact diff %s <session_id> [paths...]\n", verb)
		return 2
	}
	sid := rest[0]
	var paths []string
	paths = append(paths, rest[1:]...)
	c := cc.client
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	var (
		hit []string
		err error
	)
	if apply {
		var werr map[string]string
		hit, werr, err = c.ApplyDiffs(ctx, sid, paths)
		if err == nil && len(werr) > 0 {
			for p, e := range werr {
				fmt.Fprintf(os.Stderr, "gact diff apply %s: %s\n", p, e)
			}
		}
	} else {
		hit, err = c.RejectDiffs(ctx, sid, paths)
	}
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact diff %s: %v\n", verb, err)
		return 1
	}
	for _, p := range hit {
		fmt.Println(p)
	}
	return 0
}

// runSearch implements `gact search <sid> <query>` — full-text search
// across a session's messages via the §6.3 search endpoint. Output
// columns are `mid<TAB>role<TAB>snippet`; one ListMessages call up
// front resolves message-id → role so the rows include the speaker.
// `--format json` pretty-prints the raw match objects (mid, part_id,
// snippet, score).
func runSearch(args []string) int {
	var format *string
	cc, rest, code := newCmdCtx("search", args, withFlags(func(fs *flag.FlagSet) {
		format = fs.String("format", "tsv", "tsv | json")
	}))
	if cc == nil {
		return code
	}
	if len(rest) < 2 {
		fmt.Fprintln(os.Stderr, "usage: gact search <session_id> <query>")
		return 2
	}
	sid := rest[0]
	query := strings.Join(rest[1:], " ")
	if *format != "tsv" && *format != "json" {
		fmt.Fprintf(os.Stderr, "gact search: unknown format %q (want tsv|json)\n", *format)
		return 2
	}
	c := cc.client
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	matches, err := c.SearchMessages(ctx, sid, query)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact search: %v\n", err)
		return 1
	}
	if *format == "json" {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		if err := enc.Encode(matches); err != nil {
			fmt.Fprintf(os.Stderr, "gact search: %v\n", err)
			return 1
		}
		return 0
	}
	roleByMid := map[string]string{}
	msgs, _, err := c.ListMessages(ctx, client.MessageFilter{SessionID: sid, Limit: 500})
	if err == nil {
		for _, m := range msgs {
			roleByMid[m.ID] = string(m.Role)
		}
	}
	for _, m := range matches {
		role := roleByMid[m.MessageID]
		if role == "" {
			role = "?"
		}
		snippet := strings.ReplaceAll(m.Snippet, "\n", " ")
		fmt.Printf("%s\t%s\t%s\n", m.MessageID, role, snippet)
	}
	return 0
}
