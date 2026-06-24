package ui

// app_interactions.go is the top-level keyboard router (App.handleKey) dispatching to overlays, modals, and panes.

import (
	tea "charm.land/bubbletea/v2"
)

func (a *App) handleKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	// IIIII1: Ctrl+Z is a CLEAN detach, not a SIGTSTP suspend.
	// Sets DetachedSessionID so main.go can print a reattach hint
	// after p.Run() returns, then quits the program. The backend
	// session keeps running by design (sessions are server-side
	// state) — `gact attach <sid>` resumes the conversation in a
	// new TUI process. User explicitly asked for tmux-like detach
	// instead of the previous LLL8b job-control suspend, which
	// "leveraging the linux background execution is just cheap"
	// (lost the session if the terminal closed).
	if k.String() == "ctrl+z" {
		a.DetachedSessionID = a.session.currentID()
		// AAAAAAAA1: capture title + workspace so main.go can record
		// a useful row in the detached registry.
		if a.session.selected >= 0 && a.session.selected < len(a.session.sessions) {
			s := a.session.sessions[a.session.selected]
			a.DetachedTitle = s.Title
			a.DetachedWorkspace = s.WorkspaceID
		}
		return a, tea.Quit
	}
	// Clear any transient hint banner — it's a one-off toast that
	// shouldn't persist past the next interaction. Done before modal
	// dispatch so even hitting "Esc" in a modal dismisses the banner.
	// LLLLLLLL1: but only if the hint has been on-screen long enough
	// for the user to read it. Without the min-display gate, a hint
	// set by a background event (SSE reconnect, session archive
	// confirmation, etc.) between two keystrokes gets clobbered on
	// the very next key, flashing for one frame. 800 ms matches the
	// DDDDD1 reconnect-badge threshold so the two toast paths use the
	// same "sub-second = not worth flashing" rule.
	a.chrome.clearTransientHintForKey(k.String())
	// Any key other than `x` cancels a pending delete — the two-step
	// confirm is there to catch accidents, not to force the user into
	// a modal dialog, so a natural next action (arrow key, typing,
	// whatever) should back out cleanly. The `x` branch itself
	// distinguishes arm-vs-commit.
	if k.String() != "x" {
		a.sidebar.pendingDeleteSessionID = ""
	}
	// JJJ1: any key dismisses the splash and starts the connect flow.
	// Ctrl+C still quits.
	if a.stage == StageIntro {
		if k.String() == "ctrl+c" {
			return a, tea.Quit
		}
		a.stage = StageConnecting
		return a, a.connection.connectCmd()
	}

	// StageError is a special case: Ctrl+R retries immediately (skips
	// the auto-retry backoff), Ctrl+C still quits, every other key is
	// swallowed so users don't accidentally trigger something against
	// the unconnected backend.
	if a.stage == StageError {
		switch k.String() {
		case "ctrl+c":
			return a, tea.Quit
		case "ctrl+r":
			a.stage = StageConnecting
			a.connection.connectRetryAttempts = 0
			return a, a.connection.connectCmd()
		}
		return a, nil
	}
	if model, cmd, handled := a.handleActiveOverlayKey(k); handled {
		return model, cmd
	}

	switch k.String() {
	case "ctrl+c":
		// ZZZZZZZZZ1: Ctrl+C now opens a confirmation overlay instead
		// of exiting immediately. User feedback: "ctrl+c should have
		// a confirmation window, close? yes no detach". Prevents
		// accidental quit mid-turn and surfaces the detach path
		// (previously buried under Ctrl+Z) as a first-class option.
		//
		// Second Ctrl+C while the confirm is already open accepts
		// the currently-highlighted option — preserves the old
		// "spam ctrl+c to quit" muscle memory.
		if a.quitConfirm.open {
			return a.quitConfirm.applySelection()
		}
		a.quitConfirm.openModal()
		return a, nil
	case "?":
		// Open help when there's nothing to type into — covers both
		// "focus is sidebar/body" and the empty-input case so the
		// reflex "press ? to find out what this does" works from any
		// fresh state. Mirrors the same input-empty gate `/` uses to
		// open the palette. Once the user has typed anything, ? falls
		// through to the textarea so messages like "what does this do?"
		// still compose normally.
		if a.focus != FocusInput || a.inputComposer.input.Value() == "" {
			a.help.openModal()
			return a, nil
		}
		// Fall through to focus dispatch so the textarea consumes it.
	case "tab", "ctrl+i":
		a.chrome.focusNextPane()
		return a, nil
	case "shift+tab":
		a.chrome.focusPane(-1)
		return a, nil
	case "ctrl+x":
		if sid := a.session.currentID(); sid != "" {
			return a, cancelCmd(a.c, sid)
		}
		return a, nil
	case "ctrl+n":
		return a, a.session.openSetup(false)
	case "ctrl+b":
		return a, a.session.openSetup(false)
	case "ctrl+r":
		// Manual reconnect / refresh.
		return a, a.connection.connectCmd()
	case "ctrl+e":
		// Z1: when the body cursor is set and the selected message
		// has a bulky tool_result or text part, expand THAT one.
		// Otherwise fall back to the "latest bulky" heuristic (L3).
		a.detail.openModal()
		return a, nil
	case "ctrl+l":
		// Reload on-disk config without restarting. Hot-applies theme +
		// voice command; backend changes are flagged but not applied
		// (would need to reconnect SSE, refetch caps, drop sessions).
		if a.ReloadConfig != nil {
			toast, err := a.ReloadConfig()
			if err != nil {
				a.setHint("config reload failed: " + err.Error())
			} else {
				a.setHint(toast)
			}
		}
		return a, nil
	case "ctrl+s":
		// Open Settings. Seed themeSel to the currently-active theme
		// so the Theme tab doesn't "reset" to dark on every open.
		// Tab 0 (Model) is now a thin "Change provider…" entry point —
		// the heavy lmConfig fetch only fires when the user actually
		// presses Enter on that row, not on every Ctrl+S.
		return a, a.settings.openTab(0)
	case "ctrl+t":
		// Open Metrics modal.
		return a, a.metrics.openLoad()
	case "ctrl+alt+t", "alt+ctrl+t":
		// Q2: cycle to the next theme without opening Settings.
		// Kitty-protocol-only binding — non-Kitty users get the
		// /theme-next slash command as a fallback.
		return a, a.cmdPalette.cycleTheme(+1)
	case "ctrl+w":
		// Open Workspace switcher. Reuses the already-loaded workspace
		// list — connectCmd populates a.session.workspaces at startup and
		// refreshCmd keeps it fresh — so the modal opens without a
		// round-trip. Selection defaults to the current workspace so
		// Enter is a no-op unless the user moves off it.
		a.chrome.openWorkspaceSwitch()
		return a, nil
	case "ctrl+y":
		// "Yo" — voice transcribe. If VoiceCommand is set, run it to
		// capture WAV bytes; otherwise post a tiny placeholder so the
		// emulator's canned transcript still fires for demos.
		// See scripts/voice-record.sh for a reference arecord wrapper.
		if sid := a.session.currentID(); sid != "" {
			return a, transcribeCmd(a.c, sid, a.VoiceCommand)
		}
		return a, nil
	}
	switch a.focus {
	case FocusSidebar, FocusRightSidebar:
		return a.sidebar.handleKey(k)
	case FocusBody:
		return a.conversation.handleKey(k)
	case FocusInput:
		return a.inputComposer.handleInputKey(k)
	}
	return a, nil
}
