package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
	"github.com/JaimeCernuda/gact-tui/tui/internal/config"
)

// runCancel POSTs /v1/sessions/{id}/cancel. Exits 0 on 204, 1 on
// transport / API error. Symmetric with the TUI's Ctrl+X but reachable
// from shell scripts.
func runCancel(args []string) int {
	fs := flag.NewFlagSet("cancel", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	known := map[string]bool{"--backend": true, "-backend": true}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact cancel <session_id> [--backend URL]")
		return 2
	}
	sid := fs.Arg(0)

	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
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
	fs := flag.NewFlagSet("run", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	timeout := fs.Duration("timeout", 5*time.Minute, "abandon wait after this long")
	interval := fs.Duration("interval", 500*time.Millisecond, "wait poll cadence")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--timeout": true, "-timeout": true,
		"--interval": true, "-interval": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 2 {
		fmt.Fprintln(os.Stderr, "usage: gact run <session_id> <text|-> [--backend URL] [--timeout DUR] [--interval DUR]")
		return 2
	}
	sid := fs.Arg(0)
	text := fs.Arg(1)
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

	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)

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

	deadline := time.Now().Add(*timeout)
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
			fmt.Fprintf(os.Stderr, "gact run: timeout after %s (status=%s)\n", *timeout, s.Status)
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
	fs := flag.NewFlagSet("wait", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	timeout := fs.Duration("timeout", 5*time.Minute, "abandon after this long")
	interval := fs.Duration("interval", 500*time.Millisecond, "poll cadence")
	anyOf := fs.String("any-of", "", "comma-separated session ids; return on first idle (YYY1)")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--timeout": true, "-timeout": true,
		"--interval": true, "-interval": true,
		"--any-of": true, "-any-of": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
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
	} else if fs.NArg() == 1 {
		sids = []string{fs.Arg(0)}
	}
	if len(sids) == 0 {
		fmt.Fprintln(os.Stderr, "usage: gact wait <session_id> | --any-of sid1,sid2,... [--timeout DUR] [--interval DUR]")
		return 2
	}

	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)

	deadline := time.Now().Add(*timeout)
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
				*timeout, len(sids))
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
	fs := flag.NewFlagSet("send", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	known := map[string]bool{"--backend": true, "-backend": true}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 2 {
		fmt.Fprintln(os.Stderr, "usage: gact send <session_id> <text|-> [--backend URL]")
		return 2
	}
	sid := fs.Arg(0)
	text := fs.Arg(1)
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

	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
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
