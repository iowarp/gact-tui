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
	ID         string         `json:"id"`
	Name       string         `json:"name"`
	WorkingDir string         `json:"working_dir"`
	CreatedAt  time.Time      `json:"created_at"`
	UpdatedAt  time.Time      `json:"updated_at"`
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
	ID      *string                  `json:"id,omitempty"`
	Role    string                   `json:"role"`
	Created int64                    `json:"created"`
	Content []map[string]any         `json:"content"`
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
		Type:     gact.PartTypeToolResult,
		CallID:   id,
		Content:  contentParts,
	}
}

// messageToGact projects a Goose Message into a GACT Message. Goose
// timestamps are unix seconds (i64); we widen to time.Time UTC.
func messageToGact(g gooseMessage, sessionID string, idx int) gact.Message {
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
		parts = append(parts, contentToGactPart(c))
	}
	return gact.Message{
		ID:        id,
		SessionID: sessionID,
		Role:      roleToGact(g.Role),
		Parts:     parts,
		CreatedAt: time.Unix(g.Created, 0).UTC(),
	}
}

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
