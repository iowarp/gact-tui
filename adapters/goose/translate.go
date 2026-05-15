// Translation between Goose's HTTP wire shapes and GACT v0.1 types.
// Kept in its own file because Goose's session/message structures
// will grow as we wire more endpoints (sessions/messages/SSE).
package goose

import (
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// fileMutatingGooseTools is the set of Goose tool names that imply
// a file mutation worth surfacing as a GACT file_diff Part. Goose's
// developer extension is the universal one; vendor extensions can
// add their own (we'd extend this set).
var fileMutatingGooseTools = map[string]bool{
	"developer__text_editor": true,
}

// fileDiffForToolRequest synthesises a GACT file_diff Part from a
// developer__text_editor ToolRequest (see Goose's developer
// extension). Supported commands:
//
//   - str_replace : {path, old_str, new_str} → before is on-disk
//     content; after is before with first occurrence replaced.
//   - write       : {path, file_text} → before is current file
//     (or null when new); after = file_text.
//
// Other commands (view, undo_edit, etc.) return nil — they don't
// mutate. Returns nil when args are missing or read fails (defensive
// — prefer no diff over a wrong one).
func fileDiffForToolRequest(toolName string, args map[string]any, cwd string) *gact.Part {
	if !fileMutatingGooseTools[toolName] {
		return nil
	}
	command, _ := args["command"].(string)
	if command != "str_replace" && command != "write" {
		return nil
	}
	path, _ := args["path"].(string)
	if path == "" {
		return nil
	}
	abs := path
	if !filepath.IsAbs(abs) {
		abs = filepath.Join(cwd, path)
	}

	var before *string
	if data, err := os.ReadFile(abs); err == nil {
		s := string(data)
		before = &s
	} else if !errors.Is(err, fs.ErrNotExist) && !errors.Is(err, os.ErrNotExist) {
		// Anything other than "doesn't exist yet" — refuse to fabricate.
		return nil
	}

	var after string
	switch command {
	case "str_replace":
		oldStr, _ := args["old_str"].(string)
		newStr, _ := args["new_str"].(string)
		if oldStr == "" || before == nil {
			return nil
		}
		if !strings.Contains(*before, oldStr) {
			return nil
		}
		after = strings.Replace(*before, oldStr, newStr, 1)
	case "write":
		text, _ := args["file_text"].(string)
		after = text
	}

	part := gact.Part{
		Type:    gact.PartTypeFileDiff,
		Path:    path,
		Before:  before,
		After:   &after,
		Applied: false,
	}
	if lang := languageFor(path); lang != "" {
		part.Language = lang
	}
	return &part
}

// gooseTool mirrors goose-server agent.rs's ToolInfo. Only the
// fields we project are decoded.
type gooseTool struct {
	Name        string         `json:"name"`
	Description string         `json:"description,omitempty"`
	InputSchema map[string]any `json:"input_schema,omitempty"`
	Permission  any            `json:"permission,omitempty"`
}

// toolToGact projects a Goose ToolInfo into the GACT Tool wire shape
// (SPEC §6.6 + §4.6). Goose names already use the "extension__tool"
// convention, which we keep verbatim as both id and name so the
// per-id drill round-trips.
func toolToGact(g gooseTool) map[string]any {
	t := map[string]any{
		"id":          g.Name,
		"name":        g.Name,
		"source":      "builtin",
		"description": g.Description,
	}
	if g.InputSchema != nil {
		t["input_schema"] = g.InputSchema
	} else {
		t["input_schema"] = map[string]any{"type": "object"}
	}
	if g.Permission != nil {
		t["x_goose_permission"] = g.Permission
	}
	return t
}

// languageFor maps a file extension to a syntax-highlighting hint
// for the file_diff renderer. Conservative subset.
func languageFor(path string) string {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".py":
		return "python"
	case ".go":
		return "go"
	case ".rs":
		return "rust"
	case ".ts", ".tsx":
		return "typescript"
	case ".js", ".jsx":
		return "javascript"
	case ".java":
		return "java"
	case ".rb":
		return "ruby"
	case ".sh", ".bash", ".zsh":
		return "shell"
	case ".md":
		return "markdown"
	case ".json":
		return "json"
	case ".yaml", ".yml":
		return "yaml"
	case ".toml":
		return "toml"
	case ".html":
		return "html"
	case ".css":
		return "css"
	case ".sql":
		return "sql"
	case ".c", ".h":
		return "c"
	case ".cpp", ".hpp", ".cc":
		return "cpp"
	}
	return ""
}

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
	// MMMMMMM1: conversation is included on per-id session reads (it's
	// Option<Conversation> upstream, where Conversation is a newtype
	// over Vec<Message>). When absent we just expose an empty
	// messages list to the TUI.
	Conversation []gooseMessage `json:"conversation,omitempty"`
}

