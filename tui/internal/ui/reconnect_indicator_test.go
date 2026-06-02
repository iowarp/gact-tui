package ui

import (
	"strings"
	"testing"
	"time"

	tea "charm.land/bubbletea/v2"
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
	a.sseBackoffAttempts = 3
	a.sseDownSince = time.Now().Add(-2 * time.Second) // outage past gate

	got := a.renderFooter()
	if !strings.Contains(got, "reconnecting") {
		t.Errorf("mid-backoff past gate should show 'reconnecting' hint: %q", got)
	}
}

func TestReconnectIndicator_VisibleBadgeIsClickable(t *testing.T) {
	a := New("http://unused")
	a.stage = StageReady
	a.width, a.height = 120, 30
	a.sseBackoffAttempts = 3
	a.sseDownSince = time.Now().Add(-2 * time.Second)

	_ = a.View()
	target, ok := findHitTargetForTest(a, "footer:reconnect")
	if !ok {
		t.Fatal("missing semantic reconnect footer target")
	}
	model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
		X:      target.rect.x,
		Y:      target.rect.y,
		Button: tea.MouseLeft,
	}))
	a = model.(*App)

	if cmd == nil {
		t.Fatal("clicking reconnect badge should dispatch connect command")
	}
}

// DDDDD1: sub-second SSE blip must not surface the badge — that
// caused the flicker the user reported. With sseDownSince set to
// "just now", the renderer has to suppress the badge entirely
// even though sseBackoffAttempts > 0.
func TestReconnectIndicator_HiddenDuringSubSecondBlip(t *testing.T) {
	a := New("http://unused")
	a.stage = StageReady
	a.width, a.height = 120, 30
	a.sseBackoffAttempts = 1
	a.sseDownSince = time.Now() // outage just started

	got := a.renderFooter()
	if strings.Contains(got, "reconnecting") {
		t.Errorf("sub-gate outage should NOT show 'reconnecting' (flicker source): %q", got)
	}
}

// And the same model state, but with sseDownSince zeroed (i.e. the
// renderer was somehow called with attempts > 0 but no outage clock).
// Defensive: don't show the badge with a zero clock — better silent
// than a permanent stuck "reconnecting…" left over from a bug.
func TestReconnectIndicator_HiddenWhenDownSinceZero(t *testing.T) {
	a := New("http://unused")
	a.stage = StageReady
	a.width, a.height = 120, 30
	a.sseBackoffAttempts = 5
	a.sseDownSince = time.Time{} // zero = no recorded outage

	got := a.renderFooter()
	if strings.Contains(got, "reconnecting") {
		t.Errorf("zero down-clock should suppress badge: %q", got)
	}
}
