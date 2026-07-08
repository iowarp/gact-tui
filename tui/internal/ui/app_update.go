package ui

// app_update.go is the root Bubbletea Update entry point and window-resize handler.

import (
	"time"

	tea "charm.land/bubbletea/v2"
)

func (a *App) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	// Defensively (re)wire every domain-component back-reference. Production
	// apps go through New()/wireComponents(), but struct-literal test apps
	// drive Update() directly without it, and several components are reached
	// from the SSE ingest path on the very first Update — so every component's
	// app back-ref must be valid here. wireComponents() is idempotent and cheap
	// (a handful of pointer assignments); calling it once at the top covers all
	// components uniformly instead of guarding a hand-picked subset.
	a.wireComponents()
	tuiTrace := a.metrics.beginInteractionTrace(msg)
	updateStarted := time.Now()
	// Snapshot the hint going INTO this Update cycle.
	// If a branch below assigns a different non-empty value we
	// stamp transientHintAt after switch returns. This means the
	// "first seen" time tracks the Update that actually set the
	// hint, not an arbitrary later Update that only read it.
	preHint := a.transientHint
	defer func() {
		a.metrics.finishInteractionUpdate(tuiTrace, time.Since(updateStarted))
		if a.transientHint != "" && a.transientHint != preHint {
			a.transientHintAt = time.Now()
		}
		if a.transientHint == "" {
			a.transientHintAt = time.Time{}
		}
	}()
	return a.dispatchUpdateMessage(msg)
}

func (c *chromeComponent) handleWindowSize(m tea.WindowSizeMsg) (tea.Model, tea.Cmd) {
	a := c.app
	a.width = m.Width
	a.height = m.Height
	return a, nil
}
