package main

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// touch creates an empty file (and parent dirs) at p.
func touch(t *testing.T, p string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", filepath.Dir(p), err)
	}
	if err := os.WriteFile(p, []byte("#!stub\n"), 0o755); err != nil {
		t.Fatalf("write %s: %v", p, err)
	}
}

// bundledGactPath returns the conventional bundled path for the host OS
// under a given exe dir: <exeDir>/clio-runtime/.venv/<scriptDir>/<bin>.
func bundledGactPath(exeDir string) string {
	return filepath.Join(exeDir, "clio-runtime", ".venv", venvScriptDir(), gactBinName())
}

// clearResolutionEnv blanks every env var candidatePaths consults so a
// test starts from a known-empty resolution context. PATH is emptied so
// exec.LookPath cannot accidentally find a system clio-agent-gact.
func clearResolutionEnv(t *testing.T) {
	t.Helper()
	t.Setenv(envBundledDir, "")
	t.Setenv(envOverride, "")
	t.Setenv(envDevRepo, "")
	t.Setenv("PATH", "")
	t.Setenv("LOCALAPPDATA", "")
	// Blank the home-dir sources so the per-OS conventional-prefix
	// branch produces nothing (os.UserHomeDir reads USERPROFILE on
	// Windows, HOME elsewhere). This isolates the orderer from the
	// developer's real home.
	t.Setenv("USERPROFILE", "")
	t.Setenv("HOME", "")
}

