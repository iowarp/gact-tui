package ui

import (
	"strings"
	"testing"

	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

func TestLocalizerLoadsEnglishCatalog(t *testing.T) {
	l := newLocalizer("en")
	got := l.t(msgPostFailureAgentStarting, nil)
	want := "message not sent — CLIO agent is still starting; press Enter to retry"
	if got != want {
		t.Fatalf("localized string = %q, want %q", got, want)
	}
}

func TestLocalizerFallsBackToEnglishForUnknownLocale(t *testing.T) {
	l := newLocalizer("zz-ZZ")
	got := l.t(msgPostFailureAgentNotConfigured, nil)
	want := "message not sent — no CLIO agent is configured; configure or start an agent first"
	if got != want {
		t.Fatalf("fallback string = %q, want %q", got, want)
	}
}

func TestLocalizerInterpolatesNamedValues(t *testing.T) {
	l := newLocalizer("en")
	got := l.t(msgPostFailureRetryWithError, map[string]string{"error": "dial tcp: refused"})
	want := "message not sent — press Enter to retry · dial tcp: refused"
	if got != want {
		t.Fatalf("interpolated string = %q, want %q", got, want)
	}
}

func TestLocalizerLoadsJapaneseCatalog(t *testing.T) {
	l := newLocalizer("ja-JP")
	got := l.t(msgPostFailureAgentStarting, nil)
	if !strings.Contains(got, "起動中") {
		t.Fatalf("localized string = %q, want Japanese startup text", got)
	}
	if strings.Contains(got, "message not sent") {
		t.Fatalf("localized string fell back to English: %q", got)
	}
}

func TestPostFailedJapaneseHintRendersUnicodeText(t *testing.T) {
	a := New("http://unused")
	a.localizer = newLocalizer("ja")

	model, _ := a.Update(postFailedMsg{
		text: "hi",
		err: &client.Error{
			Status:  503,
			Code:    "agent_not_available",
			Message: "not ready",
			Details: map[string]any{"agent_status": "starting"},
		},
	})
	a = model.(*App)

	plain := ansi.Strip(a.transientHint)
	if !strings.Contains(plain, "起動中") {
		t.Fatalf("hint = %q, want Japanese startup text", plain)
	}
	if strings.Contains(plain, "message not sent") {
		t.Fatalf("hint fell back to English: %q", plain)
	}
}
