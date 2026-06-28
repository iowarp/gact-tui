package ui

// session_setup_view.go renders the new-session setup view.

import (
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
)

func (c *sessionComponent) viewSetup() string {
	t := c.app.Theme
	if c.setup == nil {
		c.setup = &sessionSetupState{}
	}
	s := c.setup
	w := minInt(maxInt(76, c.app.modals.modalWidth()), 104)
	contentW := modalBodyContentWidth(w)
	rows := []string{}
	if s.loading {
		rows = append(rows, t.HintLabel.Render("loading workflows…"))
	} else {
		if s.errText != "" {
			rows = append(rows, lipgloss.NewStyle().Foreground(t.Warning).Render(s.errText), "")
		}
		blueprintRows, blueprintList := c.renderSetupBlueprints(contentW)
		packRows, packList := c.renderSetupPacks(contentW)
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
					_, cmd := app.session.setupPrimaryAction()
					return cmd
				},
			},
			{
				id:    "session-setup:cancel",
				label: "cancel",
				action: func(app *App) tea.Cmd {
					app.session.closeSetup()
					return nil
				},
			},
		}
		actionRow := len(rows)
		actionText, actionCol := c.app.modals.renderCenteredModalButtons(contentW, actionButtons, -1)
		rows = append(rows, actionText)
		rows = append(rows, "")
		rows = append(rows, t.HintLabel.Italic(true).Render("↑/↓ choose · ←/→ switch section · f future default · Enter apply · Esc close"))

		title := "New Session"
		if s.defaultsOnly {
			title = "Session Defaults"
		}
		buttons := []menuButton{closeMenuButton("session-setup:close", func(app *App) { app.session.closeSetup() })}
		rendered := c.app.modals.renderModalFrameWithLayout(modalFrameOptions{
			width:   w,
			title:   title,
			buttons: buttons,
			body:    padModalBody(lipgloss.JoinVertical(lipgloss.Left, rows...), minInt(18, maxInt(12, len(rows)))),
			footer:  t.HintLabel.Render("Ctrl+B opens session defaults"),
		})
		c.app.interaction.registerModalListRegion(rendered.modal, rendered.bodyRow+sectionStart+blueprintStart, 0, sectionW, blueprintList, "session-setup:blueprints:wheel", func(app *App, button tea.MouseButton) tea.Cmd {
			app.session.setup = app.session.ensureSetup()
			app.session.setup.row = 0
			app.session.setup.blueprintSel = moveSelectionByWheel(app.session.setup.blueprintSel, len(app.session.setup.blueprints)+1, button)
			return nil
		})
		c.app.interaction.registerModalListRegion(rendered.modal, rendered.bodyRow+sectionStart+packStart, packCol, sectionW, packList, "session-setup:packs:wheel", func(app *App, button tea.MouseButton) tea.Cmd {
			app.session.setup = app.session.ensureSetup()
			app.session.setup.row = 1
			app.session.setup.packSel = moveSelectionByWheel(app.session.setup.packSel, len(app.session.setup.packs)+1, button)
			return nil
		})
		if !s.defaultsOnly {
			futureRow := rendered.bodyRow + sectionStart + len(sectionRows) + 1
			c.app.interaction.registerModalContentHit(rendered.modal, "session-setup:future-default", futureRow, 0, contentW, 1, func(app *App) tea.Cmd {
				if app.session.setup != nil {
					app.session.setup.saveDefault = !app.session.setup.saveDefault
				}
				return nil
			})
		}
		c.app.interaction.registerModalButtons(rendered.modal, rendered.bodyRow+actionRow, actionCol, actionButtons)
		return rendered.modal
	}
	title := "New Session"
	if s.defaultsOnly {
		title = "Session Defaults"
	}
	buttons := []menuButton{closeMenuButton("session-setup:close", func(app *App) { app.session.closeSetup() })}
	rendered := c.app.modals.renderModalFrameWithLayout(modalFrameOptions{
		width:   w,
		title:   title,
		buttons: buttons,
		body:    padModalBody(lipgloss.JoinVertical(lipgloss.Left, rows...), minInt(12, maxInt(6, len(rows)))),
		footer:  t.HintLabel.Render("Ctrl+B opens this picker"),
	})
	return rendered.modal
}

func (c *sessionComponent) ensureSetup() *sessionSetupState {
	if c.setup == nil {
		c.setup = &sessionSetupState{}
	}
	return c.setup
}
