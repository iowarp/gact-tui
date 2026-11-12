package main

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestReleaseNumbers(t *testing.T) {
	for version, want := range map[string][]int{
		"0.9.6":         {0, 9, 6},
		"0.9.6+1":       {0, 9, 6},
		"0.9.6-2+1":     {0, 9, 6},
		"v0.9.6-beta.2": {0, 9, 6},
		"0.9.6b1.post1": {0, 9, 6},
		"0.9.5.1":       {0, 9, 5, 1},
		"0.7.11":        {0, 7, 11},
		"0.10.0.dev3":   {0, 10, 0},
		"":              nil,
		"dev":           nil,
	} {
		got := releaseNumbers(version)
		if len(got) != len(want) {
			t.Fatalf("releaseNumbers(%q) = %v, want %v", version, got, want)
		}
		for i := range want {
			if got[i] != want[i] {
				t.Fatalf("releaseNumbers(%q) = %v, want %v", version, got, want)
			}
		}
	}
}

func TestCompareRelease(t *testing.T) {
	cases := []struct {
		a, b []int
		want int
	}{
		{[]int{0, 7, 11}, []int{0, 9, 6}, -1},
		{[]int{0, 9, 5, 1}, []int{0, 9, 6}, -1},
		{[]int{0, 9, 6}, []int{0, 9, 6}, 0},
		{[]int{0, 9, 6, 1}, []int{0, 9, 6}, 1},
		{[]int{0, 10, 0}, []int{0, 9, 6}, 1},
	}
	for _, c := range cases {
		if got := compareRelease(c.a, c.b); got != c.want {
			t.Fatalf("compareRelease(%v, %v) = %d, want %d", c.a, c.b, got, c.want)
		}
	}
}

// fakeToolInstall lays out a `uv tool`-style install: an environment holding
// clio-agent <version>, and a console-script launcher in a separate bin dir
// (like ~/.local/bin) that names the environment's interpreter the way the
// platform's launchers do. It returns the bin dir.
func fakeToolInstall(t *testing.T, version string) string {
	t.Helper()
	root := t.TempDir()
	env := filepath.Join(root, "tools", "clio-agent")
	var python, distInfo string
	if runtime.GOOS == "windows" {
		python = filepath.Join(env, "Scripts", "python.exe")
		distInfo = filepath.Join(env, "Lib", "site-packages", "clio_agent-"+version+".dist-info")
	} else {
		python = filepath.Join(env, "bin", "python")
		distInfo = filepath.Join(env, "lib", "python3.14", "site-packages", "clio_agent-"+version+".dist-info")
	}
	touch(t, python)
	if err := os.MkdirAll(distInfo, 0o755); err != nil {
		t.Fatal(err)
	}
	bin := filepath.Join(root, "bin")
	if err := os.MkdirAll(bin, 0o755); err != nil {
		t.Fatal(err)
	}
	var body []byte
	if runtime.GOOS == "windows" {
		// A trampoline: machine code, then the interpreter path among binary data.
		body = append([]byte("MZ\x90\x00\x03\x00\x00\x00"), []byte(python+"\x00\x00#!"+python+"\n")...)
	} else {
		body = []byte("#!" + python + "\nimport sys\n")
	}
	if err := os.WriteFile(filepath.Join(bin, gactBinName()), body, 0o755); err != nil {
		t.Fatal(err)
	}
	return bin
}

func TestInstalledAgentVersionReadsLauncherInterpreterEnvironment(t *testing.T) {
	bin := fakeToolInstall(t, "0.7.11")
	if got := installedAgentVersion(filepath.Join(bin, gactBinName())); got != "0.7.11" {
		t.Fatalf("installedAgentVersion = %q, want 0.7.11", got)
	}
}

func TestStalePathAgentComparesWithDesktopRelease(t *testing.T) {
	bin := filepath.Join(fakeToolInstall(t, "0.7.11"), gactBinName())
	t.Setenv(envDesktopVersion, "")
	if reason := stalePathAgent(bin); reason != "" {
		t.Fatalf("no desktop version must accept PATH as before; got %q", reason)
	}
	t.Setenv(envDesktopVersion, "0.9.6-2+1")
	if reason := stalePathAgent(bin); !strings.Contains(reason, "0.7.11 is older") {
		t.Fatalf("0.7.11 under a 0.9.6 desktop must be stale; got %q", reason)
	}
	current := filepath.Join(fakeToolInstall(t, "0.9.6b2.post1"), gactBinName())
	if reason := stalePathAgent(current); reason != "" {
		t.Fatalf("the desktop's own release must be accepted; got %q", reason)
	}
	unknown := filepath.Join(t.TempDir(), gactBinName())
	touch(t, unknown)
	if reason := stalePathAgent(unknown); !strings.Contains(reason, "could not be read") {
		t.Fatalf("an unreadable version must not be trusted; got %q", reason)
	}
}

func TestCandidatePathsSkipStalePathAgent(t *testing.T) {
	clearResolutionEnv(t)
	t.Setenv("PATH", fakeToolInstall(t, "0.7.11"))
	t.Setenv(envDesktopVersion, "0.9.6+1")
	if paths := candidatePaths(); len(paths) != 0 {
		t.Fatalf("a stale PATH agent must leave nothing to resolve (so the desktop installs); got %v", paths)
	}
	t.Setenv(envDesktopVersion, "0.7.3")
	if paths := candidatePaths(); len(paths) != 1 {
		t.Fatalf("a PATH agent as new as the desktop must be a candidate; got %v", paths)
	}
}

func TestCandidatePathsPreferManagedInstallOverPath(t *testing.T) {
	clearResolutionEnv(t)
	bin := fakeToolInstall(t, "0.9.6")
	t.Setenv("PATH", bin)
	home := t.TempDir()
	t.Setenv("CLIO_AGENT_HOME", home)
	managed := filepath.Join(home, "data", "app", "clio-agent", ".venv", venvScriptDir(), gactBinName())
	touch(t, managed)
	paths := candidatePaths()
	if len(paths) < 2 || paths[0] != managed || paths[len(paths)-1] != filepath.Join(bin, gactBinName()) {
		t.Fatalf("managed install must come before PATH; got %v", paths)
	}
	got, err := resolveBinary()
	if err != nil || got != managed {
		t.Fatalf("resolveBinary = %q, %v; want the managed install %q", got, err, managed)
	}
}
