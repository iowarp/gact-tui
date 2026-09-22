// Sidecar launcher for GACT desktop brands with a managed backend.
//
// Tauri bundles one of these per target triple via `bundle.externalBin`
// (the embedding brand's config declares it). At runtime the Tauri
// shell spawns it with `--host` / `--port` / `--token`.
//
// The launcher's job is to resolve a real backend and exec it with the
// requested bind args + bearer token. It does not fake or stub the
// server — if no real backend is reachable, it exits non-zero with a
// clear message that the Tauri shell surfaces to the user.
//
// Resolution order:
//  0. BUNDLED runtime (the "bundled" installer variant): a gact-runtime/
//     dir shipping a generic runtime.json manifest — located via
//     $GACT_BUNDLED_RUNTIME_DIR (set by the supervisor from Tauri's
//     resource-dir API) or relative to this executable. The launcher
//     execs whatever the manifest describes and knows nothing about the
//     runtime's contents (iowarp/gact-tui#311). The "lite" build simply
//     ships no gact-runtime/, so this priority no-ops and resolution
//     falls through to the system paths below.
//  1. $CLIO_AGENT_GACT_BIN env var (explicit override; used by CI +
//     `pnpm tauri:dev` against the gact emulator)
//  2. `clio-agent-gact` on PATH
//  3. Per-OS install-prefix conventions matching iowarp/clio-agent's
//     install.{sh,ps1}:
//     - Windows: %LOCALAPPDATA%\clio\clio-agent\.venv\Scripts\clio-agent-gact.exe
//     - Linux:   $HOME/.local/share/clio/clio-agent/.venv/bin/clio-agent-gact
//     - macOS:   $HOME/Library/Application Support/clio/clio-agent/.venv/bin/clio-agent-gact
//  4. Dev repo checkout, when $CLIO_DEV_REPO points at a local
//     clio-agent clone with a built .venv. Opt-in only.
//
// If none resolve, the launcher emits a structured error on stderr and
// exits 2. The supervisor turns that into a Splash-screen error card.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"time"
)

const crashCleanupTimeout = 12 * time.Second

const (
	exitOK              = 0
	exitUsage           = 1
	exitNotFound        = 2
	exitExecFailed      = 3
	envBearer           = "CLIO_AUTH_TOKEN"
	envGactContractVer  = "CLIO_GACT_CONTRACT"
	envBootHeartbeat    = "CLIO_DESKTOP_BOOT_HEARTBEAT"
	envDesktopParentPID = "CLIO_DESKTOP_PARENT_PID"
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

// spawnArgv is the full command line for a resolved runtime: its own
// argv plus the bind args the supervisor requested.
func spawnArgv(rt *resolvedRuntime, args cliArgs) []string {
	return append(append([]string{}, rt.Argv...),
		"--host", args.host,
		"--port", fmt.Sprintf("%d", args.port),
	)
}

// spawnEnv is the child environment: our own, the manifest's extras,
// then the bearer token + contract version (which always win).
func spawnEnv(rt *resolvedRuntime, args cliArgs) []string {
	env := os.Environ()
	for k, v := range rt.Env {
		env = append(env, k+"="+v)
	}
	return append(env,
		envBearer+"="+args.token,
		envGactContractVer+"=0.2",
		envBootHeartbeat+"=1",
		// Force the (typically Python) backend to flush stdout/stderr
		// unbuffered so its boot transcript is teed into the boot log in
		// real time. A block-buffered pipe otherwise strands the startup
		// output when a failing boot is killed after a no-progress stall — the
		// "connection refused, zero backend output" symptom.
		"PYTHONUNBUFFERED=1",
	)
}

func runChild(rt *resolvedRuntime, args cliArgs) int {
	// On Windows the launcher owns a KILL_ON_JOB_CLOSE Job Object before it
	// starts the backend. That closes the one lifecycle hole the desktop's
	// graceful supervisor cannot cover: if the desktop (and therefore this
	// launcher) is terminated abruptly, Windows still reaps the inherited
	// backend tree instead of leaving a gigabyte-scale Python process behind.
	if err := installLauncherKillJob(); err != nil {
		fmt.Fprintf(os.Stderr, "sidecar-launcher: failed to install process cleanup: %v\n", err)
		return exitExecFailed
	}
	if err := monitorDesktopParent(); err != nil {
		fmt.Fprintf(os.Stderr, "sidecar-launcher: failed to monitor desktop parent: %v\n", err)
		return exitExecFailed
	}
	argv := spawnArgv(rt, args)
	cmd := exec.Command(argv[0], argv[1:]...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Env = spawnEnv(rt, args)
	configureChild(cmd)
	if err := cmd.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "sidecar-launcher: failed to spawn %s: %v\n", argv[0], err)
		return exitExecFailed
	}
	// The launcher is the reliable owner of startup liveness. Python may spend
	// long stretches importing native modules while holding the GIL, which can
	// starve an in-process heartbeat thread even though the child is healthy.
	// Emit progress from this parent instead so the desktop only treats a truly
	// dead launcher as stalled.
	// Keep launcher liveness on stdout, separate from the backend's inherited
	// stderr stream. On Windows, multiple generations sharing stderr can leave
	// the supervisor's line reader blocked behind the Python console shim.
	fmt.Fprintln(os.Stdout, "sidecar-progress: launcher is waiting for backend readiness")
	waitDone := make(chan error, 1)
	go func() {
		waitDone <- cmd.Wait()
	}()
	// Bridge child lifecycle to our own — when the child exits, we exit
	// with the same code. The Tauri supervisor handles SIGTERM and will
	// signal us if the user closes the window.
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			fmt.Fprintln(os.Stdout, "sidecar-progress: launcher is waiting for backend readiness")
		case <-desktopParentExited:
			fmt.Fprintln(os.Stdout, "sidecar-progress: desktop exited; starting crash cleanup")
			// The backend is still alive until this launcher exits and closes its
			// KILL_ON_JOB_CLOSE Job Object. Start a breakaway helper first; it waits
			// for that backend client to disappear, then prunes its registry lease
			// and stops the shared runtime if no independent CLIO client remains.
			startCrashCleanupAfterExit(rt)
			return exitExecFailed
		case err := <-waitDone:
			// The Windows console-script shim can translate a force-killed
			// interpreter into a zero exit status. Cleanup is registry-gated and
			// idempotent, so run it after every child exit: a graceful backend has
			// already deregistered, while a crashed one leaves a stale PID lease
			// that this helper must prune before the shared daemon can stop.
			fmt.Fprintln(os.Stdout, "sidecar-progress: backend exited; starting crash cleanup")
			cleanupRuntimeAfterCrash(rt)
			if err == nil {
				return exitOK
			}
			var exitErr *exec.ExitError
			if errors.As(err, &exitErr) {
				return exitErr.ExitCode()
			}
			fmt.Fprintf(os.Stderr, "sidecar-launcher: child wait failed: %v\n", err)
			return exitExecFailed
		}
	}
}

