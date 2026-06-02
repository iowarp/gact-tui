// Sidecar launcher for CLIO Desktop.
//
// Tauri bundles one of these per target triple as
// `binaries/clio-agent-<triple>{.exe}` via `bundle.externalBin`. At
// runtime the Tauri shell spawns it with `--host` / `--port` /
// `--token` and waits for `READY <url>` on stdout.
//
// The launcher's job is to resolve a real `clio-agent-gact` (the GACT
// v0.2 server from iowarp/clio-agent @develop) and exec it with the
// requested bind args + bearer token. It does not fake or stub the
// server — if no real `clio-agent-gact` is reachable, it exits non-zero
// with a clear message that the Tauri shell surfaces to the user.
//
// Resolution order:
//   1. $CLIO_AGENT_GACT_BIN env var (explicit override; used by CI +
//      `pnpm tauri:dev` against the gact emulator)
//   2. `clio-agent-gact` on PATH
//   3. Per-OS install-prefix conventions matching iowarp/clio-agent's
//      install.{sh,ps1}:
//        - Windows: %LOCALAPPDATA%\clio\clio-agent\.venv\Scripts\clio-agent-gact.exe
//        - Linux:   $HOME/.local/share/clio/clio-agent/.venv/bin/clio-agent-gact
//        - macOS:   $HOME/Library/Application Support/clio/clio-agent/.venv/bin/clio-agent-gact
//   4. Repo-local develop install at
//      `D:\Libraries\Documents\projects\clio-agent\.venv\Scripts` (dev-only;
//      only honoured when GOOS == windows and the dir exists).
//
// If none resolve, the launcher emits a structured error on stderr and
// exits 2. The supervisor turns that into a Splash-screen error card.
package main

import (
	"errors"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

const (
	exitOK             = 0
	exitUsage          = 1
	exitNotFound       = 2
	exitExecFailed     = 3
	envOverride        = "CLIO_AGENT_GACT_BIN"
	envBearer          = "CLIO_AUTH_TOKEN"
	envGactContractVer = "CLIO_GACT_CONTRACT"
)

type cliArgs struct {
	host  string
	port  int
	token string
}

func parseArgs() (cliArgs, error) {
	host := flag.String("host", "127.0.0.1", "bind host")
	port := flag.Int("port", 0, "bind port (required)")
	token := flag.String("token", "", "bearer token to enforce (required)")
	flag.Parse()
	if *port == 0 {
		return cliArgs{}, errors.New("--port is required")
	}
	if *token == "" {
		return cliArgs{}, errors.New("--token is required")
	}
	return cliArgs{host: *host, port: *port, token: *token}, nil
}

// candidatePaths returns the search list for clio-agent-gact, in
// priority order.
func candidatePaths() []string {
	var paths []string

	if env := os.Getenv(envOverride); env != "" {
		paths = append(paths, env)
	}

	if p, err := exec.LookPath("clio-agent-gact"); err == nil {
		paths = append(paths, p)
	}

	home, _ := os.UserHomeDir()
	switch runtime.GOOS {
	case "windows":
		local := os.Getenv("LOCALAPPDATA")
		if local == "" && home != "" {
			local = filepath.Join(home, "AppData", "Local")
		}
		if local != "" {
			paths = append(paths,
				filepath.Join(local, "clio", "clio-agent", ".venv", "Scripts", "clio-agent-gact.exe"),
			)
		}
		// Dev-machine fallback to the repo-local clio-agent develop install.
		paths = append(paths,
			`D:\Libraries\Documents\projects\clio-agent\.venv\Scripts\clio-agent-gact.exe`,
		)
	case "darwin":
		if home != "" {
			paths = append(paths,
				filepath.Join(home, "Library", "Application Support", "clio", "clio-agent", ".venv", "bin", "clio-agent-gact"),
				filepath.Join(home, ".local", "share", "clio", "clio-agent", ".venv", "bin", "clio-agent-gact"),
			)
		}
	default:
		if home != "" {
			paths = append(paths,
				filepath.Join(home, ".local", "share", "clio", "clio-agent", ".venv", "bin", "clio-agent-gact"),
			)
		}
	}

	return paths
}

func resolve() (string, error) {
	for _, p := range candidatePaths() {
		if p == "" {
			continue
		}
		info, err := os.Stat(p)
		if err != nil {
			continue
		}
		if info.IsDir() {
			continue
		}
		return p, nil
	}
	return "", errors.New("clio-agent-gact not found")
}

func runChild(bin string, args cliArgs) int {
	cmd := exec.Command(bin,
		"--host", args.host,
		"--port", fmt.Sprintf("%d", args.port),
	)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Env = append(os.Environ(),
		envBearer+"="+args.token,
		envGactContractVer+"=0.2",
	)
	if err := cmd.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "sidecar-launcher: failed to spawn %s: %v\n", bin, err)
		return exitExecFailed
	}
	// Bridge child lifecycle to our own — when the child exits, we exit
	// with the same code. The Tauri supervisor handles SIGTERM and will
	// signal us if the user closes the window.
	if err := cmd.Wait(); err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			return exitErr.ExitCode()
		}
		fmt.Fprintf(os.Stderr, "sidecar-launcher: child wait failed: %v\n", err)
		return exitExecFailed
	}
	return exitOK
}

func main() {
	args, err := parseArgs()
	if err != nil {
		fmt.Fprintf(os.Stderr, "sidecar-launcher: %v\n", err)
		flag.Usage()
		os.Exit(exitUsage)
	}
	bin, err := resolve()
	if err != nil {
		fmt.Fprintf(os.Stderr,
			"sidecar-launcher: %v\n"+
				"Set %s, install clio-agent@develop via the upstream\n"+
				"installer (CLIO_REF=develop), or place clio-agent-gact on PATH.\n",
			err, envOverride)
		os.Exit(exitNotFound)
	}
	os.Exit(runChild(bin, args))
}
