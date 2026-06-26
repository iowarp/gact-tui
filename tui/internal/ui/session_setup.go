package ui

import (
	"context"
	"fmt"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

type sessionSetupState struct {
	loading      bool
	errText      string
	defaultsOnly bool
	row          int
	blueprintSel int
	packSel      int
	saveDefault  bool
	blueprints   []gact.AgentBlueprintDefinition
	packs        []gact.ExpertPackDefinition
}

type sessionSetupLoadedMsg struct {
	blueprints []gact.AgentBlueprintDefinition
	packs      []gact.ExpertPackDefinition
	err        error
}

type sessionSetupSelection struct {
	BlueprintID string
	PackID      string
}

func (a *App) openSessionSetup(defaultsOnly bool) tea.Cmd {
	a.sessionSetupOpen = true
	a.sessionSetup = &sessionSetupState{
		loading:      true,
		defaultsOnly: defaultsOnly,
		saveDefault:  defaultsOnly,
	}
	return loadSessionSetupOptionsCmd(a.c, a.runtimeScope())
}

func (a *App) closeSessionSetup() {
	a.sessionSetupOpen = false
	a.sessionSetup = nil
}

func loadSessionSetupOptionsCmd(c *client.Client, scope client.RuntimeScope) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		blueprints, bpErr := c.ListAgentBlueprints(ctx, scope)
		packs, packErr := c.ListExpertPacks(ctx, scope)
		if bpErr != nil && packErr != nil {
			return sessionSetupLoadedMsg{err: fmt.Errorf("blueprints: %v; expert packs: %v", bpErr, packErr)}
		}
		if bpErr != nil {
			return sessionSetupLoadedMsg{packs: packs, err: fmt.Errorf("blueprints: %v", bpErr)}
		}
		if packErr != nil {
			return sessionSetupLoadedMsg{blueprints: blueprints, err: fmt.Errorf("expert packs: %v", packErr)}
		}
		return sessionSetupLoadedMsg{blueprints: blueprints, packs: packs}
	}
}

func createSessionWithSemanticsCmd(c *client.Client, wsID string, sel sessionSetupSelection) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		s, err := c.CreateSession(ctx, client.CreateSessionRequest{
			WorkspaceID: wsID,
			Title:       "new session " + time.Now().UTC().Format("15:04:05"),
			Agent:       &gact.AgentRef{ID: "default"},
		})
		if err != nil {
			return errMsg{err: err, stage: "create-session"}
		}
		var bindErrs []string
		if sel.BlueprintID != "" {
			state, err := c.SetSessionAgentBlueprint(ctx, s.ID, gact.SetSessionAgentBlueprintRequest{
				BlueprintID: sel.BlueprintID,
			})
			if err != nil {
				bindErrs = append(bindErrs, "blueprint: "+err.Error())
			} else {
				mergeAgentBlueprintStateIntoSession(&s, state)
			}
		}
		if sel.PackID != "" {
			state, err := c.SetSessionExpertPack(ctx, s.ID, gact.SetSessionExpertPackRequest{
				PackID: sel.PackID,
			})
			if err != nil {
				bindErrs = append(bindErrs, "expert pack: "+err.Error())
			} else {
				mergeExpertPackStateIntoSession(&s, state)
			}
		}
		return sessionCreatedMsg{session: s, semanticWarning: strings.Join(bindErrs, "; ")}
	}
}

func mergeAgentBlueprintStateIntoSession(s *gact.Session, state gact.SessionAgentBlueprintState) {
	if state.Session != nil {
		*s = *state.Session
		return
	}
	if s.Metadata == nil {
		s.Metadata = map[string]any{}
	}
	if state.ActiveAgentBlueprintID != "" {
		s.Metadata["active_agent_blueprint_id"] = state.ActiveAgentBlueprintID
		s.Metadata["agent_blueprint_id"] = state.ActiveAgentBlueprintID
	}
	if state.ActiveAgentBlueprintPath != "" {
		s.Metadata["active_agent_blueprint_path"] = state.ActiveAgentBlueprintPath
	}
	if state.WorkspaceID != "" {
		s.Metadata["active_agent_blueprint_workspace_id"] = state.WorkspaceID
	}
	if state.ActiveAgentBlueprintID != "" {
		s.Metadata["active_agent_blueprint_scope"] = "session"
	}
}

