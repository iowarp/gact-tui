package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
	"github.com/JaimeCernuda/gact-tui/tui/internal/config"
)

// runGrep extends `gact search` (per-session) to every session in
// parallel. Lists sessions, fans out SearchMessages calls with a
// small goroutine pool, aggregates results. Useful for "did I ever
// mention X anywhere?" (WWW1).
func runGrep(args []string) int {
	fs := flag.NewFlagSet("grep", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	wsID := fs.String("workspace", "", "limit to one workspace; empty = all")
	format := fs.String("format", "tsv", "tsv | json")
	// VVVV1: --limit caps the output. Default 0 means unlimited
	// (back-compat). Truncation happens AFTER sorting so the kept
	// rows are still the lexicographically-smallest sids.
	limit := fs.Int("limit", 0, "max hits to print (0 = unlimited)")
	// DDDDDDDDD1: --role filter mirrors VVVVVVVV1 on log/follow.
	// Applies AFTER the cross-session search gathers hits, so the
	// keep-set filters the role-decorated rows built from midRoles.
	role := fs.String("role", "", "comma-separated role filter: user|assistant|tool|system")
	known := map[string]bool{
		"--backend": true, "-backend": true,
		"--workspace": true, "-workspace": true,
		"--format": true, "-format": true,
		"--limit": true, "-limit": true,
		"--role": true, "-role": true,
	}
	if err := fs.Parse(reorderFlagsFirst(args, known)); err != nil {
		return 2
	}
	if fs.NArg() < 1 {
		fmt.Fprintln(os.Stderr, "usage: gact grep <query> [--workspace WS_ID] [--role user,assistant,...] [--format tsv|json] [--limit N]")
		return 2
	}
	query := strings.Join(fs.Args(), " ")
	if *format != "tsv" && *format != "json" {
		fmt.Fprintf(os.Stderr, "gact grep: unknown format %q\n", *format)
		return 2
	}
	if *limit < 0 {
		fmt.Fprintln(os.Stderr, "gact grep: --limit must be >= 0")
		return 2
	}
	// DDDDDDDDD1: build + validate the role keep-set up front.
	var keepRole map[string]bool
	if *role != "" {
		keepRole = map[string]bool{}
		for _, r := range strings.Split(*role, ",") {
			r = strings.TrimSpace(r)
			switch r {
			case "":
			case "user", "assistant", "tool", "system":
				keepRole[r] = true
			default:
				fmt.Fprintf(os.Stderr, "gact grep: unknown --role %q (want user|assistant|tool|system)\n", r)
				return 2
			}
		}
	}
	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	sessions, err := c.ListSessions(ctx, client.SessionFilter{WorkspaceID: *wsID})
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact grep: list sessions: %v\n", err)
		return 1
	}

	type hit struct {
		SID     string `json:"sid"`
		Title   string `json:"title"`
		MID     string `json:"mid"`
		Role    string `json:"role"`
		Snippet string `json:"snippet"`
	}
	var hits []hit
	var mu sync.Mutex

	// Bounded goroutine pool — don't fan out 1000 sessions to 1000
	// concurrent SearchMessages calls.
	sem := make(chan struct{}, 8)
	var wg sync.WaitGroup
	for _, sess := range sessions {
		wg.Add(1)
		sem <- struct{}{}
		go func(s gact.Session) {
			defer wg.Done()
			defer func() { <-sem }()
			sctx, scancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer scancel()
			matches, err := c.SearchMessages(sctx, s.ID, query)
			if err != nil {
				return // best-effort — skip sessions whose search fails
			}
			if len(matches) == 0 {
				return
			}
			// Build mid → role map for the few hit message ids only
			// (cheaper than ListMessages on every session).
			midRoles := map[string]string{}
			msgs, _, mErr := c.ListMessages(sctx, client.MessageFilter{SessionID: s.ID, Limit: 500})
			if mErr == nil {
				for _, m := range msgs {
					midRoles[m.ID] = string(m.Role)
				}
			}
			mu.Lock()
			defer mu.Unlock()
			for _, m := range matches {
				role := midRoles[m.MessageID]
				if role == "" {
					role = "?"
				}
				hits = append(hits, hit{
					SID: s.ID, Title: s.Title, MID: m.MessageID,
					Role:    role,
					Snippet: strings.ReplaceAll(m.Snippet, "\n", " "),
				})
			}
		}(sess)
	}
	wg.Wait()
	// DDDDDDDDD1: drop hits whose role isn't in the keep-set. Runs
	// after the parallel search finishes — before sort + limit so
	// the kept rows are the lexicographically-first post-filter.
	if keepRole != nil {
		kept := hits[:0]
		for _, h := range hits {
			if keepRole[h.Role] {
				kept = append(kept, h)
			}
		}
		hits = kept
	}
	sort.Slice(hits, func(i, j int) bool { return hits[i].SID < hits[j].SID })
	if *limit > 0 && len(hits) > *limit {
		hits = hits[:*limit]
	}

	if *format == "json" {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		_ = enc.Encode(hits)
		return 0
	}
	for _, h := range hits {
		fmt.Printf("%s\t%s\t%s\t%s\t%s\n", h.SID, h.Title, h.MID, h.Role, h.Snippet)
	}
	return 0
}
