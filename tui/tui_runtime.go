package main

import (
	"flag"
	"fmt"
	"log"
	"os"

	tea "charm.land/bubbletea/v2"

	"github.com/JaimeCernuda/gact-tui/tui/internal/config"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui"
)

func runTUI() {
	cfg, cfgPath, cfgErr := config.Load()
	if cfgErr != nil {
		fmt.Fprintf(os.Stderr, "gact: warning — failed to read %s: %v\n", cfgPath, cfgErr)
	}

	backend := flag.String("backend", defaultBackend,
		"GACT backend URL (env: GACT_BACKEND, config: backend_url)")
	workspace := flag.String("workspace", "",
		"startup workspace id, exact name, or root path (env: GACT_WORKSPACE, config: workspace)")
	theme := flag.String("theme", defaultTheme,
		"colour theme (env: GACT_THEME, config: theme) — use --list-themes to see options")
	voiceCmd := flag.String("voice-cmd", "",
		"shell cmd that writes audio/wav to stdout (env: GACT_VOICE_CMD, config: voice_command)")
	listThemes := flag.Bool("list-themes", false,
		"print available theme names (for --theme) and exit")
	noIntro := flag.Bool("no-intro", false,
		"skip the JJJ1 splash screen (also: intro_skip in config)")
	introFile := flag.String("intro-file", "",
		"path to ASCII splash file (logo block, blank line, name block); env GACT_INTRO_FILE; config intro_file")
	flag.Parse()

	if *listThemes {
		fmt.Println("Available themes:")
		for _, m := range ui.AllThemeModes {
			fmt.Printf("  %s\n", ui.ThemeModeName(m))
		}
		return
	}

	finalBackend := config.Resolve(cfg.BackendURL, os.Getenv("GACT_BACKEND"), *backend, defaultBackend)
	finalWorkspace := config.Resolve(cfg.Workspace, os.Getenv("GACT_WORKSPACE"), *workspace, "")
	finalTheme := config.Resolve(cfg.Theme, os.Getenv("GACT_THEME"), *theme, defaultTheme)

	// Load a user-supplied custom theme if present at ~/.config/gact/theme.json.
	// Failures are non-fatal: the TUI still boots with the resolved theme.
	if themePath, err := ui.CustomThemeDefaultPath(); err == nil {
		if name, err := ui.LoadCustomTheme(themePath); err != nil {
			fmt.Fprintf(os.Stderr, "gact: warning — failed to load %s: %v\n", themePath, err)
		} else if name != "" {
			log.Printf("custom theme loaded: %s (from %s)", name, themePath)
		}
	}
	finalVoice := config.Resolve(cfg.VoiceCommand, os.Getenv("GACT_VOICE_CMD"), *voiceCmd, "")

	app := ui.NewWithTheme(finalBackend, ui.ThemeForMode(ui.ParseThemeMode(finalTheme)))
	app.SetInitialWorkspace(finalWorkspace)
	finalLocale := config.Resolve(cfg.Locale, os.Getenv("GACT_LOCALE"), "", "en")
	app.SetLocale(finalLocale)
	if finalBrand := config.Resolve(cfg.Name, os.Getenv("GACT_BRAND_NAME"), "", ""); finalBrand != "" {
		app.SetBrandName(finalBrand)
	}
	app.BackendLabel = os.Getenv("GACT_BACKEND_LABEL")
	app.VoiceCommand = finalVoice
	seedDetachedRegistry(app, finalBackend)
	applyStartupPreferences(app, cfg, *noIntro, *introFile)
	if attach := os.Getenv("GACT_ATTACH_SESSION_ID"); attach != "" {
		app.AttachSessionID = attach
	}
	wireDiscoveredPlugins(app)
	wireConfigCallbacks(app, finalBackend, backend, theme, voiceCmd)
	p := tea.NewProgram(app)
	if _, err := p.Run(); err != nil {
		fmt.Fprintln(os.Stderr, "gact:", err)
		log.Fatal(err)
	}
	if reportPath := os.Getenv("GACT_TUI_LATENCY_REPORT"); reportPath != "" {
		if err := app.WriteTUIInteractionLatencyReport(reportPath); err != nil {
			fmt.Fprintf(os.Stderr, "gact: warning — failed to write TUI latency report %s: %v\n", reportPath, err)
		}
	}
	recordDetachedSession(app, finalBackend)
}
