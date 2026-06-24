package main

import (
	"github.com/JaimeCernuda/gact-tui/tui/internal/plugins"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui"
)

func wireDiscoveredPlugins(app *ui.App) {
	pluginsDir, err := plugins.DefaultDir()
	if err != nil {
		return
	}
	loaded, _, err := plugins.LoadVerbose(pluginsDir)
	if err != nil {
		return
	}
	converted := make([]ui.PluginsLoaded, 0, len(loaded))
	for _, p := range loaded {
		cmds := make([]ui.PluginsCommand, 0, len(p.Commands))
		for _, c := range p.Commands {
			cmds = append(cmds, ui.PluginsCommand{
				ID:          c.ID,
				Title:       c.Title,
				Description: c.Description,
				Command:     c.Command,
				Args:        c.Args,
			})
		}
		converted = append(converted, ui.PluginsLoaded{
			Name:      p.Name,
			SourceDir: p.SourceDir,
			Commands:  cmds,
		})
	}
	app.SetPlugins(converted)
}
