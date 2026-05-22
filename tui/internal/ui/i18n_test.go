package ui

import "testing"

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