func cleanupRuntimeAfterCrash(rt *resolvedRuntime) {
	ctx, cancel := context.WithTimeout(context.Background(), crashCleanupTimeout)
	defer cancel()
	argv := crashCleanupArgv(rt)
	cmd := exec.CommandContext(ctx, argv[0], argv[1:]...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Env = append(os.Environ(), "CLIO_DESKTOP_BOOT_HEARTBEAT=0", "PYTHONUNBUFFERED=1")
	for k, v := range rt.Env {
		cmd.Env = append(cmd.Env, k+"="+v)
	}
	configureChild(cmd)
	if err := cmd.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "sidecar-launcher: crash cleanup failed: %v\n", err)
		return
	}
	fmt.Fprintln(os.Stdout, "sidecar-progress: crash cleanup helper exited")
}

func startCrashCleanupAfterExit(rt *resolvedRuntime) {
	argv := crashCleanupArgv(rt)
	cmd := exec.Command(argv[0], argv[1:]...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Env = append(os.Environ(), "CLIO_DESKTOP_BOOT_HEARTBEAT=0", "PYTHONUNBUFFERED=1")
	for k, v := range rt.Env {
		cmd.Env = append(cmd.Env, k+"="+v)
	}
	configureCrashCleanup(cmd)
	if err := cmd.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "sidecar-launcher: crash cleanup handoff failed: %v\n", err)
		return
	}
	if err := cmd.Process.Release(); err != nil {
		fmt.Fprintf(os.Stderr, "sidecar-launcher: crash cleanup helper release failed: %v\n", err)
		return
	}
	fmt.Fprintln(os.Stdout, "sidecar-progress: crash cleanup handed off")
}

func main() {
	args, err := parseArgs()
	if err != nil {
		fmt.Fprintf(os.Stderr, "sidecar-launcher: %v\n", err)
		flag.Usage()
		os.Exit(exitUsage)
	}
	rt, err := resolveRuntime()
	if err != nil {
		fmt.Fprintf(os.Stderr,
			"sidecar-launcher: %v\n"+
				"No bundled runtime manifest was found next to the launcher, so this\n"+
				"is the lite build (or a broken bundle). Either:\n"+
				"  - install clio-agent@develop via the upstream installer (CLIO_REF=develop),\n"+
				"  - place clio-agent-gact on PATH,\n"+
				"  - set %s to an explicit binary, or\n"+
				"  - set %s to a local clio-agent checkout with a built .venv.\n"+
				"The bundled installer variant ships the runtime and needs none of these.\n",
			err, envOverride, envDevRepo)
		os.Exit(exitNotFound)
	}
	// Record which backend was resolved BEFORE exec so the boot log names
	// the chosen runtime even if the child never binds. Without this line a
	// non-answering backend is indistinguishable from a resolution failure.
	fmt.Fprintf(os.Stderr, "sidecar-launcher: resolved backend argv=%v dir=%q\n", rt.Argv, rt.Dir)
	os.Exit(runChild(rt, args))
}
