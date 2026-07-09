package cli

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/JaimeCernuda/gact-tui/tui/internal/config"
)

// runAgentList prints the registry. Pretty format includes a probe
// of each entry for an "alive" column.
func runAgentList(args []string) int {
	fs := flag.NewFlagSet("agent list", flag.ContinueOnError)
	format := fs.String("format", "pretty", "pretty | tsv | json")
	if err := fs.Parse(reorderFlagsFirst(args, map[string]bool{
		"--format": true, "-format": true,
	})); err != nil {
		return 2
	}
	switch *format {
	case "pretty", "tsv", "json":
	default:
		fmt.Fprintf(os.Stderr, "gact agent list: unknown format %q\n", *format)
		return 2
	}
	path, err := config.AgentsPath()
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact agent list: %v\n", err)
		return 1
	}
	reg, err := config.LoadAgents(path)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact agent list: %v\n", err)
		return 1
	}
	if *format == "json" {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		if reg.Agents == nil {
			reg.Agents = []config.AgentRecord{}
		}
		_ = enc.Encode(reg)
		return 0
	}
	if len(reg.Agents) == 0 && *format == "pretty" {
		fmt.Println("(no agents deployed — `gact agent deploy <kind> <name>` to start one)")
		return 0
	}
	if *format == "tsv" {
		fmt.Println("name\tkind\thost\tport\tpid\talive\tstarted_at\tcwd")
		for _, a := range reg.Agents {
			alive := "no"
			if probeAgentAlive(a.Host, a.Port) {
				alive = "yes"
			}
			fmt.Printf("%s\t%s\t%s\t%d\t%d\t%s\t%s\t%s\n",
				a.Name, a.Kind, a.Host, a.Port, a.PID, alive,
				formatAgentStartedAt(a.StartedAt), a.Cwd)
		}
		return 0
	}
	// pretty
	fmt.Printf("%-20s  %-12s  %-22s  %-6s  %-5s  %-16s  %s\n",
		"NAME", "KIND", "HOST:PORT", "PID", "ALIVE", "STARTED", "CWD")
	for _, a := range reg.Agents {
		aliveText := colorize("no", ansiRed)
		if probeAgentAlive(a.Host, a.Port) {
			aliveText = colorize("yes", ansiGreen)
		}
		fmt.Printf("%-20s  %-12s  %-22s  %-6d  %-5s  %-16s  %s\n",
			truncMid(a.Name, 20), truncMid(a.Kind, 12),
			fmt.Sprintf("%s:%d", a.Host, a.Port), a.PID, aliveText,
			formatAgentStartedAt(a.StartedAt), truncMid(a.Cwd, 60))
	}
	return 0
}

func formatAgentStartedAt(startedAt time.Time) string {
	if startedAt.IsZero() {
		return "unknown"
	}
	return startedAt.Local().Format("2006-01-02 15:04")
}

// runAgentStop stops the pid and keeps the registry entry (user may
// want to redeploy). `agent rm` is the hard drop.
func runAgentStop(args []string) int {
	if len(args) != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact agent stop <name>")
		return 2
	}
	name := args[0]
	path, err := config.AgentsPath()
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact agent stop: %v\n", err)
		return 1
	}
	rec, ok, err := config.FindAgent(path, name)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact agent stop: %v\n", err)
		return 1
	}
	if !ok {
		fmt.Fprintf(os.Stderr, "gact agent stop: no agent named %q\n", name)
		return 1
	}
	if rec.PID <= 0 {
		fmt.Fprintf(os.Stderr, "gact agent stop: %q has no pid recorded\n", name)
		return 1
	}
	proc, err := os.FindProcess(rec.PID)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact agent stop: find pid %d: %v\n", rec.PID, err)
		return 1
	}
	if err := stopAgentProcess(proc); err != nil {
		// ESRCH = not running; treat as already-stopped, not an error.
		if !errors.Is(err, os.ErrProcessDone) && err.Error() != "os: process already finished" {
			fmt.Fprintf(os.Stderr, "gact agent stop: stop pid %d: %v\n", rec.PID, err)
			return 1
		}
	}
	fmt.Fprintf(os.Stderr, "stopped %s (pid %d)\n", name, rec.PID)
	return 0
}

// runAgentRm stops (best effort) then drops the entry.
func runAgentRm(args []string) int {
	if len(args) != 1 {
		fmt.Fprintln(os.Stderr, "usage: gact agent rm <name>")
		return 2
	}
	name := args[0]
	_ = runAgentStop([]string{name}) // best-effort; ignore result
	path, err := config.AgentsPath()
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact agent rm: %v\n", err)
		return 1
	}
	removed, err := config.RemoveAgent(path, name)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact agent rm: %v\n", err)
		return 1
	}
	if !removed {
		fmt.Fprintf(os.Stderr, "no agent named %q in registry\n", name)
		return 0
	}
	fmt.Fprintf(os.Stderr, "removed %s\n", name)
	return 0
}

// runAgentConnect resolves the agent's host:port and launches the
// TUI pointed at it. Fails fast if the adapter isn't answering so
// the user doesn't land in a TUI stuck at "connecting…".
func runAgentConnect(args []string) int {
	// Split positional args from TUI passthrough flags. The agent name
	// is the only positional we own; everything else (--no-intro,
	// --backend override, etc.) gets forwarded to runTUI via os.Args.
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, "usage: gact connect <name> [--no-intro|...]  (or: gact agent connect <name>)")
		return 2
	}
	var name string
	var passthrough []string
	for _, a := range args {
		if name == "" && !strings.HasPrefix(a, "-") {
			name = a
			continue
		}
		passthrough = append(passthrough, a)
	}
	if name == "" {
		fmt.Fprintln(os.Stderr, "usage: gact connect <name> [--no-intro|...]  (or: gact agent connect <name>)")
		return 2
	}
	path, err := config.AgentsPath()
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact connect: %v\n", err)
		return 1
	}
	rec, ok, err := config.FindAgent(path, name)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact connect: %v\n", err)
		return 1
	}
	if !ok {
		fmt.Fprintf(os.Stderr, "gact connect: no agent named %q — `gact agent list` to see registered names\n", name)
		return 1
	}
	if !probeAgentAlive(rec.Host, rec.Port) {
		fmt.Fprintf(os.Stderr, "gact connect: %s not answering %s:%d — redeploy with `gact agent deploy %s %s`\n",
			name, rec.Host, rec.Port, rec.Kind, name)
		return 1
	}
	// Hand off to runTUI via the same GACT_BACKEND env trick other
	// wrappers use. Forward any TUI passthrough flags the user
	// supplied (--no-intro etc.) so `gact connect aurora-demo
	// --no-intro` works without remembering to env-export.
	backend := fmt.Sprintf("http://%s:%d", rec.Host, rec.Port)
	_ = os.Setenv("GACT_BACKEND", backend)
	_ = os.Setenv("GACT_BACKEND_LABEL", fmt.Sprintf("%s (%s)", rec.Name, rec.Kind))
	fmt.Fprintf(os.Stderr, "connecting to agent %s at %s\n", name, backend)
	os.Args = append([]string{os.Args[0]}, passthrough...)
	RunTUI()
	return 0
}
