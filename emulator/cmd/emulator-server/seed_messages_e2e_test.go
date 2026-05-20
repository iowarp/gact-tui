package main

import (
	"bytes"
	"fmt"
	"io"
	"os/exec"
	"testing"
)

// TestE2E_SeedMessagesFlag_RejectsUnknownSession verifies the binary
// refuses to boot when asked to seed messages into a session that
// doesn't exist — better to crash loud than to silently drop seeds.
// Covers the AppendMessage → ErrInvalidArg branch end-to-end at the
// process level.
func TestE2E_SeedMessagesFlag_RejectsUnknownSession(t *testing.T) {
	tmp := t.TempDir()
	bin := testBinaryPath(tmp, "emulator-server")
	if out, err := exec.Command("go", "build", "-o", bin, ".").CombinedOutput(); err != nil {
		t.Fatalf("build: %v\n%s", err, out)
	}
	cmd := exec.Command(bin,
		"-port", fmt.Sprintf("%d", pickPort(t)),
		"-seed-messages", "ses_nonexistent=1",
	)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	cmd.Stdout = io.Discard
	if err := cmd.Run(); err == nil {
		t.Errorf("expected non-zero exit; stderr:\n%s", stderr.String())
	}
	if !bytes.Contains(stderr.Bytes(), []byte("ses_nonexistent")) {
		t.Errorf("stderr should mention the unknown session id:\n%s", stderr.String())
	}
}

// TestE2E_SeedMessagesFlag_BadSyntaxFailsBoot verifies malformed
// input fails the whole boot rather than silently starting with
// fewer messages than the operator asked for.
func TestE2E_SeedMessagesFlag_BadSyntaxFailsBoot(t *testing.T) {
	tmp := t.TempDir()
	bin := testBinaryPath(tmp, "emulator-server")
	if out, err := exec.Command("go", "build", "-o", bin, ".").CombinedOutput(); err != nil {
		t.Fatalf("build: %v\n%s", err, out)
	}
	cmd := exec.Command(bin,
		"-port", fmt.Sprintf("%d", pickPort(t)),
		"-seed-messages", "ses_a=abc",
	)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	cmd.Stdout = io.Discard
	if err := cmd.Run(); err == nil {
		t.Errorf("expected non-zero exit; stderr:\n%s", stderr.String())
	}
	if !bytes.Contains(stderr.Bytes(), []byte("seed-messages")) {
		t.Errorf("stderr should mention the flag:\n%s", stderr.String())
	}
}

// The happy-path E2E (binary seeds messages into a session that
// exists) isn't directly exercised at the process level because
// chaining --seed-sessions → --seed-messages needs deterministic
// session IDs and the current seed pipeline assigns hash-based
// IDs. Parser coverage + rejects-unknown-session + bad-syntax
// together exercise every branch in the code; the interior loop
// between parseSeedMessages and store.AppendMessage is a straight
// fold with no conditional logic. Adding explicit-ID support to
// --seed-sessions would unlock a single-boot E2E — called out as
// a follow-up item in PLAN.
