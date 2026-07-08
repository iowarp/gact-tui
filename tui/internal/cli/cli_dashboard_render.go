package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
	"github.com/JaimeCernuda/gact-tui/tui/internal/config"
)

// renderDashboardOnce runs a single dashboard fetch+print. Extracted
// from runDashboard so --watch can call it on each tick. Returns
// the exit code (non-zero on backend error). When keep is non-nil,
// only sessions whose status is in the set are rendered.
// Cross-references the local detached.json registry so
// pretty/tsv output marks sessions the user has previously
// Ctrl+Z-detached from with `↩` in a new DET column. Same source of
// truth the TUI sidebar's detach marker uses.
func renderDashboardOnce(c *client.Client, wsID, format string, keep map[string]bool, sortBy string, detachedOnly bool) int {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	sessions, err := c.ListSessions(ctx, client.SessionFilter{WorkspaceID: wsID})
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact dashboard: %v\n", err)
		return 1
	}
	if keep != nil {
		filtered := sessions[:0]
		for _, s := range sessions {
			if keep[s.Status] {
				filtered = append(filtered, s)
			}
		}
		sessions = filtered
	}
	// Sort sessions per user choice. Default "newest"
	// puts the most-recently-updated rows at the top — the row the
	// user is almost always looking for. Stable sort preserves
	// backend order within tied keys (e.g. same UpdatedAt).
	sortSessions(sessions, sortBy)

	// Build the detach lookup once per render. Soft-fails
	// to an empty set so a missing/malformed registry just leaves
	// the column blank instead of breaking the dashboard.
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
	// --detached-only drops every session whose id isn't
	// in the registry. Applied AFTER the detach lookup is built and
	// AFTER sort — preserves stable ordering within the surviving
	// subset.
	if detachedOnly {
		kept := sessions[:0]
		for _, s := range sessions {
			if detached[s.ID] {
				kept = append(kept, s)
			}
		}
		sessions = kept
	}

	if format == "json" {
		// Emit decorated rows so jq pipelines can see the
		// detached marker too — the pretty/tsv formats already carry
		// it as a DET column. Each row is the original Session
		// flattened in, plus a top-level `detached` bool.
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
		_ = enc.Encode(out)
		return 0
	}

	if format == "tsv" {
		printDashboardTSV(sessions, detached)
	} else {
		printDashboardPretty(sessions, detached)
	}
	return 0
}
