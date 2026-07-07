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

// Dispatch routes a gact subcommand invocation. It returns true when a
// CLI subcommand handled the args (the caller should exit); false means
// no subcommand matched and the interactive TUI should run.
func Dispatch(args []string) bool {
	if len(args) > 0 {
		switch args[0] {
		case "version", "--version", "-v":
			runVersion()
			return true
		case "diag", "--diag":
			runDiag()
			return true
		case "emit-config", "--emit-config":
			runEmitConfig()
			return true
		case "-h", "--help":
			printUsage()
			return true
		}
	}

	// Subcommand dispatch - preserve all flags after the subcommand for
	// the subcommand's own flag set. Leading flags belong to the
	// default interactive TUI path, e.g. `gact --backend URL`.
	if len(args) == 0 || strings.HasPrefix(args[0], "-") {
		return false
	}

	rest := args[1:]
	switch args[0] {
	case "export":
		os.Exit(runExport(rest))
	case "import":
		os.Exit(runImport(rest))
	case "list":
		os.Exit(runList(rest))
	case "tail":
		os.Exit(runTail(rest))
	case "ping":
		os.Exit(runPing(rest))
	case "send":
		os.Exit(runSend(rest))
	case "wait":
		os.Exit(runWait(rest))
	case "cancel":
		os.Exit(runCancel(rest))
	case "run":
		os.Exit(runRun(rest))
	case "log":
		os.Exit(runLog(rest))
	case "ask":
		os.Exit(runAsk(rest))
	case "new":
		os.Exit(runNew(rest))
	case "delete":
		os.Exit(runDelete(rest))
	case "rename":
		os.Exit(runRename(rest))
	case "archive":
		os.Exit(runArchive(rest, true))
	case "unarchive":
		os.Exit(runArchive(rest, false))
	case "completion":
		os.Exit(runCompletion(rest))
	case "metrics":
		os.Exit(runMetrics(rest))
	case "quick":
		os.Exit(runQuick(rest))
	case "summarize":
		os.Exit(runSummarize(rest))
	case "context":
		os.Exit(runContext(rest))
	case "catalog":
		os.Exit(runCatalog(rest))
	case "dump-bundle":
		os.Exit(runDumpBundle(rest))
	case "stream":
		os.Exit(runStream(rest))
	case "perms", "perm", "permissions":
		os.Exit(runPerms(rest))
	case "diff", "diffs":
		os.Exit(runDiff(rest))
	case "search":
		os.Exit(runSearch(rest))
	case "workspaces", "workspace", "ws":
		os.Exit(runWorkspaces(rest))
	case "fork":
		os.Exit(runFork(rest))
	case "models", "model":
		os.Exit(runModels(rest))
	case "man", "manual":
		os.Exit(runMan(rest))
	case "info":
		os.Exit(runInfo(rest))
	case "undo":
		os.Exit(runUndo(rest))
	case "rewind":
		os.Exit(runRewind(rest))
	case "files", "file":
		os.Exit(runFiles(rest))
	case "repo-map", "repomap":
		os.Exit(runRepoMap(rest))
	case "mcp":
		os.Exit(runMcp(rest))
	case "tool", "tools":
		os.Exit(runTool(rest))
	case "agent", "agents":
		os.Exit(runAgent(rest))
	case "deploy":
		os.Exit(runAgentDeploy(rest))
	case "watch":
		os.Exit(runWatch(rest))
	case "capabilities", "caps":
		os.Exit(runCapabilities(rest))
	case "tell":
		os.Exit(runTell(rest))
	case "attach":
		runAttach(rest)
		return true
	case "voice":
		os.Exit(runVoice(rest))
	case "bench":
		os.Exit(runBench(rest))
	case "conformance":
		os.Exit(runConformance(rest))
	case "dashboard", "dash":
		os.Exit(runDashboard(rest))
	case "detached":
		os.Exit(runDetached(rest))
	case "connect":
		os.Exit(runAgentConnect(rest))
	case "stop":
		os.Exit(runAgentStop(rest))
	case "rm":
		os.Exit(runAgentRm(rest))
	case "session":
		os.Exit(runSession(rest))
	case "resume":
		if len(rest) > 0 {
			fmt.Fprintln(os.Stderr, "usage: gact resume  (no args — use `gact attach <sid>` for a specific session)")
			os.Exit(2)
		}
		runAttach(nil)
		return true
	case "grep":
		os.Exit(runGrep(rest))
	case "follow":
		os.Exit(runFollow(rest))
	case "replay":
		runReplay(rest)
		return true
	case "env":
		os.Exit(runEnv(rest))
	case "theme":
		os.Exit(runTheme(rest))
	case "hooks", "hook":
		os.Exit(runHooks(rest))
	case "tasks", "task":
		os.Exit(runTasks(rest))
	case "plugins", "plugin":
		os.Exit(runPlugins(rest))
	default:
		fmt.Fprintf(os.Stderr, "gact: unknown command %q\n\n", args[0])
		printUsage()
		os.Exit(2)
	}
	return true
}
