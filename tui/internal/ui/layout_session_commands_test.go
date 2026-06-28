package ui

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// TestDeleteLastMessage_DropsLocally verifies N3: pressing `d` on
// body focus removes the last message from the local slice and
// fires a background DELETE. No-ops when messages is empty.
func TestDeleteLastMessage_DropsLocally(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	msgs := []gact.Message{
		{ID: "msg_a", SessionID: "sess_1", Role: gact.RoleUser,
			Parts: []gact.Part{{ID: "p1", Type: gact.PartTypeText, Text: "a"}}},
		{ID: "msg_b", SessionID: "sess_1", Role: gact.RoleAssistant,
			Parts: []gact.Part{{ID: "p2", Type: gact.PartTypeText, Text: "b"}}},
	}
	a := newReadyApp(sessions, msgs)
	a.focus = FocusBody

	out, cmd := a.Update(tea.KeyPressMsg{Code: 'd', Text: "d"})
	a = out.(*App)
	if len(a.conversation.messages) != 1 {
		t.Fatalf("delete should leave 1 msg, got %d", len(a.conversation.messages))
	}
	if a.conversation.messages[0].ID != "msg_a" {
		t.Fatalf("wrong message remained: %q", a.conversation.messages[0].ID)
	}
	if cmd == nil {
		t.Fatalf("expected background delete cmd")
	}

	// Delete again — should drop msg_a.
	out, _ = a.Update(tea.KeyPressMsg{Code: 'd', Text: "d"})
	a = out.(*App)
	if len(a.conversation.messages) != 0 {
		t.Fatalf("second delete should empty messages, got %d", len(a.conversation.messages))
	}

	// Empty messages — no-op with hint.
	out, _ = a.Update(tea.KeyPressMsg{Code: 'd', Text: "d"})
	a = out.(*App)
	if a.transientHint != "no messages to delete" {
		t.Fatalf("expected no-messages hint, got %q", a.transientHint)
	}
}

// TestClear_RequiresDoubleConfirmation verifies N2: one /clear sets
// a pending state and leaves messages alone; a second /clear within
// the dwell actually wipes. Protects against accidental destructive
// command invocation.
func TestClear_RequiresDoubleConfirmation(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	msgs := []gact.Message{{
		ID: "msg1", SessionID: "sess_1", Role: gact.RoleUser,
		Parts: []gact.Part{{ID: "p1", Type: gact.PartTypeText, Text: "hi"}},
	}}
	a := newReadyApp(sessions, msgs)
	a.focus = FocusInput
	a.cmdPalette.commands = []gact.Command{
		{ID: "/clear", Title: "Clear chat history", Source: "builtin"},
	}

	// First /clear — should arm the pending state, NOT wipe messages.
	a.cmdPalette.paletteOpen = true
	a.cmdPalette.paletteFilter = ""
	a.cmdPalette.paletteSel = paletteIndexForTest(a, "/clear")
	out, _ := a.Update(tea.KeyPressMsg{Code: tea.KeyEnter})
	a = out.(*App)
	if a.cmdPalette.pendingClearSessionID != "sess_1" {
		t.Fatalf("first /clear didn't arm pending state: %q", a.cmdPalette.pendingClearSessionID)
	}
	if len(a.conversation.messages) == 0 {
		t.Fatalf("first /clear wiped messages — should require confirmation")
	}

	// Second /clear — should wipe.
	a.cmdPalette.paletteOpen = true
	a.cmdPalette.paletteFilter = ""
	a.cmdPalette.paletteSel = paletteIndexForTest(a, "/clear")
	out, _ = a.Update(tea.KeyPressMsg{Code: tea.KeyEnter})
	a = out.(*App)
	if len(a.conversation.messages) != 0 {
		t.Fatalf("second /clear didn't wipe messages: %d left", len(a.conversation.messages))
	}
	if a.cmdPalette.pendingClearSessionID != "" {
		t.Fatalf("pending state should clear after confirmed wipe: %q", a.cmdPalette.pendingClearSessionID)
	}
}

func TestClearSlashCmd_NoOpsWithoutActiveSession(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.session.selected = -1
	a.cmdPalette.commands = []gact.Command{
		{ID: "/clear", Title: "Clear chat history", Source: "builtin"},
	}
	a.cmdPalette.paletteOpen = true
	a.cmdPalette.paletteGroup = "Session"
	a.cmdPalette.paletteSel = paletteIndexForTest(a, "/clear")

	out, cmd := a.Update(tea.KeyPressMsg{Code: tea.KeyEnter})
	a = out.(*App)
	if cmd == nil {
		t.Fatal("clear no-session no-op should still schedule hint expiry")
	}
	if a.transientHint != "no active session to clear" {
		t.Fatalf("clear no-session hint = %q", a.transientHint)
	}
	if a.cmdPalette.pendingClearSessionID != "" {
		t.Fatalf("clear no-session should not arm confirmation, got %q", a.cmdPalette.pendingClearSessionID)
	}
	if a.cmdPalette.paletteOpen {
		t.Fatal("palette should close after /clear no-op")
	}
}

