// Command gact is the GACT TUI client.
//
// Usage:
//
//	gact [--backend URL]
package main

import (
	"flag"
	"fmt"
	"log"
	"os"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/tui/internal/ui"
)

func main() {
	backend := flag.String("backend", envDefault("GACT_BACKEND", "http://localhost:7777"),
		"GACT backend URL (env: GACT_BACKEND)")
	theme := flag.String("theme", envDefault("GACT_THEME", "dark"),
		"colour theme: dark | light (env: GACT_THEME)")
	flag.Parse()

	app := ui.NewWithTheme(*backend, ui.ThemeForMode(ui.ParseThemeMode(*theme)))
	p := tea.NewProgram(app)
	if _, err := p.Run(); err != nil {
		fmt.Fprintln(os.Stderr, "gact:", err)
		log.Fatal(err)
	}
}

func envDefault(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}
