// Translation between Goose's HTTP wire shapes and GACT v0.1 types.
// Kept in its own file because Goose's session/message structures
// will grow as we wire more endpoints (sessions/messages/SSE).
package goose

import (
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// gooseSession mirrors the relevant subset of Goose's
// crates/goose/src/session/session_manager.rs Session struct that we
// need to project into a GACT Session. Fields we don't use (token
// counts, recipe, extension data) are left out so JSON decode is
// tolerant to additions on the upstream side.
type gooseSession struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	WorkingDir string    `json:"working_dir"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
	// Optional/back-compat aliases. Goose has historically carried a
	// `description` field; modern builds rename to `name`. The serde
	// alias on the upstream side lets either name decode; we mirror.
}

// gooseSessionList is the shape returned by Goose's GET /sessions.
// camelCase per the goose-server route's serde rename.
type gooseSessionList struct {
	Sessions []gooseSession `json:"sessions"`
}

// sessionToGact projects a Goose Session into the GACT v0.1 Session
// shape. Goose doesn't expose live agent status through the session
// list endpoint, so we synthesize "idle" — accurate for the read
// path (the TUI's status dot will go yellow only once a turn fires).
func sessionToGact(g gooseSession, wsID string) gact.Session {
	created := g.CreatedAt
	if created.IsZero() {
		created = g.UpdatedAt
	}
	return gact.Session{
		ID:          g.ID,
		WorkspaceID: wsID,
		Title:       g.Name,
		Status:      gact.StatusIdle,
		CreatedAt:   created,
		Metadata: map[string]any{
			"x_goose_working_dir": g.WorkingDir,
			"x_goose_updated_at":  g.UpdatedAt.UTC().Format(time.RFC3339),
		},
	}
}
