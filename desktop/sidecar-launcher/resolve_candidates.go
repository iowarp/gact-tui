package main

import (
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

	// Priority 4: opt-in dev-repo checkout.
	if dev := devRepoCandidate(); dev != "" {
		paths = append(paths, dev)
	}

	return paths
}
