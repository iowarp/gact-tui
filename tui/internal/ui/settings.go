package ui

import (
	"context"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

// settingsState holds the Settings modal's internal state. Lives on App
// when settingsOpen is true.
type settingsState struct {
	tab       int // 0 = Model, 1 = Agent, 2 = Theme, 3 = TUI prefs
	modelSel  int // index into modelList
	agentSel  int // index into agentList
	themeSel  int // 0 = dark, 1 = light
	modelList []settingsModelEntry
	agentList []gact.AgentDef
}

// settingsTabCount is the canonical number of tabs — updating the list
// in viewSettings without touching the wrap-around in handleSettingsKey
// caused Tab to go stale in past iterations. Single source of truth.
const settingsTabCount = 4

type settingsModelEntry struct {
	provider string
	model    gact.Model
}

// loadSettingsCmd fetches providers + models + agents in parallel-ish (one
// goroutine, sequential calls) and returns a settingsLoadedMsg.
func loadSettingsCmd(c *client.Client) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		providers, err := c.ListProviders(ctx)
		if err != nil {
			return errMsg{err: err, stage: "providers"}
		}
		var entries []settingsModelEntry
		for _, p := range providers {
			models, err := c.ListProviderModels(ctx, p.ID)
			if err != nil {
				continue // skip provider on error rather than failing the whole modal
			}
			for _, m := range models {
				entries = append(entries, settingsModelEntry{provider: p.ID, model: m})
			}
		}
		agents, err := c.ListAgents(ctx)
		if err != nil {
			return errMsg{err: err, stage: "agents"}
		}
		return settingsLoadedMsg{models: entries, agents: agents}
	}
}

// applySettingsCmd PATCHes the session with the chosen model + agent.
func applySettingsCmd(c *client.Client, sessionID string, model *gact.ModelRef, agent *gact.AgentRef) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		req := client.PatchSessionRequest{Model: model, Agent: agent}
		updated, err := c.PatchSession(ctx, sessionID, req)
		if err != nil {
			return errMsg{err: err, stage: "patch-session"}
		}
		return sessionUpdatedMsg{session: updated}
	}
}

type settingsLoadedMsg struct {
	models []settingsModelEntry
	agents []gact.AgentDef
}

type sessionUpdatedMsg struct {
	session gact.Session
}

// handleSettingsKey routes keypresses while the Settings modal is open.
func (a *App) handleSettingsKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	if a.settings == nil {
		a.settings = &settingsState{}
	}
	s := a.settings
	switch k.String() {
	case "esc", "ctrl+s":
		a.settingsOpen = false
		return a, nil
	case "tab":
		s.tab = (s.tab + 1) % settingsTabCount
		return a, nil
	case "shift+tab":
		s.tab = (s.tab + settingsTabCount - 1) % settingsTabCount
		return a, nil
	case "up", "k":
		switch s.tab {
		case 0:
			if s.modelSel > 0 {
				s.modelSel--
			}
		case 1:
			if s.agentSel > 0 {
				s.agentSel--
			}
		case 2:
			if s.themeSel > 0 {
				s.themeSel--
			}
		}
		return a, nil
	case "down", "j":
		switch s.tab {
		case 0:
			if s.modelSel < len(s.modelList)-1 {
				s.modelSel++
			}
		case 1:
			if s.agentSel < len(s.agentList)-1 {
				s.agentSel++
			}
		case 2:
			if s.themeSel < 1 {
				s.themeSel++
			}
		}
		return a, nil
	case "enter":
		switch s.tab {
		case 2:
			// Theme apply is local — no backend PATCH. Live-swap the
			// lipgloss Theme so the conversation redraws with the new
			// palette; same plumbing K9 uses for config-reload.
			mode := ModeDark
			if s.themeSel == 1 {
				mode = ModeLight
			}
			a.Theme = ThemeForMode(mode)
			a.settingsOpen = false
			a.transientHint = "theme applied (persist via --theme flag or config)"
			return a, nil
		case 3:
			// TUI prefs tab is read-only for now — Enter just closes.
			a.settingsOpen = false
			return a, nil
		}
		sid := a.currentSessionID()
		if sid == "" {
			a.settingsOpen = false
			return a, nil
		}
		var modelRef *gact.ModelRef
		var agentRef *gact.AgentRef
		if s.tab == 0 && s.modelSel < len(s.modelList) {
			e := s.modelList[s.modelSel]
			modelRef = &gact.ModelRef{ProviderID: e.provider, ModelID: e.model.ID}
		}
		if s.tab == 1 && s.agentSel < len(s.agentList) {
			a := s.agentList[s.agentSel]
			agentRef = &gact.AgentRef{ID: a.ID}
		}
		a.settingsOpen = false
		return a, applySettingsCmd(a.c, sid, modelRef, agentRef)
	}
	return a, nil
}