func TestCancelSlashCmd_NoOpsWhenSessionIdle(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a := newReadyApp(sessions, nil)
	a.session.currentStatus = gact.StatusIdle
	a.cmdPalette.commands = []gact.Command{{ID: "/cancel", Title: "Cancel", Source: "builtin"}}
	a.cmdPalette.paletteOpen = true
	a.cmdPalette.paletteFilter = ""
	a.cmdPalette.paletteSel = paletteIndexForTest(a, "/cancel")

	out, cmd := a.Update(tea.KeyPressMsg{Code: tea.KeyEnter})
	a = out.(*App)
	if cmd == nil {
		t.Fatal("idle cancel should still schedule hint expiry")
	}
	if a.transientHint != "nothing running in selected session" {
		t.Fatalf("idle cancel hint = %q", a.transientHint)
	}
	if a.cmdPalette.paletteOpen {
		t.Fatal("palette should close after /cancel no-op")
	}
}

func TestCancelSlashCmd_DispatchesWhenSessionRunning(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusRunning}}
	a := newReadyApp(sessions, nil)
	a.session.currentStatus = gact.StatusRunning
	a.cmdPalette.commands = []gact.Command{{ID: "/cancel", Title: "Cancel", Source: "builtin"}}
	a.cmdPalette.paletteOpen = true
	a.cmdPalette.paletteFilter = ""
	a.cmdPalette.paletteSel = paletteIndexForTest(a, "/cancel")

	out, cmd := a.Update(tea.KeyPressMsg{Code: tea.KeyEnter})
	a = out.(*App)
	if cmd == nil {
		t.Fatal("running cancel should dispatch backend cancellation command")
	}
	if a.transientHint != "cancelling run…" {
		t.Fatalf("running cancel hint = %q", a.transientHint)
	}
	if a.cmdPalette.paletteOpen {
		t.Fatal("palette should close after /cancel")
	}
}

func TestCancelSessionFailureShowsHintWithoutStageError(t *testing.T) {
	var hits int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && r.URL.Path == "/v1/sessions/sess_1/cancel" {
			hits++
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadGateway)
			_, _ = w.Write([]byte(`{"error":{"code":"cancel_failed","message":"backend unavailable"}}`))
			return
		}
		http.NotFound(w, r)
	}))
	defer srv.Close()

	a := newReadyApp([]gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusRunning}}, nil)
	a.c = client.New(srv.URL)
	msg := cancelCmd(a.c, "sess_1")()
	if hits != 1 {
		t.Fatalf("expected one backend cancel request, got %d", hits)
	}

	out, cmd := a.Update(msg)
	a = out.(*App)
	if cmd == nil {
		t.Fatal("cancel failure should schedule hint expiry")
	}
	if a.stage == StageError {
		t.Fatalf("cancel failure should not replace the session UI with StageError: %q", a.stageError)
	}
	if !strings.Contains(a.transientHint, "cancel failed:") || !strings.Contains(a.transientHint, "backend unavailable") {
		t.Fatalf("cancel failure hint = %q", a.transientHint)
	}
}

// TestSessionsSlashCmd_FocusesSidebarFilter verifies N4 routing:
// picking `/sessions` from the palette focuses the sidebar and
// pre-arms the title filter so the user can type straight into it.
func TestSessionsSlashCmd_FocusesSidebarFilter(t *testing.T) {
	sessions := []gact.Session{
		{ID: "sess_a", Title: "refactor auth", Status: gact.StatusIdle},
		{ID: "sess_b", Title: "add tests", Status: gact.StatusIdle},
	}
	a := newReadyApp(sessions, nil)
	a.focus = FocusInput
	a.cmdPalette.commands = []gact.Command{
		{ID: "/sessions", Title: "Focus sidebar + filter", Source: "builtin"},
	}
	a.cmdPalette.paletteOpen = true
	a.cmdPalette.paletteFilter = ""
	a.cmdPalette.paletteSel = paletteIndexForTest(a, "/sessions")

	out, _ := a.Update(tea.KeyPressMsg{Code: tea.KeyEnter})
	a = out.(*App)

	if a.cmdPalette.paletteOpen {
		t.Fatalf("palette should close after Enter on /sessions")
	}
	if a.focus != FocusSidebar {
		t.Fatalf("focus should be sidebar, got %v", a.focus)
	}
	if !a.sidebar.sessionFilterActive {
		t.Fatalf("session filter should be armed for editing")
	}
}

func paletteIndexForTest(a *App, id string) int {
	a.cmdPalette.paletteGroup = ""
	for _, cmd := range a.cmdPalette.visibleMatches() {
		if cmd.ID == id {
			a.cmdPalette.paletteGroup = paletteCommandGroup(cmd)
			break
		}
	}
	for i, cmd := range a.cmdPalette.visibleMatches() {
		if cmd.ID == id {
			return i
		}
	}
	return 0
}

