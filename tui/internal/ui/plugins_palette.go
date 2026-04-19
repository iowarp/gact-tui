// MMM8b: plugin command wiring for the slash palette. Plugin
// manifests discovered by internal/plugins are flattened into
// pluginCommand tuples on App and merged into paletteMatches. Pressing
// Enter on a plugin command execs its binary in the background.
package ui

import (
	"context"
	"os/exec"
	"strings"
	"time"

	tea "charm.land/bubbletea/v2"
)

// pluginCommand is the flattened (plugin × command) tuple App caches
// for fast palette merge + dispatch.
type pluginCommand struct {
	ID          string
	Title       string
	Description string
	Command     string
	Args        []string
	SourceDir   string
}

// pluginsLoaded mirrors plugins.Plugin so this package doesn't import
// internal/plugins directly (keeps the dependency one-way: main
// orchestrates, ui receives plain data).
type PluginsLoaded struct {
	Name      string
	SourceDir string
	Commands  []PluginsCommand
}

// pluginsCommand mirrors plugins.Command for the same reason.
type PluginsCommand struct {
	ID          string
	Title       string
	Description string
	Command     string
	Args        []string
}

// SetPlugins flattens the discovered plugins into pluginCommand
// tuples. Call from main after internal/plugins.Load().
func (a *App) SetPlugins(loaded []PluginsLoaded) {
	a.plugins = a.plugins[:0]
	for _, p := range loaded {
		for _, c := range p.Commands {
			a.plugins = append(a.plugins, pluginCommand{
				ID:          c.ID,
				Title:       c.Title,
				Description: c.Description,
				Command:     c.Command,
				Args:        c.Args,
				SourceDir:   p.SourceDir,
			})
		}
	}
}

// findPluginCommand returns the plugin command matching id, or nil.
func (a *App) findPluginCommand(id string) *pluginCommand {
	for i := range a.plugins {
		if a.plugins[i].ID == id {
			return &a.plugins[i]
		}
	}
	return nil
}

// runPluginCmd execs the plugin binary in the background. Stdout and
// stderr are captured into a transient hint surfaced to the user. The
// session id (if any) and backend URL leak through as env vars so
// plugin scripts can talk back to the same backend.
func runPluginCmd(pc pluginCommand, sessionID, backendURL string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		cmd := exec.CommandContext(ctx, pc.Command, pc.Args...)
		env := []string{
			"GACT_SESSION_ID=" + sessionID,
			"GACT_BACKEND=" + backendURL,
			"GACT_PLUGIN_DIR=" + pc.SourceDir,
		}
		cmd.Env = append(cmd.Env, env...)
		out, err := cmd.CombinedOutput()
		if err != nil {
			return pluginExecMsg{ID: pc.ID, Output: strings.TrimSpace(string(out)), Err: err}
		}
		return pluginExecMsg{ID: pc.ID, Output: strings.TrimSpace(string(out))}
	}
}

// pluginExecMsg carries the result of a plugin exec back to the
// Update loop, where it lands as a transient hint.
type pluginExecMsg struct {
	ID     string
	Output string
	Err    error
}
