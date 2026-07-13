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

// writeManifest writes a runtime.json into dir and creates the stub
// interpreter file it points at.
func writeManifest(t *testing.T, dir, body string) {
	t.Helper()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", dir, err)
	}
	if err := os.WriteFile(filepath.Join(dir, manifestName), []byte(body), 0o644); err != nil {
		t.Fatalf("write manifest: %v", err)
	}
}

// clearResolutionEnv blanks every env var resolution consults so a
// test starts from a known-empty context. PATH is emptied so
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

// --- manifest loading ---------------------------------------------------

func TestLoadManifestResolvesRelativeExec(t *testing.T) {
	dir := t.TempDir()
	stub := filepath.Join(dir, "python", "python-stub")
	touch(t, stub)
	writeManifest(t, dir, `{"schema":1,"exec":["python/python-stub","-m","some_module"],"env":{"EXTRA":"1"}}`)

	rt, err := loadManifest(dir)
	if err != nil {
		t.Fatalf("loadManifest: %v", err)
	}
	if rt.Argv[0] != stub {
		t.Fatalf("exec[0] should resolve relative to the runtime dir: got %q want %q", rt.Argv[0], stub)
	}
	if len(rt.Argv) != 3 || rt.Argv[1] != "-m" || rt.Argv[2] != "some_module" {
		t.Fatalf("argv tail mangled: %v", rt.Argv)
	}
	if rt.Env["EXTRA"] != "1" {
		t.Fatalf("manifest env not carried: %v", rt.Env)
	}
}

func TestLoadManifestHardErrors(t *testing.T) {
	cases := []struct {
		name string
		body string
		want string
	}{
		{"bad json", `{nope`, "invalid JSON"},
		{"wrong schema", `{"schema":2,"exec":["x"]}`, "unsupported schema"},
		{"empty exec", `{"schema":1,"exec":[]}`, "empty exec"},
		{"missing binary", `{"schema":1,"exec":["does/not/exist"]}`, "not found"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir()
			writeManifest(t, dir, tc.body)
			_, err := loadManifest(dir)
			if err == nil {
				t.Fatalf("expected error for %s", tc.name)
			}
			if !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("error %q should mention %q", err.Error(), tc.want)
			}
		})
	}
}

// --- bundled dir discovery -----------------------------------------------

func TestBundledRuntimeDirsEnvFirstThenExeLayouts(t *testing.T) {
	clearResolutionEnv(t)
	envDir := t.TempDir()
	t.Setenv(envBundledDir, envDir)
	exe := t.TempDir()

	dirs := bundledRuntimeDirs(exe)
	if len(dirs) != 4 {
		t.Fatalf("want 4 candidate dirs, got %v", dirs)
	}
	if dirs[0] != envDir {
		t.Fatalf("supervisor env dir must be first: %v", dirs)
	}
	joined := strings.Join(dirs, "\n")
	for _, want := range []string{
		filepath.Join(exe, "gact-runtime"),
		filepath.Join(exe, "resources", "gact-runtime"),
		filepath.Join(exe, "..", "Resources", "gact-runtime"),
	} {
		if !strings.Contains(joined, want) {
			t.Errorf("missing exe-relative layout %q in %v", want, dirs)
		}
	}
}

// The env var name must match what the Tauri supervisor exports
// (sidecar_setup.rs BUNDLED_RUNTIME_ENV). They drifted apart once
// (GACT_ vs CLIO_) and the bundled lookup was silently dead — pin it.
func TestBundledDirEnvNameMatchesSupervisor(t *testing.T) {
	if envBundledDir != "GACT_BUNDLED_RUNTIME_DIR" {
		t.Fatalf("envBundledDir = %q; must be GACT_BUNDLED_RUNTIME_DIR (sidecar_setup.rs)", envBundledDir)
	}
}

// --- full resolution -------------------------------------------------------

func TestResolveRuntimeManifestWinsOverLegacyBinary(t *testing.T) {
	clearResolutionEnv(t)
	// A valid legacy override binary exists...
	legacy := filepath.Join(t.TempDir(), "ovr", gactBinName())
	touch(t, legacy)
	t.Setenv(envOverride, legacy)
	// ...but a bundled manifest runtime is present via the supervisor env.
	dir := t.TempDir()
	touch(t, filepath.Join(dir, "python", "py-stub"))
	writeManifest(t, dir, `{"schema":1,"exec":["python/py-stub","-m","mod"]}`)
	t.Setenv(envBundledDir, dir)

	rt, err := resolveRuntime()
	if err != nil {
		t.Fatalf("resolveRuntime: %v", err)
	}
	if !strings.Contains(rt.Argv[0], "py-stub") {
		t.Fatalf("bundled manifest runtime must win over legacy binary; got %v", rt.Argv)
	}
}