// TestDuplicateSession_PreservesTitleAndExpert runs the duplicate cmd against
// an httptest backend and verifies the request copies only the supported
// operator contract: title + expert, fresh context. It intentionally does not
// copy ModelRef because CLIO uses global LM provider settings.
func TestDuplicateSession_PreservesTitleAndExpert(t *testing.T) {
	var req client.CreateSessionRequest
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/v1/sessions" {
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		_ = json.NewEncoder(w).Encode(gact.Session{
			ID:          "copy_1",
			WorkspaceID: req.WorkspaceID,
			Title:       req.Title,
			Agent:       *req.Agent,
		})
	}))
	defer srv.Close()

	src := gact.Session{
		ID:    "s1",
		Title: "refactor auth",
		Model: gact.ModelRef{ProviderID: "anthropic", ModelID: "claude-opus-4-7"},
		Agent: gact.AgentRef{ID: "code_reviewer"},
	}
	msg := duplicateSessionCmd(client.New(srv.URL), "ws_1", src)()
	created, ok := msg.(sessionCreatedMsg)
	if !ok {
		t.Fatalf("duplicate cmd returned %T, want sessionCreatedMsg", msg)
	}
	if req.WorkspaceID != "ws_1" {
		t.Fatalf("workspace_id = %q", req.WorkspaceID)
	}
	if req.Title != "refactor auth (copy)" {
		t.Fatalf("title = %q", req.Title)
	}
	if req.Agent == nil || req.Agent.ID != "code_reviewer" {
		t.Fatalf("agent = %#v", req.Agent)
	}
	if req.Model != nil {
		t.Fatalf("duplicate should not copy stale per-session model refs: %#v", req.Model)
	}
	if created.session.ID != "copy_1" || created.session.Title != "refactor auth (copy)" {
		t.Fatalf("created session = %#v", created.session)
	}
}

func TestDuplicateSessionFailureShowsHintWithoutStageError(t *testing.T) {
	a := newReadyApp([]gact.Session{{ID: "s1", Title: "demo"}}, nil)
	a.stage = StageReady

	out, cmd := a.Update(errMsg{stage: "duplicate-session", err: errors.New("backend unavailable")})
	a = out.(*App)
	if cmd == nil {
		t.Fatal("duplicate failure should schedule hint expiry")
	}
	if a.stage != StageReady {
		t.Fatalf("duplicate failure should keep TUI ready, got stage %v", a.stage)
	}
	if a.transientHint != "duplicate failed: backend unavailable" {
		t.Fatalf("hint = %q", a.transientHint)
	}
}

func TestCreateSessionFailureShowsHintWithoutStageError(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.stage = StageReady

	out, cmd := a.Update(errMsg{stage: "create-session", err: errors.New("backend unavailable")})
	a = out.(*App)
	if cmd == nil {
		t.Fatal("create failure should schedule hint expiry")
	}
	if a.stage != StageReady {
		t.Fatalf("create failure should keep TUI ready, got stage %v", a.stage)
	}
	if a.transientHint != "session create failed: backend unavailable" {
		t.Fatalf("hint = %q", a.transientHint)
	}
}

func TestNewSlashCmd_DispatchesCreateSession(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.cmdPalette.commands = []gact.Command{
		{ID: "/new", Title: "New session", Source: "builtin"},
	}
	a.cmdPalette.paletteOpen = true
	a.cmdPalette.paletteGroup = "Session"
	a.cmdPalette.paletteSel = paletteIndexForTest(a, "/new")

	out, cmd := a.Update(tea.KeyPressMsg{Code: tea.KeyEnter})
	a = out.(*App)
	if cmd == nil {
		t.Fatal("/new should dispatch session creation")
	}
	if a.cmdPalette.paletteOpen {
		t.Fatal("palette should close after /new")
	}
}

func TestDuplicateSlashCmd_NoOpsWithoutSelectedSession(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.session.selected = -1
	a.cmdPalette.commands = []gact.Command{
		{ID: "/duplicate", Title: "copy", Source: "builtin"},
	}
	a.cmdPalette.paletteOpen = true
	a.cmdPalette.paletteGroup = "Session"
	a.cmdPalette.paletteSel = paletteIndexForTest(a, "/duplicate")

	out, cmd := a.Update(tea.KeyPressMsg{Code: tea.KeyEnter})
	a = out.(*App)
	if cmd == nil {
		t.Fatal("duplicate no-op should still schedule hint expiry")
	}
	if a.transientHint != "no selected session to duplicate" {
		t.Fatalf("duplicate no-op hint = %q", a.transientHint)
	}
	if a.cmdPalette.paletteOpen {
		t.Fatal("palette should close after /duplicate no-op")
	}
}
