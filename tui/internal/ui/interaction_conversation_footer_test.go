package ui

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestConversationFooterActionsUseSemanticHitTargets(t *testing.T) {
	mu, copied, _ := withClipboardSpy(t)
	var posted string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && r.URL.Path == "/v1/sessions/sess_1/messages" {
			var body struct {
				Parts []gact.Part `json:"parts"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode retry body: %v", err)
			}
			if len(body.Parts) > 0 {
				posted = body.Parts[0].Text
			}
			_, _ = w.Write([]byte(`{"message_id":"msg_ack"}`))
			return
		}
		if r.Method == http.MethodDelete && r.URL.Path == "/v1/sessions/sess_1/messages/msg_assistant" {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		http.NotFound(w, r)
	}))
	defer srv.Close()

	newBodyApp := func() *App {
		a := NewWithTheme(srv.URL, ThemeForMode(ModeDark))
		a.width = 220
		a.height = 36
		a.stage = StageReady
		a.MouseEnabled = true
		a.focus = FocusBody
		a.session.sessions = []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
		a.session.selected = 0
		a.conversation.messages = []gact.Message{
			{
				ID:        "msg_user",
				SessionID: "sess_1",
				Role:      gact.RoleUser,
				Parts:     []gact.Part{{ID: "user_text", Type: gact.PartTypeText, Text: "rerun this"}},
			},
			{
				ID:        "msg_assistant",
				SessionID: "sess_1",
				Role:      gact.RoleAssistant,
				Parts:     []gact.Part{{ID: "assistant_text", Type: gact.PartTypeText, Text: "copy this"}},
			},
		}
		a.conversation.bodySelMsgIdx = 1
		a.conversation.bodySelPartIdx = 0
		return a
	}

	a := newBodyApp()
	_ = a.View()
	copyTarget, ok := findHitTargetForTest(a, "footer:conversation:copy")
	if !ok {
		t.Fatal("missing semantic footer copy target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{X: copyTarget.rect.x, Y: copyTarget.rect.y, Button: tea.MouseLeft}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("footer copy should not dispatch a command")
	}
	mu.Lock()
	if *copied != "copy this" {
		t.Fatalf("footer copy clipboard = %q, want assistant text", *copied)
	}
	mu.Unlock()
	if !strings.Contains(a.transientHint, "copied") {
		t.Fatalf("copy hint = %q, want copied", a.transientHint)
	}

	a = newBodyApp()
	a.conversation.bodySelMsgIdx = 0
	_ = a.View()
	retryTarget, ok := findHitTargetForTest(a, "footer:conversation:retry")
	if !ok {
		t.Fatal("missing semantic footer retry target")
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{X: retryTarget.rect.x, Y: retryTarget.rect.y, Button: tea.MouseLeft}))
	a = model.(*App)
	if cmd == nil {
		t.Fatal("footer retry should dispatch postMessage command")
	}
	_ = cmd()
	if posted != "rerun this" {
		t.Fatalf("footer retry posted = %q, want selected user text", posted)
	}

	a = newBodyApp()
	_ = a.View()
	deleteTarget, ok := findHitTargetForTest(a, "footer:conversation:delete")
	if !ok {
		t.Fatal("missing semantic footer delete target")
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{X: deleteTarget.rect.x, Y: deleteTarget.rect.y, Button: tea.MouseLeft}))
	a = model.(*App)
	if len(a.conversation.messages) != 1 || a.conversation.messages[0].ID != "msg_user" {
		t.Fatalf("footer delete should remove selected message, remaining=%+v", a.conversation.messages)
	}
	if cmd == nil {
		t.Fatal("footer delete should dispatch delete command")
	}
}

func TestConversationFooterCopyUsesSelectedSemanticBlock(t *testing.T) {
	mu, copied, _ := withClipboardSpy(t)
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 220
	a.height = 36
	a.stage = StageReady
	a.MouseEnabled = true
	a.focus = FocusBody
	a.session.sessions = []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a.session.selected = 0
	a.conversation.messages = []gact.Message{
		{
			ID:        "msg_assistant",
			SessionID: "sess_1",
			Role:      gact.RoleAssistant,
			Parts: []gact.Part{{
				ID:       "call_1",
				Type:     gact.PartTypeToolCall,
				CallID:   "call_read",
				ToolName: "ReadFile",
				Input:    map[string]any{"path": "main.go"},
			}},
		},
		{
			ID:        "msg_tool",
			SessionID: "sess_1",
			Role:      gact.RoleTool,
			Parts: []gact.Part{{
				ID:     "result_1",
				Type:   gact.PartTypeToolResult,
				CallID: "call_read",
				Content: []gact.Part{{
					Type: gact.PartTypeText,
					Text: "package main\n\nfunc main() {}",
				}},
			}},
		},
	}
	a.conversation.bodySelMsgIdx = 0
	a.conversation.bodySelPartIdx = 0

	_ = a.View()
	copyTarget, ok := findHitTargetForTest(a, "footer:conversation:copy")
	if !ok {
		t.Fatal("missing semantic footer copy target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      copyTarget.rect.x,
		Y:      copyTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("footer block copy should not dispatch a command")
	}
	mu.Lock()
	gotCopy := *copied
	mu.Unlock()
	if gotCopy != "package main\n\nfunc main() {}" {
		t.Fatalf("footer block copy clipboard = %q", gotCopy)
	}
	if !strings.Contains(a.transientHint, "copied") {
		t.Fatalf("copy hint = %q, want copied", a.transientHint)
	}
}
