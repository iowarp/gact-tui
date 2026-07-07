package cli

import (
	"fmt"
	"os"
)

// PPPPPPPPP1: `gact session <verb>` is an alias layer over the
// existing top-level session CRUD commands. No new behavior; just a
// discoverable namespace symmetric with `gact agent *`.
func runSession(args []string) int {
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, "usage: gact session create|list|show|connect|rename|stop|rm ...")
		return 2
	}
	verb, rest := args[0], args[1:]
	switch verb {
	case "create", "new":
		return runNew(rest)
	case "list", "ls":
		return runList(rest)
	case "show", "info":
		return runInfo(rest)
	case "connect", "attach":
		// Delegate to the same path gact attach <sid> uses.
		runAttach(rest)
		return 0
	case "rename":
		return runRename(rest)
	case "stop", "cancel":
		return runCancel(rest)
	case "rm", "remove", "delete":
		return runDelete(rest)
	case "export":
		return runExport(rest)
	}
	fmt.Fprintf(os.Stderr, "gact session: unknown verb %q (want create|list|show|connect|rename|stop|rm|export)\n", verb)
	return 2
}
