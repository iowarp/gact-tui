package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// gactBinName is the clio-agent-gact executable's basename for the
// current platform.
func gactBinName() string {
	if runtime.GOOS == "windows" {
		return "clio-agent-gact.exe"
	}
	return "clio-agent-gact"
}

// agentBinName is the clio-agent front-door executable's basename for the
// current platform. Its `serve` verb runs the same GACT server as
// clio-agent-gact, which newer clio-agent releases deprecate.
func agentBinName() string {
	if runtime.GOOS == "windows" {
		return "clio-agent.exe"
	}
	return "clio-agent"
}

// serveVerb is the clio-agent subcommand that runs the GACT server in the
// foreground (same server and --host/--port flags as clio-agent-gact).
const serveVerb = "serve"

// backendCandidate is one executable the launcher may spawn plus the
// arguments that select the GACT server before the bind arguments.
type backendCandidate struct {
	path string
	args []string
}

// serveCleanupArgv maps a `clio-agent serve` runtime to its crash-cleanup
// command. The front door has no --cleanup-runtime-after-crash flag, so the
// same environment's interpreter runs the GACT module that does. ok is false
// for any other runtime, or when that interpreter is missing.
func serveCleanupArgv(rt *resolvedRuntime) (argv []string, ok bool) {
	if len(rt.Argv) != 2 || rt.Argv[1] != serveVerb ||
		!strings.EqualFold(filepath.Base(rt.Argv[0]), agentBinName()) {
		return nil, false
	}
	python := "python"
	if runtime.GOOS == "windows" {
		python = "python.exe"
	}
	python = filepath.Join(filepath.Dir(rt.Argv[0]), python)
	if info, err := os.Stat(python); err != nil || info.IsDir() {
		return nil, false
	}
	return []string{python, "-m", "clio_agent.gact", "--cleanup-runtime-after-crash"}, true
}

// venvScriptDir is the venv subdirectory holding console-scripts:
// "Scripts" on Windows, "bin" elsewhere.
func venvScriptDir() string {
	if runtime.GOOS == "windows" {
		return "Scripts"
	}
	return "bin"
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

// backendCandidates returns the lite-variant search list, in priority
// order. Bundled runtimes are resolved separately (and first) via the
// generic runtime.json manifest — see resolveRuntime in resolve.go; the
// legacy exe-relative .venv probing that used to live here shipped broken
// for months and was removed with the manifest mechanism
// (iowarp/gact-tui#311).
func backendCandidates() []backendCandidate {
	var candidates []backendCandidate
	gact := func(path string) { candidates = append(candidates, backendCandidate{path: path}) }

	// Priority 1: explicit env override.
	if env := os.Getenv(envOverride); env != "" {
		gact(env)
	}

	// Priority 2: the clio-agent environment the official installers create:
	// <prefix>/clio-agent/.venv, where the prefix is CLIO_PREFIX, else
	// <agent data>/app (CLIO_AGENT_DATA_DIR, CLIO_AGENT_HOME/data,
	// CLIO_USER_DIR/data, else the OS default since 0.9.5), then the pre-0.9.5
	// prefixes an older install may still use. This is the install the desktop
	// manages and repairs, so it wins over whatever else is on PATH.
	//
	// Each environment offers clio-agent-gact first (every release before the
	// front door shipped it), then `clio-agent serve`: an install that wrote
	// only the front-door script must still start rather than send the
	// desktop back to a first-run install it has already done
	// (iowarp/clio-agent#2287). Both are tried per prefix, so the newest
	// managed install wins over an older prefix that still has the script.
	for _, prefix := range installPrefixes() {
		bin := filepath.Join(prefix, "clio-agent", ".venv", venvScriptDir())
		gact(filepath.Join(bin, gactBinName()))
		candidates = append(candidates, backendCandidate{
			path: filepath.Join(bin, agentBinName()),
			args: []string{serveVerb},
		})
	}

	// Priority 3: clio-agent-gact on PATH, unless it is older than this
	// desktop. An old `uv tool`/pip install left on PATH would otherwise
	// answer /v1/capabilities, pass readiness and serve a UI it cannot
	// support, and on a fresh lite install it would stop the managed install
	// from ever running.
	if p, err := exec.LookPath("clio-agent-gact"); err == nil {
		if reason := stalePathAgent(p); reason == "" {
			gact(p)
		} else {
			fmt.Fprintf(os.Stderr, "sidecar-launcher: skipping clio-agent-gact on PATH (%s): %s\n", p, reason)
		}
	}

	// Priority 4: opt-in dev-repo checkout.
	if dev := devRepoCandidate(); dev != "" {
		gact(dev)
	}

	return candidates
}

// candidatePaths lists the executable of every backendCandidates entry.
func candidatePaths() []string {
	candidates := backendCandidates()
	paths := make([]string, 0, len(candidates))
	for _, c := range candidates {
		paths = append(paths, c.path)
	}
	return paths
}

// installPrefixes lists where install.sh / install.ps1 put clio-agent, newest
// layout first: CLIO_PREFIX, the agent-data prefix named by the environment
// (CLIO_AGENT_DATA_DIR, CLIO_AGENT_HOME/data, CLIO_USER_DIR/data; the desktop sets
// one for its own data, which a separate install need not share), the OS default
// <agent data>/app the installers use without overrides (0.9.5 and later), then
// the pre-0.9.5 prefixes.
func installPrefixes() []string {
	var prefixes []string
	if prefix := os.Getenv("CLIO_PREFIX"); prefix != "" {
		prefixes = append(prefixes, prefix)
	}
	data := os.Getenv("CLIO_AGENT_DATA_DIR")
	if data == "" {
		if home := os.Getenv("CLIO_AGENT_HOME"); home != "" {
			data = filepath.Join(home, "data")
		} else if user := os.Getenv("CLIO_USER_DIR"); user != "" {
			data = filepath.Join(user, "data")
		}
	}
	if data != "" {
		prefixes = append(prefixes, filepath.Join(data, "app"))
	}
	home, _ := os.UserHomeDir()
	switch runtime.GOOS {
	case "windows":
		local := os.Getenv("LOCALAPPDATA")
		if local == "" && home != "" {
			local = filepath.Join(home, "AppData", "Local")
		}
		if local != "" {
			prefixes = append(prefixes,
				filepath.Join(local, "clio-agent", "data", "app"),
				filepath.Join(local, "clio"),
			)
		}
	case "darwin":
		if home != "" {
			prefixes = append(prefixes,
				filepath.Join(home, "Library", "Application Support", "clio-agent", "data", "app"),
				filepath.Join(home, "Library", "Application Support", "clio"),
				filepath.Join(home, ".local", "share", "clio"),
			)
		}
	default:
		xdg := os.Getenv("XDG_DATA_HOME")
		if !filepath.IsAbs(xdg) && home != "" {
			xdg = filepath.Join(home, ".local", "share")
		}
		if xdg != "" {
			prefixes = append(prefixes, filepath.Join(xdg, "clio-agent", "app"))
		}
		if home != "" {
			prefixes = append(prefixes, filepath.Join(home, ".local", "share", "clio"))
		}
	}
	return prefixes
}
