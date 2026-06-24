package ui

import (
	"errors"
	"strconv"
	"strings"
	"sync"
	"testing"
)

// withClipboardSpy swaps the package-level clipboardWrite for a
// capturing stub and restores it when the test ends. Returns a getter
// for the last-written value and the error the stub will return next.
func withClipboardSpy(t *testing.T) (*sync.Mutex, *string, *error) {
	t.Helper()
	var (
		mu  sync.Mutex
		got string
		err error
	)
	prev := clipboardWrite
	prevOSC52 := osc52Write
	prevLookPath := clipboardLookPath
	prevRunCommand := clipboardRunCommand
	prevAtotto := clipboardAtottoWrite
	prevForcedFailure := clipboardForcedFailure
	prevPreferred := clipboardPreferredCommand
	clipboardWrite = func(s string) error {
		mu.Lock()
		defer mu.Unlock()
		got = s
		return err
	}
	osc52Write = func(string) error {
		return errors.New("terminal clipboard unavailable")
	}
	t.Cleanup(func() {
		clipboardWrite = prev
		osc52Write = prevOSC52
		clipboardLookPath = prevLookPath
		clipboardRunCommand = prevRunCommand
		clipboardAtottoWrite = prevAtotto
		clipboardForcedFailure = prevForcedFailure
		clipboardPreferredCommand = prevPreferred
	})
	return &mu, &got, &err
}

func TestCopyTextToClipboardFallsBackToOSC52(t *testing.T) {
	mu, _, errSlot := withClipboardSpy(t)
	mu.Lock()
	*errSlot = errors.New("no clipboard utilities available")
	mu.Unlock()
	var oscPayload string
	osc52Write = func(s string) error {
		oscPayload = s
		return nil
	}

	hint := copyTextToClipboard("detail", "payload")
	if !strings.Contains(hint, "OSC52") || !strings.Contains(hint, "native clipboard unavailable") {
		t.Fatalf("fallback hint = %q, want truthful OSC52 fallback", hint)
	}
	if oscPayload != "payload" {
		t.Fatalf("osc52 payload = %q, want payload", oscPayload)
	}
}

func TestCopyTextToClipboardFinalFailureMentionsDiagRows(t *testing.T) {
	mu, _, errSlot := withClipboardSpy(t)
	mu.Lock()
	*errSlot = errors.New("no native clipboard utilities available")
	mu.Unlock()
	osc52Write = func(string) error {
		return errors.New("terminal rejected OSC52")
	}

	hint := copyTextToClipboard("detail", "payload")
	for _, want := range []string{
		"copy failed",
		"gact diag",
		"clipboard_native",
		"clipboard_missing",
		"clipboard_osc52",
	} {
		if !strings.Contains(hint, want) {
			t.Fatalf("failure hint missing %q:\n%s", want, hint)
		}
	}
	for _, unwanted := range []string{"no native clipboard utilities available", "terminal rejected OSC52"} {
		if strings.Contains(hint, unwanted) {
			t.Fatalf("failure hint should stay footer-readable and omit raw backend error %q:\n%s", unwanted, hint)
		}
	}
}

func TestCopyTextToClipboardForcedFailureIsDiagnosticOnly(t *testing.T) {
	mu, got, _ := withClipboardSpy(t)
	clipboardForcedFailure = func() bool { return true }

	hint := copyTextToClipboard("detail", "payload")

	mu.Lock()
	wrote := *got
	mu.Unlock()
	if wrote != "" {
		t.Fatalf("forced failure should not touch clipboard backend, wrote %q", wrote)
	}
	for _, want := range []string{
		"copy failed",
		"gact diag",
		"clipboard_native",
		"clipboard_missing",
		"clipboard_osc52",
	} {
		if !strings.Contains(hint, want) {
			t.Fatalf("forced failure hint missing %q:\n%s", want, hint)
		}
	}
	if strings.Contains(hint, "GACT_CLIPBOARD_FORCE_FAILURE") {
		t.Fatalf("forced failure hint should not leak test-only env details:\n%s", hint)
	}
}

func TestCopyTextToClipboardPreservesTextAndSurfacesFailures(t *testing.T) {
	mu, got, errSlot := withClipboardSpy(t)

	if hint := copyTextToClipboard("compose draft", "   \n\t"); hint != "nothing to copy" {
		t.Fatalf("empty hint = %q, want nothing to copy", hint)
	}
	mu.Lock()
	if *got != "" {
		t.Fatalf("clipboard should not be touched for empty text, got %q", *got)
	}
	*errSlot = errors.New("clipboard daemon unavailable")
	mu.Unlock()

	if hint := copyTextToClipboard("compose draft", "draft body"); !strings.Contains(hint, "copy failed") || !strings.Contains(hint, "gact diag") {
		t.Fatalf("failure hint = %q, want surfaced clipboard error", hint)
	}

	mu.Lock()
	*errSlot = nil
	mu.Unlock()
	want := "  keep exact spacing\nand newlines  "
	if hint := copyTextToClipboard("detail", want); hint != "copied detail to clipboard" {
		t.Fatalf("success hint = %q, want copied detail to clipboard", hint)
	}
	mu.Lock()
	defer mu.Unlock()
	if *got != want {
		t.Fatalf("clipboard = %q, want exact payload %q", *got, want)
	}
}

func TestCopyExactTextToClipboardUsesCustomHints(t *testing.T) {
	mu, got, _ := withClipboardSpy(t)

	if hint := copyExactTextToClipboard("", "empty transcript", nil); hint != "empty transcript" {
		t.Fatalf("empty hint = %q, want custom empty hint", hint)
	}
	if hint := copyExactTextToClipboard("abcd", "", func(chars int) string {
		return "copied chars: " + strconv.Itoa(chars)
	}); hint != "copied chars: 4" {
		t.Fatalf("success hint = %q, want custom character count", hint)
	}

	mu.Lock()
	defer mu.Unlock()
	if *got != "abcd" {
		t.Fatalf("clipboard = %q, want abcd", *got)
	}
}
