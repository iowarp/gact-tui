package ui

import (
	"testing"
	"time"

	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// TestSSEBackoff_ScheduleBoundsPerAttempt walks the attempts counter
// and verifies nextReconnectDelay stays within the expected ±25%
// jitter band for every step, including the cap.
//
// The target for attempt N is baseReconnectDelay * 2^N, clamped to
// maxReconnectDelay. Jitter is ±25%, so we accept [0.75*target,
// 1.25*target]. Delays never drop below baseReconnectDelay even at
// the low-jitter end.
func TestSSEBackoff_ScheduleBoundsPerAttempt(t *testing.T) {
	a := &App{}
	cases := []struct {
		attempts int
		target   time.Duration
	}{
		{0, 250 * time.Millisecond},
		{1, 500 * time.Millisecond},
		{2, 1 * time.Second},
		{3, 2 * time.Second},
		{4, 4 * time.Second},
		{5, 8 * time.Second},
		{6, 16 * time.Second},
		{7, maxReconnectDelay}, // 32s → capped at 30s
		{8, maxReconnectDelay},
		{20, maxReconnectDelay},
	}
	for _, tc := range cases {
		a.sseBackoffAttempts = tc.attempts
		// Sample 50 times per attempt so we detect a jitter range that
		// drifts outside bounds even intermittently.
		for i := 0; i < 50; i++ {
			got := a.nextReconnectDelay()
			lower := time.Duration(float64(tc.target) * 0.75)
			if lower < baseReconnectDelay {
				lower = baseReconnectDelay
			}
			upper := time.Duration(float64(tc.target) * 1.25)
			if got < lower || got > upper {
				t.Errorf("attempts=%d sample=%d: got %v, want in [%v, %v]",
					tc.attempts, i, got, lower, upper)
			}
		}
	}
}

// TestSSEBackoff_NegativeAttemptsIsSafe defends against bookkeeping
// bugs that could underflow the counter.
func TestSSEBackoff_NegativeAttemptsIsSafe(t *testing.T) {
	a := &App{sseBackoffAttempts: -5}
	got := a.nextReconnectDelay()
	if got < baseReconnectDelay || got > time.Duration(float64(baseReconnectDelay)*1.25) {
		t.Errorf("negative-attempts delay = %v, want ~baseReconnectDelay", got)
	}
}

// TestSSEBackoff_ResetOnEventArrival wires the end-to-end behaviour
// the protocol cares about: attempts climb while reconnects fail,
// then an incoming event pins them back to 0.
func TestSSEBackoff_ResetOnEventArrival(t *testing.T) {
	a := &App{}
	a.sseBackoffAttempts = 5

	// Synthesise an arriving event and route through Update.
	_, _ = a.Update(sseEventMsg{Event: client.SSEEvent{Type: "noop"}})
	if a.sseBackoffAttempts != 0 {
		t.Errorf("attempts after event = %d, want 0", a.sseBackoffAttempts)
	}
}
