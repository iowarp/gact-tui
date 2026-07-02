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

// runSummarize triggers POST /v1/sessions/{id}/summarize and prints
// the resulting Session.Summary to stdout. The endpoint may be a
// no-op + placeholder for backends that don't implement actual
// summarisation (the emulator stamps a "[auto-summary placeholder]"
// string); real backends produce real summaries asynchronously.
func runSummarize(args []string) int {
	fs := flag.NewFlagSet("summarize", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	auto := fs.Bool("auto", true, "request automatic summary if backend supports it")
	instructions := fs.String("instructions", "", "custom summarizer prompt (MMM6, optional)")
	known := map[string]bool{
		"--backend":      true,
		"-backend":       true,
		"--auto":         true,
		"-auto":          true,
		"--instructions": true,
		"-instructions":  true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact summarize <session_id> [--auto=false] [--instructions \"...\"] [--backend URL]")
		return 2
	}
	sid := fs.Arg(0)
	finalBackend := resolveCLIBackend(*backend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := c.SummarizeSession(ctx, sid, *auto, *instructions); err != nil {
		fmt.Fprintf(os.Stderr, "gact summarize: %v\n", err)
		return 1
	}
	// Re-fetch to read the updated summary back.
	s, err := c.GetSession(ctx, sid)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact summarize: refetch: %v\n", err)
		return 1
	}
	if s.Summary == "" {
		fmt.Fprintln(os.Stderr, "gact summarize: backend produced empty summary")
		return 1
	}
	fmt.Println(s.Summary)
	return 0
}

// runQuick is "create + ask + delete" in one command. For users who
// just want an answer and don't care about session lifecycle:
//
//	answer=$(gact quick "what does main.go do?")
//
// Implementation is the standalone equivalent of runNew + runAsk + a
// best-effort cleanup delete. Cleanup failures are logged to stderr
// but don't change the exit code - the answer was already produced
// and that's the user-visible outcome that matters.
//
// --keep prevents the cleanup delete (useful when you want to drop
// into the TUI afterwards via the printed session id on stderr).
func runQuick(args []string) int {
	fs := flag.NewFlagSet("quick", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	wsID := fs.String("workspace", "", "workspace id; defaults to first listed")
	timeout := fs.Duration("timeout", 5*time.Minute, "abandon wait after this long")
	interval := fs.Duration("interval", 500*time.Millisecond, "wait poll cadence")
	keep := fs.Bool("keep", false, "skip the cleanup delete; print sid to stderr")
	known := map[string]bool{
		"--backend":   true,
		"-backend":    true,
		"--workspace": true,
		"-workspace":  true,
		"--timeout":   true,
		"-timeout":    true,
		"--interval":  true,
		"-interval":   true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact quick <question|-> [--workspace WS_ID] [--timeout DUR] [--keep]")
		return 2
	}
	question := fs.Arg(0)
	if question == "-" {
		buf, err := io.ReadAll(os.Stdin)
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact quick: read stdin: %v\n", err)
			return 1
		}
		question = strings.TrimRight(string(buf), "\n")
	}
	if question == "" {
		fmt.Fprintln(os.Stderr, "gact quick: empty question")
		return 2
	}

	finalBackend := resolveCLIBackend(*backend)
	c := client.New(finalBackend)

	if *wsID == "" {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		wss, err := c.ListWorkspaces(ctx)
		cancel()
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact quick: list workspaces: %v\n", err)
			return 1
		}
		if len(wss) == 0 {
			fmt.Fprintln(os.Stderr, "gact quick: no workspaces; pass --workspace WS_ID")
			return 1
		}
		*wsID = wss[0].ID
	}

	createCtx, createCancel := context.WithTimeout(context.Background(), 10*time.Second)
	s, err := c.CreateSession(createCtx, client.CreateSessionRequest{
		WorkspaceID: *wsID,
		Title:       "quick " + time.Now().UTC().Format("15:04:05"),
	})
	createCancel()
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact quick: create session: %v\n", err)
		return 1
	}
	sid := s.ID
	if *keep {
		fmt.Fprintf(os.Stderr, "gact quick: created %s (--keep, no cleanup)\n", sid)
	}

	if !*keep {
		defer func() {
			delCtx, delCancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer delCancel()
			if delErr := c.DeleteSession(delCtx, sid); delErr != nil {
				fmt.Fprintf(os.Stderr, "gact quick: cleanup delete %s: %v\n", sid, delErr)
			}
		}()
	}

	postCtx, postCancel := context.WithTimeout(context.Background(), 10*time.Second)
	if _, err := c.PostMessage(postCtx, sid, client.PostMessageRequest{
		Parts: []gact.Part{{Type: gact.PartTypeText, Text: question}},
	}); err != nil {
		postCancel()
		fmt.Fprintf(os.Stderr, "gact quick: send: %v\n", err)
		return 1
	}
	postCancel()

	deadline := time.Now().Add(*timeout)
	for {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		s, err := c.GetSession(ctx, sid)
		cancel()
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact quick: poll: %v\n", err)
			return 1
		}
		if s.Status == gact.StatusIdle {
			break
		}
		if time.Now().After(deadline) {
			fmt.Fprintf(os.Stderr, "gact quick: timeout (status=%s)\n", s.Status)
			return 2
		}
		time.Sleep(*interval)
	}

	listCtx, listCancel := context.WithTimeout(context.Background(), 10*time.Second)
	msgs, _, err := c.ListMessages(listCtx, client.MessageFilter{SessionID: sid, Limit: 10000})
	listCancel()
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact quick: list-after: %v\n", err)
		return 1
	}
	reply, ok := lastAssistantTextFromMessages(msgs)
	if !ok {
		fmt.Fprintln(os.Stderr, "gact quick: no assistant reply")
		return 1
	}
	fmt.Print(reply)
	return 0
}
