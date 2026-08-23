package opencode

import (
	"testing"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func TestMessageToGact_UserText(t *testing.T) {
	in := OcMessageWithParts{
		Info: OcMessage{
			ID: "msg_u1", SessionID: "ses_x", Role: "user",
			Time: OcTimes{Created: 1700000000000, Updated: 1700000000000},
		},
		Parts: []OcPart{{ID: "p1", Type: "text", Text: "hello world"}},
	}
	g := MessageToGact(in)
	if g.Role != gact.RoleUser {
		t.Errorf("role = %q", g.Role)
	}
	if g.ID != "msg_u1" {
		t.Errorf("id = %q", g.ID)
	}
	if len(g.Parts) != 1 {
		t.Fatalf("parts count = %d", len(g.Parts))
	}
	if g.Parts[0].Type != gact.PartTypeText || g.Parts[0].Text != "hello world" {
		t.Errorf("part = %+v", g.Parts[0])
	}
}

func TestMessageToGact_AssistantWithModelAndCost(t *testing.T) {
	in := OcMessageWithParts{
		Info: OcMessage{
			ID: "msg_a1", SessionID: "ses_x", Role: "assistant",
			Time:       OcTimes{Created: 1700000000000, Updated: 1700001000000, Completed: 1700001500000},
			ParentID:   "msg_u1",
			ProviderID: "anthropic",
			ModelID:    "claude-opus-4-7",
			Agent:      "default",
			Cost:       0.0135,
			Tokens: OcTokens{
				Input: 1500, Output: 600,
				Cache: struct {
					Read  int `json:"read,omitempty"`
					Write int `json:"write,omitempty"`
				}{Read: 100, Write: 0},
			},
			Finish: "end_turn",
		},
		Parts: []OcPart{
			{ID: "p1", Type: "reasoning", Text: "let me think"},
			{ID: "p2", Type: "text", Text: "here's the answer"},
		},
	}
	g := MessageToGact(in)
	if g.Model == nil || g.Model.ProviderID != "anthropic" {
		t.Errorf("model = %+v", g.Model)
	}
	if g.CostUSD != 0.0135 {
		t.Errorf("cost = %v", g.CostUSD)
	}
	if g.Tokens.Input != 1500 || g.Tokens.Output != 600 || g.Tokens.CacheRead != 100 {
		t.Errorf("tokens = %+v", g.Tokens)
	}
	if g.StopReason != "end_turn" {
		t.Errorf("stop_reason = %q", g.StopReason)
	}
	if len(g.Parts) != 2 {
		t.Fatalf("parts = %d", len(g.Parts))
	}
	if g.Parts[0].Type != gact.PartTypeThinking || g.Parts[0].Thinking != "let me think" {
		t.Errorf("reasoning part not translated: %+v", g.Parts[0])
	}
	if g.Parts[1].Type != gact.PartTypeText {
		t.Errorf("text part not translated: %+v", g.Parts[1])
	}
}

func TestPartToGact_Tool(t *testing.T) {
	in := OcPart{
		ID:     "p1",
		Type:   "tool",
		CallID: "call_xyz",
		Tool:   "bash",
		State: map[string]any{
			"status": "completed",
			"input":  map[string]any{"command": "ls -la"},
			"output": "...",
		},
	}
	g := partToGact(in)
	if g.Type != gact.PartTypeToolCall {
		t.Fatalf("type = %q", g.Type)
	}
	if g.CallID != "call_xyz" || g.ToolName != "bash" {
		t.Errorf("call_id/name = %q/%q", g.CallID, g.ToolName)
	}
	if cmd, _ := g.Input["command"].(string); cmd != "ls -la" {
		t.Errorf("input = %+v", g.Input)
	}
}

func TestPartToGact_File(t *testing.T) {
	in := OcPart{
		Type: "file", Mime: "image/png", Filename: "x.png", URL: "http://localhost/x.png",
	}
	g := partToGact(in)
	if g.Type != gact.PartTypeImage {
		t.Errorf("type = %q", g.Type)
	}
	if g.MimeType != "image/png" {
		t.Errorf("mime = %q", g.MimeType)
	}
	if g.Metadata["x_opencode_url"] != "http://localhost/x.png" {
		t.Errorf("metadata url missing")
	}
}

func TestPartToGact_UnknownTypeForwardCompat(t *testing.T) {
	in := OcPart{Type: "snapshot", Text: "snap-content"}
	g := partToGact(in)
	if g.Type != "x_opencode_snapshot" {
		t.Errorf("type = %q (forward-compat prefix expected)", g.Type)
	}
	if g.Metadata["x_opencode_text"] != "snap-content" {
		t.Errorf("text not preserved: %+v", g.Metadata)
	}
}

func TestMessagesToGact_PreservesOrder(t *testing.T) {
	in := []OcMessageWithParts{
		{Info: OcMessage{ID: "a", Role: "user"}},
		{Info: OcMessage{ID: "b", Role: "assistant"}},
		{Info: OcMessage{ID: "c", Role: "user"}},
	}
	out := MessagesToGact(in)
	if len(out) != 3 {
		t.Fatalf("count = %d", len(out))
	}
	for i, want := range []string{"a", "b", "c"} {
		if out[i].ID != want {
			t.Errorf("[%d] id = %q", i, out[i].ID)
		}
	}
}
