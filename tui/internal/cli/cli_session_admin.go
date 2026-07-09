package cli

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
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
	cc, rest, code := newCmdCtx(verb, args)
	if cc == nil {
		return code
	}
	if len(rest) != 1 {
		fmt.Fprintf(os.Stderr, "usage: gact %s <session_id> [--backend URL]\n", verb)
		return 2
	}
	sid := rest[0]
	c := cc.client
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
	cc, rest, code := newCmdCtx("rename", args)
	if cc == nil {
		return code
	}
	if len(rest) != 2 {
		fmt.Fprintln(os.Stderr, "usage: gact rename <session_id> <new-title> [--backend URL]")
		return 2
	}
	sid := rest[0]
	title := rest[1]
	c := cc.client
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if _, err := c.PatchSession(ctx, sid, client.PatchSessionRequest{Title: &title}); err != nil {
		fmt.Fprintf(os.Stderr, "gact rename: %v\n", err)
		return 1
	}
	return 0
}
