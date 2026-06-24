package ui

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// makeSearchApp boots a httptest server that responds to the search
// endpoint with a fixed match list, then returns an App pointed at it
// with one synthetic session selected so currentSessionID is non-empty.
func makeSearchApp(t *testing.T, matches []client.SearchMatch) *App {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/sessions/sess_a/messages/search" {
			_ = json.NewEncoder(w).Encode(map[string]any{"matches": matches})
			return
		}
		http.NotFound(w, r)
	}))
	t.Cleanup(srv.Close)
	a := New(srv.URL)
	a.stage = StageReady
	a.width, a.height = 100, 30
	a.session.sessions = []gact.Session{{ID: "sess_a", Title: "session"}}
	a.session.selected = 0
	a.cmdPalette.paletteOpen = true
	return a
}

func TestSearchPalette_QuestionMarkSwitchesToSearchMode(t *testing.T) {
	a := makeSearchApp(t, nil)
	a.cmdPalette.handleKey(tea.KeyPressMsg{Code: '?', Text: "?"})
	if !a.cmdPalette.inSearchMode() {
		t.Errorf("after `?`, isSearchMode = false, want true")
	}
}

func TestSearchPalette_EnterSubmitsAndPopulatesMatches(t *testing.T) {
	want := []client.SearchMatch{
		{MessageID: "msg_1", PartID: "p_1", Snippet: "first hit", Score: 0.8},
		{MessageID: "msg_2", PartID: "p_2", Snippet: "second hit", Score: 0.5},
	}
	a := makeSearchApp(t, want)

	// Type "?find"
	for _, r := range "?find" {
		a.cmdPalette.handleKey(tea.KeyPressMsg{Code: rune(r), Text: string(r)})
	}

	// Enter to submit search.
	_, cmd := a.cmdPalette.handleKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if cmd == nil {
		t.Fatal("Enter on `?find` should return a search Cmd")
	}
	if !a.cmdPalette.searching {
		t.Error("a.cmdPalette.searching should be true while cmd is in flight")
	}

	// Run the cmd; expect a searchResultsMsg.
	msg := cmd()
	got, ok := msg.(searchResultsMsg)
	if !ok {
		t.Fatalf("cmd returned %T, want searchResultsMsg", msg)
	}
	if len(got.matches) != 2 || got.matches[0].MessageID != "msg_1" {
		t.Errorf("matches = %+v", got.matches)
	}

	// Apply the result through Update and verify state.
	model, _ := a.Update(got)
	a = model.(*App)
	if a.cmdPalette.searching {
		t.Error("a.cmdPalette.searching should be cleared after results arrive")
	}
	if len(a.cmdPalette.searchMatches) != 2 {
		t.Errorf("searchMatches len = %d", len(a.cmdPalette.searchMatches))
	}
}

func TestSearchPalette_SecondEnterJumpsAndClosesPalette(t *testing.T) {
	a := makeSearchApp(t, nil)
	// Pretend we already have results loaded + a couple of messages so
	// jumpToMessage finds one.
	a.cmdPalette.paletteFilter = "?x"
	a.cmdPalette.searchMatches = []client.SearchMatch{
		{MessageID: "msg_target", Snippet: "hit"},
	}
	a.conversation.messages = []gact.Message{
		{ID: "msg_a", CreatedAt: time.Now()},
		{ID: "msg_target", CreatedAt: time.Now()},
		{ID: "msg_b", CreatedAt: time.Now()},
	}
	a.cmdPalette.paletteSel = 0

	model, cmd := a.cmdPalette.handleKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	a = model.(*App)
	if cmd != nil {
		t.Errorf("second Enter should not emit a Cmd, got %v", cmd)
	}
	if a.cmdPalette.paletteOpen {
		t.Error("palette should close after jump")
	}
	// scrollOffset = totalMessages - index - 1 = 3 - 1 - 1 = 1.
	if a.conversation.scrollOffset != 1 {
		t.Errorf("scrollOffset = %d, want 1", a.conversation.scrollOffset)
	}
}

func TestSearchPalette_BackspaceClearsLoadedMatches(t *testing.T) {
	a := makeSearchApp(t, nil)
	a.cmdPalette.paletteFilter = "?find"
	a.cmdPalette.searchMatches = []client.SearchMatch{{MessageID: "msg_1", Snippet: "x"}}
	a.cmdPalette.handleKey(tea.KeyPressMsg{Code: tea.KeyBackspace})
	if a.cmdPalette.searchMatches != nil {
		t.Error("backspace should invalidate searchMatches")
	}
}

func TestSearchPalette_EmptyQueryEnterIsNoop(t *testing.T) {
	a := makeSearchApp(t, nil)
	a.cmdPalette.paletteFilter = "?"
	_, cmd := a.cmdPalette.handleKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	if cmd != nil {
		t.Error("Enter on `?` (no query) should not fire a search")
	}
}

func TestSearchPalette_SearchErrorIsSwallowed(t *testing.T) {
	a := makeSearchApp(t, nil)
	a.cmdPalette.paletteOpen = true
	model, _ := a.Update(errMsg{err: errExample, stage: "search"})
	a = model.(*App)
	if a.stage == StageError {
		t.Error("search err should not promote stage to Error")
	}
	if a.cmdPalette.searching {
		t.Error("a.cmdPalette.searching should be cleared")
	}
}

// minimal sentinel — avoids importing fmt just to errors.New in tests.
type stubErr struct{}

func (stubErr) Error() string { return "boom" }

var errExample = stubErr{}
