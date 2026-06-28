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
)

const (
	defaultBackend = "http://localhost:7777"
	defaultTheme   = "dark"
)

func main() {
	if dispatchCLI(os.Args[1:]) {
		return
	}
	runTUI()
}
