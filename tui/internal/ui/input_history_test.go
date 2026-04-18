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
	a.sessions = []gact.Session{{ID: "s1", Title: "x"}}
	a.selected = 0
	return a
}

func TestPushInputHistory_EmptyAndNoSessionAreNoops(t *testing.T) {
	a := makeHistoryApp()
	a.pushInputHistory("")
	if len(a.inputHistoryBySession["s1"]) != 0 {
		t.Errorf("empty push should not land, got %+v", a.inputHistoryBySession["s1"])
	}

	a2 := New("http://unused")
	a2.sessions = nil
	a2.selected = -1
	a2.pushInputHistory("lost")
	if n := 0; len(a2.inputHistoryBySession) != n {
		t.Errorf("no-session push should not land, got %+v", a2.inputHistoryBySession)
	}
}

func TestPushInputHistory_DedupesConsecutive(t *testing.T) {
	a := makeHistoryApp()
	a.pushInputHistory("hello")
	a.pushInputHistory("hello")
	a.pushInputHistory("world")
	a.pushInputHistory("hello") // non-consecutive dupe, allowed
	got := a.inputHistoryBySession["s1"]
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
		a.pushInputHistory(randomString(i))
	}
	got := a.inputHistoryBySession["s1"]
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
	a.pushInputHistory("one")
	a.pushInputHistory("two")
	a.pushInputHistory("three")

	txt, ok := a.historyPrev()
	if !ok || txt != "three" {
		t.Errorf("first ↑ = %q ok=%v, want 'three' true", txt, ok)
	}
	txt, _ = a.historyPrev()
	if txt != "two" {
		t.Errorf("second ↑ = %q, want 'two'", txt)
	}
	txt, _ = a.historyPrev()
	if txt != "one" {
		t.Errorf("third ↑ = %q, want 'one'", txt)
	}
	// Further ↑ at oldest entry clamps (stays at 'one').
	txt, _ = a.historyPrev()
	if txt != "one" {
		t.Errorf("fourth ↑ (clamp) = %q, want 'one'", txt)
	}
}

func TestHistoryNext_RestoresDraftPastEnd(t *testing.T) {
	a := makeHistoryApp()
	a.input.SetValue("draft-in-progress")
	a.pushInputHistory("past prompt")

	// ↑ saves draft + shows past prompt.
	if txt, _ := a.historyPrev(); txt != "past prompt" {
		t.Errorf("↑ returned %q, want 'past prompt'", txt)
	}
	// ↓ restores the draft.
	txt, ok := a.historyNext()
	if !ok || txt != "draft-in-progress" {
		t.Errorf("↓ past end = %q ok=%v, want 'draft-in-progress' true", txt, ok)
	}
	if a.historyCursor != -1 {
		t.Errorf("cursor after ↓-past-end = %d, want -1", a.historyCursor)
	}
	if a.historyDraft != "" {
		t.Errorf("draft should be cleared after restore, got %q", a.historyDraft)
	}
}

func TestHistoryNext_NoOpWhenNotNavigating(t *testing.T) {
	a := makeHistoryApp()
	if _, ok := a.historyNext(); ok {
		t.Error("↓ before entering history mode should be a no-op")
	}
}

func TestHandleInputKey_UpOnEmptyInputEntersHistory(t *testing.T) {
	a := makeHistoryApp()
	a.pushInputHistory("earlier prompt")

	a.handleInputKey(tea.KeyPressMsg{Code: tea.KeyUp})
	if a.input.Value() != "earlier prompt" {
		t.Errorf("input = %q, want recalled history", a.input.Value())
	}
	if a.historyCursor < 0 {
		t.Error("history cursor should be active after ↑")
	}
}

func TestHandleInputKey_UpWithContentPassesThroughToTextarea(t *testing.T) {
	a := makeHistoryApp()
	a.pushInputHistory("earlier prompt")
	a.input.SetValue("user is typing")

	a.handleInputKey(tea.KeyPressMsg{Code: tea.KeyUp})
	// We should NOT have entered history mode — the text remains.
	if a.historyCursor >= 0 {
		t.Errorf("↑ with content should pass to textarea, not enter history")
	}
	if a.input.Value() != "user is typing" {
		t.Errorf("input = %q, want unchanged", a.input.Value())
	}
}

func TestHandleInputKey_TypingExitsHistory(t *testing.T) {
	a := makeHistoryApp()
	a.pushInputHistory("recalled")

	// Enter history mode.
	a.handleInputKey(tea.KeyPressMsg{Code: tea.KeyUp})
	if a.historyCursor < 0 {
		t.Fatal("setup: should be in history mode")
	}
	// Typing a character exits history mode.
	a.handleInputKey(tea.KeyPressMsg{Code: 'x', Text: "x"})
	if a.historyCursor != -1 {
		t.Errorf("typing should exit history mode, cursor = %d", a.historyCursor)
	}
}

func TestHandleInputKey_EnterPushesToHistory(t *testing.T) {
	a := makeHistoryApp()
	a.input.SetValue("ship it")
	_, _ = a.handleInputKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	h := a.inputHistoryBySession["s1"]
	if len(h) != 1 || h[0] != "ship it" {
		t.Errorf("history after Enter = %+v, want ['ship it']", h)
	}
}

func TestHistory_IsPerSessionNotShared(t *testing.T) {
	a := makeHistoryApp()
	a.sessions = []gact.Session{{ID: "s1"}, {ID: "s2"}}
	a.selected = 0
	a.input.SetValue("in session 1")
	a.handleInputKey(tea.KeyPressMsg{Code: tea.KeyEnter})

	a.selected = 1
	a.input.SetValue("in session 2")
	a.handleInputKey(tea.KeyPressMsg{Code: tea.KeyEnter})

	if got := a.inputHistoryBySession["s1"]; len(got) != 1 || got[0] != "in session 1" {
		t.Errorf("s1 history = %+v", got)
	}
	if got := a.inputHistoryBySession["s2"]; len(got) != 1 || got[0] != "in session 2" {
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