func mergeExpertPackStateIntoSession(s *gact.Session, state gact.SessionExpertPackState) {
	if state.Session != nil {
		*s = *state.Session
		return
	}
	if s.Metadata == nil {
		s.Metadata = map[string]any{}
	}
	if state.ActiveExpertPackID != "" {
		s.Metadata["active_expert_pack_id"] = state.ActiveExpertPackID
		s.Metadata["expert_pack_id"] = state.ActiveExpertPackID
	}
	if state.ActiveExpertPackPath != "" {
		s.Metadata["active_expert_pack_path"] = state.ActiveExpertPackPath
	}
}

func (a *App) applySessionSetupDefaultsFromSelection() {
	if a.sessionSetup == nil {
		return
	}
	a.DefaultAgentBlueprintID = a.sessionSetupSelectedBlueprintID()
	a.DefaultExpertPackID = a.sessionSetupSelectedPackID()
	a.persistPrefs()
}

func (a *App) handleSessionSetupKey(k tea.KeyPressMsg) (tea.Model, tea.Cmd) {
	if a.sessionSetup == nil {
		a.closeSessionSetup()
		return a, nil
	}
	s := a.sessionSetup
	switch k.String() {
	case "esc", "ctrl+c":
		a.closeSessionSetup()
		return a, nil
	case "up", "k":
		if s.row > 0 {
			s.row--
		}
		return a, nil
	case "down", "j":
		if s.row < a.sessionSetupLastRow() {
			s.row++
		}
		return a, nil
	case "left", "h":
		a.stepSessionSetupSelection(-1)
		return a, nil
	case "right", "l":
		a.stepSessionSetupSelection(+1)
		return a, nil
	case " ":
		if s.row == 2 && !s.defaultsOnly {
			s.saveDefault = !s.saveDefault
		}
		return a, nil
	case "enter":
		if s.loading {
			return a, nil
		}
		switch s.row {
		case 0, 1:
			a.stepSessionSetupSelection(+1)
			return a, nil
		case 2:
			if s.defaultsOnly {
				a.applySessionSetupDefaultsFromSelection()
				a.closeSessionSetup()
				a.transientHint = "new-session defaults saved"
				return a, scheduleHintExpire(a.transientHint)
			}
			s.saveDefault = !s.saveDefault
			return a, nil
		default:
			if s.saveDefault {
				a.applySessionSetupDefaultsFromSelection()
			}
			sel := sessionSetupSelection{
				BlueprintID: a.sessionSetupSelectedBlueprintID(),
				PackID:      a.sessionSetupSelectedPackID(),
			}
			a.closeSessionSetup()
			return a, createSessionWithSemanticsCmd(a.c, a.wsID, sel)
		}
	}
	return a, nil
}

func (a *App) stepSessionSetupSelection(delta int) {
	if a.sessionSetup == nil || delta == 0 {
		return
	}
	s := a.sessionSetup
	switch s.row {
	case 0:
		count := len(s.blueprints) + 1
		if count > 0 {
			s.blueprintSel = modulo(s.blueprintSel+delta, count)
		}
	case 1:
		count := len(s.packs) + 1
		if count > 0 {
			s.packSel = modulo(s.packSel+delta, count)
		}
	case 2:
		if !s.defaultsOnly {
			s.saveDefault = !s.saveDefault
		}
	}
}

func (a *App) sessionSetupLastRow() int {
	if a.sessionSetup != nil && a.sessionSetup.defaultsOnly {
		return 2
	}
	return 3
}

func (a *App) sessionSetupSelectedBlueprintID() string {
	if a.sessionSetup == nil || a.sessionSetup.blueprintSel <= 0 {
		return ""
	}
	idx := a.sessionSetup.blueprintSel - 1
	if idx < 0 || idx >= len(a.sessionSetup.blueprints) {
		return ""
	}
	return strings.TrimSpace(a.sessionSetup.blueprints[idx].ID)
}

func (a *App) sessionSetupSelectedPackID() string {
	if a.sessionSetup == nil || a.sessionSetup.packSel <= 0 {
		return ""
	}
	idx := a.sessionSetup.packSel - 1
	if idx < 0 || idx >= len(a.sessionSetup.packs) {
		return ""
	}
	return strings.TrimSpace(a.sessionSetup.packs[idx].ID)
}

