package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// manifestName is the self-description file a bundled runtime ships at
// its root. The launcher knows nothing about what is inside a runtime
// (interpreter, layout, entry module) — the embedding brand's build
// script writes this manifest and the launcher just execs it
// (iowarp/gact-tui#311).
const manifestName = "runtime.json"

// runtimeManifest is the on-disk schema of runtime.json:
//
//	{
//	  "schema": 1,
//	  "exec": ["python/bin/python3.12", "-m", "some_module"],
//	  "env":  {"OPTIONAL": "extras"}
//	}
//
// exec[0] is the interpreter/binary, resolved relative to the runtime
// dir unless absolute; the rest are its args. --host/--port are
// appended by the launcher at spawn time.
type runtimeManifest struct {
	Schema int               `json:"schema"`
	Exec   []string          `json:"exec"`
	Env    map[string]string `json:"env"`
}

// resolvedRuntime is a manifest resolved against its runtime dir:
// a ready-to-exec argv plus optional extra env.
type resolvedRuntime struct {
	Argv []string
	Env  map[string]string
	Dir  string
}

// hasManifest reports whether dir contains a runtime manifest.
func hasManifest(dir string) bool {
	info, err := os.Stat(filepath.Join(dir, manifestName))
	return err == nil && !info.IsDir()
}

// loadManifest parses and validates dir/runtime.json. A present-but-
// broken manifest is a broken bundle: every failure is a hard, typed
// error — the launcher must NOT silently fall through to system
// resolution and mask a packaging defect.
func loadManifest(dir string) (*resolvedRuntime, error) {
	path := filepath.Join(dir, manifestName)
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("bundled runtime manifest unreadable: %s: %w", path, err)
	}
	var m runtimeManifest
	if err := json.Unmarshal(raw, &m); err != nil {
		return nil, fmt.Errorf("bundled runtime manifest invalid JSON: %s: %w", path, err)
	}
	if m.Schema != 1 {
		return nil, fmt.Errorf("bundled runtime manifest %s: unsupported schema %d (launcher supports 1)", path, m.Schema)
	}
	if len(m.Exec) == 0 {
		return nil, fmt.Errorf("bundled runtime manifest %s: empty exec", path)
	}
	bin := m.Exec[0]
	if !filepath.IsAbs(bin) {
		bin = filepath.Join(dir, bin)
	}
	info, err := os.Stat(bin)
	if err != nil {
		return nil, fmt.Errorf("bundled runtime manifest %s: exec[0] %q not found: %w", path, m.Exec[0], err)
	}
	if info.IsDir() {
		return nil, fmt.Errorf("bundled runtime manifest %s: exec[0] %q is a directory", path, m.Exec[0])
	}
	argv := append([]string{bin}, m.Exec[1:]...)
	return &resolvedRuntime{Argv: argv, Env: m.Env, Dir: dir}, nil
}

// bundledRuntimeDirs returns the candidate bundled-runtime directories,
// most-authoritative first:
//
//  1. $GACT_BUNDLED_RUNTIME_DIR — set by the Tauri supervisor from its
//     resource-dir API; correct on every platform/installer layout,
//     including Linux deb/rpm where resources live under /usr/lib/<app>/
//     out of reach of exe-relative probing.
//  2. gact-runtime/ relative to the launcher executable: next to it
//     (Windows NSIS/MSI, Linux AppImage), under resources/, and the
//     macOS .app sibling Contents/Resources.
func bundledRuntimeDirs(exeDir string) []string {
	var dirs []string
	if env := os.Getenv(envBundledDir); env != "" {
		dirs = append(dirs, env)
	}
	if exeDir != "" {
		dirs = append(dirs,
			filepath.Join(exeDir, "gact-runtime"),
			filepath.Join(exeDir, "resources", "gact-runtime"),
			filepath.Join(exeDir, "..", "Resources", "gact-runtime"),
		)
	}
	return dirs
}
