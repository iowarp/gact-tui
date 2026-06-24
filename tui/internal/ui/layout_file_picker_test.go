package ui

import (
	"errors"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// TestFilePicker_OpensOnAtAndInserts verifies M6: typing `@` at the
// start of input opens the picker, Enter on a loaded entry inserts
// `@path` into the buffer and records a send-time context attachment.
func TestFilePicker_OpensOnAtAndInserts(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a := newReadyApp(sessions, nil)
	a.focus = FocusInput

	// Typing @ on empty input opens picker.
	out, _ := a.Update(tea.KeyPressMsg{Code: '@', Text: "@"})
	a = out.(*App)
	if !a.filePicker.open {
		t.Fatalf("@ on empty didn't open picker")
	}

	// Inject loaded entries so we can exercise the selection path
	// without a live backend round-trip.
	a.filePicker.entries = []gact.FileEntry{
		{Path: "main.go", Type: "file"},
		{Path: "README.md", Type: "file"},
		{Path: "internal/store/store.go", Type: "file"},
	}
	a.filePicker.loaded = true

	// Type "sto" — should narrow to internal/store/store.go.
	for _, r := range "sto" {
		out, _ = a.Update(tea.KeyPressMsg{Code: r, Text: string(r)})
		a = out.(*App)
	}
	matches := a.filePicker.matches()
	if len(matches) != 1 || matches[0].Path != "internal/store/store.go" {
		t.Fatalf("filter 'sto' didn't narrow: %+v", matches)
	}

	// Enter inserts.
	out, cmd := a.Update(tea.KeyPressMsg{Code: tea.KeyEnter})
	a = out.(*App)
	if a.filePicker.open {
		t.Fatalf("Enter didn't close picker")
	}
	if !strings.Contains(a.inputComposer.input.Value(), "@internal/store/store.go") {
		t.Fatalf("insert missing: %q", a.inputComposer.input.Value())
	}
	if cmd != nil {
		t.Fatalf("picker selection should not attach until send")
	}
	if len(a.inputComposer.fileMentions) != 1 || a.inputComposer.fileMentions[0].Path != "internal/store/store.go" {
		t.Fatalf("file mentions = %#v, want selected store path", a.inputComposer.fileMentions)
	}
}

// TestFilePicker_LoadFailureStaysInPicker verifies a workspace file
// listing failure is local to the picker. The picker is an optional
// convenience path; a backend 404/500 here should not knock the whole
// TUI into StageError.
func TestFilePicker_LoadFailureStaysInPicker(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a := newReadyApp(sessions, nil)
	a.focus = FocusInput
	a.width = 110

	out, _ := a.Update(tea.KeyPressMsg{Code: '@', Text: "@"})
	a = out.(*App)
	if !a.filePicker.open {
		t.Fatalf("@ on empty didn't open picker")
	}

	out, cmd := a.Update(filePickerLoadedMsg{err: errors.New("gact: 500 backend down " + strings.Repeat("while loading workspace files ", 8))})
	a = out.(*App)
	if cmd != nil {
		t.Fatalf("file picker load failure returned unexpected cmd")
	}
	if a.stage != StageReady {
		t.Fatalf("stage = %v, want StageReady", a.stage)
	}
	if !a.filePicker.open {
		t.Fatalf("file picker should stay open on load failure")
	}
	if a.filePicker.errText == "" {
		t.Fatalf("file picker error text was not recorded")
	}
	view := a.filePicker.view()
	if !strings.Contains(view, "file picker unavailable") {
		t.Fatalf("picker view did not surface error: %q", view)
	}
	for _, line := range strings.Split(ansi.Strip(view), "\n") {
		if strings.Contains(line, "file picker unavailable") {
			content := strings.TrimSpace(strings.Trim(line, "│"))
			if got, want := lipgloss.Width(content), modalInsetListWidth(a.modals.modalWidth()); got > want {
				t.Fatalf("picker error content width = %d, want <= shared inset width %d: %q", got, want, content)
			}
			return
		}
	}
	t.Fatalf("picker error line missing from view: %q", view)
}

// TestFilePicker_FuzzyScore verifies the scoring function directly:
// substring matches beat skip-matches, basename-substring beats
// directory-substring, skips with smaller gaps beat scattered ones.
func TestFilePicker_FuzzyScore(t *testing.T) {
	// Substring matches return small scores.
	s1, ok := fuzzyScore("internal/server/server.go", "server")
	if !ok {
		t.Fatalf("expected match for 'server' in internal/server/server.go")
	}

	// Basename bonus: "server" in the basename component scores lower
	// than "server" in a directory component.
	s2, _ := fuzzyScore("internal/server-notes/x.md", "server")
	if s1 >= s2 {
		t.Errorf("basename match %d should beat dir match %d", s1, s2)
	}

	// Skip-match still works: "isrgo" → "internal/server.go" (i-s-r-g-o
	// appear in order even without being contiguous).
	if _, ok := fuzzyScore("internal/server.go", "isrgo"); !ok {
		t.Errorf("expected skip-match on 'isrgo'")
	}

	// Missing chars fail.
	if _, ok := fuzzyScore("internal/server/server.go", "zzzzzz"); ok {
		t.Errorf("impossible needle shouldn't match")
	}

	// Substring beats skip: typing "store" should rank the exact hit
	// over any hypothetical scattered match.
	aSub, _ := fuzzyScore("internal/store/store.go", "store")
	aSkip, _ := fuzzyScore("internal/s-t-o-r-e.go", "store")
	if aSub >= aSkip {
		t.Errorf("substring %d should beat skip %d", aSub, aSkip)
	}
}

// TestFilePicker_AtMidWordPassesThrough ensures @ in the middle of a
// word (e.g. typing an email address) doesn't hijack input.
func TestFilePicker_AtMidWordPassesThrough(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a := newReadyApp(sessions, nil)
	a.focus = FocusInput
	a.inputComposer.input.SetValue("hi jaime")

	out, _ := a.Update(tea.KeyPressMsg{Code: '@', Text: "@"})
	a = out.(*App)
	if a.filePicker.open {
		t.Fatalf("@ mid-word opened picker — should have passed through")
	}
}