func (a *App) viewSessionSetup() string {
	t := a.Theme
	if a.sessionSetup == nil {
		a.sessionSetup = &sessionSetupState{}
	}
	s := a.sessionSetup
	w := minInt(maxInt(64, a.modalWidth()), 92)
	innerW := modalInnerWidth(w)
	rows := []string{}
	rowStyle := func(selected bool, label, value string) string {
		marker := "  "
		labelStyle := lipgloss.NewStyle().Foreground(t.Fg)
		valueStyle := t.HintLabel
		if selected {
			marker = lipgloss.NewStyle().Foreground(t.Secondary).Render("▌ ")
			labelStyle = labelStyle.Foreground(t.Secondary).Bold(true)
			valueStyle = lipgloss.NewStyle().Foreground(t.Secondary).Bold(true)
		}
		line := marker + labelStyle.Render(label)
		if value != "" {
			budget := innerW - lipgloss.Width(ansi.Strip(marker)) - lipgloss.Width(label) - 4
			line += "  " + valueStyle.Render(truncate(value, maxInt(12, budget)))
		}
		if selected {
			line = lipgloss.NewStyle().Background(t.Bg).Width(innerW).Render(line)
		}
		return fitANSI(line, innerW)
	}
	if s.loading {
		rows = append(rows, t.HintLabel.Render("loading workflows…"))
	} else {
		if s.errText != "" {
			rows = append(rows, lipgloss.NewStyle().Foreground(t.Warning).Render(s.errText), "")
		}
		rows = append(rows, rowStyle(s.row == 0, "Workflow blueprint", a.sessionSetupBlueprintLabel()))
		rows = append(rows, rowStyle(s.row == 1, "Expert pack", a.sessionSetupPackLabel()))
		if s.defaultsOnly {
			rows = append(rows, rowStyle(s.row == 2, "Save defaults", "Enter"))
		} else {
			check := "□"
			if s.saveDefault {
				check = "■"
			}
			rows = append(rows, rowStyle(s.row == 2, "Use for future sessions", check))
			rows = append(rows, rowStyle(s.row == 3, "Start session", "Enter"))
		}
		rows = append(rows, "")
		rows = append(rows, t.HintLabel.Italic(true).Render("←/→ change · Enter apply · Esc close"))
	}
	title := "New Session"
	if s.defaultsOnly {
		title = "Session Defaults"
	}
	buttons := []menuButton{closeMenuButton("session-setup:close", func(app *App) { app.closeSessionSetup() })}
	rendered := a.renderModalFrameWithLayout(modalFrameOptions{
		width:   w,
		title:   title,
		buttons: buttons,
		body:    padModalBody(lipgloss.JoinVertical(lipgloss.Left, rows...), minInt(12, maxInt(6, len(rows)))),
		footer:  t.HintLabel.Render("Ctrl+B opens this picker"),
	})
	return rendered.modal
}

func (a *App) sessionSetupBlueprintLabel() string {
	if a.sessionSetup == nil || a.sessionSetup.blueprintSel <= 0 {
		return "backend default"
	}
	idx := a.sessionSetup.blueprintSel - 1
	if idx < 0 || idx >= len(a.sessionSetup.blueprints) {
		return "backend default"
	}
	bp := a.sessionSetup.blueprints[idx]
	return firstNonEmpty(bp.Title, bp.ID)
}

func (a *App) sessionSetupPackLabel() string {
	if a.sessionSetup == nil || a.sessionSetup.packSel <= 0 {
		return "None"
	}
	idx := a.sessionSetup.packSel - 1
	if idx < 0 || idx >= len(a.sessionSetup.packs) {
		return "None"
	}
	pack := a.sessionSetup.packs[idx]
	return firstNonEmpty(pack.Title, pack.ID)
}

func (a *App) seedSessionSetupSelections() {
	if a.sessionSetup == nil {
		return
	}
	s := a.sessionSetup
	s.blueprintSel = 0
	for i, bp := range s.blueprints {
		if strings.TrimSpace(bp.ID) == strings.TrimSpace(a.DefaultAgentBlueprintID) {
			s.blueprintSel = i + 1
			break
		}
	}
	s.packSel = 0
	for i, pack := range s.packs {
		if strings.TrimSpace(pack.ID) == strings.TrimSpace(a.DefaultExpertPackID) {
			s.packSel = i + 1
			break
		}
	}
}

func filterSessionSetupBlueprints(in []gact.AgentBlueprintDefinition) []gact.AgentBlueprintDefinition {
	out := make([]gact.AgentBlueprintDefinition, 0, len(in))
	for _, bp := range in {
		if strings.EqualFold(strings.TrimSpace(bp.Kind), "pack") {
			continue
		}
		out = append(out, bp)
	}
	return out
}

func modulo(n, m int) int {
	if m <= 0 {
		return 0
	}
	n %= m
	if n < 0 {
		n += m
	}
	return n
}
