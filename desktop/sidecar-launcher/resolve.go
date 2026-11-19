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
	// app's REAL resource dir + /gact-runtime, resolved via Tauri's own
	// path API (sidecar_setup.rs BUNDLED_RUNTIME_ENV — the two constants
	// MUST agree; they drifted apart once, iowarp/gact-tui#311, and the
	// bundled lookup was silently dead). This makes the bundled runtime
	// discoverable regardless of the platform's resource layout (Linux
	// deb/rpm put resources under /usr/lib/<app>/ while the launcher
	// sidecar lands in /usr/bin/ — a layout exe-relative probes cannot
	// reach).
	envBundledDir = "GACT_BUNDLED_RUNTIME_DIR"
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

// resolveRuntime finds the backend to spawn, priority order:
//
//  1. A BUNDLED runtime (the "bundled" installer variant): a
//     gact-runtime/ dir carrying a runtime.json manifest. Generic — the
//     launcher execs whatever the manifest describes and knows nothing
//     about its contents. A found-but-broken manifest is a HARD error,
//     never a silent fall-through: it means the bundle itself is broken
//     and masking that behind system resolution would hide the defect.
//  2. Lite-variant resolution: env override, per-OS install prefixes
//     (clio-agent-gact, else `clio-agent serve`), PATH (unless older than
//     this desktop), opt-in dev repo — see backendCandidates.
func resolveRuntime() (*resolvedRuntime, error) {
	for _, dir := range bundledRuntimeDirs(exeDir()) {
		if hasManifest(dir) {
			return loadManifest(dir)
		}
	}
	found, err := resolveCandidate()
	if err != nil {
		return nil, err
	}
	return &resolvedRuntime{Argv: append([]string{found.path}, found.args...)}, nil
}

// resolveBinary returns the executable resolveCandidate picks.
func resolveBinary() (string, error) {
	found, err := resolveCandidate()
	if err != nil {
		return "", err
	}
	return found.path, nil
}

// resolveCandidate walks the lite-variant candidates and returns the
// first whose executable is an existing regular file.
func resolveCandidate() (backendCandidate, error) {
	for _, c := range backendCandidates() {
		if c.path == "" {
			continue
		}
		info, err := os.Stat(c.path)
		if err != nil {
			continue
		}
		if info.IsDir() {
			continue
		}
		return c, nil
	}
	return backendCandidate{}, errors.New("no clio-agent-gact or clio-agent (serve) found")
}
