package ui

import (
	"context"
	"fmt"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"

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
	case "tab", "right", "l":
		a.sessionSetupFocusNextSection()
		return a, nil
	case "shift+tab", "left", "h":
		a.sessionSetupFocusPrevSection()
		return a, nil
	case "up", "k":
		a.stepSessionSetupSelection(-1)
		return a, nil
	case "down", "j":
		a.stepSessionSetupSelection(+1)
		return a, nil
	case " ", "f":
		if !s.defaultsOnly {
			s.saveDefault = !s.saveDefault
		}
		return a, nil
	case "enter":
		if s.loading {
			return a, nil
		}
		return a.sessionSetupPrimaryAction()
	}
	return a, nil
}

func (a *App) sessionSetupFocusNextSection() {
	if a.sessionSetup == nil {
		return
	}
	a.sessionSetup.row = modulo(a.sessionSetup.row+1, 2)
}

func (a *App) sessionSetupFocusPrevSection() {
	if a.sessionSetup == nil {
		return
	}
	a.sessionSetup.row = modulo(a.sessionSetup.row-1, 2)
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

func (a *App) sessionSetupPrimaryAction() (tea.Model, tea.Cmd) {
	if a.sessionSetup == nil {
		return a, nil
	}
	if a.sessionSetup.defaultsOnly {
		a.applySessionSetupDefaultsFromSelection()
		a.closeSessionSetup()
		a.transientHint = "new-session defaults saved"
		return a, scheduleHintExpire(a.transientHint)
	}
	if a.sessionSetup.saveDefault {
		a.applySessionSetupDefaultsFromSelection()
	}
	sel := sessionSetupSelection{
		BlueprintID: a.sessionSetupSelectedBlueprintID(),
		PackID:      a.sessionSetupSelectedPackID(),
	}
	a.closeSessionSetup()
	return a, createSessionWithSemanticsCmd(a.c, a.wsID, sel)
}

func (a *App) viewSessionSetup() string {
	t := a.Theme
	if a.sessionSetup == nil {
		a.sessionSetup = &sessionSetupState{}
	}
	s := a.sessionSetup
	w := minInt(maxInt(76, a.modalWidth()), 104)
	contentW := modalBodyContentWidth(w)
	rows := []string{}
	if s.loading {
		rows = append(rows, t.HintLabel.Render("loading workflows…"))
	} else {
		if s.errText != "" {
			rows = append(rows, lipgloss.NewStyle().Foreground(t.Warning).Render(s.errText), "")
		}
		blueprintRows, blueprintList := a.renderSessionSetupBlueprintSection(contentW)
		packRows, packList := a.renderSessionSetupPackSection(contentW)
		sectionRows, blueprintStart, packStart, packCol, sectionW := joinSessionSetupSections(blueprintRows, packRows, contentW)
		sectionStart := len(rows)
		rows = append(rows, sectionRows...)
		if !s.defaultsOnly {
			rows = append(rows, "")
			check := "□"
			if s.saveDefault {
				check = "■"
			}
			rows = append(rows, t.HintKey.Render(check)+" "+t.HintLabel.Render("Use these choices as the default for future sessions"))
		}
		rows = append(rows, "")
		primary := "start session"
		if s.defaultsOnly {
			primary = "save defaults"
		}
		actionButtons := []menuButton{
			{
				id:    "session-setup:primary",
				label: primary,
				action: func(app *App) tea.Cmd {
					_, cmd := app.sessionSetupPrimaryAction()
					return cmd
				},
			},
			{
				id:    "session-setup:cancel",
				label: "cancel",
				action: func(app *App) tea.Cmd {
					app.closeSessionSetup()
					return nil
				},
			},
		}
		actionRow := len(rows)
		actionText, actionCol := a.renderCenteredModalButtons(contentW, actionButtons, -1)
		rows = append(rows, actionText)
		rows = append(rows, "")
		rows = append(rows, t.HintLabel.Italic(true).Render("↑/↓ choose · ←/→ switch section · f future default · Enter apply · Esc close"))

		title := "New Session"
		if s.defaultsOnly {
			title = "Session Defaults"
		}
		buttons := []menuButton{closeMenuButton("session-setup:close", func(app *App) { app.closeSessionSetup() })}
		rendered := a.renderModalFrameWithLayout(modalFrameOptions{
			width:   w,
			title:   title,
			buttons: buttons,
			body:    padModalBody(lipgloss.JoinVertical(lipgloss.Left, rows...), minInt(18, maxInt(12, len(rows)))),
			footer:  t.HintLabel.Render("Ctrl+B opens session defaults"),
		})
		a.registerModalListRegion(rendered.modal, rendered.bodyRow+sectionStart+blueprintStart, 0, sectionW, blueprintList, "session-setup:blueprints:wheel", func(app *App, button tea.MouseButton) tea.Cmd {
			app.sessionSetup = app.ensureSessionSetup()
			app.sessionSetup.row = 0
			app.sessionSetup.blueprintSel = moveSelectionByWheel(app.sessionSetup.blueprintSel, len(app.sessionSetup.blueprints)+1, button)
			return nil
		})
		a.registerModalListRegion(rendered.modal, rendered.bodyRow+sectionStart+packStart, packCol, sectionW, packList, "session-setup:packs:wheel", func(app *App, button tea.MouseButton) tea.Cmd {
			app.sessionSetup = app.ensureSessionSetup()
			app.sessionSetup.row = 1
			app.sessionSetup.packSel = moveSelectionByWheel(app.sessionSetup.packSel, len(app.sessionSetup.packs)+1, button)
			return nil
		})
		if !s.defaultsOnly {
			futureRow := rendered.bodyRow + sectionStart + len(sectionRows) + 1
			a.registerModalContentHit(rendered.modal, "session-setup:future-default", futureRow, 0, contentW, 1, func(app *App) tea.Cmd {
				if app.sessionSetup != nil {
					app.sessionSetup.saveDefault = !app.sessionSetup.saveDefault
				}
				return nil
			})
		}
		a.registerModalButtons(rendered.modal, rendered.bodyRow+actionRow, actionCol, actionButtons)
		return rendered.modal
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

func (a *App) ensureSessionSetup() *sessionSetupState {
	if a.sessionSetup == nil {
		a.sessionSetup = &sessionSetupState{}
	}
	return a.sessionSetup
}

func (a *App) renderSessionSetupBlueprintSection(width int) ([]string, modalListRender) {
	s := a.ensureSessionSetup()
	title := a.sessionSetupSectionTitle("Workflow blueprint", s.row == 0, width)
	indexes := make([]int, 0, len(s.blueprints)+1)
	for i := 0; i < len(s.blueprints)+1; i++ {
		indexes = append(indexes, i)
	}
	visible := minInt(7, maxInt(4, len(indexes)))
	list, _ := a.renderWindowedIndexModalList(indexes, s.blueprintSel, visible, 7, modalListOptions{
		width:     width,
		rowBudget: visible,
	}, func(idx int) modalListItem {
		title := "CLIO default"
		if idx > 0 {
			bp := s.blueprints[idx-1]
			title = firstNonEmpty(bp.Title, bp.ID)
		}
		prefix := "○ "
		if idx == s.blueprintSel {
			prefix = "● "
		}
		choice := idx
		return modalListItem{
			id:       fmt.Sprintf("session-setup:blueprint:%d", choice),
			title:    prefix + title,
			selected: s.row == 0 && choice == s.blueprintSel,
			action: func(app *App) tea.Cmd {
				state := app.ensureSessionSetup()
				state.row = 0
				state.blueprintSel = choice
				return nil
			},
		}
	})
	return append([]string{title}, list.rows...), list
}

func (a *App) renderSessionSetupPackSection(width int) ([]string, modalListRender) {
	s := a.ensureSessionSetup()
	title := a.sessionSetupSectionTitle("Expert pack", s.row == 1, width)
	indexes := make([]int, 0, len(s.packs)+1)
	for i := 0; i < len(s.packs)+1; i++ {
		indexes = append(indexes, i)
	}
	visible := minInt(7, maxInt(4, len(indexes)))
	list, _ := a.renderWindowedIndexModalList(indexes, s.packSel, visible, 7, modalListOptions{
		width:     width,
		rowBudget: visible,
	}, func(idx int) modalListItem {
		title := "None"
		if idx > 0 {
			pack := s.packs[idx-1]
			title = firstNonEmpty(pack.Title, pack.ID)
		}
		prefix := "○ "
		if idx == s.packSel {
			prefix = "● "
		}
		choice := idx
		return modalListItem{
			id:       fmt.Sprintf("session-setup:pack:%d", choice),
			title:    prefix + title,
			selected: s.row == 1 && choice == s.packSel,
			action: func(app *App) tea.Cmd {
				state := app.ensureSessionSetup()
				state.row = 1
				state.packSel = choice
				return nil
			},
		}
	})
	return append([]string{title}, list.rows...), list
}

func (a *App) sessionSetupSectionTitle(title string, active bool, width int) string {
	style := lipgloss.NewStyle().Foreground(a.Theme.FgMuted).Bold(true).Width(width)
	if active {
		style = style.Foreground(a.Theme.Secondary)
	}
	return style.Render(title)
}

func joinSessionSetupSections(leftRows, rightRows []string, width int) (rows []string, leftListStart int, rightListStart int, rightCol int, sectionW int) {
	gap := 4
	if width < 60 {
		gap = 2
	}
	sectionW = (width - gap) / 2
	if sectionW < 20 {
		sectionW = width
		gap = 0
	}
	rightCol = sectionW + gap
	maxRows := maxInt(len(leftRows), len(rightRows))
	rows = make([]string, 0, maxRows)
	leftStyle := lipgloss.NewStyle().Width(sectionW)
	rightStyle := lipgloss.NewStyle().Width(sectionW)
	gapText := strings.Repeat(" ", gap)
	if sectionW == width {
		rows = append(rows, leftRows...)
		rows = append(rows, "")
		rightStart := len(rows)
		rows = append(rows, rightRows...)
		return rows, 1, rightStart + 1, 0, sectionW
	}
	for i := 0; i < maxRows; i++ {
		left := ""
		right := ""
		if i < len(leftRows) {
			left = leftRows[i]
		}
		if i < len(rightRows) {
			right = rightRows[i]
		}
		rows = append(rows, leftStyle.Render(left)+gapText+rightStyle.Render(right))
	}
	return rows, 1, 1, rightCol, sectionW
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
