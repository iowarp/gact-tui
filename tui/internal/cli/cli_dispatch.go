package cli

import (
	"fmt"
	"os"
	"strings"
)

// RunTUI hands control to the interactive TUI. It is injected by package main
// (which owns runTUI) so the cli package does not depend on the main package —
// a few subcommands (attach/replay/agent) set up state and then hand off to the
// TUI via this hook.
var RunTUI = func() {}

// Dispatch routes a gact subcommand invocation using the single command table
// (see commands.go). It returns true when a CLI subcommand handled the args
// (the caller should exit); false means no subcommand matched and the
// interactive TUI should run.
//
// Command matching (including the flag-form aliases --version/--diag/
// --emit-config/--help) happens before the leading-dash check, so `gact -v`
// resolves to the version command while `gact --backend URL` falls through to
// the interactive TUI.
func Dispatch(args []string) bool {
	if len(args) > 0 {
		if spec := lookupCommand(args[0]); spec != nil {
			rest := args[1:]
			if spec.HandsOff {
				// Prints-and-returns or hands off to the TUI; never os.Exit so
				// the process can continue into runTUI when the command asks.
				spec.Run(rest)
				return true
			}
			os.Exit(spec.Run(rest))
		}
	}

	// No command matched. Leading flags (or no args) belong to the default
	// interactive TUI path, e.g. `gact --backend URL`.
	if len(args) == 0 || strings.HasPrefix(args[0], "-") {
		return false
	}

	fmt.Fprintf(os.Stderr, "gact: unknown command %q\n\n", args[0])
	printUsage()
	os.Exit(2)
	return true
}
