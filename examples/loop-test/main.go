package main

import (
	"log"
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
)

type model struct{}

func (m model) Init() tea.Cmd { return nil }

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	if k, ok := msg.(tea.KeyPressMsg); ok {
		switch k.String() {
		case "q", "ctrl+c":
			return m, tea.Quit
		}
	}
	return m, nil
}

func (m model) View() tea.View {
	title := lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color("#FAFAFA")).
		Background(lipgloss.Color("#7D56F4")).
		Padding(0, 1).
		Render("Loop Closure Test")

	purple := lipgloss.NewStyle().
		Foreground(lipgloss.Color("#B478FF")).
		Render("purple line — alignment check →")

	green := lipgloss.NewStyle().
		Foreground(lipgloss.Color("#73F59F")).
		Render("green line — color check")

	divider := lipgloss.NewStyle().
		Foreground(lipgloss.Color("#666666")).
		Render(strings.Repeat("─", 32))

	hint := lipgloss.NewStyle().
		Foreground(lipgloss.Color("#888888")).
		Italic(true).
		Render("press q to quit")

	content := lipgloss.JoinVertical(lipgloss.Left,
		title, "",
		purple,
		green,
		divider,
		hint,
	)

	box := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("#7D56F4")).
		Padding(1, 2).
		Render(content)

	return tea.NewView(box)
}

func main() {
	p := tea.NewProgram(model{})
	if _, err := p.Run(); err != nil {
		log.Fatal(err)
	}
}
