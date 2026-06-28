package main

import (
	"errors"
	"os"
	"path/filepath"
)

const (
	envOverride = "CLIO_AGENT_GACT_BIN"
	envDevRepo  = "CLIO_DEV_REPO"
	// envBundledDir is set by the Tauri supervisor (lib.rs setup) to the
	// app's REAL resource dir + /clio-runtime, resolved via Tauri's own
	// path API. This makes the bundled runtime discoverable regardless of
	// the platform's resource layout (Linux deb/rpm put resources under
	// /usr/lib/<app>/ while the launcher sidecar lands in /usr/bin/ - a
	// layout the exe-relative probes below cannot reach).
	envBundledDir = "CLIO_BUNDLED_RUNTIME_DIR"
)

// exeDir returns the directory of the running launcher binary, or ""
// if it cannot be determined. In that case the bundled lookup is
// skipped and resolution falls through to the runtime paths.
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
