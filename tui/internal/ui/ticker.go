package ui

// tickerComponent: the animation/spinner tick scheduler.

import (
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/tui/internal/intro"
)

// scheduleTick is the single home for one-shot timer scheduling in the TUI.
// Every tea.Tick call routes through here so there is exactly one place that
// turns a delay into a self-contained Cmd. mk builds the message at fire time,
// which lets callers compute the payload lazily (e.g. fetch results) instead of
// capturing it eagerly. The owner's "3 timers instead of 1" complaint is
// answered by this funnel: ticks exist once, in a shared home.
func scheduleTick(d time.Duration, mk func() tea.Msg) tea.Cmd {
	return tea.Tick(d, func(time.Time) tea.Msg { return mk() })
}

// tickerComponent owns the two animation tick loops that App used to drive
// directly: the splash-screen frame advance (intro) and the running-session
// spinner. Both loops are self-rescheduling — the handlers re-arm via
// scheduleTick only while their animation is still visible, so an idle TUI
// burns no frames. The frame counters (spinnerFrame, introFrameIdx) stay on
// App because the render paths and tests read them directly; the ticker reads
// and advances them through its app back-reference.
type tickerComponent struct {
	app *App
}

// spinnerChar returns the current spinner frame's glyph.
func (t *tickerComponent) spinnerChar() string {
	if len(spinnerFrames) == 0 {
		return "●"
	}
	return spinnerFrames[t.app.spinnerFrame%len(spinnerFrames)]
}

// handleSpinnerTick advances the spinner and re-arms only while something is
// running, so the loop drains naturally once everything goes idle.
func (t *tickerComponent) handleSpinnerTick(m spinnerTickMsg) (tea.Model, tea.Cmd) {
	a := t.app
	a.spinnerFrame++
	// Re-arm only while something is active. When everything
	// goes idle the loop drains naturally; the next non-idle
	// transition restarts it via the connected/live event paths.
	if a.session.anyRunning() {
		return a, spinnerCmd()
	}
	return a, nil
}

// tickDelay resolves the configurable per-frame splash delay, clamping the
// user override into [20ms, 1s] and falling back to introFrameDelay.
func (t *tickerComponent) tickDelay() time.Duration {
	d := t.app.IntroFrameDelay
	if d <= 0 {
		return introFrameDelay
	}
	if d < 20*time.Millisecond {
		return 20 * time.Millisecond
	}
	if d > 1*time.Second {
		return 1 * time.Second
	}
	return d
}

// introTickCmd schedules the next splash frame advance.
func (t *tickerComponent) introTickCmd() tea.Cmd {
	return scheduleTick(t.tickDelay(), func() tea.Msg { return introTickMsg{} })
}

// handleIntroTick advances the splash logo frame and re-arms while the intro
// stage is up; once any keypress leaves StageIntro the loop dies naturally.
func (t *tickerComponent) handleIntroTick(m introTickMsg) (tea.Model, tea.Cmd) {
	a := t.app
	if a.stage != StageIntro {
		return a, nil
	}
	frames := intro.GRCLogoFrames()
	if len(frames) > 0 {
		a.introFrameIdx = (a.introFrameIdx + 1) % len(frames)
	}
	return a, t.introTickCmd()
}
