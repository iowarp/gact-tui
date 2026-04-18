// Package opencode adapts an OpenCode HTTP backend to the GACT v0.1
// contract so the GACT TUI can drive it without changes.
//
// Translation is one-way (GACT requests → OpenCode requests; OpenCode
// responses → GACT responses). Where shapes don't map cleanly we err on
// the side of producing valid GACT (sometimes lossy) rather than passing
// OpenCode-specific fields through.
package opencode

import (
	"strings"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// OcSession is the subset of OpenCode's Session.Info we consume.
// Mirrors packages/opencode/src/session/session.ts ::Info zod schema.
type OcSession struct {
	ID          string  `json:"id"`
	Slug        string  `json:"slug,omitempty"`
	ProjectID   string  `json:"projectID,omitempty"`
	WorkspaceID string  `json:"workspaceID,omitempty"`
	Directory   string  `json:"directory,omitempty"`
	ParentID    string  `json:"parentID,omitempty"`
	Title       string  `json:"title,omitempty"`
	Time        OcTimes `json:"time,omitempty"`
}

// OcTimes mirrors OpenCode's `time: {created, updated}` sub-object
// (timestamps are ms since epoch).
type OcTimes struct {
	Created   int64 `json:"created"`
	Updated   int64 `json:"updated"`
	Completed int64 `json:"completed,omitempty"`
}

// OcSessionListResponse mirrors GET /session/ which returns an array
// directly (no envelope).
type OcSessionListResponse []OcSession

// OcProjectInfo mirrors OpenCode's ProjectSummary ref.
type OcProjectInfo struct {
	ID       string `json:"id"`
	Name     string `json:"name,omitempty"`
	Worktree string `json:"worktree,omitempty"`
}

// --- Translators ----------------------------------------------------------

// SessionToGact converts an OpenCode session to a GACT session.
//
// Lossy fields:
//   - OpenCode's slug, projectID — preserved in metadata as
//     `x_opencode_slug`, `x_opencode_project_id`
//   - OpenCode summary/share — not mapped (would inflate the wire shape;
//     consumers can fetch via the adapter's per-session detail call if
//     we add one later)
//
// Defaulted fields:
//   - workspace_id: "ws_default" if upstream's workspaceID is empty
//   - status: always "idle" (OpenCode's status is computed from agent
//     activity which we don't track in this adapter)
//   - tokens, cost_usd: zero (OpenCode reports these per-message; would
//     need a roll-up call to populate at the session level)
func SessionToGact(o OcSession) gact.Session {
	wsID := o.WorkspaceID
	if wsID == "" {
		wsID = "ws_default"
	}
	out := gact.Session{
		ID:              o.ID,
		WorkspaceID:     wsID,
		ParentSessionID: o.ParentID,
		Title:           o.Title,
		CreatedAt:       msToTime(o.Time.Created),
		UpdatedAt:       msToTime(o.Time.Updated),
		Status:          gact.StatusIdle,
		Metadata:        map[string]any{},
	}
	if o.Slug != "" {
		out.Metadata["x_opencode_slug"] = o.Slug
	}
	if o.ProjectID != "" {
		out.Metadata["x_opencode_project_id"] = o.ProjectID
	}
	if o.Directory != "" {
		out.Metadata["x_opencode_directory"] = o.Directory
	}
	if len(out.Metadata) == 0 {
		out.Metadata = nil
	}
	return out
}

// SessionsToGact converts a list response.
func SessionsToGact(ocs []OcSession) []gact.Session {
	out := make([]gact.Session, len(ocs))
	for i, o := range ocs {
		out[i] = SessionToGact(o)
	}
	return out
}

// WorkspaceFromProject derives a synthetic GACT Workspace from an OpenCode
// project. OpenCode's project model is more granular than GACT's workspace
// — for v0.1 we collapse projectID + worktree into a single workspace.
func WorkspaceFromProject(p OcProjectInfo) gact.Workspace {
	id := "ws_" + sanitizeID(p.ID)
	if id == "ws_" {
		id = "ws_default"
	}
	name := p.Name
	if name == "" {
		name = baseName(p.Worktree)
	}
	return gact.Workspace{
		ID:        id,
		Name:      name,
		RootPath:  p.Worktree,
		CreatedAt: time.Now().UTC(),
		UpdatedAt: time.Now().UTC(),
		Metadata:  map[string]any{"x_opencode_project_id": p.ID},
	}
}

// --- Messages -------------------------------------------------------------

// OcMessage mirrors OpenCode's MessageV2 wire envelope from
// packages/opencode/src/session/message-v2.ts. The TS shape is
// discriminated by `role`. We carry only the fields we translate.
type OcMessage struct {
	ID        string  `json:"id"`
	SessionID string  `json:"sessionID"`
	Role      string  `json:"role"` // "user" | "assistant"
	Time      OcTimes `json:"time"`
	ParentID  string  `json:"parentID,omitempty"`
	ProviderID string `json:"providerID,omitempty"`
	ModelID    string `json:"modelID,omitempty"`
	Agent      string `json:"agent,omitempty"`
	Cost       float64 `json:"cost,omitempty"`
	Tokens     OcTokens `json:"tokens,omitempty"`
	Finish     string  `json:"finish,omitempty"`
}

// OcTokens mirrors OpenCode's tokens sub-object on assistant messages.
type OcTokens struct {
	Input  int `json:"input,omitempty"`
	Output int `json:"output,omitempty"`
	Cache  struct {
		Read  int `json:"read,omitempty"`
		Write int `json:"write,omitempty"`
	} `json:"cache,omitempty"`
}

// OcMessageWithParts mirrors OpenCode's GET /session/{id}/message response
// item: `{info: Message, parts: Part[]}`.
type OcMessageWithParts struct {
	Info  OcMessage `json:"info"`
	Parts []OcPart  `json:"parts"`
}

// OcPart is OpenCode's part envelope. Type fans out to the part-specific
// shape; for v0.1 we map text, reasoning, tool, file. Unknown types are
// preserved as a raw GACT part with the original type so the TUI can
// render them via its forward-compat "[type]" placeholder.
type OcPart struct {
	ID       string         `json:"id,omitempty"`
	Type     string         `json:"type"`
	Text     string         `json:"text,omitempty"`
	Time     map[string]any `json:"time,omitempty"`
	Metadata map[string]any `json:"metadata,omitempty"`
	// reasoning
	// (reasoning's payload is also under `text` in MessageV2)
	// tool
	CallID string         `json:"callID,omitempty"`
	Tool   string         `json:"tool,omitempty"`
	State  map[string]any `json:"state,omitempty"`
	// file
	Mime     string `json:"mime,omitempty"`
	Filename string `json:"filename,omitempty"`
	URL      string `json:"url,omitempty"`
}

// MessageToGact translates one OpenCode message+parts into a GACT message.
func MessageToGact(m OcMessageWithParts) gact.Message {
	out := gact.Message{
		ID:        m.Info.ID,
		SessionID: m.Info.SessionID,
		Role:      m.Info.Role,
		CreatedAt: msToTime(m.Info.Time.Created),
		UpdatedAt: msToTime(m.Info.Time.Updated),
		CostUSD:   m.Info.Cost,
		Tokens: gact.Tokens{
			Input:      m.Info.Tokens.Input,
			Output:     m.Info.Tokens.Output,
			CacheRead:  m.Info.Tokens.Cache.Read,
			CacheWrite: m.Info.Tokens.Cache.Write,
		},
		StopReason: m.Info.Finish,
	}
	if m.Info.ProviderID != "" || m.Info.ModelID != "" {
		out.Model = &gact.ModelRef{
			ProviderID: m.Info.ProviderID,
			ModelID:    m.Info.ModelID,
		}
	}
	out.Parts = make([]gact.Part, 0, len(m.Parts))
	for _, p := range m.Parts {
		out.Parts = append(out.Parts, partToGact(p))
	}
	return out
}

// partToGact translates a single OpenCode part. Unknown types fall through
// to a `Type: <opencode-type>` part so the TUI's placeholder renderer
// shows users what was there.
func partToGact(p OcPart) gact.Part {
	out := gact.Part{ID: p.ID, Metadata: p.Metadata}
	switch p.Type {
	case "text":
		out.Type = gact.PartTypeText
		out.Text = p.Text
	case "reasoning":
		out.Type = gact.PartTypeThinking
		out.Thinking = p.Text
	case "tool":
		out.Type = gact.PartTypeToolCall
		out.CallID = p.CallID
		out.ToolName = p.Tool
		// State carries OpenCode-specific shape; surface it via Input
		// so the user can see what the tool was called with.
		if input, ok := p.State["input"].(map[string]any); ok {
			out.Input = input
		} else if p.State != nil {
			out.Input = p.State
		}
	case "file":
		out.Type = gact.PartTypeImage // close enough for v0.1
		out.MimeType = p.Mime
		// Don't fail on missing source — fall through with metadata.
		if out.Metadata == nil {
			out.Metadata = map[string]any{}
		}
		if p.URL != "" {
			out.Metadata["x_opencode_url"] = p.URL
		}
		if p.Filename != "" {
			out.Metadata["x_opencode_filename"] = p.Filename
		}
	default:
		// Forward-compat: surface the OpenCode type so the TUI shows a
		// "[<type>]" placeholder rather than dropping the part.
		out.Type = "x_opencode_" + p.Type
		if out.Metadata == nil {
			out.Metadata = map[string]any{}
		}
		if p.Text != "" {
			out.Metadata["x_opencode_text"] = p.Text
		}
	}
	return out
}

// MessagesToGact translates a list response.
func MessagesToGact(ms []OcMessageWithParts) []gact.Message {
	out := make([]gact.Message, len(ms))
	for i, m := range ms {
		out[i] = MessageToGact(m)
	}
	return out
}

// --- Helpers --------------------------------------------------------------

// msToTime converts ms-since-epoch (OpenCode style) to time.Time. Returns
// zero Time if ms is 0.
func msToTime(ms int64) time.Time {
	if ms <= 0 {
		return time.Time{}
	}
	return time.UnixMilli(ms).UTC()
}

// sanitizeID strips characters that don't belong in our ID format.
// OpenCode IDs are nanoid-style (URL-safe) so this is mostly a no-op,
// but we play it safe.
func sanitizeID(s string) string {
	var b strings.Builder
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z',
			r >= 'A' && r <= 'Z',
			r >= '0' && r <= '9',
			r == '-' || r == '_':
			b.WriteRune(r)
		}
	}
	return b.String()
}

// baseName returns the trailing path segment of p, or p if there is none.
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
