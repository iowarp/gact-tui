package cli

import (
	"fmt"
	"strings"
	"testing"
)

// TestCLI_Grep covers WWW1: seed two sessions with a unique token
// + assert both hits surface in the cross-session search.
func TestCLI_Grep(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	sid1 := createSession(t, url, "grep-target-1")
	sid2 := createSession(t, url, "grep-target-2")
	for _, sid := range []string{sid1, sid2} {
		if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
			"send", sid, "the marker token is xyzzy_grep_999"); code != 0 {
			t.Fatalf("send: exit %d", code)
		}
	}

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"grep", "xyzzy_grep_999")
	if code != 0 {
		t.Fatalf("grep: exit %d", code)
	}
	for _, want := range []string{sid1, sid2, "xyzzy_grep_999"} {
		if !strings.Contains(stdout, want) {
			t.Errorf("expected %q in grep output: %q", want, stdout)
		}
	}

	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"grep", "xyzzy_grep_999", "--format", "json")
	if code != 0 {
		t.Fatalf("grep json: exit %d", code)
	}
	if !strings.Contains(stdout, `"sid"`) || !strings.Contains(stdout, `"snippet"`) {
		t.Errorf("expected JSON shape: %q", stdout)
	}
}

// TestCLI_GrepLimit covers VVVV1: --limit caps the output. Seeds 4
// sessions with the same marker so we have 4+ hits, asserts 0
// (default) returns >=4 rows and --limit 2 returns exactly 2.
func TestCLI_GrepLimit(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	const N = 4
	const marker = "xyzzy_grep_limit_777"
	for i := 0; i < N; i++ {
		sid := createSession(t, url, fmt.Sprintf("grep-limit-%d", i))
		if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
			"send", sid, "the marker is "+marker); code != 0 {
			t.Fatalf("send %d: exit %d", i, code)
		}
	}

	// No limit -> >=N rows.
	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"grep", marker)
	if code != 0 {
		t.Fatalf("grep no limit: exit %d", code)
	}
	rows := strings.Count(strings.TrimSpace(stdout), "\n") + 1
	if rows < N {
		t.Errorf("expected >=%d rows without limit, got %d: %q", N, rows, stdout)
	}

	// --limit 2 -> exactly 2 rows.
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"grep", marker, "--limit", "2")
	if code != 0 {
		t.Fatalf("grep --limit 2: exit %d", code)
	}
	rows = strings.Count(strings.TrimSpace(stdout), "\n") + 1
	if rows != 2 {
		t.Errorf("expected exactly 2 rows with --limit 2, got %d: %q", rows, stdout)
	}

	// Negative --limit -> exit 2.
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"grep", marker, "--limit", "-1"); code != 2 {
		t.Errorf("grep --limit -1: want exit 2, got %d", code)
	}
}

// `gact grep --role` narrows hits to one or more roles.
// Mirrors the --role filter on log+follow.
func TestCLI_GrepRoleFilter(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	sid := createSession(t, url, "grep-role-target")
	// Send "read main.go please" - produces user + assistant + tool +
	// assistant. The marker "please" appears only in the user turn.
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"send", sid, "read main.go please"); code != 0 {
		t.Fatalf("send: exit %d", code)
	}
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"wait", "--timeout", "30s", sid); code != 0 {
		t.Fatalf("wait: exit %d", code)
	}

	// --role user keeps the user hit (contains "please").
	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"grep", "please", "--role", "user")
	if code != 0 {
		t.Fatalf("grep --role user: exit %d", code)
	}
	if !strings.Contains(stdout, "user\t") && !strings.Contains(stdout, "\tuser\t") {
		t.Errorf("expected a user row: %q", stdout)
	}
	if strings.Contains(stdout, "\tassistant\t") || strings.Contains(stdout, "\ttool\t") {
		t.Errorf("--role user shouldn't keep other roles: %q", stdout)
	}

	// --role assistant -> assistant turn doesn't contain "please" so
	// the result is empty (0 rows, exit 0).
	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"grep", "please", "--role", "assistant")
	if code != 0 {
		t.Fatalf("grep --role assistant: exit %d", code)
	}
	if strings.TrimSpace(stdout) != "" {
		t.Errorf("--role assistant should yield empty output: %q", stdout)
	}

	// Unknown role -> exit 2.
	_, stderr, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"grep", "please", "--role", "bogus")
	if code == 0 {
		t.Fatal("expected non-zero exit for unknown --role")
	}
	if !strings.Contains(stderr, "unknown --role") {
		t.Errorf("stderr should mention 'unknown --role': %q", stderr)
	}
}
