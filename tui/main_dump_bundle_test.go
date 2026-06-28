package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// TestCLI_DumpBundleSince covers --since narrowing to recently-active sessions.
func TestCLI_DumpBundleSince(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	_ = createSession(t, url, "dump-since-old")
	time.Sleep(2 * time.Second)
	newSid := createSession(t, url, "dump-since-new")

	dirAll := t.TempDir()
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"dump-bundle", "-o", dirAll, "--since", "1h"); code != 0 {
		t.Fatalf("dump-bundle --since 1h: exit %d", code)
	}
	allEntries, _ := os.ReadDir(filepath.Join(dirAll, "sessions"))
	if len(allEntries) < 2 {
		t.Errorf("--since 1h should keep >=2 sessions, got %d", len(allEntries))
	}

	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"rename", newSid, "dump-since-new-touched"); code != 0 {
		t.Fatalf("rename to refresh UpdatedAt: exit %d", code)
	}
	time.Sleep(5 * time.Second)
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"rename", newSid, "dump-since-new-touched-2"); code != 0 {
		t.Fatalf("rename 2: exit %d", code)
	}
	dirNew := t.TempDir()
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"dump-bundle", "-o", dirNew, "--since", "6s"); code != 0 {
		t.Fatalf("dump-bundle --since 6s: exit %d", code)
	}
	newEntries, _ := os.ReadDir(filepath.Join(dirNew, "sessions"))
	foundNew := false
	for _, e := range newEntries {
		if strings.HasPrefix(e.Name(), newSid) {
			foundNew = true
		}
	}
	if !foundNew {
		t.Errorf("--since 6s should include the fresh session %s, got %v",
			newSid, dirEntryNames(newEntries))
	}
	if len(newEntries) >= len(allEntries) {
		t.Errorf("--since 6s (got %d) should be narrower than 1h (got %d)",
			len(newEntries), len(allEntries))
	}
}

func dirEntryNames(es []os.DirEntry) []string {
	out := make([]string, len(es))
	for i, e := range es {
		out[i] = e.Name()
	}
	return out
}

// TestCLI_DumpBundleParallel covers bounded fanout with more sessions than
// workers.
func TestCLI_DumpBundleParallel(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	const N = 12
	sids := make([]string, 0, N)
	for i := 0; i < N; i++ {
		sids = append(sids, createSession(t, url, fmt.Sprintf("dump-parallel-%d", i)))
	}

	dir := filepath.Join(t.TempDir(), "bundle")
	_, stderr, code := runGact(t, bin,
		map[string]string{"GACT_BACKEND": url},
		"dump-bundle", "-o", dir)
	if code != 0 {
		t.Fatalf("dump-bundle: exit %d, stderr=%q", code, stderr)
	}
	wantSummary := fmt.Sprintf("wrote %d sessions", N)
	if !strings.Contains(stderr, wantSummary) {
		t.Errorf("summary mismatch: want %q, stderr=%q", wantSummary, stderr)
	}
	for _, sid := range sids {
		p := filepath.Join(dir, "sessions", sid+".json")
		if _, err := os.Stat(p); err != nil {
			t.Errorf("missing session export %s: %v", p, err)
		}
	}
}

// TestCLI_DumpBundle covers the expected bundle directory layout.
func TestCLI_DumpBundle(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	_ = createSession(t, url, "bundle-target")

	dir := filepath.Join(t.TempDir(), "bundle")
	_, stderr, code := runGact(t, bin,
		map[string]string{"GACT_BACKEND": url},
		"dump-bundle", "-o", dir)
	if code != 0 {
		t.Fatalf("dump-bundle: exit %d, stderr=%q", code, stderr)
	}
	for _, want := range []string{"version.txt", "diag.txt", "metrics.json"} {
		if _, err := os.Stat(filepath.Join(dir, want)); err != nil {
			t.Errorf("missing %s: %v", want, err)
		}
	}
	versionText, err := os.ReadFile(filepath.Join(dir, "version.txt"))
	if err != nil {
		t.Fatalf("read version.txt: %v", err)
	}
	for _, want := range []string{
		"gact " + binaryVersion,
		"(contract " + contractVersion + ")",
		"revision:",
		"go:",
		"platform:",
	} {
		if !strings.Contains(string(versionText), want) {
			t.Fatalf("version.txt missing %q:\n%s", want, versionText)
		}
	}
	if strings.Contains(string(versionText), "runtime:") {
		t.Fatalf("version.txt should use the same Go metadata label as gact version, got:\n%s", versionText)
	}
	entries, err := os.ReadDir(filepath.Join(dir, "sessions"))
	if err != nil {
		t.Fatalf("sessions/ dir missing: %v", err)
	}
	if len(entries) == 0 {
		t.Fatalf("sessions/ dir empty; expected >=1 session export")
	}
}
