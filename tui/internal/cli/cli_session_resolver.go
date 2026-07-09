package cli

import (
	"context"
	"strings"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// resolveSessionByName returns the id of the newest session whose
// title equals `name`. If `name` already starts with "sess_" it's
// treated as a literal id and returned unchanged. Returns
// (id, found, err); found=false means no session has that title yet.
func resolveSessionByName(ctx context.Context, c *client.Client, name string) (string, bool, error) {
	if strings.HasPrefix(name, "sess_") {
		// Literal id - verify it exists so misspellings fail fast.
		if _, err := c.GetSession(ctx, name); err != nil {
			return "", false, err
		}
		return name, true, nil
	}
	sessions, err := c.ListSessions(ctx, client.SessionFilter{})
	if err != nil {
		return "", false, err
	}
	// ListSessions returns newest-first per the SPEC; pick the first
	// matching title so re-running `gact tell foo "..."` resumes the
	// most recent foo rather than creating a parallel foo.
	for _, s := range sessions {
		if s.Title == name {
			return s.ID, true, nil
		}
	}
	return "", false, nil
}
