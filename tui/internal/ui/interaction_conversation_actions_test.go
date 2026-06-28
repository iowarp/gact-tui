package ui

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestConversationPartRightClickOpensSemanticActionMenu(t *testing.T) {
	mu, copied, _ := withClipboardSpy(t)
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 160
	a.height = 36
	a.stage = StageReady
	a.MouseEnabled = true
	a.session.sessions = []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a.session.selected = 0
	a.conversation.messages = []gact.Message{
		{ID: "m1", Role: gact.RoleUser, Parts: []gact.Part{{ID: "p1", Type: gact.PartTypeText, Text: "first"}}},
		{ID: "m2", Role: gact.RoleAssistant, Parts: []gact.Part{{ID: "p2", Type: gact.PartTypeText, Text: "second block"}}},
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "conversation:part:1:0")
	if !ok {
		t.Fatal("missing conversation hit target for assistant block")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseRight,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("right-clicking conversation block should not dispatch a command")
	}
	if !a.conversation.actions.open || a.focus != FocusBody || a.conversation.bodySelMsgIdx != 1 || a.conversation.bodySelPartIdx != 0 {
		t.Fatalf("right-click should select block and open actions, open=%v focus=%v msg=%d part=%d", a.conversation.actions.open, a.focus, a.conversation.bodySelMsgIdx, a.conversation.bodySelPartIdx)
	}

	_ = a.View()
	copyTarget, ok := findHitTargetForTest(a, "conversation-actions:copy-block")
	if !ok {
		t.Fatal("missing conversation copy-block action target")
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      copyTarget.rect.x,
		Y:      copyTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("copy-block action should not dispatch a backend command")
	}
	mu.Lock()
	gotCopy := *copied
	mu.Unlock()
	if gotCopy != "second block" {
		t.Fatalf("copy-block wrote %q", gotCopy)
	}
	if a.conversation.actions.open || !strings.Contains(a.transientHint, "copied") {
		t.Fatalf("copy-block should close menu and surface hint, open=%v hint=%q", a.conversation.actions.open, a.transientHint)
	}
}

func TestConversationActionMenuCopiesFullConversation(t *testing.T) {
	mu, copied, _ := withClipboardSpy(t)
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 160
	a.height = 36
	a.stage = StageReady
	a.MouseEnabled = true
	a.session.sessions = []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a.session.selected = 0
	a.conversation.messages = []gact.Message{
		{ID: "m1", Role: gact.RoleUser, Parts: []gact.Part{{ID: "p1", Type: gact.PartTypeText, Text: "first prompt"}}},
		{ID: "m2", Role: gact.RoleAssistant, Parts: []gact.Part{{ID: "p2", Type: gact.PartTypeText, Text: "second answer"}}},
	}

	_ = a.View()
	target, ok := findHitTargetForTest(a, "conversation:part:1:0")
	if !ok {
		t.Fatal("missing conversation hit target for assistant block")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseRight,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("right-clicking conversation block should not dispatch a command")
	}

	_ = a.View()
	copyTarget, ok := findHitTargetForTest(a, "conversation-actions:copy-conversation")
	if !ok {
		t.Fatal("missing conversation copy-conversation action target")
	}
	model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      copyTarget.rect.x,
		Y:      copyTarget.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd != nil {
		t.Fatal("copy-conversation action should not dispatch a backend command")
	}
	mu.Lock()
	gotCopy := *copied
	mu.Unlock()
	want := "## user:\nfirst prompt\n\n## assistant:\nsecond answer"
	if gotCopy != want {
		t.Fatalf("copy-conversation wrote %q, want %q", gotCopy, want)
	}
	if a.conversation.actions.open || !strings.Contains(a.transientHint, "copied full conversation") {
		t.Fatalf("copy-conversation should close menu and surface hint, open=%v hint=%q", a.conversation.actions.open, a.transientHint)
	}
}

func TestConversationActionMenuUsesOperatorCopyForMutatingActions(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.width = 160
	a.height = 36
	a.stage = StageReady
	a.MouseEnabled = true
	a.session.sessions = []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a.session.selected = 0
	a.conversation.messages = []gact.Message{{
		ID:        "m1",
		SessionID: "sess_1",
		Role:      gact.RoleAssistant,
		Parts: []gact.Part{{
			ID:   "q1",
			Type: gact.PartTypeAgentQuestion,
			Question: &gact.AgentQuestion{
				ID:     "question_1",
				Prompt: "Which data source should I use?",
			},
		}},
	}}

	if cmd := a.conversation.openActionsForPart(0, 0); cmd != nil {
		t.Fatal("opening conversation action menu should not dispatch")
	}
	out := ansi.Strip(a.conversation.viewActions())
	for _, want := range []string{
		"Respond to the question and continue the run.",
		"Remove later messages and resume from this point.",
		"Undo the most recent conversation change.",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("conversation action menu missing operator copy %q:\n%s", want, out)
		}
	}
	for _, stale := range []string{"backend-emitted", "Ask backend", "message mutation"} {
		if strings.Contains(out, stale) {
			t.Fatalf("conversation action menu leaked backend wording %q:\n%s", stale, out)
		}
	}
}

