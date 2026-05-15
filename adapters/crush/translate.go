// Package crush adapts Charmbracelet Crush's HTTP+SSE backend to the
// GACT v0.1 contract.
//
// Crush nests sessions under workspaces in its URL space:
//
//	GET /v1/workspaces/{wsID}/sessions
//	GET /v1/workspaces/{wsID}/sessions/{sid}
//	GET /v1/workspaces/{wsID}/sessions/{sid}/messages
//
// GACT flattens this with `?workspace_id=`. The translator maps URLs and
// shapes both ways.
package crush

import (
	"strings"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// CrushWorkspace mirrors crush proto.Workspace. We carry only the
// fields we translate.
type CrushWorkspace struct {
	ID        string         `json:"id"`
	Path      string         `json:"path"`
	Title     string         `json:"title,omitempty"`
	Yolo      bool           `json:"yolo,omitempty"`
	Debug     bool           `json:"debug,omitempty"`
	Env       map[string]any `json:"env,omitempty"`
	Config    map[string]any `json:"config,omitempty"`
	CreatedAt int64          `json:"created_at,omitempty"`
	UpdatedAt int64          `json:"updated_at,omitempty"`
}

// CrushSession mirrors crush proto.Session.
type CrushSession struct {
	ID               string  `json:"id"`
	WorkspaceID      string  `json:"workspace_id,omitempty"`
	ParentSessionID  string  `json:"parent_session_id,omitempty"`
	Title            string  `json:"title,omitempty"`
	MessageCount     int     `json:"message_count,omitempty"`
	PromptTokens     int     `json:"prompt_tokens,omitempty"`
	CompletionTokens int     `json:"completion_tokens,omitempty"`
	Cost             float64 `json:"cost,omitempty"`
	SummaryMessageID string  `json:"summary_message_id,omitempty"`
	CreatedAt        int64   `json:"created_at,omitempty"`
	UpdatedAt        int64   `json:"updated_at,omitempty"`
}

// WorkspaceToGact maps Crush workspace → GACT workspace. Crush carries
// per-workspace env + config which we surface via metadata; non-essentials
// are dropped to keep the wire shape small.
func WorkspaceToGact(c CrushWorkspace) gact.Workspace {
	out := gact.Workspace{
		ID:        c.ID,
		Name:      c.Title,
		RootPath:  c.Path,
		CreatedAt: secondsToTime(c.CreatedAt),
		UpdatedAt: secondsToTime(c.UpdatedAt),
		Config:    c.Config,
		Metadata:  map[string]any{},
	}
	if c.Title == "" {
		out.Name = baseName(c.Path)
	}
	if c.Yolo {
		out.Metadata["x_crush_yolo"] = true
	}
	if c.Debug {
		out.Metadata["x_crush_debug"] = true
	}
	if len(out.Metadata) == 0 {
		out.Metadata = nil
	}
	return out
}

// WorkspacesToGact bulk-translates a workspace list.
func WorkspacesToGact(cs []CrushWorkspace) []gact.Workspace {
	out := make([]gact.Workspace, len(cs))
	for i, c := range cs {
		out[i] = WorkspaceToGact(c)
	}
	return out
}

// SessionToGact maps Crush session → GACT session. workspaceID is
// passed in because Crush returns it implicitly via URL nesting (the
// session struct from `/v1/workspaces/{wsID}/sessions` doesn't always
// include it).
func SessionToGact(c CrushSession, workspaceID string) gact.Session {
	wsID := c.WorkspaceID
	if wsID == "" {
		wsID = workspaceID
	}
	out := gact.Session{
		ID:              c.ID,
		WorkspaceID:     wsID,
		ParentSessionID: c.ParentSessionID,
		Title:           c.Title,
		CreatedAt:       secondsToTime(c.CreatedAt),
		UpdatedAt:       secondsToTime(c.UpdatedAt),
		MessageCount:    c.MessageCount,
		Tokens: gact.Tokens{
			Input:  c.PromptTokens,
			Output: c.CompletionTokens,
		},
		CostUSD:  c.Cost,
		Status:   gact.StatusIdle,
		Metadata: map[string]any{},
	}
	if c.SummaryMessageID != "" {
		out.Metadata["x_crush_summary_message_id"] = c.SummaryMessageID
	}
	if len(out.Metadata) == 0 {
		out.Metadata = nil
	}
	return out
}

// SessionsToGact bulk-translates with the workspace ID.
func SessionsToGact(cs []CrushSession, workspaceID string) []gact.Session {
	out := make([]gact.Session, len(cs))
	for i, c := range cs {
		out[i] = SessionToGact(c, workspaceID)
	}
	return out
}

// secondsToTime treats t as Unix seconds (Crush's convention) and returns
// UTC time.Time. Zero or negative → zero time.
func secondsToTime(t int64) time.Time {
	if t <= 0 {
		return time.Time{}
	}
	return time.Unix(t, 0).UTC()
}

func baseName(p string) string {
	for i := len(p) - 1; i >= 0; i-- {
		if p[i] == '/' || p[i] == '\\' {
			return p[i+1:]
		}
	}
	if p == "" {
		return "workspace"
	}
	return p
}

// trimSlash strips a trailing slash so URL composition doesn't double-up.
func trimSlash(s string) string {
	return strings.TrimSuffix(s, "/")
}
