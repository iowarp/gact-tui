package ui

// appFeedbackState: transient operator toasts (transientHint) and the localizer.

import (
	"fmt"
	"math/rand"
	"time"

	tea "charm.land/bubbletea/v2"
)

// SSE reconnect backoff constants. baseReconnectDelay is the first
// retry's target; each subsequent attempt doubles (250 ms, 500 ms, 1 s,
// 2 s, 4 s, 8 s, 16 s, 30 s...). maxReconnectDelay caps the ceiling so a
// user coming back to a long-idle TUI gets a reconnect within half a
// minute, not 20.
const (
	baseReconnectDelay = 250 * time.Millisecond
	maxReconnectDelay  = 30 * time.Second
	// DDDDD1: don't surface "(reconnecting...)" until the SSE outage
	// has lasted at least this long. Eliminates the single-frame
	// footer flicker on routine sub-second reconnect blips while
	// keeping real outages visible within a second.
	sseBadgeMinDelay = 800 * time.Millisecond
	// Min dwell before a transient hint is eligible for
	// keystroke-clear. Prevents the "hint set by background event
	// between two keystrokes disappears on the user's next key"
	// flicker. Same 800ms floor as the reconnect badge so the two
	// toast paths use the same "sub-second = not worth flashing" rule.
	transientHintMinDwell = 800 * time.Millisecond
)

// retryConnectMsg fires after the connect-retry backoff elapses and
// triggers another connectCmd if the TUI is still in StageError.
type retryConnectMsg struct{}

// hintExpireMsg fires after the transient-hint dwell delay to auto-
// clear stale toasts. Without this, a hint set by e.g. /clear could
// linger until the next user action. Carries the exact text it was
// scheduled for so a newer hint doesn't get wiped by the old tick.
type hintExpireMsg struct {
	text string
}

type errMsg struct {
	err   error
	stage string
}

// scheduleHintExpire returns a Cmd that fires a hintExpireMsg after
// hintDwell. Callers that set a.transientHint should tea.Batch this
// in so the toast fades out even if the user doesn't touch anything.
func scheduleHintExpire(text string) tea.Cmd {
	return scheduleTick(hintDwell, func() tea.Msg {
		return hintExpireMsg{text: text}
	})
}

func (c *chromeComponent) handleErr(m errMsg) (tea.Model, tea.Cmd) {
	a := c.app
	// Search failures shouldn't blow away the whole UI - clear the
	// in-flight flag and surface a single empty result so the user
	// can adjust the query without losing their session view.
	if m.stage == "search" {
		a.cmdPalette.searching = false
		a.cmdPalette.searchMatches = nil
		return a, nil
	}
	// Memory stats are decorative; a failure
	// just hides the chip until the next refresh.
	if m.stage == "memory_stats" {
		return a, nil
	}
	if m.stage == "command" {
		a.setHint("command failed: " + operatorErrorMessage(m.err))
		return a, scheduleHintExpire(a.transientHint)
	}
	if m.stage == "duplicate-session" {
		a.setHint("duplicate failed: " + operatorErrorMessage(m.err))
		return a, scheduleHintExpire(a.transientHint)
	}
	if m.stage == "create-session" {
		a.setHint("session create failed: " + operatorErrorMessage(m.err))
		return a, scheduleHintExpire(a.transientHint)
	}
	if m.stage == "cancel-session" {
		a.setHint("cancel failed: " + operatorErrorMessage(m.err))
		return a, scheduleHintExpire(a.transientHint)
	}
	// Issue #227: SSE stream failures — open ("sse") or mid-stream
	// ("sse-read") — are as transient as a clean remote close, so they
	// must NOT dead-end in the fatal StageError modal. Route them into
	// the exact backoff-reconnect path sseClosedMsg takes, and surface
	// the reason as a toast (the footer's "(reconnecting…)" badge keeps
	// showing while the backoff runs) so the user still sees why.
	if m.stage == "sse" || m.stage == "sse-read" {
		writeTUIAuditReceived("tui.sse_reconnect", map[string]any{
			"reason": "sse_stream_error",
			"stage":  m.stage,
			"error":  operatorErrorMessage(m.err),
		})
		a.setHint("stream error: " + operatorErrorMessage(m.err))
		_, reconnect := a.connection.handleSSEClosed(sseClosedMsg{})
		return a, tea.Batch(reconnect, scheduleHintExpire(a.transientHint))
	}
	a.stage = StageError
	a.stageError = fmt.Sprintf("%s: %v", m.stage, m.err)
	// Connect-stage failures are usually transient (backend booting,
	// network blip). Auto-retry on the same exponential backoff
	// schedule the SSE reconnect uses - same UX shape, same code
	// path. Other stages (selectSession, post-message, etc.) come
	// from user actions and shouldn't loop in the background.
	if isConnectStage(m.stage) {
		delay := a.connection.nextConnectRetryDelay()
		a.connection.connectRetryAttempts++
		return a, scheduleTick(delay, func() tea.Msg {
			return retryConnectMsg{}
		})
	}
	return a, nil
}

