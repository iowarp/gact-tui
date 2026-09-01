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

// runAsk is `run` + extract: posts a user message, waits for idle,
// then prints the assistant's reply text to stdout. Pure stdout
// (no role headers, no trailing newline) so shell capture works:
//
//	answer=$(gact ask "$SID" "what does main.go do?")
//	echo "got: $answer"
//
// Exits 0 on a non-empty reply, 1 if no assistant text appeared
// after the wait, 2 on bad args.
func runAsk(args []string) int {
	var interval *time.Duration
	cc, rest, code := newCmdCtx("ask", args,
		withTimeout(5*time.Minute, "abandon wait after this long"),
		withFlags(func(fs *flag.FlagSet) {
			interval = fs.Duration("interval", 500*time.Millisecond, "wait poll cadence")
		}),
	)
	if cc == nil {
		return code
	}
	if len(rest) != 2 {
		fmt.Fprintln(os.Stderr, "usage: gact ask <session_id> <question|-> [--timeout DUR] [--interval DUR]")
		return 2
	}
	sid := rest[0]
	question := rest[1]
	if question == "-" {
		buf, err := io.ReadAll(os.Stdin)
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact ask: read stdin: %v\n", err)
			return 1
		}
		question = strings.TrimRight(string(buf), "\n")
	}
	if question == "" {
		fmt.Fprintln(os.Stderr, "gact ask: empty question")
		return 2
	}

	c := cc.client

	// Snapshot the message count BEFORE sending so we know which
	// assistant messages are "new" replies vs pre-existing context.
	var preCount int
	{
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		msgs, _, err := c.ListMessages(ctx, client.MessageFilter{SessionID: sid, Limit: 10000})
		cancel()
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact ask: list messages: %v\n", err)
			return 1
		}
		preCount = len(msgs)
	}

	postCtx, postCancel := context.WithTimeout(context.Background(), 10*time.Second)
	if _, err := c.PostMessage(postCtx, sid, client.PostMessageRequest{
		Parts: []gact.Part{{Type: gact.PartTypeText, Text: question}},
	}); err != nil {
		postCancel()
		fmt.Fprintf(os.Stderr, "gact ask: send: %v\n", err)
		return 1
	}
	postCancel()

	deadline := time.Now().Add(cc.timeout)
	for {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		s, err := c.GetSession(ctx, sid)
		cancel()
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact ask: poll: %v\n", err)
			return 1
		}
		if s.Status == gact.StatusIdle {
			break
		}
		if time.Now().After(deadline) {
			fmt.Fprintf(os.Stderr, "gact ask: timeout (status=%s)\n", s.Status)
			return 2
		}
		time.Sleep(*interval)
	}

	// Read messages added since pre-send and concatenate the
	// newest assistant text. This handles backends that emit
	// multiple assistant turns (subagent fan-out, etc.) — only
	// the latest assistant text is what the user "asked for".
	listCtx, listCancel := context.WithTimeout(context.Background(), 10*time.Second)
	msgs, _, err := c.ListMessages(listCtx, client.MessageFilter{SessionID: sid, Limit: 10000})
	listCancel()
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact ask: list-after: %v\n", err)
		return 1
	}
	if len(msgs) <= preCount {
		fmt.Fprintln(os.Stderr, "gact ask: no new messages after wait")
		return 1
	}
	added := msgs[preCount:]
	reply, ok := lastAssistantTextFromMessages(added)
	if !ok {
		fmt.Fprintln(os.Stderr, "gact ask: no assistant reply in new messages")
		return 1
	}
	fmt.Print(reply)
	return 0
}

// lastAssistantTextFromMessages walks msgs in reverse for the newest
// assistant message and returns its concatenated text content. Same
// rule as the TUI's lastAssistantText, kept inline here so main has
// no dependency on internal/ui.
func lastAssistantTextFromMessages(msgs []gact.Message) (string, bool) {
	for i := len(msgs) - 1; i >= 0; i-- {
		m := msgs[i]
		if m.Role != gact.RoleAssistant {
			continue
		}
		var b strings.Builder
		for _, p := range m.Parts {
			if p.Type != gact.PartTypeText || p.Text == "" {
				continue
			}
			if b.Len() > 0 {
				b.WriteString("\n\n")
			}
			b.WriteString(p.Text)
		}
		if b.Len() == 0 {
			continue
		}
		return b.String(), true
	}
	return "", false
}