func TestConversationActionMenuRewindDispatchesSelectedMessage(t *testing.T) {
	var got map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/v1/sessions/s1/rewind" {
			http.NotFound(w, r)
			return
		}
		if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
			t.Fatalf("decode rewind request: %v", err)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"deleted_messages": []string{"m2"}})
	}))
	defer srv.Close()

	a := NewWithTheme(srv.URL, ThemeForMode(ModeDark))
	a.c = client.New(srv.URL)
	a.width = 120
	a.height = 32
	a.stage = StageReady
	a.focus = FocusBody
	a.session.sessions = []gact.Session{{ID: "s1", Title: "demo"}}
	a.session.selected = 0
	a.conversation.messages = []gact.Message{
		{ID: "m1", SessionID: "s1", Role: gact.RoleUser, Parts: []gact.Part{{ID: "p1", Type: gact.PartTypeText, Text: "question"}}},
		{ID: "m2", SessionID: "s1", Role: gact.RoleAssistant, Parts: []gact.Part{{ID: "p2", Type: gact.PartTypeText, Text: "answer"}}},
	}

	_ = a.conversation.openActionsForPart(0, 0)
	_ = a.View()
	target, ok := findHitTargetForTest(a, "conversation-actions:rewind-to-message")
	if !ok {
		t.Fatal("missing semantic rewind action target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)
	if cmd == nil {
		t.Fatal("rewind action should dispatch backend command")
	}
	msg := cmd()
	done, ok := msg.(sessionRewindDoneMsg)
	if !ok {
		t.Fatalf("cmd msg = %T, want sessionRewindDoneMsg", msg)
	}
	if done.err != nil || len(done.deleted) != 1 || done.deleted[0] != "m2" {
		t.Fatalf("rewind done = %#v", done)
	}
	if got["to_message_id"] != "m1" || got["include_target"] != false {
		t.Fatalf("rewind request = %#v", got)
	}
	if a.conversation.actions.open {
		t.Fatal("rewind action should close the action menu")
	}
}

func TestSessionRewindDoneSuccessReloadsMessages(t *testing.T) {
	reloadedNewestFirst := []gact.Message{{
		ID:        "m1",
		SessionID: "s1",
		Role:      gact.RoleUser,
		Parts:     []gact.Part{{ID: "p1", Type: gact.PartTypeText, Text: "checkpoint"}},
	}}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/v1/sessions/s1/messages" {
			http.NotFound(w, r)
			return
		}
		_ = json.NewEncoder(w).Encode(client.ListMessagesResponse{Messages: reloadedNewestFirst})
	}))
	defer srv.Close()

	a := NewWithTheme(srv.URL, ThemeForMode(ModeDark))
	a.c = client.New(srv.URL)
	a.stage = StageReady
	a.session.sessions = []gact.Session{{ID: "s1", Title: "demo"}}
	a.session.selected = 0
	a.conversation.messages = []gact.Message{
		{ID: "m1", SessionID: "s1", Role: gact.RoleUser, Parts: []gact.Part{{ID: "p1", Type: gact.PartTypeText, Text: "checkpoint"}}},
		{ID: "m2", SessionID: "s1", Role: gact.RoleAssistant, Parts: []gact.Part{{ID: "p2", Type: gact.PartTypeText, Text: "deleted"}}},
	}

	model, cmd := a.Update(sessionRewindDoneMsg{sessionID: "s1", deleted: []string{"m2"}})
	a = model.(*App)
	if !strings.Contains(a.transientHint, "rewound 1 message(s)") {
		t.Fatalf("hint = %q, want rewind count", a.transientHint)
	}
	if cmd == nil {
		t.Fatal("successful rewind should dispatch a reload batch")
	}
	msg := cmd()
	batch, ok := msg.(tea.BatchMsg)
	if !ok {
		t.Fatalf("cmd msg = %T, want tea.BatchMsg", msg)
	}
	var loaded messagesLoadedMsg
	for i := len(batch) - 1; i >= 0; i-- {
		c := batch[i]
		if c == nil {
			continue
		}
		if m, ok := c().(messagesLoadedMsg); ok {
			loaded = m
			break
		}
	}
	if loaded.sessionID != "s1" || len(loaded.messages) != 1 || loaded.messages[0].ID != "m1" {
		t.Fatalf("reload msg = %#v", loaded)
	}
	model, _ = a.Update(loaded)
	a = model.(*App)
	if len(a.conversation.messages) != 1 || a.conversation.messages[0].ID != "m1" {
		t.Fatalf("messages after reload = %#v", a.conversation.messages)
	}
}

func TestSessionRewindDoneFailureSurfacesErrorWithoutReload(t *testing.T) {
	a := NewWithTheme("http://127.0.0.1:18777", ThemeForMode(ModeDark))
	a.stage = StageReady

	model, cmd := a.Update(sessionRewindDoneMsg{sessionID: "s1", err: errors.New("message not found")})
	a = model.(*App)
	if !strings.Contains(a.transientHint, "rewind failed: message not found") {
		t.Fatalf("hint = %q, want underlying rewind error", a.transientHint)
	}
	if cmd == nil {
		t.Fatal("failure should still schedule hint expiry")
	}
}
