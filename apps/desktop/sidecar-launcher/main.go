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
//   0. BUNDLED runtime shipped alongside this launcher (the "bundled"
//      installer variant). Resolved relative to the launcher's own
//      executable directory so it is install-location independent —
//      see bundledCandidates(). This makes the bundled build work
//      fully offline; the "lite" build simply has no clio-runtime/
//      next to the launcher, so this priority no-ops and resolution
//      falls through to the runtime-resolution paths below.
//   1. $CLIO_AGENT_GACT_BIN env var (explicit override; used by CI +
//      `pnpm tauri:dev` against the gact emulator)
//   2. `clio-agent-gact` on PATH
//   3. Per-OS install-prefix conventions matching iowarp/clio-agent's
//      install.{sh,ps1}:
//        - Windows: %LOCALAPPDATA%\clio\clio-agent\.venv\Scripts\clio-agent-gact.exe
//        - Linux:   $HOME/.local/share/clio/clio-agent/.venv/bin/clio-agent-gact
//        - macOS:   $HOME/Library/Application Support/clio/clio-agent/.venv/bin/clio-agent-gact
//   4. Dev repo checkout, when $CLIO_DEV_REPO points at a local
//      clio-agent clone with a built .venv. This replaces a previously
//      hardcoded developer filesystem path (a release-hygiene bug — it
//      shipped one machine's layout in release binaries). Opt-in only.
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
	envDevRepo         = "CLIO_DEV_REPO"
	envBearer          = "CLIO_AUTH_TOKEN"
	envGactContractVer = "CLIO_GACT_CONTRACT"
	// envBundledDir is set by the Tauri supervisor (lib.rs setup) to the
	// app's REAL resource dir + /clio-runtime, resolved via Tauri's own
	// path API. This makes the bundled runtime discoverable regardless of
	// the platform's resource layout (Linux deb/rpm put resources under
	// /usr/lib/<app>/ while the launcher sidecar lands in /usr/bin/ — a
	// layout the exe-relative probes below cannot reach).
	envBundledDir = "CLIO_BUNDLED_RUNTIME_DIR"
)

// gactBinName is the clio-agent-gact executable's basename for the
// current platform.
func gactBinName() string {
	if runtime.GOOS == "windows" {
		return "clio-agent-gact.exe"
	}
	return "clio-agent-gact"
}

// venvScriptDir is the venv subdirectory holding console-scripts:
// "Scripts" on Windows, "bin" elsewhere.
func venvScriptDir() string {
	if runtime.GOOS == "windows" {
		return "Scripts"
	}
	return "bin"
}

// bundledCandidates returns the BUNDLED-runtime search list, resolved
// relative to the launcher executable's own directory. Tauri places
// bundled resources differently per platform/installer, so we probe a
// handful of known layouts:
//
//   - <exedir>/clio-runtime/.venv/{Scripts,bin}/clio-agent-gact[.exe]
//     (Windows MSI/NSIS + Linux deb/AppImage: resources land next to
//     the executable)
//   - <exedir>/resources/clio-runtime/...               (some Tauri
//     resource layouts nest under resources/)
//   - <exedir>/../Resources/clio-runtime/.venv/bin/...  (macOS .app:
//     Contents/MacOS/<exe> with resources in Contents/Resources/)
//
// exeDir is the directory containing the launcher binary (os.Executable
// → dir). It is passed in so tests can supply a temp dir.
func bundledCandidates(exeDir string) []string {
	bin := gactBinName()
	scriptDir := venvScriptDir()

	// Roots under which a clio-runtime/ tree may have been bundled,
	// relative to the launcher's executable directory.
	roots := []string{
		exeDir,
		filepath.Join(exeDir, "resources"),
		// macOS .app: MacOS/<exe> ⇒ ../Resources/.
		filepath.Join(exeDir, "..", "Resources"),
	}

	// Within each root, clio-runtime/.venv exposes the console-script
	// under Scripts/ (Windows) or bin/ (unix). We probe BOTH so a
	// cross-built/copied tree still resolves regardless of which the
	// builder produced for the host.
	subdirs := []string{"Scripts", "bin"}
	if scriptDir == "Scripts" {
		subdirs = []string{"Scripts", "bin"}
	} else {
		subdirs = []string{"bin", "Scripts"}
	}

	var out []string
	for _, root := range roots {
		for _, sd := range subdirs {
			out = append(out, filepath.Join(root, "clio-runtime", ".venv", sd, bin))
		}
	}
	return out
}

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

// exeDir returns the directory of the running launcher binary, or ""
// if it cannot be determined (in which case the bundled lookup is
// simply skipped — resolution falls through to the runtime paths).
func exeDir() string {
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	// EvalSymlinks so a symlinked launcher (AppImage, Homebrew) resolves
	// resources relative to its real location.
	if resolved, err := filepath.EvalSymlinks(exe); err == nil {
		exe = resolved
	}
	return filepath.Dir(exe)
}

// devRepoCandidate returns the clio-agent-gact path inside a developer's
// local clio-agent checkout, if $CLIO_DEV_REPO is set. Empty otherwise.
// This replaces the previously hardcoded developer filesystem path so
// the dev workflow survives without shipping anyone's layout.
func devRepoCandidate() string {
	repo := os.Getenv(envDevRepo)
	if repo == "" {
		return ""
	}
	return filepath.Join(repo, ".venv", venvScriptDir(), gactBinName())
}

// candidatePaths returns the search list for clio-agent-gact, in
// priority order. `dir` is the launcher executable's directory (for
// the bundled-runtime probe); pass exeDir() in production.
func candidatePaths(dir string) []string {
	var paths []string

	// Priority 0a: the bundled runtime dir handed to us by the Tauri
	// supervisor (resolved through Tauri's resource-dir API — correct on
	// every platform/installer layout, including Linux /usr/lib/<app>/).
	if bundled := os.Getenv(envBundledDir); bundled != "" {
		for _, sd := range []string{venvScriptDir(), "Scripts", "bin"} {
			paths = append(paths, filepath.Join(bundled, ".venv", sd, gactBinName()))
		}
	}

	// Priority 0b: the bundled runtime shipped next to the launcher
	// (Windows installers + macOS .app, where exe-relative probing works).
	if dir != "" {
		paths = append(paths, bundledCandidates(dir)...)
	}

	// Priority 1: explicit env override.
	if env := os.Getenv(envOverride); env != "" {
		paths = append(paths, env)
	}

	// Priority 2: clio-agent-gact on PATH.
	if p, err := exec.LookPath("clio-agent-gact"); err == nil {
		paths = append(paths, p)
	}

	// Priority 3: per-OS conventional install prefix.
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

	// Priority 4: opt-in dev-repo checkout (replaces the old hardcoded path).
	if dev := devRepoCandidate(); dev != "" {
		paths = append(paths, dev)
	}

	return paths
}

func resolve() (string, error) {
	for _, p := range candidatePaths(exeDir()) {
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
