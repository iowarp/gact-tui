package ui

import (
	"testing"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// makeHistoryApp returns an App focused on the input with one session
// so pushInputHistory has a valid sessionID to key on.
func makeHistoryApp() *App {
	a := New("http://unused")
	a.stage = StageReady
	a.width, a.height = 100, 30
	a.focus = FocusInput
	a.session.sessions = []gact.Session{{ID: "s1", Title: "x"}}
	a.session.selected = 0
	return a
}

func TestPushInputHistory_EmptyAndNoSessionAreNoops(t *testing.T) {
	a := makeHistoryApp()
	a.inputComposer.pushHistory("")
	if len(a.inputComposer.inputHistoryBySession["s1"]) != 0 {
		t.Errorf("empty push should not land, got %+v", a.inputComposer.inputHistoryBySession["s1"])
	}

	a2 := New("http://unused")
	a2.session.sessions = nil
	a2.session.selected = -1
	a2.inputComposer.pushHistory("lost")
	if n := 0; len(a2.inputComposer.inputHistoryBySession) != n {
		t.Errorf("no-session push should not land, got %+v", a2.inputComposer.inputHistoryBySession)
	}
}

func TestPushInputHistory_DedupesConsecutive(t *testing.T) {
	a := makeHistoryApp()
	a.inputComposer.pushHistory("hello")
	a.inputComposer.pushHistory("hello")
	a.inputComposer.pushHistory("world")
	a.inputComposer.pushHistory("hello") // non-consecutive dupe, allowed
	got := a.inputComposer.inputHistoryBySession["s1"]
	want := []string{"hello", "world", "hello"}
	if len(got) != len(want) {
		t.Fatalf("len = %d, want %d (%+v)", len(got), len(want), got)
	}
	for i := range got {
		if got[i] != want[i] {
			t.Errorf("[%d] = %q, want %q", i, got[i], want[i])
		}
	}
}

func TestPushInputHistory_RespectsCap(t *testing.T) {
	a := makeHistoryApp()
	for i := 0; i < inputHistoryCap+5; i++ {
		a.inputComposer.pushHistory(randomString(i))
	}
	got := a.inputComposer.inputHistoryBySession["s1"]
	if len(got) != inputHistoryCap {
		t.Errorf("len = %d, want %d", len(got), inputHistoryCap)
	}
	// The oldest 5 entries should be gone; entry #5 should now be at
	// index 0.
	if got[0] != randomString(5) {
		t.Errorf("oldest entry after trim = %q, want %q", got[0], randomString(5))
	}
}

func TestHistoryPrev_FromEmptyWalksBackwards(t *testing.T) {
	a := makeHistoryApp()
	a.inputComposer.pushHistory("one")
	a.inputComposer.pushHistory("two")
	a.inputComposer.pushHistory("three")

	txt, ok := a.inputComposer.historyPrev()
	if !ok || txt != "three" {
		t.Errorf("first ↑ = %q ok=%v, want 'three' true", txt, ok)
	}
	txt, _ = a.inputComposer.historyPrev()
	if txt != "two" {
		t.Errorf("second ↑ = %q, want 'two'", txt)
	}
	txt, _ = a.inputComposer.historyPrev()
	if txt != "one" {
		t.Errorf("third ↑ = %q, want 'one'", txt)
	}
	// Further ↑ at oldest entry clamps (stays at 'one').
	txt, _ = a.inputComposer.historyPrev()
	if txt != "one" {
		t.Errorf("fourth ↑ (clamp) = %q, want 'one'", txt)
	}
}

func TestHistoryNext_RestoresDraftPastEnd(t *testing.T) {
	a := makeHistoryApp()
	a.inputComposer.input.SetValue("draft-in-progress")
	a.inputComposer.pushHistory("past prompt")

	// ↑ saves draft + shows past prompt.
	if txt, _ := a.inputComposer.historyPrev(); txt != "past prompt" {
		t.Errorf("↑ returned %q, want 'past prompt'", txt)
	}
	// ↓ restores the draft.
	txt, ok := a.inputComposer.historyNext()
	if !ok || txt != "draft-in-progress" {
		t.Errorf("↓ past end = %q ok=%v, want 'draft-in-progress' true", txt, ok)
	}
	if a.inputComposer.historyCursor != -1 {
		t.Errorf("cursor after ↓-past-end = %d, want -1", a.inputComposer.historyCursor)
	}
	if a.inputComposer.historyDraft != "" {
		t.Errorf("draft should be cleared after restore, got %q", a.inputComposer.historyDraft)
	}
}

func TestHistoryNext_NoOpWhenNotNavigating(t *testing.T) {
	a := makeHistoryApp()
	if _, ok := a.inputComposer.historyNext(); ok {
		t.Error("↓ before entering history mode should be a no-op")
	}
}

func TestHandleInputKey_UpOnEmptyInputEntersHistory(t *testing.T) {
	a := makeHistoryApp()
	a.inputComposer.pushHistory("earlier prompt")

	a.inputComposer.handleInputKey(tea.KeyPressMsg{Code: tea.KeyUp})
	if a.inputComposer.input.Value() != "earlier prompt" {
		t.Errorf("input = %q, want recalled history", a.inputComposer.input.Value())
	}
	if a.inputComposer.historyCursor < 0 {
		t.Error("history cursor should be active after ↑")
	}
}

func TestHandleInputKey_UpWithContentPassesThroughToTextarea(t *testing.T) {
	a := makeHistoryApp()
	a.inputComposer.pushHistory("earlier prompt")
	a.inputComposer.input.SetValue("user is typing")

	a.inputComposer.handleInputKey(tea.KeyPressMsg{Code: tea.KeyUp})
	// We should NOT have entered history mode — the text remains.
	if a.inputComposer.historyCursor >= 0 {
		t.Errorf("↑ with content should pass to textarea, not enter history")
	}
	if a.inputComposer.input.Value() != "user is typing" {
		t.Errorf("input = %q, want unchanged", a.inputComposer.input.Value())
	}
}

func TestHandleInputKey_TypingExitsHistory(t *testing.T) {
	a := makeHistoryApp()
	a.inputComposer.pushHistory("recalled")

	// Enter history mode.
	a.inputComposer.handleInputKey(tea.KeyPressMsg{Code: tea.KeyUp})
	if a.inputComposer.historyCursor < 0 {
		t.Fatal("setup: should be in history mode")
	}
	// Typing a character exits history mode.
	a.inputComposer.handleInputKey(tea.KeyPressMsg{Code: 'x', Text: "x"})
	if a.inputComposer.historyCursor != -1 {
		t.Errorf("typing should exit history mode, cursor = %d", a.inputComposer.historyCursor)
	}
}

func TestHandleInputKey_EnterPushesToHistory(t *testing.T) {
	a := makeHistoryApp()
	a.inputComposer.input.SetValue("ship it")
	_, _ = a.inputComposer.handleInputKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	h := a.inputComposer.inputHistoryBySession["s1"]
	if len(h) != 1 || h[0] != "ship it" {
		t.Errorf("history after Enter = %+v, want ['ship it']", h)
	}
}

func TestHistory_IsPerSessionNotShared(t *testing.T) {
	a := makeHistoryApp()
	a.session.sessions = []gact.Session{{ID: "s1"}, {ID: "s2"}}
	a.session.selected = 0
	a.inputComposer.input.SetValue("in session 1")
	a.inputComposer.handleInputKey(tea.KeyPressMsg{Code: tea.KeyEnter})

	a.session.selected = 1
	a.inputComposer.input.SetValue("in session 2")
	a.inputComposer.handleInputKey(tea.KeyPressMsg{Code: tea.KeyEnter})

	if got := a.inputComposer.inputHistoryBySession["s1"]; len(got) != 1 || got[0] != "in session 1" {
		t.Errorf("s1 history = %+v", got)
	}
	if got := a.inputComposer.inputHistoryBySession["s2"]; len(got) != 1 || got[0] != "in session 2" {
		t.Errorf("s2 history = %+v", got)
	}
}

// randomString is a deterministic "random" string so the cap-trim test
// can verify which entries remain after a trim — just "entry-<i>".
func randomString(i int) string {
	return "entry-" + itoa(i)
}

func itoa(i int) string {
	if i == 0 {
		return "0"
	}
	neg := i < 0
	if neg {
		i = -i
	}
	var b [20]byte
	pos := len(b)
	for i > 0 {
		pos--
		b[pos] = byte('0' + i%10)
		i /= 10
	}
	if neg {
		pos--
		b[pos] = '-'
	}
	return string(b[pos:])
}
