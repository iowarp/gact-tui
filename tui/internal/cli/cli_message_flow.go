package cli

import (
	"context"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// runCancel POSTs /v1/sessions/{id}/cancel. Exits 0 on 204, 1 on
// transport / API error. Symmetric with the TUI's Ctrl+X but reachable
// from shell scripts.
func runCancel(args []string) int {
	cc, rest, code := newCmdCtx("cancel", args)
	if cc == nil {
		return code
	}
	if len(rest) != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact cancel <session_id> [--backend URL]")
		return 2
	}
	sid := rest[0]

	c := cc.client
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := c.CancelSession(ctx, sid); err != nil {
		fmt.Fprintf(os.Stderr, "gact cancel: %v\n", err)
		return 1
	}
	return 0
}

// runRun is `gact send` followed by `gact wait` — a single command
// for "ask + block until reply" shell pipelines. Prints the message
// id once accepted, then blocks. Honours the same --timeout /
// --interval flags as wait.
func runRun(args []string) int {
	var interval *time.Duration
	cc, rest, code := newCmdCtx("run", args,
		withTimeout(5*time.Minute, "abandon wait after this long"),
		withFlags(func(fs *flag.FlagSet) {
			interval = fs.Duration("interval", 500*time.Millisecond, "wait poll cadence")
		}),
	)
	if cc == nil {
		return code
	}
	if len(rest) != 2 {
		fmt.Fprintln(os.Stderr, "usage: gact run <session_id> <text|-> [--backend URL] [--timeout DUR] [--interval DUR]")
		return 2
	}
	sid := rest[0]
	text := rest[1]
	if text == "-" {
		buf, err := io.ReadAll(os.Stdin)
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact run: read stdin: %v\n", err)
			return 1
		}
		text = strings.TrimRight(string(buf), "\n")
	}
	if text == "" {
		fmt.Fprintln(os.Stderr, "gact run: empty text")
		return 2
	}

	c := cc.client

	postCtx, postCancel := context.WithTimeout(context.Background(), 10*time.Second)
	resp, err := c.PostMessage(postCtx, sid, client.PostMessageRequest{
		Parts: []gact.Part{{Type: gact.PartTypeText, Text: text}},
	})
	postCancel()
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact run: send: %v\n", err)
		return 1
	}
	fmt.Println(resp.MessageID)

	deadline := time.Now().Add(cc.timeout)
	for {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		s, err := c.GetSession(ctx, sid)
		cancel()
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact run: poll: %v\n", err)
			return 1
		}
		if s.Status == gact.StatusIdle {
			return 0
		}
		if time.Now().After(deadline) {
			fmt.Fprintf(os.Stderr, "gact run: timeout after %s (status=%s)\n", cc.timeout, s.Status)
			return 2
		}
		time.Sleep(*interval)
	}
}

// runWait blocks until a session's status is idle, then exits 0.
// Polls GET /v1/sessions/{id} on a short interval rather than SSE —
// simpler, no reconnect loop, and a second of lag is fine for shell
// chaining. Exits with code 2 on timeout, 1 on transport error.
//
// Usage chain:
//
//	SID=$(gact list | head -1 | cut -f1)
//	gact send "$SID" "please read main.go" && \
//	  gact wait "$SID" && \
//	  gact tail "$SID" | head -20
func runWait(args []string) int {
	var (
		interval *time.Duration
		anyOf    *string
	)
	cc, rest, code := newCmdCtx("wait", args,
		withTimeout(5*time.Minute, "abandon after this long"),
		withFlags(func(fs *flag.FlagSet) {
			interval = fs.Duration("interval", 500*time.Millisecond, "poll cadence")
			anyOf = fs.String("any-of", "", "comma-separated session ids; return on first idle (YYY1)")
		}),
	)
	if cc == nil {
		return code
	}

	// Build the list of sids to watch. --any-of comma-list takes
	// precedence; otherwise expect one positional arg (back-compat).
	var sids []string
	if *anyOf != "" {
		for _, s := range strings.Split(*anyOf, ",") {
			if s = strings.TrimSpace(s); s != "" {
				sids = append(sids, s)
			}
		}
	} else if len(rest) == 1 {
		sids = []string{rest[0]}
	}
	if len(sids) == 0 {
		fmt.Fprintln(os.Stderr, "usage: gact wait <session_id> | --any-of sid1,sid2,... [--timeout DUR] [--interval DUR]")
		return 2
	}

	c := cc.client

	deadline := time.Now().Add(cc.timeout)
	for {
		// Poll each sid in this round; first to land idle wins.
		// Single-id path stays trivially equivalent to the old
		// behaviour.
		for _, sid := range sids {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			s, err := c.GetSession(ctx, sid)
			cancel()
			if err != nil {
				fmt.Fprintf(os.Stderr, "gact wait: %v\n", err)
				return 1
			}
			if s.Status == gact.StatusIdle {
				if len(sids) > 1 {
					// In --any-of mode, print the winning sid so
					// pipes can branch on it.
					fmt.Println(sid)
				}
				return 0
			}
		}
		if time.Now().After(deadline) {
			fmt.Fprintf(os.Stderr, "gact wait: timeout after %s (none of %d sessions idle)\n",
				cc.timeout, len(sids))
			return 2
		}
		time.Sleep(*interval)
	}
}

// runSend posts a single user text message to a session from the
// shell. Accepts `-` as the text to read from stdin so pipes work:
//
//	echo "please read main.go" | gact send SID -
//	gact send SID "what does this project do?"
//
// Exits 0 on 202 Accepted; prints the returned message_id to stdout.
func runSend(args []string) int {
	cc, rest, code := newCmdCtx("send", args)
	if cc == nil {
		return code
	}
	if len(rest) != 2 {
		fmt.Fprintln(os.Stderr, "usage: gact send <session_id> <text|-> [--backend URL]")
		return 2
	}
	sid := rest[0]
	text := rest[1]
	if text == "-" {
		buf, err := io.ReadAll(os.Stdin)
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact send: read stdin: %v\n", err)
			return 1
		}
		text = strings.TrimRight(string(buf), "\n")
	}
	if text == "" {
		fmt.Fprintln(os.Stderr, "gact send: empty text")
		return 2
	}

	c := cc.client
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	resp, err := c.PostMessage(ctx, sid, client.PostMessageRequest{
		Parts: []gact.Part{{Type: gact.PartTypeText, Text: text}},
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact send: %v\n", err)
		return 1
	}
	fmt.Println(resp.MessageID)
	return 0
}