func (c *chromeComponent) handleHintExpire(m hintExpireMsg) (tea.Model, tea.Cmd) {
	a := c.app
	// Only clear if the hint is still the one we scheduled - a
	// newer toast set mid-dwell shouldn't be wiped by the older
	// tick. Equivalent to versioning the hint without carrying a
	// separate counter.
	if a.transientHint == m.text {
		a.setHint("")
	}
	return a, nil
}

func (c *connectionComponent) handleRetryConnect(m retryConnectMsg) (tea.Model, tea.Cmd) {
	// Only retry while we're still in StageError - the user might
	// have already manually reconnected via Ctrl+R or the backend
	// might be healthy now via some other path.
	if c.app.stage != StageError {
		return c.app, nil
	}
	c.app.stage = StageConnecting
	return c.app, c.connectCmd()
}

// hintDwell is how long a transient hint stays on screen before
// auto-clearing. Long enough for the user to read a short toast,
// short enough that they don't feel stuck with stale status.
const hintDwell = 4 * time.Second

func (c *chromeComponent) clearTransientHintForKey(key string) {
	a := c.app
	if key == "ctrl+l" || a.transientHint == "" {
		return
	}
	if a.transientHintAt.IsZero() ||
		time.Since(a.transientHintAt) >= transientHintMinDwell {
		a.setHint("")
		a.transientHintAt = time.Time{}
	}
}

// isConnectStage reports whether the errMsg.stage value came from
// connectCmd. The connect path emits exactly three stages - bumping
// this list when a new stage is added is intentional friction so
// retry doesn't accidentally fire for unrelated user actions.
func isConnectStage(stage string) bool {
	switch stage {
	case "capabilities", "workspaces", "sessions":
		return true
	}
	return false
}

// nextConnectRetryDelay reuses the SSE backoff schedule but reads
// from connectRetryAttempts. Same shape, same constants - this keeps
// the user-visible reconnect rhythm consistent across both paths.
func (c *connectionComponent) nextConnectRetryDelay() time.Duration {
	saved := c.sseBackoffAttempts
	c.sseBackoffAttempts = c.connectRetryAttempts
	d := c.nextReconnectDelay()
	c.sseBackoffAttempts = saved
	return d
}

// nextReconnectDelay computes the wait before the next SSE reconnect
// attempt. Pure function of c.sseBackoffAttempts so tests can walk
// the schedule directly. Adds +/-25% jitter so multiple TUI instances
// reconnecting after the same backend restart don't thunder in lockstep.
func (c *connectionComponent) nextReconnectDelay() time.Duration {
	n := c.sseBackoffAttempts
	if n < 0 {
		n = 0
	}
	// Cap the shift so we don't overflow on pathologically large n.
	if n > 20 {
		n = 20
	}
	d := baseReconnectDelay * (1 << n)
	if d > maxReconnectDelay {
		d = maxReconnectDelay
	}
	// +/-25% jitter. rand.Int63n is fine here - not a security context.
	jitter := time.Duration(rand.Int63n(int64(d/2))) - d/4
	result := d + jitter
	if result < baseReconnectDelay {
		result = baseReconnectDelay
	}
	return result
}

// appFeedbackState groups transient operator feedback and localization helpers.
type appFeedbackState struct {
	transientHintAt time.Time
	transientHint   string
	localizer       Localizer
}

// setHint records a transient operator toast. The "first seen" stamp
// (transientHintAt) that drives the keystroke-clear dwell is
// applied centrally in App.Update's deferred closure, which compares the
// hint before and after the cycle — so this setter is a pure field write
// and intentionally does NOT stamp transientHintAt itself. Routing every
// write through here keeps the seam in one place without changing the
// stamping semantics.
func (a *App) setHint(msg string) {
	a.transientHint = msg
}