func TestResolveRuntimeBrokenManifestIsHardErrorNotFallthrough(t *testing.T) {
	clearResolutionEnv(t)
	// A perfectly good legacy binary is available...
	legacy := filepath.Join(t.TempDir(), "ovr", gactBinName())
	touch(t, legacy)
	t.Setenv(envOverride, legacy)
	// ...but the bundled manifest is broken. Falling through would mask
	// a broken bundle behind system resolution — must hard-error.
	dir := t.TempDir()
	writeManifest(t, dir, `{"schema":1,"exec":["gone"]}`)
	t.Setenv(envBundledDir, dir)

	if _, err := resolveRuntime(); err == nil {
		t.Fatal("broken bundled manifest must be a hard error, not a fallthrough to legacy resolution")
	}
}

func TestResolveRuntimeFallsToLegacyWhenNoManifest(t *testing.T) {
	clearResolutionEnv(t)
	legacy := filepath.Join(t.TempDir(), "ovr", gactBinName())
	touch(t, legacy)
	t.Setenv(envOverride, legacy)
	// Bundled dir exists but has no manifest (lite build / plain dir).
	t.Setenv(envBundledDir, t.TempDir())

	rt, err := resolveRuntime()
	if err != nil {
		t.Fatalf("resolveRuntime: %v", err)
	}
	if rt.Argv[0] != legacy {
		t.Fatalf("expected legacy override %q, got %v", legacy, rt.Argv)
	}
}

// --- legacy candidate ordering --------------------------------------------

func TestCandidatePathsEnvOverrideFirst(t *testing.T) {
	clearResolutionEnv(t)
	override := filepath.Join(t.TempDir(), "ovr", gactBinName())
	t.Setenv(envOverride, override)

	paths := candidatePaths()
	if len(paths) == 0 {
		t.Fatal("candidatePaths returned nothing")
	}
	if paths[0] != override {
		t.Fatalf("expected env override first; got %q\nall: %v", paths[0], paths)
	}
}

func TestCandidatePathsDevRepoIsLast(t *testing.T) {
	clearResolutionEnv(t)
	devRepo := t.TempDir()
	t.Setenv(envDevRepo, devRepo)

	paths := candidatePaths()
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
	// With everything cleared, the list must be empty — proving no
	// hardcoded developer filesystem path leaks in.
	paths := candidatePaths()
	for _, p := range paths {
		if strings.Contains(strings.ToLower(p), "libraries") ||
			strings.Contains(strings.ToLower(p), filepath.Join("projects", "clio-agent")) {
			t.Fatalf("hardcoded developer path leaked into candidates: %q", p)
		}
	}
	if len(paths) != 0 {
		t.Fatalf("expected no candidates with empty env; got %v", paths)
	}
}

func TestCandidatePathsDevRepoUsesPlatformLayout(t *testing.T) {
	clearResolutionEnv(t)
	devRepo := t.TempDir()
	t.Setenv(envDevRepo, devRepo)

	paths := candidatePaths()
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

// --- spawn shape -----------------------------------------------------------

func TestSpawnArgvAppendsBindArgsAfterManifestArgs(t *testing.T) {
	rt := &resolvedRuntime{Argv: []string{"/rt/python", "-m", "mod"}}
	got := spawnArgv(rt, cliArgs{host: "127.0.0.1", port: 4321, token: "tok"})
	want := []string{"/rt/python", "-m", "mod", "--host", "127.0.0.1", "--port", "4321"}
	if len(got) != len(want) {
		t.Fatalf("argv = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("argv[%d] = %q, want %q (all: %v)", i, got[i], want[i], got)
		}
	}
}

func TestSpawnEnvCarriesManifestEnvAndToken(t *testing.T) {
	rt := &resolvedRuntime{Argv: []string{"x"}, Env: map[string]string{"RUNTIME_EXTRA": "yes"}}
	env := spawnEnv(rt, cliArgs{host: "h", port: 1, token: "secret-token"})
	joined := strings.Join(env, "\n")
	for _, want := range []string{
		"RUNTIME_EXTRA=yes",
		envBearer + "=secret-token",
		envGactContractVer + "=0.2",
	} {
		if !strings.Contains(joined, want) {
			t.Fatalf("spawn env missing %q", want)
		}
	}
}
