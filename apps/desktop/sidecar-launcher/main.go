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
//  0. BUNDLED runtime shipped alongside this launcher (the "bundled"
//     installer variant). Resolved relative to the launcher's own
//     executable directory so it is install-location independent —
//     see bundledCandidates(). This makes the bundled build work
//     fully offline; the "lite" build simply has no clio-runtime/
//     next to the launcher, so this priority no-ops and resolution
//     falls through to the runtime-resolution paths below.
//  1. $CLIO_AGENT_GACT_BIN env var (explicit override; used by CI +
//     `pnpm tauri:dev` against the gact emulator)
//  2. `clio-agent-gact` on PATH
//  3. Per-OS install-prefix conventions matching iowarp/clio-agent's
//     install.{sh,ps1}:
//     - Windows: %LOCALAPPDATA%\clio\clio-agent\.venv\Scripts\clio-agent-gact.exe
//     - Linux:   $HOME/.local/share/clio/clio-agent/.venv/bin/clio-agent-gact
//     - macOS:   $HOME/Library/Application Support/clio/clio-agent/.venv/bin/clio-agent-gact
//  4. Dev repo checkout, when $CLIO_DEV_REPO points at a local
//     clio-agent clone with a built .venv. This replaces a previously
//     hardcoded developer filesystem path (a release-hygiene bug — it
//     shipped one machine's layout in release binaries). Opt-in only.
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
)

const (
	exitOK             = 0
	exitUsage          = 1
	exitNotFound       = 2
	exitExecFailed     = 3
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
				"This is the lite build (no embedded runtime). Either:\n"+
				"  - install clio-agent@develop via the upstream installer (CLIO_REF=develop),\n"+
				"  - place clio-agent-gact on PATH,\n"+
				"  - set %s to an explicit binary, or\n"+
				"  - set %s to a local clio-agent checkout with a built .venv.\n"+
				"The bundled installer variant ships the runtime and needs none of these.\n",
			err, envOverride, envDevRepo)
		os.Exit(exitNotFound)
	}
	os.Exit(runChild(bin, args))
}
