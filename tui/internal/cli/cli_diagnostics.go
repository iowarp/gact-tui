package cli

import (
	"flag"
	"fmt"
	"os"
	"strings"

	"github.com/JaimeCernuda/gact-tui/contract/conformance"
)

// runConformance runs the contract/conformance suite against the
// configured backend and prints per-section pass/fail. Backend
// implementers can use this to verify their server matches the v0.1
// SPEC without writing test code (SSS1).
//
// Exit codes:
//
//	0 — every section passed (or was explicitly skipped)
//	1 — at least one section failed
//	2 — bad usage
func runConformance(args []string) int {
	var (
		wsID *string
		skip *string
	)
	cc, _, code := newCmdCtx("conformance", args, withFlags(func(fs *flag.FlagSet) {
		wsID = fs.String("workspace", "", "workspace id (default: first listed)")
		skip = fs.String("skip", "", "comma-separated section names to skip (Health,Capabilities,Workspaces,Sessions,CreateSession,PostMessage,SSE,Commands,Tools,Metrics)")
	}))
	if cc == nil {
		return code
	}
	opts := conformance.Options{WorkspaceID: *wsID}
	for _, s := range strings.Split(*skip, ",") {
		switch strings.TrimSpace(s) {
		case "":
		case "Health":
			opts.SkipHealth = true
		case "Capabilities":
			opts.SkipCapabilities = true
		case "Workspaces":
			opts.SkipWorkspaces = true
		case "Sessions":
			opts.SkipSessions = true
		case "CreateSession":
			opts.SkipCreateSession = true
		case "PostMessage":
			opts.SkipPostMessage = true
		case "SSE":
			opts.SkipSSE = true
		case "Commands":
			opts.SkipCommands = true
		case "Tools":
			opts.SkipTools = true
		case "Metrics":
			opts.SkipMetrics = true
		case "Hooks":
			opts.SkipHooks = true
		case "Policies":
			opts.SkipPolicies = true
		case "Tasks":
			opts.SkipTasks = true
		default:
			fmt.Fprintf(os.Stderr, "gact conformance: unknown --skip section %q\n", s)
			return 2
		}
	}

	fmt.Fprintf(os.Stderr, "gact conformance  backend=%s\n", cc.backend)
	r := conformance.NewCLIReporter(func(line string) { fmt.Println(line) })
	conformance.Run(r, cc.backend, opts)
	if failed := r.FailedSections(); len(failed) > 0 {
		fmt.Fprintf(os.Stderr, "FAIL: %d section(s)\n", len(failed))
		for _, f := range failed {
			fmt.Fprintln(os.Stderr, "  -", f)
		}
		return 1
	}
	fmt.Fprintln(os.Stderr, "PASS")
	return 0
}
