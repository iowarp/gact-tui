package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
	"github.com/JaimeCernuda/gact-tui/tui/internal/config"
)

// runArchive PATCHes session.archived. `archived=true` hides the
// session from the default sidebar view (TUI's `h` toggles back);
// `archived=false` restores it. Same code path for both via the
// boolean argument so the two subcommand cases stay one-liners.
func runArchive(args []string, archived bool) int {
	verb := "archive"
	if !archived {
		verb = "unarchive"
	}
	fs := flag.NewFlagSet(verb, flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	known := map[string]bool{"--backend": true, "-backend": true}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintf(os.Stderr, "usage: gact %s <session_id> [--backend URL]\n", verb)
		return 2
	}
	sid := fs.Arg(0)
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if _, err := c.PatchSession(ctx, sid, client.PatchSessionRequest{Archived: &archived}); err != nil {
		fmt.Fprintf(os.Stderr, "gact %s: %v\n", verb, err)
		return 1
	}
	return 0
}

// runRename PATCHes the session title. Useful in scripts that want
// to label a session retroactively (e.g. after the first reply
// lands and you know what the conversation was actually about).
func runRename(args []string) int {
	fs := flag.NewFlagSet("rename", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	known := map[string]bool{"--backend": true, "-backend": true}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 2 {
		fmt.Fprintln(os.Stderr, "usage: gact rename <session_id> <new-title> [--backend URL]")
		return 2
	}
	sid := fs.Arg(0)
	title := fs.Arg(1)
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if _, err := c.PatchSession(ctx, sid, client.PatchSessionRequest{Title: &title}); err != nil {
		fmt.Fprintf(os.Stderr, "gact rename: %v\n", err)
		return 1
	}
	return 0
}
