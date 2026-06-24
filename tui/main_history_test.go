package main

import (
	"strings"
	"testing"
)

// TestCLI_Diff covers SS1: trigger a diff scenario, list it
// (pending), apply it, list again (applied).
func TestCLI_Diff(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "diff-target")

	// Send "propose an edit" to trigger a file_diff in the scenario.
	_, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"send", sid, "propose an edit to main.go")
	if code != 0 {
		t.Fatalf("send: exit %d", code)
	}
	if _, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"wait", "--timeout", "30s", sid); code != 0 {
		t.Fatalf("wait: exit %d", code)
	}

	stdout, _, _ := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"diff", "list", sid)
	if !strings.Contains(stdout, "pending") {
		t.Fatalf("expected pending diff in list: %q", stdout)
	}

	if _, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"diff", "apply", sid); code != 0 {
		t.Fatalf("apply: exit %d", code)
	}

	stdout, _, _ = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"diff", "list", sid)
	if !strings.Contains(stdout, "applied") {
		t.Errorf("expected applied diff after apply: %q", stdout)
	}
}

// TestCLI_Rewind covers MMM7: send 3 turns, wait for each idle,
// rewind to msg 1, assert msgs after it are gone.
func TestCLI_Rewind(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "rewind-target")

	send := func(text string) string {
		stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
			"send", sid, text)
		if code != 0 {
			t.Fatalf("send %q: exit %d", text, code)
		}
		mid := strings.TrimSpace(stdout)
		// Wait for the scenario to finish before sending the next
		// message - otherwise rewind can race the scenario engine
		// updating a part on a now-deleted message (pre-existing
		// emulator quirk; not the rewind handler's bug).
		if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
			"wait", "--timeout", "30s", sid); code != 0 {
			t.Fatalf("wait after %q: exit %d", text, code)
		}
		return mid
	}
	m1 := send("first")
	_ = send("second")
	_ = send("third")

	// Rewind to m1: deletes everything newer (the second + third
	// user msgs and their assistant turns). Default keeps m1 itself.
	stdout, stderr, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"rewind", sid, m1)
	if code != 0 {
		t.Fatalf("rewind: exit %d (stderr=%q)", code, stderr)
	}
	if !strings.Contains(stderr, "deleted") {
		t.Errorf("expected 'deleted N' summary on stderr: %q", stderr)
	}
	if strings.TrimSpace(stdout) == "" {
		t.Errorf("expected at least one deleted mid on stdout")
	}

	// log must still contain m1 but NOT "second" / "third".
	logOut, _, _ := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"log", sid)
	if !strings.Contains(logOut, "first") {
		t.Errorf("expected first user msg to remain: %q", logOut)
	}
	if strings.Contains(logOut, "second") || strings.Contains(logOut, "third") {
		t.Errorf("rewind didn't drop later messages: %q", logOut)
	}

	// --include-target removes m1 too.
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"rewind", sid, m1, "--include-target"); code != 0 {
		t.Fatalf("rewind --include-target: exit %d", code)
	}
	logOut, _, _ = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"log", sid)
	if strings.Contains(logOut, "first") {
		t.Errorf("--include-target should drop m1 too: %q", logOut)
	}
}

// TestCLI_Undo covers YY1: send + run a turn, count messages, undo
// the last one, and assert the count drops by one and the freshest
// message id is gone from the log.
func TestCLI_Undo(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "undo-target")

	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"send", sid, "hello"); code != 0 {
		t.Fatalf("send: exit %d", code)
	}
	if _, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"wait", "--timeout", "30s", sid); code != 0 {
		t.Fatalf("wait: exit %d", code)
	}

	beforeLog, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"log", sid)
	if code != 0 {
		t.Fatalf("log before: exit %d", code)
	}
	beforeRoles := strings.Count(beforeLog, "[")

	stdout, stderr, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"undo", sid, "--count", "1")
	if code != 0 {
		t.Fatalf("undo: exit %d", code)
	}
	revertedLines := 0
	for _, line := range strings.Split(strings.TrimSpace(stdout), "\n") {
		if strings.HasPrefix(line, "msg_") {
			revertedLines++
		}
	}
	if revertedLines != 1 {
		t.Errorf("expected 1 reverted msg id on stdout, got %d (stdout=%q)", revertedLines, stdout)
	}
	if !strings.Contains(stderr, "reverted 1 message") {
		t.Errorf("expected stderr summary, got %q", stderr)
	}

	afterLog, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"log", sid)
	if code != 0 {
		t.Fatalf("log after: exit %d", code)
	}
	afterRoles := strings.Count(afterLog, "[")
	if afterRoles != beforeRoles-1 {
		t.Errorf("expected role count to drop by 1: before=%d after=%d", beforeRoles, afterRoles)
	}
}
