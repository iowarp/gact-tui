package ui

// app_view.go is the root Bubbletea View, rendering the connecting/error/main screens and SSE health indicators.

import (
	"fmt"
	"time"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

// --- View -----------------------------------------------------------------

func (a *App) View() tea.View {
	renderStarted := time.Now()
	if a.width == 0 || a.height == 0 {
		v := tea.NewView("…")
		v.AltScreen = true
		a.metrics.finishInteractionRender(time.Since(renderStarted))
		return v
	}
	a.interaction.beginHitFrame()
	var content string
	switch a.stage {
	case StageIntro:
		content = a.viewIntro()
	case StageConnecting:
		content = a.viewConnecting()
	case StageError:
		content = a.viewError()
	default:
		content = a.viewMain()
	}
	v := tea.NewView(content)
	v.AltScreen = !a.DisableAltScreen
	v.BackgroundColor = a.Theme.Bg
	v.ForegroundColor = a.Theme.Fg
	if a.MouseEnabled {
		v.MouseMode = tea.MouseModeAllMotion
	}
	// T1: reflect the active session's title in the terminal window
	// title so tmux / alacritty / kitty / iterm tabs show what the
	// user is looking at. Fallback is the bare "GACT" brand when no
	// session is selected.
	v.WindowTitle = a.chrome.windowTitle()
	if a.audit != nil {
		a.audit.RecordRendered(content, map[string]any{
			"stage":          tuiAuditStageLabel(a.stage),
			"session_id":     a.session.currentID(),
			"window_title":   v.WindowTitle,
			"width":          a.width,
			"height":         a.height,
			"message_count":  len(a.conversation.messages),
			"current_status": a.session.currentStatus,
		})
	}
	a.metrics.finishInteractionRender(time.Since(renderStarted))
	return v
}

// sseHealthDot renders a single-glyph indicator summarising the
// event-stream state. Green = live, amber = reconnecting (backoff
// in progress), red = still in the connect stage. Used in the
// header so users can glance-verify the stream without scanning
// for the backoff hint in the footer.
func (c *connectionComponent) sseHealthDot() string {
	t := c.app.Theme
	switch {
	case c.app.stage == StageConnecting:
		return lipgloss.NewStyle().Foreground(t.Danger).Render("●")
	case c.sseBackoffAttempts > 0:
		return lipgloss.NewStyle().Foreground(t.Warning).Render("●")
	default:
		return lipgloss.NewStyle().Foreground(t.Success).Render("●")
	}
}

// windowTitle builds the OSC-2 string set on every frame. Intentionally
// cheap — the bubbletea renderer diffs against the previous view and
// only emits the escape sequence when the string actually changes.
// U2: appends a status suffix for running / waiting_permission so
// tab-switchers can tell at a glance which pane needs attention.
// MMMMMMMM1: appends `[↩N]` when the user has detached sessions on
// this backend so an unfocused terminal tab still reminds them
// resumable work exists.
func (c *chromeComponent) windowTitle() string {
	a := c.app
	brand := a.BrandName
	if brand == "" {
		brand = "GACT"
	}
	var title string
	if a.session.selected < 0 || a.session.selected >= len(a.session.sessions) {
		title = brand
	} else {
		s := a.session.sessions[a.session.selected]
		if s.Title == "" {
			title = brand
		} else {
			title = brand + " — " + s.Title
		}
		switch s.Status {
		case gact.StatusRunning:
			title += " (running)"
		case gact.StatusWaitingPermission:
			title += " (waiting)"
		}
	}
	if n := len(a.previouslyDetached); n > 0 {
		title += fmt.Sprintf(" [↩%d]", n)
	}
	return title
}

func (a *App) viewConnecting() string {
	t := a.Theme
	a.interaction.registerScreenSurfaceHit("connecting:retry", func(app *App) tea.Cmd {
		app.stage = StageConnecting
		app.connection.connectRetryAttempts = 0
		return app.connection.connectCmd()
	})
	box := lipgloss.NewStyle().
		Width(a.width).Height(a.height).
		Align(lipgloss.Center, lipgloss.Center).
		Foreground(t.Fg).Background(t.Bg)
	body := lipgloss.JoinVertical(lipgloss.Center,
		t.HeaderTitle.Render(" "+a.localizer.t(msgChromeConnectingTitle, nil)+" "),
		"",
		t.HintLabel.Render(a.localizer.t(msgChromeConnectingStatus,
			map[string]string{"backend": a.BackendURL})),
		"",
		t.HintLabel.Italic(true).Render(a.localizer.t(msgChromeConnectingRetry, nil)),
	)
	return box.Render(body)
}

func (a *App) viewError() string {
	t := a.Theme
	modal := a.viewErrorModal()
	return lipgloss.NewStyle().
		Width(a.width).
		Height(a.height).
		Foreground(t.Fg).
		Background(t.Bg).
		Render(overlay(blankScreen(a.width, a.height, t.Bg), modal, a.width, a.height))
}

func (a *App) viewErrorModal() string {
	t := a.Theme
	w := a.modals.modalWidth()
	contentW := modalInsetListWidth(w)
	hint := t.HintLabel.Render(a.localizer.t(msgChromeBackend,
		map[string]string{"backend": a.BackendURL}))
	retryHint := ""
	if a.connection.connectRetryAttempts > 0 {
		retryHint = t.HintLabel.Render(fmt.Sprintf(
			"auto-retry pending (attempt %d)", a.connection.connectRetryAttempts+1))
	}
	errorText := lipgloss.NewStyle().
		Foreground(t.Fg).
		Background(t.BgSubtle).
		Width(contentW).
		Render(a.stageError)
	rows := []string{errorText, "", hint}
	if retryHint != "" {
		rows = append(rows, "", retryHint)
	}
	buttons := []menuButton{
		{
			id:    "error:retry",
			label: "retry",
			action: func(app *App) tea.Cmd {
				app.stage = StageConnecting
				app.connection.connectRetryAttempts = 0
				return app.connection.connectCmd()
			},
		},
		{
			id:    "error:quit",
			label: "quit",
			action: func(app *App) tea.Cmd {
				return tea.Quit
			},
		},
	}
	modal := a.modals.renderModalFrame(modalFrameOptions{
		width:      w,
		title:      a.localizer.t(msgChromeConnectionError, nil),
		titleColor: t.Danger,
		border:     t.Danger,
		buttons:    buttons,
		body:       lipgloss.JoinVertical(lipgloss.Left, rows...),
		footer: t.HintKey.Render("Ctrl+R") + t.HintLabel.Render(" retry now  ") +
			t.HintKey.Render("Ctrl+C") + t.HintLabel.Render(" quit"),
	})
	return modal
}

func (m *modalkit) paletteBodyPageSize() int {
	return minInt(22, m.modalBodyRows(10))
}

func (m *modalkit) paletteBodyPageSizeForRows(rows []string) int {
	body := lipgloss.JoinVertical(lipgloss.Left, rows...)
	return compactModalBodyRows(body, m.paletteBodyPageSize(), 8)
}
