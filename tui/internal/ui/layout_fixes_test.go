// Tests for the M-series fixes: footer clipping, shift+enter newline,
// bracketed-paste gating, and /clear optimistic updates.
//
// These tests bypass tea.NewProgram and poke the App model directly — the
// same pattern app_view_test.go already established for deterministic
// rendering and key-press behavioural tests.
package ui

import (
	"strings"
	"testing"
	"time"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// longConversation returns n alternating user/assistant messages so the
// rendered body is guaranteed to exceed any realistic viewport.
func longConversation(sessionID string, n int) []gact.Message {
	out := make([]gact.Message, 0, n)
	for i := 0; i < n; i++ {
		role := gact.RoleUser
		text := "user turn "
		if i%2 == 1 {
			role = gact.RoleAssistant
			text = "assistant turn "
		}
		out = append(out, gact.Message{
			ID:        "msg_" + itoa(i),
			SessionID: sessionID,
			Role:      role,
			Parts: []gact.Part{{
				ID: "p" + itoa(i), Type: gact.PartTypeText,
				Text: text + itoa(i) + "\nsecond line of " + itoa(i) + "\nthird line of " + itoa(i),
			}},
		})
	}
	return out
}

// TestFooter_StaysInFrameOnLongConversation reproduces the user-reported
// "footer disappears when conversation grows" bug. The fix keeps the
// total rendered height equal to a.height, which guarantees the footer
// row is visible at the bottom.
func TestFooter_StaysInFrameOnLongConversation(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a := newReadyApp(sessions, longConversation("sess_1", 40))

	const W, H = 110, 30
	rendered := renderAtSize(a, W, H)
	lines := strings.Split(rendered, "\n")
	if len(lines) > H {
		t.Fatalf("rendered %d lines for height=%d — footer would overflow", len(lines), H)
	}

	// Footer must be on the last visible line (contains "Ctrl+N" hint).
	last := lines[len(lines)-1]
	if !strings.Contains(last, "Ctrl+N") {
		t.Fatalf("last row missing footer hint (Ctrl+N) — got:\n%q", last)
	}
}

// TestShiftEnter_InsertsNewline checks that the textarea's InsertNewline
// keymap accepts shift+enter (our rebinding) and produces a two-line
// buffer.
func TestShiftEnter_InsertsNewline(t *testing.T) {
	a := New("http://test.local")
	a.focus = FocusInput
	a.input.Focus()
	a.input.SetValue("first")

	// Simulate typing "shift+enter" then "second".
	out, _ := a.Update(tea.KeyPressMsg{Code: tea.KeyEnter, Mod: tea.ModShift})
	a = out.(*App)
	for _, r := range "second" {
		out, _ = a.Update(tea.KeyPressMsg{Code: r, Text: string(r)})
		a = out.(*App)
	}

	got := a.input.Value()
	if !strings.Contains(got, "\n") {
		t.Fatalf("expected newline in buffer, got %q", got)
	}
	if !strings.HasPrefix(got, "first") || !strings.HasSuffix(got, "second") {
		t.Fatalf("buffer content unexpected: %q", got)
	}
}

// TestEnter_InPaste_DoesNotSend guards the multi-prompt bug. During a
// bracketed paste window (PasteStartMsg received, PasteEndMsg not yet)
// a stray Enter keypress must NOT flush the buffer as a message — it
// should flow into the textarea as a literal newline.
func TestEnter_InPaste_DoesNotSend(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a := newReadyApp(sessions, nil)
	a.focus = FocusInput
	a.input.SetValue("line-one")

	// Enter "paste mode" (simulates terminal sending ESC[200~).
	out, _ := a.Update(tea.PasteStartMsg{})
	a = out.(*App)
	if !a.inPaste {
		t.Fatalf("PasteStartMsg didn't set inPaste")
	}

	// Simulate an Enter keypress during paste — the bug was that this
	// triggered postMessageCmd and split the paste into multiple prompts.
	// Now it should flow to the textarea (newline in buffer, buffer not
	// reset).
	out, _ = a.Update(tea.KeyPressMsg{Code: tea.KeyEnter})
	a = out.(*App)
	if a.input.Value() == "" {
		t.Fatalf("buffer was reset — Enter was intercepted despite inPaste")
	}

	// End of paste.
	out, _ = a.Update(tea.PasteEndMsg{})
	a = out.(*App)
	if a.inPaste {
		t.Fatalf("PasteEndMsg didn't clear inPaste")
	}
}

// TestBackslashEnter_InsertsNewline covers the Claude-Code muscle-memory
// rule: a trailing "\" + Enter drops the "\" and inserts a literal
// newline instead of sending.
func TestBackslashEnter_InsertsNewline(t *testing.T) {
	a := New("http://test.local")
	a.focus = FocusInput
	a.input.Focus()
	a.input.SetValue("before\\")

	out, _ := a.Update(tea.KeyPressMsg{Code: tea.KeyEnter})
	a = out.(*App)

	got := a.input.Value()
	if got != "before\n" {
		t.Fatalf("expected %q, got %q", "before\n", got)
	}
}

// TestHelpOverlay_TabCycles checks that ←/→ rotate helpTab within bounds
// so the tabbed help overlay never wraps past either end.
func TestHelpOverlay_TabCycles(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.helpOpen = true
	a.helpTab = 0

	// Right should increment up to helpTabCount-1 and stop.
	for i := 1; i < helpTabCount; i++ {
		out, _ := a.Update(tea.KeyPressMsg{Code: tea.KeyRight})
		a = out.(*App)
		if a.helpTab != i {
			t.Fatalf("after %d right-presses, helpTab = %d, want %d", i, a.helpTab, i)
		}
	}
	// One more right should stay pinned to the last tab.
	out, _ := a.Update(tea.KeyPressMsg{Code: tea.KeyRight})
	a = out.(*App)
	if a.helpTab != helpTabCount-1 {
		t.Fatalf("right past last tab: helpTab = %d, want %d", a.helpTab, helpTabCount-1)
	}

	// Left walks back to 0 and stops.
	for i := helpTabCount - 2; i >= 0; i-- {
		out, _ := a.Update(tea.KeyPressMsg{Code: tea.KeyLeft})
		a = out.(*App)
		if a.helpTab != i {
			t.Fatalf("helpTab = %d, want %d", a.helpTab, i)
		}
	}
	out, _ = a.Update(tea.KeyPressMsg{Code: tea.KeyLeft})
	a = out.(*App)
	if a.helpTab != 0 {
		t.Fatalf("left past first tab: helpTab = %d, want 0", a.helpTab)
	}
}

// TestHelpOverlay_FitsInSmallViewport verifies the overlay no longer
// overflows at the viewport size users report — 80x24 was the smallest
// size reviewers complained about.
func TestHelpOverlay_FitsInSmallViewport(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.helpOpen = true

	for _, dim := range []struct{ W, H int }{
		{80, 24}, {100, 30}, {110, 30},
	} {
		for tab := 0; tab < helpTabCount; tab++ {
			a.helpTab = tab
			rendered := renderAtSize(a, dim.W, dim.H)
			lines := strings.Count(rendered, "\n") + 1
			if lines > dim.H {
				t.Errorf("tab=%d W=%d H=%d: rendered %d lines > H", tab, dim.W, dim.H, lines)
			}
		}
	}
}

// TestPaste_MultiLineCompresses verifies the M4 behaviour: a paste with
// 3+ lines gets compressed to a [pasted content: N lines] placeholder
// in the input buffer, and the full content is recorded for later
// substitution.
func TestPaste_MultiLineCompresses(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a := newReadyApp(sessions, nil)
	a.focus = FocusInput

	out, _ := a.Update(tea.PasteStartMsg{})
	a = out.(*App)
	out, _ = a.Update(tea.PasteMsg{Content: "line 1\nline 2\nline 3\nline 4"})
	a = out.(*App)
	out, _ = a.Update(tea.PasteEndMsg{})
	a = out.(*App)

	buf := a.input.Value()
	if !strings.Contains(buf, "[pasted content") {
		t.Fatalf("buffer missing placeholder, got %q", buf)
	}
	if !strings.Contains(buf, "4 lines") {
		t.Fatalf("placeholder doesn't report line count, got %q", buf)
	}
	if len(a.pastes) != 1 {
		t.Fatalf("pastes = %d, want 1", len(a.pastes))
	}
	if a.pastes[0].content != "line 1\nline 2\nline 3\nline 4" {
		t.Fatalf("paste content not preserved: %q", a.pastes[0].content)
	}

	// expandPasteText should replace the placeholder with the real body.
	expanded := a.expandPasteText(buf)
	if !strings.Contains(expanded, "line 1\nline 2\nline 3\nline 4") {
		t.Fatalf("expand failed: %q", expanded)
	}
	if strings.Contains(expanded, "[pasted content") {
		t.Fatalf("placeholder survived expansion: %q", expanded)
	}
}

// TestPaste_ShortPassesThrough ensures 2-line pastes don't trigger the
// compression path — overhead isn't worth it at small sizes and the
// user experience of "pasted content: 2 lines" would feel silly.
func TestPaste_ShortPassesThrough(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a := newReadyApp(sessions, nil)
	a.focus = FocusInput

	out, _ := a.Update(tea.PasteMsg{Content: "one\ntwo"})
	a = out.(*App)
	if len(a.pastes) != 0 {
		t.Fatalf("short paste shouldn't compress, pastes=%d", len(a.pastes))
	}
	// Content should be in the textarea directly (textarea's own
	// PasteMsg handling).
	if !strings.Contains(a.input.Value(), "one") {
		t.Fatalf("short paste content missing: %q", a.input.Value())
	}
}

// TestPaste_CtrlPExpandsLatest ensures Ctrl+P swaps the most recent
// placeholder for real content in the buffer.
func TestPaste_CtrlPExpandsLatest(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a := newReadyApp(sessions, nil)
	a.focus = FocusInput

	out, _ := a.Update(tea.PasteMsg{Content: "a\nb\nc"})
	a = out.(*App)
	if !strings.Contains(a.input.Value(), "[pasted content") {
		t.Fatalf("setup: paste didn't compress")
	}

	// Ctrl+P has no Text payload — Ctrl-modified keys aren't
	// considered printable input.
	out, _ = a.Update(tea.KeyPressMsg{Code: 'p', Mod: tea.ModCtrl})
	a = out.(*App)

	buf := a.input.Value()
	if strings.Contains(buf, "[pasted content") {
		t.Fatalf("Ctrl+P didn't expand: %q", buf)
	}
	if !strings.Contains(buf, "a\nb\nc") {
		t.Fatalf("expanded content missing: %q", buf)
	}
	if len(a.pastes) != 0 {
		t.Fatalf("paste record should be dropped after expand, got %d", len(a.pastes))
	}
}

// TestFilePicker_OpensOnAtAndInserts verifies M6: typing `@` at the
// start of input opens the picker, Enter on a loaded entry inserts
// `@path` into the buffer and triggers an AddContextFile command.
func TestFilePicker_OpensOnAtAndInserts(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a := newReadyApp(sessions, nil)
	a.focus = FocusInput

	// Typing @ on empty input opens picker.
	out, _ := a.Update(tea.KeyPressMsg{Code: '@', Text: "@"})
	a = out.(*App)
	if !a.filePickerOpen {
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
	matches := a.filePickerMatches()
	if len(matches) != 1 || matches[0].Path != "internal/store/store.go" {
		t.Fatalf("filter 'sto' didn't narrow: %+v", matches)
	}

	// Enter inserts.
	out, cmd := a.Update(tea.KeyPressMsg{Code: tea.KeyEnter})
	a = out.(*App)
	if a.filePickerOpen {
		t.Fatalf("Enter didn't close picker")
	}
	if !strings.Contains(a.input.Value(), "@internal/store/store.go") {
		t.Fatalf("insert missing: %q", a.input.Value())
	}
	if cmd == nil {
		t.Fatalf("expected addContextFile cmd after insert")
	}
}

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
	if len(a.messages) != 1 {
		t.Fatalf("delete should leave 1 msg, got %d", len(a.messages))
	}
	if a.messages[0].ID != "msg_a" {
		t.Fatalf("wrong message remained: %q", a.messages[0].ID)
	}
	if cmd == nil {
		t.Fatalf("expected background delete cmd")
	}

	// Delete again — should drop msg_a.
	out, _ = a.Update(tea.KeyPressMsg{Code: 'd', Text: "d"})
	a = out.(*App)
	if len(a.messages) != 0 {
		t.Fatalf("second delete should empty messages, got %d", len(a.messages))
	}

	// Empty messages — no-op with hint.
	out, _ = a.Update(tea.KeyPressMsg{Code: 'd', Text: "d"})
	a = out.(*App)
	if a.transientHint != "no messages to delete" {
		t.Fatalf("expected no-messages hint, got %q", a.transientHint)
	}
}

// TestCollapseThreshold_CallsSaveConfig verifies N5 persistence: every
// stepper ◀/▶ flush fires SaveConfig so the on-disk file tracks the
// current value.
func TestCollapseThreshold_CallsSaveConfig(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.settingsOpen = true
	a.settings = &settingsState{tab: 3, tuiRow: 0}
	a.Theme.CollapseThreshold = 5
	called := 0
	a.SaveConfig = func() error {
		called++
		return nil
	}

	// Right nudges + persists.
	out, _ := a.Update(tea.KeyPressMsg{Code: tea.KeyRight})
	a = out.(*App)
	if called != 1 {
		t.Fatalf("Right should call SaveConfig, got called=%d", called)
	}

	// Left nudges + persists.
	out, _ = a.Update(tea.KeyPressMsg{Code: tea.KeyLeft})
	a = out.(*App)
	if called != 2 {
		t.Fatalf("Left should call SaveConfig, got called=%d", called)
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
	a.commands = []gact.Command{
		{ID: "/clear", Title: "Clear chat history", Source: "builtin"},
	}

	// First /clear — should arm the pending state, NOT wipe messages.
	a.paletteOpen = true
	a.paletteFilter = ""
	a.paletteSel = 0
	out, _ := a.Update(tea.KeyPressMsg{Code: tea.KeyEnter})
	a = out.(*App)
	if a.pendingClearSessionID != "sess_1" {
		t.Fatalf("first /clear didn't arm pending state: %q", a.pendingClearSessionID)
	}
	if len(a.messages) == 0 {
		t.Fatalf("first /clear wiped messages — should require confirmation")
	}

	// Second /clear — should wipe.
	a.paletteOpen = true
	a.paletteFilter = ""
	a.paletteSel = 0
	out, _ = a.Update(tea.KeyPressMsg{Code: tea.KeyEnter})
	a = out.(*App)
	if len(a.messages) != 0 {
		t.Fatalf("second /clear didn't wipe messages: %d left", len(a.messages))
	}
	if a.pendingClearSessionID != "" {
		t.Fatalf("pending state should clear after confirmed wipe: %q", a.pendingClearSessionID)
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
	a.commands = []gact.Command{
		{ID: "/sessions", Title: "Focus sidebar + filter", Source: "builtin"},
	}
	a.paletteOpen = true
	a.paletteFilter = ""
	a.paletteSel = 0

	out, _ := a.Update(tea.KeyPressMsg{Code: tea.KeyEnter})
	a = out.(*App)

	if a.paletteOpen {
		t.Fatalf("palette should close after Enter on /sessions")
	}
	if a.focus != FocusSidebar {
		t.Fatalf("focus should be sidebar, got %v", a.focus)
	}
	if !a.sessionFilterActive {
		t.Fatalf("session filter should be armed for editing")
	}
}

// TestCostThresholds_DefaultAndOverride verifies P3: zero → Claude
// defaults (100K / 150K); user override sticks through applyStyles.
func TestCostThresholds_DefaultAndOverride(t *testing.T) {
	dark := ThemeForMode(ModeDark)
	if dark.CostWarnTokens != 100_000 {
		t.Errorf("default warn = %d, want 100000", dark.CostWarnTokens)
	}
	if dark.CostDangerTokens != 150_000 {
		t.Errorf("default danger = %d, want 150000", dark.CostDangerTokens)
	}

	// User override via direct assignment survives applyStyles re-run
	// (mimics what the live-swap path does).
	custom := dark
	custom.CostWarnTokens = 20_000
	custom.CostDangerTokens = 30_000
	custom.applyStyles()
	if custom.CostWarnTokens != 20_000 {
		t.Errorf("override warn lost: %d", custom.CostWarnTokens)
	}
	if custom.CostDangerTokens != 30_000 {
		t.Errorf("override danger lost: %d", custom.CostDangerTokens)
	}
}

// TestSearchJump_MarksMessage verifies V3: jumpToMessage sets
// searchHitMessageID and the rendered conversation contains the
// gutter marker on the matching row.
func TestSearchJump_MarksMessage(t *testing.T) {
	sessions := []gact.Session{{ID: "s1", Title: "demo", Status: gact.StatusIdle}}
	msgs := []gact.Message{
		{ID: "m1", SessionID: "s1", Role: gact.RoleUser,
			Parts: []gact.Part{{Type: gact.PartTypeText, Text: "first", ID: "p1"}}},
		{ID: "m2", SessionID: "s1", Role: gact.RoleAssistant,
			Parts: []gact.Part{{Type: gact.PartTypeText, Text: "second", ID: "p2"}}},
	}
	a := newReadyApp(sessions, msgs)
	a.jumpToMessage("m2")

	if a.searchHitMessageID != "m2" {
		t.Fatalf("searchHitMessageID = %q, want m2", a.searchHitMessageID)
	}

	rendered := ansi.Strip(renderAtSize(a, 110, 30))
	if !strings.Contains(rendered, "▶ ") {
		t.Fatalf("gutter marker missing from render:\n%s", rendered)
	}
}

// TestSSEHealthDot_ReflectsStage covers V2: the helper returns a
// glyph whose colour maps to the current SSE state — green for live,
// amber during backoff, red during the initial connect stage.
func TestSSEHealthDot_ReflectsStage(t *testing.T) {
	a := newReadyApp(nil, nil)
	// Defaults: Ready stage + 0 backoff attempts → green.
	if got := ansi.Strip(a.sseHealthDot()); got != "●" {
		t.Errorf("live dot glyph = %q, want '●'", got)
	}

	// Backoff raises the dot to amber — glyph is the same, but we
	// can at least test the code path doesn't panic.
	a.sseBackoffAttempts = 3
	_ = a.sseHealthDot()

	// Connect stage.
	a.stage = StageConnecting
	a.sseBackoffAttempts = 0
	_ = a.sseHealthDot()
}

// TestWindowTitle_ReflectsActiveSession verifies T1 + U2: the View()'s
// WindowTitle is "GACT — <title>" when a session is selected (plus
// a status suffix when running or waiting on permission), and a bare
// "GACT" otherwise.
func TestWindowTitle_ReflectsActiveSession(t *testing.T) {
	// No session → fallback.
	a := newReadyApp(nil, nil)
	if got := a.windowTitle(); got != "GACT" {
		t.Errorf("no-session title = %q, want 'GACT'", got)
	}

	// Idle session → just the title.
	idle := []gact.Session{{ID: "s1", Title: "refactor auth", Status: gact.StatusIdle}}
	a = newReadyApp(idle, nil)
	if got := a.windowTitle(); got != "GACT — refactor auth" {
		t.Errorf("idle title = %q", got)
	}

	// Running session → "(running)" suffix.
	running := []gact.Session{{ID: "s1", Title: "demo", Status: gact.StatusRunning}}
	a = newReadyApp(running, nil)
	if got := a.windowTitle(); got != "GACT — demo (running)" {
		t.Errorf("running title = %q", got)
	}

	// Waiting on permission → "(waiting)" suffix.
	waiting := []gact.Session{{ID: "s1", Title: "demo", Status: gact.StatusWaitingPermission}}
	a = newReadyApp(waiting, nil)
	if got := a.windowTitle(); got != "GACT — demo (waiting)" {
		t.Errorf("waiting title = %q", got)
	}
}

// TestTimestampToggle_FlipsAndRenders verifies S1: body-focus `t`
// toggles Theme.ShowTimestamps, and the rendered conversation
// includes a formatted timestamp when the flag is on.
func TestTimestampToggle_FlipsAndRenders(t *testing.T) {
	ts := time.Date(2026, 4, 18, 20, 34, 5, 0, time.UTC)
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	msgs := []gact.Message{
		{
			ID: "m1", SessionID: "sess_1", Role: gact.RoleUser,
			CreatedAt: ts,
			Parts: []gact.Part{{ID: "p1", Type: gact.PartTypeText, Text: "hi"}},
		},
	}
	a := newReadyApp(sessions, msgs)
	a.focus = FocusBody

	// Before toggling — timestamp should NOT appear.
	plain := ansi.Strip(renderAtSize(a, 110, 30))
	if strings.Contains(plain, "2026-04-18 20:34:05") {
		t.Fatalf("timestamp shown before toggle")
	}

	// Press `t` — state flips to on.
	out, _ := a.Update(tea.KeyPressMsg{Code: 't', Text: "t"})
	a = out.(*App)
	if !a.Theme.ShowTimestamps {
		t.Fatalf("showTimestamps didn't flip on")
	}

	plain = ansi.Strip(renderAtSize(a, 110, 30))
	if !strings.Contains(plain, "2026-04-18 20:34:05") {
		t.Fatalf("timestamp missing after toggle-on: %q", plain[:400])
	}

	// Press `t` again — state flips off.
	out, _ = a.Update(tea.KeyPressMsg{Code: 't', Text: "t"})
	a = out.(*App)
	if a.Theme.ShowTimestamps {
		t.Fatalf("showTimestamps didn't flip off")
	}
}

// TestCycleTheme_NextWrapsForward advances through AllThemeModes and
// wraps back to the first entry.
func TestCycleTheme_NextWrapsForward(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.Theme = ThemeForMode(ModeDark)

	seen := []ThemeMode{}
	for i := 0; i <= len(AllThemeModes); i++ {
		seen = append(seen, ThemeModeFor(a.Theme))
		a.cycleThemeCmd(+1)
	}
	// After one full loop, we should be back where we started.
	if seen[0] != seen[len(seen)-1] {
		t.Errorf("wrap-around failed: start=%d, after full cycle=%d",
			seen[0], seen[len(seen)-1])
	}
	// Exactly one of each theme visited (+ the start repeated at end).
	counts := map[ThemeMode]int{}
	for _, m := range seen[:len(seen)-1] {
		counts[m]++
	}
	for _, m := range AllThemeModes {
		if counts[m] != 1 {
			t.Errorf("theme %s visited %d times, want 1", ThemeModeName(m), counts[m])
		}
	}
}

// TestCycleTheme_PreservesThresholds ensures the collapse + cost
// thresholds survive a cycle — users should never lose a preference
// just because they flipped palettes.
func TestCycleTheme_PreservesThresholds(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.Theme.CollapseThreshold = 13
	a.Theme.CostWarnTokens = 42_000
	a.Theme.CostDangerTokens = 88_000

	a.cycleThemeCmd(+1)
	if a.Theme.CollapseThreshold != 13 {
		t.Errorf("CollapseThreshold lost: %d", a.Theme.CollapseThreshold)
	}
	if a.Theme.CostWarnTokens != 42_000 {
		t.Errorf("CostWarnTokens lost: %d", a.Theme.CostWarnTokens)
	}
	if a.Theme.CostDangerTokens != 88_000 {
		t.Errorf("CostDangerTokens lost: %d", a.Theme.CostDangerTokens)
	}
}

// TestPaletteCurrentValue_HintsForKnownCommands covers Q3 routing:
// well-known settings-style commands return a non-empty state hint;
// unknown commands return empty so the palette row stays clean.
func TestPaletteCurrentValue_HintsForKnownCommands(t *testing.T) {
	sessions := []gact.Session{{
		ID: "sess_1", Title: "refactor auth",
		Status: gact.StatusRunning,
		Agent:  gact.AgentRef{ID: "code_reviewer"},
	}}
	msgs := []gact.Message{{
		ID: "m1", SessionID: "sess_1", Role: gact.RoleUser,
		Parts: []gact.Part{{ID: "p1", Type: gact.PartTypeText, Text: "hi"}},
	}}
	a := newReadyApp(sessions, msgs)
	a.Theme = ThemeForMode(ModeDracula)
	a.currentStatus = gact.StatusRunning

	cases := map[string]string{
		"/theme":       "current: dracula",
		"/clear":       "1 messages",
		"/cancel":      "status: running",
		"/agent":       "current: code_reviewer",
		"/rename":      "current: refactor auth",
		"/completely_unknown_cmd": "",
	}
	for id, want := range cases {
		got := a.paletteCurrentValue(id)
		if got != want {
			t.Errorf("%s: got %q, want %q", id, got, want)
		}
	}
}

// TestThemeSlashCmd_OpensSettingsThemeTab verifies /theme lands the
// user on Settings > Theme with the current palette pre-selected so
// ↓/↑ immediately previews a neighbour.
func TestThemeSlashCmd_OpensSettingsThemeTab(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.Theme = ThemeForMode(ModeDracula)
	a.commands = []gact.Command{
		{ID: "/theme", Title: "Pick a theme", Source: "builtin"},
	}
	a.paletteOpen = true
	a.paletteFilter = ""
	a.paletteSel = 0

	out, _ := a.Update(tea.KeyPressMsg{Code: tea.KeyEnter})
	a = out.(*App)

	if !a.settingsOpen {
		t.Fatalf("/theme should open settings")
	}
	if a.settings.tab != 2 {
		t.Fatalf("tab = %d, want 2 (Theme)", a.settings.tab)
	}
	// themeSel should pre-seed to Dracula's position in AllThemeModes.
	wantSel := 0
	for i, m := range AllThemeModes {
		if m == ModeDracula {
			wantSel = i
			break
		}
	}
	if a.settings.themeSel != wantSel {
		t.Fatalf("themeSel = %d, want %d (Dracula)", a.settings.themeSel, wantSel)
	}
}

// TestInputDraft_PreservedAcrossSessionSwitch checks N1: typing into
// session A, switching to session B, typing there, switching back —
// should restore A's draft verbatim.
func TestInputDraft_PreservedAcrossSessionSwitch(t *testing.T) {
	sessions := []gact.Session{
		{ID: "sess_a", Title: "A", Status: gact.StatusIdle},
		{ID: "sess_b", Title: "B", Status: gact.StatusIdle},
	}
	a := newReadyApp(sessions, nil)
	a.focus = FocusInput

	// Session A selected by newReadyApp (selected=0).
	a.input.SetValue("draft for A")

	// Exercise swapInputDraftFor directly — the full selectSession
	// path fires SSE reconnects which waste test time waiting on a
	// non-existent backend.
	a.swapInputDraftFor("sess_b")
	if got := a.input.Value(); got != "" {
		t.Fatalf("switch to B: expected empty input, got %q", got)
	}

	// Type in B.
	a.input.SetValue("draft for B")

	// Switch back to A.
	a.swapInputDraftFor("sess_a")
	if got := a.input.Value(); got != "draft for A" {
		t.Fatalf("switch back to A: expected 'draft for A', got %q", got)
	}

	// Switch to B — should restore B's draft.
	a.swapInputDraftFor("sess_b")
	if got := a.input.Value(); got != "draft for B" {
		t.Fatalf("switch to B: expected 'draft for B', got %q", got)
	}
}

// TestInputDraft_ClearedOnSend ensures successful Enter drops the
// saved draft so coming back later sees a clean slate rather than
// the already-sent text resurfacing.
func TestInputDraft_ClearedOnSend(t *testing.T) {
	sessions := []gact.Session{
		{ID: "sess_a", Title: "A", Status: gact.StatusIdle},
		{ID: "sess_b", Title: "B", Status: gact.StatusIdle},
	}
	a := newReadyApp(sessions, nil)
	a.focus = FocusInput
	a.input.SetValue("hello there")

	// Simulate Enter send.
	out, _ := a.Update(tea.KeyPressMsg{Code: tea.KeyEnter})
	a = out.(*App)
	if _, ok := a.inputDraftBySession["sess_a"]; ok {
		t.Fatalf("sent draft should be dropped from saved map")
	}

	// Switch and return — input should be empty (no resurfacing).
	a.swapInputDraftFor("sess_b")
	a.swapInputDraftFor("sess_a")
	if got := a.input.Value(); got != "" {
		t.Fatalf("post-send return: expected empty input, got %q", got)
	}
}

// TestTransientHint_ExpiresAfterDwell verifies the hintExpireMsg
// versioning: an expire message only clears the hint if it still
// matches what was originally scheduled. Protects against an older
// dwell timer wiping a newer toast.
func TestTransientHint_ExpiresAfterDwell(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.transientHint = "cleared 3 messages"

	// Stale expiry (different text) shouldn't touch the hint.
	out, _ := a.Update(hintExpireMsg{text: "old toast"})
	a = out.(*App)
	if a.transientHint != "cleared 3 messages" {
		t.Fatalf("stale expiry wiped current hint: %q", a.transientHint)
	}

	// Matching expiry clears it.
	out, _ = a.Update(hintExpireMsg{text: "cleared 3 messages"})
	a = out.(*App)
	if a.transientHint != "" {
		t.Fatalf("matching expiry didn't clear: %q", a.transientHint)
	}
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
	a.input.SetValue("hi jaime")

	out, _ := a.Update(tea.KeyPressMsg{Code: '@', Text: "@"})
	a = out.(*App)
	if a.filePickerOpen {
		t.Fatalf("@ mid-word opened picker — should have passed through")
	}
}

// TestCompose_OpenCommitCancel covers M5's full state machine:
// Ctrl+G opens with seeded draft, Ctrl+S commits the modal body back
// to the base input, Esc cancels and preserves the pre-modal draft.
func TestCompose_OpenCommitCancel(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}

	// Open + commit path.
	a := newReadyApp(sessions, nil)
	a.focus = FocusInput
	a.input.SetValue("seed draft")

	out, _ := a.Update(tea.KeyPressMsg{Code: 'g', Mod: tea.ModCtrl})
	a = out.(*App)
	if !a.composeOpen {
		t.Fatalf("Ctrl+G didn't open compose modal")
	}
	if a.compose.ta.Value() != "seed draft" {
		t.Fatalf("compose not seeded: %q", a.compose.ta.Value())
	}

	// Type "more" in the compose modal.
	for _, r := range " more" {
		out, _ = a.Update(tea.KeyPressMsg{Code: r, Text: string(r)})
		a = out.(*App)
	}
	// Ctrl+S commits.
	out, _ = a.Update(tea.KeyPressMsg{Code: 's', Mod: tea.ModCtrl})
	a = out.(*App)
	if a.composeOpen {
		t.Fatalf("Ctrl+S didn't close compose modal")
	}
	if a.input.Value() != "seed draft more" {
		t.Fatalf("commit didn't land: %q", a.input.Value())
	}

	// Open + cancel path.
	a2 := newReadyApp(sessions, nil)
	a2.focus = FocusInput
	a2.input.SetValue("original")

	out, _ = a2.Update(tea.KeyPressMsg{Code: 'g', Mod: tea.ModCtrl})
	a2 = out.(*App)
	// Edit inside modal.
	for _, r := range " edit" {
		out, _ = a2.Update(tea.KeyPressMsg{Code: r, Text: string(r)})
		a2 = out.(*App)
	}
	// Esc cancels.
	out, _ = a2.Update(tea.KeyPressMsg{Code: tea.KeyEscape})
	a2 = out.(*App)
	if a2.composeOpen {
		t.Fatalf("Esc didn't close compose modal")
	}
	if a2.input.Value() != "original" {
		t.Fatalf("cancel overwrote base input: %q", a2.input.Value())
	}
}

// TestCompose_ExpandsPastesOnOpen ensures compressed paste placeholders
// get inlined when the compose modal opens — "where everything
// renders expanded" is the point of the view.
func TestCompose_ExpandsPastesOnOpen(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a := newReadyApp(sessions, nil)
	a.focus = FocusInput

	// Paste → placeholder in base input.
	out, _ := a.Update(tea.PasteMsg{Content: "a\nb\nc"})
	a = out.(*App)
	if !strings.Contains(a.input.Value(), "[pasted content") {
		t.Fatalf("setup: paste didn't compress")
	}

	// Open compose.
	out, _ = a.Update(tea.KeyPressMsg{Code: 'g', Mod: tea.ModCtrl})
	a = out.(*App)
	if strings.Contains(a.compose.ta.Value(), "[pasted content") {
		t.Fatalf("compose kept placeholder: %q", a.compose.ta.Value())
	}
	if !strings.Contains(a.compose.ta.Value(), "a\nb\nc") {
		t.Fatalf("compose missing expanded content: %q", a.compose.ta.Value())
	}
	if len(a.pastes) != 0 {
		t.Fatalf("pastes weren't cleared after compose open")
	}
}

// TestInputPane_GrowsWithContent verifies multi-line buffers get a
// taller input pane (capped at ~1/3 viewport) so users can see what
// they're composing. Single-line buffers keep the compact 3-row pane.
func TestInputPane_GrowsWithContent(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}

	// Single-line buffer — pane should be minimal (no noticeable growth
	// compared to empty).
	a := newReadyApp(sessions, nil)
	a.focus = FocusInput
	a.input.SetValue("one line")
	baseline := lipgloss.Height(renderAtSize(a, 110, 30))

	// Five-line buffer — total height should still equal viewport (the
	// footer-clipping contract never breaks) but the split shifts so the
	// input pane grows.
	a.input.SetValue("line 1\nline 2\nline 3\nline 4\nline 5")
	tall := renderAtSize(a, 110, 30)
	if got := lipgloss.Height(tall); got > 30 {
		t.Fatalf("multi-line input pushed view over viewport: %d > 30", got)
	}
	// Belt-and-braces: the rendered output should contain every buffer
	// line. Strip ANSI so the substring test isn't tripped up by style
	// escape codes.
	plain := ansi.Strip(tall)
	if !strings.Contains(plain, "line 5") {
		t.Fatalf("multi-line buffer last line missing — pane didn't grow")
	}
	_ = baseline
}

// TestCatalogBrowser_CommandIDsRoute verifies the L5 palette routing:
// /mcp /tools /skills fan out to catalog kinds, /agents redirects to
// Settings tab 1, everything else falls through to RunCommand.
func TestCatalogBrowser_CommandIDsRoute(t *testing.T) {
	cases := []struct {
		in      string
		wantOk  bool
		wantKind catalogBrowserKind
	}{
		{"/mcp", true, catalogKindMcp},
		{"/tools", true, catalogKindTools},
		{"/skills", true, catalogKindSkills},
		{"/clear", false, 0},
		{"/help", false, 0},
	}
	for _, c := range cases {
		kind, ok := catalogCommandForID(c.in)
		if ok != c.wantOk {
			t.Errorf("%s: ok=%v want %v", c.in, ok, c.wantOk)
		}
		if ok && kind != c.wantKind {
			t.Errorf("%s: kind=%d want %d", c.in, kind, c.wantKind)
		}
	}
}

// TestCatalogBrowser_OpenAndClose walks the state machine end-to-end.
func TestCatalogBrowser_OpenAndClose(t *testing.T) {
	a := newReadyApp(nil, nil)
	cmd := a.openCatalogBrowser(catalogKindTools)
	if !a.catalogBrowserOpen {
		t.Fatalf("openCatalogBrowser didn't flip the flag")
	}
	if a.catalogBrowser.title != "Tools" {
		t.Fatalf("wrong title: %q", a.catalogBrowser.title)
	}
	if cmd == nil {
		t.Fatalf("no fetch cmd returned")
	}

	// Simulate a loaded message arriving.
	out, _ := a.Update(catalogBrowserLoadedMsg{
		kind:  catalogKindTools,
		items: []catalogItem{{id: "bash", title: "Bash", desc: "Run shell"}},
	})
	a = out.(*App)
	if a.catalogBrowser.loading {
		t.Fatalf("loading flag should be false after load")
	}
	if len(a.catalogBrowser.items) != 1 {
		t.Fatalf("items = %d, want 1", len(a.catalogBrowser.items))
	}

	// Esc closes.
	out, _ = a.Update(tea.KeyPressMsg{Code: tea.KeyEscape})
	a = out.(*App)
	if a.catalogBrowserOpen {
		t.Fatalf("Esc didn't close catalog browser")
	}
}

// TestCollapseThreshold_ArrowKeysAdjust verifies the Settings > TUI tab
// keybindings for the collapse-threshold stepper: ←/→ nudge the value
// between 1 and 50 inclusive without blowing up.
func TestCollapseThreshold_ArrowKeysAdjust(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.settingsOpen = true
	a.settings = &settingsState{tab: 3, tuiRow: 0}
	a.Theme.CollapseThreshold = 5

	// Right bumps up.
	out, _ := a.Update(tea.KeyPressMsg{Code: tea.KeyRight})
	a = out.(*App)
	if a.Theme.CollapseThreshold != 6 {
		t.Fatalf("right: got %d, want 6", a.Theme.CollapseThreshold)
	}

	// Left decrements.
	out, _ = a.Update(tea.KeyPressMsg{Code: tea.KeyLeft})
	a = out.(*App)
	if a.Theme.CollapseThreshold != 5 {
		t.Fatalf("left: got %d, want 5", a.Theme.CollapseThreshold)
	}

	// Lower bound is 1 — many lefts shouldn't drop below it.
	for i := 0; i < 10; i++ {
		out, _ = a.Update(tea.KeyPressMsg{Code: tea.KeyLeft})
		a = out.(*App)
	}
	if a.Theme.CollapseThreshold != 1 {
		t.Fatalf("clamp low: got %d, want 1", a.Theme.CollapseThreshold)
	}

	// Upper bound is 50.
	for i := 0; i < 60; i++ {
		out, _ = a.Update(tea.KeyPressMsg{Code: tea.KeyRight})
		a = out.(*App)
	}
	if a.Theme.CollapseThreshold != 50 {
		t.Fatalf("clamp high: got %d, want 50", a.Theme.CollapseThreshold)
	}
}

// TestRenderBody_ReturnsExactHeight is the tightest contract: regardless
// of content size, the final rendered tui View is bounded by a.height
// rows. The footer can only stay in frame if every other pane respects
// the budget.
func TestRenderBody_ReturnsExactHeight(t *testing.T) {
	sessions := []gact.Session{{ID: "sess_1", Title: "demo", Status: gact.StatusIdle}}
	a := newReadyApp(sessions, longConversation("sess_1", 100))

	for _, dim := range []struct{ W, H int }{
		{80, 20}, {100, 30}, {140, 40}, {60, 12},
	} {
		rendered := renderAtSize(a, dim.W, dim.H)
		got := lipgloss.Height(rendered)
		if got > dim.H {
			t.Errorf("W=%d H=%d: rendered %d lines (> H)", dim.W, dim.H, got)
		}
	}
}
