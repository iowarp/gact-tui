package cli

import (
	"context"
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// runFork creates a child session via the same `/v1/sessions` POST
// `gact new` uses but with `parent_session_id` set (and optionally
// `fork_at_message_id`). Inherits the parent's workspace so callers
// don't have to re-specify it. Useful for what-if branches:
//
//	CHILD=$(gact fork "$SID" --at "$MID" --title "alt-branch")
//	gact ask "$CHILD" "what if we tried a different approach?"
//
// Prints the new session id to stdout. Exits 1 on backend failure,
// 2 on bad args.
func runFork(args []string) int {
	fs := flag.NewFlagSet("fork", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	atMid := fs.String("at", "", "fork at this message id (default: tail)")
	title := fs.String("title", "", "child session title; defaults to 'fork of <parent>'")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--at": true, "-at": true,
		"--title": true, "-title": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact fork <parent-session-id> [--at MID] [--title T]")
		return 2
	}
	parentID := fs.Arg(0)
	finalBackend := resolveCLIBackend(*backend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	parent, err := c.GetSession(ctx, parentID)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact fork: %v\n", err)
		return 1
	}
	if *title == "" {
		*title = "fork of " + parentID
	}
	s, err := c.CreateSession(ctx, client.CreateSessionRequest{
		WorkspaceID:     parent.WorkspaceID,
		Title:           *title,
		ParentSessionID: parentID,
		ForkAtMessageID: *atMid,
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact fork: %v\n", err)
		return 1
	}
	fmt.Println(s.ID)
	return 0
}

// runNew creates a new session and prints its id to stdout. With no
// flags, defaults the workspace to the first one in the backend's
// /v1/workspaces list (matches what the TUI does on startup) and the
// title to "session HH:MM:SS UTC". Pure shell plumbing:
//
//	SID=$(gact new --title "scratch")
//	gact ask "$SID" "what does main.go do?"
func runNew(args []string) int {
	var (
		wsID  *string
		title *string
	)
	cc, _, code := newCmdCtx("new", args, withFlags(func(fs *flag.FlagSet) {
		wsID = fs.String("workspace", "", "workspace id; defaults to first listed")
		title = fs.String("title", "", "session title; defaults to current UTC time")
	}))
	if cc == nil {
		return code
	}

	c := cc.client
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if *wsID == "" {
		wss, err := c.ListWorkspaces(ctx)
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact new: list workspaces: %v\n", err)
			return 1
		}
		if len(wss) == 0 {
			fmt.Fprintln(os.Stderr, "gact new: no workspaces; pass --workspace WS_ID")
			return 1
		}
		*wsID = wss[0].ID
	}
	if *title == "" {
		*title = "session " + time.Now().UTC().Format("15:04:05 UTC")
	}

	s, err := c.CreateSession(ctx, client.CreateSessionRequest{
		WorkspaceID: *wsID,
		Title:       *title,
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact new: %v\n", err)
		return 1
	}
	fmt.Println(s.ID)
	return 0
}
