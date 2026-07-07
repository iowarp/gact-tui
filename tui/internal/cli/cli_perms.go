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

// runPerms dispatches the `gact perms <verb>` family for managing
// pending permissions from the shell. Same endpoints the TUI's
// a/d/s/w action keys use:
//
//	gact perms list <sid>                — pending+resolved (TSV)
//	gact perms allow <perm-id>           — POST allow
//	gact perms deny <perm-id>            — POST deny
//	gact perms allow-session <perm-id>   — POST allow_session
//	gact perms allow-workspace <perm-id> — POST allow_workspace
func runPerms(args []string) int {
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, "usage: gact perms list|allow|deny|allow-session|allow-workspace|rules ...")
		return 2
	}
	verb := args[0]
	rest := args[1:]
	if verb == "list" {
		return runPermsList(rest)
	}
	if verb == "rules" {
		// MMM4: nested verb for §6.11 policies. Subverbs:
		//   list             - print current policy list
		//   set <file|->     - replace whole list from JSON {policies:[…]}
		//   clear            - replace with empty list
		return runPermsRules(rest)
	}

	// Action verbs share the same shape: <perm-id> required.
	var action gact.PermissionAction
	switch verb {
	case "allow":
		action = gact.PermAllow
	case "deny":
		action = gact.PermDeny
	case "allow-session":
		action = gact.PermAllowSession
	case "allow-workspace":
		action = gact.PermAllowWorkspace
	default:
		fmt.Fprintf(os.Stderr, "gact perms: unknown verb %q\n", verb)
		return 2
	}

	fs := flag.NewFlagSet("perms "+verb, flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	known := map[string]bool{"--backend": true, "-backend": true}
	if err := fs.Parse(reorderFlagsFirst(rest, known)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintf(os.Stderr, "usage: gact perms %s <perm-id> [--backend URL]\n", verb)
		return 2
	}
	pid := fs.Arg(0)
	finalBackend := resolveCLIBackend(*backend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := c.RespondPermission(ctx, pid, action); err != nil {
		fmt.Fprintf(os.Stderr, "gact perms %s: %v\n", verb, err)
		return 1
	}
	return 0
}

// runPermsList prints pending permissions for a session as
// tab-separated `id  status  action  summary` rows.
func runPermsList(args []string) int {
	fs := flag.NewFlagSet("perms list", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	pending := fs.Bool("pending", false, "only pending; default lists every state")
	// OOOOO1: --format json emits the raw PermissionWire array with
	// the full ToolCall payload (input args + annotations) intact —
	// the TSV view loses that. Default tsv preserved for back-compat
	// with the existing perms-list scripting + the test harness.
	format := fs.String("format", "tsv", "tsv | json")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--pending": true, "-pending": true,
		"--format": true, "-format": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact perms list <session_id> [--pending] [--format tsv|json] [--backend URL]")
		return 2
	}
	if *format != "tsv" && *format != "json" {
		fmt.Fprintf(os.Stderr, "gact perms list: unknown format %q (want tsv|json)\n", *format)
		return 2
	}
	sid := fs.Arg(0)
	finalBackend := resolveCLIBackend(*backend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	perms, err := c.ListPermissions(ctx, sid, *pending)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact perms list: %v\n", err)
		return 1
	}
	if *format == "json" {
		if perms == nil {
			perms = []client.PermissionWire{}
		}
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		if err := enc.Encode(perms); err != nil {
			fmt.Fprintf(os.Stderr, "gact perms list: encode: %v\n", err)
			return 1
		}
		return 0
	}
	for _, p := range perms {
		summary := strings.ReplaceAll(p.Summary, "\n", " ")
		fmt.Printf("%s\t%s\t%s\t%s\n", p.ID, p.Status, p.Action, summary)
	}
	return 0
}
