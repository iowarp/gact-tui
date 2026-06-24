package ui

// app_update_input_dispatch.go dispatches input/composer-related messages to the input-composer component.

import tea "charm.land/bubbletea/v2"

func (c *inputComposerComponent) dispatch(msg tea.Msg) (tea.Model, tea.Cmd, bool) {
	a := c.app
	switch m := msg.(type) {
	case tea.WindowSizeMsg:
		model, cmd := a.chrome.handleWindowSize(m)
		return model, cmd, true
	case tea.KeyPressMsg:
		model, cmd := a.handleKey(m)
		return model, cmd, true
	case tea.MouseWheelMsg:
		model, cmd := a.interaction.handleMouseWheel(m)
		return model, cmd, true
	case tea.MouseClickMsg:
		model, cmd := a.interaction.handleMouseClick(m)
		return model, cmd, true
	case tea.MouseMotionMsg:
		model, cmd := a.interaction.handleMouseMotion(m)
		return model, cmd, true
	case tea.MouseReleaseMsg:
		model, cmd := a.interaction.handleMouseRelease(m)
		return model, cmd, true
	case introTickMsg:
		model, cmd := a.ticker.handleIntroTick(m)
		return model, cmd, true
	case tea.PasteStartMsg:
		model, cmd := c.handlePasteStart(m)
		return model, cmd, true
	case tea.PasteEndMsg:
		model, cmd := c.handlePasteEnd(m)
		return model, cmd, true
	case tea.PasteMsg:
		model, cmd := c.handlePaste(m)
		return model, cmd, true
	default:
		return a, nil, false
	}
}