// viewSettings renders the modal.
func (a *App) viewSettings() string {
	t := a.Theme
	if a.settings == nil {
		a.settings = &settingsState{}
	}
	s := a.settings
	w := a.modalWidth()

	tabs := func(i int) string {
		labels := []string{"Model", "Agent", "Theme", "TUI"}
		var rendered []string
		for j, l := range labels {
			st := lipgloss.NewStyle().Foreground(t.FgMuted).Padding(0, 2)
			if j == i {
				st = st.Foreground(t.Bg).Background(t.Primary).Bold(true)
			}
			rendered = append(rendered, st.Render(l))
		}
		return strings.Join(rendered, " ")
	}

	currentModel := ""
	currentAgent := ""
	if a.selected >= 0 && a.selected < len(a.sessions) {
		sess := a.sessions[a.selected]
		if sess.Model.ModelID != "" {
			currentModel = sess.Model.ProviderID + "/" + sess.Model.ModelID
		}
		if sess.Agent.ID != "" {
			currentAgent = sess.Agent.ID
		}
	}

	rows := []string{
		lipgloss.NewStyle().Bold(true).Foreground(t.Primary).Render("Settings"),
		"",
		tabs(s.tab),
		"",
	}
	switch s.tab {
	case 0:
		rows = append(rows, t.HintLabel.Render("current: "+orPlaceholder(currentModel, "(unset)")))
		rows = append(rows, "")
		if len(s.modelList) == 0 {
			rows = append(rows, t.HintLabel.Render("loading…"))
		}
		for i, e := range s.modelList {
			marker := "  "
			titleStyle := lipgloss.NewStyle().Foreground(t.Fg)
			if i == s.modelSel {
				marker = lipgloss.NewStyle().Foreground(t.Secondary).Render("▌ ")
				titleStyle = titleStyle.Foreground(t.Secondary).Bold(true)
			}
			line := marker + titleStyle.Render(e.provider+"/"+e.model.ID) + "  " +
				lipgloss.NewStyle().Foreground(t.FgMuted).Render(e.model.Name)
			rows = append(rows, truncate(line, w-2))
		}
	case 1:
		rows = append(rows, t.HintLabel.Render("current: "+orPlaceholder(currentAgent, "(unset)")))
		rows = append(rows, "")
		if len(s.agentList) == 0 {
			rows = append(rows, t.HintLabel.Render("loading…"))
		}
		for i, ag := range s.agentList {
			marker := "  "
			titleStyle := lipgloss.NewStyle().Foreground(t.Fg)
			if i == s.agentSel {
				marker = lipgloss.NewStyle().Foreground(t.Secondary).Render("▌ ")
				titleStyle = titleStyle.Foreground(t.Secondary).Bold(true)
			}
			line := marker + titleStyle.Render(ag.ID) + "  " +
				lipgloss.NewStyle().Foreground(t.FgMuted).Render(ag.Title)
			rows = append(rows, truncate(line, w-2))
		}
	case 2:
		// Theme tab — pick light or dark live. Doesn't persist to the
		// config file; the hint explains how (use --theme or config).
		rows = append(rows, t.HintLabel.Render("current: "+themeName(a.Theme)))
		rows = append(rows, "")
		for i, entry := range []struct{ name, desc string }{
			{"dark", "high-contrast on dark backgrounds (default)"},
			{"light", "muted palette on light backgrounds"},
		} {
			marker := "  "
			titleStyle := lipgloss.NewStyle().Foreground(t.Fg)
			if i == s.themeSel {
				marker = lipgloss.NewStyle().Foreground(t.Secondary).Render("▌ ")
				titleStyle = titleStyle.Foreground(t.Secondary).Bold(true)
			}
			line := marker + titleStyle.Render(entry.name) + "  " +
				lipgloss.NewStyle().Foreground(t.FgMuted).Render(entry.desc)
			rows = append(rows, truncate(line, w-2))
		}
		rows = append(rows, "")
		rows = append(rows, t.HintLabel.Italic(true).Render(
			"Enter live-applies. Persist via --theme=light|dark or "+
				"voice_command in ~/.config/gact/config.json."))
	case 3:
		// TUI preferences — read-only this pass. Surfaces what's
		// currently configured so users can confirm state without
		// grepping their own config file.
		rows = append(rows, t.HintLabel.Render("Runtime configuration (read-only — edit config file to change)"))
		rows = append(rows, "")
		rows = append(rows, "  "+t.HintKey.Render("backend URL  ")+a.BackendURL)
		if a.VoiceCommand == "" {
			rows = append(rows, "  "+t.HintKey.Render("voice cmd    ")+t.HintLabel.Render("(unset — Ctrl+Y sends placeholder)"))
		} else {
			rows = append(rows, "  "+t.HintKey.Render("voice cmd    ")+a.VoiceCommand)
		}
		rows = append(rows, "  "+t.HintKey.Render("theme        ")+themeName(a.Theme))
		rows = append(rows, "  "+t.HintKey.Render("AltScreen    ")+boolPretty(!a.DisableAltScreen))
		rows = append(rows, "")
		rows = append(rows, t.HintLabel.Italic(true).Render(
			"Ctrl+L reloads these from config at runtime. See "+
				"contract/SPEC.md for per-session settings."))
	}
	rows = append(rows, "", t.HintLabel.Render("↑/↓ select  Tab switch tab  Enter apply  Esc close"))

	body := lipgloss.JoinVertical(lipgloss.Left, rows...)
	return lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(t.Primary).
		Background(t.BgSubtle).
		Padding(1, 2).
		Width(w).
		Render(body)
}

func orPlaceholder(s, placeholder string) string {
	if s == "" {
		return placeholder
	}
	return s
}

// themeName returns "light" or "dark" based on the theme's background
// luminance. Same heuristic as renderMarkdown's glamourStyle picker.
func themeName(t Theme) string {
	if r, g, b, _ := t.Bg.RGBA(); r > 60000 && g > 60000 && b > 60000 {
		return "light"
	}
	return "dark"
}

// boolPretty renders a bool as "on"/"off" for the TUI-prefs tab.
func boolPretty(b bool) string {
	if b {
		return "on"
	}
	return "off"
}
