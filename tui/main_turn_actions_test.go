package main

import (
	"bytes"
	"os"
	"os/exec"
	"strings"
	"testing"
)

// TestCLI_WaitAnyOf covers waiting for the first finished session among a set.
func TestCLI_WaitAnyOf(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)

	tellSid := func(name string) string {
		stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
			"tell", name, "--async", "fire and watch")
		if code != 0 {
			t.Fatalf("tell %s: exit %d", name, code)
		}
		parts := strings.Split(strings.TrimSpace(stdout), "\t")
		if len(parts) != 2 {
			t.Fatalf("expected sid<TAB>mid, got %q", stdout)
		}
		return parts[0]
	}
	sid1 := tellSid("wait-any-A")
	sid2 := tellSid("wait-any-B")

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"wait", "--any-of", sid1+","+sid2, "--timeout", "30s")
	if code != 0 {
		t.Fatalf("wait --any-of: exit %d", code)
	}
	winner := strings.TrimSpace(stdout)
	if winner != sid1 && winner != sid2 {
		t.Errorf("expected winner in {%q, %q}, got %q", sid1, sid2, winner)
	}
}

// TestCLI_TellAsync covers async tell output and named session resume.
func TestCLI_TellAsync(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	name := "async-test"

	stdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"tell", name, "--async", "fire and forget")
	if code != 0 {
		t.Fatalf("tell --async: exit %d", code)
	}
	out := strings.TrimSpace(stdout)
	parts := strings.Split(out, "\t")
	if len(parts) != 2 {
		t.Fatalf("expected sid<TAB>msg_id, got %q", out)
	}
	sid, mid := parts[0], parts[1]
	if !strings.HasPrefix(sid, "sess_") {
		t.Errorf("sid prefix: got %q", sid)
	}
	if !strings.HasPrefix(mid, "msg_") {
		t.Errorf("msg_id prefix: got %q", mid)
	}

	stdout, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"tell", "--async", name, "second turn")
	if code != 0 {
		t.Fatalf("tell --async (resume): exit %d", code)
	}
	parts2 := strings.Split(strings.TrimSpace(stdout), "\t")
	if len(parts2) != 2 {
		t.Fatalf("expected sid<TAB>msg_id, got %q", stdout)
	}
	if parts2[0] != sid {
		t.Errorf("expected same sid on resume: first=%q second=%q", sid, parts2[0])
	}
}

// TestCLI_Tell covers name-based session creation/resume.
func TestCLI_Tell(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	name := "tell-name-roundtrip"

	stdout, stderr, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"tell", name, "hello, my name is jaime")
	if code != 0 {
		t.Fatalf("tell create: exit %d (stderr=%q)", code, stderr)
	}
	if strings.TrimSpace(stdout) == "" {
		t.Errorf("tell create: expected non-empty assistant reply, got %q", stdout)
	}
	if !strings.Contains(stderr, "created session") {
		t.Errorf("tell create: expected 'created session' notice on stderr, got %q", stderr)
	}

	stdout, stderr, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"tell", name, "what is my name")
	if code != 0 {
		t.Fatalf("tell resume: exit %d (stderr=%q)", code, stderr)
	}
	if strings.TrimSpace(stdout) == "" {
		t.Errorf("tell resume: expected non-empty assistant reply, got %q", stdout)
	}
	if strings.Contains(stderr, "created session") {
		t.Errorf("tell resume: should not recreate existing session, stderr=%q", stderr)
	}

	sidStdout, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"list", "--status", "idle")
	if code != 0 {
		t.Fatalf("list: exit %d", code)
	}
	var sid string
	for _, line := range strings.Split(sidStdout, "\n") {
		if strings.Contains(line, name) {
			sid = strings.SplitN(line, "\t", 2)[0]
			break
		}
	}
	if sid == "" {
		t.Fatalf("could not find session %q in list: %q", name, sidStdout)
	}
	logOut, _, code := runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"log", sid)
	if code != 0 {
		t.Fatalf("log: exit %d", code)
	}
	if !strings.Contains(logOut, "hello, my name is jaime") || !strings.Contains(logOut, "what is my name") {
		t.Errorf("log doesn't show both turns: %q", logOut)
	}

	if _, _, code = runGact(t, bin, map[string]string{"GACT_BACKEND": url},
		"tell", name); code != 2 {
		t.Errorf("tell missing message: expected exit 2, got %d", code)
	}
}

// TestCLI_Ask covers assistant reply text on stdout.
func TestCLI_Ask(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "ask-target")

	stdout, stderr, code := runGact(t, bin,
		map[string]string{"GACT_BACKEND": url},
		"ask", "--timeout", "30s", sid, "please read main.go")
	if code != 0 {
		t.Fatalf("ask: exit %d, stderr=%q", code, stderr)
	}
	if strings.TrimSpace(stdout) == "" {
		t.Fatalf("ask returned empty stdout")
	}
	if !strings.Contains(stdout, "main.go") && !strings.Contains(stdout, "took") &&
		!strings.Contains(stdout, "look") {
		t.Errorf("stdout doesn't look like an assistant reply: %q", stdout)
	}
}

// TestCLI_Cancel covers idempotent cancel.
func TestCLI_Cancel(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "cancel-target")

	_, stderr, code := runGact(t, bin,
		map[string]string{"GACT_BACKEND": url}, "cancel", sid)
	if code != 0 {
		t.Fatalf("cancel: exit %d, stderr=%q", code, stderr)
	}
}

// TestCLI_Run covers combined send and wait.
func TestCLI_Run(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "run-target")

	stdout, stderr, code := runGact(t, bin,
		map[string]string{"GACT_BACKEND": url},
		"run", "--timeout", "30s", sid, "please read main.go")
	if code != 0 {
		t.Fatalf("run: exit %d, stderr=%q", code, stderr)
	}
	if !strings.HasPrefix(strings.TrimSpace(stdout), "msg_") {
		t.Errorf("expected msg_* on stdout, got %q", stdout)
	}
}

// TestCLI_Wait covers polling a session back to idle.
func TestCLI_Wait(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "wait-target")

	_, _, code := runGact(t, bin,
		map[string]string{"GACT_BACKEND": url},
		"send", sid, "please read main.go")
	if code != 0 {
		t.Fatalf("send failed: exit %d", code)
	}
	_, _, code = runGact(t, bin,
		map[string]string{"GACT_BACKEND": url},
		"wait", "--timeout", "30s", sid)
	if code != 0 {
		t.Fatalf("wait: exit %d", code)
	}
}

// TestCLI_Send covers positional and stdin user-message submission.
func TestCLI_Send(t *testing.T) {
	url, stop := startEmulator(t)
	defer stop()
	bin := buildGact(t)
	sid := createSession(t, url, "send-target")

	stdout, stderr, code := runGact(t, bin,
		map[string]string{"GACT_BACKEND": url},
		"send", sid, "hello from the shell")
	if code != 0 {
		t.Fatalf("send: exit %d, stderr=%q", code, stderr)
	}
	if !strings.HasPrefix(strings.TrimSpace(stdout), "msg_") {
		t.Errorf("expected msg_* on stdout, got %q", stdout)
	}

	cmd := exec.Command(bin, "send", "--backend", url, sid, "-")
	cmd.Env = append(os.Environ(), "GACT_BACKEND="+url)
	cmd.Stdin = strings.NewReader("pipe input\n")
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		t.Fatalf("stdin send: %v", err)
	}
	if !strings.HasPrefix(strings.TrimSpace(out.String()), "msg_") {
		t.Errorf("stdin send stdout = %q", out.String())
	}
}
