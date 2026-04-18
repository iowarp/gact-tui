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
	tab         int // 0 = Model, 1 = Agent
	modelSel    int // index into modelList
	agentSel    int // index into agentList
	modelList   []settingsModelEntry
	agentList   []gact.AgentDef
}

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
	case "tab", "shift+tab":
		s.tab = (s.tab + 1) % 2
		return a, nil
	case "up", "k":
		if s.tab == 0 && s.modelSel > 0 {
			s.modelSel--
		} else if s.tab == 1 && s.agentSel > 0 {
			s.agentSel--
		}
		return a, nil
	case "down", "j":
		if s.tab == 0 && s.modelSel < len(s.modelList)-1 {
			s.modelSel++
		} else if s.tab == 1 && s.agentSel < len(s.agentList)-1 {
			s.agentSel++
		}
		return a, nil
	case "enter":
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
	w := 70
	if w > a.width-8 {
		w = a.width - 8
	}

	tabs := func(i int) string {
		labels := []string{"Model", "Agent"}
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
	if s.tab == 0 {
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
	} else {
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
