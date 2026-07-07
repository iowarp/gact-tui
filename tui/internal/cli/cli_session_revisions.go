package cli

import (
	"context"
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// runRewind POSTs /v1/sessions/{id}/rewind, deleting every message
// after `to-msg-id`. With --include-target also drops the target.
// Different from `gact undo` — rewind targets a specific message id
// rather than counting backward from the tail (MMM7):
//
//	gact rewind <sid> <msg-id> [--include-target]
//
// Stdout: one deleted msg id per line. Stderr: count summary.
func runRewind(args []string) int {
	fs := flag.NewFlagSet("rewind", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	includeTarget := fs.Bool("include-target", false, "also delete the target message itself")
	known := map[string]bool{
		"--backend": true, "-backend": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 2 {
		fmt.Fprintln(os.Stderr, "usage: gact rewind <session_id> <to-msg-id> [--include-target]")
		return 2
	}
	sid := fs.Arg(0)
	toMid := fs.Arg(1)
	finalBackend := resolveCLIBackend(*backend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	deleted, err := c.RewindSession(ctx, sid, toMid, *includeTarget)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact rewind: %v\n", err)
		return 1
	}
	for _, m := range deleted {
		fmt.Println(m)
	}
	fmt.Fprintf(os.Stderr, "deleted %d message(s)\n", len(deleted))
	return 0
}

// runUndo POSTs /v1/sessions/{id}/undo with optional count. Mirrors
// the `/undo` slash command for shell scripts. Prints reverted message
// ids one per line; count summary on stderr.
//
//	gact undo "$SID"           # revert last message
//	gact undo "$SID" --count 3 # revert last three
func runUndo(args []string) int {
	fs := flag.NewFlagSet("undo", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	count := fs.Int("count", 1, "number of messages to revert (>=1)")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--count": true, "-count": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact undo <session_id> [--count N]")
		return 2
	}
	if *count < 1 {
		fmt.Fprintln(os.Stderr, "gact undo: --count must be >= 1")
		return 2
	}
	sid := fs.Arg(0)
	finalBackend := resolveCLIBackend(*backend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	reverted, err := c.UndoSession(ctx, sid, *count)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact undo: %v\n", err)
		return 1
	}
	for _, mid := range reverted {
		fmt.Println(mid)
	}
	fmt.Fprintf(os.Stderr, "reverted %d message(s)\n", len(reverted))
	return 0
}
