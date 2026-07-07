package cli

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// TestCLI_ListFilters covers FFF1: --limit truncates, --status idle
// keeps everything (all sessions start idle), --status running drops
// everything, and an unknown --status returns exit 2.
func TestCLI_ListFilters(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	// Two fresh sessions so we can exercise --limit 1.
	_ = createSession(t, url, "list-filter-1")
	_ = createSession(t, url, "list-filter-2")

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url}, "list")
	if code != 0 {
		t.Fatalf("list: exit %d", code)
	}
	totalRows := strings.Count(strings.TrimSpace(stdout), "\n") + 1
	if totalRows < 2 {
		t.Fatalf("expected >=2 sessions, got %d", totalRows)
	}

	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"list", "--limit", "1")
	if code != 0 {
		t.Fatalf("list --limit: exit %d", code)
	}
	if got := strings.Count(strings.TrimSpace(stdout), "\n") + 1; got != 1 {
		t.Errorf("--limit 1: expected 1 row, got %d (%q)", got, stdout)
	}

	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"list", "--status", "idle")
	if code != 0 {
		t.Fatalf("list --status idle: exit %d", code)
	}
	idleRows := strings.Count(strings.TrimSpace(stdout), "\n") + 1
	if idleRows < 2 {
		t.Errorf("--status idle: expected >=2 rows, got %d", idleRows)
	}

	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"list", "--status", "running")
	if code != 0 {
		t.Fatalf("list --status running: exit %d", code)
	}
	if strings.TrimSpace(stdout) != "" {
		t.Errorf("--status running: expected empty (no running sessions), got %q", stdout)
	}

	if _, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"list", "--status", "bogus"); code != 2 {
		t.Errorf("list --status bogus: expected exit 2, got %d", code)
	}
}

// FFFFFFFFF1: `gact list` gains --detached-only + --sort that
// mirror dashboard (YYYYYYYY1 + KKKKKKKK1).
func TestCLI_ListDetachedOnlyAndSort(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	// 3 sessions with intentional delay so UpdatedAt is monotonic.
	_ = createSession(t, url, "list-old")
	time.Sleep(120 * time.Millisecond)
	_ = createSession(t, url, "list-mid")
	time.Sleep(120 * time.Millisecond)
	newestSid := createSession(t, url, "list-new")

	// --sort oldest flips backend default-newest-first to oldest-first.
	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"list", "--sort", "oldest")
	if code != 0 {
		t.Fatalf("list --sort oldest: exit %d", code)
	}
	iOld := strings.Index(stdout, "list-old")
	iNew := strings.Index(stdout, "list-new")
	if iOld < 0 || iNew < 0 {
		t.Fatalf("missing rows: %q", stdout)
	}
	if iOld >= iNew {
		t.Errorf("--sort oldest: older should come first; old@%d new@%d", iOld, iNew)
	}

	// --sort bogus fails fast.
	_, stderr, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"list", "--sort", "bogus")
	if code != 2 {
		t.Errorf("--sort bogus: exit %d, want 2", code)
	}
	if !strings.Contains(stderr, "unknown --sort") {
		t.Errorf("stderr: %q", stderr)
	}

	// --detached-only filters by local registry. Seed it with just
	// the newest sid, expect --detached-only output to be that one
	// row only.
	dir := t.TempDir()
	regPath := filepath.Join(dir, "detached.json")
	body := fmt.Sprintf(
		`{"records":[{"session_id":%q,"title":"list-new","backend":%q,"detached_at":"2026-04-20T08:00:00Z"}]}`,
		newestSid, url,
	)
	if err := os.WriteFile(regPath, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	stdout, _, code = runGact(t, bin, map[string]string{
		"GACT_BACKEND":       url,
		"GACT_DETACHED_PATH": regPath,
	}, "list", "--detached-only")
	if code != 0 {
		t.Fatalf("list --detached-only: exit %d", code)
	}
	if !strings.Contains(stdout, "list-new") {
		t.Errorf("--detached-only should keep the registered sid: %q", stdout)
	}
	for _, other := range []string{"list-old", "list-mid"} {
		if strings.Contains(stdout, other) {
			t.Errorf("--detached-only should drop non-registered %q: %q", other, stdout)
		}
	}
}
