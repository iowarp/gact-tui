package ui

import (
	"strings"
	"testing"
)

func TestReconnectIndicator_HiddenWhenHealthy(t *testing.T) {
	a := New("http://unused")
	a.stage = StageReady
	a.width, a.height = 120, 30
	a.sseBackoffAttempts = 0

	got := a.renderFooter()
	if strings.Contains(got, "reconnecting") {
		t.Errorf("healthy SSE should not show 'reconnecting': %q", got)
	}
}

func TestReconnectIndicator_VisibleDuringBackoff(t *testing.T) {
	a := New("http://unused")
	a.stage = StageReady
	a.width, a.height = 120, 30
	a.sseBackoffAttempts = 3 // mid-backoff

	got := a.renderFooter()
	if !strings.Contains(got, "reconnecting") {
		t.Errorf("mid-backoff should show 'reconnecting' hint: %q", got)
	}
}