// gooseMessage mirrors Goose's conversation::message::Message. Only
// the fields the bridge needs are decoded; metadata + everything else
// flows through opaquely.
type gooseMessage struct {
	ID      *string          `json:"id,omitempty"`
	Role    string           `json:"role"`
	Created int64            `json:"created"`
	Content []map[string]any `json:"content"`
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

// MMMMMMM1: message + content translation -----------------------------

// roleToGact maps Goose's role string to a GACT role. Goose uses
// User/Assistant/Tool capitalised; GACT expects lowercase.
func roleToGact(r string) string {
	switch r {
	case "User", "user":
		return gact.RoleUser
	case "Assistant", "assistant":
		return gact.RoleAssistant
	case "System", "system":
		return gact.RoleSystem
	case "Tool", "tool":
		return gact.RoleTool
	}
	// Forward-compat: surface unknown roles as user (so the TUI
	// renders them somewhere) but also stash on metadata.
	return gact.RoleUser
}

// contentToGactPart maps a single Goose MessageContent variant to a
// GACT Part. The variant is identified by the `type` discriminant
// in the JSON (Goose uses serde tag-content style by default — the
// variant name appears as a top-level key). Our defensive read
// handles both shapes:
//   - {"text": {"text": "..."}}                       (untagged)
//   - {"type": "text", "text": "..."}                 (internally tagged)
//
// Unknown variants serialise as a text placeholder per the SPEC §5.4
// forward-compat rule.
func contentToGactPart(raw map[string]any) gact.Part {
	// Detect tagged form first (modern Goose).
	if t, ok := raw["type"].(string); ok {
		switch t {
		case "text":
			text, _ := raw["text"].(string)
			return gact.NewTextPart(text)
		case "thinking":
			text, _ := raw["thinking"].(string)
			if text == "" {
				text, _ = raw["text"].(string)
			}
			return gact.NewThinkingPart(text)
		case "toolRequest", "tool_request":
			return toolReqToGact(raw)
		case "toolResponse", "tool_response":
			return toolRespToGact(raw)
		}
	}
	// Untagged form: top-level key names the variant.
	for variant, payload := range raw {
		nested, ok := payload.(map[string]any)
		if !ok {
			continue
		}
		switch variant {
		case "Text", "text":
			text, _ := nested["text"].(string)
			return gact.NewTextPart(text)
		case "Thinking", "thinking":
			text, _ := nested["thinking"].(string)
			if text == "" {
				text, _ = nested["text"].(string)
			}
			return gact.NewThinkingPart(text)
		case "ToolRequest", "toolRequest":
			return toolReqToGact(nested)
		case "ToolResponse", "toolResponse":
			return toolRespToGact(nested)
		}
	}
	// Forward-compat placeholder.
	return gact.NewTextPart("[unsupported goose content]")
}

func toolReqToGact(raw map[string]any) gact.Part {
	id, _ := raw["id"].(string)
	if id == "" {
		// Some shapes nest under "tool_call".
		if tc, ok := raw["tool_call"].(map[string]any); ok {
			return toolReqToGact(tc)
		}
	}
	name, _ := raw["name"].(string)
	if name == "" {
		// Try "tool_call.value.name" (Goose's wrapped result enum).
		if tc, ok := raw["tool_call"].(map[string]any); ok {
			if val, ok := tc["value"].(map[string]any); ok {
				name, _ = val["name"].(string)
				args, _ := val["arguments"].(map[string]any)
				return gact.Part{
					Type:     gact.PartTypeToolCall,
					CallID:   id,
					ToolName: name,
					Input:    args,
				}
			}
		}
	}
	args, _ := raw["arguments"].(map[string]any)
	return gact.Part{
		Type:     gact.PartTypeToolCall,
		CallID:   id,
		ToolName: name,
		Input:    args,
	}
}

func toolRespToGact(raw map[string]any) gact.Part {
	id, _ := raw["id"].(string)
	if id == "" {
		id, _ = raw["tool_request_id"].(string)
	}
	// Goose wraps tool_result in an Ok/Err enum; extract the human-
	// readable string content if present, else stringify whatever's
	// there as a single text part.
	var contentParts []gact.Part
	if result, ok := raw["tool_result"].(map[string]any); ok {
		// Try {"Ok":[...]} / {"Err":...}
		if okList, isOk := result["Ok"].([]any); isOk {
			for _, item := range okList {
				if m, ok := item.(map[string]any); ok {
					contentParts = append(contentParts, contentToGactPart(m))
				}
			}
		} else if e, ok := result["Err"].(string); ok {
			contentParts = append(contentParts, gact.NewTextPart("error: "+e))
		}
	}
	if len(contentParts) == 0 {
		contentParts = append(contentParts, gact.NewTextPart("[empty tool response]"))
	}
	return gact.Part{
		Type:    gact.PartTypeToolResult,
		CallID:  id,
		Content: contentParts,
	}
}

// messageToGact projects a Goose Message into a GACT Message. Goose
// timestamps are unix seconds (i64); we widen to time.Time UTC.
//
// cwd, when non-empty, enables file_diff Part synthesis (QQQQQQQ1):
// every tool_call Part for `developer__text_editor` (str_replace /
// write) gets a sibling file_diff Part computed from the on-disk
// pre-state so the TUI's a/r apply/reject keys light up.
func messageToGact(g gooseMessage, sessionID string, idx int, cwd string) gact.Message {
	id := ""
	if g.ID != nil {
		id = *g.ID
	}
	if id == "" {
		// Synthesise a stable id derived from session + index so
		// re-fetches don't collide. SPEC requires id; this satisfies
		// it without persisting state.
		id = "msg_" + sessionID + "_" + itoa(idx)
	}
	parts := make([]gact.Part, 0, len(g.Content))
	for _, c := range g.Content {
		p := contentToGactPart(c)
		parts = append(parts, p)
		if cwd != "" && p.Type == gact.PartTypeToolCall {
			if diff := fileDiffForToolRequest(p.ToolName, p.Input, cwd); diff != nil {
				parts = append(parts, *diff)
			}
		}
	}
	return gact.Message{
		ID:        id,
		SessionID: sessionID,
		Role:      roleToGact(g.Role),
		Parts:     parts,
		CreatedAt: time.Unix(g.Created, 0).UTC(),
	}
}

// OOOOOOO1: translateMessageEvent maps Goose's MessageEvent
// variants (from /reply SSE) to GACT §7.3 event envelopes.
//
// The Goose taxonomy (from goose-server reply.rs):
//   - Message{message, token_state}        → message.created
//   - Finish{reason, token_state}          → session.status_changed:idle
//   - Error{error}                         → session.status_changed:error
//   - Notification{request_id, message}    → notification (level/title/body)
//   - Ping                                 → server.heartbeat
//   - UpdateConversation, ActiveRequests   → dropped (adapter-internal)
//
// Returns a list since some Goose events naturally fan out to
// multiple GACT events (e.g. Finish emits both message.completed
// and session.status_changed in the future).
//
// QQQQQQQ1: cwd is threaded through to messageToGact so the
// streaming Message events also produce file_diff sibling Parts.
func translateMessageEvent(raw map[string]any, sid, cwd string) []map[string]any {
	t, _ := raw["type"].(string)
	switch t {
	case "Message":
		m, ok := raw["message"].(map[string]any)
		if !ok {
			return nil
		}
		// Re-encode + decode through gooseMessage so the
		// existing messageToGact translation owns content
		// variant dispatch.
		buf, err := jsonMarshal(m)
		if err != nil {
			return nil
		}
		var gm gooseMessage
		if err := jsonUnmarshal(buf, &gm); err != nil {
			return nil
		}
		// id is unique within a session — unknown index here, so
		// derive from the goose id when present, otherwise from
		// the unix timestamp. Safe enough for SSE replay because
		// the gact TUI dedupes by message id.
		idx := int(gm.Created)
		gactMsg := messageToGact(gm, sid, idx, cwd)
		// Cast gact.Message → JSON-compat dict (the SSE writer
		// expects map[string]any payloads).
		jb, err := jsonMarshal(gactMsg)
		if err != nil {
			return nil
		}
		var msgDict map[string]any
		if err := jsonUnmarshal(jb, &msgDict); err != nil {
			return nil
		}
		return []map[string]any{
			{"type": "message.created", "payload": msgDict},
		}
	case "Finish":
		reason, _ := raw["reason"].(string)
		return []map[string]any{
			{
				"type": "session.status_changed",
				"payload": map[string]any{
					"session_id":  sid,
					"status":      "idle",
					"prev_status": "running",
					"reason":      reason,
				},
			},
		}
	case "Error":
		errStr, _ := raw["error"].(string)
		return []map[string]any{
			{
				"type": "session.status_changed",
				"payload": map[string]any{
					"session_id":  sid,
					"status":      "error",
					"prev_status": "running",
					"error":       errStr,
				},
			},
		}
	case "Notification":
		// MCP notification surfaced through the agent. Goose nests
		// the actual message under .message; we pass it through as
		// notification body. SPEC §7.3 notification payload:
		// {level, title, body}.
		nest, _ := raw["message"].(map[string]any)
		level, _ := nest["level"].(string)
		if level == "" {
			level = "info"
		}
		title, _ := nest["title"].(string)
		if title == "" {
			title = "MCP"
		}
		body, _ := nest["body"].(string)
		return []map[string]any{
			{
				"type": "notification",
				"payload": map[string]any{
					"level": level,
					"title": title,
					"body":  body,
				},
			},
		}
	case "Ping":
		return []map[string]any{
			{"type": "server.heartbeat", "payload": map[string]any{}},
		}
	}
	// UpdateConversation, ActiveRequests, unknown → dropped
	return nil
}

// jsonMarshal/jsonUnmarshal are tiny indirections so translate.go's
// SSE event translation reads cleanly without sprinkling json.Marshal
// calls through the dispatch.
func jsonMarshal(v any) ([]byte, error)   { return json.Marshal(v) }
func jsonUnmarshal(b []byte, v any) error { return json.Unmarshal(b, v) }

func itoa(n int) string {
	// Tiny non-strconv int formatter (avoids the strconv import).
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