func TestBundledCandidatesIncludesHostLayout(t *testing.T) {
	dir := t.TempDir()
	got := bundledCandidates(dir)
	want := bundledGactPath(dir)
	found := false
	for _, p := range got {
		if p == want {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("bundledCandidates(%q) = %v; missing host layout %q", dir, got, want)
	}
}

func TestBundledCandidatesProbesResourceLayouts(t *testing.T) {
	dir := t.TempDir()
	got := bundledCandidates(dir)
	joined := strings.Join(got, "\n")

	// resources/ nested layout must be probed.
	if !strings.Contains(joined, filepath.Join("resources", "clio-runtime")) {
		t.Errorf("bundledCandidates missing resources/clio-runtime layout:\n%s", joined)
	}
	// macOS .app sibling Resources layout (<exedir>/../Resources) must be
	// probed. filepath.Join cleans the "..", so the produced candidate
	// is <parent-of-exedir>/Resources/clio-runtime/...; assert against
	// that exact cleaned form.
	macRoot := filepath.Join(dir, "..", "Resources")
	if !strings.Contains(joined, filepath.Join(macRoot, "clio-runtime")) {
		t.Errorf("bundledCandidates missing ../Resources/clio-runtime layout:\n%s", joined)
	}
	// Both Scripts/ and bin/ console-script dirs must be probed so a
	// copied/cross-built tree resolves regardless of host.
	if !strings.Contains(joined, string(os.PathSeparator)+"Scripts"+string(os.PathSeparator)) {
		t.Errorf("bundledCandidates missing Scripts/ probe:\n%s", joined)
	}
	if !strings.Contains(joined, string(os.PathSeparator)+"bin"+string(os.PathSeparator)) {
		t.Errorf("bundledCandidates missing bin/ probe:\n%s", joined)
	}
}

// The supervisor-provided bundled dir (CLIO_BUNDLED_RUNTIME_DIR, resolved
// through Tauri's resource-dir API) must outrank every other candidate —
// including the exe-relative bundled probes. This is what makes the
// bundled variant work on Linux deb/rpm, where resources live under
// /usr/lib/<app>/ and exe-relative probing from /usr/bin/ cannot reach
// them.
func TestCandidatePathsSupervisorBundledDirFirst(t *testing.T) {
	clearResolutionEnv(t)
	exe := t.TempDir()
	supervisorDir := filepath.Join(t.TempDir(), "resources", "clio-runtime")
	t.Setenv(envBundledDir, supervisorDir)
	// Set competing sources to prove the supervisor dir wins.
	t.Setenv(envOverride, filepath.Join(t.TempDir(), "override", gactBinName()))
	t.Setenv(envDevRepo, t.TempDir())

	paths := candidatePaths(exe)
	if len(paths) == 0 {
		t.Fatal("candidatePaths returned nothing")
	}
	want := filepath.Join(supervisorDir, ".venv", venvScriptDir(), gactBinName())
	if paths[0] != want {
		t.Fatalf("expected supervisor bundled dir first; got %q (want %q)\nall: %v",
			paths[0], want, paths)
	}
}

func TestCandidatePathsBundledFirst(t *testing.T) {
	clearResolutionEnv(t)
	exe := t.TempDir()
	// Also set an env override + dev repo so we can prove bundled wins.
	t.Setenv(envOverride, filepath.Join(t.TempDir(), "override", gactBinName()))
	t.Setenv(envDevRepo, t.TempDir())

	paths := candidatePaths(exe)
	if len(paths) == 0 {
		t.Fatal("candidatePaths returned nothing")
	}
	want := bundledGactPath(exe)
	if paths[0] != want {
		t.Fatalf("expected bundled path first; got %q (want %q)\nall: %v", paths[0], want, paths)
	}
}

func TestCandidatePathsEnvOverrideBeforePath(t *testing.T) {
	clearResolutionEnv(t)
	// No exe dir ⇒ no bundled candidates, so the env override must lead.
	override := filepath.Join(t.TempDir(), "ovr", gactBinName())
	t.Setenv(envOverride, override)

	paths := candidatePaths("")
	if len(paths) == 0 {
		t.Fatal("candidatePaths returned nothing")
	}
	if paths[0] != override {
		t.Fatalf("expected env override first when no bundle; got %q\nall: %v", paths[0], paths)
	}
}

func TestCandidatePathsDevRepoIsLast(t *testing.T) {
	clearResolutionEnv(t)
	devRepo := t.TempDir()
	t.Setenv(envDevRepo, devRepo)

	paths := candidatePaths("")
	if len(paths) == 0 {
		t.Fatal("candidatePaths returned nothing")
	}
	wantDev := filepath.Join(devRepo, ".venv", venvScriptDir(), gactBinName())
	if paths[len(paths)-1] != wantDev {
		t.Fatalf("expected dev-repo path last; got %q\nall: %v", paths[len(paths)-1], paths)
	}
}

func TestCandidatePathsNoHardcodedDevPath(t *testing.T) {
	clearResolutionEnv(t)
	// With everything cleared and no exe dir, the list must be empty —
	// proving no hardcoded developer filesystem path leaks in.
	paths := candidatePaths("")
	for _, p := range paths {
		if strings.Contains(strings.ToLower(p), "libraries") ||
			strings.Contains(strings.ToLower(p), filepath.Join("projects", "clio-agent")) {
			t.Fatalf("hardcoded developer path leaked into candidates: %q", p)
		}
	}
	if len(paths) != 0 {
		t.Fatalf("expected no candidates with empty env and no exe dir; got %v", paths)
	}
}

func TestCandidatePathsDevRepoUsesPlatformLayout(t *testing.T) {
	clearResolutionEnv(t)
	devRepo := t.TempDir()
	t.Setenv(envDevRepo, devRepo)

	paths := candidatePaths("")
	last := paths[len(paths)-1]
	if runtime.GOOS == "windows" {
		if !strings.HasSuffix(last, filepath.Join("Scripts", "clio-agent-gact.exe")) {
			t.Fatalf("windows dev-repo path should end Scripts/clio-agent-gact.exe; got %q", last)
		}
	} else {
		if !strings.HasSuffix(last, filepath.Join("bin", "clio-agent-gact")) {
			t.Fatalf("unix dev-repo path should end bin/clio-agent-gact; got %q", last)
		}
	}
}

// TestResolvePrefersBundledOverDevRepo arranges real stub files for BOTH
// a bundled runtime and a dev-repo checkout, and asserts resolve()'s
// underlying candidate order surfaces the bundled one first. (resolve()
// itself reads exeDir() of the test binary; we exercise the orderer that
// resolve() consumes, with both targets actually present on disk.)
func TestResolvePrefersBundledOverDevRepo(t *testing.T) {
	clearResolutionEnv(t)
	exe := t.TempDir()
	devRepo := t.TempDir()
	t.Setenv(envDevRepo, devRepo)

	bundled := bundledGactPath(exe)
	dev := filepath.Join(devRepo, ".venv", venvScriptDir(), gactBinName())
	touch(t, bundled)
	touch(t, dev)

	// Walk candidatePaths the same way resolve() does and take the first
	// existing regular file.
	var first string
	for _, p := range candidatePaths(exe) {
		if p == "" {
			continue
		}
		info, err := os.Stat(p)
		if err != nil || info.IsDir() {
			continue
		}
		first = p
		break
	}
	if first != bundled {
		t.Fatalf("resolve order picked %q; expected bundled %q", first, bundled)
	}
}
