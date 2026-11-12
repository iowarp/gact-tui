package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
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

// candidatePaths returns the lite-variant search list for
// clio-agent-gact, in priority order. Bundled runtimes are resolved
// separately (and first) via the generic runtime.json manifest — see
// resolveRuntime in resolve.go; the legacy exe-relative .venv probing
// that used to live here shipped broken for months and was removed with
// the manifest mechanism (iowarp/gact-tui#311).
func candidatePaths() []string {
	var paths []string

	// Priority 1: explicit env override.
	if env := os.Getenv(envOverride); env != "" {
		paths = append(paths, env)
	}

	// Priority 2: the clio-agent environment the official installers create:
	// <prefix>/clio-agent/.venv, where the prefix is CLIO_PREFIX, else
	// <agent data>/app (CLIO_AGENT_DATA_DIR, CLIO_AGENT_HOME/data,
	// CLIO_USER_DIR/data, else the OS default since 0.9.5), then the pre-0.9.5
	// prefixes an older install may still use. This is the install the desktop
	// manages and repairs, so it wins over whatever else is on PATH.
	for _, prefix := range installPrefixes() {
		paths = append(paths, filepath.Join(prefix, "clio-agent", ".venv", venvScriptDir(), gactBinName()))
	}

	// Priority 3: clio-agent-gact on PATH, unless it is older than this
	// desktop. An old `uv tool`/pip install left on PATH would otherwise
	// answer /v1/capabilities, pass readiness and serve a UI it cannot
	// support, and on a fresh lite install it would stop the managed install
	// from ever running.
	if p, err := exec.LookPath("clio-agent-gact"); err == nil {
		if reason := stalePathAgent(p); reason == "" {
			paths = append(paths, p)
		} else {
			fmt.Fprintf(os.Stderr, "sidecar-launcher: skipping clio-agent-gact on PATH (%s): %s\n", p, reason)
		}
	}

	// Priority 4: opt-in dev-repo checkout.
	if dev := devRepoCandidate(); dev != "" {
		paths = append(paths, dev)
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
