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

func venvScriptDirs() []string {
	if venvScriptDir() == "Scripts" {
		return []string{"Scripts", "bin"}
	}
	return []string{"bin", "Scripts"}
}

// bundledCandidates returns the bundled-runtime search list, resolved
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
// -> dir). It is passed in so tests can supply a temp dir.
func bundledCandidates(exeDir string) []string {
	bin := gactBinName()

	// Roots under which a clio-runtime/ tree may have been bundled,
	// relative to the launcher's executable directory.
	roots := []string{
		exeDir,
		filepath.Join(exeDir, "resources"),
		// macOS .app: MacOS/<exe> => ../Resources/.
		filepath.Join(exeDir, "..", "Resources"),
	}

	// Within each root, clio-runtime/.venv exposes the console-script
	// under Scripts/ (Windows) or bin/ (unix). We probe BOTH so a
	// cross-built/copied tree still resolves regardless of which the
	// builder produced for the host.
	var out []string
	for _, root := range roots {
		for _, sd := range venvScriptDirs() {
			out = append(out, filepath.Join(root, "clio-runtime", ".venv", sd, bin))
		}
	}
	return out
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
// priority order. `dir` is the launcher executable's directory for the
// bundled-runtime probe; pass exeDir() in production.
func candidatePaths(dir string) []string {
	var paths []string

	// Priority 0a: the bundled runtime dir handed to us by the Tauri
	// supervisor. It is resolved through Tauri's resource-dir API and is
	// correct on every platform/installer layout, including Linux
	// /usr/lib/<app>/.
	if bundled := os.Getenv(envBundledDir); bundled != "" {
		for _, sd := range venvScriptDirs() {
			paths = append(paths, filepath.Join(bundled, ".venv", sd, gactBinName()))
		}
	}

	// Priority 0b: the bundled runtime shipped next to the launcher.
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

	// Priority 4: opt-in dev-repo checkout.
	if dev := devRepoCandidate(); dev != "" {
		paths = append(paths, dev)
	}

	return paths
}
