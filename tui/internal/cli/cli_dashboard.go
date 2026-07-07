package cli

import (
	"context"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// runDashboard prints a supervisory overview of every session in
// the workspace (default: all). One-shot — for scripting or quick
// "what's everything doing?" checks without launching the TUI. (VVV1)
func runDashboard(args []string) int {
	fs := flag.NewFlagSet("dashboard", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	wsID := fs.String("workspace", "", "limit to one workspace; empty = all")
	format := fs.String("format", "pretty", "pretty | tsv | json")
	watch := fs.Bool("watch", false, "re-render every --interval (BBBB1)")
	interval := fs.Duration("interval", 2*time.Second, "refresh cadence in --watch mode")
	// YYYY1: --status filters rows to one status (or comma-list).
	// Empty = all (back-compat). Validation runs client-side so a
	// typo errors fast instead of returning a silently-empty board.
	statusFilter := fs.String("status", "", "comma-separated status filter: idle|running|waiting|error")
	// KKKKKKKK1: --sort controls row ordering. Default newest-first
	// so "what was I just working on?" answers itself at the top.
	sortBy := fs.String("sort", "newest", "sort by: newest | oldest | status | tokens | backend")
	// YYYYYYYY1: --detached-only filters rows to sessions in the
	// local registry (filtered to current backend). Mirrors the
	// sidebar JJJJJJJJ1 `d` toggle on the CLI side — lets scripts
	// query "what detached work is still alive".
	detachedOnly := fs.Bool("detached-only", false, "show only sessions in the local detached registry")
	if err := fs.Parse(reorderFlagsFirst(args, map[string]bool{
		"--backend": true, "-backend": true,
		"--workspace": true, "-workspace": true,
		"--format": true, "-format": true,
		"--interval": true, "-interval": true,
		"--status": true, "-status": true,
		"--sort": true, "-sort": true,
		"--detached-only": true, "-detached-only": true,
	})); err != nil {
		return 2
	}
	switch *format {
	case "pretty", "tsv", "json":
	default:
		fmt.Fprintf(os.Stderr, "gact dashboard: unknown format %q (want pretty|tsv|json)\n", *format)
		return 2
	}
	switch *sortBy {
	case "newest", "oldest", "status", "tokens", "backend":
	default:
		fmt.Fprintf(os.Stderr, "gact dashboard: unknown sort %q (want newest|oldest|status|tokens|backend)\n", *sortBy)
		return 2
	}
	var keep map[string]bool
	if *statusFilter != "" {
		keep = map[string]bool{}
		for _, s := range strings.Split(*statusFilter, ",") {
			s = strings.TrimSpace(s)
			// Translate user-friendly "waiting" alias to the actual
			// server status string `waiting_permission` (see SPEC).
			switch s {
			case "":
			case "idle", "running", "error":
				keep[s] = true
			case "waiting", "waiting_permission":
				keep["waiting_permission"] = true
			default:
				fmt.Fprintf(os.Stderr, "gact dashboard: unknown --status %q (want idle|running|waiting|error)\n", s)
				return 2
			}
		}
	}
	finalBackend := resolveCLIBackend(*backend)
	c := client.New(finalBackend)

	if !*watch {
		// One-shot path (back-compat).
		return renderDashboardOnce(c, *wsID, *format, keep, *sortBy, *detachedOnly)
	}

	// BBBB1: watch loop. ANSI clear-screen + cursor-home between
	// frames so each render replaces the previous in place. Caller
	// uses Ctrl+C to exit.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	tick := time.NewTicker(*interval)
	defer tick.Stop()
	first := true
	for {
		if first || true {
			fmt.Print("\033[2J\033[H") // clear + home
			fmt.Printf("gact dashboard --watch  backend=%s  refresh=%s  (Ctrl+C to exit)\n\n",
				finalBackend, *interval)
			if code := renderDashboardOnce(c, *wsID, *format, keep, *sortBy, *detachedOnly); code != 0 {
				cancel()
				return code
			}
			first = false
		}
		select {
		case <-ctx.Done():
			return 0
		case <-tick.C:
		}
	}
}
