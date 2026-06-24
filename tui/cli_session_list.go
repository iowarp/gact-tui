package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
	"github.com/JaimeCernuda/gact-tui/tui/internal/config"
)

func runList(args []string) int {
	fs := flag.NewFlagSet("list", flag.ContinueOnError)
	backend := fs.String("backend", defaultBackend, "GACT backend URL")
	wsID := fs.String("workspace", "", "only sessions in this workspace")
	parentID := fs.String("parent", "", "only sub-sessions of this session id")
	status := fs.String("status", "", "filter by status (idle|running|waiting|error)")
	archived := fs.Bool("archived", false, "include archived sessions")
	limit := fs.Int("limit", 0, "truncate to first N rows after filtering (0 = no limit)")
	format := fs.String("format", "tsv", "output format: tsv | json")
	// FFFFFFFFF1: --detached-only filters to sessions present in the
	// local registry (filtered to the current backend) — mirrors
	// YYYYYYYY1 on `gact dashboard`.
	detachedOnly := fs.Bool("detached-only", false, "show only sessions in the local detached registry")
	// FFFFFFFFF1: --sort mirrors KKKKKKKK1 on `gact dashboard`.
	// Default preserves backend order so existing scripts aren't
	// reordered silently.
	sortBy := fs.String("sort", "", "sort by: newest | oldest | status | tokens | backend (default: backend order)")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	if *status != "" {
		switch *status {
		case "idle", "running", "waiting", "error":
		default:
			fmt.Fprintf(os.Stderr, "gact list: unknown --status %q (want idle|running|waiting|error)\n", *status)
			return 2
		}
	}
	if *sortBy != "" {
		switch *sortBy {
		case "newest", "oldest", "status", "tokens", "backend":
		default:
			fmt.Fprintf(os.Stderr, "gact list: unknown --sort %q (want newest|oldest|status|tokens|backend)\n", *sortBy)
			return 2
		}
	}

	finalBackend := config.Resolve(nil, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	c := client.New(finalBackend)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	sessions, err := c.ListSessions(ctx, client.SessionFilter{
		WorkspaceID:     *wsID,
		ParentSessionID: *parentID,
		Archived:        *archived,
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact list: %v\n", err)
		return 1
	}
	if *status != "" {
		// Translate user-friendly "waiting" alias to server status
		// `waiting_permission`. Same fix applied to dashboard (YYYY1).
		want := *status
		if want == "waiting" {
			want = "waiting_permission"
		}
		filtered := sessions[:0]
		for _, s := range sessions {
			if s.Status == want {
				filtered = append(filtered, s)
			}
		}
		sessions = filtered
	}
	// FFFFFFFFF1: --detached-only narrows to sessions present in the
	// local registry (filtered to current backend). Built once per
	// invocation — soft-fails silently on missing registry so an
	// unconfigured CI environment doesn't error out.
	if *detachedOnly {
		detached := map[string]bool{}
		if path, err := config.DetachedPath(); err == nil {
			if reg, err := config.LoadDetached(path); err == nil {
				for _, r := range reg.Records {
					if r.Backend == c.BaseURL() {
						detached[r.SessionID] = true
					}
				}
			}
		}
		filtered := sessions[:0]
		for _, s := range sessions {
			if detached[s.ID] {
				filtered = append(filtered, s)
			}
		}
		sessions = filtered
	}
	// FFFFFFFFF1: --sort reorders rows. Default (empty) preserves
	// backend order so existing TSV-consuming scripts aren't broken
	// by the new flag. Reuses the sortSessions helper from the
	// dashboard path (KKKKKKKK1).
	if *sortBy != "" {
		sortSessions(sessions, *sortBy)
	}
	if *limit > 0 && len(sessions) > *limit {
		sessions = sessions[:*limit]
	}

	// GGGGGGGGG1: build the detach lookup once per invocation so the
	// output can carry a per-row marker. Soft-fails silently — an
	// unreadable registry just leaves the column blank (TSV) or
	// `false` (JSON). Reuses the same map built for --detached-only
	// above when that flag was passed, but rebuild is cheap (one
	// mmap + JSON decode).
	detached := map[string]bool{}
	if path, err := config.DetachedPath(); err == nil {
		if reg, err := config.LoadDetached(path); err == nil {
			for _, r := range reg.Records {
				if r.Backend == c.BaseURL() {
					detached[r.SessionID] = true
				}
			}
		}
	}

	switch *format {
	case "json":
		// GGGGGGGGG1: decorate each row with `detached` bool —
		// mirrors SSSSSSSS1 on dashboard. Additive change; existing
		// fields unchanged.
		type decorated struct {
			gact.Session
			Detached bool `json:"detached"`
		}
		out := make([]decorated, 0, len(sessions))
		for _, s := range sessions {
			out = append(out, decorated{Session: s, Detached: detached[s.ID]})
		}
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		if err := enc.Encode(out); err != nil {
			fmt.Fprintf(os.Stderr, "gact list: encode: %v\n", err)
			return 1
		}
	case "tsv", "":
		// GGGGGGGGG1: append a 5th column with "yes"/"" for
		// detached-registry presence. Callers that slice columns
		// 1..4 with awk/cut stay correct; callers that count from
		// -1 with cut pick up the new marker.
		for _, s := range sessions {
			title := s.Title
			if title == "" {
				title = "(untitled)"
			}
			mark := ""
			if detached[s.ID] {
				mark = "yes"
			}
			fmt.Printf("%s\t%s\t%s\t%s\t%s\n",
				s.ID, s.Status, title, s.UpdatedAt.UTC().Format(time.RFC3339), mark)
		}
	default:
		fmt.Fprintf(os.Stderr, "gact list: unknown format %q (want tsv|json)\n", *format)
		return 2
	}
	return 0
}
