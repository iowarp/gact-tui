package main

import (
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"github.com/JaimeCernuda/gact-tui/tui/internal/config"
)

// OOOOOOOOO1: local agent process manager. `gact agent deploy` spawns
// an adapter binary detached on a free port, records (name, kind, pid,
// port) in ~/.config/gact/agents.json; `gact connect <name>` reads the
// entry, sets GACT_BACKEND, and runs the TUI.
func runAgent(args []string) int {
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, "usage: gact agent show|deploy|list|stop|rm|connect …")
		return 2
	}
	verb, rest := args[0], args[1:]
	switch verb {
	case "show":
		// Backend-side agent metadata lookup — pre-OOOOOOOOO1 behaviour.
		return runAgentShow(rest)
	case "deploy":
		return runAgentDeploy(rest)
	case "list", "ls":
		return runAgentList(rest)
	case "stop":
		return runAgentStop(rest)
	case "rm", "remove", "delete":
		return runAgentRm(rest)
	case "connect":
		return runAgentConnect(rest)
	}
	fmt.Fprintf(os.Stderr, "gact agent: unknown verb %q (want show|deploy|list|stop|rm|connect)\n", verb)
	return 2
}

// runAgentDeploy: `gact agent deploy <kind> <name> [--bin PATH] [--port N] [--cwd DIR]`
func runAgentDeploy(args []string) int {
	fs := flag.NewFlagSet("agent deploy", flag.ContinueOnError)
	binOverride := fs.String("bin", "", "adapter binary path (default: resolve per kind)")
	portOverride := fs.Int("port", 0, "TCP port to bind (default: kernel-picked)")
	cwdFlag := fs.String("cwd", "", "working dir passed to the adapter (default: $PWD)")
	hostFlag := fs.String("host", "127.0.0.1", "bind interface")
	startupTimeout := fs.Duration("startup-timeout", 0, "wait this long for /v1/capabilities (default: 60s for external adapters, 3s for built-ins)")
	if err := fs.Parse(reorderFlagsFirst(args, map[string]bool{
		"--bin": true, "-bin": true,
		"--port": true, "-port": true,
		"--cwd": true, "-cwd": true,
		"--host": true, "-host": true,
		"--startup-timeout": true, "-startup-timeout": true,
	})); err != nil {
		return 2
	}
	if fs.NArg() != 2 {
		fmt.Fprintln(os.Stderr, "usage: gact agent deploy <kind> <name> [--bin PATH] [--port N] [--cwd DIR] [--startup-timeout DUR]")
		return 2
	}
	kind, name := fs.Arg(0), fs.Arg(1)
	if *startupTimeout < 0 {
		fmt.Fprintln(os.Stderr, "gact agent deploy: --startup-timeout must be non-negative")
		return 2
	}

	spec := adapterSpecFor(kind)
	bin := *binOverride
	if bin == "" {
		b, err := resolveAdapterBin(spec)
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact agent deploy: %v\n", err)
			return 1
		}
		bin = b
	}
	if _, err := os.Stat(bin); err != nil {
		fmt.Fprintf(os.Stderr, "gact agent deploy: adapter binary %q: %v\n", bin, err)
		return 1
	}

	port := *portOverride
	if port == 0 {
		p, err := freePort()
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact agent deploy: pick free port: %v\n", err)
			return 1
		}
		port = p
	}

	cwd := *cwdFlag
	if cwd == "" {
		var err error
		cwd, err = os.Getwd()
		if err != nil {
			fmt.Fprintf(os.Stderr, "gact agent deploy: %v\n", err)
			return 1
		}
	}

	// Spawn detached. Stdin → /dev/null. Stdout/stderr go to a
	// per-deploy log file under $XDG_CONFIG_HOME/gact/logs/ so a
	// crashed adapter leaves a forensic trail instead of vanishing
	// into the void. Path is stamped on the AgentRecord and printed
	// to the user; falls back to /dev/null if the logs dir can't be
	// created (rare — read-only home, etc.).
	null, _ := os.Open(os.DevNull)
	defer null.Close()
	var spawnOut *os.File
	logPath := ""
	{
		agentsCfgPath, perr := config.AgentsPath()
		if perr == nil {
			logsDir := filepath.Join(filepath.Dir(agentsCfgPath), "logs")
			if mkErr := os.MkdirAll(logsDir, 0o755); mkErr == nil {
				stamp := time.Now().UTC().Format("20060102-150405")
				logPath = filepath.Join(logsDir, fmt.Sprintf("%s-%s.log", name, stamp))
				if f, openErr := os.OpenFile(
					logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644,
				); openErr == nil {
					spawnOut = f
					_, _ = fmt.Fprintf(spawnOut,
						"=== %s deploy %s pid=? bin=%s ===\n",
						stamp, name, bin)
				}
			}
		}
	}
	if spawnOut == nil {
		spawnOut, _ = os.OpenFile(os.DevNull, os.O_WRONLY, 0)
		logPath = ""
	}

	// Per-adapter spawn arg shape. In-repo Go adapters accept a per-deploy
	// --cwd; an external adapter only gets it when it opts in via
	// GACT_ADAPTER_CWD=1 (many model their file policy out-of-band instead).
	spawnArgs := []string{"--host", *hostFlag, "--port", fmt.Sprintf("%d", port)}
	if spec.supportsCwd {
		spawnArgs = append(spawnArgs, "--cwd", cwd)
	}
	cmdBin := bin
	cmdArgs := spawnArgs
	// Python adapters whose console script isn't reliably executable launch via
	// the venv python + the agent-configured module (GACT_ADAPTER_PYTHON_MODULE).
	if py, pyArgs, ok := pythonEntrypoint(bin, spec.pythonModule); ok {
		cmdBin = py
		cmdArgs = append(pyArgs, spawnArgs...)
	}
	cmd := exec.Command(cmdBin, cmdArgs...)
	cmd.Stdout = spawnOut
	cmd.Stderr = spawnOut
	cmd.Stdin = null
	// Detach: new session so Ctrl+C on the parent doesn't kill
	// the adapter.
	cmd.SysProcAttr = detachedSysProcAttr()
	if err := cmd.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "gact agent deploy: start: %v\n", err)
		return 1
	}

	// Wait for the adapter to start listening. CLIO's Python import path can
	// exceed 20s on cold Windows starts before uvicorn binds the port, even
	// though agent construction is deferred after /v1/capabilities. Keep this
	// startup-readiness budget separate from per-message turn watchdogs: a
	// deployment that never binds is an operational start failure, not an
	// agent response timeout.
	probeBudget := *startupTimeout
	if probeBudget == 0 {
		probeBudget = defaultAgentDeployStartupTimeout(kind)
	}
	deadline := time.Now().Add(probeBudget)
	alive := false
	for time.Now().Before(deadline) {
		if probeAgentAlive(*hostFlag, port) {
			alive = true
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	if !alive {
		_ = cmd.Process.Kill()
		fmt.Fprintf(os.Stderr, "gact agent deploy: adapter started but never answered %s:%d/v1/capabilities within %s; killed pid %d",
			*hostFlag, port, probeBudget, cmd.Process.Pid)
		if logPath != "" {
			fmt.Fprintf(os.Stderr, " (logs: %s)", logPath)
		}
		fmt.Fprintln(os.Stderr)
		return 1
	}

	// Register.
	path, err := config.AgentsPath()
	if err != nil {
		fmt.Fprintf(os.Stderr, "gact agent deploy: %v\n", err)
		return 1
	}
	rec := config.AgentRecord{
		Name: name, Kind: kind, Bin: bin,
		Host: *hostFlag, Port: port, PID: cmd.Process.Pid,
		Cwd: cwd, StartedAt: time.Now().UTC(),
		LogPath: logPath,
	}
	if _, err := config.UpsertAgent(path, rec); err != nil {
		fmt.Fprintf(os.Stderr, "gact agent deploy: register: %v\n", err)
		return 1
	}
	// Release the process so it outlives us.
	_ = cmd.Process.Release()
	fmt.Fprintf(os.Stderr, "deployed %s (kind=%s) pid=%d at http://%s:%d\n",
		name, kind, rec.PID, rec.Host, rec.Port)
	if logPath != "" {
		fmt.Fprintf(os.Stderr, "logs: %s\n", logPath)
	}
	fmt.Fprintf(os.Stderr, "connect with: gact connect %s\n", name)
	return 0
}
