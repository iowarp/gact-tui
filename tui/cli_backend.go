package main

import (
	"fmt"
	"os"

	"github.com/JaimeCernuda/gact-tui/tui/internal/config"
)

// resolveCLIBackend resolves the backend URL for a CLI subcommand with the
// same precedence as the interactive TUI (tui_runtime.go): defaults <
// config-file backend_url < GACT_BACKEND env var < --backend flag.
//
// flagVal is the parsed --backend flag value (subcommands default it to
// defaultBackend, which config.Resolve treats as "not explicitly set").
//
// A config file that exists but cannot be read/parsed degrades to
// env/flag/default resolution; that path is surfaced with a structured
// warning (reason=config_load_error) rather than silently ignored.
func resolveCLIBackend(flagVal string) string {
	cfg, cfgPath, err := config.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr,
			"gact: warning — backend resolution ignoring config file (reason=config_load_error path=%s): %v\n",
			cfgPath, err)
	}
	return config.Resolve(cfg.BackendURL, os.Getenv("GACT_BACKEND"), flagVal, defaultBackend)
}
