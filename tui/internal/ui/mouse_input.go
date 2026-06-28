package ui

// mouse_input.go registers input-composer mouse hit regions and renders the mouse command chip.

import (
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"
)

func (c *inputComposerComponent) commandChipPlain() string {
	chip := lipgloss.NewStyle().
		Foreground(c.app.Theme.Bg).
		Background(c.app.Theme.Primary).
		Bold(true).
		Padding(0, 1).
		Render("/")
	return ansi.Strip(chip) + " "
}

func (c *inputComposerComponent) commandChipWidth() int {
	return lipgloss.Width(c.commandChipPlain())
}

func (c *inputComposerComponent) renderMouseCommand(inputView string) string {
	lines := strings.Split(inputView, "\n")
	if len(lines) == 0 {
		return inputView
	}
	chip := lipgloss.NewStyle().
		Foreground(c.app.Theme.Bg).
		Background(c.app.Theme.Primary).
		Bold(true).
		Padding(0, 1).
		Render("/")
	prefix := chip + " "
	indent := strings.Repeat(" ", lipgloss.Width(prefix))
	for i := range lines {
		if i == 0 {
			lines[i] = prefix + lines[i]
			continue
		}
		lines[i] = indent + lines[i]
	}
	return strings.Join(lines, "\n")
}

func (c *inputComposerComponent) registerCommandHit(conversationHeight int, hintHeight int) {
	a := c.app
	if !a.MouseEnabled || a.interaction.hits == nil {
		return
	}
	plain := c.commandChipPlain()
	a.interaction.registerScreenHit("input:command", mouseRect{
		x: a.conversation.paneOffsetX() + 2,
		y: 1 + conversationHeight + hintHeight + 1,
		w: lipgloss.Width(plain),
		h: 1,
	}, func(app *App) tea.Cmd {
		app.focus = FocusInput
		app.cmdPalette.openModal()
		return nil
	})
}

func (c *inputComposerComponent) registerFocusSurface(conversationHeight int, hintHeight int, inputHeight int, bodyWidth int) {
	a := c.app
	if !a.MouseEnabled || a.interaction.hits == nil || inputHeight <= 0 || bodyWidth <= 0 {
		return
	}
	a.interaction.registerFocusSurfaceHit("input:focus", c.focusSurfaceRect(conversationHeight, hintHeight, inputHeight, bodyWidth), FocusInput, func(app *App) {
		app.inputComposer.input.Focus()
	})
}

func (c *inputComposerComponent) focusSurfaceRect(conversationHeight int, hintHeight int, inputHeight int, bodyWidth int) mouseRect {
	return mouseRect{
		x: c.app.conversation.paneOffsetX(),
		y: 1 + conversationHeight,
		w: renderedPaneOuterWidth(bodyWidth),
		h: hintHeight + inputHeight,
	}
}

func (c *inputComposerComponent) registerTextareaCursorHits(conversationHeight int, hintHeight int) {
	a := c.app
	if !a.MouseEnabled || a.interaction.hits == nil {
		return
	}
	startX := a.conversation.paneOffsetX() + 2 + c.commandChipWidth() + 2
	startY := 1 + conversationHeight + hintHeight + 1
	a.interaction.registerScreenTextareaRegion("input", startX, startY, c.input.Value(), func(app *App, lineIdx int, col int) {
		app.focus = FocusInput
		app.inputComposer.input.Focus()
		setTextareaCursor(&app.inputComposer.input, lineIdx, col)
	})
	c.registerPastePlaceholderHits(startX, startY)
}

func (c *inputComposerComponent) registerPastePlaceholderHits(startX int, startY int) {
	if len(c.pastes) == 0 {
		return
	}
	lines := splitTextareaValue(c.input.Value())
	for pasteIdx, paste := range c.pastes {
		placeholder := strings.TrimSpace(paste.placeholder)
		if placeholder == "" {
			continue
		}
		for lineIdx, line := range lines {
			col := strings.Index(line, placeholder)
			if col < 0 {
				continue
			}
			pasteIdx := pasteIdx
			lineIdx := lineIdx
			hitCol := col
			c.app.interaction.registerScreenTextSpanHit("input:paste:"+itoa2(pasteIdx), startX, startY+lineIdx, line, hitCol, placeholder, func(app *App) tea.Cmd {
				app.focus = FocusInput
				app.inputComposer.input.Focus()
				setTextareaCursor(&app.inputComposer.input, lineIdx, hitCol)
				app.inputComposer.expandSegment(pasteIdx)
				return nil
			})
			break
		}
	}
}
