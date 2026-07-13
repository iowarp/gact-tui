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
//  2. Legacy single-binary resolution (the "lite" variant): env
//     override, PATH, per-OS install prefixes, opt-in dev repo — see
//     candidatePaths.
func resolveRuntime() (*resolvedRuntime, error) {
	for _, dir := range bundledRuntimeDirs(exeDir()) {
		if hasManifest(dir) {
			return loadManifest(dir)
		}
	}
	bin, err := resolveBinary()
	if err != nil {
		return nil, err
	}
	return &resolvedRuntime{Argv: []string{bin}}, nil
}

// resolveBinary walks the lite-variant candidate paths and returns the
// first existing regular file.
func resolveBinary() (string, error) {
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
