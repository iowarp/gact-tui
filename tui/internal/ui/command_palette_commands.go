package ui

// command_palette_commands.go loads palette commands and runs command/message-search backend commands.

import (
	"context"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
	"github.com/JaimeCernuda/gact-tui/tui/internal/client"
)

type commandsLoadedMsg struct {
	sessionID   string
	workspaceID string
	commands    []gact.Command
	err         error
}

func loadCommandsCmd(c *client.Client, scope client.RuntimeScope) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		commands, err := c.ListCommandsScoped(ctx, client.CommandFilter{RuntimeScope: scope})
		return commandsLoadedMsg{sessionID: scope.SessionID, workspaceID: scope.WorkspaceID, commands: commands, err: err}
	}
}

// loadCommands installs the slash-command set fetched during connect. It is
// the palette-domain counterpart to handleCommandsLoaded for the initial
// snapshot, keeping the coordinator out of the palette's backing state.
func (c *commandPaletteComponent) loadCommands(commands []gact.Command) {
	c.commands = commands
}

func (c *commandPaletteComponent) handleCommandsLoaded(m commandsLoadedMsg) (tea.Model, tea.Cmd) {
	if m.err != nil {
		return c.app, nil
	}
	if m.sessionID != "" && m.sessionID != c.app.session.currentID() {
		return c.app, nil
	}
	if m.workspaceID != "" && m.workspaceID != c.app.session.wsID {
		return c.app, nil
	}
	c.commands = m.commands
	return c.app, nil
}

func runCommandCmd(c *client.Client, sessionID, cmdID string) tea.Cmd {
	return func() tea.Msg {
		if sessionID == "" {
			return nil
		}
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := c.RunCommand(ctx, sessionID, cmdID); err != nil {
			if cmdID == "/cancel" {
				return errMsg{err: err, stage: "cancel-session"}
			}
			return errMsg{err: err, stage: "command"}
		}
		return nil
	}
}

// searchMessagesCmd POSTs to /v1/sessions/{id}/messages/search and
// returns a searchResultsMsg with the hits (or an errMsg).
func searchMessagesCmd(c *client.Client, sessionID, query string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		matches, err := c.SearchMessages(ctx, sessionID, query)
		if err != nil {
			return errMsg{err: err, stage: "search"}
		}
		return searchResultsMsg{matches: matches}
	}
}

type searchResultsMsg struct {
	matches []client.SearchMatch
}

func (c *commandPaletteComponent) handleSearchResults(m searchResultsMsg) (tea.Model, tea.Cmd) {
	c.searching = false
	c.searchMatches = m.matches
	c.paletteSel = 0
	return c.app, nil
}
