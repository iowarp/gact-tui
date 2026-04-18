package crush

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// crushAgentMessage mirrors crush proto.AgentMessage — the body Crush
// expects on POST /v1/workspaces/{id}/agent.
type crushAgentMessage struct {
	SessionID   string            `json:"session_id"`
	Prompt      string            `json:"prompt"`
	Attachments []crushAttachment `json:"attachments,omitempty"`
}

// crushAttachment mirrors crush proto.Attachment. Content is bytes,
// which encoding/json will base64-encode automatically.
type crushAttachment struct {
	FilePath string `json:"file_path"`
	FileName string `json:"file_name"`
	MimeType string `json:"mime_type"`
	Content  []byte `json:"content"`
}

// gactPostBody is the wire shape the GACT TUI sends — a subset of
// SPEC §6.3 that keeps only the fields we forward to Crush.
type gactPostBody struct {
	Parts []gact.Part    `json:"parts"`
	Model *gact.ModelRef `json:"model,omitempty"`
}

// handlePostMessage translates a GACT POST and forwards it to Crush's
// agent endpoint. Because Crush's AgentMessage carries a flat `prompt`
// string (not parts), we concatenate every text/thinking part into the
// prompt and lift image/document parts into attachments. Tool-call
// parts in a user message would be unusual but pass through as
// JSON-encoded text appended to the prompt so they aren't silently
// dropped.
//
// Returns 202 with a synthetic message_id. The real Crush message ID
// arrives later via the SSE `message.created` event (H2).
func (s *Server) handlePostMessage(w http.ResponseWriter, r *http.Request) {
	sid := r.PathValue("id")
	wsID := r.URL.Query().Get("workspace_id")
	if wsID == "" {
		wsID = s.defaultWsID
	}
	if wsID == "" {
		writeError(w, http.StatusBadRequest, "missing_workspace",
			"adapter requires workspace_id query for POST messages")
		return
	}

	var body gactPostBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	prompt, attachments := PartsToCrushAgentMessage(body.Parts)
	if prompt == "" && len(attachments) == 0 {
		writeError(w, http.StatusBadRequest, "empty_message",
			"message must contain at least one text/thinking part or attachment")
		return
	}

	upBody := crushAgentMessage{
		SessionID:   sid,
		Prompt:      prompt,
		Attachments: attachments,
	}
	buf, err := json.Marshal(upBody)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "marshal_failed", err.Error())
		return
	}

	if err := s.upstreamPost(r.Context(), "/v1/workspaces/"+wsID+"/agent", buf); err != nil {
		writeError(w, http.StatusBadGateway, "upstream_unreachable", err.Error())
		return
	}

	writeJSON(w, http.StatusAccepted, map[string]any{
		// Synthetic placeholder ID — the GACT TUI's SSE consumer will
		// replace it as soon as Crush emits message.created. Prefix
		// the timestamp so it's obviously synthetic in logs.
		"message_id":  "msg_pending_" + time.Now().UTC().Format("20060102T150405.000000000"),
		"accepted_at": time.Now().UTC(),
	})
}

// PartsToCrushAgentMessage extracts a flat prompt string + attachment
// list from a slice of GACT parts. text → prompt, thinking → prompt
// (Crush has no concept of authored thinking, but we don't drop it),
// image/document with binary base64 source → attachment, everything
// else → JSON-encoded into the prompt as a fenced block so the agent
// at least sees the user's intent.
func PartsToCrushAgentMessage(parts []gact.Part) (string, []crushAttachment) {
	var b strings.Builder
	var attachments []crushAttachment

	for i, p := range parts {
		switch p.Type {
		case gact.PartTypeText:
			if p.Text != "" {
				if b.Len() > 0 {
					b.WriteByte('\n')
				}
				b.WriteString(p.Text)
			}
		case gact.PartTypeThinking:
			// Surface thinking as a fenced block — informational, not
			// authoritative. Crush has no authored-thinking concept.
			if p.Thinking != "" {
				if b.Len() > 0 {
					b.WriteByte('\n')
				}
				b.WriteString("<thinking>\n")
				b.WriteString(p.Thinking)
				b.WriteString("\n</thinking>")
			}
		case gact.PartTypeImage, gact.PartTypeDocument:
			att, ok := partToAttachment(p, i)
			if ok {
				attachments = append(attachments, att)
			}
		default:
			// Anything we don't translate — drop into the prompt as a
			// JSON fence so the user can see we passed it through, even
			// if Crush's agent doesn't natively understand the type.
			raw, err := json.Marshal(p)
			if err == nil {
				if b.Len() > 0 {
					b.WriteByte('\n')
				}
				fmt.Fprintf(&b, "```json\n%s\n```", raw)
			}
		}
	}

	return b.String(), attachments
}

// partToAttachment converts an image/document part to a Crush
// attachment. Returns ok=false if the source isn't shaped as a binary
// blob (URL-only sources can't be carried as attachments without
// fetching them, which the adapter explicitly doesn't do — those should
// stay in the prompt as a URL reference, but we don't synthesise that
// fallback here to keep the prompt deterministic).
func partToAttachment(p gact.Part, idx int) (crushAttachment, bool) {
	src, ok := p.Source.(map[string]any)
	if !ok {
		return crushAttachment{}, false
	}
	// We accept either {type:"base64", data:...} or {type:"binary", data:...}.
	srcType, _ := src["type"].(string)
	if srcType != "base64" && srcType != "binary" {
		return crushAttachment{}, false
	}
	// data may arrive as []byte (when the source originates locally) or
	// a base64 string (when it came from JSON). Handle both.
	var content []byte
	switch v := src["data"].(type) {
	case []byte:
		content = v
	case string:
		content = []byte(v) // base64 round-trip happens at the JSON boundary
	default:
		return crushAttachment{}, false
	}
	mime, _ := src["mediaType"].(string)
	if mime == "" {
		mime = p.MimeType
	}
	name := p.Name
	if name == "" {
		name = fmt.Sprintf("attachment_%d", idx)
	}
	return crushAttachment{
		FilePath: p.Path,
		FileName: name,
		MimeType: mime,
		Content:  content,
	}, true
}

// upstreamPost issues a POST to Crush. Mirrors upstreamGet but for
// state-changing calls; same 4 MiB response cap and 10 s timeout when
// the caller's context doesn't carry a deadline.
func (s *Server) upstreamPost(ctx context.Context, path string, body []byte) error {
	if ctx == nil {
		c, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		ctx = c
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.upstream+path, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		// Drain a little body so the error message includes upstream's
		// reason where Crush returns a JSON error.
		buf, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("upstream %s: %d %s", path, resp.StatusCode, strings.TrimSpace(string(buf)))
	}
	return nil
}
