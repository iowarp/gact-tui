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
)

// runVoice implements `gact voice <sid> <audio-file|->`. Reads the
// audio bytes (file path or `-` for stdin), POSTs to the §6.14 voice
// endpoint via client.VoiceTranscribe, prints the transcribed text.
// Mime type defaults to audio/wav (matches scripts/voice-record.sh
// output) and is overridable via --mime. (PPP1)
func runVoice(args []string) int {
	fs := flag.NewFlagSet("voice", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	mime := fs.String("mime", "audio/wav", "audio MIME type (e.g. audio/wav, audio/webm)")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--mime": true, "-mime": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 2 {
		fmt.Fprintln(os.Stderr, "usage: gact voice <session_id> <audio-file|->")
		return 2
	}
	sid := fs.Arg(0)
	src := fs.Arg(1)
	var audio []byte
	if src == "-" {
		b, err := io.ReadAll(os.Stdin)
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact voice: read stdin: %v\n", err)
			return 1
		}
		audio = b
	} else {
		b, err := os.ReadFile(src)
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact voice: read %s: %v\n", src, err)
			return 1
		}
		audio = b
	}
	if len(audio) == 0 {
		fmt.Fprintln(os.Stderr, "gact voice: empty audio")
		return 2
	}
	finalBackend := resolveCLIBackend(*backend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	resp, err := c.VoiceTranscribe(ctx, sid, audio, *mime)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact voice: %v\n", err)
		return 1
	}
	fmt.Print(resp.Text)
	return 0
}

// runTell implements `gact tell <name> <msg>` — name-based, idempotent
// session messaging. First call creates a session titled <name>;
// subsequent calls resume that same session. Always: post the user
// message, wait for idle, print the assistant's reply text. Designed
// for scripted multi-turn conversations:
//
//	gact tell jaime "hello, my name is jaime"
//	gact tell jaime "what is my name?"   # appends to same session
//
// `name` may also be a literal sess_id; the resolver short-circuits.
func runTell(args []string) int {
	fs := flag.NewFlagSet("tell", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	timeout := fs.Duration("timeout", 5*time.Minute, "abandon wait after this long")
	interval := fs.Duration("interval", 500*time.Millisecond, "wait poll cadence")
	wsID := fs.String("workspace", "", "workspace id for new sessions (default: first listed)")
	async := fs.Bool("async", false, "fire-and-return: post the message and exit; print sid + msg_id without waiting for the assistant reply (LLL8)")
	// `known` only lists flags that take a value; bool flags like
	// --async are intentionally omitted so reorderFlagsFirst won't
	// gobble the next positional as their value.
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--timeout": true, "-timeout": true,
		"--interval": true, "-interval": true,
		"--workspace": true, "-workspace": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 2 {
		fmt.Fprintln(os.Stderr, "usage: gact tell <name|sess_id> <message|->")
		return 2
	}
	name := fs.Arg(0)
	msg := fs.Arg(1)
	if msg == "-" {
		buf, err := io.ReadAll(os.Stdin)
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact tell: read stdin: %v\n", err)
			return 1
		}
		msg = strings.TrimRight(string(buf), "\n")
	}
	if msg == "" {
		fmt.Fprintln(os.Stderr, "gact tell: empty message")
		return 2
	}

	finalBackend := resolveCLIBackend(*backend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	sid, found, err := resolveSessionByName(ctx, c, name)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact tell: %v\n", err)
		return 1
	}
	if !found {
		// Create path: pick the first workspace if not given.
		if *wsID == "" {
			wss, err := c.ListWorkspaces(ctx)
			if err != nil {
				fmt.Fprintf(os.Stderr, "gact tell: list workspaces: %v\n", err)
				return 1
			}
			if len(wss) == 0 {
				fmt.Fprintln(os.Stderr, "gact tell: no workspaces; pass --workspace WS_ID")
				return 1
			}
			*wsID = wss[0].ID
		}
		s, err := c.CreateSession(ctx, client.CreateSessionRequest{
			WorkspaceID: *wsID,
			Title:       name,
			Model:       &gact.ModelRef{ProviderID: "anthropic", ModelID: "claude-opus-4-7"},
			Agent:       &gact.AgentRef{ID: "default"},
		})
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact tell: create %q: %v\n", name, err)
			return 1
		}
		sid = s.ID
		fmt.Fprintf(os.Stderr, "gact tell: created session %s (%q)\n", sid, name)
	}

	// Snapshot pre-send count to identify the assistant's new reply.
	preCtx, preCancel := context.WithTimeout(context.Background(), 10*time.Second)
	preMsgs, _, err := c.ListMessages(preCtx, client.MessageFilter{SessionID: sid, Limit: 10000})
	preCancel()
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact tell: list-before: %v\n", err)
		return 1
	}
	preCount := len(preMsgs)

	postCtx, postCancel := context.WithTimeout(context.Background(), 10*time.Second)
	posted, err := c.PostMessage(postCtx, sid, client.PostMessageRequest{
		Parts: []gact.Part{{Type: gact.PartTypeText, Text: msg}},
	})
	if err != nil {
		postCancel()
		fmt.Fprintf(os.Stderr, "gact tell: send: %v\n", err)
		return 1
	}
	postCancel()

	// LLL8: --async fires and returns. Print sid<TAB>msg_id on stdout
	// so chained scripts can capture both. The session keeps running
	// in the background; users can `gact log <sid>` or `gact watch
	// <sid>` to see the reply when ready.
	if *async {
		fmt.Printf("%s\t%s\n", sid, posted.MessageID)
		return 0
	}

	deadline := time.Now().Add(*timeout)
	for {
		pollCtx, pollCancel := context.WithTimeout(context.Background(), 5*time.Second)
		s, err := c.GetSession(pollCtx, sid)
		pollCancel()
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact tell: poll: %v\n", err)
			return 1
		}
		if s.Status == gact.StatusIdle {
			break
		}
		if time.Now().After(deadline) {
			fmt.Fprintf(os.Stderr, "gact tell: timeout (status=%s)\n", s.Status)
			return 2
		}
		time.Sleep(*interval)
	}

	listCtx, listCancel := context.WithTimeout(context.Background(), 10*time.Second)
	msgs, _, err := c.ListMessages(listCtx, client.MessageFilter{SessionID: sid, Limit: 10000})
	listCancel()
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact tell: list-after: %v\n", err)
		return 1
	}
	if len(msgs) <= preCount {
		fmt.Fprintln(os.Stderr, "gact tell: no new messages after wait")
		return 1
	}
	reply, ok := lastAssistantTextFromMessages(msgs[preCount:])
	if !ok {
		fmt.Fprintln(os.Stderr, "gact tell: no assistant reply")
		return 1
	}
	fmt.Print(reply)
	return 0
}
