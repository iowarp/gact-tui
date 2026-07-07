package cli

import (
	"strings"
	"testing"
	"time"
)

// TestCLI_DashboardWatch covers BBBB1: --watch refreshes the table
// in place. Run for 2.5s with --interval 1s, expect at least 2 ANSI
// clear sequences in the output (initial + at least one refresh).
func TestCLI_DashboardWatch(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	_ = createSession(t, url, "watch-row")

	stdout, _, _ := runGactWithDuration(t, bin,
		map[string]string{"GACT_BACKEND": url},
		2500*time.Millisecond,
		"dashboard", "--watch", "--interval", "1s")
	clearCount := strings.Count(stdout, "\x1b[2J")
	if clearCount < 2 {
		t.Errorf("expected at least 2 clear-screen frames, got %d (%q)", clearCount, stdout)
	}
	if !strings.Contains(stdout, "watch-row") {
		t.Errorf("expected seeded session in watch output: %q", stdout)
	}
	if !strings.Contains(stdout, "Ctrl+C to exit") {
		t.Errorf("expected watch banner: %q", stdout)
	}
}

// TestCLI_DashboardStatusFilter covers YYYY1: --status filters
// dashboard rows by status (single value or comma-separated set).
// Seeds two sessions, fires a long-running scenario on one to make
// it briefly running, asserts the filter keeps only matching rows.
// Unknown status exits 2.
func TestCLI_DashboardStatusFilter(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	idleSid := createSession(t, url, "dash-status-idle")
	waitingSid := createSession(t, url, "dash-status-waiting")
	// Trigger the permission scenario on waitingSid; the `delete`
	// keyword routes to a script that pauses on permission.requested,
	// which leaves the session in `waiting` status until we allow/deny.
	// `waiting` is observable on the emulator's fast timing (vs
	// `running` which can flit by sub-frame).
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"send", waitingSid, "delete the temp dir"); code != 0 {
		t.Fatalf("send delete: exit %d", code)
	}
	// Poll until waitingSid is actually waiting before asserting.
	deadline := time.Now().Add(5 * time.Second)
	var stdout string
	var code int
	for time.Now().Before(deadline) {
		stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
			"dashboard", "--format", "tsv", "--status", "waiting")
		if code == 0 && strings.Contains(stdout, waitingSid) {
			break
		}
		time.Sleep(150 * time.Millisecond)
	}
	if code != 0 {
		t.Fatalf("dashboard --status waiting: exit %d", code)
	}
	if !strings.Contains(stdout, waitingSid) {
		t.Fatalf("expected waiting sid %s in --status waiting within deadline, got: %q", waitingSid, stdout)
	}
	if strings.Contains(stdout, idleSid) {
		t.Errorf("idle sid %s leaked into --status waiting: %q", idleSid, stdout)
	}

	// Resolve the pending permission so waitingSid completes; needed
	// before --status idle assertion.
	plist, _, _ := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"perms", "list", waitingSid)
	for _, line := range strings.Split(plist, "\n") {
		fields := strings.Split(line, "\t")
		if len(fields) > 0 && strings.HasPrefix(fields[0], "perm_") {
			_, _, _ = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
				"perms", "deny", fields[0])
			break
		}
	}
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"wait", "--timeout", "30s", waitingSid); code != 0 {
		t.Fatalf("wait waitingSid idle: exit %d", code)
	}

	// --status idle: both should appear now.
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"dashboard", "--format", "tsv", "--status", "idle")
	if code != 0 {
		t.Fatalf("dashboard --status idle: exit %d", code)
	}
	if !strings.Contains(stdout, idleSid) || !strings.Contains(stdout, waitingSid) {
		t.Errorf("expected both sids idle, got: %q", stdout)
	}

	// Comma-list filter still works (idle,error).
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"dashboard", "--format", "tsv", "--status", "idle,error")
	if code != 0 {
		t.Fatalf("dashboard --status idle,error: exit %d", code)
	}
	if !strings.Contains(stdout, idleSid) {
		t.Errorf("expected idle sid in comma-list filter: %q", stdout)
	}

	// Unknown --status -> exit 2.
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"dashboard", "--status", "nonsense"); code != 2 {
		t.Errorf("dashboard --status nonsense: want exit 2, got %d", code)
	}
}

// TestCLI_Dashboard covers VVV1: pretty + tsv + json modes all
// surface session rows with the key columns.
func TestCLI_Dashboard(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	_ = createSession(t, url, "dash-row-1")
	_ = createSession(t, url, "dash-row-2")

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url}, "dashboard")
	if code != 0 {
		t.Fatalf("dashboard: exit %d", code)
	}
	for _, want := range []string{"ID", "STATUS", "MODEL", "COST", "dash-row-1", "dash-row-2"} {
		if !strings.Contains(stdout, want) {
			t.Errorf("expected %q in pretty output: %q", want, stdout)
		}
	}

	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"dashboard", "--format", "tsv")
	if code != 0 {
		t.Fatalf("dashboard tsv: exit %d", code)
	}
	if !strings.Contains(stdout, "ID\tSTATUS\tTITLE") {
		t.Errorf("expected TSV header: %q", stdout)
	}

	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"dashboard", "--format", "json")
	if code != 0 {
		t.Fatalf("dashboard json: exit %d", code)
	}
	if !strings.Contains(stdout, `"id"`) || !strings.Contains(stdout, `"cost_usd"`) {
		t.Errorf("expected JSON fields: %q", stdout)
	}
}

// KKKKKKKK1: `gact dashboard --sort` reorders rows. Default
// "newest" puts the most-recently-updated row at the top;
// "oldest" flips it. An unknown sort key errors out fast
// instead of silently rendering undefined order.
func TestCLI_DashboardSort(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	// Create in order: older -> middle -> newer, with sleep between
	// so UpdatedAt is monotonically increasing.
	_ = createSession(t, url, "dash-older")
	time.Sleep(150 * time.Millisecond)
	_ = createSession(t, url, "dash-middle")
	time.Sleep(150 * time.Millisecond)
	_ = createSession(t, url, "dash-newer")

	// Default = newest first.
	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url}, "dashboard")
	if code != 0 {
		t.Fatalf("dashboard default: exit %d", code)
	}
	iNewer := strings.Index(stdout, "dash-newer")
	iOlder := strings.Index(stdout, "dash-older")
	if iNewer < 0 || iOlder < 0 {
		t.Fatalf("both rows should appear: %q", stdout)
	}
	if iNewer >= iOlder {
		t.Errorf("default sort should put newest first: newer@%d older@%d in %q",
			iNewer, iOlder, stdout)
	}

	// --sort oldest flips it.
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"dashboard", "--sort", "oldest")
	if code != 0 {
		t.Fatalf("dashboard --sort oldest: exit %d", code)
	}
	iNewer = strings.Index(stdout, "dash-newer")
	iOlder = strings.Index(stdout, "dash-older")
	if iOlder >= iNewer {
		t.Errorf("--sort oldest should put oldest first: older@%d newer@%d in %q",
			iOlder, iNewer, stdout)
	}

	// Unknown sort fails fast with a helpful error.
	_, stderr, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"dashboard", "--sort", "bogus")
	if code == 0 {
		t.Fatal("expected non-zero exit for unknown --sort")
	}
	if !strings.Contains(stderr, "unknown sort") {
		t.Errorf("stderr should mention 'unknown sort': %q", stderr)
	}
}
