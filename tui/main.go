// Command gact is the GACT TUI client.
//
// Subcommands:
//
//	gact                       run the interactive TUI (default)
//	gact export <session_id>   write a session export blob to stdout/file
//	gact import <file|-stdin>  upload a session export blob to the backend
//
// Configuration precedence (lowest → highest): built-in defaults, on-disk
// config file (JSON; see internal/config), env vars (GACT_BACKEND,
// GACT_THEME), CLI flags.
package main

import (
	"os"

	"github.com/JaimeCernuda/gact-tui/tui/internal/cli"
)

func main() {
	// The CLI subcommands (internal/cli) can hand off to the interactive TUI
	// (attach/replay/agent); inject runTUI so cli does not import package main.
	cli.RunTUI = runTUI
	if cli.Dispatch(os.Args[1:]) {
		return
	}
	runTUI()
}
