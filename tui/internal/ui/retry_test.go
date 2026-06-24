package ui

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestLastUserText_EmptySlice(t *testing.T) {
	if got, ok := lastUserText(nil); ok || got != "" {
		t.Errorf("empty msgs = %q ok=%v, want '' false", got, ok)
	}
}

func TestLastUserText_NoUserInSlice(t *testing.T) {
	msgs := []gact.Message{
		{Role: gact.RoleAssistant, Parts: []gact.Part{{Type: gact.PartTypeText, Text: "hi"}}},
	}
	if _, ok := lastUserText(msgs); ok {
		t.Error("assistant-only slice should not yield retry text")
	}
}

func TestLastUserText_TakesMostRecentUserMessage(t *testing.T) {
	msgs := []gact.Message{
		{Role: gact.RoleUser, Parts: []gact.Part{{Type: gact.PartTypeText, Text: "first question"}}},
		{Role: gact.RoleAssistant, Parts: []gact.Part{{Type: gact.PartTypeText, Text: "answer"}}},
		{Role: gact.RoleUser, Parts: []gact.Part{{Type: gact.PartTypeText, Text: "follow-up"}}},
	}
	got, ok := lastUserText(msgs)
	if !ok || got != "follow-up" {
		t.Errorf("got %q ok=%v, want 'follow-up' true", got, ok)
	}
}

func TestLastUserText_JoinsMultipleTextParts(t *testing.T) {
	msgs := []gact.Message{{
		Role: gact.RoleUser,
		Parts: []gact.Part{
			{Type: gact.PartTypeText, Text: "first paragraph"},
			{Type: gact.PartTypeText, Text: "second paragraph"},
		},
	}}
	got, _ := lastUserText(msgs)
	if got != "first paragraph\n\nsecond paragraph" {
		t.Errorf("got %q, want blank-line-joined parts", got)
	}
}

func TestLastUserText_NonTextOnlyYieldsFalse(t *testing.T) {
	// A user message carrying only an image (no text parts) can't be
	// retried as a plain-text resend. Better to surface "no user
	// message to retry" than to post an empty string.
	msgs := []gact.Message{{
		Role: gact.RoleUser,
		Parts: []gact.Part{
			{Type: gact.PartTypeImage, Name: "screenshot.png"},
		},
	}}
	if _, ok := lastUserText(msgs); ok {
		t.Error("image-only user message should not be retryable")
	}
}

func TestHandleBodyKey_CapitalRDispatchesPost(t *testing.T) {
	var (
		mu     sync.Mutex
		posted string
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && strings.Contains(r.URL.Path, "/messages") {
			buf, _ := io.ReadAll(r.Body)
			var body struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			}
			_ = json.Unmarshal(buf, &body)
			if len(body.Parts) > 0 {
				mu.Lock()
				posted = body.Parts[0].Text
				mu.Unlock()
			}
			_, _ = w.Write([]byte(`{"message_id":"msg_ack","accepted_at":"2026-04-18T00:00:00Z"}`))
			return
		}
		http.NotFound(w, r)
	}))
	defer srv.Close()

	a := New(srv.URL)
	a.focus = FocusBody
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0
	a.conversation.messages = []gact.Message{
		{Role: gact.RoleUser, Parts: []gact.Part{{Type: gact.PartTypeText, Text: "rerun this"}}},
		{Role: gact.RoleAssistant, Parts: []gact.Part{{Type: gact.PartTypeText, Text: "earlier answer"}}},
	}
	_, cmd := a.conversation.handleKey(tea.KeyPressMsg{Code: 'R', Text: "R", Mod: tea.ModShift})
	if cmd == nil {
		t.Fatal("R should dispatch postMessageCmd")
	}
	if !strings.Contains(a.transientHint, "retrying") {
		t.Errorf("hint = %q, want 'retrying' indicator", a.transientHint)
	}
	// Run the cmd so the HTTP round-trip fires against the spy.
	_ = cmd()
	mu.Lock()
	defer mu.Unlock()
	if posted != "rerun this" {
		t.Errorf("posted text = %q, want 'rerun this'", posted)
	}
}

func TestHandleBodyKey_CapitalRWithNoUserMessageHintsAndSkips(t *testing.T) {
	a := New("http://unused")
	a.focus = FocusBody
	a.session.sessions = []gact.Session{{ID: "s1"}}
	a.session.selected = 0
	a.conversation.messages = []gact.Message{
		{Role: gact.RoleAssistant, Parts: []gact.Part{{Type: gact.PartTypeText, Text: "nothing to retry"}}},
	}
	_, cmd := a.conversation.handleKey(tea.KeyPressMsg{Code: 'R', Text: "R", Mod: tea.ModShift})
	if cmd != nil {
		t.Error("R without a user message should not dispatch a post")
	}
	if !strings.Contains(a.transientHint, "no user message") {
		t.Errorf("hint = %q, want 'no user message to retry'", a.transientHint)
	}
}

func TestHandleBodyKey_CapitalRNoSessionIsNoop(t *testing.T) {
	a := New("http://unused")
	a.focus = FocusBody
	a.session.selected = -1
	a.conversation.messages = []gact.Message{{Role: gact.RoleUser, Parts: []gact.Part{{Type: gact.PartTypeText, Text: "x"}}}}
	_, cmd := a.conversation.handleKey(tea.KeyPressMsg{Code: 'R', Text: "R", Mod: tea.ModShift})
	if cmd != nil {
		t.Error("R with no current session should be a no-op")
	}
}
