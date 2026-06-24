package main

import (
	"fmt"
	"os"

	"github.com/JaimeCernuda/gact-tui/tui/internal/config"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui"
)

func seedDetachedRegistry(app *ui.App, finalBackend string) {
	if path, err := config.DetachedPath(); err == nil {
		if reg, err := config.LoadDetached(path); err == nil {
			entries := make([]ui.DetachedRegistryEntry, 0, len(reg.Records))
			for _, r := range reg.Records {
				entries = append(entries, ui.DetachedRegistryEntry{
					SessionID: r.SessionID,
					Backend:   r.Backend,
				})
			}
			app.LoadDetachedRegistry(entries)
		}
		// Wire the prune callback so x/x in the sidebar removes the
		// session from the registry too. Best-effort: errors are swallowed
		// since the user has just deleted the session and cannot act on a
		// registry-write failure.
		app.PruneDetachedRegistry = func(sid string) {
			_, _ = config.RemoveDetached(path, finalBackend, sid)
		}
	}
}

func recordDetachedSession(app *ui.App, finalBackend string) {
	if app.DetachedSessionID == "" {
		return
	}
	fmt.Fprintf(os.Stderr,
		"Detached. Reattach with:\n  gact attach %s\n",
		app.DetachedSessionID)
	if path, err := config.DetachedPath(); err == nil {
		_ = config.AppendDetached(path, config.DetachedRecord{
			SessionID: app.DetachedSessionID,
			Title:     app.DetachedTitle,
			Backend:   finalBackend,
			Workspace: app.DetachedWorkspace,
		}, 0)
	}
}
